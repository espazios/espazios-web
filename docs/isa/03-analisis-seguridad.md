# Análisis de ciberseguridad y seguridad digital — Isa

Revisión de configuración y código fuente sobre el cotizador web
(`espazios-web`) y el flujo de WhatsApp de Isa (proyecto Kapso "Prueba Leads
Ventas EZ"). **No incluye pentesting activo** — es la base para priorizar
remediaciones y, si se quiere, encargar una prueba de penetración dirigida.

## Aspectos positivos encontrados

- `vercel.json` define HSTS (`preload`), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy` restrictiva y CSP con
  `frame-ancestors 'self'` y `object-src 'none'`.
- Honeypot anti-bot activo tanto en el cliente (campo oculto) como validado
  en el servidor (`/api/lead.ts`).
- Consentimiento Habeas Data (Ley 1581/2012) capturado con checkbox explícito
  **y bloqueado también en servidor** (`consent_required` si falta) — no es
  solo una validación de UI.
- Cookie de estado OAuth con `HttpOnly; Secure; SameSite=Lax` y expiración
  corta (10 min).
- Kapso redacta (`[FILTERED]`) el contenido de las variables de usuario en
  sus logs de ejecución del flujo de WhatsApp.
- Dependabot configurado (semanal para npm, mensual para GitHub Actions) y
  CI (`ci.yml`) que corre `astro check`, tests unitarios y build en cada PR
  contra `main`.
- Rutas `/api/*` y `/admin/*` marcadas `no-store` y `noindex, nofollow`.

## Hallazgos

| ID | Severidad | Componente | Hallazgo |
|---|---|---|---|
| [ALTO-1](#hallazgo-alto-1--csp-permite-unsafe-inline-y-unsafe-eval) | 🔴 Alto | `vercel.json` (CSP) | `script-src` incluye `'unsafe-inline' 'unsafe-eval'` |
| [ALTO-2](#hallazgo-alto-2--rate-limit-no-persistente-en-apilead) | 🔴 Alto | `/api/lead.ts` | Rate limiting en memoria, no sobrevive entre instancias serverless |
| [ALTO-3](#hallazgo-alto-3--dependencias-con-cves-conocidos) | 🔴 Alto | `package-lock.json` | 11 vulnerabilidades (7 altas, 4 moderadas) vía `npm audit` |
| [MEDIO-1](#hallazgo-medio-1--state-csrf-generado-con-mathrandom) | 🟠 Medio | `/api/auth.ts` | `state` de CSRF generado con `Math.random()` |
| [MEDIO-2](#hallazgo-medio-2--redirect_uri-derivado-dinámicamente-del-host) | 🟠 Medio | `/api/auth.ts` | `redirect_uri` del OAuth se construye desde el host de la petición entrante |
| [MEDIO-3](#hallazgo-medio-3--base_url-de-decap-apunta-a-una-url-de-preview) | 🟠 Medio | `public/admin/config.yml` | `base_url` apunta a un dominio de *preview* de Vercel, no al de producción |
| [MEDIO-4](#hallazgo-medio-4--leadid-sin-autenticación-ni-integridad) | 🟠 Medio | `Cotizador.astro` / `/api/lead.ts` | `leadId` generado con `Math.random()`, sin autenticación al actualizar el lead |
| [BAJO-1](#hallazgo-bajo-1--pii-en-localstorage-sin-cifrado-ni-expiración) | 🟡 Bajo | `Cotizador.astro` | PII en `localStorage` sin cifrado ni expiración |
| [BAJO-2](#hallazgo-bajo-2--código-muerto-en-el-flujo-oauth) | 🟡 Bajo | `/api/callback.ts` | Función `send()` con `postMessage(msg, '*')` nunca invocada (higiene de código) |
| [INFO-1](#hallazgo-info-1--sin-integración-visible-whatsapp--hubspot) | ⚪ Informativo | Arquitectura | Sin evidencia de integración WhatsApp (Kapso) → HubSpot |
| [INFO-2](#hallazgo-info-2--habeas-data-no-verificado-en-whatsapp) | ⚪ Informativo | Isa / WhatsApp | Aviso de tratamiento de datos no confirmado en el canal WhatsApp |
| [INFO-3](#hallazgo-info-3--nombre-de-usuario-real-y-ruta-local-en-documentación) | ⚪ Informativo | `DEPLOY_INSTRUCCIONES.md` | Nombre real y ruta local del propietario en un archivo versionado |

---

### Hallazgo ALTO-1 — CSP permite `unsafe-inline` y `unsafe-eval`

**Dónde:** `vercel.json` → header `Content-Security-Policy`.

```
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com ...
```

**Impacto:** `'unsafe-inline'` y `'unsafe-eval'` anulan buena parte del valor
de tener CSP: si un atacante logra inyectar HTML/JS (por ejemplo vía un XSS
almacenado en contenido del CMS, o en una dependencia de terceros cargada
desde `unpkg.com`), el navegador lo ejecutará igual. `unpkg.com` como fuente
de script es además una dependencia de una CDN pública de terceros sin
verificación de integridad (SRI) declarada en el CSP.

**Recomendación:**
- Migrar a CSP basada en **nonces o hashes** para los `<script>` inline que
  el propio sitio necesita (Astro soporta nonces vía middleware).
- Si `unsafe-eval` lo exige el bundle de Decap CMS, **acotar la CSP permisiva
  solo a la ruta `/admin/*`** (ya existe un bloque de headers específico para
  esa ruta en `vercel.json`) en vez de aplicarla a todo el sitio.
- Añadir `integrity` (SRI) al script cargado desde `unpkg.com`.

### Hallazgo ALTO-2 — Rate limit no persistente en `/api/lead`

**Dónde:** `src/pages/api/lead.ts`, `requestLog = new Map<string, number[]>()`.

**Impacto:** Vercel ejecuta funciones serverless en múltiples instancias
efímeras (por región, por concurrencia, por cold start). Un `Map` en memoria
de proceso **no se comparte entre instancias**, así que el límite de "10
solicitudes / 10 min por IP" solo aplica dentro de una misma instancia
caliente. Un atacante que reparta la carga (o simplemente tenga mala suerte
de pegarle a distintas instancias) puede exceder el límite real muchas veces,
habilitando spam de leads falsos hacia HubSpot (consumo de cuota/plan de
HubSpot, contaminación del CRM) o abuso del endpoint como vector de
denegación de servicio de bajo costo.

**Recomendación:** mover el contador a un almacén compartido (Vercel KV,
Upstash Redis, Edge Config) o delegar el rate limiting a una capa perimetral
(Vercel Firewall / WAF, Cloudflare) delante de `/api/*`.

### Hallazgo ALTO-3 — Dependencias con CVEs conocidos

**Dónde:** `package-lock.json` (`npm audit`, ejecutado sobre el repo).

11 vulnerabilidades reportadas (7 altas, 4 moderadas), entre ellas:

| Paquete | Severidad | CVE / Advisory |
|---|---|---|
| `nanoid` | Alta | GHSA-2v37-7h3g-55p8 — generador puede entrar en bucle infinito con `size=0` |
| `tar` | Alta | GHSA-r292-9mhp-454m — recursión no controlada → DoS por stack overflow con tar manipulado |
| `sharp` (libvips) | Alta | GHSA-f88m-g3jw-g9cj — CVEs 2026-33327/33328/35590/35591 |
| `postcss` | Moderada | GHSA-fxqj-rqcc-2cmp — lectura de `.map` arbitrario cuando `from` no está definido |

Son dependencias transitivas de la cadena de build de Astro (no hay ninguna
directamente en `package.json`), pero `sharp` se usa en tiempo de ejecución
para el `imageService` del adaptador de Vercel — procesa imágenes que en
última instancia pueden venir de contenido subido vía Decap CMS.

**Recomendación:** `npm audit fix` resuelve la mayoría sin cambios de
breaking; `sharp` requiere subir Astro a una versión mayor (`npm audit fix
--force` → Astro 7) — planificarlo como tarea aparte, no automática, dado que
Dependabot ya está configurado para ignorar majors.

### Hallazgo MEDIO-1 — `state` CSRF generado con `Math.random()`

**Dónde:** `src/pages/api/auth.ts`.

```js
const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
```

**Impacto:** `Math.random()` no es un generador criptográficamente seguro y
su salida puede ser predecible o de baja entropía dependiendo del motor
JS. Aunque la ventana de explotación es corta (10 minutos, y requiere
además robar/predecir la cookie), el propósito de un token anti-CSRF es
justamente ser impredecible.

**Recomendación:** usar `crypto.randomUUID()` o `crypto.getRandomValues()`
(ambos disponibles en el runtime Edge/Node de Vercel) para generar `state`.

### Hallazgo MEDIO-2 — `redirect_uri` derivado dinámicamente del host

**Dónde:** `src/pages/api/auth.ts`.

```js
const host = `${url.protocol}//${url.host}`;
const redirectUri = `${host}/api/callback`;
```

**Impacto:** el `redirect_uri` que se envía a GitHub se construye a partir
del `Host` de la petición entrante, en vez de ser una constante fija al
dominio canónico de producción. Si la GitHub OAuth App tiene registrada más
de una *callback URL* válida (por ejemplo, para cubrir dominios de *preview*
de Vercel), esto amplía la superficie sobre la que un token de sesión OAuth
podría terminar fluyendo hacia un subdominio de *preview* menos controlado
que el de producción.

**Recomendación:** fijar `redirect_uri` a una constante
(`https://www.espazios.com.co/api/callback`) leída de variable de entorno,
en vez de derivarla de `request.url`.

### Hallazgo MEDIO-3 — `base_url` de Decap apunta a una URL de preview

**Dónde:** `public/admin/config.yml`.

```yaml
base_url: https://espazios-web-git-main-espazios-8361s-projects.vercel.app
# Para producción definitiva cambiar a https://www.espazios.com.co
```

El propio comentario en el archivo señala que este cambio quedó pendiente.
**Impacto:** el flujo de login del CMS depende de la disponibilidad y
estabilidad de una URL de *preview* de rama, no del dominio de producción.
Si esa URL de preview específica cambia, expira o es reasignada por Vercel
(ocurre al renombrar el proyecto o el equipo), el login de `/admin` en
producción se rompe silenciosamente, y de paso ancla la confianza del OAuth
a un dominio secundario de infraestructura.

**Recomendación:** completar el cambio ya anotado en el propio comentario —
usar el dominio canónico de producción.

### Hallazgo MEDIO-4 — `leadId` sin autenticación ni integridad

**Dónde:** `Cotizador.astro` (`uuid()` con `Math.random()`) y `/api/lead.ts`.

**Impacto:** el `leadId` viaja en el body de cada `POST /api/lead` sin
ningún token que pruebe que quien lo envía es el mismo navegador que lo
generó. No es explotable para robar datos de otro usuario (HubSpot dedupe es
por `email`, no por `leadId`), pero sí permite que un tercero que adivine o
intercepte un `leadId` reenvíe actualizaciones a ese registro de HubSpot
mientras siga sin `email` asociado.

**Recomendación:** severidad baja de impacto real, pero de bajo costo de
arreglo — usar `crypto.randomUUID()` en vez de `Math.random()` para el
`leadId` (mismo defecto que MEDIO-1, mismo fix).

### Hallazgo BAJO-1 — PII en `localStorage` sin cifrado ni expiración

**Dónde:** `Cotizador.astro`, claves `espazios_lead` y `espazios_lead_id`.

**Impacto:** nombre, correo, celular, ciudad, barrio y presupuesto quedan en
texto plano en el `localStorage` del navegador del visitante,
**indefinidamente** (no hay TTL ni limpieza tras completar el flujo). En un
equipo compartido o público, esa información persiste tras cerrar la
pestaña. Es un riesgo bajo (el propio dueño del dato es quien lo dejó ahí),
pero relevante para minimización de datos.

**Recomendación:** limpiar `localStorage` al llegar a la pantalla de éxito,
y/o ponerle expiración (por ejemplo, guardar un timestamp y descartar el
estado si pasaron más de N días).

### Hallazgo BAJO-2 — Código muerto en el flujo OAuth

**Dónde:** `src/pages/api/callback.ts`, función `send()` con
`window.opener.postMessage(msg, '*')`, definida pero nunca invocada (el envío
real ocurre en el handler `onMsg`, que sí usa `e.origin`).

**Impacto:** ninguno explotable hoy (la función muerta no se ejecuta), pero
es una trampa de mantenimiento: si alguien la conecta más adelante "para
simplificar", reintroduciría un `postMessage` con origen comodín `'*'` que sí
filtraría el token de acceso a cualquier ventana que esté escuchando.

**Recomendación:** eliminar la función `send()` no usada, o documentarla
explícitamente como no utilizada.

### Hallazgo INFO-1 — Sin integración visible WhatsApp → HubSpot

**Dónde:** arquitectura general (ver diagrama en
[`02-arquitectura-tecnica.md`](./02-arquitectura-tecnica.md#3-secuencia--oauth-de-decap-cms-admin)).

No se encontró, ni en el repo ni en la configuración de Kapso inspeccionada
(`whatsapp_webhooks` está vacío), evidencia de que los leads capturados por
Isa en WhatsApp lleguen al mismo HubSpot que usa el cotizador web. Esto no es
una vulnerabilidad de seguridad en sí, pero sí un riesgo de **gobierno de
datos**: dos fuentes de verdad para el mismo cliente, sin deduplicación, y
sin que quede claro dónde vive el registro de consentimiento de cada canal.

**Recomendación:** confirmar con el equipo si existe una integración fuera
del alcance revisado; si no existe, evaluar un webhook Kapso → `/api/lead`
(o directo a HubSpot) para unificar el embudo.

### Hallazgo INFO-2 — Habeas Data no verificado en WhatsApp

**Dónde:** flujo "Precalificación Leads EZ" (Kapso).

El cotizador web bloquea el envío a HubSpot si falta el consentimiento
explícito (Ley 1581 de 2012). En las conversaciones de WhatsApp revisadas no
se observó un mensaje equivalente de aviso de tratamiento de datos antes de
solicitar nombre, correo o presupuesto — puede existir en un paso no cubierto
por la muestra revisada, pero conviene confirmarlo explícitamente dado que es
el mismo tipo de dato personal capturado por el otro canal, que sí lo exige.

**Recomendación:** agregar un mensaje de aviso de tratamiento de datos (con
enlace a la política de privacidad) como uno de los primeros pasos del flujo
de WhatsApp, igual que en el cotizador web.

### Hallazgo INFO-3 — Nombre real y ruta local en documentación

**Dónde:** `DEPLOY_INSTRUCCIONES.md`, comandos de ejemplo
(`git config --global user.name "..."`, ruta `C:\Users\...\OneDrive\...`).

Impacto mínimo (es un nombre y una ruta de carpeta, no una credencial), pero
es información personal identificable versionada en un repo que, según el
CSP y las cabeceras, es de un sitio público. Se menciona por completitud del
inventario de datos, no como hallazgo de explotación.

**Recomendación:** si se prefiere, reemplazar por placeholders genéricos
(`"Tu Nombre"`, `C:\ruta\al\proyecto`) — es un documento operativo, no crítico.

## Cumplimiento — Ley 1581 de 2012 (Habeas Data, Colombia)

| Requisito | Canal web | Canal WhatsApp |
|---|---|---|
| Aviso/autorización previa al tratamiento | ✅ Checkbox explícito + bloqueo server-side | ⚠️ No confirmado (ver INFO-2) |
| Finalidad declarada del tratamiento | ✅ "usar mi información para contactarme sobre esta cotización" | ⚠️ No observado en la muestra revisada |
| Registro de fecha de consentimiento | ✅ `fechaConsentimiento` (ISO) persistido junto al lead | ⚠️ No aplica actualmente |
| Enlace a política de privacidad | ✅ `/politica-privacidad` | ⚠️ No observado |

## Hoja de ruta sugerida (por esfuerzo/impacto)

1. **Quick wins (< 1 día):** `crypto.randomUUID()` para `state` y `leadId`
   (MEDIO-1, MEDIO-4), corregir `base_url` de Decap (MEDIO-3), fijar
   `redirect_uri` a constante (MEDIO-2), eliminar código muerto en
   `callback.ts` (BAJO-2), `npm audit fix` (parte de ALTO-3).
2. **Corto plazo (días):** mover el rate limit de `/api/lead` a un store
   compartido (ALTO-2), acotar/afinar la CSP y evaluar nonces (ALTO-1),
   limpiar `localStorage` al completar el flujo (BAJO-1).
3. **A planificar:** upgrade de Astro para resolver la CVE de `sharp`
   (ALTO-3), confirmar y documentar (o construir) la integración
   WhatsApp → CRM (INFO-1), agregar aviso de tratamiento de datos al flujo
   de WhatsApp (INFO-2).
