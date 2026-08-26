# Diagramas funcionales — Isa

Vista de negocio: qué le pasa al usuario en cada paso, sin entrar en detalle
de implementación (eso está en [`02-arquitectura-tecnica.md`](./02-arquitectura-tecnica.md)).

## 1. Canal web — Cotizador (`/#cotizador`)

Wizard de 6 pasos. Cada paso se guarda de inmediato ("Guardado ✓") y se
sincroniza a HubSpot en cuanto hay correo y consentimiento — no solo al final.

```mermaid
flowchart TD
    A(["Visitante entra a espazios.com.co<br/>y hace clic en 'Cotizar'"]) --> B["<b>Isa (bubble):</b><br/>'Hola, soy Isa de Espazios'"]
    B --> C{"Paso 1 · Datos de contacto<br/>Nombre, correo, celular<br/>+ checkbox Habeas Data"}
    C -- "Honeypot lleno (bot)" --> C2["Éxito silencioso simulado<br/>(no se sincroniza a HubSpot)"]
    C -- "Datos válidos + consentimiento" --> D["Paso 2 · Tipo de remodelación<br/>Full Acabados / Carpintería / Obra Blanca"]
    D --> E["Paso 3 · Ubicación<br/>Ciudad (Bogotá/Soacha/Alrededores)<br/>+ barrio o conjunto (opcional)"]
    E --> F["Paso 4 · Presupuesto estimado<br/>4 rangos, desde <$15M hasta >$40M"]
    F --> G["Paso 5 · Fecha de inicio deseada<br/>Inmediato → más de 6 meses"]
    G --> H["<b>Isa (bubble):</b><br/>'Falta poco para tu cotización'<br/>Paso 6 · Agendar asesoría"]
    H --> I{"Canal preferido"}
    I -- "Llamada / Videollamada / Visita<br/>+ Agendar reunión" --> J["Abre Google Calendar<br/>(agendamiento) en pestaña nueva"]
    I -- "'Prefiero que me llamen'" --> K["Marca completado,<br/>sin agendamiento directo"]
    J --> L(["Pantalla de éxito:<br/>'Te contactamos en <24h hábiles'"])
    K --> L
    L --> M["Sugerencia: ver proyectos anteriores"]

    style C2 fill:#5a3a3a,color:#fff
```

**Cada paso** (1 a 6) dispara `syncToHubSpot(etapa)` — es decir, el equipo
comercial ve el lead avanzar en HubSpot en tiempo casi real, incluso si el
visitante abandona el formulario a mitad de camino.

## 2. Canal WhatsApp — Isa (flujo Kapso "Precalificación Leads EZ")

Flujo observado en producción: entrada típica por un anuncio de Meta
(*click-to-WhatsApp*) con `referral` de Facebook/Instagram, aunque también
responde a mensajes directos al número `+57 310 8708467`.

```mermaid
flowchart TD
    A(["Usuario hace clic en anuncio de Meta<br/>('¡Tus acabados a tu medida!')<br/>o escribe directo por WhatsApp"]) --> B["<b>Isa:</b> 'Hola! hablas con Isa de Espazios...<br/>¿Con quién tengo el gusto?'"]
    B --> C["Usuario responde su nombre<br/>(texto libre)"]
    C --> D["<b>Isa:</b> lista interactiva —<br/>Tipo de remodelación<br/>(Remodelación completa / Carpintería / Solo acabados)"]
    D --> E["<b>Isa:</b> lista interactiva — Ciudad<br/>(Bogotá / Soacha / Alrededores)"]
    E --> F["<b>Isa:</b> '¿En qué conjunto o barrio<br/>está tu vivienda?' (texto libre)"]
    F --> G["<b>Isa:</b> lista interactiva — Presupuesto<br/>(4 rangos, $ millones COP)"]
    G --> H["<b>Isa:</b> lista interactiva — Plazo<br/>(Inmediato → más de 6 meses)"]
    H --> I{"¿Proyecto encaja<br/>con el negocio?"}
    I -- Sí --> J["<b>Isa:</b> '¡Tu proyecto encaja perfecto!'<br/>botones: Agendar llamada / Agendar reunión"]
    I -- "Datos incompletos<br/>o fuera de cobertura" --> K["Isa pide dato faltante<br/>o informa que no hay cobertura"]
    J --> L["Usuario elige canal de agendamiento"]
    L --> M(["Handoff a equipo comercial<br/>(agendamiento / seguimiento humano)"])

    N(["Conversación quedó a medias<br/>(usuario no respondió)"]) -.-> O["Plantilla WhatsApp 'retomaproceso'<br/>(reenganche, marketing, botones<br/>Continuemos / No deseo continuar)"]
    O -.-> D
```

**Nota:** el flujo usa **listas y botones interactivos de WhatsApp** para casi
todos los campos (menos nombre y barrio, que son texto libre) — esto reduce
errores de captura y facilita el mapeo a las mismas categorías que usa el
cotizador web (mismos rangos de presupuesto, mismas ciudades de cobertura,
mismos tipos de proyecto).

## 3. Isa v2 — agente generativo (Sandbox, `espazios-whatsapp-agent`)

