import { supabase } from './supabase'

export async function invokeIntegrationFunction<T>(name: 'manage-integrations' | 'dispatch-integrations', body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error || data?.error) {
    let detail = data?.error as string | undefined
    if (!detail && error && 'context' in error) {
      try { detail = (await (error as { context: Response }).context.json())?.error } catch { /* respuesta sin JSON */ }
    }
    throw new Error(detail ?? error?.message ?? 'No se pudo completar la operación de integración.')
  }
  return data as T
}

export async function dispatchSubmissionIntegrations(submissionId: string) {
  return invokeIntegrationFunction<{ processed: number }>('dispatch-integrations', { submission_id: submissionId })
}
