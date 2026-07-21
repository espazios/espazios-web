import { test, expect } from '@playwright/test';

// Tests de integración contra el servidor real (astro preview), sin mocks.
// Solo cubrimos caminos que el handler resuelve ANTES de llamar a HubSpot
// (honeypot, payload inválido, falta de consentimiento, rate limit), así
// no dependemos de credenciales reales. El happy path que sí llama a
// HubSpot ya está cubierto con fetch mockeado en tests/unit/lead.test.ts.
//
// Todas las requests de este archivo comparten la misma IP (127.0.0.1) y
// por lo tanto el mismo contador del rate limiter en memoria del servidor,
// así que el archivo corre en serie y en un orden deliberado: los casos
// "normales" primero, el stress de rate limit al final.
test.describe.serial('API real /api/lead (servidor sin mocks)', () => {
  test('honeypot lleno responde 200 silencioso', async ({ request }) => {
    const res = await request.post('/api/lead', {
      data: { leadId: 'e2e-honeypot', etapa: 1, fields: { email: 'bot@example.com', website: 'http://spam.com' } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, hubspotSynced: false, reason: 'honeypot' });
  });

  test('payload inválido (sin leadId) responde 400', async ({ request }) => {
    const res = await request.post('/api/lead', { data: { fields: { email: 'a@b.com' } } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: 'invalid_payload' });
  });

  test('payload inválido (sin fields) responde 400', async ({ request }) => {
    const res = await request.post('/api/lead', { data: { leadId: 'e2e-2' } });
    expect(res.status()).toBe(400);
  });

  test('falta consentimiento Habeas Data con email presente responde 400', async ({ request }) => {
    const res = await request.post('/api/lead', {
      data: { leadId: 'e2e-consent', etapa: 1, fields: { email: 'ana@example.com' } },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: 'consent_required' });
  });

  test('GET /api/lead responde health check', async ({ request }) => {
    const res = await request.get('/api/lead');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('configured');
  });

  test('rate limit real: al superar el límite responde 429 de forma consistente', async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await request.post('/api/lead', { data: { leadId: `e2e-stress-${i}`, etapa: 1, fields: {} } });
      statuses.push(res.status());
    }

    expect(statuses).toContain(429);
    const first429 = statuses.indexOf(429);
    // Una vez que empieza a bloquear dentro de la ventana de 10 min, se
    // mantiene bloqueado para el resto de las requests de este bloque.
    expect(statuses.slice(first429).every((s) => s === 429)).toBe(true);

    const lastRes = await request.post('/api/lead', { data: { leadId: 'e2e-stress-last', etapa: 1, fields: {} } });
    expect(lastRes.status()).toBe(429);
    const body = await lastRes.json();
    expect(body).toMatchObject({ ok: false, error: 'rate_limited' });
    expect(body.retryAfter).toBeGreaterThan(0);
  });
});
