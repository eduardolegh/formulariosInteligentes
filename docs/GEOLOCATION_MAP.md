# Ubicación de respuestas y mapa

La ubicación se solicita mediante una acción explícita del usuario. Si acepta, se guardan latitud, longitud, precisión aproximada y fecha de captura junto con la respuesta. Si rechaza el permiso o el dispositivo no puede obtenerla, el formulario puede enviarse sin ubicación.

También existe el tipo de pregunta `geolocation`. Esta pregunta permite capturar la ubicación actual o seleccionar manualmente un punto en OpenStreetMap. Su respuesta se almacena como `latitud|longitud`, por ejemplo:

```text
14.634915|-90.506882
```

## Base de datos

Como las migraciones de este proyecto se aplican manualmente, abre el SQL Editor de Supabase y ejecuta únicamente el contenido de:

`supabase/migrations/018_submission_geolocation.sql`

Para habilitar el nuevo tipo de pregunta, ejecuta después:

`supabase/migrations/019_geolocation_question_type.sql`

No es necesario volver a ejecutar las migraciones anteriores.

## OpenStreetMap

Para el servidor público estándar de OpenStreetMap no se configura una API key. La aplicación utiliza:

```dotenv
VITE_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_MAP_ATTRIBUTION=&copy; OpenStreetMap contributors
```

Estas variables son opcionales porque ya tienen esos valores por defecto. Permiten cambiar de proveedor de mosaicos más adelante sin modificar el componente.

La atribución debe permanecer visible. El servidor público es apropiado para visualización interactiva de volumen moderado, pero no ofrece garantía de disponibilidad. No se deben precargar, descargar masivamente ni utilizar mosaicos para modo sin conexión. En un despliegue de alto tráfico debe contratarse un proveedor compatible con datos de OpenStreetMap o alojar mosaicos propios.

## Requisitos del navegador

- En producción, la página debe servirse mediante HTTPS.
- `localhost` puede utilizarse durante el desarrollo.
- El usuario debe aceptar el permiso mostrado por el navegador.
- Si la aplicación se incrusta en un dominio diferente mediante `iframe`, será necesario permitir `geolocation` en el iframe y en la política de permisos.

## Función de integraciones

Las coordenadas también se agregaron al objeto `submission` enviado a APIs externas. Si `dispatch-integrations` ya estaba desplegada, vuelve a desplegarla:

```bash
npx supabase functions deploy dispatch-integrations
```

Si utilizas generación de formularios con OpenAI, vuelve a desplegar su función para que pueda proponer preguntas de geolocalización:

```bash
npx supabase functions deploy generate-form
```

El backend local de Ollama solo necesita reiniciarse después de actualizar el código.
