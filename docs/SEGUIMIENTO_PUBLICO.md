# Seguimiento público de solicitudes

Esta funcionalidad permite que un formulario solicite un correo electrónico, genere un código de seguimiento y envíe un enlace para consultar el avance sin iniciar sesión.

## Flujo funcional

1. El diseñador activa **Seguimiento** desde el editor del formulario.
2. Al responder, aparece el campo obligatorio **Correo para seguimiento**.
3. El envío genera dos credenciales:
   - Un código legible con formato `FI-XXXXXXXX-XXXXXXXX`.
   - Un token UUID utilizado por el enlace directo.
4. La Edge Function `send-tracking-email` valida el token y envía el correo mediante Resend.
5. La confirmación muestra el código aunque el proveedor de correo no esté disponible.
6. El solicitante consulta desde `/seguimiento` o desde `/seguimiento/:token`.

La vista principal solo muestra nombre del formulario, estado y fechas. Las respuestas se consultan bajo demanda con el mismo código o token secreto; nunca se exponen observaciones internas, correo, identificadores de base de datos ni usuarios BackOffice.

El solicitante puede abrir **Ver respuestas** después de consultar correctamente el seguimiento. El portal muestra textos y datos estructurados; para fotografías y PDF indica que el archivo fue recibido y su nombre, pero no publica enlaces al bucket privado.

## Base de datos

Ejecutar manualmente en el SQL Editor de Supabase:

```text
supabase/migrations/030_public_submission_tracking.sql
```

La migración agrega:

- `forms.tracking_enabled`.
- Correo, código y token en `form_submissions`.
- Tabla `submission_tracking_emails` para auditar envíos.
- Validación de los datos de seguimiento.
- Función pública restringida `get_public_submission_tracking`.

Después de aplicar `030`, ejecutar también:

```text
supabase/migrations/031_public_tracking_answers.sql
```

## Secretos

```bash
npx supabase secrets set RESEND_API_KEY="re_xxxxxxxxx" --project-ref orwkfzozeasdomkmuqhf
npx supabase secrets set TRACKING_FROM_EMAIL="seguimiento@formulariosinteligentesai.app" --project-ref orwkfzozeasdomkmuqhf
npx supabase secrets set TRACKING_FROM_NAME="Formularios Inteligentes" --project-ref orwkfzozeasdomkmuqhf
npx supabase secrets set PUBLIC_APP_URL="https://formulariosinteligentesai.app" --project-ref orwkfzozeasdomkmuqhf
```

La clave de Resend nunca debe utilizar el prefijo `VITE_` ni incluirse en el frontend.

## Despliegue

La función se invoca desde formularios públicos y realiza su propia validación mediante el token del seguimiento:

```bash
npx supabase functions deploy send-tracking-email --no-verify-jwt --project-ref orwkfzozeasdomkmuqhf
```

Después se debe desplegar nuevamente el frontend en Vercel. `vercel.json` configura el fallback necesario para abrir directamente los enlaces del portal.

## Prueba recomendada

1. Activar seguimiento en un formulario publicado.
2. Abrir el enlace para responder en una ventana privada.
3. Confirmar que el correo sea obligatorio.
4. Enviar una respuesta con una dirección propia.
5. Guardar el código mostrado en la confirmación.
6. Abrir el enlace recibido por correo.
7. Consultar el mismo envío manualmente desde `/seguimiento`.
8. Cambiar su estado desde BackOffice y actualizar el portal.
9. Confirmar en Resend la entrega y en `submission_tracking_emails` el estado `sent`.
10. Repetir con Resend temporalmente no disponible para comprobar que el código siga mostrándose.

