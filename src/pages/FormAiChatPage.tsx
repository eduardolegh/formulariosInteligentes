import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function FormAiChatPage() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke(
      "generate-form",
      { body: { message } },
    );
    if (invokeError || data?.error)
      setError(invokeError?.message ?? data?.error);
    else setResult(data.form);
    setLoading(false);
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
        </aside>
      </div>
    </section>
  );
}
