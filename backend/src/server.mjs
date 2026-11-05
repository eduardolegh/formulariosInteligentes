import http from 'node:http'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { answerMetric, applyCutoff, dashboardClassificationSchema, findForm, intents, periodCutoff, suggestions } from './dashboard-metrics.mjs'

const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`Falta la variable ${name} en backend/.env`); return value }
const port = Number(process.env.BACKEND_PORT ?? 3001)
const frontendOrigins = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173').split(',').map((value) => value.trim())
const supabaseUrl = required('SUPABASE_URL')
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? required('SUPABASE_PUBLISHABLE_KEY')
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? required('SUPABASE_SECRET_KEY')
const ollamaUrl = (process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
const ollamaModel = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b'
const serverClientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
}
const admin = createClient(supabaseUrl, secretKey, serverClientOptions)

async function saveLlmOperation({ requestedBy, formId = null, operationType, status, startedAt, startedMs, usage = {}, errorMessage = null, metadata = {}, allowAnonymous = false }) {
  if (!requestedBy && !allowAnonymous) return
  await admin.from('llm_operation_runs').insert({ requested_by: requestedBy ?? null, form_id: formId, operation_type: operationType, provider: 'ollama', model: ollamaModel, status, started_at: startedAt.toISOString(), completed_at: new Date().toISOString(), duration_ms: Math.max(0, Math.round(performance.now() - startedMs)), input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, total_tokens: usage.total_tokens ?? 0, estimated_cost_usd: null, error_message: errorMessage, metadata })
}

const formSchema = { type: 'object', additionalProperties: false, required: ['name', 'description', 'ai_enabled', 'sections'], properties: { name: { type: 'string' }, description: { type: 'string' }, ai_enabled: { type: 'boolean' }, sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'description', 'fields'], properties: { title: { type: 'string' }, description: { type: 'string' }, fields: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'field_type', 'is_required', 'options', 'request_document_photo'], properties: { label: { type: 'string' }, field_type: { type: 'string', enum: ['text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'boolean', 'photo', 'photo_attachment', 'geolocation', 'identity_document', 'document_attachment'] }, is_required: { type: 'boolean' }, options: { type: 'array', items: { type: 'string' } }, request_document_photo: { type: 'boolean' } } } } } } } } }
const analysisSchema = { type: 'object', additionalProperties: false, required: ['suggested_status', 'observation', 'confidence'], properties: { suggested_status: { type: 'string', enum: ['approved', 'rejected'] }, observation: { type: 'string' }, confidence: { type: 'number' } } }
const identityDocumentSchema = { type: 'object', additionalProperties: false, required: ['valid_document', 'status', 'document_side', 'has_portrait', 'document_type', 'document_number', 'first_names', 'last_names', 'visible_fields', 'confidence', 'reason'], properties: { valid_document: { type: 'boolean' }, status: { type: 'string', enum: ['valid_document', 'not_document', 'unreadable'] }, document_side: { type: 'string', enum: ['front', 'back', 'unknown'] }, has_portrait: { type: 'boolean' }, document_type: { type: 'string' }, document_number: { type: 'string' }, first_names: { type: 'string' }, last_names: { type: 'string' }, visible_fields: { type: 'object', additionalProperties: false, required: ['document_type', 'document_number', 'first_names', 'last_names'], properties: { document_type: { type: 'boolean' }, document_number: { type: 'boolean' }, first_names: { type: 'boolean' }, last_names: { type: 'boolean' } } }, confidence: { type: 'number' }, reason: { type: 'string' } } }

function cors(origin) {
  const allowed = frontendOrigins.includes(origin) ? origin : frontendOrigins[0]
  return { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' }
}
function send(response, origin, status, body) { response.writeHead(status, { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)) }
async function bodyOf(request) { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > 6_000_000) throw new Error('La solicitud es demasiado grande.'); chunks.push(chunk) } const raw = Buffer.concat(chunks).toString('utf8'); return raw ? JSON.parse(raw) : {} }
async function callerFor(request) {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) throw new Error('Debes iniciar sesión para utilizar la inteligencia artificial local.')
  const caller = createClient(supabaseUrl, publishableKey, {
    ...serverClientOptions,
    global: { headers: { Authorization: authorization } },
  })
  const { data, error } = await caller.auth.getUser()
  if (error || !data.user) throw new Error('La sesión no es válida o expiró.')
  return { caller, user: data.user }
}
async function requirePermission(caller, permission) { const { data, error } = await caller.rpc('has_permission', { permission_key: permission }); if (error || !data) { const action = permission === 'forms.create' ? 'crear formularios' : permission === 'forms.respond' ? 'responder este formulario' : 'consultar indicadores del dashboard'; throw new Error(`No tienes permiso para ${action}.`) } }
async function ollamaJson(system, input, schema) {
  const started = performance.now()
  const response = await fetch(`${ollamaUrl}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: ollamaModel, stream: false, think: false, format: schema, options: { temperature: 0 }, messages: [{ role: 'system', content: system }, { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) }] }) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? `Ollama respondió con estado ${response.status}.`)
  const content = data.message?.content
  if (!content) throw new Error('Ollama no devolvió un resultado utilizable.')
  return { value: JSON.parse(content), usage: { input_tokens: data.prompt_eval_count ?? 0, output_tokens: data.eval_count ?? 0, total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0) }, duration_ms: Math.max(0, Math.round(performance.now() - started)) }
}
async function ollamaVisionJson(system, prompt, imageBase64, schema) {
  const started = performance.now()
  const response = await fetch(`${ollamaUrl}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: ollamaModel, stream: false, think: false, format: schema, options: { temperature: 0 }, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt, images: [imageBase64] }] }) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? `Ollama respondió con estado ${response.status}.`)
  const content = data.message?.content
  if (!content) throw new Error('Ollama no devolvió un resultado utilizable.')
  return { value: JSON.parse(content), usage: { input_tokens: data.prompt_eval_count ?? 0, output_tokens: data.eval_count ?? 0, total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0) }, duration_ms: Math.max(0, Math.round(performance.now() - started)) }
}

