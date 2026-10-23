import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { decryptSecret, validateExternalUrl } from '../_shared/integration-security.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await request.json(); const submissionId = String(body.submission_id ?? ''); const deliveryId = String(body.delivery_id ?? '')
    if (!submissionId && !deliveryId) throw new Error('Falta el identificador de la respuesta o entrega.')
    const url = Deno.env.get('SUPABASE_URL')!; const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!); let mayRetry = false
    const authorization = request.headers.get('Authorization')
    if (authorization) {
      const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } }); const { data: userData } = await caller.auth.getUser()
      if (userData.user) {
        const [{ data: manages }, { data: reviews }] = await Promise.all([
          caller.rpc('has_permission', { permission_key: 'integrations.manage' }),
          caller.rpc('has_permission', { permission_key: 'forms.inbox' }),
        ])
        mayRetry = Boolean(manages || reviews)
      }
    }
    let query = admin.from('integration_deliveries').select('*,integration:external_integrations(*)').order('created_at')
    query = deliveryId ? query.eq('id', deliveryId) : query.eq('submission_id', submissionId)
    query = mayRetry && deliveryId ? query.in('status', ['pending', 'failed']) : query.eq('status', 'pending')
    const { data: deliveries, error } = await query; if (error) throw new Error(error.message)
    const results = []
    for (const delivery of deliveries ?? []) results.push(await deliver(admin, delivery))
    return json({ processed: results.length, deliveries: results })
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, 400) }
})

async function deliver(admin: ReturnType<typeof createClient>, delivery: any) {
  const started = performance.now(); const integration = delivery.integration
  await admin.from('integration_deliveries').update({ status: 'processing', attempts: delivery.attempts + 1, last_attempt_at: new Date().toISOString(), error_message: null }).eq('id', delivery.id)
  try {
    if (!integration?.is_active) throw new Error('La integración está inactiva.')
    const [{ data: form }, { data: submission }, { data: sections }, { data: answers }] = await Promise.all([
      admin.from('forms').select('id,name').eq('id', delivery.form_id).single(),
      admin.from('form_submissions').select('id,status,submitted_at,observation,latitude,longitude,location_accuracy_m,location_captured_at').eq('id', delivery.submission_id).single(),
      admin.from('form_sections').select('id').eq('form_id', delivery.form_id),
      admin.from('submission_answers').select('field_id,value').eq('submission_id', delivery.submission_id),
    ])
    const sectionIds = (sections ?? []).map((item: any) => item.id)
    const { data: fields } = sectionIds.length ? await admin.from('form_fields').select('id,label,field_type').in('section_id', sectionIds).order('position') : { data: [] }
    const answerMap = new Map((answers ?? []).map((item: any) => [item.field_id, item.value]))
    const payload = { event: `form.${delivery.event_type}`, event_id: delivery.id, occurred_at: new Date().toISOString(), form, submission, answers: (fields ?? []).map((field: any) => ({ field_id: field.id, question: field.label, type: field.field_type, value: safeValue(answerMap.get(field.id), field.field_type) })) }
    const { error: payloadError } = await admin.from('integration_deliveries').update({ request_payload: payload }).eq('id', delivery.id)
    if (payloadError) throw new Error(`No se pudo registrar el JSON de la integración: ${payloadError.message}`)
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Integration-Event': payload.event, 'Idempotency-Key': delivery.id }
    if (integration.auth_type !== 'none') {
      const { data: stored } = await admin.from('external_integration_secrets').select('encrypted_secret').eq('integration_id', integration.id).single(); if (!stored) throw new Error('La integración no tiene una credencial configurada.')
      const secret = await decryptSecret(stored.encrypted_secret)
      if (integration.auth_type === 'bearer') headers.Authorization = `Bearer ${secret}`; else headers[integration.api_key_header] = secret
    }
    const response = await fetch(validateExternalUrl(integration.url), { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(integration.timeout_seconds * 1000) })
    const excerpt = (await response.text()).slice(0, 1000); const duration = Math.round(performance.now() - started)
    if (!response.ok) throw Object.assign(new Error(`La API respondió con estado ${response.status}.`), { httpStatus: response.status, excerpt })
    await admin.from('integration_deliveries').update({ status: 'succeeded', http_status: response.status, duration_ms: duration, response_excerpt: excerpt, completed_at: new Date().toISOString() }).eq('id', delivery.id)
    return { id: delivery.id, status: 'succeeded', http_status: response.status }
  } catch (error) {
    const details = error as Error & { httpStatus?: number; excerpt?: string }; const message = details.name === 'TimeoutError' ? 'La API excedió el tiempo máximo de espera.' : details.message
    await admin.from('integration_deliveries').update({ status: 'failed', http_status: details.httpStatus ?? null, duration_ms: Math.round(performance.now() - started), response_excerpt: details.excerpt ?? null, error_message: message, completed_at: new Date().toISOString() }).eq('id', delivery.id)
    return { id: delivery.id, status: 'failed', error: message }
  }
}

function safeValue(value: unknown, type: string) {
  if (type === 'photo' || type === 'photo_attachment') return value ? '[imagen omitida del payload inicial]' : null
  const text = value == null ? '' : String(value); return text.length > 10_000 ? `${text.slice(0, 10_000)}…` : value
}
