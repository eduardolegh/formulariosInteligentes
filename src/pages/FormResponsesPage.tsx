import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { invokeAi } from "../lib/ai";
import { dispatchSubmissionIntegrations } from "../lib/integrations";
import { SubmissionTracking } from "./SubmissionTracking";

type Submission = {
  id: string;
  submitted_by: string | null;
  status: string;
  submitted_at: string;
  observation: string;
};
type Answer = { submission_id: string; field_id: string; value: unknown };
type Field = {
  id: string;
  label: string;
  field_type: string;
  position: number;
};

export function FormResponsesPage() {
  const { formId } = useParams();
  const [searchParams] = useSearchParams();
  const selectedSubmission = searchParams.get("submission");
  const [formName, setFormName] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [expanded] = useState<string | null>(selectedSubmission);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [observation, setObservation] = useState("");
  const [reviewAction, setReviewAction] = useState<{ id: string; status: string } | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  async function analyzeSubmission(submission: Submission) {
    setAnalyzing(submission.id); setError("");
    if (["approved", "rejected", "completed"].includes(submission.status)) {
      setAnalyzing(null);
      setError(`No se puede analizar este formulario porque ya fue ${submission.status === "approved" ? "aprobado" : submission.status === "rejected" ? "rechazado" : "finalizado"}.`);
      return;
    }
    let data: { observation?: string; suggested_status?: string };
    try { data = await invokeAi("analyze-submission", { submission_id: submission.id }); }
    catch (analysisError) { setAnalyzing(null); setError(analysisError instanceof Error ? analysisError.message : "No se pudo analizar la respuesta."); return; }
    setAnalyzing(null);
    setObservation(data.observation ?? "");
    setReviewAction({ id: submission.id, status: data.suggested_status ?? "rejected" });
  }
  async function updateStatus(id: string, nextStatus: string, nextObservation?: string) {
    const normalizedObservation = nextObservation?.trim();
    if (
      (nextStatus === "approved" || nextStatus === "rejected") &&
      !normalizedObservation
    ) {
      setError("Escribe una observación antes de continuar.");
      return false;
    }
    const changes: { status: string; observation?: string } = { status: nextStatus };
    if (normalizedObservation !== undefined) changes.observation = normalizedObservation;
    const { error: updateError } = await supabase
      .from("form_submissions")
      .update(changes)
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return false;
    }
    else {
      try { await dispatchSubmissionIntegrations(id); } catch { setError("El estado se guardó, pero no fue posible iniciar la integración externa. La entrega quedó pendiente."); }
      setObservation("");
      setSubmissions((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, status: nextStatus, observation: normalizedObservation ?? item.observation }
            : item,
        ),
      );
      return true;
    }
  }
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!formId) return;
      const { data: form, error: formError } = await supabase
        .from("forms")
        .select("name")
        .eq("id", formId)
        .single();
      const { data: sections } = await supabase
        .from("form_sections")
        .select("id")
        .eq("form_id", formId);
      const sectionIds = (sections ?? []).map((s) => s.id);
      const { data: fieldData, error: fieldsError } = sectionIds.length
        ? await supabase
            .from("form_fields")
            .select("id,label,field_type,position")
            .in("section_id", sectionIds)
            .order("position")
        : { data: [], error: null };
      const { data: submissionData, error: submissionError } = await supabase
        .from("form_submissions")
        .select("id,submitted_by,status,submitted_at,observation")
        .eq("form_id", formId)
        .order("submitted_at", { ascending: false });
      const ids = (submissionData ?? []).map((s) => s.id);
      const { data: answerData, error: answerError } = ids.length
        ? await supabase
            .from("submission_answers")
            .select("submission_id,field_id,value")
            .in("submission_id", ids)
        : { data: [], error: null };
      if (!mounted) return;
      setFormName(form?.name ?? "Formulario");
      setFields((fieldData as Field[] | null) ?? []);
      const allSubmissions = (submissionData as Submission[] | null) ?? [];
      setSubmissions(
        selectedSubmission
          ? allSubmissions.filter(
              (submission) => submission.id === selectedSubmission,
            )
          : allSubmissions,
      );
      setAnswers((answerData as Answer[] | null) ?? []);
      setError(
        formError?.message ??
          fieldsError?.message ??
          submissionError?.message ??
          answerError?.message ??
          "",
      );
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [formId, selectedSubmission]);
  const answer = (submissionId: string, fieldId: string) => {
    const value = answers.find(
      (item) =>
        item.submission_id === submissionId && item.field_id === fieldId,
    )?.value;
    return value == null ? "—" : String(value);
  };
  if (loading) return <div className="auth-loading">Cargando respuestas…</div>;
  return (
    <section className="module-page">
      <div className="editor-breadcrumb">
        <Link to="/formularios">← Formularios</Link>
      </div>
      <div className="module-heading">
        <div>
          <p className="eyebrow">RESPUESTAS</p>
          <h1>{formName}</h1>
          <p>Consulta los envíos recibidos de este formulario.</p>
        </div>
      </div>
      {error && (
        <div className="error-banner">
          No se pudieron cargar todas las respuestas: {error}
        </div>
      )}
      {submissions.length === 0 ? (
        <div className="panel table-empty">
          Todavía no hay respuestas registradas.
        </div>
      ) : (
        <div className="panel users-table-panel">
          <div className="panel-heading">
            <h2>Envíos recibidos</h2>
            <span className="table-count">{submissions.length} respuestas</span>
          </div>
          <div className="submissions-table">
            <div className="submission-row submission-header">
              <span>ID de respuesta</span>
              <span>Fecha y hora</span>
              <span>Estado</span>
              <span>Acción</span>
            </div>
            {submissions.map((submission) => (
              <div key={submission.id}>
                <div className="submission-row">
                  <span title={submission.id}>
                    <strong>{submission.id.slice(0, 8).toUpperCase()}</strong>
                    <small>
                      {submission.submitted_by
                        ? "Usuario autenticado"
                        : "Respuesta pública"}
                    </small>
                  </span>
                  <span className="submission-actions">
                    {new Date(submission.submitted_at).toLocaleString("es-GT")}
                  </span>
                  <span>
                    <em className="submission-status">
                      {submission.status === "submitted"
                        ? "INGRESADO"
                        : submission.status === "in_review"
                          ? "EN REVISIÓN"
                          : submission.status.toUpperCase()}
                    </em>
                  </span>
                  <span>
                    <button className="secondary-button" disabled={analyzing === submission.id} onClick={() => void analyzeSubmission(submission)} type="button">
                      {analyzing === submission.id ? "Analizando…" : "Analizar con IA"}
                    </button>
                    {submission.status === "submitted" && (
                      <button
                        className="secondary-button"
                        onClick={() =>
                          void updateStatus(submission.id, "in_review")
                        }
                        type="button"
                      >
                        Iniciar revisión
                      </button>
                    )}
                    {submission.status === "in_review" && (
                      <>
                        <button
                          className="secondary-button"
                          onClick={() => { setObservation(submission.observation ?? ""); setReviewAction({ id: submission.id, status: "approved" }) }}
                          type="button"
                        >
                          Aprobar
                        </button>
                        <button className="secondary-button" onClick={() => { setObservation(submission.observation ?? ""); setReviewAction({ id: submission.id, status: "rejected" }) }} type="button">
                          Rechazar
                        </button>
                      </>
                    )}
                    {(submission.status === "approved" || submission.status === "rejected") && <button className="secondary-button" onClick={() => void updateStatus(submission.id, "in_review")} type="button">Reabrir revisión</button>}
                    {(submission.status === "approved" || submission.status === "rejected") && <button className="primary-button" onClick={() => void updateStatus(submission.id, "completed")} type="button">Finalizar</button>}
                  </span>
                </div>
                {expanded === submission.id && (
                  <div className="response-detail-wrap">
                    {submission.observation && <div className="submission-observation"><span>✦</span><div><small>OBSERVACIÓN DE LA REVISIÓN</small><p>{submission.observation}</p></div></div>}
                    <div className="answers-grid response-detail answer-cards">
                      {fields.map((field) => (
                        <div key={field.id}>
                          <small>{field.label}</small>
                          <p>{answer(submission.id, field.id)}</p>
                        </div>
                      ))}
                    </div>
                    <SubmissionTracking submissionId={submission.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {analyzing && <div className="modal-backdrop ai-processing"><div className="ai-processing-card"><div className="ai-processing-orb">✦</div><div><span className="ai-badge">IA EN PROCESO</span><h2>Analizando la respuesta</h2><p>Comparando las respuestas con el contexto y las reglas del formulario<span className="processing-dots">...</span></p></div></div></div>}
      {reviewAction && <div className="modal-backdrop"><div className="review-modal ai-review-modal"><div className="ai-modal-header"><span className="ai-modal-icon">✦</span><div><span className="ai-badge">OBSERVACIÓN DE LA REVISIÓN</span><h2>{reviewAction.status === 'approved' ? 'Aprobar envío' : 'Rechazar envío'}</h2></div></div><p>Revisa la observación propuesta por la IA. Este texto quedará guardado junto con el formulario.</p><textarea autoFocus value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Observación" rows={4} /><div className="form-actions"><button className="text-button" onClick={() => { setReviewAction(null); setObservation('') }} type="button">Cancelar</button><button className="primary-button" onClick={async () => { if (await updateStatus(reviewAction.id, reviewAction.status, observation)) setReviewAction(null) }} type="button">Confirmar decisión</button></div></div></div>}
    </section>
  );
}
