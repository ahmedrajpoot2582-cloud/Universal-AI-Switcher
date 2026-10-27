'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
async function request(handler,options={}) {
 const req={method:'POST',url:'/api/auth/sign-in/email',headers:{host:'universal-ai-switcher.vercel.app',origin:'https://universal-ai-switcher.vercel.app'},body:{email:'  Person@Example.invalid ',password:'LongPrivatePassword'},...options};
 const response={statusCode:200,headers:{},setHeader(n,v){this.headers[n]=v;},getHeader(n){return this.headers[n];},status(n){this.statusCode=n;return this;},json(value){this.value=value;return this;},send(value){this.value=value;return this;}};
 await handler(req,response);return {req,response};
}
test('account proxy rejects cross-origin mutations, unknown routes, short passwords and external return URLs',async t=>{
 const {default:handler}=await import('../server/account-proxy.js');const saved=process.env.NEON_AUTH_BASE_URL;process.env.NEON_AUTH_BASE_URL='https://auth.example/neondb/auth';t.after(()=>{if(saved===undefined)delete process.env.NEON_AUTH_BASE_URL;else process.env.NEON_AUTH_BASE_URL=saved;});
 assert.equal((await request(handler,{headers:{host:'universal-ai-switcher.vercel.app',origin:'https://evil.example'}})).response.statusCode,403);
 assert.equal((await request(handler,{url:'/api/auth/admin/list-users'})).response.statusCode,404);
 assert.equal((await request(handler,{url:'/api/auth/sign-up/email',body:{email:'a@example.invalid',password:'short'}})).response.statusCode,400);
 assert.equal((await request(handler,{body:{email:'a@example.invalid',callbackURL:'https://evil.example'}})).response.statusCode,400);
});
test('account proxy normalizes email, preserves secure HttpOnly cookies and disables caching',async t=>{
 const {default:handler}=await import('../server/account-proxy.js');const saved=process.env.NEON_AUTH_BASE_URL,fetch=global.fetch;
 process.env.NEON_AUTH_BASE_URL='https://auth.example/neondb/auth';t.after(()=>{global.fetch=fetch;if(saved===undefined)delete process.env.NEON_AUTH_BASE_URL;else process.env.NEON_AUTH_BASE_URL=saved;});
 let forwarded;global.fetch=async(url,options)=>{forwarded={url,options};return new Response('{"user":{"emailVerified":true}}',{headers:{'set-cookie':'__Secure-neon-auth.session_token=private; Domain=auth.example; Path=/neondb/auth; HttpOnly; Secure; SameSite=None'}});};
 const {response}=await request(handler);assert.equal(response.statusCode,200);assert.equal(JSON.parse(forwarded.options.body).email,'person@example.invalid');assert.equal(forwarded.options.headers.Origin,'https://auth.example');
 const cookie=response.headers['Set-Cookie'][0];assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/Path=\//);assert(!cookie.includes('Domain='));assert.equal(response.headers['Cache-Control'],'no-store');
});
test('Vercel rewrite forwards nested account actions to the same handler without leaking its routing parameter',async t=>{
 const {default:handler}=await import('../server/account-proxy.js');const saved=process.env.NEON_AUTH_BASE_URL,fetch=global.fetch;
 process.env.NEON_AUTH_BASE_URL='https://auth.example/neondb/auth';t.after(()=>{global.fetch=fetch;if(saved===undefined)delete process.env.NEON_AUTH_BASE_URL;else process.env.NEON_AUTH_BASE_URL=saved;});
 let forwarded;global.fetch=async(url)=>{forwarded=url;return new Response('{}');};
 const {response}=await request(handler,{url:'/api/account?authPath=email-otp%2Fverify-email',body:{email:'a@example.invalid',otp:'000000'}});
 assert.equal(response.statusCode,200);assert.equal(forwarded,'https://auth.example/neondb/auth/email-otp/verify-email');
});
