import { defineConfig, loadEnv } from 'vite';
import accountHandler from './server/account-proxy.js';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.NEON_AUTH_BASE_URL = env.NEON_AUTH_BASE_URL || process.env.NEON_AUTH_BASE_URL;
  return { plugins: [{ name: 'local-account-api', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/auth/')) return next();
      res.status = code => { res.statusCode = code; return res; };
      res.json = value => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value)); };
      res.send = value => res.end(value);
      if (req.method === 'POST') {
        let bytes = 0, parts = [];
        for await (const part of req) { bytes += part.length; if (bytes > 16384) { res.statusCode = 413; res.end(); return; } parts.push(part); }
        req.body = Buffer.concat(parts).toString();
      }
      await accountHandler(req, res);
    });
  } }] };
});
