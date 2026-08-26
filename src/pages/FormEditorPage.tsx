import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type FormRecord = { id: string; name: string; description: string; status: 'draft' | 'published' | 'archived'; visibility: 'public' | 'private'; share_token: string }
type Section = { id: string; title: string; description: string; position: number }
type Field = { id: string; section_id: string; field_key: string; label: string; field_type: string; is_required: boolean; position: number; config?: { options?: string[] } }

const fieldTypes = [
  ['text', 'Texto corto'], ['textarea', 'Texto largo'], ['email', 'Correo electrónico'], ['phone', 'Teléfono'],
  ['number', 'Número'], ['date', 'Fecha'], ['select', 'Lista desplegable'], ['boolean', 'Sí / No'],
]

export function FormEditorPage() {
  const { formId } = useParams()
  const [form, setForm] = useState<FormRecord | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [sectionTitle, setSectionTitle] = useState('')
  const [fieldLabel, setFieldLabel] = useState('')
  const [fieldType, setFieldType] = useState('text')
  const [fieldOptions, setFieldOptions] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadEditor() {
    if (!formId) return
    setIsLoading(true)
    const [{ data: formData, error: formError }, { data: sectionData, error: sectionError }] = await Promise.all([
      supabase.from('forms').select('id, name, description, status, visibility, share_token').eq('id', formId).single(),
      supabase.from('form_sections').select('id, title, description, position').eq('form_id', formId).order('position'),
    ])
    if (formError || sectionError) {
      setError(`No se pudo cargar el formulario: ${formError?.message ?? sectionError?.message ?? 'error desconocido'}`)
      setIsLoading(false)
      return
    }
    const nextSections = (sectionData as Section[] | null) ?? []
    const { data: fieldData, error: fieldError } = nextSections.length ? await supabase.from('form_fields').select('id, section_id, field_key, label, field_type, is_required, position, config').in('section_id', nextSections.map((section) => section.id)).order('position') : { data: [], error: null }
    if (fieldError) setError(`No se pudieron cargar las preguntas: ${fieldError.message}`)
    setForm(formData as FormRecord)
    setSections(nextSections)
    setFields((fieldData as Field[] | null) ?? [])
    setSelectedSection(nextSections[0]?.id ?? '')
    setIsLoading(false)
  }

  // Synchronizes this page with the external Supabase data source on mount.
  // oxlint-disable-next-line react/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void loadEditor() }, [formId])

  async function addSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!formId || !sectionTitle.trim()) return
    const { data, error: insertError } = await supabase.from('form_sections').insert({ form_id: formId, title: sectionTitle.trim(), position: sections.length }).select('id, title, description, position').single()
    if (insertError || !data) { setError(`No se pudo crear la sección: ${insertError?.message ?? 'respuesta vacía'}`); return }
    setSections([...sections, data as Section])
    setSelectedSection(data.id)
    setSectionTitle('')
  }

  async function addField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedSection || !fieldLabel.trim()) return
    const sectionFields = fields.filter((field) => field.section_id === selectedSection)
    const optionText = fieldType === 'select' && !fieldOptions.trim() ? window.prompt('Escribe las opciones, separadas por coma', 'Opción 1, Opción 2') ?? '' : fieldOptions
    const options = optionText.split(/[,\n]/).map((option) => option.trim()).filter(Boolean)
    if (fieldType === 'select' && options.length < 2) { setError('Una lista debe tener al menos dos opciones, una por línea.'); return }
    const config = fieldType === 'select' ? { options } : {}
    const payload = { section_id: selectedSection, field_key: `${fieldType}_${Date.now()}`, label: fieldLabel.trim(), field_type: fieldType, config, position: sectionFields.length }
    const { data, error: insertError } = await supabase.from('form_fields').insert(payload).select('id, section_id, field_key, label, field_type, is_required, position, config').single()
    if (insertError || !data) { setError(`No se pudo crear la pregunta: ${insertError?.message ?? 'respuesta vacía'}`); return }
    setFields([...fields, data as Field])
    setFieldLabel('')
    setFieldOptions('')
  }

  async function togglePublish() {
    if (!form) return
    const nextStatus = form.status === 'published' ? 'draft' : 'published'
    const { error: updateError } = await supabase.from('forms').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', form.id)
    if (updateError) { setError(`No se pudo actualizar el estado: ${updateError.message}`); return }
    setForm({ ...form, status: nextStatus })
  }

  async function updateVisibility(visibility: 'public' | 'private') {
    if (!form || form.visibility === visibility) return
    const { error: updateError } = await supabase.from('forms').update({ visibility, updated_at: new Date().toISOString() }).eq('id', form.id)
    if (updateError) { setError(`No se pudo actualizar la visibilidad: ${updateError.message}`); return }
    setForm({ ...form, visibility })
  }

  if (isLoading) return <div className="auth-loading">Cargando formulario…</div>
  if (!form) return <section className="placeholder-page"><h1>Formulario no encontrado</h1><Link className="table-link" to="/formularios">Volver a formularios</Link></section>

  const shareUrl = `${window.location.origin}/responder/${form.share_token}`
  return <section className="module-page"><div className="editor-breadcrumb"><Link to="/formularios">← Formularios</Link></div><div className="module-heading"><div><p className="eyebrow">EDITOR DE FORMULARIO</p><h1>{form.name}</h1><p>{form.description || 'Sin descripción'}</p></div><div className="editor-actions"><select className="visibility-select" aria-label="Visibilidad del formulario" value={form.visibility} onChange={(event) => void updateVisibility(event.target.value as 'public' | 'private')}><option value="private">Privado</option><option value="public">Público</option></select><span className={`form-status ${form.status}`}>{form.status === 'draft' ? 'Borrador' : 'Publicado'}</span><button className="primary-button" onClick={togglePublish} type="button">{form.status === 'published' ? 'Pasar a borrador' : 'Publicar formulario'}</button></div></div>{form.status === 'published' && <div className="share-link"><span>Enlace para responder</span><input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} /><button className="text-button" onClick={() => void navigator.clipboard?.writeText(shareUrl)} type="button">Copiar</button><small>{form.visibility === 'public' ? 'Cualquier persona con el enlace puede responder.' : 'Solo usuarios autenticados con rol Participante pueden responder.'}</small></div>}{error && <div className="error-banner">{error}</div>}<div className="editor-grid"><div><div className="panel editor-panel"><div className="panel-heading"><div><p className="eyebrow">ESTRUCTURA</p><h2>Secciones y preguntas</h2></div></div>{sections.length === 0 ? <div className="table-empty">Agrega una sección para comenzar a diseñar.</div> : sections.map((section) => <div className={`section-card ${selectedSection === section.id ? 'selected' : ''}`} key={section.id} onClick={() => setSelectedSection(section.id)}><div className="section-heading"><strong>{section.title}</strong><span>{fields.filter((field) => field.section_id === section.id).length} preguntas</span></div>{fields.filter((field) => field.section_id === section.id).map((field) => <div className="field-row" key={field.id}><span className="field-type">{field.field_type}</span><span>{field.label}</span>{field.is_required && <em>Obligatoria</em>}</div>)}</div>)}</div></div><aside><form className="panel editor-form" onSubmit={addSection}><p className="eyebrow">NUEVA SECCIÓN</p><h2>Agregar sección</h2><input required placeholder="Ej. Datos personales" value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)} /><button className="secondary-button" type="submit">+ Agregar sección</button></form><form className="panel editor-form" onSubmit={addField}><p className="eyebrow">NUEVA PREGUNTA</p><h2>Agregar pregunta</h2><select disabled={!sections.length} value={selectedSection} onChange={(event) => setSelectedSection(event.target.value)}>{sections.length ? sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>) : <option>Primero crea una sección</option>}</select><input disabled={!sections.length} required placeholder="Ej. Nombre completo" value={fieldLabel} onChange={(event) => setFieldLabel(event.target.value)} /><select disabled={!sections.length} value={fieldType} onChange={(event) => setFieldType(event.target.value)}>{fieldTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="secondary-button" disabled={!sections.length} type="submit">+ Agregar pregunta</button></form></aside></div></section>
}
