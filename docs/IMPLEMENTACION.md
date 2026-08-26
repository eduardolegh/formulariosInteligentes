# Documento de implementación

Este documento registra las decisiones técnicas y los cambios implementados en el repositorio. El documento de visión y alcance se mantiene separado en [PLANTEAMIENTO.md](./PLANTEAMIENTO.md).

## 1. Estado actual

La primera versión funcional de la plataforma incluye:

- Aplicación web React.
- Panel administrativo responsive.
- Navegación por módulos.
- Conexión con Supabase.
- Inicio de sesión con Supabase Auth.
- Protección de rutas autenticadas.
- Perfiles, roles y permisos.
- Protección de pantallas según permisos.
- Políticas iniciales de Row Level Security.
- Directorio de usuarios.
- Creación de usuarios mediante Edge Function.
- Módulo inicial de formularios con secciones y preguntas.
- Publicación pública/privada y enlaces compartibles.
- Rol Participante y pantalla de respuesta.
- Registro de envíos y respuestas.
- Migraciones SQL versionadas.
- Documentación y diagramas versionados en Git.

## 2. Tecnologías

### Frontend

- React 19.
- TypeScript.
- Vite.
- React Router.
- CSS propio con diseño responsive.
- `@supabase/supabase-js` para comunicación con Supabase.

### Backend administrado

- Supabase Auth.
- Supabase PostgreSQL.
- Supabase Row Level Security (RLS).
- Supabase Edge Functions.
- Supabase Storage, reservado para archivos futuros.

### Herramientas

- Git.
- GitHub.
- Supabase CLI.
- npm.
- Oxlint.

## 3. Arquitectura actual

```text
React + Vite
    ├── Login
    ├── Panel administrativo
    ├── Navegación protegida
    ├── Usuarios y roles
    └── Módulos futuros
            ↓
Supabase JS Client
            ↓
Supabase Auth + PostgreSQL + RLS
            ↓
Supabase Edge Functions
            ↓
APIs externas y operaciones administrativas
```

La aplicación no utiliza un backend tradicional separado. Las operaciones que requieren privilegios elevados se ejecutan mediante Edge Functions.

## 4. Estructura del repositorio

```text
formulariosInteligentes/
├── docs/
│   ├── PLANTEAMIENTO.md
│   ├── IMPLEMENTACION.md
│   ├── diagramas/
│   └── decisiones/
├── public/
├── src/
│   ├── auth/
│   │   ├── AuthContext.ts
│   │   ├── AuthProvider.tsx
│   │   ├── PermissionRoute.tsx
│   │   └── ProtectedRoute.tsx
│   ├── lib/
│   │   └── supabase.ts
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── UsersPage.tsx
│   │   ├── FormsPage.tsx
│   │   ├── FormEditorPage.tsx
│   │   ├── ParticipantFormsPage.tsx
│   │   └── ResponderPage.tsx
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── main.tsx
├── supabase/
│   ├── functions/
│   │   └── admin-create-user/
│   └── migrations/
│       ├── 001_profiles_roles_permissions.sql
│       ├── 002_add_profile_email.sql
│       ├── 003_forms.sql
│       └── 004_form_visibility_and_submissions.sql
├── .env.example
├── .env.local
├── package.json
└── vite.config.ts
```

## 5. Variables de entorno

Vite solo expone variables que comienzan con `VITE_`.

Archivo local no versionado: `.env.local`

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu_clave_publishable
```

Archivo de referencia versionado: `.env.example`.

Nunca se debe colocar en React una clave `service_role`. Esa clave solo debe utilizarse dentro de Edge Functions o en entornos administrativos seguros.

## 6. Cliente de Supabase

El cliente se crea en `src/lib/supabase.ts` mediante `createClient` de `@supabase/supabase-js`.

La configuración actual habilita:

- Persistencia de sesión.
- Renovación automática de tokens.
- Detección de sesión desde URL.

## 7. Autenticación

La autenticación utiliza Supabase Auth.

### Flujo

```text
Usuario visita una ruta protegida
        ↓
Se consulta la sesión actual
        ↓
Sin sesión → /login
        ↓
Correo y contraseña o proveedor OAuth
        ↓
Supabase devuelve la sesión
        ↓
Se cargan permisos
        ↓
