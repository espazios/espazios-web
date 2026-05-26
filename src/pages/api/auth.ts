// OAuth proxy para Decap CMS - paso 1: redirect a GitHub
// Documentación Decap: https://decapcms.org/docs/github-backend/
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'github';
  const scope = url.searchParams.get('scope') || 'repo,user:email';
  const clientId = import.meta.env.OAUTH_GITHUB_CLIENT_ID;

  if (!clientId) {
    return new Response('OAUTH_GITHUB_CLIENT_ID no configurado en Vercel env vars.', { status: 500 });
  }

  if (provider !== 'github') {
    return new Response('Solo provider=github es soportado.', { status: 400 });
  }

  const host = `${url.protocol}//${url.host}`;
  const redirectUri = `${host}/api/callback`;
  // state simple para CSRF mitigation
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', scope);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('allow_signup', 'false');

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      // Cookie con state para verificarlo en callback
      'Set-Cookie': `decap_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
};
