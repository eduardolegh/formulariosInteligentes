# Asignación de solicitudes BackOffice

## Instalación

Ejecutar manualmente en el SQL Editor de Supabase, después de la migración `034`:

```text
supabase/migrations/035_submission_assignment_workflow.sql
supabase/migrations/036_fix_backoffice_assignment_scope.sql
```

La migración `036` permite que los formularios sin departamento sean tomados por cualquier BackOffice con acceso a la bandeja y normaliza la comparación de departamentos. Si un formulario sí tiene departamentos configurados, el usuario debe pertenecer a uno de ellos.

Después se deben desplegar nuevamente las funciones que validan o describen estados:

```bash
npx supabase functions deploy analyze-submission --project-ref orwkfzozeasdomkmuqhf
npx supabase functions deploy send-tracking-email --no-verify-jwt --project-ref orwkfzozeasdomkmuqhf
npx supabase functions deploy dashboard-assistant --project-ref orwkfzozeasdomkmuqhf
```

Si se utiliza Ollama, reiniciar también el backend local para cargar la validación actualizada.

## Flujo

1. Una respuesta que requiere atención entra como **Ingresado** y no tiene responsable.
2. Un usuario BackOffice selecciona **Asignarme**. La operación es atómica: si otra persona la tomó primero, la segunda recibe un error y no reemplaza al responsable.
3. La respuesta pasa a **Asignado** y registra `assigned_to` y `assigned_at`.
4. Solamente el responsable puede seleccionar **Iniciar revisión**, analizar con inteligencia artificial y confirmar decisiones.
5. Cada transición queda en el historial y, cuando existe seguimiento público, genera su correo correspondiente.

Los formularios configurados sin atención continúan aprobándose automáticamente y no ingresan al proceso de asignación.

## Dashboard

El dashboard incluye el estado **Asignado**, un indicador de solicitudes **Sin asignar**, alertas de solicitudes sin responsable y desempeño por BackOffice basado en el responsable real. El tiempo para tomar una solicitud se calcula desde `submitted_at` hasta `assigned_at`.

## Pruebas recomendadas

- Abrir la misma solicitud con dos usuarios BackOffice y comprobar que únicamente uno puede asignársela.
- Confirmar que una solicitud ingresada no permite iniciar revisión ni análisis de inteligencia artificial.
- Asignar, iniciar revisión, aprobar o rechazar y finalizar; revisar el historial completo.
- Consultar el portal público y verificar que aparezca el estado **Asignada**.
- Revisar el dashboard y confirmar que disminuye **Sin asignar** y aumenta la carga del responsable.
- En un formulario con seguimiento, comprobar la recepción de correos para asignación, inicio de revisión y decisión.
