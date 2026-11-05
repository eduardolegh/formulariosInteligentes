import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const schema = {
  type: 'object', additionalProperties: false,
  required: ['valid_document', 'status', 'document_side', 'has_portrait', 'document_type', 'document_number', 'first_names', 'last_names', 'visible_fields', 'confidence', 'reason'],
  properties: {
    valid_document: { type: 'boolean' },
    status: { type: 'string', enum: ['valid_document', 'not_document', 'unreadable'] },
    document_side: { type: 'string', enum: ['front', 'back', 'unknown'] },
    has_portrait: { type: 'boolean' },
    document_type: { type: 'string' }, document_number: { type: 'string' }, first_names: { type: 'string' }, last_names: { type: 'string' },
    visible_fields: { type: 'object', additionalProperties: false, required: ['document_type', 'document_number', 'first_names', 'last_names'], properties: { document_type: { type: 'boolean' }, document_number: { type: 'boolean' }, first_names: { type: 'boolean' }, last_names: { type: 'boolean' } } },
    confidence: { type: 'number', minimum: 0, maximum: 1 }, reason: { type: 'string' },
  },
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const startedAt = new Date(); const startedMs = performance.now()
  const model = Deno.env.get('OPENAI_VISION_MODEL') ?? Deno.env.get('OPENAI_ANALYSIS_MODEL') ?? 'gpt-5-nano'
  let admin: ReturnType<typeof createClient> | null = null
  let formId: string | null = null
  let usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } = {}
  async function logRun(status: 'succeeded' | 'failed', errorMessage?: string) {
    if (!admin) return
    const inputTokens = usage.input_tokens ?? 0; const outputTokens = usage.output_tokens ?? 0
    const inputRateValue = Deno.env.get('OPENAI_VISION_INPUT_COST_PER_MILLION') ?? Deno.env.get('OPENAI_INPUT_COST_PER_MILLION'); const outputRateValue = Deno.env.get('OPENAI_VISION_OUTPUT_COST_PER_MILLION') ?? Deno.env.get('OPENAI_OUTPUT_COST_PER_MILLION')
    const inputRate = Number(inputRateValue); const outputRate = Number(outputRateValue)
    const canEstimate = Boolean(inputRateValue && outputRateValue) && Number.isFinite(inputRate) && Number.isFinite(outputRate)
    await admin.from('llm_operation_runs').insert({ requested_by: null, form_id: formId, operation_type: 'identity_document_validation', provider: 'openai', model, status, started_at: startedAt.toISOString(), completed_at: new Date().toISOString(), duration_ms: Math.max(0, Math.round(performance.now() - startedMs)), input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: usage.total_tokens ?? inputTokens + outputTokens, estimated_cost_usd: canEstimate ? (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000 : null, error_message: errorMessage, metadata: { public_form: true } })
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await request.json()
    const shareToken = String(body.share_token ?? ''); const fieldId = String(body.field_id ?? '')
    const imageBase64 = String(body.image_base64 ?? ''); const mimeType = String(body.mime_type ?? '')
    if (!shareToken || !fieldId || !imageBase64) throw new Error('Faltan datos para validar el documento.')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('El formato de imagen no es válido.')
    if (imageBase64.length > 5_600_000) throw new Error('La fotografía es demasiado grande.')
    const { data: form } = await admin.from('forms').select('id,visibility').eq('share_token', shareToken).eq('status', 'published').eq('is_active', true).maybeSingle()
    if (!form) throw new Error('El formulario no está disponible.'); formId = form.id
    if (form.visibility !== 'public') {
      const authorization = request.headers.get('Authorization')
      if (!authorization) throw new Error('Debes iniciar sesión para validar documentos de este formulario.')
      const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
      const [{ data: userData }, { data: allowed }] = await Promise.all([caller.auth.getUser(), caller.rpc('has_permission', { permission_key: 'forms.respond' })])
      if (!userData.user || !allowed) throw new Error('No tienes permiso para responder este formulario.')
    }
    const { data: sections } = await admin.from('form_sections').select('id').eq('form_id', form.id)
    const sectionIds = (sections ?? []).map((section) => section.id)
    const { data: field } = sectionIds.length ? await admin.from('form_fields').select('id,field_type,config,is_active').eq('id', fieldId).in('section_id', sectionIds).maybeSingle() : { data: null }
    if (!field || !field.is_active || field.field_type !== 'identity_document' || field.config?.request_document_photo !== true) throw new Error('Esta pregunta no admite validación de documentos.')

    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      model,
      instructions: 'Analiza la fotografía como control de captura, no como autenticación legal. Acepta únicamente el FRENTE o página principal de un documento oficial de identidad. Para ser válido deben verse simultáneamente el retrato del titular, tipo, número, nombres y apellidos. Marca visible_fields=true solo cuando cada dato sea directamente legible en la imagen; no infieras, no completes y no uses códigos de barras del reverso. Si es el reverso devuelve document_side=back y valid_document=false aunque tenga códigos o algún número. Rechaza paredes, objetos, pantallas sin documento, imágenes borrosas, recortadas o ilegibles. Responde en español y solo con el JSON solicitado.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'Comprueba que sea el frente completo del documento y extrae únicamente los datos que se ven directamente.' }, { type: 'input_image', image_url: `data:${mimeType};base64,${imageBase64}` }] }],
      text: { format: { type: 'json_schema', name: 'identity_document_validation', strict: true, schema } },
    }) })
    const data = await response.json(); usage = data.usage ?? {}
    if (!response.ok) throw new Error(data.error?.message ?? 'No fue posible analizar la fotografía.')
    const output = data.output?.find((item: { type: string }) => item.type === 'message')?.content?.find((item: { type: string }) => item.type === 'output_text')?.text
    if (!output) throw new Error('La inteligencia artificial no devolvió un resultado utilizable.')
    const result = JSON.parse(output)
    const complete = [result.document_type, result.document_number, result.first_names, result.last_names].every((part) => String(part ?? '').trim())
    const allVisible = result.visible_fields && Object.values(result.visible_fields).length === 4 && Object.values(result.visible_fields).every(Boolean)
    const dpiNumberValid = !String(result.document_type ?? '').toUpperCase().includes('DPI') || String(result.document_number ?? '').replace(/\D/g, '').length === 13
    const acceptedFront = result.valid_document && result.status === 'valid_document' && result.document_side === 'front' && result.has_portrait === true && allVisible && complete && dpiNumberValid && Number(result.confidence) >= 0.85
    if (!acceptedFront) {
      result.valid_document = false; result.status = result.status === 'not_document' ? 'not_document' : 'unreadable'
      if (result.document_side === 'back') result.reason = 'Se capturó el reverso del documento. Debes fotografiar el frente donde aparecen el retrato y los datos personales.'
      else if (!dpiNumberValid) result.reason = 'El número de DPI no tiene los 13 dígitos requeridos o no es completamente legible.'
      else if (!result.reason) result.reason = 'No se observa el frente completo con retrato y todos los datos requeridos claramente legibles.'
    }
    await logRun('succeeded'); return json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado.'; await logRun('failed', message); return json({ error: message }, 400)
  }
})
