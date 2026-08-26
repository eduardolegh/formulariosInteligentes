import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type ParticipantForm = { id: string; name: string; description: string; visibility: 'public' | 'private'; share_token: string }

export function ParticipantFormsPage() {
  const [forms, setForms] = useState<ParticipantForm[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    supabase.from('forms').select('id, name, description, visibility, share_token').eq('status', 'published').order('name').then(({ data, error: queryError }) => {
      if (!mounted) return
      if (queryError) setError(`No se pudieron cargar tus formularios: ${queryError.message}`)
      setForms((data as ParticipantForm[] | null) ?? [])
      setIsLoading(false)
    })
    return () => { mounted = false }
  }, [])

  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">PARTICIPANTE</p><h1>Mis formularios</h1><p>Responde los formularios publicados disponibles para ti.</p></div></div>{error && <div className="error-banner">{error}</div>}{isLoading ? <div className="panel table-empty">Cargando formularios…</div> : forms.length === 0 ? <div className="panel table-empty">No tienes formularios publicados disponibles.</div> : <div className="participant-cards">{forms.map((form) => <article className="participant-card" key={form.id}><div><span className={`form-status ${form.visibility}`}>{form.visibility === 'public' ? 'Público' : 'Privado'}</span><h2>{form.name}</h2><p>{form.description || 'Sin descripción'}</p></div><Link className="primary-button" to={`/responder/${form.share_token}`}>Responder →</Link></article>)}</div>}</section>
}
