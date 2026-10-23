import { useState, type FormEvent } from 'react'
import { invokeAi } from '../lib/ai'

type Message = { id: number; role: 'user' | 'assistant'; text: string; supported?: boolean }
const initialSuggestions = [
  '¿Cuál fue el último formulario enviado?',
  '¿Cuántas respuestas recibimos en los últimos 30 días?',
  '¿Cómo se distribuyen las respuestas por estado?',
  '¿Qué departamento tiene más solicitudes pendientes?',
  '¿Cuál es el formulario con mayor actividad?',
  '¿Qué formulario tiene la tasa de rechazo más alta?',
  '¿Cuál es el tiempo promedio de decisión?',
  '¿Cuántos tokens consume en promedio cada análisis?',
  '¿Cuál es el costo estimado de IA este mes?',
  '¿Qué porcentaje de recomendaciones coincide con la decisión humana?',
]

export function DashboardAssistant() {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [loading, setLoading] = useState(false)

  async function ask(text: string) {
    const clean = text.trim()
    if (!clean || loading) return
    setMessages((current) => [...current, { id: Date.now(), role: 'user', text: clean }])
    setQuestion(''); setLoading(true)
    try {
      const data = await invokeAi<{ answer?: string; supported?: boolean; suggestions?: string[] }>('dashboard-assistant', { question: clean })
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', text: data.answer ?? 'No pude responder en este momento.', supported: data.supported !== false }])
      if (Array.isArray(data.suggestions)) setSuggestions(data.suggestions.slice(0, 10))
    } catch (assistantError) {
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', text: assistantError instanceof Error ? assistantError.message : 'No pude responder en este momento.', supported: false }])
    }
    setLoading(false)
  }

  function submit(event: FormEvent) { event.preventDefault(); void ask(question) }

  return <>
    <button className={`assistant-launcher${open ? ' active' : ''}`} onClick={() => setOpen((value) => !value)} type="button" aria-label="Preguntar al dashboard"><span>✦</span><b>Preguntar al dashboard</b></button>
    {open && <aside className="assistant-panel" aria-label="Asistente del dashboard">
      <header><div className="assistant-avatar">✦</div><div><strong>Asistente analítico</strong><small>Consulta métricas autorizadas</small></div><button onClick={() => setOpen(false)} type="button" aria-label="Cerrar">×</button></header>
      <div className="assistant-scope"><span>i</span><p>Puedo responder sobre actividad, estados, departamentos, tiempos, tokens, costos y rendimiento de IA. No tengo acceso libre a la base de datos.</p></div>
      <div className="assistant-messages">
        {!messages.length && <div className="assistant-welcome"><div>✦</div><strong>¿Qué deseas conocer?</strong><p>Selecciona una pregunta o escribe una consulta sobre los indicadores.</p><div className="assistant-suggestions">{suggestions.slice(0, 10).map((item) => <button key={item} onClick={() => void ask(item)} type="button">{item}</button>)}</div></div>}
        {messages.map((message) => <div className={`assistant-message ${message.role}${message.supported === false ? ' unsupported' : ''}`} key={message.id}>{message.role === 'assistant' && <span>{message.supported === false ? '!' : '✦'}</span>}<p>{message.text}</p></div>)}
        {loading && <div className="assistant-message assistant thinking"><span>✦</span><p>Consultando las métricas<span className="processing-dots">...</span></p></div>}
      </div>
      <form onSubmit={submit}><textarea maxLength={500} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ejemplo: ¿cuántos tokens usamos este mes?" rows={2} /><div><small>{question.length}/500</small><button disabled={loading || !question.trim()} type="submit">Enviar <span>↑</span></button></div></form>
    </aside>}
  </>
}
