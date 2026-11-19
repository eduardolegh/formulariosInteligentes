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

  async function lookup(values: { code?: string; token?: string }) {
    setLoading(true)
    setError('')
    setSearched(true)
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
    <p className="public-tracking-footer">Formularios inteligentes · Seguimiento seguro</p>
  </main>
}