Versión en desarrollo, probada en el Sandbox de Kapso al momento de esta
revisión (2026-08-24) — **no ha reemplazado** al flujo v1 de la sección 2. En
vez de un árbol de decisión fijo, un `agent node` con modelo Claude conduce
la conversación libremente siguiendo un system prompt (`docs/isa-v2-system-prompt.md`,
779 líneas) que igual debe recolectar los mismos 8 datos, en el mismo orden:
`nombre → ciudad → tipo_proyecto → presupuesto → conjunto_o_barrio → m2 → plazo → correo`.

```mermaid
flowchart TD
    A(["Usuario escribe a Isa v2<br/>(agent node, modelo Claude)"]) --> B["Isa saluda usando el nombre<br/>de perfil de WhatsApp (get_whatsapp_context)"]
    B --> C["Aviso Habeas Data (Ley 1581/2012)<br/>+ pregunta de ciudad, en un solo mensaje"]
    C --> D{"¿Ciudad cubierta<br/>para el tipo de proyecto?"}
    D -- No --> Z(["Cierre cordial:<br/>'hoy no llegamos a esa zona'"])
    D -- Sí --> E["tipo_proyecto (lista con negrilla)"]
    E --> F["presupuesto (pregunta abierta)"]
    F --> G{"¿Presupuesto<br/>alcanza el mínimo?"}
    G -- "No, 1ra vez" --> G2["Isa maneja la objeción<br/>(hasta 2 intentos)"]
    G -- Sí --> H["conjunto_o_barrio (texto libre)"]
    G2 --> H
    H --> I["m2 (numérico)"]
    I --> J["plazo (pregunta abierta)"]
    J --> K["correo (anuncia que viene<br/>un valor ilustrativo)"]
    K --> L["<b>Tool call:</b> generar_estimado_ilustrativo<br/>→ POST /tools/estimado-ilustrativo"]
    L --> M["Isa envía imagen con<br/>'Desde $X' de los 3 paquetes"]
    M --> N{"¿Cliente pide detalle<br/>de un paquete?"}
    N -- Sí --> N2["<b>Tool call:</b> ver_detalle_paquete<br/>→ POST /tools/detalle-paquete"]
    N2 --> O
    N -- No --> O["Pregunta corta:<br/>'¿dudas, o agendamos?'"]
    O --> P["Logística de agendamiento<br/>(llamada / reunión / presencial)"]
    P --> Q(["Handoff a Ejecutivo Comercial"])
```

Reglas de negocio explícitas en el repo que valen la pena resaltar:
- **La cotización nunca la redacta el modelo en texto libre** — siempre sale
  de fórmulas ya calculadas (Sheets/plantilla), el LLM solo la explica.
  Esto limita el riesgo de que el modelo "invente" un precio.
- El envío de fotos/videos del apartamento se reconoce y se guarda como
  contexto para el Ejecutivo Comercial, pero Isa tiene instrucción explícita
  de **no leer medidas ni datos como confirmados** a partir de una imagen.
- El "estimado ilustrativo" (imagen con 3 paquetes) es la funcionalidad que
  sí está conectada hoy; `generar_cotizacion` (PDF vía plantilla operativa
  del cotizador, `src/tools/cotizador/`) existe en el código pero está
  **dormida** — no forma parte del guion de conversación actual (ver
  hallazgo de inyección de fórmulas en
  [`03-analisis-seguridad.md`](./03-analisis-seguridad.md)).

## 4. Embudo unificado de leads

Los tres sistemas alimentan la misma intención de negocio (precalificar y
agendar una asesoría), pero **no hay evidencia, en el código ni en la
configuración revisada, de que ninguno de los dos canales de WhatsApp
escriba al mismo HubSpot que usa el cotizador web** — de hecho, el propio
`CLAUDE.md` de `espazios-whatsapp-agent` confirma esto explícitamente:
`sync_hubspot: falta construir`. Ver hallazgo de gobierno de datos en
[`03-analisis-seguridad.md`](./03-analisis-seguridad.md#hallazgo-info-1--sin-integración-visible-whatsapp--hubspot).

```mermaid
flowchart LR
    subgraph WEB["Canal Web"]
        W1["Cotizador<br/>(6 pasos)"]
    end
    subgraph WA1S["WhatsApp · Isa v1 (producción)"]
        WA1["Flujo Kapso<br/>'Precalificación Leads EZ'"]
    end
    subgraph WA2S["WhatsApp · Isa v2 (Sandbox)"]
        WA2["agent node (Claude)<br/>+ tools-server (Railway)"]
    end
    W1 -->|"POST /api/lead<br/>por cada paso"| CRM["HubSpot CRM<br/>(Contacts)"]
    WA1 -.->|"¿Integración?<br/>no confirmada"| CRM
    WA2 -.->|"sync_hubspot:<br/>pendiente de construir"| CRM
    CRM --> SALES(["Equipo comercial<br/>Espazios"])
    WA1 -->|"handoff directo"| SALES
    WA2 -->|"handoff directo<br/>(cuando salga de Sandbox)"| SALES
```
