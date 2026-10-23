import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { dispatchSubmissionIntegrations } from '../lib/integrations'
import { GeolocationFieldInput } from './GeolocationFieldInput'

type FormInfo = { id: string; name: string; description: string; visibility: 'public' | 'private' }
type Section = { id: string; title: string; description: string; position: number }
type Field = { id: string; section_id: string; label: string; field_type: string; is_required: boolean; position: number; config?: { options?: string[] } }
type SharedLocation = { latitude: number; longitude: number; accuracy: number; capturedAt: string }

export function ResponderPage() {
  const { shareToken } = useParams()
  const { session } = useAuth()
  const [form, setForm] = useState<FormInfo | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [sharedLocation, setSharedLocation] = useState<SharedLocation | null>(null)
  const [locationState, setLocationState] = useState<'idle' | 'requesting' | 'shared' | 'denied' | 'unavailable'>('idle')
  const [cameraField, setCameraField] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!shareToken) return
      const { data: formData, error: formError } = await supabase.from('forms').select('id, name, description, visibility').eq('share_token', shareToken).eq('status', 'published').single()
      if (formError || !formData) { if (mounted) { setError('El formulario no existe, no está publicado o no tienes acceso.'); setIsLoading(false) }; return }
      const { data: sectionData, error: sectionError } = await supabase.from('form_sections').select('id, title, description, position').eq('form_id', formData.id).order('position')
      const nextSections = (sectionData as Section[] | null) ?? []
      const { data: fieldData, error: fieldError } = nextSections.length ? await supabase.from('form_fields').select('id, section_id, label, field_type, is_required, position, config').in('section_id', nextSections.map((section) => section.id)).eq('is_active', true).order('position') : { data: [], error: null }
      if (mounted) { setForm(formData as FormInfo); setSections(nextSections); setFields((fieldData as Field[] | null) ?? []); setError(sectionError?.message ?? fieldError?.message ?? ''); setIsLoading(false) }
    }
    void load()
    return () => { mounted = false }
  }, [shareToken])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    setIsSubmitting(true); setError('')
    const { data: submission, error: submissionError } = await supabase.from('form_submissions').insert({
      form_id: form.id,
      submitted_by: session?.user.id ?? null,
      latitude: sharedLocation?.latitude ?? null,
      longitude: sharedLocation?.longitude ?? null,
      location_accuracy_m: sharedLocation?.accuracy ?? null,
      location_captured_at: sharedLocation?.capturedAt ?? null,
    }).select('id').single()
    if (submissionError || !submission) { setError(`No se pudo enviar el formulario: ${submissionError?.message ?? 'respuesta vacía'}`); setIsSubmitting(false); return }
    const answerRows = fields.map((field) => ({ submission_id: submission.id, field_id: field.id, value: answers[field.id] ?? '' }))
    const { error: answersError } = answerRows.length ? await supabase.from('submission_answers').insert(answerRows) : { error: null }
    if (answersError) { setError(`No se pudieron guardar las respuestas: ${answersError.message}`); setIsSubmitting(false); return }
    try { await dispatchSubmissionIntegrations(submission.id) } catch { /* La entrega queda pendiente y puede revisarse desde la bandeja. */ }
    setSubmitted(true); setIsSubmitting(false)
  }

  function updateAnswer(fieldId: string, value: string) { setAnswers((current) => ({ ...current, [fieldId]: value })) }
  function requestLocation() {
    if (!navigator.geolocation) { setLocationState('unavailable'); return }
    setLocationState('requesting')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSharedLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() })
        setLocationState('shared')
      },
      (locationError) => setLocationState(locationError.code === locationError.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  }
  function removeLocation() { setSharedLocation(null); setLocationState('idle') }
  function handlePhoto(fieldId: string, file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Selecciona un archivo de imagen.'); return }
    const reader = new FileReader()
    reader.onload = () => updateAnswer(fieldId, String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }
  async function startCamera(fieldId: string) {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) { setError('Tu navegador o dispositivo no permite acceder a la cámara.'); return }
    try { streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); setCameraField(fieldId); requestAnimationFrame(() => { if (videoRef.current && streamRef.current) { videoRef.current.srcObject = streamRef.current; void videoRef.current.play() } }) } catch { setError('No se pudo acceder a la cámara. Revisa los permisos del navegador.') }
  }
  function takePhoto(fieldId: string) {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0); updateAnswer(fieldId, canvas.toDataURL('image/jpeg', 0.85))
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setCameraField(null)
  }
  function renderInput(field: Field) {
    const common = { required: field.is_required, value: answers[field.id] ?? '', onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => updateAnswer(field.id, event.target.value) }
    if (field.field_type === 'textarea') return <textarea {...common} />
    if (field.field_type === 'select' || field.field_type === 'boolean') {
      const options = field.field_type === 'boolean' ? ['Sí', 'No'] : (field.config?.options ?? [])
      return <select {...common}><option value="">Selecciona una opción</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
    }
    if (field.field_type === 'geolocation') return <GeolocationFieldInput onChange={(value) => updateAnswer(field.id, value)} required={field.is_required} value={answers[field.id] ?? ''} />
    if (field.field_type === 'photo' || field.field_type === 'photo_attachment') {
      return <div className="photo-input">{field.field_type === 'photo' && <button className="secondary-button" onClick={() => void startCamera(field.id)} type="button">Activar cámara</button>}{cameraField === field.id && <div><video ref={videoRef} className="camera-preview" playsInline /><button className="primary-button" onClick={() => takePhoto(field.id)} type="button">Tomar fotografía</button></div>}{field.field_type === 'photo_attachment' && <input required={field.is_required && !answers[field.id]} type="file" accept="image/*" onChange={(event) => handlePhoto(field.id, event.target.files?.[0])} />}{answers[field.id] && <img src={answers[field.id]} alt="Vista previa" />}</div>
    }
    return <input {...common} type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'} inputMode={field.field_type === 'phone' ? 'numeric' : undefined} pattern={field.field_type === 'phone' ? '[0-9]{7,15}' : undefined} />
  }

  if (isLoading) return <div className="auth-loading">Cargando formulario…</div>
  if (submitted) return <main className="response-complete-page">
    <div className="response-complete-brand"><img src="/logo.svg" alt="Formularios inteligentes" /></div>
    <section className="response-complete-card" role="status">
      <div className="response-complete-decoration" aria-hidden="true"><span>✓</span></div>
      <span className="response-complete-label">ENVÍO COMPLETADO</span>
      <h1>¡Gracias por responder!</h1>
      <p>Tu información fue enviada y registrada correctamente.</p>
      <div className="response-complete-message"><span aria-hidden="true">✓</span><div><strong>El proceso ha finalizado</strong><small>Ya puedes cerrar esta página de forma segura.</small></div></div>
    </section>
    <p className="response-complete-footer">Formularios inteligentes · Información enviada de forma segura</p>
  </main>
  if (!form) return <main className="auth-page"><section className="login-card"><h1>Formulario no disponible</h1><p>{error || 'No se encontró el formulario solicitado.'}</p><Link className="table-link" to="/login">Ir al inicio</Link></section></main>
  const requiredFields = fields.filter((field) => field.is_required).length

  return <main className="response-page">
    <div className="response-brand"><img src="/logo.svg" alt="Formularios inteligentes" /></div>
    <div className="response-card">
      <div className="response-accent" />
      <header className="response-header">
        <div className="response-meta">
          <span className={`form-status ${form.visibility}`}>{form.visibility === 'public' ? 'Acceso público' : 'Acceso privado'}</span>
          <span className="response-field-count">{fields.length} {fields.length === 1 ? 'pregunta' : 'preguntas'}</span>
        </div>
        <div className="response-title-mark" aria-hidden="true">✦</div>
        <h1>{form.name}</h1>
        <p>{form.description || 'Completa la siguiente información para enviar tu solicitud.'}</p>
        <div className="response-notice"><span aria-hidden="true">✓</span><p>Tus respuestas se enviarán de forma segura. {requiredFields > 0 && <>Los campos con <strong>*</strong> son obligatorios.</>}</p></div>
      </header>
      {error && <div className="error-banner response-error">{error}</div>}
      <section className={`response-location-card ${locationState === 'shared' ? 'shared' : ''}`}>
        <div className="response-location-icon" aria-hidden="true">⌖</div>
        <div className="response-location-copy"><strong>{locationState === 'shared' ? 'Ubicación compartida' : 'Comparte tu ubicación'}</strong><p>{locationState === 'shared' ? `Ubicación obtenida con una precisión aproximada de ${Math.round(sharedLocation?.accuracy ?? 0)} metros.` : 'Si lo autorizas, guardaremos la ubicación desde donde respondes para mostrar información geográfica general en el dashboard.'}</p>{locationState === 'denied' && <small>No se concedió el permiso. Puedes habilitarlo en la configuración del navegador e intentarlo nuevamente.</small>}{locationState === 'unavailable' && <small>No fue posible obtener la ubicación en este dispositivo.</small>}</div>
        {locationState === 'shared' ? <button className="text-button" onClick={removeLocation} type="button">Quitar</button> : <button className="secondary-button" disabled={locationState === 'requesting'} onClick={requestLocation} type="button">{locationState === 'requesting' ? 'Obteniendo…' : 'Compartir ubicación'}</button>}
      </section>
      <form onSubmit={submit}>
        {sections.map((section, sectionIndex) => <section className="response-section" key={section.id}>
          <div className="response-section-heading"><span>{String(sectionIndex + 1).padStart(2, '0')}</span><div><h2>{section.title}</h2>{section.description && <p>{section.description}</p>}</div></div>
          <div className="response-fields">
            {fields.filter((field) => field.section_id === section.id).map((field) => <label className="response-field" key={field.id}><span className="response-field-label">{field.label}{field.is_required && <b aria-label="obligatorio">*</b>}</span>{renderInput(field)}</label>)}
          </div>
        </section>)}
        <footer className="response-footer"><div><strong>¿Todo listo?</strong><span>Revisa tus respuestas antes de enviarlas.</span></div><button className="primary-button response-submit" disabled={isSubmitting} type="submit">{isSubmitting ? <><span className="response-spinner" /> Enviando…</> : <>Enviar respuestas <span aria-hidden="true">→</span></>}</button></footer>
      </form>
    </div>
    <p className="response-privacy">Tu información se utiliza únicamente para procesar este formulario.</p>
  </main>
}
