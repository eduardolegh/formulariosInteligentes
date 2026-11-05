import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { dispatchSubmissionIntegrations } from '../lib/integrations'
import { GeolocationFieldInput } from './GeolocationFieldInput'
import { IdentityDocumentField } from './IdentityDocumentField'
import { DocumentAttachmentField } from './DocumentAttachmentField'
import type { IdentityDocumentValue, PendingAttachment } from '../types/attachments'

type FormInfo = { id: string; name: string; description: string; visibility: 'public' | 'private'; capture_coordinates: boolean; is_active: boolean }
type Section = { id: string; title: string; description: string; position: number }
type Field = { id: string; section_id: string; label: string; field_type: string; is_required: boolean; position: number; config?: { options?: string[]; request_document_photo?: boolean; max_size_mb?: number } }
type SharedLocation = { latitude: number; longitude: number; accuracy: number; capturedAt: string }

export function ResponderPage() {
  const { shareToken } = useParams()
  const { session } = useAuth()
  const [form, setForm] = useState<FormInfo | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [identityAnswers, setIdentityAnswers] = useState<Record<string, IdentityDocumentValue>>({})
  const [pendingAttachments, setPendingAttachments] = useState<Record<string, PendingAttachment>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedId, setSubmittedId] = useState<string | null>(null)
  const [experienceRatingToken, setExperienceRatingToken] = useState<string | null>(null)
  const [experienceRating, setExperienceRating] = useState<number | null>(null)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [ratingState, setRatingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [sharedLocation, setSharedLocation] = useState<SharedLocation | null>(null)
  const [locationState, setLocationState] = useState<'idle' | 'requesting' | 'shared' | 'stopped' | 'denied' | 'unavailable'>('idle')
  const [cameraField, setCameraField] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const locationWatchRef = useRef<number | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!shareToken) return
      const { data: formData, error: formError } = await supabase.from('forms').select('id, name, description, visibility, capture_coordinates, is_active').eq('share_token', shareToken).eq('status', 'published').eq('is_active', true).single()
      if (formError || !formData) {
        const { data: availability } = await supabase.rpc('get_form_availability', { share_token_arg: shareToken })
        if (mounted) {
          setError(availability === 'inactive'
            ? 'Este formulario se encuentra de baja y ya no acepta respuestas.'
            : 'El formulario no existe, no está publicado o no tienes acceso.')
          setIsLoading(false)
        }
        return
      }
      const { data: sectionData, error: sectionError } = await supabase.from('form_sections').select('id, title, description, position').eq('form_id', formData.id).order('position')
      const nextSections = (sectionData as Section[] | null) ?? []
      const { data: fieldData, error: fieldError } = nextSections.length ? await supabase.from('form_fields').select('id, section_id, label, field_type, is_required, position, config').in('section_id', nextSections.map((section) => section.id)).eq('is_active', true).order('position') : { data: [], error: null }
      if (mounted) { setForm(formData as FormInfo); setSections(nextSections); setFields((fieldData as Field[] | null) ?? []); setError(sectionError?.message ?? fieldError?.message ?? ''); setIsLoading(false) }
    }
    void load()
    return () => { mounted = false }
  }, [shareToken])

  useEffect(() => () => {
    if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    const nextValidationErrors: Record<string, string> = {}
    for (const field of fields) {
      if (field.field_type === 'identity_document') {
        const identity = identityAnswers[field.id]
        const complete = identity && [identity.document_type, identity.document_number, identity.first_names, identity.last_names].every((part) => part.trim())
        const started = identity && [identity.document_type, identity.document_number, identity.first_names, identity.last_names].some((part) => part.trim())
        if ((field.is_required || started) && !complete) nextValidationErrors[field.id] = field.config?.request_document_photo ? 'Captura y valida el documento para continuar.' : 'Completa todos los datos del documento.'
        else if (field.config?.request_document_photo && identity && (!complete || identity.validation?.status !== 'valid_document' || identity.validation.document_side !== 'front' || !identity.validation.has_portrait || !identity.validation.all_required_fields_visible || identity.validation.confidence < 0.85 || !pendingAttachments[field.id])) nextValidationErrors[field.id] = 'Debes capturar y validar el frente completo del documento antes de enviar.'
        continue
      }
      if (field.field_type === 'document_attachment') {
        if (field.is_required && !pendingAttachments[field.id]) nextValidationErrors[field.id] = 'Adjunta un documento PDF para continuar.'
        continue
      }
      const value = (answers[field.id] ?? '').trim()
      if (field.is_required && !value) nextValidationErrors[field.id] = 'Esta respuesta es obligatoria.'
      else if (value && field.field_type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) nextValidationErrors[field.id] = 'Ingresa un correo electrónico válido.'
      else if (value && field.field_type === 'phone' && !/^\d{7,15}$/.test(value)) nextValidationErrors[field.id] = 'Ingresa un teléfono de 7 a 15 dígitos.'
    }
    if (Object.keys(nextValidationErrors).length) {
      setValidationErrors(nextValidationErrors)
      setError('Revisa las preguntas marcadas antes de enviar el formulario.')
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.response-field.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return
    }
    if (form.capture_coordinates && !sharedLocation) {
      setError('Debes capturar tu ubicación antes de enviar el formulario.')
      document.querySelector<HTMLElement>('.response-location-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setValidationErrors({})
    setIsSubmitting(true); setError('')
    const submissionId = crypto.randomUUID()
    const ratingToken = crypto.randomUUID()
    const { error: submissionError } = await supabase.from('form_submissions').insert({
      id: submissionId,
      form_id: form.id,
      submitted_by: session?.user.id ?? null,
      latitude: sharedLocation?.latitude ?? null,
      longitude: sharedLocation?.longitude ?? null,
      location_accuracy_m: sharedLocation?.accuracy ?? null,
      location_captured_at: sharedLocation?.capturedAt ?? null,
      experience_rating_token: ratingToken,
    })
    if (submissionError) {
      const inactiveMessage = submissionError.message.toLowerCase().includes('de baja')
        ? 'Este formulario fue dado de baja y ya no acepta respuestas.'
        : `No se pudo enviar el formulario: ${submissionError.message}`
      setError(inactiveMessage); setIsSubmitting(false); return
    }
    const attachmentIds: Record<string, string> = {}
    for (const [fieldId, attachment] of Object.entries(pendingAttachments)) {
      const attachmentId = crypto.randomUUID()
      const extension = attachment.mimeType === 'application/pdf' ? 'pdf' : attachment.mimeType === 'image/png' ? 'png' : attachment.mimeType === 'image/webp' ? 'webp' : 'jpg'
      const storagePath = `${submissionId}/${fieldId}/${attachmentId}.${extension}`
      const { error: uploadError } = await supabase.storage.from('submission-files').upload(storagePath, attachment.blob, { contentType: attachment.mimeType, upsert: false })
      if (uploadError) { setError(`No se pudo cargar el archivo adjunto: ${uploadError.message}`); setIsSubmitting(false); return }
      const { error: attachmentError } = await supabase.from('submission_attachments').insert({ id: attachmentId, submission_id: submissionId, field_id: fieldId, storage_path: storagePath, original_name: attachment.originalName, mime_type: attachment.mimeType, size_bytes: attachment.blob.size, attachment_kind: attachment.kind, capture_source: attachment.source, validation_status: attachment.validationStatus, validation_result: attachment.validationResult ?? {} })
      if (attachmentError) { setError(`No se pudo registrar el archivo adjunto: ${attachmentError.message}`); setIsSubmitting(false); return }
      attachmentIds[fieldId] = attachmentId
    }
    const answerRows = fields.map((field) => {
      if (field.field_type === 'identity_document') return { submission_id: submissionId, field_id: field.id, value: { ...(identityAnswers[field.id] ?? {}), attachment_id: attachmentIds[field.id] } }
      if (field.field_type === 'document_attachment' || field.field_type === 'photo' || field.field_type === 'photo_attachment') { const file = pendingAttachments[field.id]; return { submission_id: submissionId, field_id: field.id, value: file ? { attachment_id: attachmentIds[field.id], original_name: file.originalName, mime_type: file.mimeType, size_bytes: file.blob.size } : {} } }
      return { submission_id: submissionId, field_id: field.id, value: answers[field.id] ?? '' }
    })
    const { error: answersError } = answerRows.length ? await supabase.from('submission_answers').insert(answerRows) : { error: null }
    if (answersError) { setError(`No se pudieron guardar las respuestas: ${answersError.message}`); setIsSubmitting(false); return }
    try { await dispatchSubmissionIntegrations(submissionId) } catch { /* La entrega queda pendiente y puede revisarse desde la bandeja. */ }
    if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current)
    locationWatchRef.current = null
    setSubmittedId(submissionId)
    setExperienceRatingToken(ratingToken)
    setSubmitted(true); setIsSubmitting(false)
  }

  async function rateExperience(rating: number) {
    if (!submittedId || !experienceRatingToken || ratingState === 'saving' || ratingState === 'saved') return
    setRatingState('saving')
    const { data, error: ratingError } = await supabase.rpc('rate_submission_experience', { submission_id_arg: submittedId, rating_token_arg: experienceRatingToken, rating_arg: rating })
    if (ratingError || data !== true) { setRatingState('error'); return }
    setExperienceRating(rating)
    setRatingState('saved')
  }

  function updateAnswer(fieldId: string, value: string) {
    setAnswers((current) => ({ ...current, [fieldId]: value }))
    setValidationErrors((current) => { if (!current[fieldId]) return current; const next = { ...current }; delete next[fieldId]; return next })
    if (error === 'Revisa las preguntas marcadas antes de enviar el formulario.') setError('')
  }
  function updateIdentity(fieldId: string, value: IdentityDocumentValue) {
    setIdentityAnswers((current) => ({ ...current, [fieldId]: value }))
    setValidationErrors((current) => { if (!current[fieldId]) return current; const next = { ...current }; delete next[fieldId]; return next })
  }
  function updateAttachment(fieldId: string, attachment: PendingAttachment | null) {
    setPendingAttachments((current) => { const next = { ...current }; if (attachment) next[fieldId] = attachment; else delete next[fieldId]; return next })
    if (attachment) setValidationErrors((current) => { if (!current[fieldId]) return current; const next = { ...current }; delete next[fieldId]; return next })
  }
  function requestLocation() {
    if (!navigator.geolocation) { setLocationState('unavailable'); return }
    if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current)
    setLocationState('requesting')
    locationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setSharedLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() })
        setLocationState('shared')
      },
      (locationError) => {
        if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current)
        locationWatchRef.current = null
        setLocationState(locationError.code === locationError.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  }
  function stopLocation() {
    if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current)
    locationWatchRef.current = null
    setLocationState(sharedLocation ? 'stopped' : 'idle')
  }
  function handlePhoto(fieldId: string, file?: File) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Selecciona una imagen JPG, PNG o WebP.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('La fotografía no puede superar los 10 MB.'); return }
    updateAttachment(fieldId, { blob: file, originalName: file.name || 'fotografia', mimeType: file.type as PendingAttachment['mimeType'], kind: 'photo', source: 'file_upload', validationStatus: 'not_required' })
    const reader = new FileReader()
    reader.onload = () => updateAnswer(fieldId, String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }
  async function startCamera(fieldId: string) {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) { setError('Tu navegador o dispositivo no permite acceder a la cámara.'); return }
    try { streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); setCameraField(fieldId); requestAnimationFrame(() => { if (videoRef.current && streamRef.current) { videoRef.current.srcObject = streamRef.current; void videoRef.current.play() } }) } catch { setError('No se pudo acceder a la cámara. Revisa los permisos del navegador.') }
  }
  async function takePhoto(fieldId: string) {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    const blob = await (await fetch(dataUrl)).blob()
    updateAnswer(fieldId, dataUrl)
    updateAttachment(fieldId, { blob, originalName: 'fotografia-capturada.jpg', mimeType: 'image/jpeg', kind: 'photo', source: 'camera', validationStatus: 'not_required' })
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setCameraField(null)
  }
  function renderInput(field: Field) {
    const common = { 'aria-invalid': Boolean(validationErrors[field.id]), required: field.is_required, value: answers[field.id] ?? '', onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => updateAnswer(field.id, event.target.value) }
    if (field.field_type === 'textarea') return <textarea {...common} />
    if (field.field_type === 'select' || field.field_type === 'boolean') {
      const options = field.field_type === 'boolean' ? ['Sí', 'No'] : (field.config?.options ?? [])
      return <select {...common}><option value="">Selecciona una opción</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
    }
    if (field.field_type === 'geolocation') return <GeolocationFieldInput onChange={(value) => updateAnswer(field.id, value)} required={field.is_required} value={answers[field.id] ?? ''} />
    if (field.field_type === 'identity_document') return <IdentityDocumentField fieldId={field.id} shareToken={shareToken ?? ''} requestPhoto={Boolean(field.config?.request_document_photo)} value={identityAnswers[field.id]} onChange={(value) => updateIdentity(field.id, value)} onAttachmentChange={(attachment) => updateAttachment(field.id, attachment)} />
    if (field.field_type === 'document_attachment') return <DocumentAttachmentField attachment={pendingAttachments[field.id]} onChange={(attachment) => updateAttachment(field.id, attachment)} />
    if (field.field_type === 'photo' || field.field_type === 'photo_attachment') {
      return <div className="photo-input">{field.field_type === 'photo' && <button className="secondary-button" onClick={() => void startCamera(field.id)} type="button">Activar cámara</button>}{cameraField === field.id && <div><video ref={videoRef} className="camera-preview" playsInline /><button className="primary-button" onClick={() => void takePhoto(field.id)} type="button">Tomar fotografía</button></div>}{field.field_type === 'photo_attachment' && <input required={field.is_required && !answers[field.id]} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handlePhoto(field.id, event.target.files?.[0])} />}{answers[field.id] && <img src={answers[field.id]} alt="Vista previa" />}</div>
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
      <div className="response-experience-rating">
        <span className="response-experience-label">TU EXPERIENCIA</span>
        <strong>{ratingState === 'saved' ? '¡Gracias por tu calificación!' : '¿Cómo fue responder este formulario?'}</strong>
        <p>{ratingState === 'saved' ? `Registramos una calificación de ${experienceRating} de 5 estrellas.` : 'Tu opinión nos ayuda a mejorar la experiencia.'}</p>
        <div aria-label="Calificar experiencia" className="response-rating-stars" onMouseLeave={() => setHoveredRating(0)} role="group">
          {[1, 2, 3, 4, 5].map((rating) => <button aria-label={`${rating} ${rating === 1 ? 'estrella' : 'estrellas'}`} className={rating <= (hoveredRating || experienceRating || 0) ? 'active' : ''} disabled={ratingState === 'saving' || ratingState === 'saved'} key={rating} onClick={() => void rateExperience(rating)} onMouseEnter={() => setHoveredRating(rating)} type="button">★</button>)}
        </div>
        {ratingState === 'saving' && <small>Guardando tu calificación…</small>}
        {ratingState === 'error' && <small className="rating-error">No fue posible guardarla. Puedes intentarlo nuevamente.</small>}
      </div>
    </section>
    <p className="response-complete-footer">Formularios inteligentes · Información enviada de forma segura</p>
  </main>
  if (!form) {
    const isInactive = error.toLowerCase().includes('de baja')
    return <main className="response-unavailable-page">
      <div className="response-unavailable-brand"><img src="/logo.svg" alt="Formularios inteligentes" /></div>
      <section className={`response-unavailable-card ${isInactive ? 'inactive' : ''}`} role="alert">
        <div className="response-unavailable-decoration" aria-hidden="true"><span>{isInactive ? '⊘' : '!'}</span></div>
        <span className="response-unavailable-label">{isInactive ? 'FORMULARIO FUERA DE SERVICIO' : 'ACCESO NO DISPONIBLE'}</span>
        <h1>{isInactive ? 'Este formulario ya no recibe respuestas' : 'Formulario no disponible'}</h1>
        <p>{error || 'No se encontró el formulario solicitado.'}</p>
        <div className="response-unavailable-message">
          <span aria-hidden="true">i</span>
          <div>
            <strong>{isInactive ? 'No necesitas realizar ninguna acción' : 'Verifica el enlace utilizado'}</strong>
            <small>{isInactive ? 'La información enviada anteriormente permanece registrada. Puedes cerrar esta página de forma segura.' : 'Es posible que el formulario no esté publicado o que no tengas permiso para consultarlo.'}</small>
          </div>
        </div>
      </section>
      <p className="response-unavailable-footer">Formularios inteligentes · Acceso seguro</p>
    </main>
  }
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
      {form.capture_coordinates && <section className={`response-location-card ${sharedLocation ? 'shared' : ''}`}>
        <div className="response-location-icon" aria-hidden="true">⌖</div>
        <div className="response-location-copy">
          <div className="response-location-title"><strong>{sharedLocation ? 'Ubicación capturada' : 'Captura tu ubicación'}</strong>{locationState === 'shared' && <span>Capturando</span>}{locationState === 'stopped' && <span className="stopped">Captura detenida</span>}</div>
          <p>{sharedLocation ? `Precisión aproximada de ${Math.round(sharedLocation.accuracy)} metros.` : 'Si lo autorizas, guardaremos la ubicación desde donde respondes para mostrar información geográfica general en el dashboard.'}</p>
          {sharedLocation && <div className="response-location-values"><div><small>LATITUD</small><strong>{sharedLocation.latitude.toFixed(6)}</strong></div><div><small>LONGITUD</small><strong>{sharedLocation.longitude.toFixed(6)}</strong></div></div>}
          {locationState === 'denied' && <small className="response-location-warning">No se concedió el permiso. Puedes habilitarlo en la configuración del navegador e intentarlo nuevamente.</small>}{locationState === 'unavailable' && <small className="response-location-warning">No fue posible obtener la ubicación en este dispositivo.</small>}
        </div>
        {locationState === 'shared' ? <button className="response-location-stop" onClick={stopLocation} type="button">Detener</button> : <button className="secondary-button" disabled={locationState === 'requesting'} onClick={requestLocation} type="button">{locationState === 'requesting' ? 'Capturando…' : sharedLocation ? 'Capturar de nuevo' : 'Capturar ubicación'}</button>}
      </section>}
      <form noValidate onSubmit={submit}>
        {sections.map((section, sectionIndex) => <section className="response-section" key={section.id}>
          <div className="response-section-heading"><span>{String(sectionIndex + 1).padStart(2, '0')}</span><div><h2>{section.title}</h2>{section.description && <p>{section.description}</p>}</div></div>
          <div className="response-fields">
            {fields.filter((field) => field.section_id === section.id).map((field) => <div className={`response-field ${validationErrors[field.id] ? 'invalid' : ''}`} id={`response-field-${field.id}`} key={field.id}><span className="response-field-label">{field.label}{field.is_required && <b aria-label="obligatorio">*</b>}</span>{renderInput(field)}{validationErrors[field.id] && <span className="response-field-error" role="alert"><i aria-hidden="true">!</i>{validationErrors[field.id]}</span>}</div>)}
          </div>
        </section>)}
        <footer className="response-footer"><div><strong>¿Todo listo?</strong><span>Revisa tus respuestas antes de enviarlas.</span></div><button className="primary-button response-submit" disabled={isSubmitting} type="submit">{isSubmitting ? <><span className="response-spinner" /> Enviando…</> : <>Enviar respuestas <span aria-hidden="true">→</span></>}</button></footer>
      </form>
    </div>
    <p className="response-privacy">Tu información se utiliza únicamente para procesar este formulario.</p>
  </main>
}
