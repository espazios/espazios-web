# Informe de remediación — hallazgo por hallazgo

Los 24 hallazgos de [`03-analisis-seguridad.md`](./03-analisis-seguridad.md)
clasificados en dos grupos según un solo criterio: **¿la subsanación, tal
como está descrita, puede alterar una funcionalidad que ya funciona, una
regla de negocio ya definida (las de `CLAUDE.md` y del system prompt de
Isa), o un criterio de aceptación ya validado?**

- **Grupo A** — No. Se puede aplicar directo, sin ventana de pruebas
  especial ni validación de negocio adicional.
- **Grupo B** — Sí, en algún punto de su remediación completa. Para cada
  uno se identifica **qué regla de negocio o criterio concreto está en
  juego** y se propone una solución que lo respeta.

Ningún hallazgo cambió de severidad respecto a `03-analisis-seguridad.md`
— este documento reorganiza los mismos 24 por riesgo de implementación, no
los vuelve a priorizar por impacto de seguridad.

## Grupo A — Sin riesgo funcional ni de negocio (12)

| Hallazgo | Solución |
|---|---|
| CRÍTICO-1 | Middleware de autenticación en `tools-server.ts` |
| CRÍTICO-2 | `valueInputOption: "RAW"` en vez de `"USER_ENTERED"` |
| MEDIO-1 | `crypto.randomUUID()` para el `state` de OAuth |
| MEDIO-4 | `crypto.randomUUID()` para el `leadId` del cotizador |
| MEDIO-6 | Workflow de CI (`typecheck` + build) en `espazios-whatsapp-agent` |
| BAJO-1 | Limpiar `localStorage` al llegar a la pantalla de éxito |
| BAJO-2 | Eliminar la función `send()` muerta en `callback.ts` |
| BAJO-3 | `rel="noopener"` en el `window.open()` del cotizador |
| BAJO-4 | Tope de regeneraciones del estimado por conversación |
| INFO-3 | Reemplazar nombre real/ruta local por placeholders en `DEPLOY_INSTRUCCIONES.md` |
| INFO-4 | Ninguna — riesgo aceptado, documentado por completitud |
| INFO-5 | Quitar la columna "Cliente" de la tabla de TikTok del prompt |

### Detalle

**CRÍTICO-1 — `tools-server.ts` sin autenticar.**
Solución: exigir un header (`Authorization: Bearer <secreto>`) en cada
ruta, configurado también en la definición de la webhook tool en Kapso
(`${ENV:...}`, mecanismo ya soportado — ver evidencia en
`03-analisis-seguridad.md`). Isa v2 no tiene tráfico de producción hoy, así
que no hay ningún flujo real que se pueda romper; el único cuidado es de
secuencia (desplegar servidor y configuración de Kapso juntos).

**CRÍTICO-2 — `USER_ENTERED` permite inyección de fórmulas.**
Solución: cambiar a `"RAW"`. `field-map.ts` todavía usa celdas de ejemplo
(la plantilla real no está conectada) y `metrosCuadrados` ya viaja como
número nativo en el payload, no como texto — por eso el cambio no le
resta capacidad de cálculo a ninguna fórmula de la plantilla el día que sí
se conecte.

**MEDIO-1 — `state` con `Math.random()`.**
Solución: `crypto.randomUUID()`. Es el mismo tipo de dato (string), mismo
uso (comparar contra la cookie) — reemplazo directo.

**MEDIO-4 — `leadId` con `Math.random()`.**
Solución: `crypto.randomUUID()`. HubSpot dedupe es por `email`, no por
`leadId` — el cambio no afecta cómo se identifican los contactos ya
guardados.

**MEDIO-6 — Sin CI en `espazios-whatsapp-agent`.**
Solución: workflow de GitHub Actions que corra `npm run typecheck` (el
script ya existe en `package.json`) y valide que el `Dockerfile` construye,
en cada PR/push — calco del patrón que ya usa `espazios-web`. No cambia
nada del runtime, solo agrega un chequeo antes del deploy automático.

**BAJO-1 — PII persistente en `localStorage`.**
Solución: `localStorage.removeItem('espazios_lead')` (y el `leadId`) al
llegar al paso `success`. El dato ya viajó a HubSpot en ese punto — no se
pierde información de negocio.

**BAJO-2 — Código muerto en `callback.ts`.**
Solución: eliminar la función `send()` no invocada. Cero impacto — nunca
se ejecuta.

**BAJO-3 — `window.open` sin `noopener`.**
Solución: `window.open(url, '_blank', 'noopener,noreferrer')`. El
comportamiento visible para el usuario (se abre Google Calendar en pestaña
nueva) no cambia.

**BAJO-4 — Regeneraciones sin tope.**
Solución: contador simple por `whatsapp_conversation_id` con un límite
generoso (ej. 5). No choca con ninguna regla de negocio — el system prompt
nunca exige regeneración *ilimitada*, solo dice "vuelve a llamar la
herramienta" cuando el cliente corrige; un tope de 5 correcciones por
conversación no afecta al caso real (un cliente normal corrige 0-2 veces).

