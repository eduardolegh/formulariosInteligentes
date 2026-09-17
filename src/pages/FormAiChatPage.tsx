import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabase";

export function FormAiChatPage() {
  const navigate = useNavigate(); const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");
  useEffect(() => { const id = searchParams.get('edit'); if (!id) return; async function load() { const { data: form } = await supabase.from('forms').select('name,description,ai_enabled').eq('id', id).single(); const { data: sections } = await supabase.from('form_sections').select('id,title,description,position').eq('form_id', id).order('position'); const ids = (sections ?? []).map((section) => section.id); const { data: fields } = ids.length ? await supabase.from('form_fields').select('section_id,label,field_type,is_required,position,config').in('section_id', ids).order('position') : { data: [] }; if (form) setResult({ ...form, sections: (sections ?? []).map((section) => ({ ...section, fields: (fields ?? []).filter((field) => field.section_id === section.id).map((field) => ({ ...field, options: field.config?.options ?? [] })) })) }) } void load() }, [searchParams]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    setError("");
    setLastPrompt(message.trim());
    setMessage("");
    const { data, error: invokeError } = await supabase.functions.invoke(
      "generate-form",
      { body: { message: result ? `${message}\n\nFORMULARIO ACTUAL (conserva todo lo no solicitado):\n${JSON.stringify(result)}` : message } },
    );
    if (invokeError || data?.error)
      setError(invokeError?.message ?? data?.error);
    else setResult(data.form);
    setLoading(false);
  }
  async function saveForm() {
    if (!result || !session) return; setSaving(true); setError('');
    const editId = searchParams.get('edit');
    const { data: form, error: formError } = editId ? await supabase.from('forms').update({ name: result.name, description: result.description ?? '', updated_at: new Date().toISOString() }).eq('id', editId).select('id').single() : await supabase.from('forms').insert({ name: result.name, description: result.description ?? '', created_by: session.user.id }).select('id').single();
    if (formError || !form) { setError(formError?.message ?? 'No se pudo crear el formulario.'); setSaving(false); return }
    if (editId) await supabase.from('form_sections').delete().eq('form_id', editId);
    for (const [sectionIndex, section] of (result.sections ?? []).entries()) {
      const { data: createdSection, error: sectionError } = await supabase.from('form_sections').insert({ form_id: form.id, title: section.title, description: section.description ?? '', position: sectionIndex }).select('id').single();
      if (sectionError || !createdSection) { setError(sectionError?.message ?? 'No se pudo crear una sección.'); setSaving(false); return }
      const fields = (section.fields ?? []).map((field: any, index: number) => ({ section_id: createdSection.id, field_key: `field_${Date.now()}_${index}`, label: field.label, field_type: field.field_type, is_required: Boolean(field.is_required), config: field.field_type === 'select' ? { options: field.options ?? [] } : {}, position: index, is_active: true }));
      if (fields.length) { const { error: fieldsError } = await supabase.from('form_fields').insert(fields); if (fieldsError) { setError(fieldsError.message); setSaving(false); return } }
    }
    navigate(`/formularios/${form.id}`);
  }
  return (
    <section className="ai-chat-page">
      <div className="editor-breadcrumb">
        <Link to="/formularios">← Formularios</Link>
      </div>
      <div className="module-heading">
        <div>
          <p className="eyebrow">ASISTENTE IA</p>
          <h1>Crear formulario con IA</h1>
          <p>
            Describe el formulario que necesitas y prepararemos una propuesta.
          </p>
        </div>
      </div>
      <div className="ai-chat-layout">
        <div className="panel ai-chat-card">
          <div className="ai-chat-messages">
            <div className="ai-message">
              <span className="ai-avatar">✦</span>
              <div>
                <strong>Asistente de formularios</strong>
                <p>Cuéntame qué formulario quieres crear.</p>
              </div>
            </div>
            {loading && <div className="ai-thinking"><span className="thinking-orb">✦</span><div><strong>La IA está trabajando</strong><p className="thinking-dots">Analizando tu solicitud<span>.</span><span>.</span><span>.</span></p></div></div>}
            {error && <div className="error-banner">{error}</div>}
            {result && (
              <div className="ai-result">
                <p className="eyebrow">VISTA PREVIA DEL FORMULARIO</p>
                <h2>{result.name}</h2>
                <p>{result.description}</p>
                {result.sections?.map((section: any) => (
                  <div className="ai-preview-section" key={section.title}>
                    <h3>{section.title}</h3>
                    <small>{section.description}</small>
                    {section.fields?.map((field: any) => (
                      <div className="ai-preview-field" key={field.label}>
                        <span>{field.label}</span>
                        <em>
                          {field.field_type}
                          {field.is_required ? " · Obligatorio" : ""}
                        </em>
                      </div>
                    ))}
                  </div>
                ))}
                <button className="primary-button ai-save-button" disabled={saving} onClick={() => void saveForm()} type="button">{saving ? 'Guardando…' : 'Guardar formulario'}</button>
              </div>
            )}
          </div>
          <form className="ai-chat-input" onSubmit={submit}>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ej. Crea un formulario para Recursos Humanos..."
              rows={5}
            />
            <button className="primary-button" disabled={loading} type="submit">
              {loading ? "Generando…" : "Enviar mensaje"}
            </button>
          </form>
        </div>
        <aside className="panel ai-chat-help">
          <p className="eyebrow">CÓMO FUNCIONA</p>
          <h2>Describe tu idea</h2>
          <p>La IA generará una propuesta estructurada para revisar.</p>
          {lastPrompt && <div className="ai-prompt-history"><small>ÚLTIMA INSTRUCCIÓN</small><span>{lastPrompt}</span></div>}
        </aside>
      </div>
    </section>
  );
}
