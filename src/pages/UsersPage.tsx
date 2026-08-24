import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Role = { id: number; key: string; name: string }
type Profile = { id: string; full_name: string; is_active: boolean; created_at: string; user_roles?: Array<{ role: Role | null }> }
type UserRole = { user_id: string; role: Role | null }

const initialForm = { email: '', password: '', fullName: '', roleKey: 'form_designer' }

export function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [form, setForm] = useState(initialForm)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadUsers() {
    setIsLoading(true)
    const [
      { data: profileData, error: profileError },
      { data: roleData, error: roleError },
      { data: userRoleData, error: userRoleError },
    ] = await Promise.all([
      supabase.from('profiles').select('id, full_name, is_active, created_at').order('created_at', { ascending: false }),
      supabase.from('roles').select('id, key, name').order('name'),
      supabase.from('user_roles').select('user_id, role:roles(id, key, name)'),
    ])
    if (profileError || roleError || userRoleError) {
      const detail = profileError?.message ?? roleError?.message ?? userRoleError?.message ?? 'Error desconocido'
      setError(`Supabase no pudo cargar los datos: ${detail}`)
    } else {
      setError('')
    }
    const assignments = (userRoleData as UserRole[] | null) ?? []
    const assignmentsByUser = new Map<string, Array<{ role: Role | null }>>()
    assignments.forEach((assignment) => {
      const current = assignmentsByUser.get(assignment.user_id) ?? []
      current.push({ role: assignment.role })
      assignmentsByUser.set(assignment.user_id, current)
    })
    const profilesWithRoles = ((profileData as Profile[] | null) ?? []).map((profile) => ({
      ...profile,
      user_roles: assignmentsByUser.get(profile.id) ?? [],
    }))
    setProfiles(profilesWithRoles)
    setRoles((roleData as Role[] | null) ?? [])
    setIsLoading(false)
  }

  // The initial fetch synchronizes the page with Supabase when it mounts.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadUsers() }, [])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSubmitting(true)
    const { error: functionError } = await supabase.functions.invoke('admin-create-user', { body: form })
    if (functionError) {
      setError('No se pudo crear el usuario. Verifica que la Edge Function esté desplegada y que tengas permiso de administrador.')
    } else {
      setMessage('Usuario creado correctamente.')
      setForm(initialForm)
      setIsCreateOpen(false)
      await loadUsers()
    }
    setIsSubmitting(false)
  }

  return (
    <section className="module-page">
      <div className="module-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Usuarios y roles</h1><p>Gestiona quién puede acceder a cada parte de la plataforma.</p></div><button className="primary-button" onClick={() => setIsCreateOpen((open) => !open)} type="button">+ Crear usuario</button></div>
      {message && <div className="success-banner">{message}</div>}
      {error && <div className="error-banner">{error}</div>}
      {isCreateOpen && <form className="user-form panel" onSubmit={handleCreate}><div className="form-grid"><label>Nombre completo<input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label><label>Correo electrónico<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Contraseña temporal<input required minLength={6} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><label>Rol<select value={form.roleKey} onChange={(event) => setForm({ ...form, roleKey: event.target.value })}>{roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select></label></div><div className="form-actions"><button className="secondary-button" onClick={() => setIsCreateOpen(false)} type="button">Cancelar</button><button className="primary-button" disabled={isSubmitting} type="submit">{isSubmitting ? 'Creando…' : 'Crear usuario'}</button></div></form>}
      <div className="panel users-table-panel"><div className="panel-heading"><div><p className="eyebrow">DIRECTORIO</p><h2>Usuarios registrados</h2></div><span className="table-count">{profiles.length} usuarios</span></div>{isLoading ? <div className="table-empty">Cargando usuarios…</div> : profiles.length === 0 ? <div className="table-empty">No hay perfiles. Crea el primer usuario desde Supabase Auth o mediante la función administrativa.</div> : <div className="users-table"><div className="table-row table-header"><span>Usuario</span><span>Rol</span><span>Estado</span><span>Alta</span></div>{profiles.map((profile) => <div className="table-row" key={profile.id}><span><strong>{profile.full_name || 'Sin nombre'}</strong><small>{profile.id}</small></span><span>{profile.user_roles?.map((assignment) => assignment.role?.name).filter(Boolean).join(', ') || 'Sin rol'}</span><span><em className={profile.is_active ? 'status-active' : 'status-inactive'}>{profile.is_active ? 'Activo' : 'Inactivo'}</em></span><span>{new Date(profile.created_at).toLocaleDateString('es-GT')}</span></div>)}</div>}</div>
    </section>
  )
}
