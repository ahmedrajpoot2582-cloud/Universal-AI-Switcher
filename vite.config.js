import { defineConfig, loadEnv } from 'vite';
import accountHandler from './server/account-proxy.js';
import workspaceHandler from './api/workspace.js';
import linkHandler from './api/link.js';
import syncHandler from './api/sync.js';
import mcpHandler from './api/mcp.js';
import oauthHandler from './api/oauth.js';
import connectHandler from './api/connect.js';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.NEON_AUTH_BASE_URL = env.NEON_AUTH_BASE_URL || process.env.NEON_AUTH_BASE_URL;
  process.env.DATABASE_URL = env.DATABASE_URL || process.env.DATABASE_URL;
  return { plugins: [{ name: 'local-account-api', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const pathname=new URL(req.url,'http://localhost:5173').pathname;
      const routes={'/api/workspace':workspaceHandler,'/api/link':linkHandler,'/api/sync':syncHandler,'/api/mcp':mcpHandler,'/api/oauth':oauthHandler};
      let handler=req.url.startsWith('/api/auth/')?accountHandler:routes[pathname];
      if(pathname.startsWith('/connect/')){req.url='/api/connect?id='+encodeURIComponent(pathname.split('/').at(-1));handler=connectHandler;}
      if(pathname==='/.well-known/oauth-authorization-server'){req.url='/api/oauth?action=metadata';handler=oauthHandler;}
      if(pathname.startsWith('/.well-known/oauth-protected-resource')){req.url='/api/oauth?action=resource';handler=oauthHandler;}
      if (!handler) return next();
      res.status = code => { res.statusCode = code; return res; };
      res.json = value => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value)); };
      res.send = value => res.end(value);
      if (req.method === 'POST') {
        let bytes = 0, parts = [];
        for await (const part of req) { bytes += part.length; if (bytes > 3*1024*1024) { res.statusCode = 413; res.end(); return; } parts.push(part); }
        const raw=Buffer.concat(parts).toString();
        try{req.body=String(req.headers['content-type']||'').includes('application/json')?JSON.parse(raw||'{}'):raw;}catch{res.statusCode=400;res.json({error:'Invalid JSON'});return;}
      }
      await handler(req, res);
    });
  } }] };
});
