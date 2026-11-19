# RACSA Biometric ID: manual de integración web por iframe y API para Kiro

Fecha de consulta: **16 de noviembre de 2026**. Idioma: español.

## 1. Alcance y fuentes

Este documento explica la integración web de RACSA y el contrato público de su API. Está dirigido a un agente que necesita entender una implementación existente, consumir los resultados e investigar errores sin inventar protocolos.

Fuentes oficiales consultadas:

- [W: SDK Web](https://biometricid.racsa.go.cr/site/sdkweb/docs/).
- [A: API](https://biometricid.racsa.go.cr/site/api/docs/).
- [O: OpenAPI JSON enlazado desde Swagger](https://biometricid.racsa.go.cr/site/api/docs/swagger-ui-master/swagger.json).
- [S: Swagger UI](https://biometricid.racsa.go.cr/site/api/docs/swagger-ui-master/dist/).
- [U: instalación de lectores USB](https://biometricid.racsa.go.cr/site/sdkweb/docs/fingersdk/installers/).

Las letras W, A, O y U que aparecen más adelante identifican la procedencia de los datos. Los ejemplos adaptados y recomendaciones se marcan como tales. Se consultó documentación pública; no se ejecutaron consultas biométricas, no se usaron credenciales y no se inspeccionó el código de tu aplicación.

Este es un manual explicativo con el inventario completo de operaciones y esquemas del OpenAPI encontrado. Los ejemplos no son resultados de pruebas reales. No es una promesa de que todo campo aparezca en cada respuesta. Conserva las siete imágenes originales del SDK web en `assets/`, y el OpenAPI en `fuentes/openapi.json`. Las páginas HTML originales están en `fuentes/` para contrastar diferencias.

## 2. Diferencia entre las dos integraciones

| Aspecto | SDK web mediante iframe | API REST |
| --- | --- | --- |
| Punto de entrada | `https://websdkbiometricid.racsa.go.cr` | Base pública utilizada en los ejemplos: `https://apibiometricid.racsa.go.cr/bioapi` |
| Integración inicial | Insertar iframe y enviar configuración con `postMessage` | Enviar solicitudes HTTP con encabezados y cuerpos JSON |
| Identificación | `CLIENTE_ID` en query string `id`; `apiKey` y `userEmail` por mensaje | `ApiKey`, autorización y datos de la operación |
| Interfaz/captura | La interfaz se ejecuta en el iframe de RACSA | La aplicación debe resolver la captura y generar los formatos exigidos |
| Resultado disponible para la app | La guía W no define los mensajes que salen del iframe | Respuestas y esquemas descritos por A y O |
| Huella | Requiere el SDK local del lector USB | `finger` y `fingerPrint` con huella WSQ en Base64 |
| Rostro | La guía delega cámara al iframe | `fullFacePhoto`, fotografía JPEG en Base64 |

**Para la implementación actual del usuario:** el usuario indica que lee información del iframe. Ese comportamiento observado debe investigarse en su código; la guía pública W solo documenta el mensaje de configuración que entra al iframe. No especifica que el mensaje de salida tenga la misma estructura que `BiometricVerifiedResponse`, ni ofrece un endpoint para recuperar resultados usando únicamente `transactionId`.

Tampoco debe trasladarse automáticamente el contrato de `BiometricQueryView` del SDK React Native a la integración web: son interfaces distintas.

## 3. Configuración en selfservice

### 3.1 Datos necesarios

Según W:

- API key válida para el SDK web.
- Correo de un usuario creado en selfservice.
- Identificador del cliente, `CLIENTE_ID`.
- Dominio de la aplicación autorizado en la API key.
- Tipos de documento habilitados por la suscripción del cliente. Si no hay ninguno, se requiere la intervención del administrador.
- SDK local instalado si se usará lector de huellas.

No confundir `CLIENTE_ID` con la API key, el número de documento, el usuario o el ID de una transacción.

### 3.2 Crear una API key web

Si ya existe una apropiada, la guía permite omitir su creación. El procedimiento es: iniciar sesión, abrir la sección Api Keys, elegir agregar, asignar nombre, seleccionar tipo SDK web y registrar los dominios autorizados separados por comas. La imagen de la interfaz denomina el tipo “Sitio Web”.

![Inicio de sesión para API key](assets/apikey_1.png)

![Acceso a Api Keys](assets/apikey_2.png)

![Agregar API key](assets/apikey_3.png)

![Nombre, tipo y dominios autorizados](assets/apikey_4.png)

La captura incluye un ejemplo con `localhost:8000`. Esto no garantiza que otro puerto, dominio o entorno esté autorizado. Usar los datos configurados para el proyecto.

### 3.3 Obtener CLIENTE_ID

Iniciar sesión, entrar a Api Keys y usar “Copiar Cliente Id”.

![Inicio de sesión para obtener cliente](assets/clienteid_1.png)

![Sección de API keys para cliente](assets/clienteid_2.png)

![Copiar Cliente Id](assets/clienteid_3.png)

## 4. Integración del iframe

### 4.1 Construcción del iframe

W define este patrón:

```html
<iframe
  id="sdkFrame"
  class="sdk"
  src="https://websdkbiometricid.racsa.go.cr?id=CLIENTE_ID"
  frameborder="0"
  allow="camera 'src'"
></iframe>
```

Reemplazar `CLIENTE_ID` por el valor real, codificado correctamente como parámetro de URL. `sdkFrame` debe coincidir con el ID que usa el script. La clase `sdk` no viene acompañada de reglas CSS en la guía. `frameborder` aparece en el ejemplo oficial; no es un requisito de autenticación.

### 4.2 Mensaje de inicialización

Después de cargar el iframe, W envía un objeto con exactamente estas claves:

```js
{
  apiKey: "API_KEY",
  userEmail: "USUARIO_SELFSERVICE"
}
```

El ejemplo oficial usa `iframe.onload` y `this.contentWindow.postMessage(msg, this.src)`. El script se incluye al final del `body` con `<script src="index.js"></script>`.

**Corrección de sintaxis necesaria al copiar:** el ejemplo publicado contiene comillas tipográficas `”` alrededor de los valores. Deben convertirse a comillas ASCII válidas en JavaScript.

### 4.3 Ejemplo adaptado con receptor de mensajes

El envío de `apiKey`/`userEmail` deriva de W. El filtrado y receptor siguientes son recomendaciones de integración; **no constituyen un protocolo de eventos publicado por RACSA**.

```html
<div id="racsa-container"></div>
<script>
  const sdkOrigin = "https://websdkbiometricid.racsa.go.cr";
  const sdkUrl = new URL(sdkOrigin);
  sdkUrl.searchParams.set("id", "REEMPLAZAR_CLIENTE_ID");

  const frame = document.createElement("iframe");
  frame.id = "sdkFrame";
  frame.title = "Verificación biométrica RACSA";
  frame.setAttribute("allow", "camera 'src'");

  // Registrar el receptor antes de iniciar la carga.
  window.addEventListener("message", (event) => {
    if (event.origin !== sdkOrigin) return;
    if (event.source !== frame.contentWindow) return;

    // El formato real no está documentado en W.
    // Validar event.data con un esquema confirmado antes de utilizarlo.
    // No asumir aquí event.data.hit, event.data.token o event.data.type.
    // No convertir cualquier mensaje en una verificación exitosa.
  });

  frame.addEventListener("load", () => {
    frame.contentWindow?.postMessage(
      {
        apiKey: "REEMPLAZAR_API_KEY_WEB",
        userEmail: "REEMPLAZAR_USUARIO_SELFSERVICE"
      },
      sdkOrigin
    );
  });

  frame.src = sdkUrl.href;
  document.getElementById("racsa-container").appendChild(frame);
</script>
```

Este ejemplo requiere valores reales y adaptación al ciclo de vida del framework. No lleva lógica de extracción del resultado porque su esquema no fue publicado en W. La API key del SDK web forma parte de la inicialización del navegador según la propia guía; no confundirla con credenciales de backend que no deban enviarse al cliente.

### 4.4 Cómo investigar los datos que se leen del iframe

Guía de diagnóstico propuesta para Kiro:

1. Encontrar los listeners `message`, `postMessage`, puentes de WebView, callbacks y transformaciones que ya tenga la aplicación.
2. Comprobar origen y ventana emisora antes de interpretar los datos.
3. Determinar si `event.data` es un objeto, una cadena JSON o un envoltorio. No parsear incondicionalmente todo con `JSON.parse`.
4. Obtener una muestra autorizada y anonimizada o tipos suministrados por RACSA. Registrar para diagnóstico solo metadatos mínimos, evitando datos biométricos, documentos, API keys y tokens.
5. Distinguir configuración, estado, error y resultado únicamente si esos tipos están confirmados. No inventar nombres como `success`, `completed`, `biometricResult` ni un handshake de “ready”.
6. Limpiar listeners al desmontar la integración y comprobar si la aplicación vuelve a montar el iframe, repite la inicialización o procesa el mismo evento varias veces.
7. Si se necesita consultar la API después del iframe, confirmar que el SDK realmente entrega el token y autorización apropiados. No hay un mecanismo documentado para obtenerlos a partir del ID de transacción solamente.

La guía W tampoco publica tamaño dinámico, cancelación, expiración, errores del iframe, reanudación, esquema de resultados ni eventos de cámara. Estas son preguntas para RACSA o para una inspección de la integración autorizada, no huecos que el agente deba rellenar por intuición.

## 5. Lectores USB y servicio local

Fuente U. Los instaladores están enlazados; no se descargaron ni ejecutaron en esta tarea.

| Lector | Instalador oficial | Ejecución después de descomprimir |
| --- | --- | --- |
| Futronic | [FutronicInstalador.zip](https://biometricid.racsa.go.cr/site/sdkweb/docs/fingersdk/installers/FutronicInstalador.zip) | `Setup\Setup_FtrScanHttpServer.msi`; después reiniciar el equipo |
| Digitalpersona | [DigitalPersonaInstalador.zip](https://biometricid.racsa.go.cr/site/sdkweb/docs/fingersdk/installers/DigitalPersonaInstalador.zip) | `SDK\x64\setup.exe`; después reiniciar el equipo |

U atribuye problemas de acceso a los SDK de huella a restricciones de red local desde Chrome 142. Publica como solución temporal cambiar la función `local-network-access-check` en `chrome://flags/#local-network-access-check` o `edge://flags/#local-network-access-check` mientras llegan actualizaciones del fabricante.

Este es un workaround descrito por RACSA, no una configuración permanente recomendada por este manual ni una comprobación del comportamiento actual de cada navegador. No se modificó ningún navegador. Antes de actuar, comprobar la versión, permisos y actualizaciones del fabricante. U no especifica aquí puertos, endpoints locales ni una API JavaScript de los lectores.

## 6. API REST: flujo, URLs y autenticación

### 6.1 Flujo secuencial

```text
Opcional: DocumentTypesQuery → tipos habilitados
DocumentQuery → disponibilidad, métodos, token A, transactionId
BiometricVerification con token A → hit, intentos y, si tiene éxito, token B
ExternalSourceQuery con token B → información de una fuente autorizada
```

“token A” y “token B” son nombres explicativos del manual. Ambos se llaman `token` en las respuestas. No son credenciales intercambiables por definición.

### 6.2 Operaciones encontradas

| Método | Ruta del OpenAPI | Uso |
| --- | --- | --- |
| GET | `/api/DocumentTypesQuery` | Lista de tipos de documento disponibles |
| POST | `/api/DocumentQuery` | Consulta de documento y disponibilidad biométrica |
| POST | `/api/BiometricVerification` | Verificación facial o por huella |
| POST | `/api/ExternalSourceQuery` | Consulta de información externa |

La guía A muestra URLs públicas como `https://apibiometricid.racsa.go.cr/bioapi/api/DocumentQuery`. O declara `servers: [{"url":"/"}]` y una extensión de gateway `x-wso2-basePath: /bioapi/v1`. **Existe una diferencia de base path**: no agregar `/v1` automáticamente ni llamar los hosts internos que aparecen en las extensiones del gateway. Confirmar con RACSA o con la configuración operativa del proyecto cuál base pública aplica. Este manual usa la base de los ejemplos A y no la ha probado con credenciales.

### 6.3 Encabezados

Todas las solicitudes: `ApiKey: API_KEY` según A.

Para `DocumentQuery`, A exige además:

```http
ApiKey: API_KEY
Authorization: ApiKey API_KEY
Content-Type: application/json
Accept: application/json
```

Para `BiometricVerification`:

```http
ApiKey: API_KEY
Authorization: Bearer TOKEN_DE_DOCUMENT_QUERY
Content-Type: application/json
Accept: application/json
```

Para `ExternalSourceQuery`, A vincula el acceso al token entregado por la verificación exitosa; usar ese token como Bearer es la interpretación conjunta de A y el esquema JWT de O. A no proporciona un ejemplo completo de encabezados para esta operación.

Para `DocumentTypesQuery`, O declara seguridad general pero A no da un ejemplo específico de autorización. `ApiKey` es el requisito global documentado; no asumir que el mismo encabezado adicional de `DocumentQuery` está confirmado para todos los endpoints.

O representa `JWT` como un esquema `apiKey` en el encabezado `Authorization`, cuya descripción pide `Bearer {token}`. También incluye un esquema `default` OAuth2 con `authorizationUrl: https://test.com`. No implementar un login contra ese URL de ejemplo. Los requisitos `security` de O aparecen como alternativas JWT/default y no describen fielmente todos los encabezados de A. Las extensiones indican `ApiKey` como auth header del gateway.

## 7. DocumentTypesQuery

Fuente O. Método GET, sin cuerpo documentado. El ejemplo siguiente de respuesta es **construido a partir del esquema**, no una respuesta observada:

```json
{
  "documentTypesAvailable": ["National", "Foreigner"]
}
```

No significa que ambos estén habilitados para tu cliente. Los valores válidos del enum son `National` y `Foreigner`; mostrar solamente los devueltos por el servicio. No enviar etiquetas de interfaz como “Nacional” o “Extranjero” en lugar de los valores del contrato.

O declara respuestas 200, 400, 401 y 500. No especifica el mensaje del 401. Para el detalle exacto de tipos y requeridos, ver el catálogo de esquemas al final.

## 8. DocumentQuery

Fuentes A y O. Permite determinar si un documento puede verificarse y qué métodos están disponibles.

### 8.1 Solicitud

```http
POST https://apibiometricid.racsa.go.cr/bioapi/api/DocumentQuery
```

```json
{
  "documentType": "Foreigner",
  "documentNumber": "1234566",
  "userEmail": "usuario-autorizado@example.com"
}
```

`documentNumber` es una cadena, no un número aritmético. O exige longitud mínima 1 y marca `documentType` y `documentNumber` como requeridos. Aunque O permite `userEmail` nulo y no lo marca requerido, A exige un correo creado en el selfservice por el cliente dueño de la API key; enviarlo es un requisito funcional documentado.

### 8.2 Respuesta disponible

Ejemplo adaptado de A:

```json
{
  "biometricAvailable": true,
  "token": "TOKEN_DE_DOCUMENT_QUERY",
  "availableFingers": ["RightThumb", "RightIndex"],
  "facialRecognitionAvailable": false,
  "name": "Nombre de ejemplo",
  "surname": "Primer apellido",
  "secondSurname": "Segundo apellido",
  "transactionId": "TRANSACCION_DE_EJEMPLO"
}
```

El token se necesita para `BiometricVerification`. Seleccionar huellas solo de `availableFingers`; habilitar rostro solo cuando corresponda a `facialRecognitionAvailable`. Los datos personales pueden faltar o ser nulos según los esquemas.

### 8.3 Documento no disponible

```json
{
  "transactionId": "TRANSACCION_DE_EJEMPLO",
  "biometricAvailable": false
}
```

O asigna la no disponibilidad a HTTP 404. A indica que HTTP 200 también requiere interpretar `biometricAvailable`, y muestra ese cuerpo sin asociarle un status en el ejemplo. Manejar tanto la disponibilidad del cuerpo como el status; no continuar solo porque llegó una respuesta HTTP.

## 9. BiometricVerification

Fuentes A y O. Requiere el token de la consulta del documento. La solicitud permite rostro o huella; el esquema tiene campos opcionales, pero la lógica del servicio rechaza la ausencia de ambas alternativas.

```http
POST https://apibiometricid.racsa.go.cr/bioapi/api/BiometricVerification
```

### 9.1 Rostro

```json
{
  "fullFacePhoto": "BASE64_DE_UNA_FOTOGRAFIA_JPEG"
}
```

A especifica JPEG codificado en Base64. No se debe suponer que PNG, URL remota, una ruta local o una cadena `data:image/...` son equivalentes; el prefijo data URL no está documentado. No se publican aquí límites de tamaño, resolución, calidad o condiciones de captura.

### 9.2 Huella

```json
{
  "finger": "RightThumb",
  "fingerPrint": "BASE64_DE_UNA_HUELLA_WSQ"
}
```

La huella debe estar en formato WSQ codificado en Base64. La foto de un dedo en JPEG no satisface ese formato por sí misma. Elegir un dedo disponible para ese documento.

Enum `Finger` completo:

| Valor | Dedo |
| --- | --- |
| `RightThumb` | Pulgar derecho |
| `RightIndex` | Índice derecho |
| `RightMiddle` | Medio derecho |
| `RightRing` | Anular derecho |
| `RightLittle` | Meñique derecho |
| `LeftThumb` | Pulgar izquierdo |
| `LeftIndex` | Índice izquierdo |
| `LeftMiddle` | Medio izquierdo |
| `LeftRing` | Anular izquierdo |
| `LeftLittle` | Meñique izquierdo |

La fuente no define precedencia ni comportamiento al enviar simultáneamente foto y huella. Enviar la modalidad elegida sin mezclar campos innecesarios.

### 9.3 Resultado exitoso

Ejemplo adaptado con todos los campos mostrados por A; fechas, puntajes y datos son ilustrativos:

```json
{
  "hit": true,
  "documentImage": "BASE64_IMAGEN_DOCUMENTO",
  "documentExpirationDate": "2024-10-25T00:00:00",
  "token": "TOKEN_PARA_FUENTES_EXTERNAS",
  "externalDataSources": [],
  "transactionId": "TRANSACCION_DE_EJEMPLO",
  "remainingTries": 1,
  "scoreResult": 0,
  "scoreLimit": 0,
  "documentNumber": "123456789",
  "oldDocumentNumber": "2223333444",
  "lastName": "Apellido",
  "secondLastName": "Segundo apellido",
  "name": "Nombre",
  "category": "CATEGORY",
  "birthDay": "2023-06-09T15:07:11.978Z",
  "dateIssue": "2023-06-09T15:07:11.978Z",
  "nationality": "Colombian",
  "gender": "M",
  "status": "STATUS"
}
```

- `hit` es el resultado biométrico publicado; no deducirlo mediante un umbral propio a partir de `scoreResult` y `scoreLimit`.
- `token` corresponde al siguiente paso: fuentes externas.
- `externalDataSources` identifica las fuentes disponibles; puede ser vacío o nulo en O.
- `transactionId` permite correlacionar operaciones; no reemplaza el token.
- `documentImage` se muestra como Base64, pero el tipo MIME no se fija aquí.
- `documentExpirationDate` es string nullable sin formato date-time declarado en O; `birthDay` y `dateIssue` sí tienen formato date-time. No asumir zona horaria cuando la cadena no la incluye.
- La fecha vencida y los ceros del ejemplo no son valores operativos ni reglas del sistema.
- Los apellidos cambian de nombres entre respuestas: `surname`/`secondSurname` en DocumentQuery y `lastName`/`secondLastName` aquí.

### 9.4 Falta de coincidencia

```json
{
  "transactionId": "TRANSACCION_DE_EJEMPLO",
  "remainingTries": 1,
  "hit": false,
  "scoreResult": 0,
  "scoreLimit": 0
}
```

A y O asocian la falta de coincidencia a HTTP 404. Ese cuerpo es una respuesta biométrica estructurada, no necesariamente `ProblemDetails`. Si la librería HTTP rechaza los 404, conservar e interpretar el cuerpo correspondiente. No perder `remainingTries` ni asumir que todo error trae `detail`.

No se publica el número inicial universal de intentos ni una política de reinicio. A documenta un error por intentos agotados. No repetir automáticamente verificaciones ni crear transacciones para eludir el límite.

## 10. ExternalSourceQuery

Fuentes A y O. Consultar después de una verificación exitosa y con el token destinado a fuentes externas. Los valores del enum son `CCSS` y `CST`; no se expande el significado de CST en las fuentes consultadas.

```http
POST https://apibiometricid.racsa.go.cr/bioapi/api/ExternalSourceQuery
```

Cuerpo según **el esquema formal** `ExternalSourceRequest`:

```json
{
  "externalSource": "CCSS"
}
```

**Inconsistencia de O:** su descripción de ejemplo usa `ExternalSourceType`, mientras que el esquema requiere `externalSource` y prohíbe propiedades adicionales. Usar el esquema como punto de partida y confirmar con el servicio; no enviar ambos nombres para compensar la diferencia.

Aunque la tabla de errores A menciona documentos, tipo y transacción al describir una discordancia con el origen, el request publicado en O solo contiene `externalSource`. No inventar esos campos de entrada: el vínculo podría resolverse con la sesión/token, pero el mecanismo no está explicado aquí.

Respuesta 200 ilustrativa **generada a partir del esquema**:

```json
{
  "transactionId": "TRANSACCION_DE_EJEMPLO",
  "listFields": [
    {
      "fieldType": "Text",
      "name": "Campo de ejemplo",
      "value": "Valor de ejemplo"
    }
  ]
}
```

Cada campo requiere `fieldType` y `name`. `value` puede ser nulo y no tiene un tipo único declarado. Los tipos de presentación son `Text`, `Int`, `Double`, `Bool`, `Date`, `Link`, `Image`. El nombre de cada dato externo no es fijo en el esquema. Validar valores antes de formatearlos; no ejecutar HTML o URLs recibidas como código.

O define para 404 un `ExternalSourceResponseNotFound` que hereda `transactionId`. A también lista el mensaje de persona no encontrada; manejar ambos formatos reales según status y cuerpo. A documenta 401 por token expirado o fuente no autorizada y exige una nueva verificación biométrica; ese 401 no está declarado en la operación de O.

## 11. Estados HTTP y catálogo de errores

Las tablas siguientes conservan los mensajes técnicos exactos publicados por RACSA como claves de diagnóstico. Las explicaciones son paráfrasis. No asumir que un 500 siempre significa una excepción interna de tu aplicación: A también lo utiliza para condiciones funcionales y de configuración.

### 11.1 DocumentQuery

| HTTP | Mensaje publicado | Interpretación |
| --- | --- | --- |
| 200 | `—` | Documento consultado: revisar disponibilidad en el cuerpo. |
| 400 | `(detalle de validación)` | Entrada inválida: revisar campos. |
| 404 | `—` | Documento no encontrado. |
| 500 | `An error occurred when querying document types` | Fallo al cargar tipos habilitados. |
| 500 | `Document type {documentType} is not available for the query` | Tipo no habilitado para el cliente. |
| 500 | `The {userEmail} is required` | Falta el correo del usuario. |
| 500 | `Ocurrio un error al consultar el usuario` | Fallo al consultar el usuario en backoffice. |
| 500 | `Error de autenticación` | No se pudo identificar al cliente. |
| 500 | `No se encontró una sucursal válida dentro de la sesión` | Sucursal o asociación de usuario/API key inválida para nacionales. |
| 500 | `Ocurrio un error con la respuesta de TSE` | Respuesta no exitosa de TSE. |
| 500 | `Ocurrio un error al conectarse con el servicio de nacionales` | Excepción de comunicación con TSE. |
| 500 | `Error en la conexión con el servicio` | Conexión fallida con proveedor de extranjería. |

### 11.2 BiometricVerification

| HTTP | Mensaje publicado | Interpretación |
| --- | --- | --- |
| 200 | `—` | Coincidencia biométrica; puede continuar a fuentes externas. |
| 400 | `(detalle de validación)` | Entrada inválida. |
| 404 | `—` | Sin coincidencia; conservar intentos restantes. |
| 500 | `Debe enviar huella o foto` | No se envió ninguna modalidad biométrica. |
| 500 | `Intentos máximos alcanzados` | No quedan intentos de verificación. |
| 500 | `Ocurrio un error al verificar el liveness` | Respuesta no exitosa del servicio de liveness. |
| 500 | `Ocurrio un error con el servicio de liveness` | Fallo al procesar la respuesta de liveness. |
| 500 | `Error en la conexión con el servicio` | Fallo de conexión con Innovatrics o DGME. |
| 500 | `Ocurrio un error con la verificación facial` | Fallo interno facial de DGME. |
| 500 | `No se encontró una sucursal válida dentro de la sesión` | Sucursal de sesión no válida. |
| 500 | `Ocurrio un error con el servicio de TSE, código: {código}, mensaje: {mensaje}` | Respuesta inválida o no exitosa de TSE al verificar huella. |
| 500 | `No se encontró al menos una huella de la persona en TSE` | Sin huellas de referencia en TSE. |
| 500 | `Ocurrio un error al conectarse con el servicio de nacionales` | Excepción de comunicación con TSE al verificar huella. |

### 11.3 ExternalSourceQuery

| HTTP | Mensaje publicado | Interpretación |
| --- | --- | --- |
| 200 | `—` | Datos externos consultados. |
| 400 | `(detalle de validación)` | Entrada inválida. |
| 401 | `—` | Sesión expirada o fuente no autorizada: repetir verificación biométrica. |
| 404 | `La persona no fue encontrada` | Sin información de la persona en esa fuente. |
| 500 | `No coinciden los datos con la transacción de origen` | Discordancia con los datos de la operación de origen. |
| 500 | `Ocurrio un error con el servicio` | Fallo de conexión con CCSS o CST. |

### 11.4 Formas de error

Ejemplo adaptado de `ProblemDetails`:

```json
{"title":"La solicitud fue recibida pero no pudo ser procesada","status":500,"detail":"Detalle del error"}
```

Ejemplo adaptado de `ValidationProblemDetails`:

```json
{"title":"One or more validation errors occurred.","status":400,"errors":{"Campo":["Descripción de validación"]}}
```

O también permite `type`, `instance` y propiedades adicionales en los detalles de problema. No asumir que todo cuerpo tiene `hit`, `token`, `detail` o `errors`. La falta de coincidencia biométrica y la no disponibilidad del documento tienen esquemas propios.

## 12. Catálogo completo de esquemas OpenAPI

Fuente O. A continuación se incluyen todos los modelos encontrados, sus propiedades, tipos, nulabilidad y obligatoriedad. `allOf` significa composición: para interpretar el modelo hay que considerar también los esquemas heredados. “No” en requerido no obliga a que el servidor lo omita; significa que no está en la lista `required` de ese bloque. `nullable` y opcional son conceptos distintos.

### `BiometricVerifiedResponse`

Incluye `BiometricVerificationResponseBase`.

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `hit` | `boolean` | Sí | No declarada | default=true |
| `documentImage` | `string` | No | Sí | — |
| `documentExpirationDate` | `string` | No | Sí | — |
| `token` | `string` | No | Sí | — |
| `externalDataSources` | `array de ExternalSourceEnumeration` | No | Sí | — |
| `documentNumber` | `string` | No | Sí | — |
| `oldDocumentNumber` | `string` | No | Sí | — |
| `lastName` | `string` | No | Sí | — |
| `secondLastName` | `string` | No | Sí | — |
| `name` | `string` | No | Sí | — |
| `category` | `string` | No | Sí | — |
| `birthDay` | `string` | No | Sí | format="date-time" |
| `dateIssue` | `string` | No | Sí | format="date-time" |
| `nationality` | `string` | No | Sí | — |
| `gender` | `string` | No | Sí | — |
| `status` | `string` | No | Sí | — |

Propiedades adicionales: `false`.

### `ExternalSourceEnumeration`

Valores: `CCSS`, `CST`.

### `BiometricVerificationResponseBase`

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `transactionId` | `string` | Sí | No declarada | minLength=1 |
| `remainingTries` | `integer` | No | No declarada | format="int32" |
| `hit` | `boolean` | Sí | No declarada | default=false |
| `scoreResult` | `number` | No | No declarada | format="double" |
| `scoreLimit` | `number` | No | No declarada | format="double" |

Propiedades adicionales: `false`.

### `ProblemDetails`

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `type` | `string` | No | Sí | — |
| `title` | `string` | No | Sí | — |
| `status` | `integer` | No | Sí | format="int32" |
| `detail` | `string` | No | Sí | — |
| `instance` | `string` | No | Sí | — |

Propiedades adicionales: `{"nullable": true}`.

### `ValidationProblemDetails`

Incluye `HttpValidationProblemDetails`.

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `errors` | `object; valores {"type": "array", "items": {"type": "string"}}` | No | No declarada | — |

Propiedades adicionales: `{"nullable": true}`.

### `HttpValidationProblemDetails`

Incluye `ProblemDetails`.

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `errors` | `object; valores {"type": "array", "items": {"type": "string"}}` | No | No declarada | — |

Propiedades adicionales: `{"nullable": true}`.

### `BiometricVerificationRequest`

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `finger` | `oneOf: Finger` | No | Sí | — |
| `fingerPrint` | `string` | No | Sí | — |
| `fullFacePhoto` | `string` | No | Sí | — |

Propiedades adicionales: `false`.

### `Finger`

Valores: `RightThumb`, `RightIndex`, `RightMiddle`, `RightRing`, `RightLittle`, `LeftThumb`, `LeftIndex`, `LeftMiddle`, `LeftRing`, `LeftLittle`.

### `DocumentAvailableResponse`

Incluye `DocumentQueryResponseBase`.

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `biometricAvailable` | `boolean` | Sí | No declarada | default=true |
| `token` | `string` | Sí | No declarada | minLength=1 |
| `availableFingers` | `array de Finger` | Sí | No declarada | — |
| `facialRecognitionAvailable` | `boolean` | Sí | No declarada | — |
| `name` | `string` | No | Sí | — |
| `surname` | `string` | No | Sí | — |
| `secondSurname` | `string` | No | Sí | — |

Propiedades adicionales: `false`.

### `DocumentQueryResponseBase`

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `transactionId` | `string` | Sí | No declarada | minLength=1 |
| `biometricAvailable` | `boolean` | Sí | No declarada | default=false |

Propiedades adicionales: `false`.

### `DocumentQueryRequest`

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `documentType` | `DocumentTypeEnumeration` | Sí | No declarada | — |
| `documentNumber` | `string` | Sí | No declarada | minLength=1 |
| `userEmail` | `string` | No | Sí | — |

Propiedades adicionales: `false`.

### `DocumentTypeEnumeration`

Valores: `National`, `Foreigner`.

### `DocumentTypesQueryAvailableResponse`

Incluye `DocumentTypesQueryBaseResponse`.

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `documentTypesAvailable` | `array de DocumentTypeEnumeration` | Sí | No declarada | — |

Propiedades adicionales: `false`.

### `DocumentTypesQueryBaseResponse`

Propiedades adicionales: `false`.

### `ExternalSourceResponseOk`

Incluye `ExternalSourceBaseResponse`.

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `listFields` | `array de ExternalSourceField` | Sí | No declarada | — |

Propiedades adicionales: `false`.

### `ExternalSourceField`

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `fieldType` | `FieldEnumeration` | Sí | No declarada | — |
| `name` | `string` | Sí | No declarada | minLength=1 |
| `value` | `sin tipo fijado` | No | Sí | — |

Propiedades adicionales: `false`.

### `FieldEnumeration`

Valores: `Text`, `Int`, `Double`, `Bool`, `Date`, `Link`, `Image`.

### `ExternalSourceBaseResponse`

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `transactionId` | `string` | Sí | No declarada | minLength=1 |

Propiedades adicionales: `false`.

El esquema está marcado abstracto (`x-abstract`).

### `ExternalSourceResponseNotFound`

Incluye `ExternalSourceBaseResponse`.

Propiedades adicionales: `false`.

### `ExternalSourceRequest`

| Campo | Tipo o referencia | Requerido | Nullable | Restricciones / valor por defecto |
| --- | --- | --- | --- | --- |
| `externalSource` | `ExternalSourceEnumeration` | Sí | No declarada | — |

Propiedades adicionales: `false`.

## 13. Respuestas por operación según OpenAPI

### `POST /api/BiometricVerification`

Operation ID: `BiometricVerification_Post`.

- HTTP 200: `BiometricVerifiedResponse`.
- HTTP 400: `ValidationProblemDetails`.
- HTTP 404: `BiometricVerificationResponseBase`.
- HTTP 500: `ProblemDetails`.

### `POST /api/DocumentQuery`

Operation ID: `DocumentQuery_Post`.

- HTTP 200: `DocumentAvailableResponse`.
- HTTP 400: `ValidationProblemDetails`.
- HTTP 404: `DocumentQueryResponseBase`.
- HTTP 500: `ProblemDetails`.

### `GET /api/DocumentTypesQuery`

Operation ID: `DocumentTypesQuery_Get`.

- HTTP 200: `DocumentTypesQueryAvailableResponse`.
- HTTP 400: `ValidationProblemDetails`.
- HTTP 401: `ValidationProblemDetails`.
- HTTP 500: `ProblemDetails`.

### `POST /api/ExternalSourceQuery`

Operation ID: `ExternalSourceQuery_Post`.

- HTTP 200: `ExternalSourceResponseOk`.
- HTTP 400: `ValidationProblemDetails`.
- HTTP 404: `ExternalSourceResponseNotFound`.
- HTTP 500: `ProblemDetails`.

## 14. Ejemplos HTTP adaptados

Los siguientes ejemplos están basados en A. No se ejecutaron. Los archivos JSON son entradas que debes crear con los cuerpos explicados arriba. Evitan incluir biometría y credenciales reales en el manual.

```sh
# API_KEY y TOKEN_DOCUMENTO son variables de tu entorno de ejecución.
# document-query.json contiene documentType, documentNumber y userEmail.
curl --request POST \
  'https://apibiometricid.racsa.go.cr/bioapi/api/DocumentQuery' \
  --header "ApiKey: $API_KEY" \
  --header "Authorization: ApiKey $API_KEY" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --data-binary @document-query.json

# biometric-verification.json contiene rostro JPEG/Base64 o huella WSQ/Base64.
curl --request POST \
  'https://apibiometricid.racsa.go.cr/bioapi/api/BiometricVerification' \
  --header "ApiKey: $API_KEY" \
  --header "Authorization: Bearer $TOKEN_DOCUMENTO" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --data-binary @biometric-verification.json
```

Para fuentes externas, el patrón de Bearer del token de verificación se infiere de A y O; confirmar la autenticación de tu entorno. El cuerpo formal es `{"externalSource":"CCSS"}`. Para tipos de documento confirmar los encabezados adicionales requeridos: no hay un ejemplo de autenticación específico en A.

## 15. Recomendaciones de implementación para Kiro

Esta sección es orientación técnica del manual, no una extensión del contrato RACSA.

### 15.1 Estado de la operación

Mantener por flujo el tipo y número de documento, métodos disponibles, token para verificar, resultado, intentos, token para fuentes y transacción. No mezclar tokens ni resultados entre usuarios o documentos. Descartar resultados de operaciones anteriores cuando cambie el documento.

Separar los estados de carga, no disponible, captura, verificación, sin coincidencia, éxito, consulta externa y error. Proteger las acciones contra doble clic o callbacks duplicados. Los efectos de una repetición automática sobre consumo e intentos no están documentados: evitar reintentos ciegos.

### 15.2 Interpretación de HTTP

Leer el cuerpo también en respuestas no exitosas. En Fetch, un 404 no rechaza la promesa por sí solo; en otras librerías puede llegar por la rama de error. Clasificar el resultado usando status y estructura, no solo una excepción genérica. Contemplar que una falla de gateway puede devolver contenido que no sea JSON.

No sustituir un rechazo HTTP por un objeto vacío y luego acceder a `.hit`, `.token` o `.listFields`. Validar las propiedades realmente presentes. La API no define una duración universal de token ni una operación de refresh.

### 15.3 Navegador, cámara y contexto de iframe

Comprobar que el iframe carga, la API key corresponde al cliente y dominio, se envió la inicialización, existe permiso de cámara y la aplicación no desmonta el iframe al recibir estados intermedios. Revisar políticas de cámara del documento padre y restricciones del entorno real. Estas verificaciones son diagnósticas: W no publica una matriz completa de navegadores, WebViews o móviles.

La comunicación entre orígenes se investiga mediante mensajes; no asumir acceso al DOM de RACSA. No recomendar eliminar restricciones de seguridad ni usar `postMessage(..., '*')` como arreglo general.

### 15.4 API y backend

Para una integración directa con la API, mantener las credenciales de servidor en un entorno controlado. El hecho de que W envíe una API key de SDK web al iframe no demuestra que una clave REST tenga idéntico alcance. Confirmar tipo y permisos de la clave.

O incluye una extensión CORS deshabilitada con listas vacías; es configuración de la especificación del gateway, no evidencia de los encabezados que devuelve hoy el servidor. No asumir soporte para llamadas REST desde cualquier navegador ni intentar resolver un error CORS cambiando el cuerpo JSON.

### 15.5 Evidencia para investigar un fallo

Recoger plataforma/navegador y versión, dominio y puerto, método de captura, momento exacto, último mensaje validado del iframe, operación HTTP, status y detalles anonimizados. Correlacionar con la transacción cuando corresponda sin exponer datos personales o secretos. Diferenciar fallo de permiso/captura, autenticación, no coincidencia, intentos agotados y proveedor externo.

No registrar fotografías, huellas WSQ, imágenes de documento, tokens, API keys ni respuestas completas con información personal. No crear verificaciones biométricas reales solo para probar un ejemplo sin los datos y autorización adecuados.

## 16. Diferencias y puntos que deben confirmarse

| Tema | Hallazgo | Consecuencia para el agente |
| --- | --- | --- |
| Salida del iframe | W no publica eventos ni payload de resultado | Inspeccionar el listener existente y pedir contrato o muestra anonimizada |
| Base pública | A usa `/bioapi/api/...`; O tiene server `/` y extensión `/bioapi/v1` | Confirmar la base operativa; no combinar segmentos automáticamente |
| Autorización | A describe API key y Bearer por etapa; O tiene seguridad JWT/default incompleta | Seguir ejemplos por operación y confirmar lo que no esté descrito |
| `userEmail` | A lo exige; O no lo marca requerido y admite null | Enviarlo en DocumentQuery |
| Fuente externa | Ejemplo descriptivo O: `ExternalSourceType`; esquema: `externalSource` | Partir del esquema formal y verificar comportamiento |
| 401 externo | Documentado en A, omitido en respuestas O | Gestionarlo igualmente |
| No disponibilidad | O asigna 404; A también obliga a leer disponibilidad en 200 | Revisar HTTP y cuerpo |
| Error externo 404 | O: modelo con transacción; A menciona mensaje de persona no encontrada | Admitir variantes y conservar evidencia de la respuesta real |
| Apellidos | `surname` y `secondSurname` cambian a `lastName` y `secondLastName` | Mapear por endpoint |
| Imagen del documento | No se fija MIME | No fijar JPEG a partir del ejemplo de rostro |
| Liveness | A describe errores de liveness pero no endpoint/configuración independiente | No inventar una operación ni flags para desactivarlo |
| Límites | Sin TTL, cuotas universales, tamaños máximos ni timeout contractual | Confirmar con RACSA; los números de ejemplos no son límites |

No se encontraron en estas fuentes endpoints de consulta de transacción por ID, historial, webhook, cancelación, refresh de token ni descarga posterior de resultado. Eso describe el alcance de las fuentes consultadas, no prueba que RACSA no ofrezca esas capacidades por otro canal.

O se identifica como OpenAPI 3.0.0, API `BioApi`, versión `v1`, generada por NSwag 13.20.0.0. Las extensiones incluyen throttling “Unlimited”, caché de respuesta deshabilitada, transporte HTTPS y hosts de producción/sandbox internos. Estos metadatos no garantizan cuota ilimitada contratada, ausencia de controles operativos, entorno de pruebas disponible ni una dirección interna apta para consumo público.

## 17. Prompt para iniciar el trabajo en Kiro

```text
Lee este manual completo de RACSA Web y API y, cuando necesites el contrato
exacto, consulta fuentes/openapi.json. Revisa mi integración existente del iframe,
la inicialización por postMessage y los listeners que reciben la información.

Necesito que determines cómo llega el resultado real a mi aplicación y que
contrastes ese comportamiento con lo documentado. La guía pública del iframe
no define sus mensajes de salida: no supongas nombres de evento ni que el
payload coincide con la respuesta REST. Inspecciona el código disponible y
solicita una muestra anonimizada o el contrato de RACSA si hace falta.

Si hay integración REST, identifica la base URL efectiva, API key por tipo,
headers por etapa, origen y uso de cada token, transacción, status HTTP y modelos.
Revisa en particular 404 con hit:false y remainingTries, userEmail obligatorio
aunque el esquema no lo exija, y externalSource frente al ejemplo inconsistente
ExternalSourceType. No inventes un endpoint para recuperar resultados por ID.

Distingue hechos, hipótesis y recomendaciones. No expongas biometría ni secretos
en logs. Entrega hallazgos con evidencia, cambios mínimos si corresponde,
validación realizada y datos que falten para confirmar el funcionamiento.
```

## 18. Paquete y trazabilidad

- Este Markdown contiene la explicación integrada y el catálogo de todos los esquemas y operaciones encontrados.
- `assets/`: siete imágenes originales de la guía web. Mantener esta carpeta junto al MD para que se visualicen.
- `fuentes/openapi.json`: especificación formal descargada desde el enlace que configura Swagger.
- `fuentes/web.html`, `fuentes/api.html`, `fuentes/fingers.html`: capturas HTML para trazabilidad; sus recursos de presentación pueden seguir dependiendo de la web original.
- `manifest.json`: URLs, fecha, tamaños de imágenes y hashes SHA-256 de las páginas e imágenes.

Si solo compartes el MD, Kiro conserva los contratos y explicaciones escritos; para inspeccionar las capturas y el JSON exacto, compartir la carpeta completa o el ZIP.
