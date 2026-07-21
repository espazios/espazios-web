import { test, expect, type Route } from '@playwright/test';

// Todos los tests interceptan /api/lead para no depender de HubSpot real.
// La lógica del servidor (honeypot, consentimiento, rate limit) ya está
// cubierta por los unit tests de Vitest (tests/unit/lead.test.ts).

async function mockLeadApi(page: import('@playwright/test').Page) {
  const calls: Array<Record<string, unknown>> = [];
  await page.route('**/api/lead', async (route: Route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, hubspotSynced: true, hubspotId: 'test-id' }),
    });
  });
  return calls;
}

async function fillStep1(page: import('@playwright/test').Page) {
  await page.locator('#inpNombre').fill('Ana María Melo');
  await page.locator('#inpEmail').fill('ana@example.com');
  await page.locator('#inpCelular').fill('3101234567');
  await page.locator('#inpConsentimiento').check();
}

test.describe('Cotizador — happy path', () => {
  test('completa los 6 pasos hasta la pantalla de éxito', async ({ page }) => {
    const calls = await mockLeadApi(page);
    await page.goto('/');

    await fillStep1(page);
    await expect(page.locator('#btnPaso1')).toBeEnabled();
    await page.locator('#btnPaso1').click();

    await expect(page.locator('[data-step="2"]')).toBeVisible();
    await page.locator('[data-tipo="Full Acabados"]').click();

    await expect(page.locator('[data-step="3"]')).toBeVisible();
    await page.locator('[data-ciudad="Bogotá"]').click();
    await page.locator('#inpBarrio').fill('Porto Hayuelos');
    await expect(page.locator('#btnPaso3')).toBeEnabled();
    await page.locator('#btnPaso3').click();

    await expect(page.locator('[data-step="4"]')).toBeVisible();
    await page.locator('[data-presupuesto="Entre $15 y $25 millones"]').click();

    await expect(page.locator('[data-step="5"]')).toBeVisible();
    await page.locator('[data-tiempo="Inmediato"]').click();

    await expect(page.locator('[data-step="6"]')).toBeVisible();
    await page.locator('[data-canal="Llamada"]').click();
    await page.locator('#btnLlamenme').click();

    await expect(page.locator('[data-step="success"]')).toBeVisible();
    await expect(page.getByText('¡Listo, recibimos tu solicitud!')).toBeVisible();

    // 6 syncs a HubSpot: uno por cada paso 1-6
    expect(calls.length).toBe(6);
    expect(calls[0]).toMatchObject({
      etapa: 1,
      fields: expect.objectContaining({
        nombre: 'Ana María Melo',
        email: 'ana@example.com',
        consentimientoHabeasData: true,
      }),
    });
    expect(calls[5]).toMatchObject({ etapa: 6, fields: expect.objectContaining({ completado: true }) });
  });
});

test.describe('Cotizador — validación y edge cases', () => {
  test('el botón de continuar permanece deshabilitado sin el checkbox de Habeas Data', async ({ page }) => {
    await mockLeadApi(page);
    await page.goto('/');

    await page.locator('#inpNombre').fill('Ana María Melo');
    await page.locator('#inpEmail').fill('ana@example.com');
    await page.locator('#inpCelular').fill('3101234567');

    await expect(page.locator('#btnPaso1')).toBeDisabled();

    await page.locator('#inpConsentimiento').check();
    await expect(page.locator('#btnPaso1')).toBeEnabled();
  });

  test('persiste el estado en localStorage tras recargar a mitad del wizard', async ({ page }) => {
    await mockLeadApi(page);
    await page.goto('/');

    await fillStep1(page);
    await page.locator('#btnPaso1').click();
    await expect(page.locator('[data-step="2"]')).toBeVisible();

    const stored = await page.evaluate(() => localStorage.getItem('espazios_lead'));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.nombre).toBe('Ana María Melo');
    expect(parsed.email).toBe('ana@example.com');

    await page.reload();
    const storedAfterReload = await page.evaluate(() => localStorage.getItem('espazios_lead'));
    expect(storedAfterReload).toBe(stored);
  });

  test('el botón "Volver" regresa al paso anterior y conserva la selección visual ya hecha', async ({ page }) => {
    await mockLeadApi(page);
    await page.goto('/');

    await fillStep1(page);
    await page.locator('#btnPaso1').click();
    await expect(page.locator('[data-step="2"]')).toBeVisible();
    await page.locator('[data-tipo="Solo Carpintería"]').click();

    // Paso 2 avanza automático al elegir tipo (sin marcar "selected" ahí).
    await expect(page.locator('[data-step="3"]')).toBeVisible();
    await page.locator('[data-ciudad="Bogotá"]').click();
    await expect(page.locator('[data-ciudad="Bogotá"]')).toHaveClass(/selected/);

    await page.locator('[data-step="3"] [data-back]').click();
    await expect(page.locator('[data-step="2"]')).toBeVisible();

    // Volver a avanzar y confirmar que la selección de ciudad seguía marcada.
    await page.locator('[data-tipo="Solo Carpintería"]').click();
    await expect(page.locator('[data-step="3"]')).toBeVisible();
    await expect(page.locator('[data-ciudad="Bogotá"]')).toHaveClass(/selected/);
  });
});

test.describe('Cotizador — simulación de bot (honeypot)', () => {
  test('llenar el honeypot programáticamente evita el sync a HubSpot', async ({ page }) => {
    const calls = await mockLeadApi(page);
    await page.goto('/');

    await fillStep1(page);
    // Un bot que llena todos los campos, incluido el honeypot invisible.
    await page.locator('#inpWebsite').fill('http://spam-bot.example', { force: true });
    await page.locator('#btnPaso1').click();

    // El JS cliente detecta el honeypot y avanza sin llamar a /api/lead.
    await expect(page.locator('[data-step="2"]')).toBeVisible();
    expect(calls.length).toBe(0);
  });

  test('el honeypot no es alcanzable por teclado y está oculto para lectores de pantalla', async ({ page }) => {
    await page.goto('/');

    const honeypot = page.locator('#inpWebsite');
    await expect(honeypot).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('.hp-field')).toHaveAttribute('aria-hidden', 'true');
  });
});