async function generateForm(request) {
  const startedAt = new Date(); const startedMs = performance.now(); let requestedBy = null; let formId = null; let operationType = 'form_generation'
  try {
    const { caller, user } = await callerFor(request); requestedBy = user.id; await requirePermission(caller, 'forms.create')
    const body = await bodyOf(request); const message = body.message; formId = body.form_id || null; operationType = body.operation_type === 'form_edit' ? 'form_edit' : 'form_generation'
    if (!String(message ?? '').trim()) throw new Error('Escribe una instrucción.')
    const result = await ollamaJson('Genera formularios en español y devuelve únicamente JSON. Usa opciones solo para campos de selección. Usa geolocation para ubicaciones, identity_document para identificación y request_document_photo=true solo si se pide fotografía y extracción automática. Usa document_attachment para adjuntar PDF.', String(message), formSchema)
    await saveLlmOperation({ requestedBy, formId, operationType, status: 'succeeded', startedAt, startedMs, usage: result.usage })
    return { form: result.value }
  } catch (error) {
    await saveLlmOperation({ requestedBy, formId, operationType, status: 'failed', startedAt, startedMs, errorMessage: error instanceof Error ? error.message : 'Error inesperado.' })
    throw error
  }
}

async function analyzeSubmission(request) {
  const startedAt = new Date(); const startedMs = performance.now(); let submission = null; let requestedBy = null
  const saveRun = async (values) => {
    if (!submission) return null
    const usage = values.usage ?? {}
    const { data } = await admin.from('ai_analysis_runs').insert({ submission_id: submission.id, form_id: submission.form_id, requested_by: requestedBy, provider: 'ollama', model: ollamaModel, status: values.status, started_at: startedAt.toISOString(), completed_at: new Date().toISOString(), duration_ms: Math.max(0, Math.round(performance.now() - startedMs)), input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, total_tokens: usage.total_tokens ?? 0, estimated_cost_usd: null, suggested_status: values.analysis?.suggested_status, confidence: values.analysis?.confidence, observation: values.analysis?.observation, error_message: values.errorMessage }).select('id,duration_ms,input_tokens,output_tokens,total_tokens,estimated_cost_usd').single()
    return data
  }
  try {
    const { caller, user } = await callerFor(request); requestedBy = user.id
    const { submission_id } = await bodyOf(request); if (!submission_id) throw new Error('Falta el identificador de la respuesta.')
    const { data: visible, error } = await caller.from('form_submissions').select('id,form_id,status').eq('id', submission_id).single()
    if (error || !visible) throw new Error('No se encontró la respuesta o no tienes permiso para analizarla.')
    submission = visible
    const { data: attentionForm } = await admin.from('forms').select('requires_attention,ai_enabled').eq('id', submission.form_id).single()
    if (attentionForm?.requires_attention === false) throw new Error('Este formulario no requiere atención y no puede analizarse con inteligencia artificial.')
    if (submission.status !== 'submitted') throw new Error('Solo las respuestas en estado Ingresado pueden analizarse con inteligencia artificial.')
    if (attentionForm?.ai_enabled !== true) throw new Error('Este formulario no tiene habilitado el análisis con inteligencia artificial.')
    const [{ data: form }, { data: context }, { data: sections }, { data: answers }] = await Promise.all([
      admin.from('forms').select('name,description').eq('id', submission.form_id).single(),
      admin.from('form_contexts').select('objective,instructions,rules,restrictions,expected_output').eq('form_id', submission.form_id).eq('is_active', true).order('version', { ascending: false }).limit(1).maybeSingle(),
      admin.from('form_sections').select('id,title').eq('form_id', submission.form_id).order('position'),
      admin.from('submission_answers').select('field_id,value').eq('submission_id', submission.id),
    ])
    if (!context || ![context.objective, context.instructions, context.rules, context.restrictions, context.expected_output].every((value) => String(value ?? '').trim())) throw new Error('Este formulario debe tener un contexto IA activo y todos sus valores configurados.')
    const sectionIds = (sections ?? []).map((section) => section.id)
    const { data: fields } = sectionIds.length ? await admin.from('form_fields').select('id,label,field_type,section_id').in('section_id', sectionIds).order('position') : { data: [] }
    const result = await ollamaJson('Analiza las respuestas según el contexto y reglas del formulario. Propón aprobado o rechazado y explica los criterios en español. No inventes datos. Devuelve únicamente JSON.', { form, context, sections, fields, answers }, analysisSchema)
    const run = await saveRun({ status: 'succeeded', analysis: result.value, usage: result.usage })
    return { ...result.value, analysis_run_id: run?.id, metrics: run }
  } catch (error) { await saveRun({ status: 'failed', errorMessage: error instanceof Error ? error.message : 'Error inesperado.' }); throw error }
}

