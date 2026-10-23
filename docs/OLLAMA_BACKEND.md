# Uso de Ollama mediante el backend local

La aplicación admite dos rutas de inteligencia artificial sin cambiar sus pantallas. Ollama ofrece una [API local](https://docs.ollama.com/api/introduction) y permite solicitar [salidas estructuradas con un esquema JSON](https://docs.ollama.com/capabilities/structured-outputs), que es el mecanismo utilizado por este backend.

- `VITE_AI_TRANSPORT=supabase`: usa las funciones remotas de Supabase y OpenAI.
- `VITE_AI_TRANSPORT=backend`: envía las operaciones al backend local, que usa Ollama.

El cambio no tiene una ruta de respaldo silenciosa. Si Ollama o el backend no están disponibles, se presenta el error al usuario y no se consume OpenAI accidentalmente.

## Configuración inicial

1. Instala Ollama desde su sitio oficial y descarga un modelo compatible con salidas estructuradas:

   ```bash
   ollama pull qwen2.5:7b
   ```

2. Crea la configuración privada del backend:

   ```bash
   cp backend/.env.example backend/.env
   ```

3. Completa `backend/.env` con la URL, la clave pública y la clave secreta de tu proyecto de Supabase. La clave secreta solo vive en este archivo local; nunca debe tener el prefijo `VITE_`.

4. En `.env.local`, conserva tus variables actuales de Supabase y agrega:

   ```dotenv
   VITE_AI_TRANSPORT=backend
   VITE_AI_BACKEND_URL=http://127.0.0.1:3001
   ```

## Ejecución

Abre tres terminales en la raíz del proyecto:

```bash
ollama serve
```

```bash
npm run backend:dev
```

```bash
npm run dev
```

La aplicación de escritorio de Ollama normalmente ya inicia el servicio; si `ollama serve` indica que el puerto está ocupado, puedes omitir ese comando. Comprueba el backend en `http://127.0.0.1:3001/health`.

## Volver a OpenAI

Cambia el valor en `.env.local` y reinicia Vite:

```dotenv
VITE_AI_TRANSPORT=supabase
```

El backend local cubre la generación de formularios, el análisis de respuestas y el asistente del dashboard. Valida la sesión de Supabase, respeta los permisos existentes y registra proveedor, modelo, duración y tokens. En Ollama, `estimated_cost_usd` queda sin valor porque no existe una tarifa por token; los costos de hardware y electricidad no se calculan automáticamente.

## Variables opcionales

- `OLLAMA_MODEL`: modelo local que se utilizará en las tres operaciones.
- `OLLAMA_BASE_URL`: dirección de Ollama si se ejecuta en otro equipo o contenedor.
- `FRONTEND_ORIGIN`: orígenes permitidos, separados por comas.
- `BACKEND_PORT`: puerto del backend local.

Cuando el frontend esté publicado en Internet no podrá comunicarse normalmente con `127.0.0.1` del desarrollador. Para un entorno compartido, este backend debe desplegarse en un servidor accesible y Ollama debe permanecer en una red privada protegida.
