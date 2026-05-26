// OAuth proxy para Decap CMS - paso 2: intercambia code por token y postMessage al opener
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateReturned = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  // CSRF check: state en cookie debe coincidir con state retornado
  const cookieHeader = request.headers.get('cookie') || '';
  const stateCookieMatch = cookieHeader.match(/decap_oauth_state=([^;]+)/);
  const stateCookie = stateCookieMatch ? stateCookieMatch[1] : null;

  if (errorParam || !code) {
    return renderPostMessage({
      provider: 'github',
      success: false,
      payload: { error: errorParam || 'no_code', error_description: 'No code received' },
    });
  }

  if (!stateCookie || stateCookie !== stateReturned) {
    return renderPostMessage({
      provider: 'github',
      success: false,
      payload: { error: 'state_mismatch', error_description: 'CSRF state did not match' },
    });
  }

  const clientId = import.meta.env.OAUTH_GITHUB_CLIENT_ID;
  const clientSecret = import.meta.env.OAUTH_GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return renderPostMessage({
      provider: 'github',
      success: false,
      payload: { error: 'config_missing', error_description: 'Server OAuth env vars not set' },
    });
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenData.access_token) {
      return renderPostMessage({
        provider: 'github',
        success: false,
        payload: tokenData,
      });
    }

    return renderPostMessage({
      provider: 'github',
      success: true,
      payload: { token: tokenData.access_token, provider: 'github' },
    });
  } catch (e: any) {
    return renderPostMessage({
      provider: 'github',
      success: false,
      payload: { error: 'fetch_failed', error_description: e?.message || 'unknown' },
    });
  }
};

function renderPostMessage(opts: { provider: string; success: boolean; payload: unknown }): Response {
  const status = opts.success ? 'success' : 'error';
  const message = `authorization:${opts.provider}:${status}:${JSON.stringify(opts.payload)}`;
  const safeMessage = JSON.stringify(message);

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Decap CMS · OAuth</title>
<meta name="robots" content="noindex, nofollow" />
<style>
  body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#163840;color:#fff;text-align:center;padding:24px;}
  .box{max-width:420px}
  h1{font-size:1.25rem;margin:0 0 8px}
  p{margin:0;color:rgba(255,255,255,0.75);font-size:.95rem}
</style>
</head>
<body>
<div class="box">
  <h1>${opts.success ? 'Autorizado ✓' : 'Error de autorización'}</h1>
  <p>Esta ventana se cerrará automáticamente.</p>
</div>
<script>
(function(){
  var msg = ${safeMessage};
  function send(){
    if(!window.opener) return;
    window.opener.postMessage(msg, '*');
  }
  // Handshake estándar Decap: opener envía 'authorizing:<provider>'; respondemos.
  function onMsg(e){
    if(typeof e.data !== 'string') return;
    if(e.data === 'authorizing:${opts.provider}'){
      window.opener.postMessage(msg, e.origin);
    }
  }
  window.addEventListener('message', onMsg, false);
  // Notificar al opener que estamos listos para enviar
  if(window.opener){ window.opener.postMessage('authorizing:${opts.provider}', '*'); }
  setTimeout(function(){ try{ window.close(); }catch(e){} }, 1500);
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Limpiar el cookie state
      'Set-Cookie': 'decap_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
  });
}
