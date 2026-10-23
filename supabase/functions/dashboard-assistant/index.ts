import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const intents = ['latest_submission', 'submission_count', 'count_by_status', 'pending_by_department', 'most_active_form', 'highest_rejection_form', 'average_decision_time', 'slowest_review_form', 'average_tokens', 'tokens_by_form', 'total_ai_cost', 'average_ai_duration', 'ai_failures', 'ai_human_agreement', 'help', 'unsupported'] as const
type Intent = typeof intents[number]
type Classification = { intent: Intent; period: '7d' | '30d' | '90d' | 'all'; status: 'submitted' | 'in_review' | 'approved' | 'rejected' | 'all'; form_name: string; reason: string }
type Submission = { id: string; form_id: string; status: string; submitted_at: string; decided_at: string | null }
type Form = { id: string; name: string }
type AiRun = { form_id: string; status: string; duration_ms: number; total_tokens: number; estimated_cost_usd: number | null; suggested_status: string | null; human_decision: string | null; started_at: string }

const suggestions = [
  '¿Cuál fue el último formulario enviado?',
  '¿Cuántas respuestas recibimos en los últimos 30 días?',
  '¿Cómo se distribuyen las respuestas por estado?',
  '¿Qué departamento tiene más solicitudes pendientes?',
  '¿Cuál es el formulario con mayor actividad?',
  '¿Qué formulario tiene la tasa de rechazo más alta?',
  '¿Cuál es el tiempo promedio de decisión?',
  '¿Cuántos tokens consume en promedio cada análisis?',
  '¿Cuál es el costo estimado de IA este mes?',
  '¿Qué porcentaje de recomendaciones coincide con la decisión humana?',
]

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const startedAt = new Date()
  const startedMs = performance.now()
  let admin: ReturnType<typeof createClient> | null = null
  let requestedBy: string | null = null
  let question = ''
  let classification: Classification | null = null
  let usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } = {}
  const model = Deno.env.get('OPENAI_DASHBOARD_MODEL') ?? 'gpt-5-nano'

  async function logRun(status: 'succeeded' | 'failed', answer: string, errorMessage?: string) {
    if (!admin || !requestedBy || !question) return
    const inputRateValue = Deno.env.get('OPENAI_INPUT_COST_PER_MILLION')
    const outputRateValue = Deno.env.get('OPENAI_OUTPUT_COST_PER_MILLION')
    const inputRate = Number(inputRateValue); const outputRate = Number(outputRateValue)
    const canEstimate = Boolean(inputRateValue && outputRateValue) && Number.isFinite(inputRate) && Number.isFinite(outputRate)
    const inputTokens = usage.input_tokens ?? 0; const outputTokens = usage.output_tokens ?? 0
    await admin.from('dashboard_assistant_runs').insert({
      requested_by: requestedBy, question, intent: classification?.intent ?? 'error', is_supported: classification ? !['unsupported'].includes(classification.intent) : false,
      answer, provider: 'openai', model, status, started_at: startedAt.toISOString(), completed_at: new Date().toISOString(), duration_ms: Math.max(0, Math.round(performance.now() - startedMs)),
      input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: usage.total_tokens ?? inputTokens + outputTokens,
      estimated_cost_usd: canEstimate ? (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000 : null, error_message: errorMessage,
    })
  }

  try {
    const body = await request.json(); question = String(body?.question ?? '').trim()
    if (!question) throw new Error('Escribe una pregunta para consultar el dashboard.')
    if (question.length > 500) throw new Error('La pregunta no puede superar los 500 caracteres.')
    const authorization = request.headers.get('Authorization')
    if (!authorization) throw new Error('Debes iniciar sesión para utilizar el asistente.')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
    const { data: userData, error: userError } = await caller.auth.getUser()
    if (userError || !userData.user) throw new Error('La sesión no es válida o expiró.')
    requestedBy = userData.user.id
    const { data: allowed } = await caller.rpc('has_permission', { permission_key: 'dashboards.view' })
    if (!allowed) throw new Error('No tienes permiso para consultar indicadores del dashboard.')
    admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    if (!Deno.env.get('OPENAI_API_KEY')) throw new Error('OPENAI_API_KEY no está configurada en Supabase.')

    const schema = { type: 'object', additionalProperties: false, required: ['intent', 'period', 'status', 'form_name', 'reason'], properties: {
      intent: { type: 'string', enum: intents }, period: { type: 'string', enum: ['7d', '30d', '90d', 'all'] }, status: { type: 'string', enum: ['submitted', 'in_review', 'approved', 'rejected', 'all'] }, form_name: { type: 'string' }, reason: { type: 'string' },
    } }
    const aiResponse = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      model,
      instructions: `Clasifica preguntas sobre un dashboard de formularios. Solo admite estos tipos: último envío; conteo de respuestas; conteo por estado; pendientes por departamento; formulario más activo; formulario con mayor rechazo; tiempo promedio de decisión; formulario más lento; promedio de tokens; tokens por formulario; costo total estimado; duración promedio de IA; fallos de IA; coincidencia IA-humano; ayuda. No admitas datos personales, lectura de respuestas de texto, fotografías, predicciones, recomendaciones de contratación, SQL, cambios en datos ni temas externos. Si no coincide claramente, usa unsupported. Extrae período, estado y nombre del formulario cuando existan. Devuelve JSON.`,
      input: question,
      text: { format: { type: 'json_schema', name: 'dashboard_intent', strict: true, schema } },
    }) })
    const aiData = await aiResponse.json(); usage = aiData.usage ?? {}
    if (!aiResponse.ok) throw new Error(aiData.error?.message ?? 'No se pudo interpretar la pregunta.')
    const outputText = aiData.output?.find((item: { type: string }) => item.type === 'message')?.content?.find((item: { type: string }) => item.type === 'output_text')?.text
    if (!outputText) throw new Error('La IA no devolvió una clasificación utilizable.')
    classification = JSON.parse(outputText) as Classification

    if (classification.intent === 'unsupported') {
      const answer = 'No puedo responder esa pregunta porque está fuera de las métricas autorizadas del dashboard. Puedo ayudarte con actividad de formularios, estados, departamentos, tiempos de atención, tokens, costos y rendimiento de los análisis de IA.'
      await logRun('succeeded', answer)
      return json({ supported: false, answer, intent: classification.intent, suggestions })
    }
    if (classification.intent === 'help') {
      const answer = 'Puedo consultar actividad de formularios, estados, carga por departamento, tiempos de decisión, consumo de tokens, costos estimados, duración y coincidencia de la IA con las decisiones humanas.'
      await logRun('succeeded', answer)
      return json({ supported: true, answer, intent: classification.intent, suggestions })
    }

    const cutoff = periodCutoff(classification.period)
    const [{ data: formData, error: formError }, { data: submissionData, error: submissionError }, { data: departmentData, error: departmentError }, { data: aiRunsData, error: aiError }] = await Promise.all([
      caller.from('forms').select('id,name'),
      applyCutoff(caller.from('form_submissions').select('id,form_id,status,submitted_at,decided_at').order('submitted_at', { ascending: false }).limit(5000), 'submitted_at', cutoff),
      caller.from('form_departments').select('form_id,department'),
      applyCutoff(caller.from('ai_analysis_runs').select('form_id,status,duration_ms,total_tokens,estimated_cost_usd,suggested_status,human_decision,started_at').limit(5000), 'started_at', cutoff),
    ])
    if (formError || submissionError || departmentError || aiError) throw new Error(formError?.message ?? submissionError?.message ?? departmentError?.message ?? aiError?.message ?? 'No fue posible consultar las métricas.')
    const forms = (formData ?? []) as Form[]; let submissions = (submissionData ?? []) as Submission[]; let aiRuns = (aiRunsData ?? []) as AiRun[]
    const formMatch = classification.form_name ? forms.find((form) => normalize(form.name).includes(normalize(classification!.form_name)) || normalize(classification!.form_name).includes(normalize(form.name))) : null
    if (classification.form_name && !formMatch) {
      const answer = `No encontré un formulario que coincida con “${classification.form_name}”. Prueba utilizando el nombre que aparece en la lista de formularios.`
      await logRun('succeeded', answer); return json({ supported: true, answer, intent: classification.intent, suggestions })
    }
    if (formMatch) { submissions = submissions.filter((item) => item.form_id === formMatch.id); aiRuns = aiRuns.filter((item) => item.form_id === formMatch.id) }
    if (classification.status !== 'all') submissions = submissions.filter((item) => item.status === classification!.status)
    const names = new Map(forms.map((form) => [form.id, form.name])); const departments = (departmentData ?? []) as { form_id: string; department: string }[]
    const answer = answerMetric(classification.intent, submissions, aiRuns, names, departments, classification.period, formMatch?.name)
    await logRun('succeeded', answer)
    return json({ supported: true, answer, intent: classification.intent, period: classification.period, suggestions })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado.'
    await logRun('failed', '', message)
    return json({ error: message }, 500)
  }
})

