import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { invokeIntegrationFunction } from '../lib/integrations'

type HistoryItem = { id: number; previous_status: string | null; new_status: string; changed_at: string; changed_by: string | null; changed_by_name: string }
type Delivery = { id: string; event_type: string; status: 'pending' | 'processing' | 'succeeded' | 'failed'; attempts: number; http_status: number | null; duration_ms: number | null; request_payload: unknown | null; response_excerpt: string | null; error_message: string | null; last_attempt_at: string | null; completed_at: string | null; created_at: string; integration?: { name?: string } | null }

const statusLabels: Record<string, string> = { submitted: 'Ingresado', in_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', completed: 'Finalizado' }
const eventLabels: Record<string, string> = { submitted: 'Al recibir el formulario', in_review: 'Al iniciar la revisión', approved: 'Al aprobar', rejected: 'Al rechazar', completed: 'Al finalizar' }
const deliveryLabels: Record<Delivery['status'], string> = { pending: 'Pendiente', processing: 'Procesando', succeeded: 'Ejecutada', failed: 'Fallida' }

export function SubmissionTracking({ submissionId }: { submissionId: string }) {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState<string | null>(null)
  const [jsonDelivery, setJsonDelivery] = useState<Delivery | null>(null)

  async function load() {
    setLoading(true)
    const [historyResult, deliveriesResult] = await Promise.all([
      supabase.rpc('get_submission_status_history', { target_submission_id: submissionId }),
      supabase.from('integration_deliveries').select('id,event_type,status,attempts,http_status,duration_ms,request_payload,response_excerpt,error_message,last_attempt_at,completed_at,created_at,integration:external_integrations(name)').eq('submission_id', submissionId).order('created_at', { ascending: false }),
    ])
    setHistory((historyResult.data as HistoryItem[] | null) ?? [])
    setDeliveries((deliveriesResult.data as unknown as Delivery[] | null) ?? [])
    setError(historyResult.error?.message ?? deliveriesResult.error?.message ?? '')
    setLoading(false)
  }

  useEffect(() => { void load() }, [submissionId])

  async function retry(deliveryId: string) {
    setRetrying(deliveryId); setError('')
    try { await invokeIntegrationFunction('dispatch-integrations', { delivery_id: deliveryId }); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo reintentar la integración.') }
    finally { setRetrying(null) }
  }

  if (loading) return <div className="tracking-loading">Cargando seguimiento…</div>

  return <div className="submission-tracking">
    {error && <div className="error-banner">No se pudo cargar todo el seguimiento: {error}</div>}
    <section className="tracking-card">
      <div className="tracking-card-heading"><div><span className="eyebrow">TRAZABILIDAD</span><h3>Flujo de estados</h3></div><span>{history.length} movimientos</span></div>
      <div className="status-timeline">
        {history.map((item, index) => <article className="status-timeline-item" key={item.id}>
          <div className={`status-timeline-marker ${item.new_status}`}><span>{index + 1}</span></div>
          <div><strong>{statusLabels[item.new_status] ?? item.new_status}</strong>{item.previous_status && <small>Desde {statusLabels[item.previous_status] ?? item.previous_status}</small>}<p>{new Date(item.changed_at).toLocaleString('es-GT')} · {item.changed_by_name}</p></div>
        </article>)}
        {!history.length && <div className="tracking-empty">No hay movimientos registrados para esta respuesta.</div>}
      </div>
    </section>
    <section className="tracking-card">
      <div className="tracking-card-heading"><div><span className="eyebrow">SERVICIOS EXTERNOS</span><h3>Integraciones ejecutadas</h3></div><span>{deliveries.length} ejecuciones</span></div>
      <div className="delivery-tracking-list">
        {deliveries.map((delivery) => <article className="delivery-tracking-item" key={delivery.id}>
          <div className="delivery-tracking-main"><div><strong>{delivery.integration?.name ?? 'Servicio externo'}</strong><small>{eventLabels[delivery.event_type] ?? delivery.event_type}</small></div><span className={`delivery-pill ${delivery.status}`}>{deliveryLabels[delivery.status]}</span></div>
          <dl><div><dt>Creada</dt><dd>{new Date(delivery.created_at).toLocaleString('es-GT')}</dd></div><div><dt>Último intento</dt><dd>{delivery.last_attempt_at ? new Date(delivery.last_attempt_at).toLocaleString('es-GT') : 'Aún no ejecutada'}</dd></div><div><dt>Resultado</dt><dd>{delivery.http_status ? `HTTP ${delivery.http_status}` : 'Sin respuesta HTTP'}{delivery.duration_ms != null ? ` · ${delivery.duration_ms} ms` : ''}</dd></div><div><dt>Intentos</dt><dd>{delivery.attempts}</dd></div></dl>
          {(delivery.error_message || delivery.response_excerpt) && <details><summary>Ver detalle del resultado</summary><pre>{delivery.error_message ?? delivery.response_excerpt}</pre></details>}
          <button className="integration-json-button" disabled={!delivery.request_payload} onClick={() => setJsonDelivery(delivery)} title={delivery.request_payload ? 'Consultar el contenido enviado' : 'El JSON no está disponible para esta ejecución'} type="button">{'{ }'} Ver JSON enviado</button>
          {['pending', 'failed'].includes(delivery.status) && <button className="secondary-button" disabled={retrying === delivery.id} onClick={() => void retry(delivery.id)} type="button">{retrying === delivery.id ? 'Reintentando…' : 'Reintentar integración'}</button>}
        </article>)}
        {!deliveries.length && <div className="tracking-empty">Esta respuesta todavía no ha ejecutado integraciones.</div>}
      </div>
    </section>
    {jsonDelivery && <div className="modal-backdrop integration-json-backdrop"><section aria-modal="true" className="integration-json-modal" role="dialog"><header><div><span className="eyebrow">SOLICITUD ENVIADA</span><h3>{jsonDelivery.integration?.name ?? 'Servicio externo'}</h3><p>{eventLabels[jsonDelivery.event_type] ?? jsonDelivery.event_type}</p></div><button aria-label="Cerrar JSON" onClick={() => setJsonDelivery(null)} type="button">×</button></header><pre>{JSON.stringify(jsonDelivery.request_payload, null, 2)}</pre><footer><button className="primary-button" onClick={() => setJsonDelivery(null)} type="button">Cerrar</button></footer></section></div>}
  </div>
}
