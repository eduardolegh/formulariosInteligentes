import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { decryptSecret, encryptSecret, validateExternalUrl } from '../_shared/integration-security.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = request.headers.get('Authorization'); if (!authorization) throw new Error('Debes iniciar sesión.')
    const url = Deno.env.get('SUPABASE_URL')!; const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
    const { data: userData, error: userError } = await caller.auth.getUser(); if (userError || !userData.user) throw new Error('La sesión no es válida o expiró.')
    const { data: allowed } = await caller.rpc('has_permission', { permission_key: 'integrations.manage' }); if (!allowed) throw new Error('No tienes permiso para configurar integraciones.')
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!); const body = await request.json(); const action = String(body.action ?? '')

    if (action === 'save') {
      const item = body.integration ?? {}; const name = String(item.name ?? '').trim(); if (!name) throw new Error('El nombre es obligatorio.')
      const externalUrl = validateExternalUrl(String(item.url ?? '').trim()); const authType = String(item.auth_type ?? 'none')
      if (!['none', 'bearer', 'api_key'].includes(authType)) throw new Error('El tipo de autenticación no es válido.')
      const values = { name, description: String(item.description ?? '').trim(), url: externalUrl, auth_type: authType, api_key_header: String(item.api_key_header ?? 'X-API-Key').trim() || 'X-API-Key', timeout_seconds: Math.min(30, Math.max(3, Number(item.timeout_seconds) || 15)), is_active: item.is_active !== false, updated_at: new Date().toISOString() }
      const result = item.id
        ? await admin.from('external_integrations').update(values).eq('id', item.id).select().single()
        : await admin.from('external_integrations').insert({ ...values, created_by: userData.user.id }).select().single()
      if (result.error || !result.data) throw new Error(result.error?.message ?? 'No se pudo guardar la integración.')
      const secret = String(item.secret ?? '').trim()
      if (secret) {
        const encrypted_secret = await encryptSecret(secret)
        const { error } = await admin.from('external_integration_secrets').upsert({ integration_id: result.data.id, encrypted_secret, updated_at: new Date().toISOString() })
        if (error) throw new Error(error.message)
        await admin.from('external_integrations').update({ has_secret: true }).eq('id', result.data.id)
      } else if (authType !== 'none' && !result.data.has_secret) throw new Error('Debes ingresar la credencial de la integración.')
      return json({ integration: { ...result.data, has_secret: secret ? true : result.data.has_secret } })
    }

    if (action === 'delete') {
      const { error } = await admin.from('external_integrations').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', body.id); if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    if (action === 'test') {
      const { data: integration, error } = await admin.from('external_integrations').select('*').eq('id', body.id).single(); if (error || !integration) throw new Error('No se encontró la integración.')
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Integration-Event': 'connection.test' }
      if (integration.auth_type !== 'none') {
        const { data: stored } = await admin.from('external_integration_secrets').select('encrypted_secret').eq('integration_id', integration.id).single(); if (!stored) throw new Error('La integración no tiene credencial.')
        const secret = await decryptSecret(stored.encrypted_secret)
        if (integration.auth_type === 'bearer') headers.Authorization = `Bearer ${secret}`; else headers[integration.api_key_header] = secret
      }
      const started = performance.now(); const response = await fetch(validateExternalUrl(integration.url), { method: 'POST', headers, body: JSON.stringify({ event: 'connection.test', integration: { id: integration.id, name: integration.name }, occurred_at: new Date().toISOString() }), signal: AbortSignal.timeout(integration.timeout_seconds * 1000) })
      const excerpt = (await response.text()).slice(0, 500)
      return json({ ok: response.ok, http_status: response.status, duration_ms: Math.round(performance.now() - started), response_excerpt: excerpt }, response.ok ? 200 : 422)
    }
    throw new Error('Acción no reconocida.')
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, 400) }
})
