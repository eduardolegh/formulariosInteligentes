import { supabase } from './supabase'

export async function sendTrackingStatusNotifications(submissionId: string) {
  const { data, error } = await supabase.functions.invoke('send-tracking-email', {
    body: { action: 'status_change', submission_id: submissionId },
  })
  if (error || data?.error) {
    let detail = data?.error as string | undefined
    if (!detail && error && 'context' in error) {
      try { detail = (await (error as { context: Response }).context.json())?.error } catch { /* respuesta sin JSON */ }
    }
    throw new Error(detail ?? error?.message ?? 'No se pudo enviar la notificación de seguimiento.')
  }
  return data as { sent: boolean; skipped?: boolean; processed: number }
}
