import { useEffect, useState, type ReactNode } from "react";
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
type Attachment = { id: string; submission_id: string; field_id: string; storage_path: string; original_name: string; mime_type: string; size_bytes: number; attachment_kind: string; validation_status: string; created_at: string; signed_url?: string; download_url?: string };

export function FormResponsesPage() {
  const { formId } = useParams();
  const [searchParams] = useSearchParams();
  const selectedSubmission = searchParams.get("submission");
  const [formName, setFormName] = useState("");
  const [requiresAttention, setRequiresAttention] = useState(true);
  const [aiContextReady, setAiContextReady] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [expanded] = useState<string | null>(selectedSubmission);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [observation, setObservation] = useState("");
  const [reviewAction, setReviewAction] = useState<{ id: string; status: string } | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; downloadUrl: string; title: string } | null>(null);
  async function analyzeSubmission(submission: Submission) {
    setAnalyzing(submission.id); setError("");
    if (!requiresAttention) { setAnalyzing(null); setError("Este formulario no requiere atención y no utiliza análisis con inteligencia artificial."); return; }
    if (submission.status !== "submitted") {
      setAnalyzing(null);
      setError("Solo las respuestas en estado Ingresado pueden analizarse con inteligencia artificial.");
      return;
    }
    if (!aiContextReady) {
      setAnalyzing(null);
      setError("Este formulario no tiene habilitado un contexto de inteligencia artificial completo.");
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
        .select("name,requires_attention,ai_enabled")
        .eq("id", formId)
        .single();
      const { data: contextData, error: contextError } = await supabase
        .from("form_contexts")
        .select("objective,instructions,rules,restrictions,expected_output")
        .eq("form_id", formId)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
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
      const { data: attachmentData, error: attachmentError } = ids.length
        ? await supabase.from("submission_attachments").select("id,submission_id,field_id,storage_path,original_name,mime_type,size_bytes,attachment_kind,validation_status,created_at").in("submission_id", ids).order("created_at")
        : { data: [], error: null };
      const attachmentsWithUrls = await Promise.all(((attachmentData as Attachment[] | null) ?? []).map(async (attachment) => {
        const [{ data: viewData }, { data: downloadData }] = await Promise.all([
          supabase.storage.from("submission-files").createSignedUrl(attachment.storage_path, 3600),
          supabase.storage.from("submission-files").createSignedUrl(attachment.storage_path, 3600, { download: attachment.original_name }),
        ]);
        return { ...attachment, signed_url: viewData?.signedUrl, download_url: downloadData?.signedUrl };
      }));
      if (!mounted) return;
      setFormName(form?.name ?? "Formulario");
      setRequiresAttention(form?.requires_attention !== false);
      setAiContextReady(Boolean(form?.ai_enabled) && Boolean(contextData) && [contextData?.objective, contextData?.instructions, contextData?.rules, contextData?.restrictions, contextData?.expected_output].every((value) => String(value ?? "").trim().length > 0));
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
      setAttachments(attachmentsWithUrls);
      setError(
        formError?.message ??
          contextError?.message ??
          fieldsError?.message ??
          submissionError?.message ??
          answerError?.message ??
          attachmentError?.message ??
          "",
      );
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [formId, selectedSubmission]);
  useEffect(() => {
    if (!imagePreview && !pdfPreview) return;
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setImagePreview(null); setPdfPreview(null); } };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [imagePreview, pdfPreview]);
  const answer = (submissionId: string, fieldId: string) => {
    const value = answers.find(
      (item) =>
        item.submission_id === submissionId && item.field_id === fieldId,
    )?.value;
    return value;
  };
  const renderAnswer = (value: unknown, fieldType: string): ReactNode => {
    if (value == null || value === "") return "—";
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0) return "—";
    if (fieldType === "identity_document" && typeof value === "object") {
      const identity = value as Record<string, unknown>;
      return <span className="identity-answer-summary"><span><small>TIPO</small><strong>{String(identity.document_type ?? "—")}</strong></span><span><small>NÚMERO</small><strong>{String(identity.document_number ?? "—")}</strong></span><span><small>NOMBRES</small><strong>{String(identity.first_names ?? "—")}</strong></span><span><small>APELLIDOS</small><strong>{String(identity.last_names ?? "—")}</strong></span><em>{identity.capture_method === "camera" ? "Validado desde fotografía" : "Registrado manualmente"}</em></span>;
    }
    if (fieldType === "document_attachment" && typeof value === "object") return <span className="document-answer-summary">Documento adjunto: <strong>{String((value as Record<string, unknown>).original_name ?? "PDF")}</strong></span>;
    if ((fieldType === "photo" || fieldType === "photo_attachment") && typeof value === "string" && value.startsWith("data:image/")) return <button className="legacy-photo-answer" onClick={() => setImagePreview({ url: value, title: "Fotografía capturada" })} type="button"><img alt="Fotografía capturada" src={value} /><span>Ver fotografía completa</span></button>;
    if ((fieldType === "photo" || fieldType === "photo_attachment") && typeof value === "object") return <span className="document-answer-summary">Fotografía guardada: <strong>{String((value as Record<string, unknown>).original_name ?? "Imagen")}</strong></span>;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
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
                    {requiresAttention ? <>{submission.status === "submitted" && aiContextReady && <button className="secondary-button" disabled={analyzing === submission.id} onClick={() => void analyzeSubmission(submission)} type="button">
                      {analyzing === submission.id ? "Analizando…" : "Analizar con IA"}
                    </button>}
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
                    {(submission.status === "approved" || submission.status === "rejected") && <button className="primary-button" onClick={() => void updateStatus(submission.id, "completed")} type="button">Finalizar</button>}</> : <span className="auto-approved-label">✓ Aprobación automática</span>}
                  </span>
                </div>
                {expanded === submission.id && (
                  <div className="response-detail-wrap">
                    {submission.observation && <div className="submission-observation"><span>✦</span><div><small>OBSERVACIÓN DE LA REVISIÓN</small><p>{submission.observation}</p></div></div>}
                    <div className="answers-grid response-detail answer-cards">
                      {fields.map((field) => (
                        <div key={field.id}>
                          <small>{field.label}</small>
                          <div className="answer-value">{renderAnswer(answer(submission.id, field.id), field.field_type)}</div>
                        </div>
                      ))}
                    </div>
                    {attachments.some((attachment) => attachment.submission_id === submission.id) && <section className="submission-attachments">
                      <div className="submission-attachments-heading"><div><small>ARCHIVOS DEL ENVÍO</small><h3>Fotografías y documentos capturados</h3></div><span>{attachments.filter((attachment) => attachment.submission_id === submission.id).length} archivos</span></div>
                      <div className="submission-attachment-grid">{attachments.filter((attachment) => attachment.submission_id === submission.id).map((attachment) => attachment.mime_type.startsWith("image/")
                        ? <article className="attachment-image-card" key={attachment.id}>{attachment.signed_url ? <button aria-label={`Ampliar ${attachment.original_name}`} onClick={() => setImagePreview({ url: attachment.signed_url!, title: attachment.attachment_kind === "identity_document" ? "Documento de identidad" : attachment.original_name })} type="button"><img alt={attachment.original_name} src={attachment.signed_url} /><span aria-hidden="true">⌕</span></button> : <div className="attachment-unavailable">Vista previa no disponible</div>}<div><strong>{attachment.attachment_kind === "identity_document" ? "Documento de identidad" : "Fotografía capturada"}</strong><small>{attachment.attachment_kind === "identity_document" && attachment.validation_status === "valid" ? "✓ Fotografía validada" : attachment.original_name}</small></div></article>
                        : <article className="attachment-pdf-card" key={attachment.id}><span aria-hidden="true">PDF</span><div><strong>{attachment.original_name}</strong><small>{(attachment.size_bytes / 1024 / 1024).toFixed(2)} MB</small></div>{attachment.signed_url && <button className="secondary-button" onClick={() => setPdfPreview({ url: attachment.signed_url!, downloadUrl: attachment.download_url ?? attachment.signed_url!, title: attachment.original_name })} type="button">Ver documento</button>}</article>)}</div>
                    </section>}
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
      {imagePreview && <div aria-label="Vista previa de fotografía" aria-modal="true" className="modal-backdrop image-preview-backdrop" onMouseDown={() => setImagePreview(null)} role="dialog"><section className="image-preview-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><small>VISTA PREVIA</small><h2>{imagePreview.title}</h2></div><button aria-label="Cerrar vista previa" onClick={() => setImagePreview(null)} type="button">×</button></header><div className="image-preview-stage"><img alt={imagePreview.title} src={imagePreview.url} /></div><footer><span>Puedes cerrar esta ventana con la tecla Escape.</span><button className="secondary-button" onClick={() => setImagePreview(null)} type="button">Cerrar</button></footer></section></div>}
      {pdfPreview && <div aria-label="Vista previa de documento PDF" aria-modal="true" className="modal-backdrop image-preview-backdrop" onMouseDown={() => setPdfPreview(null)} role="dialog"><section className="image-preview-modal pdf-preview-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><small>DOCUMENTO ADJUNTO</small><h2>{pdfPreview.title}</h2></div><button aria-label="Cerrar vista previa" onClick={() => setPdfPreview(null)} type="button">×</button></header><div className="pdf-preview-stage"><iframe src={pdfPreview.url} title={`Vista previa de ${pdfPreview.title}`} /></div><footer><span>El enlace de visualización es temporal y seguro.</span><div><button className="secondary-button" onClick={() => setPdfPreview(null)} type="button">Cerrar</button><a className="primary-button" href={pdfPreview.downloadUrl}>Descargar PDF</a></div></footer></section></div>}
    </section>
  );
}
