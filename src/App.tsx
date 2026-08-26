import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { AccessDeniedPage, PermissionRoute } from './auth/PermissionRoute'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { UsersPage } from './pages/UsersPage'
import { FormsPage } from './pages/FormsPage'
import { FormEditorPage } from './pages/FormEditorPage'
import { ParticipantFormsPage } from './pages/ParticipantFormsPage'
import { ResponderPage } from './pages/ResponderPage'
import { FormResponsesPage } from './pages/FormResponsesPage'
import { FormDepartmentsPage } from './pages/FormDepartmentsPage'
import { DepartmentsPage } from './pages/DepartmentsPage'
import { FormContextPage } from './pages/FormContextPage'
import { supabase } from './lib/supabase'
import './App.css'

type NavItem = {
  label: string
  to: string
  icon: string
  permission?: string
}

const navItems: NavItem[] = [
  { label: 'Resumen', to: '/', icon: '⌂' },
  { label: 'Formularios', to: '/formularios', icon: '▤', permission: 'forms.view' },
  { label: 'Contextos', to: '/contextos', icon: '◈', permission: 'contexts.create' },
  { label: 'Dashboards', to: '/dashboards', icon: '▥', permission: 'dashboards.view' },
  { label: 'Usuarios y roles', to: '/usuarios', icon: '♙', permission: 'users.manage' },
  { label: 'Departamentos', to: '/departamentos', icon: '⌘', permission: 'users.manage' },
  { label: 'Mis formularios', to: '/mis-formularios', icon: '✓', permission: 'forms.respond' },
]

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/responder/:shareToken" element={<ResponderPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="sin-acceso" element={<AccessDeniedPage />} />
            <Route element={<PermissionRoute permission="forms.view" />}><Route path="formularios" element={<FormsPage />} /></Route>
            <Route element={<PermissionRoute permission="forms.edit" />}><Route path="formularios/:formId" element={<FormEditorPage />} /></Route>
            <Route element={<PermissionRoute permission="forms.view" />}><Route path="formularios/:formId/respuestas" element={<FormResponsesPage />} /></Route>
            <Route element={<PermissionRoute permission="forms.edit" />}><Route path="formularios/:formId/departamentos" element={<FormDepartmentsPage />} /></Route>
            <Route element={<PermissionRoute permission="forms.edit" />}><Route path="formularios/:formId/contexto" element={<FormContextPage />} /></Route>
            <Route element={<PermissionRoute permission="users.manage" />}><Route path="departamentos" element={<DepartmentsPage />} /></Route>
            <Route element={<PermissionRoute permission="contexts.create" />}><Route path="contextos" element={<PlaceholderPage title="Contextos de formularios" description="Define el proceso, área y objetivo que orientan a la inteligencia artificial." />} /></Route>
            <Route element={<PermissionRoute permission="dashboards.view" />}><Route path="dashboards" element={<PlaceholderPage title="Dashboards" description="Visualiza indicadores y el estado de las solicitudes." />} /></Route>
            <Route element={<PermissionRoute permission="users.manage" />}><Route path="usuarios" element={<UsersPage />} /></Route>
            <Route element={<PermissionRoute permission="forms.respond" />}><Route path="mis-formularios" element={<ParticipantFormsPage />} /></Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function AdminLayout() {
  const navigate = useNavigate()
  const { session, hasPermission } = useAuth()
  const [connectionState, setConnectionState] = useState<'checking' | 'connected' | 'error'>('checking')

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ error }) => {
      if (isMounted) setConnectionState(error ? 'error' : 'connected')
    })

    return () => {
      isMounted = false
    }
  }, [])

  const connectionLabel = {
    checking: 'Comprobando conexión…',
    connected: 'Supabase conectado',
    error: 'Error de conexión con Supabase',
  }[connectionState]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">fi</div>
          <div>
            <strong>Formularios</strong>
            <span>inteligentes</span>
          </div>
        </div>

        <div className="workspace-label">ESPACIO DE TRABAJO</div>
        <nav className="main-nav" aria-label="Navegación principal">
          {navItems.filter((item) => !item.permission || hasPermission(item.permission)).map((item) => (
            <NavLink
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              end={item.to === '/'}
              key={item.to}
              to={item.to}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className={`connection-status ${connectionState}`}><span /> {connectionLabel}</div>
          <div className="profile-chip">
            <div className="avatar">AD</div>
            <div><strong>{session?.user.email ?? 'Administrador'}</strong><small>Sesión activa</small></div>
            <button className="signout-button" onClick={async () => { await supabase.auth.signOut(); navigate('/login', { replace: true }) }} type="button">Salir</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Panel administrativo <span>/</span> <strong>Resumen</strong></div>
          <div className="topbar-actions"><button className="icon-button" aria-label="Notificaciones">♢</button><button className="help-button">?</button></div>
        </header>
        <div className="page-container"><Outlet /></div>
      </main>
    </div>
  )
}

function OverviewPage() {
  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">PANEL ADMINISTRATIVO</p><h1>Buenos días, Administrador</h1><p className="page-subtitle">Aquí tienes una vista general del espacio de trabajo.</p></div>
        <button className="primary-button">+ Crear formulario</button>
      </section>

      <section className="stat-grid" aria-label="Resumen de actividad">
        <StatCard label="Formularios activos" value="0" detail="Todavía no hay formularios publicados" accent="violet" />
        <StatCard label="Solicitudes recibidas" value="0" detail="Los envíos aparecerán aquí" accent="blue" />
        <StatCard label="Pendientes de revisión" value="0" detail="Sin solicitudes pendientes" accent="amber" />
        <StatCard label="Usuarios" value="1" detail="Administrador configurado" accent="green" />
      </section>

      <section className="content-grid">
        <div className="panel welcome-panel"><div className="panel-icon">✦</div><div><p className="eyebrow">PRIMEROS PASOS</p><h2>Construye tu primer proceso inteligente</h2><p>Empieza creando un formulario o configura el contexto del proceso que quieres automatizar.</p><div className="action-row"><button className="secondary-button">Crear formulario</button><button className="text-button">Configurar contexto <span>→</span></button></div></div></div>
        <div className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">ACTIVIDAD RECIENTE</p><h2>Todo tranquilo por aquí</h2></div><span className="activity-dot" /></div><div className="empty-state"><span className="empty-icon">◌</span><p>Aún no hay actividad registrada.</p><small>Cuando publiques un formulario, verás su actividad aquí.</small></div></div>
      </section>

      <section className="next-section"><p className="eyebrow">CONFIGURACIÓN DEL PROYECTO</p><h2>Tu plataforma, paso a paso</h2><div className="step-list"><Step number="01" title="Conecta Supabase" detail="Autenticación, usuarios y base de datos." status="Siguiente" /><Step number="02" title="Crea un formulario" detail="Diseña preguntas y define su contexto." status="Pendiente" /><Step number="03" title="Activa la inteligencia" detail="Genera y revisa formularios con IA." status="Pendiente" /></div></section>
    </>
  )
}

function StatCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return <div className={`stat-card ${accent}`}><div className="stat-label"><span className="stat-bullet" />{label}</div><strong>{value}</strong><small>{detail}</small></div>
}

function Step({ number, title, detail, status }: { number: string; title: string; detail: string; status: string }) {
  return <div className="step"><span className="step-number">{number}</span><div><strong>{title}</strong><small>{detail}</small></div><span className={`step-status ${status === 'Siguiente' ? 'next' : ''}`}>{status}</span></div>
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <section className="placeholder-page"><p className="eyebrow">MÓDULO</p><h1>{title}</h1><p>{description}</p><div className="placeholder-card"><span>✦</span><div><strong>Sección en preparación</strong><small>La estructura de navegación ya está lista. En el siguiente cambio conectaremos este módulo con Supabase.</small></div></div></section>
}

export default App
