# Isa — Documentación funcional, técnica y de seguridad

Isa es la asesora virtual de Espazios que precalifica leads de remodelación
y carpintería. Al revisar el ecosistema completo encontramos **tres sistemas**
distintos, en dos repositorios:

1. **Cotizador web** (`espazios/espazios-web`) — wizard de 6 pasos embebido en [espazios.com.co](https://www.espazios.com.co) (`src/components/Cotizador.astro`), con sincronización progresiva a HubSpot vía `/api/lead`.
2. **Isa v1 en WhatsApp** — flujo tipo árbol de decisión (IVR) "Precalificación Leads EZ", configurado directamente en el dashboard de [Kapso](https://kapso.ai) sobre el número de WhatsApp Business `+57 310 8708467`. **Es la que está en producción hoy**, alimentada principalmente por clics en anuncios de Meta (Facebook/Instagram, *click-to-WhatsApp*).
3. **Isa v2 en WhatsApp** (repo separado [`espazios/espazios-whatsapp-agent`](https://github.com/espazios/espazios-whatsapp-agent), **público**) — la versión generativa: un `agent node` de Kapso con un modelo Claude/Anthropic como cerebro de la conversación, que llama a un servidor de herramientas de negocio propio (`src/tools-server.ts`, Fastify) desplegado en Railway, el cual a su vez habla con Google Sheets/Drive/Calendar para calcular estimados y (a futuro) generar cotizaciones y agendar citas. **En pruebas de Sandbox al momento de esta revisión (2026-08-24)** — todavía no reemplaza a Isa v1 en producción.

Este directorio reúne la documentación pedida: diagramas funcionales, diagramas
técnicos y el análisis de ciberseguridad / seguridad digital de los tres.

## Índice

| Documento | Contenido |
|---|---|
| [`01-diagramas-funcionales.md`](./01-diagramas-funcionales.md) | Recorrido del usuario paso a paso en cada canal, y el embudo unificado de leads |
| [`02-arquitectura-tecnica.md`](./02-arquitectura-tecnica.md) | Componentes, integraciones, secuencias técnicas y mapa de datos personales (PII) |
| [`03-analisis-seguridad.md`](./03-analisis-seguridad.md) | Hallazgos de seguridad, severidad, impacto, recomendaciones y cumplimiento (Ley 1581/2012) |

## Metodología y alcance

- **Revisión estática de código** de ambos repositorios: `espazios/espazios-web` (componentes Astro, funciones serverless en `src/pages/api/`, configuración de Vercel/Decap CMS, workflows de CI) y `espazios/espazios-whatsapp-agent` (servidor de herramientas Fastify, integración con Google Workspace, prompt de Isa v2).
- **Inspección en vivo, de solo lectura**, del proyecto Kapso que opera Isa en WhatsApp (números, plantillas, conversaciones, logs de ejecución del flujo) para documentar el comportamiento real observado.
- **No se realizó pentesting activo** (sin explotación, fuerza bruta, escaneo de infraestructura ni pruebas contra el sitio o el servidor de Railway en producción). Es una revisión de configuración y de código — el paso natural siguiente sería una prueba de penetración dirigida sobre los hallazgos de mayor severidad, empezando por los críticos de `espazios-whatsapp-agent`.
- Los ejemplos de conversaciones reales se **anonimizaron** (nombres, teléfonos y correos reemplazados por marcadores) antes de documentarlos aquí.

## Resumen ejecutivo

Isa está bien encaminada en varias buenas prácticas (honeypot anti-bot, checkbox
de Habeas Data con bloqueo server-side, cabeceras de seguridad HSTS/CSP/Permissions-Policy,
cookies de OAuth `HttpOnly`+`Secure`+`SameSite`, Dependabot activo, CI que bloquea
merges rotos, `.gitignore` correcto en ambos repos — no hay secretos versionados).

El análisis identifica **17 hallazgos** en total. Los más urgentes están en
**`espazios-whatsapp-agent`** (todavía en Sandbox, pero con endpoints ya
expuestos a internet en Railway):

- 🔴 **Crítico** — el servidor de herramientas (`tools-server.ts`) no valida
  ningún secreto/API key: cualquiera en internet puede invocarlo directamente,
  sin pasar por WhatsApp ni por Kapso.
- 🔴 **Crítico** — el generador de cotizaciones escribe los datos del
  formulario directo en celdas de Google Sheets con `valueInputOption:
  "USER_ENTERED"`, que interpreta fórmulas — combinado con el punto anterior,
  es inyección de fórmulas de Sheets accesible por cualquiera (la función está
  "dormida" en el guion de conversación, pero el endpoint HTTP ya existe y
  responde).
- 🟠 **Alto** — las credenciales de Google son un token OAuth de una cuenta
  personal (`espazios.co@gmail.com`) con scopes amplios (`drive` completo,
  `calendar`, y `gmail.send` sin usar), en vez de una identidad de servicio
  acotada.
- 🟠 **Alto** — el repositorio es **público** y documenta en detalle (en
  `CLAUDE.md`) IDs de infraestructura, el spreadsheet de tarifas y la URL de
  producción de Railway — reduce a casi cero el esfuerzo de un atacante para
  encontrar y explotar los puntos anteriores.

En `espazios-web` (cotizador + Decap CMS) los hallazgos son de severidad más
moderada: CSP permisiva (`unsafe-inline`/`unsafe-eval`), *rate limiting* de
`/api/lead` que no sobrevive entre instancias serverless, dependencias con
CVEs conocidas, y una `state` de CSRF generada con `Math.random()`. El
detalle, evidencia e impacto de cada uno está en
[`03-analisis-seguridad.md`](./03-analisis-seguridad.md).

---
*Generado con Claude Code a partir de la revisión del código fuente y del
proyecto Kapso en producción. Última actualización: 2026-08-26.*
