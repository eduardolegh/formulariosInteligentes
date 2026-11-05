import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabase";

type FormRecord = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  updated_at: string;
  requires_attention: boolean;
  is_active: boolean;
  deactivated_at: string | null;
};

type LifecycleFilter = "active" | "inactive";
type LifecycleConfirmation = { form: FormRecord; nextIsActive: boolean };

export function FormsPage() {
  const { session, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [captureCoordinates, setCaptureCoordinates] = useState(false);
  const [requiresAttention, setRequiresAttention] = useState(true);
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("active");
  const [lifecycleConfirmation, setLifecycleConfirmation] = useState<LifecycleConfirmation | null>(null);
  const [updatingLifecycleId, setUpdatingLifecycleId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadForms() {
    setIsLoading(true);
    const { data, error: queryError } = await supabase
      .from("forms")
      .select("id, name, description, status, updated_at, requires_attention, is_active, deactivated_at")
      .order("updated_at", { ascending: false });
    if (queryError)
      setError(`No se pudieron cargar los formularios: ${queryError.message}`);
    setForms((data as FormRecord[] | null) ?? []);
    setIsLoading(false);
  }

  // Synchronizes the form directory with Supabase on mount.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    void loadForms();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !name.trim()) return;
    setIsSubmitting(true);
    setError("");
    const { data, error: insertError } = await supabase
      .from("forms")
      .insert({
        name: name.trim(),
        description: description.trim(),
        created_by: session.user.id,
        capture_coordinates: captureCoordinates,
        requires_attention: requiresAttention,
      })
      .select("id")
      .single();
    if (insertError || !data) {
      setError(
        `No se pudo crear el formulario: ${insertError?.message ?? "respuesta vacía"}`,
      );
      setIsSubmitting(false);
      return;
    }
    setName("");
    setDescription("");
    setCaptureCoordinates(false);
    setRequiresAttention(true);
    setIsCreateOpen(false);
    setIsSubmitting(false);
    navigate(`/formularios/${data.id}`);
  }

  async function changeLifecycle(form: FormRecord, nextIsActive: boolean) {
    if (!session) return;
    const action = nextIsActive ? "dar de alta" : "dar de baja";
    setUpdatingLifecycleId(form.id);
    setError("");
    setNotice("");
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("forms")
      .update({
        is_active: nextIsActive,
        deactivated_at: nextIsActive ? null : now,
        deactivated_by: nextIsActive ? null : session.user.id,
        updated_at: now,
      })
      .eq("id", form.id);

    if (updateError) {
      setError(`No se pudo ${action} el formulario: ${updateError.message}`);
      setUpdatingLifecycleId(null);
      setLifecycleConfirmation(null);
      return;
    }

    setForms((current) => current.map((item) => item.id === form.id
      ? { ...item, is_active: nextIsActive, deactivated_at: nextIsActive ? null : now, updated_at: now }
      : item));
    setNotice(nextIsActive
      ? `“${form.name}” está de alta y puede volver a recibir respuestas.`
      : `“${form.name}” quedó de baja. Se conservaron sus respuestas y configuración.`);
    setUpdatingLifecycleId(null);
    setLifecycleConfirmation(null);
  }

  const activeCount = forms.filter((form) => form.is_active).length;
  const inactiveCount = forms.length - activeCount;
  const visibleForms = forms.filter((form) => form.is_active === (lifecycleFilter === "active"));

  return (
    <section className="module-page">
      <div className="module-heading">
        <div>
          <p className="eyebrow">DISEÑO</p>
          <h1>Formularios</h1>
          <p>
            Administra formularios, contexto IA, departamentos y respuestas.
          </p>
        </div>
        {hasPermission("forms.create") && (<div className="form-create-actions">
          <button className="secondary-button" onClick={() => navigate('/formularios/crear-ai')} type="button">✦ Crear formulario AI</button>
          <button
            className="primary-button"
            onClick={() => setIsCreateOpen((open) => !open)}
            type="button"
          >
            + Crear formulario
          </button></div>
        )}
      </div>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="success-banner">{notice}</div>}
      {isCreateOpen && (
        <form className="user-form panel" onSubmit={handleCreate}>
          <div className="form-grid">
            <label>
              Nombre del formulario
              <input
                required
                placeholder="Ej. Aplicación laboral"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Descripción
              <input
                placeholder="¿Para qué se utilizará?"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
          <label className={`create-coordinate-option ${requiresAttention ? "enabled" : ""}`}>
            <input checked={requiresAttention} onChange={(event) => setRequiresAttention(event.target.checked)} type="checkbox" />
            <span className="create-coordinate-check" aria-hidden="true">{requiresAttention ? "✓" : "◎"}</span>
            <span><strong>Atención del formulario</strong><small>{requiresAttention ? "Los envíos pasarán por revisión y podrán analizarse con inteligencia artificial." : "Los envíos se aprobarán automáticamente sin revisión ni análisis con inteligencia artificial."}</small></span>
          </label>
          <label className={`create-coordinate-option ${captureCoordinates ? "enabled" : ""}`}>
            <input checked={captureCoordinates} onChange={(event) => setCaptureCoordinates(event.target.checked)} type="checkbox" />
            <span className="create-coordinate-check" aria-hidden="true">{captureCoordinates ? "✓" : "⌖"}</span>
            <span><strong>Captura de coordenadas</strong><small>La persona deberá compartir su latitud y longitud antes de enviar el formulario.</small></span>
          </label>
          <div className="form-actions">
            <button
              className="secondary-button"
              onClick={() => setIsCreateOpen(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="primary-button"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Creando…" : "Crear borrador"}
            </button>
          </div>
        </form>
      )}
      <div className="panel users-table-panel">
        <div className="forms-list-heading">
          <div>
            <h2>Formularios guardados</h2>
            <span className="table-count">{visibleForms.length} {visibleForms.length === 1 ? "formulario" : "formularios"}</span>
          </div>
          <div aria-label="Filtrar formularios por estado administrativo" className="forms-lifecycle-filter" role="group">
            <button className={lifecycleFilter === "active" ? "active" : ""} onClick={() => setLifecycleFilter("active")} type="button">
              ALTA <span>{activeCount}</span>
            </button>
            <button className={lifecycleFilter === "inactive" ? "active inactive" : ""} onClick={() => setLifecycleFilter("inactive")} type="button">
              BAJA <span>{inactiveCount}</span>
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="table-empty">Cargando formularios…</div>
        ) : visibleForms.length === 0 ? (
          <div className="table-empty">
            {lifecycleFilter === "active" ? "No hay formularios de alta." : "No hay formularios dados de baja."}
          </div>
        ) : (
          <div className="users-table">
            <div className="table-row table-header">
              <span>Formulario</span>
              <span>Estado</span>
              <span>Actualizado</span>
              <span>Acciones</span>
            </div>
            {visibleForms.map((form) => (
              <div className={`table-row ${form.is_active ? "" : "form-row-inactive"}`} key={form.id}>
                <span>
                  <strong>{form.name}</strong>
                  <small>{form.description || "Sin descripción"}</small>
                </span>
                <span>
                  <em className={`form-status ${form.status}`}>
                    {form.status === "draft"
                      ? "Borrador"
                      : form.status === "published"
                        ? "Publicado"
                        : "Archivado"}
                  </em>
                  <em className={`lifecycle-status ${form.is_active ? "active" : "inactive"}`}>
                    {form.is_active ? "Alta" : "Baja"}
                  </em>
                </span>
                <span>
                  {new Date(form.updated_at).toLocaleDateString("es-GT")}
                </span>
                <span>
                  <Link
                    aria-label="Editar formulario"
                    className="table-link"
                    title="Editar formulario"
                    to={`/formularios/${form.id}`}
                  >
                    Editar
                  </Link>
                  {form.requires_attention ? <Link
                    aria-label="Configurar contexto IA"
                    className="table-link"
                    title="Configurar contexto IA"
                    to={`/formularios/${form.id}/contexto`}
                  >
                    Contexto IA
                  </Link> : <span className="table-action-disabled" title="Este formulario no requiere atención">Sin contexto IA</span>}
                  <Link
                    aria-label="Configurar departamentos"
                    className="table-link"
                    title="Configurar departamentos"
                    to={`/formularios/${form.id}/departamentos`}
                  >
                    Departamentos
                  </Link>
                  <Link
                    aria-label="Ver respuestas"
                    className="table-link"
                    title="Ver respuestas"
                    to={`/formularios/${form.id}/respuestas`}
                  >
                    Respuestas
                  </Link>
                  {hasPermission("forms.edit") && <button
                    aria-label={form.is_active ? "Dar de baja" : "Dar de alta"}
                    className={`lifecycle-action-button ${form.is_active ? "deactivate" : "activate"}`}
                    disabled={updatingLifecycleId === form.id}
                    onClick={() => setLifecycleConfirmation({ form, nextIsActive: !form.is_active })}
                    title={form.is_active ? "Dar de baja" : "Dar de alta"}
                    type="button"
                  >
                    {updatingLifecycleId === form.id ? "…" : form.is_active ? "⊘" : "↻"}
                  </button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {lifecycleConfirmation && <div
        className="modal-backdrop lifecycle-confirmation-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !updatingLifecycleId) setLifecycleConfirmation(null);
        }}
      >
        <section
          aria-describedby="lifecycle-confirmation-description"
          aria-labelledby="lifecycle-confirmation-title"
          aria-modal="true"
          className={`lifecycle-confirmation-modal ${lifecycleConfirmation.nextIsActive ? "activate" : "deactivate"}`}
          role="alertdialog"
        >
          <button
            aria-label="Cerrar confirmación"
            className="lifecycle-confirmation-close"
            disabled={Boolean(updatingLifecycleId)}
            onClick={() => setLifecycleConfirmation(null)}
            type="button"
          >×</button>
          <div className="lifecycle-confirmation-icon" aria-hidden="true">
            {lifecycleConfirmation.nextIsActive ? "↻" : "⊘"}
          </div>
          <span className="lifecycle-confirmation-label">
            {lifecycleConfirmation.nextIsActive ? "REACTIVAR FORMULARIO" : "CAMBIO DE DISPONIBILIDAD"}
          </span>
          <h2 id="lifecycle-confirmation-title">
            {lifecycleConfirmation.nextIsActive ? "¿Dar de alta este formulario?" : "¿Dar de baja este formulario?"}
          </h2>
          <p id="lifecycle-confirmation-description">
            {lifecycleConfirmation.nextIsActive
              ? "Volverá a estar disponible y podrá recibir respuestas cuando se encuentre publicado."
              : "Dejará de aceptar nuevas respuestas, incluso desde enlaces que ya fueron compartidos."}
          </p>
          <div className="lifecycle-confirmation-form">
            <small>FORMULARIO</small>
            <strong>{lifecycleConfirmation.form.name}</strong>
            <span>{lifecycleConfirmation.nextIsActive
              ? "Sus respuestas y configuración continúan disponibles."
              : "No se eliminarán sus respuestas, configuración ni historial."}</span>
          </div>
          <div className="lifecycle-confirmation-actions">
            <button
              className="secondary-button"
              disabled={Boolean(updatingLifecycleId)}
              onClick={() => setLifecycleConfirmation(null)}
              type="button"
            >Cancelar</button>
            <button
              className={lifecycleConfirmation.nextIsActive ? "primary-button" : "lifecycle-confirmation-danger"}
              disabled={Boolean(updatingLifecycleId)}
              onClick={() => void changeLifecycle(lifecycleConfirmation.form, lifecycleConfirmation.nextIsActive)}
              type="button"
            >
              {updatingLifecycleId
                ? "Guardando…"
                : lifecycleConfirmation.nextIsActive ? "Sí, dar de alta" : "Sí, dar de baja"}
            </button>
          </div>
        </section>
      </div>}
    </section>
  );
}
