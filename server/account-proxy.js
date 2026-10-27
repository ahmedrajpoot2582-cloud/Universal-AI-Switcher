const allowed = new Set([
  'sign-up/email', 'sign-in/email', 'sign-out', 'get-session', 'token',
  'send-verification-email', 'email-otp/send-verification-otp', 'email-otp/verify-email',
  'email-otp/request-password-reset', 'email-otp/reset-password',
  'request-password-reset', 'reset-password', 'revoke-sessions', 'list-sessions'
]);
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const base = process.env.NEON_AUTH_BASE_URL;
  if (!base) return res.status(503).json({ message: 'Email login service is not configured.' });
  const url = new URL(req.url, 'https://universal-ai-switcher.vercel.app');
  const route = url.searchParams.get('authPath') || req.query?.authPath || url.pathname.replace(/^\/api\/auth\//, '');
  url.searchParams.delete('authPath');
  if (!allowed.has(route) || !['GET', 'POST'].includes(req.method)) return res.status(404).json({ message: 'Unknown account action.' });
  const host = req.headers.host;
  const origin = host === 'localhost:5173' || host === '127.0.0.1:5173' ? 'http://' + host : 'https://' + host;
  // Mutations require a same-origin browser request. Never trust a forwarded origin.
  if (req.method === 'POST' && req.headers.origin !== origin) return res.status(403).json({ message: 'Account request origin is not allowed.' });
  let body;
  if (req.method === 'POST') {
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
    catch { return res.status(400).json({ message: 'Invalid account request.' }); }
    if (Buffer.byteLength(JSON.stringify(body)) > 16384) return res.status(413).json({ message: 'Account request is too large.' });
    if (typeof body.email === 'string') body.email = body.email.trim().toLowerCase();
    for (const key of ['callbackURL', 'redirectTo']) {
      if (body[key]) {
        try { if (new URL(body[key], origin).origin !== origin) throw Error(); }
        catch { return res.status(400).json({ message: 'Invalid return address.' }); }
      }
    }
    if ((route === 'sign-up/email' || route.endsWith('reset-password')) && body.password !== undefined && (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128)) return res.status(400).json({ message: 'Password 12 se 128 characters ka rakhein.' });
  }
  try {
    const upstream = await fetch(base.replace(/\/$/, '') + '/' + route + url.search, {
      method: req.method,
      // The browser origin was checked above. This is a same-origin reverse proxy:
      // the upstream sees its own origin, while cookies are scoped to our public site.
      headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin, ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}), 'User-Agent': req.headers['user-agent'] || 'Universal-Switcher' },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(12000)
    });
    for (const cookie of upstream.headers.getSetCookie()) {
      const rewritten = cookie.replace(/;\s*Domain=[^;]+/ig, '').replace(/;\s*Path=[^;]+/ig, '; Path=/').replace(/;\s*SameSite=None/ig, '; SameSite=Lax');
      const previous = res.getHeader('Set-Cookie') || [];
      res.setHeader('Set-Cookie', [...previous, rewritten]);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (upstream.status === 429) res.setHeader('Retry-After', upstream.headers.get('retry-after') || '60');
    const text = await upstream.text();
    // No upstream redirects or credentials are ever logged.
    return res.status(upstream.status >= 300 && upstream.status < 400 ? 400 : upstream.status).send(text);
  } catch { return res.status(502).json({ message: 'Account service se rabta nahin hua. Dobara try karein.' }); }
}
