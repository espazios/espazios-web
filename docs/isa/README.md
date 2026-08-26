# Isa — Documentación funcional, técnica y de seguridad

Isa es la asesora virtual de Espazios que precalifica leads de remodelación
y carpintería en **dos canales**:

1. **Cotizador web** — wizard de 6 pasos embebido en [espazios.com.co](https://www.espazios.com.co) (`src/components/Cotizador.astro`), con sincronización progresiva a HubSpot vía `/api/lead`.
2. **Isa en WhatsApp** — flujo conversacional "Precalificación Leads EZ" ejecutado en la plataforma [Kapso](https://kapso.ai) sobre el número de WhatsApp Business `+57 310 8708467`, alimentado principalmente por clics en anuncios de Meta (Facebook/Instagram, *click-to-WhatsApp*).

Este directorio reúne la documentación pedida: diagramas funcionales, diagramas
técnicos y el análisis de ciberseguridad / seguridad digital de ambos canales.

## Índice

| Documento | Contenido |
|---|---|
| [`01-diagramas-funcionales.md`](./01-diagramas-funcionales.md) | Recorrido del usuario paso a paso en cada canal, y el embudo unificado de leads |
| [`02-arquitectura-tecnica.md`](./02-arquitectura-tecnica.md) | Componentes, integraciones, secuencias técnicas y mapa de datos personales (PII) |
| [`03-analisis-seguridad.md`](./03-analisis-seguridad.md) | Hallazgos de seguridad, severidad, impacto, recomendaciones y cumplimiento (Ley 1581/2012) |

## Metodología y alcance

- **Revisión estática de código** del repositorio `espazios/espazios-web` (componentes Astro, funciones serverless en `src/pages/api/`, configuración de Vercel/Decap CMS, workflows de CI).
- **Inspección en vivo, de solo lectura**, del proyecto Kapso que opera Isa en WhatsApp (números, plantillas, conversaciones, logs de ejecución del flujo) para documentar el comportamiento real observado.
- **No se realizó pentesting activo** (sin explotación, fuerza bruta, escaneo de infraestructura ni pruebas contra el sitio en producción). Es una revisión de configuración y de código — el paso natural siguiente sería una prueba de penetración dirigida sobre los hallazgos de mayor severidad.
- Los ejemplos de conversaciones reales se **anonimizaron** (nombres, teléfonos y correos reemplazados por marcadores) antes de documentarlos aquí.

## Resumen ejecutivo

Isa está bien encaminada en varias buenas prácticas (honeypot anti-bot, checkbox
de Habeas Data con bloqueo server-side, cabeceras de seguridad HSTS/CSP/Permissions-Policy,
cookies de OAuth `HttpOnly`+`Secure`+`SameSite`, Dependabot activo, CI que bloquea
merges rotos). El análisis de seguridad identifica **12 hallazgos**, ninguno
crítico de explotación inmediata conocida, pero varios de severidad alta que
conviene resolver antes de escalar el volumen de leads: CSP permisiva
(`unsafe-inline`/`unsafe-eval`), *rate limiting* de `/api/lead` que no
sobrevive entre instancias serverless, dependencias con CVEs conocidas, y una
`state` de CSRF en el OAuth de Decap CMS generada con `Math.random()`. El
detalle, evidencia e impacto de cada uno está en
[`03-analisis-seguridad.md`](./03-analisis-seguridad.md).

---
*Generado con Claude Code a partir de la revisión del código fuente y del
proyecto Kapso en producción. Última actualización: 2026-08-26.*
