import { useState } from 'react'

export type LlmOperationRun = { id: string; requested_by: string | null; requested_by_name: string; form_id: string | null; form_name: string | null; operation_type: 'form_generation' | 'form_edit' | 'dashboard_assistant' | 'identity_document_validation'; provider: string; model: string; status: 'succeeded' | 'failed'; started_at: string; completed_at: string; duration_ms: number; input_tokens: number; output_tokens: number; total_tokens: number; estimated_cost_usd: number | null; error_message: string | null; metadata: Record<string, unknown> }

const operationLabels: Record<LlmOperationRun['operation_type'], string> = { form_generation: 'Generación de formulario', form_edit: 'Edición de formulario', dashboard_assistant: 'Asistente del dashboard', identity_document_validation: 'Validación de identidad' }

export function LlmOperationsPanel({ visibleRuns, allRuns }: { visibleRuns: LlmOperationRun[]; allRuns: LlmOperationRun[] }) {
  const [exporting, setExporting] = useState(false)
  const totalTokens = visibleRuns.reduce((sum, run) => sum + run.total_tokens, 0)
  const averageDuration = visibleRuns.length ? visibleRuns.reduce((sum, run) => sum + run.duration_ms, 0) / visibleRuns.length : 0

  async function exportAll() {
    if (!allRuns.length) return
    setExporting(true)
    try {
      const { default: writeExcelFile } = await import('write-excel-file/browser')
      const header = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#247F95', fontColor: '#FFFFFF', align: 'center' as const })
      const data = [
        ['Fecha de inicio', 'Usuario', 'Operación', 'Proveedor', 'Modelo', 'Estado', 'Duración (segundos)', 'Tokens de entrada', 'Tokens de salida', 'Tokens totales', 'Costo estimado USD', 'Formulario', 'Error'].map(header),
        ...allRuns.map((run) => [
          { value: new Date(run.started_at), type: Date, format: 'dd/mm/yyyy hh:mm:ss' }, run.requested_by_name, operationLabels[run.operation_type] ?? run.operation_type, run.provider, run.model, run.status === 'succeeded' ? 'Exitosa' : 'Fallida',
          { value: run.duration_ms / 1000, type: Number, format: '0.000' }, { value: run.input_tokens, type: Number, format: '#,##0' }, { value: run.output_tokens, type: Number, format: '#,##0' }, { value: run.total_tokens, type: Number, format: '#,##0' },
          run.estimated_cost_usd == null ? null : { value: Number(run.estimated_cost_usd), type: Number, format: '$0.000000' }, run.form_name ?? '', run.error_message ?? '',
        ]),
      ]
      const columns = [22, 24, 28, 13, 22, 12, 19, 18, 18, 16, 20, 28, 42].map((width) => ({ width }))
      await writeExcelFile(data, { columns, sheet: 'Ejecuciones LLM', stickyRowsCount: 1 }).toFile(`ejecuciones-llm-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally { setExporting(false) }
  }

  return <article className="panel dashboard-panel llm-operations-panel">
    <div className="llm-operations-heading"><div><p className="eyebrow">OBSERVABILIDAD DEL LLM</p><h2>Ejecuciones de otras tareas</h2><p>Generación y edición de formularios, además de consultas al asistente del dashboard.</p></div><button className="secondary-button" disabled={exporting || !allRuns.length} onClick={() => void exportAll()} type="button">{exporting ? 'Generando Excel…' : 'Exportar todas a Excel'}</button></div>
    <div className="llm-operation-summary"><div><strong>{visibleRuns.length}</strong><small>Ejecuciones</small></div><div><strong>{totalTokens.toLocaleString('es-GT')}</strong><small>Tokens totales</small></div><div><strong>{visibleRuns.length ? `${(averageDuration / 1000).toFixed(1)} s` : '—'}</strong><small>Duración promedio</small></div><div><strong>{visibleRuns.filter((run) => run.status === 'failed').length}</strong><small>Fallidas</small></div></div>
    <div className="llm-runs-table"><div className="llm-run-row head"><span>Fecha</span><span>Usuario</span><span>Tarea</span><span>Modelo</span><span>Resultado</span><span>Duración</span><span>Tokens</span></div>{visibleRuns.slice(0, 10).map((run) => <div className="llm-run-row" key={run.id}><span>{new Date(run.started_at).toLocaleString('es-GT')}</span><span title={run.requested_by_name}>{run.requested_by_name}</span><span><strong>{operationLabels[run.operation_type] ?? run.operation_type}</strong>{run.form_name && <small>{run.form_name}</small>}</span><span>{run.provider} · {run.model}</span><span className={`run-status ${run.status}`}>{run.status === 'succeeded' ? 'Exitosa' : 'Fallida'}</span><span>{(run.duration_ms / 1000).toFixed(1)} s</span><span><strong>{run.total_tokens.toLocaleString('es-GT')}</strong><small>{run.input_tokens.toLocaleString('es-GT')} entrada · {run.output_tokens.toLocaleString('es-GT')} salida</small></span></div>)}{!visibleRuns.length && <div className="dashboard-empty">Las nuevas ejecuciones aparecerán aquí.</div>}</div>
    {visibleRuns.length > 10 && <small className="llm-table-note">Se muestran las 10 ejecuciones más recientes del período. La exportación incluye las {allRuns.length.toLocaleString('es-GT')} ejecuciones disponibles.</small>}
  </article>
}
