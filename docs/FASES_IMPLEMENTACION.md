# Fases iniciales de implementación

Este documento resume las actividades base del proyecto y su relación con lo construido.

| Actividad | Resultado / alcance |
|---|---|
| Definir alcance y caso de uso | Plataforma para crear formularios, publicarlos, segmentarlos por departamento, recopilar respuestas y preparar automatización con IA. |
| Diseñar arquitectura | React + Vite en frontend; Supabase Auth, PostgreSQL, RLS y Edge Functions como backend administrado. |
| Definir modelo de datos | Perfiles, roles, permisos, formularios, secciones, preguntas, departamentos, envíos, respuestas y contextos IA. |
| Definir esquema JSON | `form_fields.config` para opciones de listas y estructura extensible de preguntas; respuestas almacenadas en JSONB. |
| Configurar backend y BD | Cliente Supabase, migraciones SQL versionadas, políticas RLS y función administrativa de creación de usuarios. |
| Configurar frontend y navegación | Rutas protegidas, panel administrativo, editor de formularios, respuesta pública/privada y módulos de consulta. |
| Usuarios y roles | Administrador, Diseñador, Analista, Configurador de contextos y Participante, con permisos por pantalla y operación. |

## Estado

Las siete actividades están definidas y cuentan con una primera implementación funcional. Quedan para etapas posteriores la ejecución del agente IA, resultados generados y dashboards avanzados.
