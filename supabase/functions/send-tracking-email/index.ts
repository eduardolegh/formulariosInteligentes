import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let admin: ReturnType<typeof createClient> | null = null
  let submissionId = ''
  let recipientEmail = ''

  try {
    const body = await request.json()
    submissionId = String(body.submission_id ?? '')
    const trackingToken = String(body.tracking_token ?? '')

    if (!submissionId || !trackingToken) throw new Error('Faltan los datos de seguridad del seguimiento.')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const publicAppUrl = Deno.env.get('PUBLIC_APP_URL')?.replace(/\/$/, '')
    const fromEmail = Deno.env.get('TRACKING_FROM_EMAIL')
    const fromName = Deno.env.get('TRACKING_FROM_NAME') ?? 'Formularios Inteligentes'

    if (!supabaseUrl || !serviceRoleKey) throw new Error('La conexión segura con Supabase no está configurada.')
    if (!resendApiKey || !publicAppUrl || !fromEmail) throw new Error('El servicio de correo de seguimiento no está configurado.')

    admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: submission, error: submissionError } = await admin
      .from('form_submissions')
      .select('id,tracking_email,tracking_code,tracking_token,submitted_at,form:forms(name,tracking_enabled)')
      .eq('id', submissionId)
      .eq('tracking_token', trackingToken)
      .maybeSingle()

    if (submissionError) throw new Error(submissionError.message)
    if (!submission || !submission.form?.tracking_enabled || !submission.tracking_email || !submission.tracking_code) {
      throw new Error('No se encontró un seguimiento válido para este envío.')
    }

    recipientEmail = submission.tracking_email
    const attemptedAt = new Date().toISOString()
    const { error: pendingError } = await admin.from('submission_tracking_emails').upsert({
      submission_id: submission.id,
      recipient_email: recipientEmail,
      status: 'pending',
      error_message: null,
      last_attempt_at: attemptedAt,
      updated_at: attemptedAt,
    }, { onConflict: 'submission_id' })
    if (pendingError) throw new Error(pendingError.message)

    const { data: delivery } = await admin
      .from('submission_tracking_emails')
      .select('attempts')
      .eq('submission_id', submission.id)
      .single()
    await admin.from('submission_tracking_emails').update({ attempts: (delivery?.attempts ?? 0) + 1 }).eq('submission_id', submission.id)

    const formName = escapeHtml(submission.form.name ?? 'Formulario')
    const trackingCode = escapeHtml(submission.tracking_code)
    const trackingUrl = `${publicAppUrl}/seguimiento/${encodeURIComponent(trackingToken)}`

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `submission-tracking-${submission.id}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [recipientEmail],
        subject: `Seguimiento de tu envío · ${submission.form.name}`,
        html: `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f2f7f7;font-family:Arial,sans-serif;color:#29434a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f2f7f7">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;overflow:hidden;border:1px solid #d8e7e7;border-radius:18px;background:#ffffff">
          <tr><td style="height:6px;background:linear-gradient(90deg,#54b696,#247f95)"></td></tr>
          <tr><td style="padding:34px 36px">
            <p style="margin:0 0 9px;color:#318a73;font-size:12px;font-weight:700;letter-spacing:.12em">ENVÍO REGISTRADO</p>
            <h1 style="margin:0 0 12px;font-size:25px;line-height:1.25">Ya puedes consultar tu seguimiento</h1>
            <p style="margin:0;color:#71858b;font-size:15px;line-height:1.6">Recibimos correctamente tu información para <strong>${formName}</strong>.</p>
            <div style="margin:26px 0;padding:20px;border:1px solid #d6e8e4;border-radius:12px;background:#f4faf8;text-align:center">
              <span style="display:block;margin-bottom:8px;color:#78908b;font-size:11px;font-weight:700;letter-spacing:.1em">CÓDIGO DE SEGUIMIENTO</span>
              <strong style="color:#245d50;font-family:monospace;font-size:22px;letter-spacing:.06em">${trackingCode}</strong>
            </div>
            <p style="margin:0 0 20px;color:#71858b;font-size:13px;line-height:1.55">Guarda este código. También puedes ingresar directamente desde el siguiente botón:</p>
            <a href="${trackingUrl}" style="display:inline-block;padding:13px 22px;border-radius:10px;color:#ffffff;background:#247f95;font-size:14px;font-weight:700;text-decoration:none">Ver seguimiento</a>
            <p style="margin:26px 0 0;color:#94a4a7;font-size:11px;line-height:1.5">Si no realizaste este envío, puedes ignorar este correo.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
      }),
    })

    const resendData = await resendResponse.json()
    if (!resendResponse.ok) throw new Error(resendData?.message ?? 'Resend no pudo enviar el correo.')

    const sentAt = new Date().toISOString()
    await admin.from('submission_tracking_emails').update({
      status: 'sent',
      provider_message_id: resendData.id ?? null,
      error_message: null,
      sent_at: sentAt,
      updated_at: sentAt,
    }).eq('submission_id', submission.id)

    return json({ sent: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible enviar el correo de seguimiento.'
    if (admin && submissionId && recipientEmail) {
      await admin.from('submission_tracking_emails').update({
        status: 'failed',
        error_message: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq('submission_id', submissionId)
    }
    return json({ error: message }, 400)
  }
})

