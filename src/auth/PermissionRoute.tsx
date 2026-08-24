import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function PermissionRoute({ permission }: { permission: string }) {
  const { hasPermission, permissionsLoading } = useAuth()
  const location = useLocation()

  if (permissionsLoading) return <div className="auth-loading">Comprobando permisos…</div>
  if (!hasPermission(permission)) return <Navigate replace state={{ from: location }} to="/sin-acceso" />
  return <Outlet />
}

export function AccessDeniedPage() {
  return <section className="placeholder-page"><p className="eyebrow">ACCESO RESTRINGIDO</p><h1>No tienes permiso para ver esta sección</h1><p>Solicita al administrador que te asigne el permiso necesario para continuar.</p><div className="placeholder-card"><span>!</span><div><strong>Permiso insuficiente</strong><small>Tu sesión es válida, pero este módulo no está incluido en tus roles actuales.</small></div></div></section>
}
