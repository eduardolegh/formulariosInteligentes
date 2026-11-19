import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;')

const statusLabels: Record<string, string> = {
  submitted: 'Solicitud recibida', in_review: 'En revisión', approved: 'Aprobada',
  rejected: 'Rechazada', completed: 'Finalizada',
}

type AdminClient = ReturnType<typeof createClient>
type MailConfig = { apiKey: string; appUrl: string; fromEmail: string; fromName: string }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let admin: AdminClient | null = null
  let submissionId = ''
  let recipientEmail = ''

  try {
    const body = await request.json()
    submissionId = String(body.submission_id ?? '')
    const trackingToken = String(body.tracking_token ?? '')
    const action = String(body.action ?? 'initial')
    if (!submissionId) throw new Error('Falta el identificador del envío.')
    if (!['initial', 'status_change'].includes(action)) throw new Error('La acción de correo no es válida.')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const publicAppUrl = Deno.env.get('PUBLIC_APP_URL')?.replace(/\/$/, '')
    const fromEmail = Deno.env.get('TRACKING_FROM_EMAIL')
    const fromName = Deno.env.get('TRACKING_FROM_NAME') ?? 'Formularios Inteligentes'
    if (!supabaseUrl || !serviceRoleKey) throw new Error('La conexión segura con Supabase no está configurada.')
    if (!resendApiKey || !publicAppUrl || !fromEmail) throw new Error('El servicio de correo de seguimiento no está configurado.')

    admin = createClient(supabaseUrl, serviceRoleKey)
    const config = { apiKey: resendApiKey, appUrl: publicAppUrl, fromEmail, fromName }

    if (action === 'status_change') {
      await requireReviewer(request, supabaseUrl)
      return json(await sendPendingStatusEmails(admin, submissionId, config))
    }

    if (!trackingToken) throw new Error('Faltan los datos de seguridad del seguimiento.')
    const { data: submission, error: submissionError } = await admin.from('form_submissions')
      .select('id,status,tracking_email,tracking_code,tracking_token,form:forms(name,tracking_enabled)')
      .eq('id', submissionId).eq('tracking_token', trackingToken).maybeSingle()
    if (submissionError) throw new Error(submissionError.message)
    if (!submission || !submission.form?.tracking_enabled || !submission.tracking_email || !submission.tracking_code) {
      throw new Error('No se encontró un seguimiento válido para este envío.')
    }

    recipientEmail = submission.tracking_email
    const attemptedAt = new Date().toISOString()
    const { error: pendingError } = await admin.from('submission_tracking_emails').upsert({
      submission_id: submission.id, recipient_email: recipientEmail, status: 'pending', error_message: null,
      last_attempt_at: attemptedAt, updated_at: attemptedAt,
    }, { onConflict: 'submission_id' })
    if (pendingError) throw new Error(pendingError.message)
    const { data: delivery } = await admin.from('submission_tracking_emails').select('attempts').eq('submission_id', submission.id).single()
    await admin.from('submission_tracking_emails').update({ attempts: (delivery?.attempts ?? 0) + 1 }).eq('submission_id', submission.id)

    const trackingUrl = `${publicAppUrl}/seguimiento/${encodeURIComponent(trackingToken)}`
    const resendData = await sendWithResend(config, {
      to: recipientEmail,
      subject: `Seguimiento de tu envío · ${submission.form.name}`,
      idempotencyKey: `submission-tracking-${submission.id}`,
      html: initialEmailHtml(submission.form.name ?? 'Formulario', submission.tracking_code, trackingUrl),
    })
    const sentAt = new Date().toISOString()
    await admin.from('submission_tracking_emails').update({
      status: 'sent', provider_message_id: resendData.id ?? null, error_message: null, sent_at: sentAt, updated_at: sentAt,
    }).eq('submission_id', submission.id)
    await admin.from('submission_tracking_notifications').update({
      status: 'sent', provider_message_id: resendData.id ?? null, error_message: null, sent_at: sentAt, updated_at: sentAt,
    }).eq('submission_id', submission.id).is('previous_status', null).eq('status', 'pending')
    return json({ sent: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible enviar el correo de seguimiento.'
    if (admin && submissionId && recipientEmail) await admin.from('submission_tracking_emails').update({
      status: 'failed', error_message: message.slice(0, 1000), updated_at: new Date().toISOString(),
    }).eq('submission_id', submissionId)
    return json({ error: message }, 400)
  }
})

async function requireReviewer(request: Request, supabaseUrl: string) {
  const authorization = request.headers.get('Authorization')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!authorization || !anonKey) throw new Error('Debes iniciar sesión para notificar cambios de estado.')
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData.user) throw new Error('La sesión no es válida o expiró.')
  const [{ data: inbox }, { data: view }, { data: edit }, { data: manageUsers }] = await Promise.all([
    caller.rpc('has_permission', { permission_key: 'forms.inbox' }),
    caller.rpc('has_permission', { permission_key: 'forms.view' }),
    caller.rpc('has_permission', { permission_key: 'forms.edit' }),
    caller.rpc('has_permission', { permission_key: 'users.manage' }),
  ])
  if (!inbox && !view && !edit && !manageUsers) throw new Error('No tienes permiso para notificar cambios de estado.')
}

