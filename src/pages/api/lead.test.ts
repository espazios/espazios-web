import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitize, mapToHubSpotProps, rateLimitCheck, POST, GET } from './lead';

// Cada test de rate limit / POST usa una IP distinta para no compartir el
// contador en memoria (Map a nivel de módulo) entre casos.
let ipCounter = 0;
function freshIp() {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

function makeContext(body: unknown, ip = freshIp()) {
  return {
    request: new Request('http://localhost/api/lead', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    clientAddress: ip,
  } as any;
}

async function readJson(res: Response) {
  return JSON.parse(await res.text());
}

describe('sanitize', () => {
  it('devuelve string vacío para null/undefined', () => {
    expect(sanitize(null)).toBe('');
    expect(sanitize(undefined)).toBe('');
  });

  it('quita < y > (XSS básico)', () => {
    expect(sanitize('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('trunca a maxLen', () => {
    expect(sanitize('a'.repeat(10), 'text', 5)).toBe('aaaaa');
  });

  it('quita caracteres de control', () => {
    expect(sanitize('hola\x00\x1F\x7Fmundo')).toBe('holamundo');
  });

  it('valida email correcto', () => {
    expect(sanitize('user@example.com', 'email')).toBe('user@example.com');
  });

  it('rechaza email inválido devolviendo string vacío', () => {
    expect(sanitize('no-es-email', 'email')).toBe('');
    expect(sanitize('sin-arroba.com', 'email')).toBe('');
  });

  it('filtra phone a solo dígitos y símbolos permitidos', () => {
    expect(sanitize('+57 (310) 870-8467', 'phone')).toBe('+57 (310) 870-8467');
    expect(sanitize('+57 (310) 870-8467 ext.99', 'phone')).toBe('+57 (310) 870-8467 99');
  });

  it('filtra name a whitelist de letras/tildes/ñ/espacio/apóstrofe/punto/guión', () => {
    expect(sanitize('José Ñáñez-O\'Brien 123!', 'name')).toBe('José Ñáñez-O\'Brien ');
  });
});

describe('mapToHubSpotProps', () => {
  it('mapea un payload completo a las propiedades HubSpot correctas', () => {
    const props = mapToHubSpotProps({
      nombre: 'Ana Melo',
      email: 'ana@example.com',
      celular: '3101234567',
      tipoProyecto: 'Full Acabados',
      ciudad: 'Bogotá',
      barrioConjunto: 'Porto Hayuelos',
      presupuesto: '15-25M',
    });
    expect(props).toEqual({
      email: 'ana@example.com',
      firstname: 'Ana',
      lastname: 'Melo',
      phone: '3101234567',
      tipo_de_proyecto: 'Full Acabados',
      city: 'Bogotá',
      nombre_del_conjunto_o_barrio: 'Porto Hayuelos',
      rango_presupuesto: '15-25M',
    });
  });

  it('omite campos opcionales ausentes', () => {
    const props = mapToHubSpotProps({ nombre: 'Ana', email: 'ana@example.com' });
    expect(props).toEqual({ email: 'ana@example.com', firstname: 'Ana' });
    expect(props).not.toHaveProperty('lastname');
    expect(props).not.toHaveProperty('phone');
  });

  it('separa nombre de una sola palabra sin lastname', () => {
    const props = mapToHubSpotProps({ nombre: 'Ana' });
    expect(props.firstname).toBe('Ana');
    expect(props).not.toHaveProperty('lastname');
  });

  it('separa nombre con varias palabras en firstname/lastname', () => {
    const props = mapToHubSpotProps({ nombre: 'Ana María Melo Ríos' });
    expect(props.firstname).toBe('Ana');
    expect(props.lastname).toBe('María Melo Ríos');
  });
});

describe('rateLimitCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('permite requests bajo el límite', () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) {
      expect(rateLimitCheck(ip).allowed).toBe(true);
    }
  });

  it('bloquea la request número 11 dentro de la ventana', () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) rateLimitCheck(ip);
    const result = rateLimitCheck(ip);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('resetea la ventana después de 10 minutos', () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) rateLimitCheck(ip);
    expect(rateLimitCheck(ip).allowed).toBe(false);

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(rateLimitCheck(ip).allowed).toBe(true);
  });

  it('mantiene contadores independientes por IP', () => {
    const ipA = freshIp();
    const ipB = freshIp();
    for (let i = 0; i < 10; i++) rateLimitCheck(ipA);
    expect(rateLimitCheck(ipA).allowed).toBe(false);
    expect(rateLimitCheck(ipB).allowed).toBe(true);
  });
});

