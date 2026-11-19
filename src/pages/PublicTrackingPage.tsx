import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type TrackingEvent = { status: string; changed_at: string }
type TrackingResult = {
  form_name: string
  current_status: string
  submitted_at: string
  last_updated_at: string
  events: TrackingEvent[]
}
type PublicAnswer = { section_title: string; question: string; field_type: string; value: unknown }
type ActiveLookup = { code: string | null; token: string | null }

const statusLabels: Record<string, string> = {
  submitted: 'Solicitud recibida',
  in_review: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  completed: 'Finalizada',
}

const statusDescriptions: Record<string, string> = {
  submitted: 'La información fue recibida correctamente y está pendiente de atención.',
  in_review: 'El equipo responsable se encuentra revisando la solicitud.',
  approved: 'La solicitud fue aprobada.',
  rejected: 'La solicitud fue rechazada.',
  completed: 'El proceso asociado a la solicitud finalizó.',
}

export function PublicTrackingPage() {
  const { trackingToken } = useParams()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<TrackingResult | null>(null)
  const [loading, setLoading] = useState(Boolean(trackingToken))
  const [searched, setSearched] = useState(Boolean(trackingToken))
  const [error, setError] = useState('')
  const [activeLookup, setActiveLookup] = useState<ActiveLookup | null>(null)
  const [answers, setAnswers] = useState<PublicAnswer[]>([])
  const [answersOpen, setAnswersOpen] = useState(false)
  const [answersLoading, setAnswersLoading] = useState(false)
  const [answersError, setAnswersError] = useState('')

  async function lookup(values: { code?: string; token?: string }) {
    setLoading(true)
    setError('')
    setSearched(true)
    setAnswersOpen(false)
    setAnswers([])
    setAnswersError('')
    setActiveLookup(null)
    const token = values.token?.trim() || null
    if (token && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
      setResult(null)
      setError('El enlace de seguimiento no es válido. Verifica que esté completo.')
      setLoading(false)
      return
    }
    const { data, error: lookupError } = await supabase.rpc('get_public_submission_tracking', {
      tracking_code_arg: values.code?.trim().toUpperCase() || null,
      tracking_token_arg: token,
    })
    if (lookupError) {
      setResult(null)
      setError('No fue posible consultar el seguimiento en este momento. Inténtalo nuevamente.')
    } else if (!data) {
      setResult(null)
      setError('No encontramos una solicitud con esos datos. Revisa el código e inténtalo nuevamente.')
    } else {
      setResult(data as TrackingResult)
      setActiveLookup({ code: values.code?.trim().toUpperCase() || null, token })
    }
    setLoading(false)
  }

  useEffect(() => {
    if (trackingToken) void lookup({ token: trackingToken })
    // El token solo cambia al navegar a otro enlace público.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingToken])

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = code.trim().toUpperCase()
    if (!/^FI-[A-F0-9]{8}-[A-F0-9]{8}$/.test(normalized)) {
      setSearched(true)
      setResult(null)
      setError('Ingresa el código completo con el formato FI-XXXXXXXX-XXXXXXXX.')
      return
    }
    void lookup({ code: normalized })
  }

  async function openAnswers() {
    if (!activeLookup) return
    setAnswersOpen(true)
    if (answers.length) return
    setAnswersLoading(true)
    setAnswersError('')
    const { data, error: answersLookupError } = await supabase.rpc('get_public_submission_answers', {
      tracking_code_arg: activeLookup.code,
      tracking_token_arg: activeLookup.token,
    })
    if (answersLookupError || !data) {
      setAnswersError('No fue posible cargar las respuestas en este momento.')
    } else {
      setAnswers(((data as { answers?: PublicAnswer[] }).answers ?? []))
    }
    setAnswersLoading(false)
  }

  const currentStatus = result?.current_status ?? ''

  return <main className="public-tracking-page">
    <div className="public-tracking-brand"><img src="/logo.svg" alt="Formularios inteligentes" /></div>
    <section className="public-tracking-shell">
      <div className="public-tracking-accent" />
      <header className="public-tracking-header">
        <div className="public-tracking-icon" aria-hidden="true">⌁</div>
        <span>PORTAL DE SEGUIMIENTO</span>
        <h1>Consulta el avance de tu solicitud</h1>
        <p>Utiliza el código recibido al completar el formulario. No necesitas iniciar sesión.</p>
      </header>

      {!trackingToken && <form className="public-tracking-search" onSubmit={submitCode}>
        <label htmlFor="tracking-code">Código de seguimiento</label>
        <div><input autoComplete="off" id="tracking-code" maxLength={20} onChange={(event) => { setCode(event.target.value.toUpperCase()); setError('') }} placeholder="FI-XXXXXXXX-XXXXXXXX" spellCheck={false} value={code} /><button className="primary-button" disabled={loading} type="submit">{loading ? 'Consultando…' : 'Consultar'}</button></div>
        <small>El código aparece en la confirmación y en el correo de seguimiento.</small>
      </form>}

      {loading && <div className="public-tracking-loading" role="status"><span /><strong>Consultando el estado de tu solicitud…</strong></div>}

      {!loading && error && <div className="public-tracking-error" role="alert"><span>!</span><div><strong>No pudimos mostrar el seguimiento</strong><p>{error}</p></div></div>}

      {!loading && result && <div className="public-tracking-result">
        <div className="public-tracking-summary">
          <div><span>SOLICITUD</span><h2>{result.form_name}</h2><p>Enviada el {new Date(result.submitted_at).toLocaleString('es-GT')}</p></div>
          <span className={`public-tracking-status ${currentStatus}`}>{statusLabels[currentStatus] ?? currentStatus}</span>
        </div>
        <div className={`public-tracking-current ${currentStatus}`}><span aria-hidden="true">{['approved', 'completed'].includes(currentStatus) ? '✓' : currentStatus === 'rejected' ? '×' : '◌'}</span><div><strong>{statusLabels[currentStatus] ?? currentStatus}</strong><p>{statusDescriptions[currentStatus] ?? 'La solicitud tiene una actualización disponible.'}</p><small>Última actualización: {new Date(result.last_updated_at).toLocaleString('es-GT')}</small></div></div>
        <button className="public-tracking-answers-button" onClick={() => void openAnswers()} type="button"><span><i aria-hidden="true">▤</i><strong>Ver respuestas enviadas</strong></span><em aria-hidden="true">→</em></button>
        <section className="public-tracking-timeline" aria-label="Historial de la solicitud">
          <h3>Historial</h3>
          {result.events.map((event, index) => <article key={`${event.status}-${event.changed_at}-${index}`}>
            <div className={`public-tracking-marker ${event.status}`}>{index + 1}</div>
            <div><strong>{statusLabels[event.status] ?? event.status}</strong><p>{new Date(event.changed_at).toLocaleString('es-GT')}</p></div>
          </article>)}
        </section>
      </div>}

      {!trackingToken && !loading && !searched && <div className="public-tracking-help"><span aria-hidden="true">i</span><p>Por seguridad, este portal únicamente muestra el estado y las fechas del proceso.</p></div>}
      {trackingToken && !loading && <a className="public-tracking-other" href="/seguimiento">Consultar otro código</a>}
    </section>
    {answersOpen && <div className="public-answers-backdrop" onMouseDown={() => setAnswersOpen(false)}><section aria-labelledby="public-answers-title" aria-modal="true" className="public-answers-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
      <header><div><span>INFORMACIÓN ENVIADA</span><h2 id="public-answers-title">Tus respuestas</h2><p>Esta es la información registrada al completar el formulario.</p></div><button aria-label="Cerrar respuestas" onClick={() => setAnswersOpen(false)} type="button">×</button></header>
      <div className="public-answers-content">
        {answersLoading && <div className="public-answers-loading"><span /><strong>Cargando respuestas…</strong></div>}
        {!answersLoading && answersError && <div className="public-tracking-error" role="alert"><span>!</span><div><strong>No pudimos cargar las respuestas</strong><p>{answersError}</p></div></div>}
        {!answersLoading && !answersError && answers.map((answer, index) => {
          const previousSection = index > 0 ? answers[index - 1].section_title : null
          return <div className="public-answer-group" key={`${answer.section_title}-${answer.question}-${index}`}>{answer.section_title !== previousSection && <h3>{answer.section_title}</h3>}<article><span>{answer.question}</span><p>{formatPublicAnswer(answer.value, answer.field_type)}</p></article></div>
        })}
        {!answersLoading && !answersError && !answers.length && <div className="public-answers-empty">Este envío no contiene respuestas visibles.</div>}
        {!answersLoading && !answersError && answers.some((answer) => ['photo', 'photo_attachment', 'document_attachment', 'identity_document'].includes(answer.field_type)) && <div className="public-answers-file-note"><span aria-hidden="true">i</span><p>Por seguridad, los archivos privados no se abren desde el portal público.</p></div>}
      </div>
      <footer><button className="primary-button" onClick={() => setAnswersOpen(false)} type="button">Cerrar</button></footer>
    </section></div>}
    <p className="public-tracking-footer">Formularios inteligentes · Seguimiento seguro</p>
  </main>
}

function formatPublicAnswer(value: unknown, fieldType: string) {
  if (value == null || value === '') return 'Sin respuesta'
  if (typeof value === 'string') {
    if (fieldType === 'geolocation' && value.includes('|')) {
      const [latitude, longitude] = value.split('|')
      return `Latitud: ${latitude} · Longitud: ${longitude}`
    }
    return value
  }
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Sin respuesta'
  const objectValue = value as Record<string, unknown>
  if (objectValue.file_submitted) return objectValue.original_name ? `Archivo recibido: ${objectValue.original_name}` : 'Archivo recibido correctamente'
  if (fieldType === 'identity_document') {
    const parts = [
      ['Tipo de documento', objectValue.document_type],
      ['Número', objectValue.document_number],
      ['Nombres', objectValue.first_names],
      ['Apellidos', objectValue.last_names],
    ].filter((item) => item[1])
    return parts.length ? parts.map(([label, item]) => `${label}: ${item}`).join('\n') : 'Sin respuesta'
  }
  return Object.entries(objectValue).filter(([, item]) => item != null && item !== '').map(([key, item]) => `${key.replaceAll('_', ' ')}: ${String(item)}`).join('\n') || 'Sin respuesta'
}

