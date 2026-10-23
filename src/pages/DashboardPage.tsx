import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './DashboardPage.css'
import { DashboardAssistant } from './DashboardAssistant'
import { SubmissionMap, type SubmissionMapPoint } from './SubmissionMap'

type FormRow = { id: string; name: string; status: string }
type Submission = { id: string; form_id: string; status: string; submitted_at: string; review_started_at: string | null; decided_at: string | null; latitude: number | null; longitude: number | null; location_accuracy_m: number | null }
type FormDepartment = { form_id: string; department: string }
type AiRun = { id: string; submission_id: string; form_id: string; status: 'succeeded' | 'failed'; provider: string; model: string; duration_ms: number; total_tokens: number; estimated_cost_usd: number | null; suggested_status: string | null; human_decision: string | null; started_at: string }
type Field = { id: string; label: string; field_type: string }
type Answer = { submission_id: string; field_id: string; value: unknown }
type AssistantRun = { id: string; status: 'succeeded' | 'failed'; is_supported: boolean; total_tokens: number; estimated_cost_usd: number | null; duration_ms: number; created_at: string }
type BackofficeActivity = { user_id: string; full_name: string; department: string; submission_id: string | null; action_status: string | null; action_at: string | null }

const statusLabels: Record<string, string> = { submitted: 'Ingresado', in_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', completed: 'Completado' }
const colors: Record<string, string> = { submitted: '#4d91d9', in_review: '#dfaa43', approved: '#42a37d', rejected: '#d76570', completed: '#7c70c8' }

export function DashboardPage() {
  const [forms, setForms] = useState<FormRow[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [formDepartments, setFormDepartments] = useState<FormDepartment[]>([])
  const [aiRuns, setAiRuns] = useState<AiRun[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [assistantRuns, setAssistantRuns] = useState<AssistantRun[]>([])
  const [backofficeActivity, setBackofficeActivity] = useState<BackofficeActivity[]>([])
  const [formId, setFormId] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('')
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [referenceTime] = useState(() => Date.now())

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      const [formsResult, submissionsResult, departmentsResult, aiResult, assistantResult, backofficeResult] = await Promise.all([
        supabase.from('forms').select('id,name,status').order('name'),
        supabase.from('form_submissions').select('id,form_id,status,submitted_at,review_started_at,decided_at,latitude,longitude,location_accuracy_m').order('submitted_at'),
        supabase.from('form_departments').select('form_id,department'),
        supabase.from('ai_analysis_runs').select('id,submission_id,form_id,status,provider,model,duration_ms,total_tokens,estimated_cost_usd,suggested_status,human_decision,started_at').order('started_at'),
        supabase.from('dashboard_assistant_runs').select('id,status,is_supported,total_tokens,estimated_cost_usd,duration_ms,created_at').order('created_at'),
        supabase.rpc('get_backoffice_dashboard_activity'),
      ])
      if (!mounted) return
      setForms((formsResult.data as FormRow[] | null) ?? [])
      setSubmissions((submissionsResult.data as Submission[] | null) ?? [])
      setFormDepartments((departmentsResult.data as FormDepartment[] | null) ?? [])
      setAiRuns((aiResult.data as AiRun[] | null) ?? [])
      setAssistantRuns((assistantResult.data as AssistantRun[] | null) ?? [])
      setBackofficeActivity((backofficeResult.data as BackofficeActivity[] | null) ?? [])
      setError(formsResult.error?.message ?? submissionsResult.error?.message ?? departmentsResult.error?.message ?? aiResult.error?.message ?? assistantResult.error?.message ?? backofficeResult.error?.message ?? '')
      setLoading(false)
    }
    void load()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadAnswers() {
      setFields([]); setAnswers([])
      if (!formId) return
      const { data: sections, error: sectionError } = await supabase.from('form_sections').select('id').eq('form_id', formId)
      const sectionIds = (sections ?? []).map((section) => section.id)
      const fieldResult = sectionIds.length
        ? await supabase.from('form_fields').select('id,label,field_type').in('section_id', sectionIds).eq('is_active', true).order('position')
        : { data: [], error: null }
      const submissionIds = submissions.filter((item) => item.form_id === formId).map((item) => item.id)
      const answerResult = submissionIds.length
        ? await supabase.from('submission_answers').select('submission_id,field_id,value').in('submission_id', submissionIds)
        : { data: [], error: null }
      if (!mounted) return
      setFields((fieldResult.data as Field[] | null) ?? [])
      setAnswers((answerResult.data as Answer[] | null) ?? [])
      setError(sectionError?.message ?? fieldResult.error?.message ?? answerResult.error?.message ?? '')
    }
    void loadAnswers()
    return () => { mounted = false }
  }, [formId, submissions])

  const departments = useMemo(() => [...new Set(formDepartments.map((item) => item.department))].sort(), [formDepartments])
  const filtered = useMemo(() => {
    const cutoff = days === 'all' ? null : referenceTime - Number(days) * 86_400_000
    const departmentForms = department ? new Set(formDepartments.filter((item) => item.department === department).map((item) => item.form_id)) : null
    return submissions.filter((item) => (!cutoff || new Date(item.submitted_at).getTime() >= cutoff) && (!formId || item.form_id === formId) && (!status || item.status === status) && (!departmentForms || departmentForms.has(item.form_id)))
  }, [days, department, formDepartments, formId, referenceTime, status, submissions])
  const filteredIds = useMemo(() => new Set(filtered.map((item) => item.id)), [filtered])
  const filteredAi = useMemo(() => aiRuns.filter((run) => filteredIds.has(run.submission_id)), [aiRuns, filteredIds])
  const assistantCutoff = days === 'all' ? 0 : referenceTime - Number(days) * 86_400_000
  const filteredAssistant = assistantRuns.filter((run) => new Date(run.created_at).getTime() >= assistantCutoff)
  const assistantTokens = filteredAssistant.reduce((sum, run) => sum + run.total_tokens, 0)
  const assistantCost = filteredAssistant.reduce((sum, run) => sum + Number(run.estimated_cost_usd ?? 0), 0)
  const assistantHasCost = filteredAssistant.some((run) => run.estimated_cost_usd != null)
  const decided = filtered.filter((item) => item.status === 'approved' || item.status === 'rejected')
  const approved = filtered.filter((item) => item.status === 'approved').length
  const pending = filtered.filter((item) => item.status === 'submitted' || item.status === 'in_review').length
  const averageDecisionHours = average(filtered.filter((item) => item.decided_at).map((item) => (new Date(item.decided_at!).getTime() - new Date(item.submitted_at).getTime()) / 3_600_000))
  const statusCounts = Object.keys(statusLabels).map((key) => ({ key, label: statusLabels[key], value: filtered.filter((item) => item.status === key).length }))
  const maxStatus = Math.max(1, ...statusCounts.map((item) => item.value))

  const trend = useMemo(() => {
    const count = days === '7' ? 7 : days === '30' ? 14 : 18
    const result: { key: string; label: string; value: number }[] = []
    for (let index = count - 1; index >= 0; index -= 1) {
      const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - index)
      const key = localDateKey(date)
      result.push({ key, label: date.toLocaleDateString('es-GT', { day: '2-digit', month: 'short' }), value: filtered.filter((item) => localDateKey(new Date(item.submitted_at)) === key).length })
    }
    return result
  }, [days, filtered])
  const maxTrend = Math.max(1, ...trend.map((item) => item.value))

  const formActivity = forms.map((form) => {
    const rows = filtered.filter((item) => item.form_id === form.id)
    const decisions = rows.filter((item) => ['approved', 'rejected'].includes(item.status))
    return { ...form, total: rows.length, pending: rows.filter((item) => ['submitted', 'in_review'].includes(item.status)).length, approved: rows.filter((item) => item.status === 'approved').length, rejected: rows.filter((item) => item.status === 'rejected').length, rate: decisions.length ? rows.filter((item) => item.status === 'approved').length / decisions.length * 100 : 0 }
  }).filter((item) => item.total > 0).sort((a, b) => b.total - a.total)

  const departmentActivity = departments.map((name) => {
    const ids = new Set(formDepartments.filter((item) => item.department === name).map((item) => item.form_id))
    const rows = filtered.filter((item) => ids.has(item.form_id))
    return { name, total: rows.length, pending: rows.filter((item) => ['submitted', 'in_review'].includes(item.status)).length, approved: rows.filter((item) => item.status === 'approved').length, rejected: rows.filter((item) => item.status === 'rejected').length }
  }).filter((item) => item.total > 0).sort((a, b) => b.pending - a.pending)

  const successfulAi = filteredAi.filter((run) => run.status === 'succeeded')
  const comparedAi = successfulAi.filter((run) => run.human_decision && run.suggested_status)
  const agreement = comparedAi.length ? comparedAi.filter((run) => run.human_decision === run.suggested_status).length / comparedAi.length * 100 : 0
  const oldPending = filtered.filter((item) => ['submitted', 'in_review'].includes(item.status) && referenceTime - new Date(item.submitted_at).getTime() > 3 * 86_400_000)
  const selectedForm = forms.find((item) => item.id === formId)
  const mapPoints: SubmissionMapPoint[] = filtered.filter((item) => item.latitude != null && item.longitude != null).map((item) => ({ id: item.id, latitude: item.latitude!, longitude: item.longitude!, accuracy: item.location_accuracy_m, submittedAt: item.submitted_at, formName: forms.find((form) => form.id === item.form_id)?.name ?? 'Formulario', status: item.status }))
  const backofficePerformance = useMemo(() => {
    const users = new Map<string, { id: string; name: string; department: string }>()
    for (const activity of backofficeActivity) users.set(activity.user_id, { id: activity.user_id, name: activity.full_name, department: activity.department })
    const relevantActions = backofficeActivity.filter((item) => item.submission_id && item.action_at && filteredIds.has(item.submission_id))
    const responsibleBySubmission = new Map<string, BackofficeActivity>()
    for (const action of relevantActions) {
      const current = responsibleBySubmission.get(action.submission_id!)
      if (!current || new Date(action.action_at!).getTime() > new Date(current.action_at!).getTime()) responsibleBySubmission.set(action.submission_id!, action)
    }
    return [...users.values()].map((user) => {
      const assignedIds = [...responsibleBySubmission.entries()].filter(([, action]) => action.user_id === user.id).map(([submissionId]) => submissionId)
      const assigned = filtered.filter((item) => assignedIds.includes(item.id))
      const responseHours = assigned.map((submission) => {
        const firstAction = relevantActions.filter((action) => action.user_id === user.id && action.submission_id === submission.id).sort((a, b) => new Date(a.action_at!).getTime() - new Date(b.action_at!).getTime())[0]
        return firstAction ? Math.max(0, (new Date(firstAction.action_at!).getTime() - new Date(submission.submitted_at).getTime()) / 3_600_000) : null
      }).filter((value): value is number => value != null)
      return { ...user, total: assigned.length, averageHours: average(responseHours), counts: Object.fromEntries(Object.keys(statusLabels).map((key) => [key, assigned.filter((item) => item.status === key).length])) }
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [backofficeActivity, filtered, filteredIds])

  if (loading) return <div className="panel dashboard-loading">Preparando indicadores…</div>
  return <section className="module-page dashboard-page">
    <div className="module-heading dashboard-heading"><div><p className="eyebrow">ANÁLISIS OPERATIVO</p><h1>Dashboard de formularios</h1><p>Actividad, tiempos de atención y desempeño de los análisis inteligentes.</p></div><span className="dashboard-live"><i /> Datos actualizados</span></div>
    {error && <div className="error-banner">No se pudieron cargar todos los indicadores: {error}</div>}
    <div className="panel dashboard-filters">
      <label>Período<select value={days} onChange={(event) => setDays(event.target.value)}><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="all">Todo el historial</option></select></label>
      <label>Formulario<select value={formId} onChange={(event) => setFormId(event.target.value)}><option value="">Todos</option>{forms.map((form) => <option key={form.id} value={form.id}>{form.name}</option>)}</select></label>
      <label>Departamento<select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Todos</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="text-button" type="button" onClick={() => { setDays('30'); setFormId(''); setDepartment(''); setStatus('') }}>Limpiar filtros</button>
    </div>

    <div className="dashboard-kpis">
      <Metric label="Respuestas" value={filtered.length.toLocaleString('es-GT')} detail="recibidas en el período" tone="blue" />
      <Metric label="Pendientes" value={pending.toLocaleString('es-GT')} detail={oldPending.length ? `${oldPending.length} con más de 3 días` : 'sin casos atrasados'} tone="amber" />
      <Metric label="Aprobación" value={decided.length ? `${Math.round(approved / decided.length * 100)}%` : '—'} detail={`${decided.length} decisiones registradas`} tone="green" />
      <Metric label="Tiempo de decisión" value={formatHours(averageDecisionHours)} detail="desde el ingreso" tone="violet" />
    </div>

    <div className="dashboard-grid">
      <article className="panel dashboard-panel dashboard-wide"><PanelTitle title="Respuestas recibidas" subtitle="Actividad diaria del período seleccionado" /><div className="trend-chart">{trend.map((item) => <div className="trend-column" key={item.key} title={`${item.label}: ${item.value}`}><span>{item.value || ''}</span><i style={{ height: item.value ? `${Math.max(4, item.value / maxTrend * 100)}%` : 0 }} /><small>{item.label}</small></div>)}</div></article>
      <article className="panel dashboard-panel"><PanelTitle title="Distribución por estado" subtitle={`${filtered.length} respuestas`} /><div className="status-chart">{statusCounts.map((item) => <button key={item.key} onClick={() => setStatus(status === item.key ? '' : item.key)} type="button"><span><i style={{ background: colors[item.key] }} />{item.label}<b>{item.value}</b></span><em><i style={{ width: `${item.value / maxStatus * 100}%`, background: colors[item.key] }} /></em></button>)}</div></article>
    </div>

    <article className="panel dashboard-panel dashboard-map-panel"><div className="dashboard-map-heading"><PanelTitle title="Origen de las respuestas" subtitle={`${mapPoints.length} de ${filtered.length} respuestas compartieron ubicación`} /><span>La ubicación solo se registra con autorización del usuario.</span></div>{mapPoints.length ? <SubmissionMap points={mapPoints} /> : <div className="dashboard-map-empty"><strong>Sin ubicaciones para mostrar</strong><p>Los nuevos envíos aparecerán aquí cuando el usuario decida compartir la ubicación de su dispositivo.</p></div>}</article>

    <div className="dashboard-grid dashboard-tables">
      <article className="panel dashboard-panel dashboard-wide"><PanelTitle title="Actividad por formulario" subtitle="Volumen y resultado de las decisiones" /><div className="dashboard-table"><div className="dashboard-table-row head"><span>Formulario</span><span>Total</span><span>Pendientes</span><span>Aprobadas</span><span>Rechazadas</span><span>Aprobación</span></div>{formActivity.slice(0, 8).map((item) => <div className="dashboard-table-row" key={item.id}><button onClick={() => setFormId(item.id)} type="button">{item.name}</button><span>{item.total}</span><span>{item.pending}</span><span>{item.approved}</span><span>{item.rejected}</span><strong>{Math.round(item.rate)}%</strong></div>)}{!formActivity.length && <Empty text="No hay actividad para los filtros seleccionados." />}</div></article>
      <article className="panel dashboard-panel"><PanelTitle title="Carga por departamento" subtitle="Casos que requieren atención" /><div className="department-list">{departmentActivity.slice(0, 7).map((item) => <button key={item.name} type="button" onClick={() => setDepartment(item.name)}><span><strong>{item.name}</strong><small>{item.total} respuestas</small></span><em>{item.pending} pendientes</em></button>)}{!departmentActivity.length && <Empty text="Sin actividad departamental." />}</div></article>
    </div>

    <article className="panel dashboard-panel backoffice-panel"><div className="backoffice-heading"><PanelTitle title="Desempeño de BackOffice" subtitle="Usuarios activos y respuestas gestionadas en el período" /><small>Responsable: último usuario que movió el estado · Tiempo: ingreso hasta su primera gestión</small></div><div className="backoffice-table"><div className="backoffice-row head"><span>Usuario</span><span>Atendidos</span><span>Tiempo promedio</span><span>Ingresados</span><span>En revisión</span><span>Aprobados</span><span>Rechazados</span><span>Finalizados</span></div>{backofficePerformance.map((item) => <div className="backoffice-row" key={item.id}><span><strong>{item.name}</strong><small>{item.department}</small></span><b>{item.total}</b><span>{item.total ? formatHours(item.averageHours) : '—'}</span><span>{item.counts.submitted}</span><span>{item.counts.in_review}</span><span className="backoffice-approved">{item.counts.approved}</span><span className="backoffice-rejected">{item.counts.rejected}</span><span>{item.counts.completed}</span></div>)}{!backofficePerformance.length && <Empty text="No hay usuarios BackOffice activos." />}</div></article>

    <article className="panel dashboard-panel attention-panel"><PanelTitle title="Requieren atención" subtitle="Señales que pueden afectar la operación" /><div className="attention-grid"><AlertCard tone={oldPending.length ? 'warning' : 'ok'} icon={oldPending.length ? '!' : '✓'} title={`${oldPending.length} respuestas atrasadas`} text="Pendientes desde hace más de tres días." link={oldPending[0] ? `/formularios/${oldPending[0].form_id}/respuestas?submission=${oldPending[0].id}` : undefined} /><AlertCard tone={filteredAi.some((run) => run.status === 'failed') ? 'danger' : 'ok'} icon={filteredAi.some((run) => run.status === 'failed') ? '×' : '✓'} title={`${filteredAi.filter((run) => run.status === 'failed').length} análisis fallidos`} text="Ejecuciones de inteligencia artificial que deben revisarse." /><AlertCard tone={formActivity.some((item) => item.total >= 3 && item.rejected / item.total > .5) ? 'warning' : 'ok'} icon="↗" title={`${formActivity.filter((item) => item.total >= 3 && item.rejected / item.total > .5).length} formularios con rechazo alto`} text="Más de la mitad de sus respuestas fueron rechazadas." /></div></article>

    <section className="dashboard-section-heading"><div><p className="eyebrow">INTELIGENCIA ARTIFICIAL</p><h2>Rendimiento y decisiones asistidas</h2></div><small>Las métricas se generan desde la nueva instrumentación.</small></section>
    <div className="dashboard-kpis ai-kpis"><Metric label="Análisis ejecutados" value={filteredAi.length.toString()} detail={`${successfulAi.length} exitosos`} tone="blue" /><Metric label="Duración promedio" value={successfulAi.length ? `${(average(successfulAi.map((run) => run.duration_ms)) / 1000).toFixed(1)} s` : '—'} detail="tiempo de respuesta" tone="violet" /><Metric label="Coincidencia humana" value={comparedAi.length ? `${Math.round(agreement)}%` : '—'} detail={`${comparedAi.length} decisiones comparables`} tone="green" /><Metric label="Consumo de análisis" value={`${filteredAi.reduce((sum, run) => sum + run.total_tokens, 0).toLocaleString('es-GT')} tokens`} detail={filteredAi.some((run) => run.estimated_cost_usd != null) ? `$${filteredAi.reduce((sum, run) => sum + Number(run.estimated_cost_usd ?? 0), 0).toFixed(4)} estimados` : 'configure tarifas para calcular costo'} tone="amber" /></div>
    <article className="panel assistant-usage-card"><div className="assistant-usage-title"><span>✦</span><div><strong>Uso del asistente del dashboard</strong><small>Consumo generado por las preguntas del chat en el período seleccionado</small></div></div><div className="assistant-usage-stats"><div><strong>{filteredAssistant.length}</strong><small>Consultas</small></div><div><strong>{assistantTokens.toLocaleString('es-GT')}</strong><small>Tokens totales</small></div><div><strong>{filteredAssistant.length ? Math.round(assistantTokens / filteredAssistant.length).toLocaleString('es-GT') : '—'}</strong><small>Tokens por consulta</small></div><div><strong>{assistantHasCost ? `$${assistantCost.toFixed(4)}` : '—'}</strong><small>Costo estimado</small></div><div><strong>{filteredAssistant.length ? `${(average(filteredAssistant.map((run) => run.duration_ms)) / 1000).toFixed(1)} s` : '—'}</strong><small>Duración promedio</small></div><div><strong>{filteredAssistant.filter((run) => !run.is_supported).length}</strong><small>No admitidas</small></div></div></article>
    <div className="dashboard-grid">
      <article className="panel dashboard-panel dashboard-wide"><PanelTitle title="Ejecuciones recientes" subtitle="Proveedor, modelo, duración y decisión" /><div className="dashboard-table ai-table"><div className="dashboard-table-row head"><span>Fecha</span><span>Modelo</span><span>Resultado</span><span>Duración</span><span>Tokens</span><span>Coincidencia</span></div>{filteredAi.slice().reverse().slice(0, 8).map((run) => <div className="dashboard-table-row" key={run.id}><span>{new Date(run.started_at).toLocaleDateString('es-GT')}</span><span>{run.provider} · {run.model}</span><span className={`run-status ${run.status}`}>{run.status === 'succeeded' ? 'Exitoso' : 'Fallido'}</span><span>{(run.duration_ms / 1000).toFixed(1)} s</span><span>{run.total_tokens.toLocaleString('es-GT')}</span><strong>{run.human_decision ? (run.human_decision === run.suggested_status ? 'Sí' : 'No') : 'Pendiente'}</strong></div>)}{!filteredAi.length && <Empty text="Los nuevos análisis aparecerán aquí." />}</div></article>
      <article className="panel dashboard-panel ai-summary"><PanelTitle title="Calidad de la asistencia" subtitle="Comparación con la decisión final" /><div className="agreement-ring" style={{ '--agreement': `${agreement * 3.6}deg` } as CSSProperties}><div><strong>{comparedAi.length ? `${Math.round(agreement)}%` : '—'}</strong><small>coincidencia</small></div></div><p>{comparedAi.length ? `${comparedAi.filter((run) => run.human_decision === run.suggested_status).length} de ${comparedAi.length} recomendaciones coincidieron con la decisión humana.` : 'Aún no hay decisiones posteriores a un análisis para realizar la comparación.'}</p></article>
    </div>

    {selectedForm && <section className="form-insights"><div className="dashboard-section-heading"><div><p className="eyebrow">DETALLE DEL FORMULARIO</p><h2>{selectedForm.name}</h2></div><small>Distribución automática de preguntas cerradas y numéricas.</small></div><div className="insight-grid">{fields.filter((field) => ['select', 'boolean', 'number'].includes(field.field_type)).map((field) => <FieldInsight field={field} answers={answers.filter((answer) => answer.field_id === field.id && filteredIds.has(answer.submission_id))} key={field.id} />)}{!fields.some((field) => ['select', 'boolean', 'number'].includes(field.field_type)) && <div className="panel"><Empty text="Este formulario no contiene preguntas que puedan resumirse automáticamente." /></div>}</div></section>}
    <DashboardAssistant />
  </section>
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <article className={`dashboard-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article> }
function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) { return <header className="dashboard-panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div></header> }
function Empty({ text }: { text: string }) { return <div className="dashboard-empty">{text}</div> }
function AlertCard({ tone, icon, title, text, link }: { tone: string; icon: string; title: string; text: string; link?: string }) { return <div className={`alert-card ${tone}`}><i>{icon}</i><div><strong>{title}</strong><p>{text}</p>{link && <Link to={link}>Revisar ahora →</Link>}</div></div> }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 }
function localDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function formatHours(hours: number) { if (!hours) return '—'; if (hours < 1) return `${Math.round(hours * 60)} min`; if (hours < 24) return `${hours.toFixed(1)} h`; return `${(hours / 24).toFixed(1)} días` }
function FieldInsight({ field, answers }: { field: Field; answers: Answer[] }) {
  if (field.field_type === 'number') {
    const values = answers.map((item) => Number(item.value)).filter(Number.isFinite)
    return <article className="panel field-insight"><span className="field-insight-type">NUMÉRICO</span><h3>{field.label}</h3><div className="number-summary"><div><strong>{values.length ? average(values).toFixed(1) : '—'}</strong><small>Promedio</small></div><div><strong>{values.length ? Math.min(...values) : '—'}</strong><small>Mínimo</small></div><div><strong>{values.length ? Math.max(...values) : '—'}</strong><small>Máximo</small></div></div></article>
  }
  const counts = new Map<string, number>()
  answers.forEach((item) => { const key = String(item.value || 'Sin respuesta'); counts.set(key, (counts.get(key) ?? 0) + 1) })
  const options = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...options.map((item) => item[1]))
  return <article className="panel field-insight"><span className="field-insight-type">{field.field_type === 'boolean' ? 'SÍ / NO' : 'SELECCIÓN'}</span><h3>{field.label}</h3><div className="answer-bars">{options.slice(0, 6).map(([label, count]) => <div key={label}><span>{label}<b>{count}</b></span><i><em style={{ width: `${count / max * 100}%` }} /></i></div>)}{!options.length && <Empty text="Sin respuestas para este período." />}</div></article>
}
