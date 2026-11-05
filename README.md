# Formularios Inteligentes

Sistema web para diseñar, publicar, responder y atender formularios con inteligencia artificial, trazabilidad, integraciones REST, geolocalización y dashboards operativos.

## Funcionalidades implementadas

- Autenticación con Supabase, perfiles, roles y permisos.
- Constructor de formularios por secciones y edición mediante modales.
- Creación y edición asistida por inteligencia artificial.
- Publicación pública o privada mediante enlace compartible.
- Ciclo de vida de formularios en alta o baja.
- Formularios con atención humana o aprobación automática.
- Contexto versionado para orientar el análisis de respuestas.
- Bandeja BackOffice por departamento con filtros, decisiones y observaciones.
- Análisis de respuestas con IA cuando el envío está ingresado y el contexto está completo.
- Historial del flujo de estados y del usuario que realizó cada cambio.
- Integraciones HTTP configurables por evento, reintentos, resultado y consulta del JSON enviado.
- Dashboard con actividad, estados, tiempos, geolocalización, BackOffice, consumo de IA y asistente conversacional.
- Registro de proveedor, modelo, duración, tokens y costo estimado de operaciones del LLM.
- Calificación de experiencia mediante estrellas al finalizar un formulario.
- Captura configurable de coordenadas generales del envío.
- Pregunta de geolocalización con ubicación actual o selección sobre OpenStreetMap.
- Preguntas de fotografía, documento de identidad y documento PDF adjunto.
- Validación visual del frente de una identificación y extracción estructurada mediante OpenAI u Ollama.
- Archivos privados en Supabase Storage, con vista previa en modal y descarga segura de PDF.

## Tecnologías

- React 19, TypeScript, Vite y React Router.
- Supabase Auth, PostgreSQL, Row Level Security, Storage y Edge Functions.
- OpenAI Responses API mediante Edge Functions.
- Backend local Node.js para modelos de Ollama.
- Leaflet y OpenStreetMap.
- Exportación de ejecuciones del LLM a Excel.

## Requisitos

- Node.js 20 o superior.
- npm.
- Proyecto de Supabase.
- Supabase CLI para desplegar funciones.
- Ollama, únicamente si se utilizarán modelos locales.

## Desarrollo local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Comandos disponibles:

```bash
npm run dev
npm run build
npm run lint
npm run backend:check
npm run backend:dev
npm run backend:start
npm run preview
```

## Variables del frontend

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICA

# OpenAI mediante Supabase
VITE_AI_TRANSPORT=supabase

# Ollama mediante el backend local
# VITE_AI_TRANSPORT=backend
VITE_AI_BACKEND_URL=http://127.0.0.1:3001

VITE_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_MAP_ATTRIBUTION=&copy; OpenStreetMap contributors
```

Solo una línea `VITE_AI_TRANSPORT` debe permanecer activa. Las líneas se comentan con `#`.

## OpenAI mediante Supabase

```bash
npx supabase secrets set OPENAI_API_KEY="TU_CLAVE"
npx supabase functions deploy generate-form
npx supabase functions deploy analyze-submission
npx supabase functions deploy dashboard-assistant
npx supabase functions deploy validate-identity-document
```

Variables opcionales:

```bash
npx supabase secrets set OPENAI_FORM_MODEL=gpt-5-nano
npx supabase secrets set OPENAI_ANALYSIS_MODEL=gpt-5-nano
npx supabase secrets set OPENAI_VISION_MODEL=gpt-5-nano
npx supabase secrets set OPENAI_INPUT_COST_PER_MILLION=VALOR
npx supabase secrets set OPENAI_OUTPUT_COST_PER_MILLION=VALOR
npx supabase secrets set OPENAI_VISION_INPUT_COST_PER_MILLION=VALOR
npx supabase secrets set OPENAI_VISION_OUTPUT_COST_PER_MILLION=VALOR
```

Las tarifas son estimaciones configurables y deben actualizarse cuando cambien los precios del proveedor.

## Ollama mediante backend local

```bash
ollama pull qwen3.5:9b
cp backend/.env.example backend/.env
npm run backend:dev
```

El backend cubre generación y edición de formularios, análisis de respuestas, asistente del dashboard y validación visual de documentos. Comprueba su estado en `http://127.0.0.1:3001/health`.

La interfaz publicada en Internet no puede acceder normalmente al Ollama de `127.0.0.1`. Para uso compartido, el backend y el modelo deben ejecutarse en infraestructura accesible y protegida.

## Base de datos y migraciones

Las migraciones están en `supabase/migrations` y actualmente abarcan de `001` a `029`. En este proyecto se han aplicado manualmente desde el SQL Editor de Supabase; deben ejecutarse en orden cuando se prepara una base nueva.

Las últimas incorporan:

- `023`: observabilidad unificada del LLM.
- `024`: captura configurable de coordenadas.
- `025`: calificación de experiencia.
- `026`: formularios con o sin atención.
- `027`: alta y baja de formularios.
- `028`: documentos de identidad, PDF y bucket privado `submission-files`.
- `029`: autorización segura de adjuntos en respuestas públicas.

No se debe ejecutar una migración manualmente y después volver a aplicarla sin revisar previamente el historial del proyecto.

## Integraciones externas

```bash
openssl rand -base64 32
npx supabase secrets set INTEGRATIONS_ENCRYPTION_KEY="VALOR_GENERADO"
npx supabase functions deploy manage-integrations
npx supabase functions deploy dispatch-integrations
```

Los eventos admitidos son recepción, inicio de revisión, aprobación, rechazo y finalización. Cada entrega guarda resultado, duración, intentos y una copia segura del JSON enviado.

## Archivos y documentos

Las imágenes y los PDF nuevos se almacenan en el bucket privado `submission-files`. La base de datos conserva metadatos y rutas. BackOffice obtiene enlaces firmados temporales para visualizar imágenes, previsualizar PDF y descargarlos.

La validación de identidad exige frente o página principal, retrato visible, cuatro datos visibles, confianza mínima del 85 % y, para DPI, un número de 13 dígitos. Esta revisión confirma que la captura parece un documento legible; no certifica autenticidad legal ni consulta registros gubernamentales.

## Verificación antes de publicar

```bash
npm run lint
npm run backend:check
npm run build
```

También se recomienda probar formularios públicos y privados, respuestas anónimas y autenticadas, archivos, decisiones, integraciones, dashboard y exportación.

## Documentación

- [Documento de implementación](docs/IMPLEMENTACION.md)
- [Backend local con Ollama](docs/OLLAMA_BACKEND.md)
- [Observabilidad del LLM](docs/LLM_OBSERVABILITY.md)
- [Documentos y archivos adjuntos](docs/DOCUMENTOS_ADJUNTOS.md)
- [Integraciones externas](docs/INTEGRACIONES_EXTERNAS.md)
- [Geolocalización y mapa](docs/GEOLOCATION_MAP.md)
- [Planteamiento del proyecto](docs/PLANTEAMIENTO.md)
- [Diagramas](docs/diagramas/README.md)
- [Decisiones técnicas](docs/decisiones/README.md)

## Seguridad

- Nunca colocar `service_role` o claves secretas en variables `VITE_`.
- Mantener privados `.env.local` y `backend/.env`.
- Utilizar HTTPS en producción para cámara y geolocalización.
- Mantener Row Level Security activa.
- No utilizar información personal real en receptores públicos de prueba.
- Tratar fotografías de identidad y ubicaciones como información sensible.
