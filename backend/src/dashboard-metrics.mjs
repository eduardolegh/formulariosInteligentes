export const intents = ['latest_submission', 'submission_count', 'count_by_status', 'pending_by_department', 'most_active_form', 'highest_rejection_form', 'average_decision_time', 'slowest_review_form', 'average_tokens', 'tokens_by_form', 'total_ai_cost', 'average_ai_duration', 'ai_failures', 'ai_human_agreement', 'help', 'unsupported']

export const suggestions = [
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

export const dashboardClassificationSchema = {
  type: 'object', additionalProperties: false,
  required: ['intent', 'period', 'status', 'form_name', 'reason'],
  properties: {
    intent: { type: 'string', enum: intents },
    period: { type: 'string', enum: ['7d', '30d', '90d', 'all'] },
    status: { type: 'string', enum: ['submitted', 'in_review', 'approved', 'rejected', 'all'] },
    form_name: { type: 'string' }, reason: { type: 'string' },
  },
}

export function periodCutoff(period) {
  if (period === 'all') return null
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

export function applyCutoff(query, column, cutoff) { return cutoff ? query.gte(column, cutoff) : query }
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const periodLabel = (period) => period === 'all' ? 'en todo el historial' : `en los últimos ${period.replace('d', '')} días`
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
const byForm = (rows) => { const groups = new Map(); rows.forEach((row) => groups.set(row.form_id, [...(groups.get(row.form_id) ?? []), row])); return groups }
const statusLabel = (status) => ({ submitted: 'Ingresado', in_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado' })[status] ?? status
const formatHours = (hours) => hours < 1 ? `${Math.round(hours * 60)} minutos` : hours < 24 ? `${hours.toFixed(1)} horas` : `${(hours / 24).toFixed(1)} días`

export function findForm(forms, formName) {
  return formName ? forms.find((form) => normalize(form.name).includes(normalize(formName)) || normalize(formName).includes(normalize(form.name))) : null
}

export function answerMetric(intent, submissions, aiRuns, names, departments, period, selectedName) {
  const scope = selectedName ? ` para “${selectedName}”` : ''; const when = periodLabel(period)
  if (intent === 'latest_submission') { const row = submissions[0]; return row ? `El último envío${scope} corresponde a “${names.get(row.form_id) ?? 'Formulario'}”, fue recibido el ${new Date(row.submitted_at).toLocaleString('es-GT')} y su estado es ${statusLabel(row.status)}.` : `No hay envíos registrados ${when}${scope}.` }
  if (intent === 'submission_count') return `Se registraron ${submissions.length} respuestas ${when}${scope}.`
  if (intent === 'count_by_status') { const counts = ['submitted', 'in_review', 'approved', 'rejected'].map((status) => `${statusLabel(status)}: ${submissions.filter((row) => row.status === status).length}`); return `La distribución ${when}${scope} es: ${counts.join(', ')}.` }
  if (intent === 'pending_by_department') { const pending = submissions.filter((row) => ['submitted', 'in_review'].includes(row.status)); const totals = new Map(); pending.forEach((row) => departments.filter((item) => item.form_id === row.form_id).forEach((item) => totals.set(item.department, (totals.get(item.department) ?? 0) + 1))); const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]; return top ? `El departamento con más solicitudes pendientes ${when} es ${top[0]}, con ${top[1]}.` : `No hay solicitudes pendientes asociadas a departamentos ${when}.` }
  if (intent === 'most_active_form') { const top = [...byForm(submissions).entries()].sort((a, b) => b[1].length - a[1].length)[0]; return top ? `El formulario con más actividad ${when} es “${names.get(top[0]) ?? 'Formulario'}”, con ${top[1].length} respuestas.` : `No hay actividad de formularios ${when}.` }
  if (intent === 'highest_rejection_form') { const candidates = [...byForm(submissions).entries()].map(([id, rows]) => ({ id, decisions: rows.filter((row) => ['approved', 'rejected'].includes(row.status)), rejected: rows.filter((row) => row.status === 'rejected').length })).filter((item) => item.decisions.length > 0).sort((a, b) => b.rejected / b.decisions.length - a.rejected / a.decisions.length); const top = candidates[0]; return top ? `“${names.get(top.id) ?? 'Formulario'}” tiene la mayor tasa de rechazo ${when}: ${Math.round(top.rejected / top.decisions.length * 100)}% (${top.rejected} de ${top.decisions.length} decisiones).` : `No hay decisiones suficientes para calcular rechazos ${when}.` }
  if (intent === 'average_decision_time') { const values = submissions.filter((row) => row.decided_at).map((row) => (new Date(row.decided_at).getTime() - new Date(row.submitted_at).getTime()) / 3_600_000); return values.length ? `El tiempo promedio de decisión${scope} ${when} es ${formatHours(average(values))}.` : `No hay decisiones con tiempo registrado ${when}${scope}.` }
  if (intent === 'slowest_review_form') { const values = [...byForm(submissions.filter((row) => row.decided_at)).entries()].map(([id, rows]) => ({ id, hours: average(rows.map((row) => (new Date(row.decided_at).getTime() - new Date(row.submitted_at).getTime()) / 3_600_000)) })).sort((a, b) => b.hours - a.hours); return values[0] ? `El formulario con mayor tiempo promedio de decisión ${when} es “${names.get(values[0].id) ?? 'Formulario'}”, con ${formatHours(values[0].hours)}.` : `No hay tiempos de decisión disponibles ${when}.` }
  const successful = aiRuns.filter((run) => run.status === 'succeeded')
  if (intent === 'average_tokens') return successful.length ? `Cada análisis${scope} consumió en promedio ${Math.round(average(successful.map((run) => run.total_tokens))).toLocaleString('es-GT')} tokens ${when}.` : `No hay análisis exitosos registrados ${when}${scope}.`
  if (intent === 'tokens_by_form') { const values = [...byForm(successful).entries()].map(([id, rows]) => ({ id, average: average(rows.map((row) => row.total_tokens)) })).sort((a, b) => b.average - a.average); return values.length ? `El mayor promedio corresponde a “${names.get(values[0].id) ?? 'Formulario'}”, con ${Math.round(values[0].average).toLocaleString('es-GT')} tokens por análisis ${when}.` : `No hay consumo de tokens registrado ${when}.` }
  if (intent === 'total_ai_cost') { const priced = aiRuns.filter((run) => run.estimated_cost_usd != null); return priced.length ? `El costo estimado de IA${scope} ${when} es de $${priced.reduce((sum, run) => sum + Number(run.estimated_cost_usd), 0).toFixed(4)} USD.` : `No hay costos calculados ${when}. En ejecuciones locales con Ollama el costo del proveedor es cero, pero el consumo eléctrico y del equipo no se estima automáticamente.` }
  if (intent === 'average_ai_duration') return successful.length ? `La duración promedio de los análisis${scope} ${when} es ${(average(successful.map((run) => run.duration_ms)) / 1000).toFixed(1)} segundos.` : `No hay análisis exitosos registrados ${when}${scope}.`
  if (intent === 'ai_failures') return `Se registraron ${aiRuns.filter((run) => run.status === 'failed').length} análisis fallidos ${when}${scope}.`
  if (intent === 'ai_human_agreement') { const comparable = successful.filter((run) => run.human_decision && run.suggested_status); const matches = comparable.filter((run) => run.human_decision === run.suggested_status).length; return comparable.length ? `La recomendación de IA coincidió con la decisión humana en ${Math.round(matches / comparable.length * 100)}% de los casos (${matches} de ${comparable.length}) ${when}${scope}.` : `No hay suficientes análisis con decisión humana para calcular la coincidencia ${when}${scope}.` }
  return 'No puedo responder esa pregunta con las métricas autorizadas.'
}
