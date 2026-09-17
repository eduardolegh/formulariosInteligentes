import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const { session, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'

  useEffect(() => {
    if (session) navigate(redirectTo, { replace: true })
  }, [navigate, redirectTo, session])

  if (isLoading) return <div className="auth-loading">Cargando…</div>
  if (session) return <Navigate replace to={redirectTo} />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setErrorMessage('No pudimos iniciar sesión. Revisa tu correo y contraseña.')
      setIsSubmitting(false)
      return
    }
    navigate(redirectTo, { replace: true })
  }

  return (
    <main className="auth-page">
      <section className="login-card">
        <div className="login-brand"><img src="/logo.svg" alt="Formularios Inteligentes" /></div>
        <p className="eyebrow">PANEL ADMINISTRATIVO</p>
        <h1>Bienvenido de nuevo</h1>
        <p className="login-subtitle">Inicia sesión para administrar tus formularios y procesos.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" type="email" autoComplete="email" placeholder="tu@empresa.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" autoComplete="current-password" placeholder="••••••••" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} />
          {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
          <button className="login-button" disabled={isSubmitting} type="submit">{isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}</button>
        </form>
        <p className="login-note">La cuenta debe existir en Supabase Auth. La creación de usuarios administrativos se agregará en el siguiente módulo.</p>
      </section>
    </main>
  )
}
