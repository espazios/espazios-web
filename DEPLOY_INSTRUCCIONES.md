# 🚀 Instrucciones de Deploy — Espazios Web

**Estado:** El proyecto Astro está completo en tu carpeta local. Falta subirlo a GitHub y conectarlo con Vercel.

**Tiempo estimado:** 15-20 minutos.

---

## 📋 Resumen de lo que vas a hacer

1. Instalar Git en tu PC (si no lo tienes)
2. Inicializar el repo local
3. Subir el código a GitHub (`espazios/espazios-web`)
4. Conectar el repo con Vercel
5. Configurar las variables de entorno (token HubSpot)
6. Verificar el deploy

Al terminar, tu sitio estará en una URL tipo `espazios-web.vercel.app`.

---

## PASO 1 — Verificar/Instalar herramientas (5 min)

### 1.1 Verificar Node.js

Abre una **terminal** (Windows: PowerShell o CMD) y escribe:
```bash
node --version
```

Si te muestra `v20.x.x` o superior, perfecto. Si dice "comando no reconocido":
- Descarga e instala Node.js LTS desde [nodejs.org](https://nodejs.org)

### 1.2 Verificar Git

```bash
git --version
```

Si te muestra `git version 2.x.x`, perfecto. Si no:
- Descarga e instala desde [git-scm.com](https://git-scm.com/download/win)
- Durante la instalación deja todas las opciones por defecto

### 1.3 Configurar Git la primera vez

```bash
git config --global user.name "Yonathan Murillo"
git config --global user.email "tu@email.com"
```

---

## PASO 2 — Inicializar y subir el proyecto a GitHub (5 min)

### 2.1 Navegar a la carpeta del proyecto

En la terminal:
```bash
cd "C:\Users\ysmur\OneDrive\Documents\Claude\Projects\Wix_EZ\espazios-web"
```

### 2.2 Instalar dependencias

```bash
npm install
```

Esto crea la carpeta `node_modules/` (que NO se sube a GitHub gracias al `.gitignore`).
Tardará 1-2 minutos.

### 2.3 (Opcional) Probar en local

```bash
npm run dev
```

Abre http://localhost:4321 en tu navegador. Verás el sitio funcionando localmente.
Cuando termines de revisar, presiona `Ctrl+C` en la terminal para detenerlo.

### 2.4 Inicializar el repo Git

```bash
git init
git add .
git commit -m "feat: initial commit - sitio Espazios en Astro"
git branch -M main
```

### 2.5 Conectar con el repo de GitHub

```bash
git remote add origin https://github.com/espazios/espazios-web.git
git push -u origin main
```

GitHub te pedirá usuario y contraseña/token:
- **Usuario:** `espazios`
- **Contraseña:** GitHub ya NO acepta contraseñas, necesitas un **Personal Access Token**:
  1. Ve a [github.com/settings/tokens](https://github.com/settings/tokens)
  2. Click **"Generate new token (classic)"**
  3. Nombre: `espazios-web-deploy`
  4. Expiración: 90 días
  5. Scopes: marca **`repo`** (todo lo de repo)
  6. Generate → copia el token (empieza con `ghp_...`)
  7. Úsalo como contraseña

✅ Cuando termine, ve a [github.com/espazios/espazios-web](https://github.com/espazios/espazios-web) y verás los archivos subidos.

---

## PASO 3 — Conectar el repo con Vercel (3 min)

### 3.1 Importar proyecto en Vercel

1. Ve a [vercel.com/new](https://vercel.com/new)
2. Selecciona tu cuenta (espazios-8361's projects)
3. Verás la lista de repos de tu GitHub. Busca `espazios-web`.
4. Click **"Import"**

### 3.2 Configurar el proyecto

En la pantalla de configuración:
- **Project Name:** `espazios-web` (déjalo así)
- **Framework Preset:** Vercel detectará automáticamente **"Astro"** ✓
- **Root Directory:** `./` (raíz, déjalo así)
- **Build Command:** `npm run build` (automático)
- **Output Directory:** `dist` (automático)

### 3.3 Variables de entorno (ANTES de hacer deploy)

Antes de hacer click en "Deploy", expande la sección **"Environment Variables"** y agrega:

| Name | Value |
|---|---|
| `HUBSPOT_PRIVATE_APP_TOKEN` | tu token de HubSpot (el que ya tienes en Wix) |
| `HUBSPOT_PORTAL_ID` | tu portal ID de HubSpot |
| `PUBLIC_SITE_URL` | `https://www.espazios.com.co` |

**Importante:** marca las 3 variables para **Production, Preview y Development**.

### 3.4 Click "Deploy"

Vercel empezará a buildear el sitio. Tardará 1-2 minutos.

✅ Cuando termine, te dará una URL tipo:
`https://espazios-web-xxxxxxxxx.vercel.app`

---

## PASO 4 — Verificar el sitio (5 min)

### 4.1 Abre la URL temporal

Te lleva al sitio Espazios funcionando.

**Verifica:**
- ✅ Home se ve con todas las secciones (hero, productos, proyectos, cotizador, etc.)
- ✅ Click en "Proyectos" → ves los 8 proyectos en grid con filtros
- ✅ Click en cualquier proyecto → ves su página de detalle
- ✅ Click en "Blog" → ves los 5 artículos
- ✅ Click en footer → "Política de privacidad" abre la página legal
- ✅ Estrecha la ventana del navegador → aparece el menú hamburguesa

### 4.2 Probar el cotizador end-to-end

1. Click en "Cotizar →"
2. Llena los 6 pasos
3. Al terminar el paso 1, **verifica en HubSpot** que apareció el contacto.

Si aparece → la integración HubSpot funciona correctamente. 🎉

Si NO aparece:
- Ve a Vercel → tu proyecto → Settings → Environment Variables → verifica que `HUBSPOT_PRIVATE_APP_TOKEN` esté bien
- Ve a Vercel → tu proyecto → Functions → Logs → busca errores

### 4.3 Test de Decap CMS (admin de contenido)

Abre `https://tu-sitio.vercel.app/admin`

⚠️ Decap CMS requiere un setup adicional con Netlify Identity o OAuth de GitHub. Por ahora verás el panel vacío. Esto lo configuramos en una segunda iteración cuando ya estés cómodo con todo lo demás.

**Mientras tanto:** para crear/editar proyectos y blog posts, edita los archivos markdown en GitHub directamente o desde tu PC y haz `git push`.

---

## PASO 5 — Siguiente paso: dominio espazios.com.co (CON AUTORIZACIÓN)

⚠️ **NO HACER hasta que apruebes**.

Cuando todo te guste:
1. Vercel → tu proyecto → Settings → Domains → Add Domain
2. Escribe `espazios.com.co`
3. Vercel te dará los registros DNS que debes configurar en tu proveedor de dominio
4. Espera 10-30 minutos a que propague
5. ¡Listo! El sitio nuevo reemplaza al viejo Wix.

**Antes de migrar dominio:** te aviso, validas, y cuando autorices explícitamente lo hacemos.

---

## 🆘 Si algo falla

### El push a GitHub falla con "Authentication failed"
Necesitas el Personal Access Token (PASO 2.5). No uses tu contraseña normal.

### `npm install` da errores
Verifica que tu Node.js sea v20+ con `node --version`.

### Vercel build falla
Ve a la pestaña "Build Logs" en Vercel. Cópiame el error y te ayudo.

### La página `/cotiza` se ve pero no envía a HubSpot
Variable de entorno mal configurada. Ve a Vercel → Settings → Environment Variables.

### El sitio se ve sin estilos
Probablemente faltó algún archivo. Verifica que la carpeta `src/styles/global.css` esté en GitHub.

---

## 📞 Próximo punto de sincronización

Cuando completes los pasos 1-4, dime:
- ✅ "El sitio está en `https://espazios-web-xxxxx.vercel.app` y se ve bien"
- O dime exactamente en qué paso te trabaste y qué viste en pantalla

Yo verifico desde aquí con Vercel MCP que todo esté correcto y te ayudo a depurar.

¡Vamos!
