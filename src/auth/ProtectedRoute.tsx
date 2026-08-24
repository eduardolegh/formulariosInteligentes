import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function ProtectedRoute() {
  const { session, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <div className="auth-loading">Comprobando tu sesión…</div>
  if (!session) return <Navigate replace state={{ from: location }} to="/login" />
  return <Outlet />
}
