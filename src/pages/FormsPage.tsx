import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

type FormRecord = { id: string; name: string; description: string; status: 'draft' | 'published' | 'archived'; updated_at: string }

export function FormsPage() {
  const { session, hasPermission } = useAuth()
  const navigate = useNavigate()
  const [forms, setForms] = useState<FormRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  async function loadForms() {
    setIsLoading(true)
    const { data, error: queryError } = await supabase.from('forms').select('id, name, description, status, updated_at').order('updated_at', { ascending: false })
    if (queryError) setError(`No se pudieron cargar los formularios: ${queryError.message}`)
    setForms((data as FormRecord[] | null) ?? [])
    setIsLoading(false)
  }

  // Synchronizes the form directory with Supabase on mount.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadForms() }, [])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || !name.trim()) return
    setIsSubmitting(true)
    setError('')
    const { data, error: insertError } = await supabase.from('forms').insert({ name: name.trim(), description: description.trim(), created_by: session.user.id }).select('id').single()
    if (insertError || !data) { setError(`No se pudo crear el formulario: ${insertError?.message ?? 'respuesta vacía'}`); setIsSubmitting(false); return }
    setName(''); setDescription(''); setIsCreateOpen(false); setIsSubmitting(false)
    navigate(`/formularios/${data.id}`)
  }

  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">DISEÑO</p><h1>Formularios</h1><p>Administra formularios, contexto IA, departamentos y respuestas.</p></div>{hasPermission('forms.create') && <button className="primary-button" onClick={() => setIsCreateOpen((open) => !open)} type="button">+ Crear formulario</button>}</div>{error && <div className="error-banner">{error}</div>}{isCreateOpen && <form className="user-form panel" onSubmit={handleCreate}><div className="form-grid"><label>Nombre del formulario<input required placeholder="Ej. Aplicación laboral" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Descripción<input placeholder="¿Para qué se utilizará?" value={description} onChange={(event) => setDescription(event.target.value)} /></label></div><div className="form-actions"><button className="secondary-button" onClick={() => setIsCreateOpen(false)} type="button">Cancelar</button><button className="primary-button" disabled={isSubmitting} type="submit">{isSubmitting ? 'Creando…' : 'Crear borrador'}</button></div></form>}<div className="panel users-table-panel"><div className="panel-heading"><h2>Formularios guardados</h2><span className="table-count">{forms.length} formularios</span></div>{isLoading ? <div className="table-empty">Cargando formularios…</div> : forms.length === 0 ? <div className="table-empty">Todavía no hay formularios.</div> : <div className="users-table"><div className="table-row table-header"><span>Formulario</span><span>Estado</span><span>Actualizado</span><span>Acciones</span></div>{forms.map((form) => <div className="table-row" key={form.id}><span><strong>{form.name}</strong><small>{form.description || 'Sin descripción'}</small></span><span><em className={`form-status ${form.status}`}>{form.status === 'draft' ? 'Borrador' : form.status === 'published' ? 'Publicado' : 'Archivado'}</em></span><span>{new Date(form.updated_at).toLocaleDateString('es-GT')}</span><span><Link aria-label="Editar formulario" className="table-link" title="Editar formulario" to={`/formularios/${form.id}`}>Editar</Link><Link aria-label="Configurar contexto IA" className="table-link" title="Configurar contexto IA" to={`/formularios/${form.id}/contexto`}>Contexto IA</Link><Link aria-label="Configurar departamentos" className="table-link" title="Configurar departamentos" to={`/formularios/${form.id}/departamentos`}>Departamentos</Link><Link aria-label="Ver respuestas" className="table-link" title="Ver respuestas" to={`/formularios/${form.id}/respuestas`}>Respuestas</Link></span></div>)}</div>}</div></section>
}
