import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Submission = {
  id: string;
  submitted_by: string | null;
  status: string;
  submitted_at: string;
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
  const [expanded, setExpanded] = useState<string | null>(selectedSubmission);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
        .select("id,submitted_by,status,submitted_at")
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
    setSubmissions(selectedSubmission ? allSubmissions.filter((submission) => submission.id === selectedSubmission) : allSubmissions);
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
                  <span>
                    {new Date(submission.submitted_at).toLocaleString("es-GT")}
                  </span>
                  <span>
                    <em className="submission-status">INGRESADO</em>
                  </span>
                  <span>
                    <button
                      className="text-button"
                      onClick={() =>
                        setExpanded(
                          expanded === submission.id ? null : submission.id,
                        )
                      }
                      type="button"
                    >
                      {expanded === submission.id
                        ? "Ocultar"
                        : "Ver respuestas"}
                    </button>
                  </span>
                </div>
                {expanded === submission.id && (
                  <div className="answers-grid response-detail">
                    {fields.map((field) => (
                      <div key={field.id}>
                        <small>{field.label}</small>
                        <p>{answer(submission.id, field.id)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