async function validateIdentityDocument(request) {
  const startedAt = new Date(); const startedMs = performance.now(); let formId = null; let usage = {}
  try {
    const body = await bodyOf(request)
    const shareToken = String(body.share_token ?? ''); const fieldId = String(body.field_id ?? ''); const imageBase64 = String(body.image_base64 ?? ''); const mimeType = String(body.mime_type ?? '')
    if (!shareToken || !fieldId || !imageBase64) throw new Error('Faltan datos para validar el documento.')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('El formato de imagen no es válido.')
    if (imageBase64.length > 5_600_000) throw new Error('La fotografía es demasiado grande.')
    const { data: form } = await admin.from('forms').select('id,visibility').eq('share_token', shareToken).eq('status', 'published').eq('is_active', true).maybeSingle()
    if (!form) throw new Error('El formulario no está disponible.'); formId = form.id
    if (form.visibility !== 'public') { const { caller } = await callerFor(request); await requirePermission(caller, 'forms.respond') }
    const { data: sections } = await admin.from('form_sections').select('id').eq('form_id', form.id)
    const sectionIds = (sections ?? []).map((section) => section.id)
    const { data: field } = sectionIds.length ? await admin.from('form_fields').select('id,field_type,config,is_active').eq('id', fieldId).in('section_id', sectionIds).maybeSingle() : { data: null }
    if (!field || !field.is_active || field.field_type !== 'identity_document' || field.config?.request_document_photo !== true) throw new Error('Esta pregunta no admite validación de documentos.')
    const result = await ollamaVisionJson('Analiza la fotografía como control de captura, no como autenticación legal. Acepta únicamente el FRENTE o página principal de un documento oficial. Para ser válido deben verse simultáneamente el retrato, tipo, número, nombres y apellidos. Marca cada visible_fields como true solo si el dato es directamente legible. No infieras datos ni uses códigos de barras del reverso. Si ves el reverso devuelve document_side=back y valid_document=false.', 'Comprueba que sea el frente completo del documento y extrae únicamente los datos visibles usando el JSON solicitado.', imageBase64, identityDocumentSchema)
    usage = result.usage
    const complete = [result.value.document_type, result.value.document_number, result.value.first_names, result.value.last_names].every((part) => String(part ?? '').trim())
    const allVisible = result.value.visible_fields && Object.values(result.value.visible_fields).length === 4 && Object.values(result.value.visible_fields).every(Boolean)
    const dpiNumberValid = !String(result.value.document_type ?? '').toUpperCase().includes('DPI') || String(result.value.document_number ?? '').replace(/\D/g, '').length === 13
    const acceptedFront = result.value.valid_document && result.value.status === 'valid_document' && result.value.document_side === 'front' && result.value.has_portrait === true && allVisible && complete && dpiNumberValid && Number(result.value.confidence) >= 0.85
    if (!acceptedFront) {
      result.value.valid_document = false; result.value.status = result.value.status === 'not_document' ? 'not_document' : 'unreadable'
      if (result.value.document_side === 'back') result.value.reason = 'Se capturó el reverso del documento. Debes fotografiar el frente donde aparecen el retrato y los datos personales.'
      else if (!dpiNumberValid) result.value.reason = 'El número de DPI no tiene los 13 dígitos requeridos o no es completamente legible.'
      else if (!result.value.reason) result.value.reason = 'No se observa el frente completo con retrato y todos los datos requeridos claramente legibles.'
    }
    await saveLlmOperation({ requestedBy: null, formId, operationType: 'identity_document_validation', status: 'succeeded', startedAt, startedMs, usage, metadata: { public_form: true }, allowAnonymous: true })
    return result.value
  } catch (error) {
    await saveLlmOperation({ requestedBy: null, formId, operationType: 'identity_document_validation', status: 'failed', startedAt, startedMs, usage, errorMessage: error instanceof Error ? error.message : 'Error inesperado.', metadata: { public_form: true }, allowAnonymous: true })
    throw error
  }
}

