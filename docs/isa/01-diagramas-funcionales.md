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

## 3. Embudo unificado de leads

Ambos canales alimentan la misma intención de negocio (precalificar y agendar
una asesoría), pero **no hay evidencia, en el código o la configuración
revisada, de que el canal WhatsApp escriba al mismo HubSpot que usa el
cotizador web** — ver hallazgo de gobierno de datos en
[`03-analisis-seguridad.md`](./03-analisis-seguridad.md#hallazgo-info-1--sin-integración-visible-whatsapp--hubspot).

```mermaid
flowchart LR
    subgraph WEB["Canal Web"]
        W1["Cotizador<br/>(6 pasos)"]
    end
    subgraph WA["Canal WhatsApp"]
        WA1["Isa · Kapso<br/>('Precalificación Leads EZ')"]
    end
    W1 -->|"POST /api/lead<br/>por cada paso"| CRM["HubSpot CRM<br/>(Contacts)"]
    WA1 -.->|"¿Integración?<br/>no confirmada"| CRM
    CRM --> SALES(["Equipo comercial<br/>Espazios"])
    WA1 -->|"handoff directo"| SALES
```
