import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
type Analysis = { suggested_status: 'approved' | 'rejected'; observation: string; confidence: number }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const startedAt = new Date()
  const startedMs = performance.now()
  let admin: ReturnType<typeof createClient> | null = null
  let submission: { id: string; form_id: string; status: string } | null = null
  let requestedBy: string | null = null
  const model = Deno.env.get('OPENAI_ANALYSIS_MODEL') ?? 'gpt-5-nano'

  async function saveRun(values: { status: 'succeeded' | 'failed'; analysis?: Analysis; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }; responseId?: string; errorMessage?: string }) {
    if (!admin || !submission) return null
    const inputTokens = values.usage?.input_tokens ?? 0
    const outputTokens = values.usage?.output_tokens ?? 0
    const inputRateValue = Deno.env.get('OPENAI_INPUT_COST_PER_MILLION')
    const outputRateValue = Deno.env.get('OPENAI_OUTPUT_COST_PER_MILLION')
    const inputRate = Number(inputRateValue)
    const outputRate = Number(outputRateValue)
    const canEstimateCost = Boolean(inputRateValue && outputRateValue) && Number.isFinite(inputRate) && Number.isFinite(outputRate)
    const { data } = await admin.from('ai_analysis_runs').insert({
      submission_id: submission.id,
      form_id: submission.form_id,
      requested_by: requestedBy,
      provider: 'openai',
      model,
      status: values.status,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Math.max(0, Math.round(performance.now() - startedMs)),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: values.usage?.total_tokens ?? inputTokens + outputTokens,
      estimated_cost_usd: canEstimateCost ? (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000 : null,
      suggested_status: values.analysis?.suggested_status,
      confidence: values.analysis?.confidence,
      observation: values.analysis?.observation,
      provider_response_id: values.responseId,
      error_message: values.errorMessage,
    }).select('id,duration_ms,input_tokens,output_tokens,total_tokens,estimated_cost_usd').single()
    return data
  }

  try {
    const { submission_id } = await request.json()
    if (!submission_id) throw new Error('Falta el identificador de la respuesta.')
    if (!Deno.env.get('OPENAI_API_KEY')) throw new Error('OPENAI_API_KEY no está configurada en Supabase.')
    if (!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) throw new Error('SUPABASE_SERVICE_ROLE_KEY no está disponible en la Edge Function.')
    const authorization = request.headers.get('Authorization')
    if (!authorization) throw new Error('Debes iniciar sesión para analizar una respuesta.')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
    const { data: userData, error: userError } = await caller.auth.getUser()
    if (userError || !userData.user) throw new Error('La sesión no es válida o expiró.')
    requestedBy = userData.user.id
    const { data: visibleSubmission, error: visibleError } = await caller.from('form_submissions').select('id,form_id,status').eq('id', submission_id).single()
    if (visibleError || !visibleSubmission) throw new Error('No se encontró la respuesta o no tienes permiso para analizarla.')
    submission = visibleSubmission
    admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    if (['approved', 'rejected', 'completed'].includes(submission.status)) throw new Error(`No se puede analizar este formulario porque ya fue ${submission.status === 'approved' ? 'aprobado' : submission.status === 'rejected' ? 'rechazado' : 'finalizado'}.`)

    const [{ data: form }, { data: context }, { data: sections }, { data: answers }] = await Promise.all([
      admin.from('forms').select('name,description').eq('id', submission.form_id).single(),
      admin.from('form_contexts').select('objective,instructions,rules,restrictions,expected_output').eq('form_id', submission.form_id).eq('is_active', true).order('version', { ascending: false }).limit(1).maybeSingle(),
      admin.from('form_sections').select('id,title').eq('form_id', submission.form_id).order('position'),
      admin.from('submission_answers').select('field_id,value').eq('submission_id', submission_id),
    ])
    if (!context) throw new Error('Este formulario no tiene un contexto IA activo.')
    const sectionIds = (sections ?? []).map((section) => section.id)
    const { data: fields } = sectionIds.length ? await admin.from('form_fields').select('id,label,field_type,section_id').in('section_id', sectionIds).order('position') : { data: [] }
    const schema = { type: 'object', additionalProperties: false, required: ['suggested_status', 'observation', 'confidence'], properties: { suggested_status: { type: 'string', enum: ['approved', 'rejected'] }, observation: { type: 'string' }, confidence: { type: 'number' } } }
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, instructions: 'Analiza las respuestas según el contexto y reglas del formulario. Propón aprobado o rechazado y explica los criterios en español. No inventes datos. Devuelve únicamente JSON.', input: JSON.stringify({ form, context, sections, fields, answers }), text: { format: { type: 'json_schema', name: 'submission_review', strict: true, schema } } }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message ?? 'OpenAI no pudo analizar la respuesta.')
    const outputText = data.output?.find((item: { type: string }) => item.type === 'message')?.content?.find((item: { type: string }) => item.type === 'output_text')?.text
    if (!outputText) throw new Error('OpenAI no devolvió un resultado utilizable.')
    const analysis = JSON.parse(outputText) as Analysis
    const run = await saveRun({ status: 'succeeded', analysis, usage: data.usage, responseId: data.id })
    return json({ ...analysis, analysis_run_id: run?.id, metrics: run })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado.'
    await saveRun({ status: 'failed', errorMessage: message })
    return json({ error: message }, 500)
  }
})
