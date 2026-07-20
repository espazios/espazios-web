/**
 * /api/lead — Endpoint Vercel para recibir leads del cotizador
 * Reemplaza el backend Velo del sitio Wix con misma lógica:
 *   1. Recibe payload del cotizador (cliente)
 *   2. Sanitiza inputs
 *   3. Hace upsert a HubSpot Contacts API
 *   4. Responde OK/error al frontend
 *
 * Variables de entorno requeridas:
 *   HUBSPOT_PRIVATE_APP_TOKEN
 *   HUBSPOT_PORTAL_ID (opcional, para logs)
 */
import type { APIRoute } from 'astro';
 
export const prerender = false; // Server endpoint
 
const HS_BASE = 'https://api.hubapi.com';
 
// ===== Sanitización =====
function sanitize(input: unknown, type: 'text' | 'email' | 'phone' | 'name' = 'text', maxLen = 500): string {
  if (input == null) return '';
  let s = String(input).trim().slice(0, maxLen);
  s = s.replace(/[<>]/g, '');
  s = s.replace(/[\x00-\x1F\x7F]/g, '');
  if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return '';
  if (type === 'phone') s = s.replace(/[^\d+\-()\s]/g, '');
  if (type === 'name') s = s.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'.\-]/g, '');
  return s;
}
 
// ===== Mapeo a propiedades HubSpot =====
function mapToHubSpotProps(payload: Record<string, unknown>): Record<string, string> {
  const nombre = sanitize(payload.nombre, 'name', 100);
  const partes = nombre.split(/\s+/);
  const firstname = partes[0] || '';
  const lastname = partes.slice(1).join(' ') || '';
 
  const props: Record<string, string> = {};
  if (payload.email) props.email = sanitize(payload.email, 'email', 150);
  if (firstname) props.firstname = firstname;
  if (lastname) props.lastname = lastname;
  if (payload.celular) props.phone = sanitize(payload.celular, 'phone', 20);
  if (payload.tipoProyecto) props.tipo_de_proyecto = sanitize(payload.tipoProyecto, 'text', 50);
  if (payload.ciudad) props.city = sanitize(payload.ciudad, 'text', 50);
  if (payload.barrioConjunto) props.nombre_del_conjunto_o_barrio = sanitize(payload.barrioConjunto, 'text', 100);
  if (payload.presupuesto) props.rango_presupuesto = sanitize(payload.presupuesto, 'text', 50);
  return props;
}
 
// ===== HubSpot Upsert =====
async function upsertContact(token: string, props: Record<string, string>) {
  if (!props.email) throw new Error('email es requerido para upsert');
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
 
  // 1) Buscar
  const searchRes = await fetch(`${HS_BASE}/crm/v3/objects/contacts/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: props.email }] }],
      properties: ['email', 'firstname', 'lastname'],
      limit: 1,
    }),
  });
  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`HubSpot search failed ${searchRes.status}: ${errText.slice(0, 200)}`);
  }
  const search = await searchRes.json();
 
  // 2) Update o Create
  if (search.results && search.results.length > 0) {
    const id = search.results[0].id;
    const r = await fetch(`${HS_BASE}/crm/v3/objects/contacts/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ properties: props }),
    });
    if (!r.ok) throw new Error(`HubSpot update failed ${r.status}`);
    return await r.json();
  } else {
    const r = await fetch(`${HS_BASE}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ properties: props }),
    });
    if (!r.ok) throw new Error(`HubSpot create failed ${r.status}`);
    return await r.json();
  }
}
 
// ===== Rate limit en memoria (sesión Vercel) =====
const requestLog = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000; // 10 min
const MAX_REQUESTS = 10;
 
function rateLimitCheck(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const list = requestLog.get(ip) || [];
  const recent = list.filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    return { allowed: false, retryAfter: Math.ceil((WINDOW_MS - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  requestLog.set(ip, recent);
  return { allowed: true };
}
 
// ===== HANDLER =====
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const token = import.meta.env.HUBSPOT_PRIVATE_APP_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'config_error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
 
    const ip = clientAddress || 'unknown';
    const rl = rateLimitCheck(ip);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ ok: false, error: 'rate_limited', retryAfter: rl.retryAfter }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
 
    const payload = await request.json();
    const { leadId, etapa, fields } = payload || {};
    if (!leadId || !fields) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
 
    // HONEYPOT anti-bots: si el campo "website" viene lleno, fingimos éxito silencioso.
    // Los humanos nunca ven este campo (visualmente oculto), los bots que llenan todo caen.
    if (fields.website) {
      console.warn('[api/lead] honeypot triggered from IP', ip);
      return new Response(
        JSON.stringify({ ok: true, hubspotSynced: false, reason: 'honeypot' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
 
    // Solo sync a HubSpot si hay email
    if (!fields.email) {
      return new Response(
        JSON.stringify({ ok: true, hubspotSynced: false, reason: 'no_email_yet' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
 
    // HABEAS DATA: requerido antes de sincronizar a HubSpot (Ley 1581/2012 CO)
    if (!fields.consentimientoHabeasData) {
      return new Response(
        JSON.stringify({ ok: false, error: 'consent_required', message: 'Debes aceptar la política de datos.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
 
    const hsProps = mapToHubSpotProps(fields);
    const result = await upsertContact(token, hsProps);
 
    return new Response(
      JSON.stringify({ ok: true, hubspotId: result.id, hubspotSynced: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('[api/lead] error', e?.message || e);
    return new Response(
      JSON.stringify({ ok: false, error: 'server_error', message: String(e?.message || e).slice(0, 200) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
 
// Health check
export const GET: APIRoute = async () => {
  const hasToken = !!import.meta.env.HUBSPOT_PRIVATE_APP_TOKEN;
  return new Response(
    JSON.stringify({ ok: true, configured: hasToken, timestamp: new Date().toISOString() }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
 