describe('POST /api/lead', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('HUBSPOT_PRIVATE_APP_TOKEN', 'test-token');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('responde 500 config_error si falta el token de HubSpot', async () => {
    vi.stubEnv('HUBSPOT_PRIVATE_APP_TOKEN', '');
    const res = await POST(makeContext({ leadId: 'l1', fields: { email: 'a@b.com' } }));
    expect(res.status).toBe(500);
    expect(await readJson(res)).toMatchObject({ ok: false, error: 'config_error' });
  });

  it('responde 429 rate_limited al superar el límite', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) {
      await POST(makeContext({ leadId: 'l1', fields: {} }, ip));
    }
    const res = await POST(makeContext({ leadId: 'l1', fields: {} }, ip));
    expect(res.status).toBe(429);
    const body = await readJson(res);
    expect(body).toMatchObject({ ok: false, error: 'rate_limited' });
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it('responde 400 invalid_payload si falta leadId o fields', async () => {
    const res1 = await POST(makeContext({ fields: {} }));
    expect(res1.status).toBe(400);
    expect(await readJson(res1)).toMatchObject({ ok: false, error: 'invalid_payload' });

    const res2 = await POST(makeContext({ leadId: 'l1' }));
    expect(res2.status).toBe(400);
  });

  it('honeypot lleno responde 200 silencioso y NO llama a HubSpot', async () => {
    const res = await POST(
      makeContext({ leadId: 'l1', fields: { email: 'bot@example.com', website: 'http://spam.com' } })
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ ok: true, hubspotSynced: false, reason: 'honeypot' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin email responde 200 hubspotSynced:false reason no_email_yet', async () => {
    const res = await POST(makeContext({ leadId: 'l1', fields: { nombre: 'Ana' } }));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ ok: true, hubspotSynced: false, reason: 'no_email_yet' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falta consentimiento Habeas Data con email presente responde 400 consent_required', async () => {
    const res = await POST(makeContext({ leadId: 'l1', fields: { email: 'ana@example.com' } }));
    expect(res.status).toBe(400);
    expect(await readJson(res)).toMatchObject({ ok: false, error: 'consent_required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('happy path: contacto nuevo hace search vacío + create', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'hs-123' }), { status: 201 }));

    const res = await POST(
      makeContext({
        leadId: 'l1',
        fields: { email: 'ana@example.com', nombre: 'Ana Melo', consentimientoHabeasData: true },
      })
    );

    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ ok: true, hubspotSynced: true, hubspotId: 'hs-123' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/crm/v3/objects/contacts');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
  });

  it('happy path: contacto existente hace search con hit + PATCH update', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: 'hs-999' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'hs-999' }), { status: 200 }));

    const res = await POST(
      makeContext({
        leadId: 'l1',
        fields: { email: 'ana@example.com', nombre: 'Ana Melo', consentimientoHabeasData: true },
      })
    );

    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ ok: true, hubspotSynced: true, hubspotId: 'hs-999' });
    expect(fetchMock.mock.calls[1][0]).toContain('/crm/v3/objects/contacts/hs-999');
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
  });

  it('falla de HubSpot responde 500 server_error con mensaje truncado', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('unauthorized details here', { status: 401 })
    );

    const res = await POST(
      makeContext({
        leadId: 'l1',
        fields: { email: 'ana@example.com', consentimientoHabeasData: true },
      })
    );

    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('server_error');
    expect(body.message.length).toBeLessThanOrEqual(200);
  });
});

describe('GET /api/lead (health check)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('configured:true cuando hay token', async () => {
    vi.stubEnv('HUBSPOT_PRIVATE_APP_TOKEN', 'test-token');
    const res = await GET({} as any);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ ok: true, configured: true });
  });

  it('configured:false cuando falta el token', async () => {
    vi.stubEnv('HUBSPOT_PRIVATE_APP_TOKEN', '');
    const res = await GET({} as any);
    expect(await readJson(res)).toMatchObject({ ok: true, configured: false });
  });
});
