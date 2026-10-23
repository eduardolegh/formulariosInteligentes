import { supabase } from './supabase'

export type AiOperation = 'analyze-submission' | 'dashboard-assistant' | 'generate-form'

const transport = import.meta.env.VITE_AI_TRANSPORT ?? 'supabase'
const backendUrl = (import.meta.env.VITE_AI_BACKEND_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')

export async function invokeAi<T>(operation: AiOperation, body: Record<string, unknown>): Promise<T> {
  if (transport === 'supabase') {
    const { data, error } = await supabase.functions.invoke(operation, { body })
    if (error || data?.error) {
      let detail = data?.error as string | undefined
      if (!detail && error && 'context' in error) {
        try { const responseBody = await (error as { context: Response }).context.json(); detail = responseBody?.error } catch { /* respuesta sin JSON */ }
      }
      throw new Error(detail ?? error?.message ?? 'No se pudo completar la operación de inteligencia artificial.')
    }
    return data as T
  }

  if (transport !== 'backend') throw new Error(`VITE_AI_TRANSPORT tiene un valor no válido: ${transport}`)
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Debes iniciar sesión para utilizar la inteligencia artificial local.')
  const response = await fetch(`${backendUrl}/api/${operation}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({ error: 'El backend local devolvió una respuesta inválida.' }))
  if (!response.ok || data?.error) throw new Error(data?.error ?? `El backend local respondió con estado ${response.status}.`)
  return data as T
}

export const aiTransportLabel = transport === 'backend' ? 'Ollama local' : 'OpenAI mediante Supabase'
