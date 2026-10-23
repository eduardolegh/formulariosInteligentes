import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { invokeAi } from "../lib/ai";
import { dispatchSubmissionIntegrations, invokeIntegrationFunction } from "../lib/integrations";
import { SubmissionTracking } from "./SubmissionTracking";
type Row = {
  id: string;
  form_id: string;
  status: string;
  submitted_at: string;
  observation: string;
  forms?: any;
};
type Delivery = { id: string; submission_id: string; event_type: string; status: "pending" | "processing" | "succeeded" | "failed"; attempts: number; http_status: number | null; error_message: string | null; integration?: { name?: string } | null };
export function FormInboxPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [formId, setFormId] = useState("");
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [observation, setObservation] = useState("");
  const [reviewAction, setReviewAction] = useState<{ id: string; status: "approved" | "rejected" } | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ status: "approved" | "rejected"; message: string } | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [retryingDelivery, setRetryingDelivery] = useState<string | null>(null);
  const [trackingSubmission, setTrackingSubmission] = useState<Row | null>(null);

  async function loadDeliveries(submissionIds: string[]) {
    if (!submissionIds.length) { setDeliveries([]); return; }
    const { data } = await supabase.from("integration_deliveries").select("id,submission_id,event_type,status,attempts,http_status,error_message,integration:external_integrations(name)").in("submission_id", submissionIds).order("created_at", { ascending: false });
    setDeliveries((data as unknown as Delivery[] | null) ?? []);
  }
  async function retryDelivery(deliveryId: string) {
    setRetryingDelivery(deliveryId); setError("");
    try { await invokeIntegrationFunction("dispatch-integrations", { delivery_id: deliveryId }); await loadDeliveries(rows.map((row) => row.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo reintentar la integración."); }
    finally { setRetryingDelivery(null); }
  }

  async function analyzeSubmission(row: Row) {
    setError("");
    if (row.status === "approved" || row.status === "rejected" || row.status === "completed") {
      if (row.status === "completed") { setError("Este formulario ya fue finalizado y no puede analizarse nuevamente con IA."); return; }
      setStatusNotice({ status: row.status, message: `Este formulario ya fue ${row.status === "approved" ? "aprobado" : "rechazado"} y no puede analizarse nuevamente con IA.` });
      return;
    }
    setAnalyzing(row.id);
    let data: { observation?: string; suggested_status?: string };
    try { data = await invokeAi("analyze-submission", { submission_id: row.id }); }
    catch (analysisError) { setAnalyzing(null); setError(analysisError instanceof Error ? analysisError.message : "No se pudo analizar la respuesta."); return; }
    setAnalyzing(null);
    setObservation(data.observation ?? "");
    setReviewAction({ id: row.id, status: data.suggested_status === "approved" ? "approved" : "rejected" });
  }

  async function confirmDecision() {
    if (!reviewAction || !observation.trim()) {
      setError("La observación es obligatoria para confirmar la decisión.");
      return;
    }
    const { error: updateError } = await supabase.from("form_submissions").update({ status: reviewAction.status, observation: observation.trim() }).eq("id", reviewAction.id);
    if (updateError) { setError(updateError.message); return; }
    try { await dispatchSubmissionIntegrations(reviewAction.id); } catch { setError("La decisión se guardó, pero no fue posible iniciar la integración externa. La entrega quedó pendiente."); }
    setRows((current) => current.map((row) => row.id === reviewAction.id ? { ...row, status: reviewAction.status, observation: observation.trim() } : row));
    await loadDeliveries(rows.map((row) => row.id));
    setReviewAction(null);
    setObservation("");
  }
  useEffect(() => {
    async function load() {
      const { data, error: e } = await supabase
        .from("form_submissions")
        .select("id,form_id,status,submitted_at,observation,forms(name)")
        .order("submitted_at", { ascending: false });
      if (e) setError(e.message);
      const r = (data as Row[]) ?? [];
      setRows(r);
      await loadDeliveries(r.map((row) => row.id));
      setForms([
        ...new Map(
          r.map((x) => [
            x.form_id,
            { id: x.form_id, name: x.forms?.name ?? "Formulario" },
          ]),
        ).values(),
      ]);
      setLoading(false);
    }
    void load();
  }, []);
  const filtered = rows.filter(
    (r) =>
      (!status || r.status === status) && (!formId || r.form_id === formId),
  );
  return (
    <section className="module-page">
      <div className="module-heading">
        <div>
          <p className="eyebrow">BACKOFFICE</p>
          <h1>Bandeja de formularios</h1>
          <p>
            Revisa los formularios enviados por los usuarios de tu departamento.
          </p>
        </div>
      </div>
      <div className="panel inbox-filters">
        <label>
          Formulario
          <select value={formId} onChange={(e) => setFormId(e.target.value)}>
            <option value="">Todos</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="submitted">Ingresado</option>
            <option value="in_review">En revisión</option>
            <option value="approved">Aprobado</option>
            <option value="rejected">Rechazado</option>
            <option value="completed">Completado</option>
          </select>
        </label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? (
        <div className="panel table-empty">Cargando envíos…</div>
      ) : (
        <div className="panel submissions-table">
          <div className="submission-row submission-header">
            <span>ID</span>
            <span>Formulario</span>
            <span>Fecha y hora</span>
            <span>Estado</span>
            <span>Acción</span>
          </div>
          {filtered.map((r) => (
            <div className="inbox-submission" key={r.id}>
              <div className="submission-row">
                <span>
                  <strong title={r.id}>{r.id.slice(0, 8).toUpperCase()}</strong>
                </span>
                <span>{r.forms?.name ?? "Formulario"}</span>
                <span>{new Date(r.submitted_at).toLocaleString("es-GT")}</span>
                <span>
                  <em className="submission-status">
                    {r.status === "submitted" ? "Ingresado" : r.status}
                  </em>
                </span>
                <span className="inbox-actions">
                  <a className="table-link inbox-view-link" href={`/formularios/${r.form_id}/respuestas?submission=${r.id}`}>Ver respuestas</a>
                  <button className="secondary-button" onClick={() => setTrackingSubmission(r)} type="button">Flujo de estados</button>
                  <button className="secondary-button" disabled={analyzing === r.id} onClick={() => void analyzeSubmission(r)} type="button">{analyzing === r.id ? "Analizando…" : "✦ Analizar con IA"}</button>
                </span>
              </div>
              {r.observation && <div className="inbox-observation"><strong>Observación</strong><span>{r.observation}</span></div>}
              {deliveries.some((delivery) => delivery.submission_id === r.id) && <div className="inbox-integrations"><strong>Integraciones</strong><div>{deliveries.filter((delivery) => delivery.submission_id === r.id).map((delivery) => <span className={`delivery-pill ${delivery.status}`} title={delivery.error_message ?? undefined} key={delivery.id}>{delivery.integration?.name ?? "Servicio externo"}: {delivery.status === "succeeded" ? "Ejecutada" : delivery.status === "failed" ? "Fallida" : delivery.status === "processing" ? "Procesando" : "Pendiente"}{delivery.http_status ? ` · HTTP ${delivery.http_status}` : ""}{["pending", "failed"].includes(delivery.status) && <button disabled={retryingDelivery === delivery.id} onClick={() => void retryDelivery(delivery.id)} type="button">{retryingDelivery === delivery.id ? "…" : "Reintentar"}</button>}</span>)}</div></div>}
            </div>
          ))}
          {!filtered.length && (
            <div className="table-empty">
              No hay envíos que coincidan con los filtros.
            </div>
          )}
        </div>
      )}
      {analyzing && <div className="modal-backdrop ai-processing"><div className="ai-processing-card"><div className="ai-processing-orb">✦</div><div><span className="ai-badge">IA EN PROCESO</span><h2>Analizando la respuesta</h2><p>Comparando las respuestas con el contexto y las reglas del formulario<span className="processing-dots">...</span></p></div></div></div>}
      {statusNotice && <div className="modal-backdrop"><div className={`status-notice-modal ${statusNotice.status}`} role="alertdialog" aria-modal="true" aria-labelledby="status-notice-title"><div className="status-notice-icon" aria-hidden="true">{statusNotice.status === "approved" ? "✓" : "×"}</div><span className="status-notice-label">ANÁLISIS NO DISPONIBLE</span><h2 id="status-notice-title">Formulario {statusNotice.status === "approved" ? "aprobado" : "rechazado"}</h2><p>{statusNotice.message}</p><div className="status-notice-info"><span aria-hidden="true">✦</span> No se consumieron tokens de IA.</div><button className="primary-button" onClick={() => setStatusNotice(null)} type="button">Entendido</button></div></div>}
      {trackingSubmission && <div className="modal-backdrop tracking-modal-backdrop"><div aria-modal="true" className="tracking-modal" role="dialog"><header><div><span className="eyebrow">SEGUIMIENTO DE RESPUESTA</span><h2>{trackingSubmission.forms?.name ?? 'Formulario'}</h2><p>ID {trackingSubmission.id.slice(0, 8).toUpperCase()}</p></div><button aria-label="Cerrar seguimiento" onClick={() => setTrackingSubmission(null)} type="button">×</button></header><div className="tracking-modal-content"><SubmissionTracking submissionId={trackingSubmission.id} /></div><footer><button className="primary-button" onClick={() => setTrackingSubmission(null)} type="button">Cerrar</button></footer></div></div>}
      {reviewAction && <div className="modal-backdrop"><div className="review-modal ai-review-modal"><div className="ai-modal-header"><span className="ai-modal-icon">✦</span><div><span className="ai-badge">RECOMENDACIÓN DE IA</span><h2>{reviewAction.status === "approved" ? "Aprobar envío" : "Rechazar envío"}</h2></div></div><p>Revisa la observación propuesta. Al confirmar, quedará guardada junto con el formulario.</p><textarea autoFocus value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Observación" rows={4} /><div className="form-actions"><button className="text-button" onClick={() => { setReviewAction(null); setObservation("") }} type="button">Cancelar</button><button className="primary-button" onClick={() => void confirmDecision()} type="button">Confirmar decisión</button></div></div></div>}
    </section>
  );
}
