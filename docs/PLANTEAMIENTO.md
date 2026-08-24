# Planteamiento del proyecto

## Visión

Desarrollar una plataforma low-code asistida por inteligencia artificial para crear formularios empresariales, revisar su estructura, procesar respuestas y ejecutar acciones contra APIs REST externas.

Cada formulario tendrá un contexto de negocio: área, proceso, objetivo, información requerida e indicadores. Ese contexto orientará la generación con IA, las validaciones y el dashboard.

## Caso principal

El caso de demostración será un proceso de reclutamiento de Recursos Humanos. Un administrador podrá solicitar mediante chat un formulario que incluya datos personales, experiencia, estudios en el extranjero y certificaciones.

Flujo objetivo:

```text
Administrador describe el formulario
        ↓
IA genera una estructura JSON
        ↓
Administrador revisa y publica
        ↓
Candidato responde el formulario tradicional
        ↓
Se validan respuestas y se aplican reglas
        ↓
Se consume una API REST configurable
        ↓
El dashboard muestra resultados
```

## Alcance del MVP

### Incluido

- Autenticación y roles básicos.
- Gestión de usuarios y permisos.
- Constructor visual de formularios.
- Generación y edición de formularios mediante IA.
- Contexto del formulario.
- Preguntas obligatorias y validaciones básicas.
- Condiciones simples para mostrar u ocultar preguntas.
- Publicación y respuesta tradicional.
- Estados de solicitudes.
- Reglas de negocio determinísticas.
- Revisión inteligente del formulario.
- Dashboard basado en respuestas y contexto.
- Conector REST genérico con API Key o Bearer Token.
- Registro de ejecuciones y errores.

### Fuera del alcance inicial

- Responder formularios mediante chat.
- Integración específica con WhatsApp.
- Agentes especializados por departamento.
- Entrenamiento de modelos propios.
- RAG y memoria conversacional.
- Integraciones con múltiples bases de datos.
- Flujos demasiado complejos.
- Detección de fraude y arquitectura distribuida.

## Arquitectura

```text
React + Vite + TypeScript
        ↓
Supabase Auth + PostgreSQL + Storage
        ↓
Supabase Edge Functions
        ↓
OpenAI/Ollama y APIs REST externas
```

React manejará la interfaz, el constructor, el chat del administrador, el formulario público y los dashboards. Supabase manejará autenticación, persistencia, archivos y funciones de servidor. Las claves privadas y llamadas a proveedores externos no se expondrán en el navegador.

## Usuarios, roles y permisos

Roles iniciales:

- Administrador: gestionar usuarios, roles y toda la plataforma.
- Diseñador de formularios: crear y editar formularios.
- Analista: ver dashboards.
- Configurador: configurar contextos de formularios.

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

El control debe existir tanto en la interfaz como en Supabase mediante RLS y Edge Functions.

## Modelo de datos inicial

```text
profiles
roles
permissions
role_permissions
user_roles
forms
form_sections
form_fields
form_rules
form_submissions
submission_answers
integrations
integration_logs
dashboard_configs
```

Se usará un modelo híbrido: entidades principales en tablas relacionales y configuraciones flexibles en campos JSONB. El esquema del formulario se validará antes de guardarse.

## IA

La IA convertirá lenguaje natural en JSON validado. Funciones iniciales:

- Crear un formulario.
- Crear una pregunta.
- Modificar preguntas o secciones.
- Detectar preguntas repetidas o aparentemente faltantes.
- Sugerir validaciones e indicadores.

La IA no modificará directamente la base de datos. La propuesta se validará, se mostrará en vista previa y requerirá confirmación.

## Integraciones REST

El MVP tendrá un conector REST genérico configurable con:

- Endpoint y método HTTP.
- API Key o Bearer Token.
- Encabezados y parámetros.
- Plantilla JSON.
- Mapeo de campos del formulario.
- Registro de respuesta y error.

Las llamadas se ejecutarán desde una Edge Function para proteger secretos y centralizar validaciones, reintentos y logs.

## División de trabajo

### Persona 1: backend y procesos

- Supabase, base de datos, Auth y RLS.
- Usuarios, roles y permisos.
- APIs de formularios y respuestas.
- Estados y reglas.
- Edge Functions e integración REST.

### Persona 2: frontend, IA y dashboards

- Layout, navegación y pantallas.
- Constructor visual.
- Chat del administrador.
- Integración con OpenAI u Ollama.
- Revisión inteligente y dashboards.

### Trabajo conjunto

- Alcance y caso de uso.
- Esquema JSON.
- Modelo de estados.
- Pruebas, documentación y presentación.

## Cronograma de 16 semanas

| Semanas | Trabajo principal |
|---|---|
| 1–2 | Alcance, arquitectura, modelo de datos y esquema JSON |
| 3–5 | Supabase, Auth, roles, permisos y constructor inicial |
| 6–8 | Formulario público e integración de IA |
| 9–10 | Generación, edición mediante chat, publicación y respuestas |
| 11–12 | Reglas, estados, revisión inteligente e indicadores |
| 13–14 | Dashboard e integración REST |
| 15–16 | Pruebas, documentación y presentación |

## Primer hito

```text
Administrador inicia sesión
        ↓
Crea un usuario
        ↓
Asigna permisos
        ↓
El usuario inicia sesión
        ↓
Solo ve las pantallas autorizadas
```

## Decisiones pendientes

- Elegir OpenAI, Ollama o ambos.
- Definir si los archivos estarán en la primera versión.
- Definir despliegue del frontend.
- Definir indicadores definitivos del caso de reclutamiento.
- Definir si las aprobaciones serán estados manuales o flujo formal.
