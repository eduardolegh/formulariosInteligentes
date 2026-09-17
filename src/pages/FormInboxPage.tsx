import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
type Row = {
  id: string;
  form_id: string;
  status: string;
  submitted_at: string;
  forms?: any;
};
export function FormInboxPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [formId, setFormId] = useState("");
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    async function load() {
      const { data, error: e } = await supabase
        .from("form_submissions")
        .select("id,form_id,status,submitted_at,forms(name)")
        .order("submitted_at", { ascending: false });
      if (e) setError(e.message);
      const r = (data as Row[]) ?? [];
      setRows(r);
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
            <div className="submission-row" key={r.id}>
              <span>
                <strong>{r.id.slice(0, 8)}…</strong>
              </span>
              <span>{r.forms?.name ?? "Formulario"}</span>
              <span>{new Date(r.submitted_at).toLocaleString("es-GT")}</span>
                <span>
                  <em className="submission-status">
                  {r.status === "submitted" ? "Ingresado" : r.status}
                  </em>
                </span>
                <a className="table-link" href={`/formularios/${r.form_id}/respuestas`}>Ver respuestas</a>
            </div>
          ))}
          {!filtered.length && (
            <div className="table-empty">
              No hay envíos que coincidan con los filtros.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
