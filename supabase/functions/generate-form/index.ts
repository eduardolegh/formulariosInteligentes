import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const startedAt = new Date(); const startedMs = performance.now()
  const model = Deno.env.get('OPENAI_FORM_MODEL') ?? 'gpt-5-nano'
  let admin: ReturnType<typeof createClient> | null = null
  let requestedBy: string | null = null
  let formId: string | null = null
  let operationType: 'form_generation' | 'form_edit' = 'form_generation'
  let usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } = {}

  async function logRun(status: 'succeeded' | 'failed', errorMessage?: string) {
    if (!admin || !requestedBy) return
    const inputTokens = usage.input_tokens ?? 0; const outputTokens = usage.output_tokens ?? 0
    const inputRateValue = Deno.env.get('OPENAI_INPUT_COST_PER_MILLION'); const outputRateValue = Deno.env.get('OPENAI_OUTPUT_COST_PER_MILLION')
    const inputRate = Number(inputRateValue); const outputRate = Number(outputRateValue)
    const canEstimate = Boolean(inputRateValue && outputRateValue) && Number.isFinite(inputRate) && Number.isFinite(outputRate)
    await admin.from('llm_operation_runs').insert({ requested_by: requestedBy, form_id: formId, operation_type: operationType, provider: 'openai', model, status, started_at: startedAt.toISOString(), completed_at: new Date().toISOString(), duration_ms: Math.max(0, Math.round(performance.now() - startedMs)), input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: usage.total_tokens ?? inputTokens + outputTokens, estimated_cost_usd: canEstimate ? (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000 : null, error_message: errorMessage })
  }

  try {
    const authorization = request.headers.get('Authorization'); if (!authorization) throw new Error('Debes iniciar sesión para utilizar la inteligencia artificial.')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
    const { data: userData, error: userError } = await caller.auth.getUser(); if (userError || !userData.user) throw new Error('La sesión no es válida o expiró.')
    requestedBy = userData.user.id
    const { data: allowed } = await caller.rpc('has_permission', { permission_key: 'forms.create' }); if (!allowed) throw new Error('No tienes permiso para crear formularios.')
    admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await request.json(); const message = String(body.message ?? '').trim(); if (!message) throw new Error('Escribe una instrucción.')
    operationType = body.operation_type === 'form_edit' ? 'form_edit' : 'form_generation'; formId = body.form_id ? String(body.form_id) : null
    const schema = {
      type: 'object', additionalProperties: false, required: ['name', 'description', 'ai_enabled', 'sections'],
      properties: {
        name: { type: 'string' }, description: { type: 'string' }, ai_enabled: { type: 'boolean' },
        sections: { type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['title', 'description', 'fields'],
          properties: {
            title: { type: 'string' }, description: { type: 'string' },
            fields: { type: 'array', items: {
              type: 'object', additionalProperties: false, required: ['label', 'field_type', 'is_required', 'options', 'request_document_photo'],
              properties: {
                label: { type: 'string' },
                field_type: { type: 'string', enum: ['text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'boolean', 'photo', 'photo_attachment', 'geolocation', 'identity_document', 'document_attachment'] },
                is_required: { type: 'boolean' }, options: { type: 'array', items: { type: 'string' } }, request_document_photo: { type: 'boolean' },
              },
            } },
          },
        } },
      },
    }
    const response = await fetch('https://api.openai.com/v1/responses', { method:'POST', headers:{Authorization:`Bearer ${Deno.env.get('OPENAI_API_KEY')}`,'Content-Type':'application/json'}, body:JSON.stringify({model,instructions:'Genera formularios en español y devuelve únicamente JSON. Usa opciones solo para select. Usa geolocation para ubicaciones, identity_document para identificación y request_document_photo=true solo si se pide fotografía y extracción automática. Usa document_attachment para adjuntar PDF.',input:message,text:{format:{type:'json_schema',name:'form_definition',strict:true,schema}}}) })
    const data = await response.json(); usage = data.usage ?? {}
    if(!response.ok) throw new Error(data.error?.message ?? 'OpenAI no pudo generar el formulario.')
    const text=data.output?.find((item:{type:string})=>item.type==='message')?.content?.find((item:{type:string})=>item.type==='output_text')?.text
    if (!text) throw new Error('OpenAI no devolvió un formulario utilizable.')
    const form = JSON.parse(text); await logRun('succeeded'); return json({ form })
  } catch(error) {
    const message = error instanceof Error ? error.message : 'Error inesperado.'; await logRun('failed', message); return json({ error: message }, 500)
  }
})
