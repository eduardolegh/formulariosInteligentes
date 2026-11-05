# Observabilidad de tareas del LLM

Esta funcionalidad registra las tareas de inteligencia artificial distintas del análisis de respuestas: generación y edición de formularios, consultas al asistente del dashboard y validaciones visuales de documentos de identidad.

## Instalación

1. Abra el editor SQL de Supabase y ejecute completo el archivo `supabase/migrations/023_llm_operation_runs.sql`.
2. Despliegue nuevamente las funciones que utilizan OpenAI:

   ```bash
   npx supabase functions deploy generate-form
   npx supabase functions deploy dashboard-assistant
   npx supabase functions deploy validate-identity-document
   ```

3. Si utiliza Ollama, reinicie el backend local:

   ```bash
   npm run backend:dev
   ```

4. Reinicie o vuelva a desplegar la aplicación web para mostrar la nueva sección del dashboard.

## Verificación

Genere o edite un formulario y luego abra el dashboard. La sección **Ejecuciones de otras tareas** muestra las últimas diez ejecuciones del período seleccionado. El botón **Exportar todas** genera un archivo Excel con todos los registros que el usuario tiene permiso de consultar.

Los análisis de respuestas no se duplican en esta sección porque continúan mostrándose en sus indicadores especializados. Las validaciones de identidad aparecen como **Validación de identidad** e incluyen proveedor, modelo, duración y tokens, pero no guardan la imagen en los logs. Las generaciones y ediciones anteriores a la creación de la tabla no pueden reconstruirse; las consultas históricas del asistente sí se copian automáticamente durante la migración.
