# Documentos de identidad y archivos adjuntos

## Tipos de pregunta

- `photo`: fotografía capturada con la cámara.
- `photo_attachment`: fotografía seleccionada desde el dispositivo.
- `identity_document`: tipo, número, nombres y apellidos.
- `document_attachment`: archivo PDF de hasta 10 MB.

En `identity_document`, **Solicitar fotografía del documento** determina si los datos se ingresan manualmente o permanecen bloqueados hasta completar la validación visual.

## Validación visual

La fotografía se comprime en el navegador y se envía al proveedor seleccionado por `VITE_AI_TRANSPORT`. La respuesta estructurada indica si parece un documento, lado detectado, presencia de retrato, visibilidad individual de campos, valores extraídos, confianza y motivo.

Se acepta únicamente cuando:

1. Es el frente o página principal.
2. El retrato está visible.
3. Tipo, número, nombres y apellidos están directamente visibles.
4. Los cuatro valores contienen información.
5. La confianza es igual o superior a `0.85`.
6. Si es DPI, el número contiene 13 dígitos.

El modelo recibe la instrucción de no inferir información ni utilizar códigos de barras del reverso. Esta revisión es visual y no sustituye un proveedor de verificación legal de identidad.

## Almacenamiento

La migración `028_identity_documents_and_attachments.sql` crea la tabla `submission_attachments`, el bucket privado `submission-files`, sus metadatos y políticas. La migración `029_fix_public_attachment_upload_rls.sql` autoriza cargas públicas sin permitir que usuarios anónimos enumeren otros envíos.

```text
submission-files/{submission_id}/{field_id}/{attachment_id}.{extension}
```

BackOffice crea enlaces firmados temporales para abrir imágenes en un modal, previsualizar PDF y descargarlo con su nombre original. Las fotografías antiguas en Base64 se representan visualmente para conservar compatibilidad; los nuevos envíos usan Storage.

## Despliegue

Con OpenAI:

```bash
npx supabase functions deploy validate-identity-document
```

Con Ollama:

```bash
npm run backend:dev
```

No se debe registrar el contenido Base64 de la imagen en logs ni enviarlo a receptores públicos de prueba.