async function sendPendingStatusEmails(admin: AdminClient, submissionId: string, config: MailConfig) {
  const { data: submission, error: submissionError } = await admin.from('form_submissions')
    .select('id,tracking_email,tracking_token,form:forms(name,tracking_enabled)')
    .eq('id', submissionId).maybeSingle()
  if (submissionError) throw new Error(submissionError.message)
  if (!submission?.form?.tracking_enabled || !submission.tracking_email || !submission.tracking_token) {
    return { sent: true, skipped: true, processed: 0 }
  }

  const { data: notifications, error: notificationsError } = await admin.from('submission_tracking_notifications')
    .select('id,new_status,observation,attempts').eq('submission_id', submissionId)
    .in('status', ['pending', 'failed']).not('previous_status', 'is', null).order('created_at')
  if (notificationsError) throw new Error(notificationsError.message)

  let sent = 0
  const errors: string[] = []
  for (const notification of notifications ?? []) {
    const attemptedAt = new Date().toISOString()
    const { data: claimed } = await admin.from('submission_tracking_notifications').update({
      status: 'processing', attempts: (notification.attempts ?? 0) + 1, last_attempt_at: attemptedAt,
      error_message: null, updated_at: attemptedAt,
    }).eq('id', notification.id).in('status', ['pending', 'failed']).select('id').maybeSingle()
    if (!claimed) continue
    try {
      const label = statusLabels[notification.new_status] ?? notification.new_status
      const trackingUrl = `${config.appUrl}/seguimiento/${encodeURIComponent(submission.tracking_token)}`
      const resendData = await sendWithResend(config, {
        to: submission.tracking_email, subject: `${label} · ${submission.form.name}`,
        idempotencyKey: `tracking-status-${notification.id}`,
        html: statusEmailHtml(submission.form.name ?? 'Formulario', label, notification.observation, trackingUrl),
      })
      const sentAt = new Date().toISOString()
      await admin.from('submission_tracking_notifications').update({
        status: 'sent', provider_message_id: resendData.id ?? null, error_message: null, sent_at: sentAt, updated_at: sentAt,
      }).eq('id', notification.id)
      sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible enviar la notificación.'
      errors.push(message)
      await admin.from('submission_tracking_notifications').update({
        status: 'failed', error_message: message.slice(0, 1000), updated_at: new Date().toISOString(),
      }).eq('id', notification.id)
    }
  }
  if (errors.length) throw new Error(`Quedaron ${errors.length} correo(s) pendientes: ${errors[0]}`)
  return { sent: true, processed: sent }
}

async function sendWithResend(config: MailConfig, mail: { to: string; subject: string; idempotencyKey: string; html: string }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': mail.idempotencyKey },
    body: JSON.stringify({ from: `${config.fromName} <${config.fromEmail}>`, to: [mail.to], subject: mail.subject, html: mail.html }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.message ?? 'Resend no pudo enviar el correo.')
  return data
}

function initialEmailHtml(formNameValue: string, trackingCodeValue: string, trackingUrl: string) {
  const formName = escapeHtml(formNameValue)
  const trackingCode = escapeHtml(trackingCodeValue)
  return emailShell('ENVÍO REGISTRADO', 'Ya puedes consultar tu seguimiento', `Recibimos correctamente tu información para <strong>${formName}</strong>.`, `<div style="margin:26px 0;padding:20px;border:1px solid #d6e8e4;border-radius:12px;background:#f4faf8;text-align:center"><span style="display:block;margin-bottom:8px;color:#78908b;font-size:11px;font-weight:700;letter-spacing:.1em">CÓDIGO DE SEGUIMIENTO</span><strong style="color:#245d50;font-family:monospace;font-size:22px;letter-spacing:.06em">${trackingCode}</strong></div>`, trackingUrl)
}

function statusEmailHtml(formNameValue: string, statusLabelValue: string, observationValue: string | null, trackingUrl: string) {
  const formName = escapeHtml(formNameValue)
  const statusLabel = escapeHtml(statusLabelValue)
  const observation = observationValue?.trim() ? `<div style="margin:22px 0;padding:17px;border-left:4px solid #247f95;border-radius:10px;background:#f1f8f9"><span style="display:block;margin-bottom:7px;color:#247f95;font-size:11px;font-weight:700;letter-spacing:.08em">OBSERVACIÓN DEL EQUIPO</span><p style="margin:0;color:#49646b;font-size:14px;line-height:1.6;white-space:pre-line">${escapeHtml(observationValue)}</p></div>` : ''
  return emailShell('ACTUALIZACIÓN DE TU SOLICITUD', `Tu solicitud ahora está: ${statusLabel}`, `Se actualizó el seguimiento de <strong>${formName}</strong>.`, observation, trackingUrl)
}

function emailShell(label: string, title: string, description: string, content: string, trackingUrl: string) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f2f7f7;font-family:Arial,sans-serif;color:#29434a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f2f7f7"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;overflow:hidden;border:1px solid #d8e7e7;border-radius:18px;background:#fff"><tr><td style="height:6px;background:linear-gradient(90deg,#54b696,#247f95)"></td></tr><tr><td style="padding:34px 36px"><p style="margin:0 0 9px;color:#318a73;font-size:12px;font-weight:700;letter-spacing:.12em">${label}</p><h1 style="margin:0 0 12px;font-size:25px;line-height:1.25">${title}</h1><p style="margin:0;color:#71858b;font-size:15px;line-height:1.6">${description}</p>${content}<p style="margin:0 0 20px;color:#71858b;font-size:13px;line-height:1.55">Consulta el detalle y el historial desde el portal:</p><a href="${trackingUrl}" style="display:inline-block;padding:13px 22px;border-radius:10px;color:#fff;background:#247f95;font-size:14px;font-weight:700;text-decoration:none">Ver seguimiento</a><p style="margin:26px 0 0;color:#94a4a7;font-size:11px;line-height:1.5">Si no realizaste este envío, puedes ignorar este correo.</p></td></tr></table></td></tr></table></body></html>`
}