async function dashboardAssistant(request) {
  const startedAt = new Date(); const startedMs = performance.now(); let requestedBy = null; let question = ''; let classification = null; let usage = {}
  const logRun = async (status, answer, errorMessage) => { if (!requestedBy || !question) return; await Promise.all([admin.from('dashboard_assistant_runs').insert({ requested_by: requestedBy, question, intent: classification?.intent ?? 'error', is_supported: classification ? classification.intent !== 'unsupported' : false, answer, provider: 'ollama', model: ollamaModel, status, started_at: startedAt.toISOString(), completed_at: new Date().toISOString(), duration_ms: Math.max(0, Math.round(performance.now() - startedMs)), input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, total_tokens: usage.total_tokens ?? 0, estimated_cost_usd: null, error_message: errorMessage }), saveLlmOperation({ requestedBy, operationType: 'dashboard_assistant', status, startedAt, startedMs, usage, errorMessage, metadata: { intent: classification?.intent ?? 'error', supported: classification ? classification.intent !== 'unsupported' : false } })]) }
  try {
    const { caller, user } = await callerFor(request); requestedBy = user.id; await requirePermission(caller, 'dashboards.view')
    const body = await bodyOf(request); question = String(body?.question ?? '').trim()
    if (!question) throw new Error('Escribe una pregunta para consultar el dashboard.'); if (question.length > 500) throw new Error('La pregunta no puede superar los 500 caracteres.')
    const result = await ollamaJson(`Clasifica preguntas sobre un dashboard de formularios. Solo admite: último envío; conteo de respuestas; conteo por estado; pendientes por departamento; formulario más activo; formulario con mayor rechazo; tiempo promedio de decisión; formulario más lento; promedio de tokens; tokens por formulario; costo total estimado; duración promedio de IA; fallos de IA; coincidencia IA-humano; ayuda. No admitas datos personales, respuestas de texto, fotografías, predicciones, recomendaciones de contratación, SQL, cambios en datos ni temas externos. Si no coincide claramente, usa unsupported. Intenciones permitidas: ${intents.join(', ')}.`, question, dashboardClassificationSchema)
    classification = result.value; usage = result.usage
    if (classification.intent === 'unsupported') { const answer = 'No puedo responder esa pregunta porque está fuera de las métricas autorizadas del dashboard. Puedo ayudarte con actividad de formularios, estados, departamentos, tiempos de atención, tokens, costos y rendimiento de los análisis de IA.'; await logRun('succeeded', answer); return { supported: false, answer, intent: classification.intent, suggestions } }
    if (classification.intent === 'help') { const answer = 'Puedo consultar actividad de formularios, estados, carga por departamento, tiempos de decisión, consumo de tokens, costos estimados, duración y coincidencia de la IA con las decisiones humanas.'; await logRun('succeeded', answer); return { supported: true, answer, intent: classification.intent, suggestions } }
    const cutoff = periodCutoff(classification.period)
    const [{ data: forms = [], error: formError }, { data: submissionData = [], error: submissionError }, { data: departments = [], error: departmentError }, { data: aiData = [], error: aiError }] = await Promise.all([
      caller.from('forms').select('id,name'), applyCutoff(caller.from('form_submissions').select('id,form_id,status,submitted_at,decided_at').order('submitted_at', { ascending: false }).limit(5000), 'submitted_at', cutoff), caller.from('form_departments').select('form_id,department'), applyCutoff(caller.from('ai_analysis_runs').select('form_id,status,duration_ms,total_tokens,estimated_cost_usd,suggested_status,human_decision,started_at').limit(5000), 'started_at', cutoff),
    ])
    if (formError || submissionError || departmentError || aiError) throw new Error(formError?.message ?? submissionError?.message ?? departmentError?.message ?? aiError?.message ?? 'No fue posible consultar las métricas.')
    let submissions = submissionData; let aiRuns = aiData; const formMatch = findForm(forms, classification.form_name)
    if (classification.form_name && !formMatch) { const answer = `No encontré un formulario que coincida con “${classification.form_name}”. Prueba utilizando el nombre que aparece en la lista de formularios.`; await logRun('succeeded', answer); return { supported: true, answer, intent: classification.intent, suggestions } }
    if (formMatch) { submissions = submissions.filter((row) => row.form_id === formMatch.id); aiRuns = aiRuns.filter((row) => row.form_id === formMatch.id) }
    if (classification.status !== 'all') submissions = submissions.filter((row) => row.status === classification.status)
    const answer = answerMetric(classification.intent, submissions, aiRuns, new Map(forms.map((form) => [form.id, form.name])), departments, classification.period, formMatch?.name)
    await logRun('succeeded', answer); return { supported: true, answer, intent: classification.intent, period: classification.period, suggestions }
  } catch (error) { await logRun('failed', '', error instanceof Error ? error.message : 'Error inesperado.'); throw error }
}

const routes = { '/api/generate-form': generateForm, '/api/analyze-submission': analyzeSubmission, '/api/dashboard-assistant': dashboardAssistant, '/api/validate-identity-document': validateIdentityDocument }
const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin ?? frontendOrigins[0]
  if (request.method === 'OPTIONS') { response.writeHead(204, cors(origin)); return response.end() }
  if (request.method === 'GET' && request.url === '/health') return send(response, origin, 200, { ok: true, provider: 'ollama', model: ollamaModel })
  const handler = routes[request.url]
  if (request.method !== 'POST' || !handler) return send(response, origin, 404, { error: 'Ruta no encontrada.' })
  try { return send(response, origin, 200, await handler(request)) } catch (error) { const message = error instanceof Error ? error.message : 'Error inesperado.'; console.error(`[${request.url}]`, message); return send(response, origin, 500, { error: message }) }
})
server.listen(port, '127.0.0.1', () => console.log(`Backend local de IA listo en http://127.0.0.1:${port} (modelo: ${ollamaModel})`))
