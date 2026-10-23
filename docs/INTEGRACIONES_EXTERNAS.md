# Integraciones externas

El módulo permite registrar servicios HTTP, asignarlos a formularios y ejecutarlos cuando una respuesta cambia de etapa. Las credenciales se cifran y únicamente las funciones de Supabase pueden descifrarlas.

## Despliegue

Como las migraciones del proyecto se aplican manualmente, copia en el editor SQL de Supabase el contenido de `supabase/migrations/017_external_integrations.sql`. Para habilitar el seguimiento detallado, ejecuta después `supabase/migrations/020_submission_tracking.sql`.

Genera una clave de cifrado. Guárdala también en un gestor de contraseñas, porque será necesaria para descifrar las credenciales existentes:

```bash
openssl rand -base64 32
```

Configura el valor generado como secreto de Supabase:

```bash
npx supabase secrets set INTEGRATIONS_ENCRYPTION_KEY="PEGA_AQUI_EL_VALOR_GENERADO"
```

Despliega las funciones:

```bash
npx supabase functions deploy manage-integrations
npx supabase functions deploy dispatch-integrations
```

Después, cierra y abre la sesión de la aplicación para que el usuario administrador vuelva a cargar sus nuevos permisos.

## Uso

1. En **Integraciones**, crea el servicio y prueba su conexión.
2. En el editor de un formulario, selecciona **Integraciones**.
3. Asigna el servicio y el momento de ejecución.
4. Consulta en la bandeja el resultado de cada entrega.

Los eventos disponibles son:

- `form.submitted`: formulario recibido.
- `form.in_review`: revisión iniciada.
- `form.approved`: respuesta aprobada.
- `form.rejected`: respuesta rechazada.
- `form.completed`: proceso finalizado.

Cada solicitud incluye `event_id` y el encabezado `Idempotency-Key`. El servicio receptor debe conservar esa clave para evitar operaciones duplicadas.

## Formato enviado

```json
{
  "event": "form.submitted",
  "event_id": "uuid-de-la-entrega",
  "occurred_at": "2026-10-14T20:30:00.000Z",
  "form": {
    "id": "uuid-del-formulario",
    "name": "Solicitud de contrato"
  },
  "submission": {
    "id": "uuid-de-la-respuesta",
    "status": "submitted",
    "submitted_at": "2026-10-14T20:29:58.000Z",
    "observation": null
  },
  "answers": [
    {
      "field_id": "uuid-del-campo",
      "question": "Nombre completo",
      "type": "text",
      "value": "Juan Pérez"
    }
  ]
}
```

En esta etapa las fotografías no se envían como Base64 para evitar solicitudes excesivamente grandes. El payload indica que la imagen fue omitida.

## Prueba rápida

Para probar sin construir una API puedes utilizar temporalmente un receptor de webhooks de desarrollo. No envíes información personal real a servicios de prueba públicos.

En producción, las direcciones deben usar HTTPS. Las redes privadas y direcciones locales están bloqueadas. Para pruebas estrictamente locales puede configurarse el secreto `ALLOW_LOCAL_INTEGRATION_URLS=true`, pero no debe habilitarse en producción.
## Seguimiento por respuesta

En la bandeja de formularios, el botón **Flujo de estados** muestra los estados por los que ha pasado la respuesta, la fecha y el usuario que realizó cada cambio. En **Ver respuestas** se presenta además una tarjeta con todas las integraciones generadas para esa respuesta, incluyendo momento de ejecución, estado, fecha, código HTTP, duración, número de intentos y detalle del resultado.

El botón **Ver JSON enviado** muestra la copia exacta del cuerpo enviado al servicio externo. Para habilitar este registro, ejecutar `supabase/migrations/021_integration_request_payload.sql` y desplegar nuevamente la función `dispatch-integrations`. Las credenciales y los encabezados de autenticación no se guardan dentro de esta copia.

Para habilitar el nombre de la persona que realizó cada cambio, ejecutar manualmente:

`supabase/migrations/020_submission_tracking.sql`

## Prueba con Webhook.site

1. Abrir `https://webhook.site` y copiar la URL única que aparece en la página.
2. Crear una integración con esa URL, autenticación **Sin autenticación** y estado **Activa**.
3. Usar **Probar conexión**. Webhook.site debe mostrar una petición con el evento `connection.test`.
4. Asignar la integración a un formulario y seleccionar un momento, por ejemplo **Al recibir el formulario**.
5. Enviar una nueva respuesta al formulario. La petición aparecerá en Webhook.site y la bandeja mostrará la entrega como **Ejecutada**, junto con su resultado HTTP.

La URL de prueba es temporal y el contenido enviado queda almacenado en un servicio externo. No se deben utilizar datos personales o sensibles durante esta prueba.
