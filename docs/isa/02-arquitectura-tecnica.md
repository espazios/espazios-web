# Arquitectura técnica — Isa

## 1. Componentes y despliegue

```mermaid
flowchart TB
    subgraph CLIENT["Navegador del visitante"]
        BROWSER["Cotizador.astro<br/>(cliente, TypeScript)<br/>localStorage: espazios_lead / espazios_lead_id"]
    end

    subgraph VERCEL["Vercel — espazios-web (Astro 4, hybrid SSR)"]
        LEAD["/api/lead.ts<br/>sanitiza · honeypot · rate-limit en memoria<br/>· gate Habeas Data · upsert HubSpot"]
        AUTH["/api/auth.ts<br/>OAuth GitHub — paso 1 (redirect)"]
        CALLBACK["/api/callback.ts<br/>OAuth GitHub — paso 2 (code→token, postMessage)"]
        ADMIN["/admin (Decap CMS)<br/>panel estático + config.yml"]
        STATIC["Páginas estáticas/SSR<br/>home, proyectos, blog"]
    end

    subgraph EXT_WEB["Servicios externos — canal web"]
        HUBSPOT["HubSpot CRM<br/>Contacts API"]
        GH_OAUTH["GitHub OAuth<br/>(login.../authorize, .../access_token)"]
        GH_REPO["Repo GitHub<br/>espazios/espazios-web<br/>(contenido markdown + imágenes)"]
        GCAL["Google Calendar<br/>(appointments/schedules)"]
    end

    subgraph WA_STACK["Canal WhatsApp — Isa"]
        META["Meta / WhatsApp Cloud API<br/>+ Ads (click-to-WhatsApp)"]
        KAPSO["Kapso — Flow engine<br/>Flow: 'Precalificación Leads EZ'<br/>(agent-node / decide-node / send-interactive /<br/>send-template / wait-for-response)"]
    end

    BROWSER -->|"fetch POST JSON"| LEAD
    LEAD -->|"search + create/update contact"| HUBSPOT
    BROWSER -->|"click 'Agendar reunión'"| GCAL

    ADMIN -->|"GET /api/auth?provider=github"| AUTH
    AUTH -->|"302 redirect + cookie state"| GH_OAUTH
    GH_OAUTH -->|"redirect ?code&state"| CALLBACK
    CALLBACK -->|"POST code+secret"| GH_OAUTH
    CALLBACK -->|"postMessage(token) al opener"| ADMIN
    ADMIN -->|"API con token del usuario"| GH_REPO

    META <-->|"mensajes entrantes/salientes<br/>Cloud API"| KAPSO
    KAPSO -->|"plantillas aprobadas<br/>(ej. 'retomaproceso')"| META
```

## 2. Secuencia — sincronización progresiva del cotizador

```mermaid
sequenceDiagram
    participant U as Usuario (navegador)
    participant F as Cotizador.astro (cliente)
    participant API as /api/lead.ts (Vercel Function)
    participant HS as HubSpot API

    U->>F: completa Paso 1 (nombre, correo, celular, consentimiento)
    F->>F: persistField() → localStorage
    F->>API: POST {leadId, etapa:1, fields}
    API->>API: rate-limit por IP (Map en memoria)
    API->>API: honeypot? → si sí, éxito simulado sin sync
    API->>API: ¿fields.email? no → responde ok, hubspotSynced:false
    API->>API: ¿consentimientoHabeasData? no → 400 consent_required
    API->>API: sanitize() cada campo
    API->>HS: search contacto por email
    alt existe
        API->>HS: PATCH /crm/v3/objects/contacts/{id}
    else no existe
        API->>HS: POST /crm/v3/objects/contacts
    end
    HS-->>API: 200 + id
    API-->>F: {ok:true, hubspotSynced:true, hubspotId}
    F->>F: showSave() → "Guardado ✓"
    Note over U,HS: Se repite en cada paso (2..6),<br/>enviando el estado acumulado completo
```

## 3. Secuencia — OAuth de Decap CMS (`/admin`)