Acceso al panel
```

La aplicación ya incluye:

- `AuthProvider` para mantener la sesión.
- `AuthContext` para consumir sesión y permisos.
- `ProtectedRoute` para proteger rutas autenticadas.
- `LoginPage` para inicio de sesión con correo y contraseña.
- Cierre de sesión desde el panel.

El acceso con GitHub puede agregarse mediante `signInWithOAuth` cuando se configure el proveedor en Supabase Auth.

## 8. Base de datos

### Tablas implementadas

```text
profiles
roles
permissions
role_permissions
user_roles
```

### `profiles`

Almacena información complementaria de cada usuario de Auth:

- `id`.
- `email`.
- `full_name`.
- `is_active`.
- `created_at`.

### `roles`

Roles iniciales:

```text
admin
form_designer
analyst
context_configurator
```

### `permissions`

Permisos iniciales:

```text
users.manage
roles.manage
forms.create
forms.edit
forms.view
contexts.create
contexts.edit
dashboards.view
```

### `role_permissions`

Relaciona cada rol con sus permisos.

### `user_roles`

Relaciona usuarios de `auth.users` con roles de la aplicación.

## 9. Migraciones

### `001_profiles_roles_permissions.sql`

Implementa:

- Tablas de perfiles, roles y permisos.
- Roles y permisos iniciales.
- Función `has_permission`.
- Función `has_permission_for_user`.
- Trigger para crear perfiles automáticamente.
- Políticas RLS iniciales.

### `002_add_profile_email.sql`

Implementa:

- Columna `email` en `profiles`.
- Índice por correo.
- Sincronización de correos existentes desde `auth.users`.

### `003_forms.sql`

Implementa el modelo inicial de formularios: `forms`, `form_sections` y `form_fields`, junto con sus políticas RLS.

### `004_form_visibility_and_submissions.sql`

Implementa la publicación y respuesta de formularios:

- Visibilidad `public` o `private` y enlace estable mediante `share_token`.
- Rol `participant` (Participante) y permiso `forms.respond`.
- Tablas `form_submissions` y `submission_answers`.
- RLS para consultar formularios públicos sin sesión y formularios privados con el permiso de participante.
- Inserción de respuestas anónimas en formularios públicos y autenticadas en formularios privados.
- Actualización del trigger para nuevos usuarios.

Las migraciones deben ejecutarse en el proyecto correcto de Supabase antes de utilizar las pantallas que dependen de ellas.

## 10. Roles y permisos en React

Al iniciar sesión, `AuthProvider` consulta:

```text
user_roles
    ↓
role_permissions
    ↓
permissions
```

El resultado se guarda en el contexto de autenticación y se utiliza mediante:

```ts
hasPermission('users.manage')
```

### Rutas protegidas

```text
/formularios  → forms.view
/contextos    → contexts.create
/dashboards   → dashboards.view
/usuarios     → users.manage
```

Si el usuario está autenticado, pero no tiene el permiso, se redirige a `/sin-acceso`.

El menú lateral también oculta las secciones que el usuario no puede utilizar.

## 11. Row Level Security

Las políticas RLS iniciales protegen:

- Lectura y actualización del perfil propio.
- Lectura de roles y permisos para usuarios autenticados.
- Lectura de los roles propios.
- Gestión de roles de otros usuarios solo para quienes tienen `roles.manage`.
- Gestión de perfiles por usuarios con `users.manage`.

La protección en frontend solo mejora la experiencia. La seguridad real debe permanecer en RLS y Edge Functions.

## 12. Gestión administrativa de usuarios

La pantalla `/usuarios` permite:

- Consultar usuarios.
- Ver nombre y correo.
- Ver roles asignados.
- Ver estado activo o inactivo.
- Ver fecha de creación.
- Abrir el formulario para crear usuarios.

La creación no se ejecuta directamente desde React porque requiere privilegios administrativos. Se llama a:

```text
admin-create-user
```

La Edge Function:

1. Verifica el JWT del administrador.
2. Comprueba `users.manage`.
3. Crea el usuario mediante `auth.admin.createUser`.
4. Busca el rol solicitado.
5. Inserta la relación en `user_roles`.

Archivo fuente:

```text
supabase/functions/admin-create-user/index.ts
```

## 13. Despliegue de la Edge Function

Desde el repositorio:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase functions deploy admin-create-user
```

La clave de servicio debe permanecer dentro del entorno de Supabase y nunca debe escribirse en `.env.local` del frontend.

## 14. Comandos de desarrollo

```bash
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

Para ejecutar el CLI de Supabase:

```bash
npx supabase --help
```

## 15. Commits principales

```text
7babbd6 docs: add project plan and architecture docs
7c38a0f feat: scaffold react admin workspace
4494801 feat: configure supabase connection
f6b1ca5 feat: use official supabase client
67f4626 feat: implement supabase authentication
200aaee feat: add users roles and permissions foundation
5b55c3b fix: load user roles without profile relation
fd75c94 fix: show user creation function errors
07e6067 feat: show user emails in admin directory
00f7716 chore: add supabase cli dependency
7add6fb feat: protect screens by permissions
```

## 16. Próximos pasos técnicos

1. Confirmar despliegue de `admin-create-user`.
2. Ejecutar la migración `004_form_visibility_and_submissions.sql` en Supabase.
3. Asignar el rol Participante a los usuarios que responderán formularios privados.
4. Implementar el constructor visual.
5. Crear el módulo de contextos.
6. Implementar generación de formularios mediante IA.
7. Crear respuestas, estados y dashboards.
8. Agregar el conector REST genérico.

## 17. Regla de mantenimiento

Cada cambio técnico importante debe actualizar este documento o agregar una decisión en `docs/decisiones/`. El documento de planteamiento solo debe modificarse si cambia la visión, el alcance o los objetivos del proyecto.
