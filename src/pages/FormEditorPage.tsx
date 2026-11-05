import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type FormRecord = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  visibility: "public" | "private";
  share_token: string;
  capture_coordinates: boolean;
  requires_attention: boolean;
};
type Section = {
  id: string;
  title: string;
  description: string;
  position: number;
};
type Field = {
  id: string;
  section_id: string;
  field_key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  is_active: boolean;
  position: number;
  config?: { options?: string[]; request_document_photo?: boolean; allowed_mime_types?: string[]; max_size_mb?: number };
};
const fieldTypes = [
  ["text", "Texto corto"],
  ["textarea", "Texto largo"],
  ["email", "Correo electrónico"],
  ["phone", "Teléfono"],
  ["number", "Número"],
  ["date", "Fecha"],
  ["select", "Lista desplegable"],
  ["boolean", "Sí / No"],
  ["photo", "Fotografía (cámara)"],
  ["photo_attachment", "Fotografía adjunta"],
  ["geolocation", "Geolocalización"],
  ["identity_document", "Documento de identidad"],
  ["document_attachment", "Documento adjunto (PDF)"],
];

export function FormEditorPage() {
  const navigate = useNavigate();
  const { formId } = useParams();
  const [form, setForm] = useState<FormRecord | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [sectionTitle, setSectionTitle] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [fieldOptions, setFieldOptions] = useState<string[]>([]);
  const [requestDocumentPhoto, setRequestDocumentPhoto] = useState(false);
  const [optionDraft, setOptionDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCoordinates, setIsSavingCoordinates] = useState(false);
  const [isSavingAttention, setIsSavingAttention] = useState(false);
  const [error, setError] = useState("");
  async function loadEditor() {
    if (!formId) return;
    const [{ data: fd, error: fe }, { data: sd, error: se }] =
      await Promise.all([
        supabase
          .from("forms")
          .select("id,name,description,status,visibility,share_token,capture_coordinates,requires_attention")
          .eq("id", formId)
          .single(),
        supabase
          .from("form_sections")
          .select("id,title,description,position")
          .eq("form_id", formId)
          .order("position"),
      ]);
    if (fe || se) {
      setError(fe?.message ?? se?.message ?? "Error");
      setIsLoading(false);
      return;
    }
    const ss = (sd as Section[]) ?? [];
    const { data: ff, error: ffe } = ss.length
      ? await supabase
          .from("form_fields")
          .select(
            "id,section_id,field_key,label,field_type,is_required,is_active,position,config",
          )
          .in(
            "section_id",
            ss.map((s) => s.id),
          )
          .order("position")
      : { data: [], error: null };
    setForm(fd as FormRecord);
    setSections(ss);
    setFields((ff as Field[]) ?? []);
    setSelectedSection(ss[0]?.id ?? "");
    setError(ffe?.message ?? "");
    setIsLoading(false);
  }
  // Synchronizes this page with Supabase on mount.
  // oxlint-disable-next-line react/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => {
    void loadEditor();
  }, [formId]);
  async function addSection(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formId || !sectionTitle.trim()) return;
    const { data, error: ie } = await supabase
      .from("form_sections")
      .insert({
        form_id: formId,
        title: sectionTitle.trim(),
        position: sections.length,
      })
      .select("id,title,description,position")
      .single();
    if (ie || !data) {
      setError(ie?.message ?? "Error");
      return;
    }
    setSections([...sections, data as Section]);
    setSelectedSection(data.id);
    setSectionTitle("");
  }
  async function addField(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedSection || !fieldLabel.trim()) return;
    if (fieldType === "select" && fieldOptions.length < 2) {
      setError("Agrega al menos dos opciones.");
      return;
    }
    const sf = fields.filter((f) => f.section_id === selectedSection);
    const { data, error: ie } = await supabase
      .from("form_fields")
      .insert({
        section_id: selectedSection,
        field_key: "field_" + Date.now(),
        label: fieldLabel.trim(),
        field_type: fieldType,
        is_active: true,
        config: fieldType === "select"
          ? { options: fieldOptions }
          : fieldType === "identity_document"
            ? { request_document_photo: requestDocumentPhoto }
            : fieldType === "document_attachment"
              ? { allowed_mime_types: ["application/pdf"], max_size_mb: 10 }
              : {},
        position: sf.length,
      })
      .select(
        "id,section_id,field_key,label,field_type,is_required,is_active,position,config",
      )
      .single();
    if (ie || !data) {
      setError(ie?.message ?? "Error");
      return;
    }
    setFields([...fields, data as Field]);
    setFieldLabel("");
    setFieldOptions([]);
    setRequestDocumentPhoto(false);
  }
  async function saveField() {
    if (!selectedField) return;
    const config = selectedField.field_type === "select"
      ? { options: fieldOptions }
      : selectedField.field_type === "identity_document"
        ? { request_document_photo: Boolean(selectedField.config?.request_document_photo) }
        : selectedField.field_type === "document_attachment"
          ? { allowed_mime_types: ["application/pdf"], max_size_mb: 10 }
          : {};
    const { error: ue } = await supabase
      .from("form_fields")
      .update({
        label: selectedField.label,
        field_type: selectedField.field_type,
        is_required: selectedField.is_required,
        is_active: selectedField.is_active,
        config,
      })
      .eq("id", selectedField.id);
    if (ue) {
      setError(ue.message);
      return;
    }
    setFields(
      fields.map((f) =>
        f.id === selectedField.id ? { ...selectedField, config } : f,
      ),
    );
    setSelectedField(null);
    setFieldOptions([]);
    setOptionDraft("");
    setRequestDocumentPhoto(false);
  }
  async function deleteField(field: Field | null = selectedField) {
    if (!field || !window.confirm(`¿Eliminar la pregunta “${field.label}”?`)) return;
    const { error: de } = await supabase
      .from("form_fields")
      .delete()
      .eq("id", field.id);
    if (de) {
      setError(de.message);
      return;
    }
    setFields(fields.filter((f) => f.id !== field.id));
    if (selectedField?.id === field.id) {
      setSelectedField(null);
      setFieldOptions([]);
      setOptionDraft("");
    }
  }
  async function saveSection() {
    if (!editingSection || !editingSection.title.trim()) return;
    const nextSection = { ...editingSection, title: editingSection.title.trim(), description: editingSection.description.trim() };
    const { error: updateError } = await supabase.from("form_sections").update({ title: nextSection.title, description: nextSection.description }).eq("id", nextSection.id);
    if (updateError) { setError(updateError.message); return; }
    setSections(sections.map((section) => section.id === nextSection.id ? nextSection : section));
    setEditingSection(null);
  }
  async function deleteSection(section: Section | null = editingSection) {
    if (!section || !window.confirm(`¿Eliminar la sección “${section.title}” y todas sus preguntas?`)) return;
    const { error: deleteError } = await supabase.from("form_sections").delete().eq("id", section.id);
    if (deleteError) { setError(deleteError.message); return; }
    const remainingSections = sections.filter((item) => item.id !== section.id);
    setSections(remainingSections);
    setFields(fields.filter((field) => field.section_id !== section.id));
    if (selectedSection === section.id) setSelectedSection(remainingSections[0]?.id ?? "");
    if (selectedField?.section_id === section.id) setSelectedField(null);
    if (editingSection?.id === section.id) setEditingSection(null);
  }
  async function togglePublish() {
    if (!form) return;
    const status = form.status === "published" ? "draft" : "published";
    const { error: e } = await supabase
      .from("forms")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", form.id);
    if (e) {
      setError(e.message);
      return;
    }
    setForm({ ...form, status });
  }
  async function updateVisibility(visibility: "public" | "private") {
    if (!form || form.visibility === visibility) return;
    const { error: e } = await supabase
      .from("forms")
      .update({ visibility, updated_at: new Date().toISOString() })
      .eq("id", form.id);
    if (e) {
      setError(e.message);
      return;
    }
    setForm({ ...form, visibility });
  }
  async function updateCoordinateCapture(captureCoordinates: boolean) {
    if (!form || form.capture_coordinates === captureCoordinates) return;
    setIsSavingCoordinates(true);
    setError("");
    const { error: updateError } = await supabase
      .from("forms")
      .update({ capture_coordinates: captureCoordinates, updated_at: new Date().toISOString() })
      .eq("id", form.id);
    if (updateError) setError(updateError.message);
    else setForm({ ...form, capture_coordinates: captureCoordinates });
    setIsSavingCoordinates(false);
  }
  async function updateAttention(requiresAttention: boolean) {
    if (!form || form.requires_attention === requiresAttention) return;
    setIsSavingAttention(true);
    setError("");
    const changes = requiresAttention
      ? { requires_attention: true, updated_at: new Date().toISOString() }
      : { requires_attention: false, ai_enabled: false, updated_at: new Date().toISOString() };
    const { error: updateError } = await supabase.from("forms").update(changes).eq("id", form.id);
    if (updateError) setError(updateError.message);
    else setForm({ ...form, requires_attention: requiresAttention });
    setIsSavingAttention(false);
  }
  const addOption = () => {
    const o = optionDraft.trim();
    if (o && !fieldOptions.includes(o)) setFieldOptions([...fieldOptions, o]);
    setOptionDraft("");
  };
  const closeFieldEditor = () => {
    setSelectedField(null);
    setFieldOptions([]);
    setOptionDraft("");
  };
  const optionsEditor = (
    <div className="options-editor">
      <label>Opciones</label>
      <div className="option-add">
        <input
          value={optionDraft}
          placeholder="Nueva opción"
          onChange={(e) => setOptionDraft(e.target.value)}
        />
        <button className="secondary-button" onClick={addOption} type="button">
          Agregar
        </button>
      </div>
      <ul>
        {fieldOptions.map((o) => (
          <li key={o}>
            {o}
            <button
              className="text-button"
              onClick={() =>
                setFieldOptions(fieldOptions.filter((x) => x !== o))
              }
              type="button"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
  if (isLoading)
    return <div className="auth-loading">Cargando formulario…</div>;
  if (!form)
    return (
      <section className="placeholder-page">
        <h1>Formulario no encontrado</h1>
        <Link className="table-link" to="/formularios">
          Volver
        </Link>
      </section>
    );
  const shareUrl = `${window.location.origin}/responder/${form.share_token}`;
  return (
    <section className="module-page">
      <div className="editor-breadcrumb">
        <Link to="/formularios">← Formularios</Link>
      </div>
      <div className="module-heading">
        <div>
          <p className="eyebrow">EDITOR DE FORMULARIO</p>
          <h1>{form.name}</h1>
          <p>{form.description || "Sin descripción"}</p>
        </div>
        <div className="editor-actions">
          <button className="secondary-button" onClick={() => navigate(`/formularios/${form.id}/integraciones`)} type="button">⇄ Integraciones</button>
          <button className="secondary-button" disabled={!form.requires_attention} onClick={() => form.requires_attention && navigate(`/formularios/${form.id}/contexto`)} title={form.requires_attention ? "Configurar contexto IA" : "No disponible para formularios sin atención"} type="button">⚙ Configurar contexto IA</button>
          <button className="secondary-button" onClick={() => navigate(`/formularios/crear-ai?edit=${form.id}`)} type="button">✦ Editar con IA</button>
          <select
            className="visibility-select"
            value={form.visibility}
            onChange={(e) =>
              void updateVisibility(e.target.value as "public" | "private")
            }
          >
            <option value="private">Privado</option>
            <option value="public">Público</option>
          </select>
          <span className={`form-status ${form.status}`}>
            {form.status === "draft" ? "Borrador" : "Publicado"}
          </span>
          <button
            className="primary-button"
            onClick={togglePublish}
            type="button"
          >
            {form.status === "published"
              ? "Pasar a borrador"
              : "Publicar formulario"}
          </button>
        </div>
      </div>
      {form.status === "published" && (
        <div className="share-link">
          <span>Enlace para responder</span>
          <input readOnly value={shareUrl} />
          <button
            className="text-button"
            onClick={() => void navigator.clipboard?.writeText(shareUrl)}
            type="button"
          >
            Copiar
          </button>
        </div>
      )}
      <div className={`coordinate-capture-setting attention-setting ${form.requires_attention ? "enabled" : ""}`}>
        <div className="coordinate-setting-icon" aria-hidden="true">◎</div>
        <div>
          <strong>Atención del formulario</strong>
          <p>{form.requires_attention ? "Los envíos ingresarán a revisión y podrán analizarse con inteligencia artificial." : "Los nuevos envíos se aprobarán automáticamente y no utilizarán contexto ni análisis con inteligencia artificial."}</p>
        </div>
        <label className="coordinate-setting-switch">
          <input checked={form.requires_attention} disabled={isSavingAttention} onChange={(event) => void updateAttention(event.target.checked)} type="checkbox" />
          <span aria-hidden="true" />
          <em>{isSavingAttention ? "Guardando…" : form.requires_attention ? "Activa" : "Inactiva"}</em>
        </label>
      </div>
      <div className={`coordinate-capture-setting ${form.capture_coordinates ? "enabled" : ""}`}>
        <div className="coordinate-setting-icon" aria-hidden="true">⌖</div>
        <div>
          <strong>Captura de coordenadas</strong>
          <p>Solicita latitud y longitud al responder. La ubicación será obligatoria para poder enviar el formulario.</p>
        </div>
        <label className="coordinate-setting-switch">
          <input checked={form.capture_coordinates} disabled={isSavingCoordinates} onChange={(event) => void updateCoordinateCapture(event.target.checked)} type="checkbox" />
          <span aria-hidden="true" />
          <em>{isSavingCoordinates ? "Guardando…" : form.capture_coordinates ? "Activa" : "Inactiva"}</em>
        </label>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="editor-grid">
        <div className="panel editor-panel">
          <p className="eyebrow">ESTRUCTURA</p>
          <h2>Secciones y preguntas</h2>
          {sections.map((s) => (
            <div
              className={`section-card ${selectedSection === s.id ? "selected" : ""}`}
              key={s.id}
              onClick={() => setSelectedSection(s.id)}
            >
              <div className="section-heading">
                <div><strong>{s.title}</strong>{s.description && <small>{s.description}</small>}</div>
                <div className="editor-item-meta"><span>{fields.filter((f) => f.section_id === s.id).length} preguntas</span><div className="editor-item-actions"><button aria-label={`Editar sección ${s.title}`} onClick={(event) => { event.stopPropagation(); setEditingSection({ ...s }); }} title="Editar sección" type="button">✎</button><button aria-label={`Eliminar sección ${s.title}`} className="delete" onClick={(event) => { event.stopPropagation(); void deleteSection(s); }} title="Eliminar sección" type="button">⌫</button></div></div>
              </div>
              {fields
                .filter((f) => f.section_id === s.id)
                .map((f) => (
                  <div
                    className="field-row editor-field-row"
                    key={f.id}
                  >
                    <span className="field-type">{f.field_type}</span>
                    <span className="editor-field-label">{f.label}{f.is_required && <em>Obligatoria</em>}</span>
                    <div className="editor-item-actions"><button aria-label={`Editar pregunta ${f.label}`} onClick={(event) => { event.stopPropagation(); setSelectedField({ ...f }); setFieldOptions(f.config?.options ?? []); setRequestDocumentPhoto(Boolean(f.config?.request_document_photo)); setOptionDraft(""); }} title="Editar pregunta" type="button">✎</button><button aria-label={`Eliminar pregunta ${f.label}`} className="delete" onClick={(event) => { event.stopPropagation(); void deleteField(f); }} title="Eliminar pregunta" type="button">⌫</button></div>
                  </div>
                ))}
            </div>
          ))}
        </div>
        <aside>
          <form className="panel editor-form" onSubmit={addSection}>
            <p className="eyebrow">NUEVA SECCIÓN</p>
            <h2>Agregar sección</h2>
            <input
              required
              placeholder="Ej. Datos personales"
              value={sectionTitle}
              onChange={(e) => setSectionTitle(e.target.value)}
            />
            <button className="secondary-button" type="submit">
              + Agregar sección
            </button>
          </form>
          <form className="panel editor-form" onSubmit={addField}>
            <p className="eyebrow">NUEVA PREGUNTA</p>
            <h2>Agregar pregunta</h2>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="Ej. Nombre completo"
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
            />
            <select
              value={fieldType}
              onChange={(e) => {
                setFieldType(e.target.value);
                setFieldOptions([]);
                setRequestDocumentPhoto(false);
              }}
            >
              {fieldTypes.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            {fieldType === "select" && optionsEditor}
            {fieldType === "identity_document" && <label className="editor-config-option"><input checked={requestDocumentPhoto} onChange={(event) => setRequestDocumentPhoto(event.target.checked)} type="checkbox" /><span><strong>Solicitar fotografía del documento</strong><small>La IA validará la fotografía y completará los datos automáticamente.</small></span></label>}
            <button className="secondary-button" type="submit">
              + Agregar pregunta
            </button>
          </form>
        </aside>
      </div>
      {editingSection && <div className="modal-backdrop editor-modal-backdrop" onMouseDown={() => setEditingSection(null)}><section aria-labelledby="edit-section-title" aria-modal="true" className="editor-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog"><header><div className="editor-modal-icon">§</div><div><p className="eyebrow">CONFIGURACIÓN DE SECCIÓN</p><h2 id="edit-section-title">Editar sección</h2><p>Modifica el nombre y la descripción que verá la persona al responder.</p></div><button aria-label="Cerrar" className="editor-modal-close" onClick={() => setEditingSection(null)} type="button">×</button></header><div className="editor-modal-body"><label>Título de la sección<input autoFocus value={editingSection.title} onChange={(event) => setEditingSection({ ...editingSection, title: event.target.value })} /></label><label>Descripción<textarea placeholder="Descripción opcional" value={editingSection.description} onChange={(event) => setEditingSection({ ...editingSection, description: event.target.value })} /></label></div><footer><button className="editor-modal-delete" onClick={() => void deleteSection()} type="button">Eliminar sección</button><div><button className="secondary-button" onClick={() => setEditingSection(null)} type="button">Cancelar</button><button className="primary-button" disabled={!editingSection.title.trim()} onClick={() => void saveSection()} type="button">Guardar cambios</button></div></footer></section></div>}
      {selectedField && <div className="modal-backdrop editor-modal-backdrop" onMouseDown={closeFieldEditor}><section aria-labelledby="edit-field-title" aria-modal="true" className="editor-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog"><header><div className="editor-modal-icon">?</div><div><p className="eyebrow">CONFIGURACIÓN DE PREGUNTA</p><h2 id="edit-field-title">Editar pregunta</h2><p>Ajusta el texto, el tipo de respuesta y sus reglas.</p></div><button aria-label="Cerrar" className="editor-modal-close" onClick={closeFieldEditor} type="button">×</button></header><div className="editor-modal-body"><label>Texto de la pregunta<input autoFocus value={selectedField.label} onChange={(event) => setSelectedField({ ...selectedField, label: event.target.value })} /></label><label>Tipo de respuesta<select value={selectedField.field_type} onChange={(event) => { const nextType = event.target.value; setSelectedField({ ...selectedField, field_type: nextType, config: nextType === 'identity_document' ? { request_document_photo: false } : {} }); setFieldOptions([]); setRequestDocumentPhoto(false); }}>{fieldTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{selectedField.field_type === "select" && optionsEditor}{selectedField.field_type === "identity_document" && <label className="editor-config-option"><input checked={Boolean(selectedField.config?.request_document_photo)} onChange={(event) => setSelectedField({ ...selectedField, config: { ...selectedField.config, request_document_photo: event.target.checked } })} type="checkbox" /><span><strong>Solicitar fotografía del documento</strong><small>Los campos serán de solo lectura y se completarán después de validar la fotografía con IA.</small></span></label>}<div className="editor-modal-toggles"><label><input checked={selectedField.is_required} onChange={(event) => setSelectedField({ ...selectedField, is_required: event.target.checked })} type="checkbox" /><span><strong>Respuesta obligatoria</strong><small>La persona deberá completar esta pregunta.</small></span></label><label><input checked={selectedField.is_active} onChange={(event) => setSelectedField({ ...selectedField, is_active: event.target.checked })} type="checkbox" /><span><strong>Pregunta activa</strong><small>Se mostrará en el formulario publicado.</small></span></label></div></div><footer><button className="editor-modal-delete" onClick={() => void deleteField()} type="button">Eliminar pregunta</button><div><button className="secondary-button" onClick={closeFieldEditor} type="button">Cancelar</button><button className="primary-button" disabled={!selectedField.label.trim() || (selectedField.field_type === "select" && fieldOptions.length < 2)} onClick={() => void saveField()} type="button">Guardar cambios</button></div></footer></section></div>}
    </section>
  );
}