**INFO-3 — Nombre real y ruta local en `DEPLOY_INSTRUCCIONES.md`.**
Solución: placeholders genéricos. Documento operativo, no código.

**INFO-4 — Editores de Decap CMS pueden insertar HTML crudo.**
Solución: ninguna acción — es el comportamiento esperado de Decap/Markdown
y el acceso ya requiere ser colaborador de confianza del repo.

**INFO-5 — Tabla de TikTok con nombre de cliente + edificio.**
Solución: quitar la columna "Cliente", dejar solo proyecto/torre y URL. El
propio prompt (sección 11) usa la coincidencia de **proyecto**, no del
nombre del cliente, para elegir qué video compartir — quitar la columna no
le resta ninguna capacidad a Isa.

---

## Grupo B — Pueden afectar producción (12)

Para cada uno: el hallazgo, **qué regla de negocio o criterio concreto
está en juego**, y la solución que lo respeta.

| Hallazgo | Riesgo si se hace mal |
|---|---|
| ALTO-1 | Romper el cotizador y/o el login de `/admin` |
| ALTO-2 | Bloquear leads reales si el store de rate limit falla |
| ALTO-3 (resto) | Build roto por upgrade mayor de Astro |
| ALTO-4 (resto) | 403 en la lectura de tarifas/plantilla ya compartidas |
| ALTO-5 (resto) | Cortar acceso a Drive/Sheets/Calendar durante la migración |
| MEDIO-2 + MEDIO-3 | Login de Decap CMS roto si no coincide con GitHub OAuth App |
| MEDIO-5 | Cortar el auto-deploy de Railway si Railway pierde acceso al repo |
| MEDIO-7 (resto) | Render de la tarjeta PNG roto por upgrade mayor de `sharp` |
| MEDIO-8 | Política de privacidad desactualizada cuando Isa v2 atienda clientes reales |
| INFO-1 | Duplicar/perder leads si la integración se construye mal |
| INFO-2 | Tocar el Workflow v1 en producción, que el usuario pidió explícitamente no tocar |

### Detalle

**ALTO-1 — CSP con `unsafe-inline`/`unsafe-eval`.**
*Regla en juego:* el cotizador de 6 pasos y el panel `/admin` de Decap CMS
deben seguir funcionando exactamente igual — son los dos flujos de negocio
que dependen de scripts en el navegador.
*Solución compatible:* CSP con **nonce por request** (middleware de Astro)
para los `<script>` del sitio público — preserva el cotizador sin cambiar
su comportamiento. Para `/admin`, **no forzar la misma política** — ya
existe en `vercel.json` un bloque de headers específico para
`/admin/*`; dejar `unsafe-eval` ahí mientras Decap lo necesite, en vez de
quitarlo globalmente. Probar ambos flujos completos en un preview de
Vercel antes de tocar producción.

**ALTO-2 — Rate limit no persistente.**
*Regla en juego:* "todo lead real debe llegar a HubSpot" es el criterio de
aceptación central del cotizador — es literalmente el propósito del
endpoint.
*Solución compatible:* mover el contador a un store compartido (Vercel KV
/ Upstash) diseñado **fail-open**: si el store no responde, se dejar pasar
la solicitud en vez de bloquearla. Así el fix cierra el hueco de abuso en
el caso normal (store funcionando) sin arriesgar nunca la regla de negocio
de no perder leads, ni en el caso raro de que el store falle.

**ALTO-3 (resto) — Upgrade mayor de Astro para resolver la CVE de `sharp`.**
*Regla en juego:* el build de `espazios-web` (home, proyectos, blog,
cotizador) debe seguir compilando y viéndose igual — Astro 7 es un salto
mayor de versión.
*Solución compatible:* aplicar ya la parte segura (`npm audit fix` sin
`--force`, resuelve `nanoid`/`tar`/`postcss`); el upgrade a Astro 7 se hace
en una rama aparte, corriendo `npm run test`, `npm run test:e2e` y un
`npm run build` completo antes de fusionar — exactamente el criterio que
ya usa CI (`ci.yml`), solo que en modo manual/dirigido en vez de automático
(Dependabot ya está configurado para no proponer este cambio solo, por
diseño).

**ALTO-4 (resto) — Reducir el scope de Drive a `drive.file`.**
*Regla en juego:* el "estimado ilustrativo" (la única función de Isa v2
que hoy funciona de verdad) depende de leer la hoja "Tarifas Ilustrativas"
y, a futuro, copiar la plantilla del cotizador — ambos archivos
preexistentes, compartidos con la cuenta actual, no creados por la app.
*Solución compatible:* **no cambiar el scope todavía.** Aplicar primero el
registro propio de `fileId` válidos en `/tools/cotizaciones/:fileId` (cierra
el hallazgo de "proxy abierto" sin tocar permisos). Si más adelante se
decide reducir el scope, volver a compartir cada archivo con la identidad
usando un método compatible con `drive.file` (por ejemplo, un flujo de
selección explícita vía Google Picker, o mover los archivos a un Shared
Drive con acceso delegado) y confirmar en un entorno de pruebas que
`calcularEstimado()` y `generateQuote()` siguen leyendo datos reales antes
de desplegar.

