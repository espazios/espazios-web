# Espazios Web

Sitio web oficial de Espazios — Acabados, carpintería y remodelación en Bogotá y alrededores.

## Stack

- **Astro 4** (hybrid SSR + Static)
- **Vercel** (hosting + Edge Functions)
- **Decap CMS** (admin panel en `/admin`)
- **HubSpot CRM** (vía API route `/api/lead`)
- **Fuentes:** Fraunces (display) + Inter (body)

## Setup local

```bash
npm install
cp .env.example .env  # llenar con credenciales reales
npm run dev           # http://localhost:4321
```

## Comandos

| Comando | Acción |
|---|---|
| `npm install` | Instalar dependencias |
| `npm run dev` | Dev server (localhost:4321) |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build |

## Estructura

```
src/
├── components/      # Componentes reutilizables
├── layouts/         # Layouts base
├── pages/           # Rutas del sitio
│   ├── api/         # API routes (Vercel Functions)
│   └── ...
├── content/         # Markdown (proyectos, blog)
├── styles/          # CSS global
└── lib/             # Helpers

public/
└── admin/           # Decap CMS panel
```

## Deploy

Push a `main` → Vercel hace deploy automático.

## Variables de entorno (Vercel)

- `HUBSPOT_PRIVATE_APP_TOKEN`
- `HUBSPOT_PORTAL_ID`

Configurar en: Vercel Dashboard → Settings → Environment Variables.

© 2026 Espazios. Todos los derechos reservados.
