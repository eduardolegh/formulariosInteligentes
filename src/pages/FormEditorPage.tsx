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
  config?: { options?: string[] };
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
];

export function FormEditorPage() {
  const navigate = useNavigate();
  const { formId } = useParams();
  const [form, setForm] = useState<FormRecord | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [sectionTitle, setSectionTitle] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [fieldOptions, setFieldOptions] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  async function loadEditor() {
    if (!formId) return;
    const [{ data: fd, error: fe }, { data: sd, error: se }] =
      await Promise.all([
        supabase
          .from("forms")
          .select("id,name,description,status,visibility,share_token")
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
        config: fieldType === "select" ? { options: fieldOptions } : {},
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
  }
  async function saveField() {
    if (!selectedField) return;
    const config =
      selectedField.field_type === "select"
        ? { options: fieldOptions }
        : (selectedField.config ?? {});
    const { error: ue } = await supabase
      .from("form_fields")
      .update({
        label: selectedField.label,
        field_type: selectedField.field_type,
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
    setSelectedField({ ...selectedField, config });
  }
  async function deleteField() {
    if (!selectedField || !window.confirm("¿Eliminar esta pregunta?")) return;
    const { error: de } = await supabase
      .from("form_fields")
      .delete()
      .eq("id", selectedField.id);
    if (de) {
      setError(de.message);
      return;
    }
    setFields(fields.filter((f) => f.id !== selectedField.id));
    setSelectedField(null);
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
  const addOption = () => {
    const o = optionDraft.trim();
    if (o && !fieldOptions.includes(o)) setFieldOptions([...fieldOptions, o]);
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
                <strong>{s.title}</strong>
                <span>
                  {fields.filter((f) => f.section_id === s.id).length} preguntas
                </span>
              </div>
              {fields
                .filter((f) => f.section_id === s.id)
                .map((f) => (
                  <button
                    className={`field-row field-button ${selectedField?.id === f.id ? "selected" : ""}`}
                    key={f.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedField(f);
                      setFieldOptions(f.config?.options ?? []);
                    }}
                    type="button"
                  >
                    <span className="field-type">{f.field_type}</span>
                    <span>{f.label}</span>
                  </button>
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
              }}
            >
              {fieldTypes.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            {fieldType === "select" && optionsEditor}
            <button className="secondary-button" type="submit">
              + Agregar pregunta
            </button>
          </form>
          {selectedField && (
            <div className="panel editor-form">
              <p className="eyebrow">PREGUNTA SELECCIONADA</p>
              <h2>Editar pregunta</h2>
              <input
                value={selectedField.label}
                onChange={(e) =>
                  setSelectedField({ ...selectedField, label: e.target.value })
                }
              />
              <select
                value={selectedField.field_type}
                onChange={(e) =>
                  setSelectedField({
                    ...selectedField,
                    field_type: e.target.value,
                  })
                }
              >
                {fieldTypes.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              {selectedField.field_type === "select" && optionsEditor}
              <div className="form-actions">
                <button
                  className="secondary-button"
                  onClick={() => void saveField()}
                  type="button"
                >
                  Guardar cambios
                </button>
                <button
                  className="text-button"
                  onClick={() => void deleteField()}
                  type="button"
                >
                  Eliminar
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