**ALTO-5 (resto) — Migrar de cuenta personal a identidad de servicio.**
*Regla en juego:* Drive, Sheets y Calendar deben seguir funcionando sin
interrupción — son la base de todo lo que Isa v2 hace hoy.
*Solución compatible:* compartir los mismos cuatro recursos (plantilla,
carpeta de salida, hoja de tarifas, calendario del asesor) con la
identidad nueva **antes** de cambiar la variable de entorno en Railway;
mantener ambas credenciales activas en paralelo durante la ventana de
prueba; revocar la cuenta personal solo después de confirmar un ciclo
completo con la identidad nueva.

**MEDIO-2 + MEDIO-3 — `redirect_uri`/`base_url` fijos al dominio de
producción.**
*Regla en juego:* el equipo debe poder seguir publicando contenido
(proyectos, blog) vía `/admin` — es el flujo operativo de contenido del
sitio.
*Solución compatible:* antes de tocar el código, confirmar (o agregar) el
dominio de producción exacto como *Authorization callback URL* en la
GitHub OAuth App. Desplegar los dos cambios (`MEDIO-2` + `MEDIO-3`) en el
mismo paso, y probar el login de `/admin` inmediatamente después del
deploy, no esperar al primer uso real de un editor de contenido.

**MEDIO-5 — Repositorio público.**
*Regla en juego:* el auto-deploy de `espazios-whatsapp-agent` a Railway en
cada push a `master` (ya documentado como flujo operativo en `CLAUDE.md`)
no se puede cortar.
*Solución compatible:* antes de pasar el repo a privado, confirmar que la
integración Railway↔GitHub tiene autorización de la GitHub App para ver
repos privados (Railway suele pedir reautorización al cambiar la
visibilidad) — verificarlo primero, cambiar la visibilidad después, y
confirmar que el siguiente push sigue disparando el deploy.

**MEDIO-7 (resto) — Upgrade mayor de `sharp`/`googleapis`.**
*Regla en juego:* el render de la tarjeta PNG (nombre, ciudad, 3 paquetes)
que Isa manda por WhatsApp debe seguir viéndose igual — es la única salida
visual que el cliente final ve hoy.
*Solución compatible:* aplicar ya `npm audit fix` sin `--force`; para el
upgrade mayor, generar tarjetas de prueba localmente (`npx tsx` con un
script temporal, como ya se hizo para el rediseño de paleta según
`CLAUDE.md`) comparando visualmente antes/después de la versión nueva de
`sharp`, antes de desplegar a Railway.

**MEDIO-8 — Subprocesador de IA (OpenAI) no revelado.**
*Regla en juego:* la política de privacidad debe seguir siendo veraz — no
es un cambio de código, es contenido legal/customer-facing que debe
reflejar la realidad antes de que Isa v2 hable con clientes reales.
*Solución compatible:* agregar la mención de Kapso y del proveedor del
modelo a `/politica-privacidad` como parte del checklist de "corte a
producción" de Isa v2 que ya existe en `CLAUDE.md` — no bloquea nada del
desarrollo actual, solo debe quedar resuelto **antes** del cutover, no
después.

**INFO-1 — Sin integración WhatsApp → HubSpot.**
*Regla en juego:* el gate de consentimiento Habeas Data (bloqueo
server-side en `/api/lead.ts`, ya construido y probado) es el criterio de
aceptación que protege legalmente cada dato que llega a HubSpot — cualquier
integración nueva debe pasar por el mismo gate, no crear uno paralelo.
*Solución compatible:* construir `sync_hubspot` (ya está en el roadmap de
`CLAUDE.md` como pendiente) como una llamada del `agent node` hacia
`/api/lead` reutilizando la sanitización y el bloqueo de consentimiento ya
existentes, en vez de escribir una integración nueva y separada hacia
HubSpot desde `espazios-whatsapp-agent`.

**INFO-2 — Habeas Data no verificado en el flujo v1 (producción).**
*Regla en juego:* esta es la única tensión real entre un hallazgo y una
decisión de negocio ya tomada — `CLAUDE.md` registra explícitamente
"**por pedido explícito del usuario, no se toca ese Workflow**" (el árbol
de decisión de Isa v1 en el dashboard de Kapso).
*Solución compatible:* si se decide actuar, la opción de menor riesgo es
agregar el aviso como **el primer paso del árbol**, antes de cualquier
pregunta existente — es aditivo, no reordena ni modifica ninguna rama de
calificación ya construida. Aun así, dado el precedente explícito de "no
tocar ese Workflow", este es el único punto de todo el informe que
recomiendo **confirmar contigo antes de tocarlo**, en vez de asumir que
aplica automáticamente.