```mermaid
sequenceDiagram
    participant Ed as Editor (navegador, /admin)
    participant Auth as /api/auth.ts
    participant GH as GitHub OAuth
    participant CB as /api/callback.ts

    Ed->>Auth: GET /api/auth?provider=github
    Auth->>Auth: genera state = Math.random()+Date.now() (base36)
    Auth-->>Ed: 302 → GitHub authorize<br/>+ Set-Cookie decap_oauth_state (HttpOnly, Secure, SameSite=Lax, 10 min)
    Ed->>GH: autoriza la app (allow_signup=false)
    GH-->>Ed: redirect a redirect_uri con ?code&state
    Ed->>CB: GET /api/callback?code&state
    CB->>CB: compara state recibido vs cookie (CSRF check)
    CB->>GH: POST access_token (client_id + client_secret + code)
    GH-->>CB: access_token
    CB-->>Ed: HTML con <script> que hace postMessage(token) al opener (Decap)
    Note over Ed,CB: Decap CMS usa el token del usuario<br/>para leer/escribir en GitHub — los permisos<br/>reales los sigue validando GitHub (ACL del repo)
```

`redirect_uri` en `/api/auth.ts` se calcula como
`` `${url.protocol}//${url.host}/api/callback` `` — es decir, **se deriva del
host de la petición entrante**, no de una constante fijada al dominio de
producción. Ver hallazgo correspondiente en el análisis de seguridad.

## 4. Secuencia — Isa en WhatsApp (observada vía logs del flujo Kapso)

```mermaid
sequenceDiagram
    participant Usr as Usuario (WhatsApp)
    participant Meta as Meta Cloud API
    participant Flow as Kapso · Flow "Precalificación Leads EZ"

    Usr->>Meta: mensaje entrante (o clic en ad → referral)
    Meta->>Flow: webhook entrante
    Flow->>Flow: execution_started (flow_execution_id)
    Flow->>Flow: variables_set last_user_input=[FILTERED]
    Flow->>Meta: SendTextAction / SendInteractiveAction (pregunta)
    Meta->>Usr: mensaje saliente (texto o lista/botones)
    Flow->>Flow: step_entered wait_for_response (FlowWaitStep)
    Flow->>Flow: status_changed running → waiting
    Usr->>Meta: responde (texto o list_reply)
    Meta->>Flow: reanuda ejecución (waiting → running)
    Note over Flow: se repite por cada campo:<br/>nombre → tipo → ciudad → barrio → presupuesto → plazo
    Flow->>Meta: mensaje final con CTA de agendamiento
    Note over Flow,Meta: Si la conversación queda inactiva,<br/>una plantilla aprobada ("retomaproceso")<br/>reengancha al usuario
```

**Observación positiva:** los eventos de log del flujo (`variables_set`)
muestran el valor del último input del usuario como `[FILTERED]` — Kapso
redacta el contenido capturado por variables en sus logs de auditoría, lo
cual reduce la exposición de PII en la capa de observabilidad.

## 5. Mapa de datos personales (PII)

| Dato | Origen | Dónde se captura | Dónde se sincroniza/almacena | Consentimiento explícito |
|---|---|---|---|---|
| Nombre completo | Web + WhatsApp | Cotizador paso 1 / Isa WhatsApp | localStorage (navegador) → HubSpot | Sí (checkbox Habeas Data, solo canal web) |
| Correo electrónico | Web + WhatsApp | Cotizador paso 1 / Isa WhatsApp | localStorage → HubSpot | Sí (web) / no verificado (WhatsApp) |
| Celular / WhatsApp | Web (input) / WhatsApp (número de origen) | Cotizador paso 1 / metadata de conversación | localStorage → HubSpot / Kapso (conversación) | Sí (web) / no verificado (WhatsApp) |
| Ciudad, barrio/conjunto | Web + WhatsApp | Pasos 3 | localStorage → HubSpot / Kapso | Igual que arriba |
| Presupuesto estimado | Web + WhatsApp | Pasos 4 | localStorage → HubSpot / Kapso | Igual que arriba |
| Plazo / tiempo de inicio | Web + WhatsApp | Pasos 5 | localStorage → HubSpot / Kapso | Igual que arriba |
| Nombre público de contacto (WhatsApp) | WhatsApp | Perfil del contacto | Kapso (`whatsapp_conversations`) | N/A (metadata de la plataforma) |
| `ctwa_clid`, creative/anuncio de origen | WhatsApp (referral de Meta Ads) | Primer mensaje | Kapso (evento `referral`) | N/A (atribución de marketing) |

`leadId` en el canal web es un UUID v4 generado **en el cliente** con
`Math.random()` (no `crypto.randomUUID()`), almacenado en `localStorage`, y
viaja sin autenticación en cada `POST /api/lead` — cualquiera que lo conozca
podría, en teoría, reenviar/actualizar ese lead (ver análisis de seguridad).