function applyCutoff(query: any, column: string, cutoff: string | null) { return cutoff ? query.gte(column, cutoff) : query }
function periodCutoff(period: Classification['period']) { if (period === 'all') return null; const days = period === '7d' ? 7 : period === '30d' ? 30 : 90; return new Date(Date.now() - days * 86_400_000).toISOString() }
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() }
function periodLabel(period: Classification['period']) { return period === 'all' ? 'en todo el historial' : `en los últimos ${period.replace('d', '')} días` }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 }
function byForm<T extends { form_id: string }>(rows: T[]) { const counts = new Map<string, T[]>(); rows.forEach((row) => counts.set(row.form_id, [...(counts.get(row.form_id) ?? []), row])); return counts }
function answerMetric(intent: Intent, submissions: Submission[], aiRuns: AiRun[], names: Map<string, string>, departments: { form_id: string; department: string }[], period: Classification['period'], selectedName?: string) {
  const scope = selectedName ? ` para “${selectedName}”` : ''; const when = periodLabel(period)
  if (intent === 'latest_submission') { const row = submissions[0]; return row ? `El último envío${scope} corresponde a “${names.get(row.form_id) ?? 'Formulario'}”, fue recibido el ${new Date(row.submitted_at).toLocaleString('es-GT')} y su estado es ${statusLabel(row.status)}.` : `No hay envíos registrados ${when}${scope}.` }
  if (intent === 'submission_count') return `Se registraron ${submissions.length} respuestas ${when}${scope}.`
  if (intent === 'count_by_status') { const counts = ['submitted', 'in_review', 'approved', 'rejected'].map((status) => `${statusLabel(status)}: ${submissions.filter((row) => row.status === status).length}`); return `La distribución ${when}${scope} es: ${counts.join(', ')}.` }
  if (intent === 'pending_by_department') { const pending = submissions.filter((row) => ['submitted', 'in_review'].includes(row.status)); const totals = new Map<string, number>(); pending.forEach((row) => departments.filter((item) => item.form_id === row.form_id).forEach((item) => totals.set(item.department, (totals.get(item.department) ?? 0) + 1))); const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]; return top ? `El departamento con más solicitudes pendientes ${when} es ${top[0]}, con ${top[1]}.` : `No hay solicitudes pendientes asociadas a departamentos ${when}.` }
  if (intent === 'most_active_form') { const top = [...byForm(submissions).entries()].sort((a, b) => b[1].length - a[1].length)[0]; return top ? `El formulario con más actividad ${when} es “${names.get(top[0]) ?? 'Formulario'}”, con ${top[1].length} respuestas.` : `No hay actividad de formularios ${when}.` }
  if (intent === 'highest_rejection_form') { const candidates = [...byForm(submissions).entries()].map(([id, rows]) => ({ id, decisions: rows.filter((row) => ['approved', 'rejected'].includes(row.status)), rejected: rows.filter((row) => row.status === 'rejected').length })).filter((item) => item.decisions.length > 0).sort((a, b) => b.rejected / b.decisions.length - a.rejected / a.decisions.length); const top = candidates[0]; return top ? `“${names.get(top.id) ?? 'Formulario'}” tiene la mayor tasa de rechazo ${when}: ${Math.round(top.rejected / top.decisions.length * 100)}% (${top.rejected} de ${top.decisions.length} decisiones).` : `No hay decisiones suficientes para calcular rechazos ${when}.` }
  if (intent === 'average_decision_time') { const values = submissions.filter((row) => row.decided_at).map((row) => (new Date(row.decided_at!).getTime() - new Date(row.submitted_at).getTime()) / 3_600_000); return values.length ? `El tiempo promedio de decisión${scope} ${when} es ${formatHours(average(values))}.` : `No hay decisiones con tiempo registrado ${when}${scope}.` }
  if (intent === 'slowest_review_form') { const values = [...byForm(submissions.filter((row) => row.decided_at)).entries()].map(([id, rows]) => ({ id, hours: average(rows.map((row) => (new Date(row.decided_at!).getTime() - new Date(row.submitted_at).getTime()) / 3_600_000)) })).sort((a, b) => b.hours - a.hours); return values[0] ? `El formulario con mayor tiempo promedio de decisión ${when} es “${names.get(values[0].id) ?? 'Formulario'}”, con ${formatHours(values[0].hours)}.` : `No hay tiempos de decisión disponibles ${when}.` }
  const successful = aiRuns.filter((run) => run.status === 'succeeded')
  if (intent === 'average_tokens') return successful.length ? `Cada análisis${scope} consumió en promedio ${Math.round(average(successful.map((run) => run.total_tokens))).toLocaleString('es-GT')} tokens ${when}.` : `No hay análisis exitosos registrados ${when}${scope}.`
  if (intent === 'tokens_by_form') { const values = [...byForm(successful).entries()].map(([id, rows]) => ({ id, average: average(rows.map((row) => row.total_tokens)) })).sort((a, b) => b.average - a.average); return values.length ? `El mayor promedio corresponde a “${names.get(values[0].id) ?? 'Formulario'}”, con ${Math.round(values[0].average).toLocaleString('es-GT')} tokens por análisis ${when}.` : `No hay consumo de tokens registrado ${when}.` }
  if (intent === 'total_ai_cost') { const priced = aiRuns.filter((run) => run.estimated_cost_usd != null); return priced.length ? `El costo estimado de IA${scope} ${when} es de $${priced.reduce((sum, run) => sum + Number(run.estimated_cost_usd), 0).toFixed(4)} USD.` : `No hay costos calculados ${when}. Verifica que las tarifas por millón de tokens estén configuradas.` }
  if (intent === 'average_ai_duration') return successful.length ? `La duración promedio de los análisis${scope} ${when} es ${(average(successful.map((run) => run.duration_ms)) / 1000).toFixed(1)} segundos.` : `No hay análisis exitosos registrados ${when}${scope}.`
  if (intent === 'ai_failures') return `Se registraron ${aiRuns.filter((run) => run.status === 'failed').length} análisis fallidos ${when}${scope}.`
  if (intent === 'ai_human_agreement') { const comparable = successful.filter((run) => run.human_decision && run.suggested_status); const matches = comparable.filter((run) => run.human_decision === run.suggested_status).length; return comparable.length ? `La recomendación de IA coincidió con la decisión humana en ${Math.round(matches / comparable.length * 100)}% de los casos (${matches} de ${comparable.length}) ${when}${scope}.` : `No hay suficientes análisis con decisión humana para calcular la coincidencia ${when}${scope}.` }
  return 'No puedo responder esa pregunta con las métricas autorizadas.'
}
function statusLabel(status: string) { return ({ submitted: 'Ingresado', in_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado' } as Record<string, string>)[status] ?? status }
function formatHours(hours: number) { if (hours < 1) return `${Math.round(hours * 60)} minutos`; if (hours < 24) return `${hours.toFixed(1)} horas`; return `${(hours / 24).toFixed(1)} días` }
