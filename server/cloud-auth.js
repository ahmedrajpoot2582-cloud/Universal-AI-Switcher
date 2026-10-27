import {createRemoteJWKSet,jwtVerify} from 'jose';
let keys;
export async function verifiedUser(req) {
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');
 const base=process.env.NEON_AUTH_BASE_URL;if(!base)throw Error('Account service missing.');
 keys ||= createRemoteJWKSet(new URL(base+'/.well-known/jwks.json'));
 const {payload}=await jwtVerify(token,keys,{issuer:new URL(base).origin,audience:new URL(base).origin,algorithms:['EdDSA'],maxTokenAge:'16m',requiredClaims:['sub','exp','iat','emailVerified']});
 if(payload.emailVerified!==true||payload.banned===true)throw Error('Verified email login required.');return payload;
}
export function privateHeaders(res) {res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');}
export function body(req,max=3*1024*1024) {const value=typeof req.body==='string'?JSON.parse(req.body):req.body||{};if(Buffer.byteLength(JSON.stringify(value))>max){const e=Error('Request too large. History ko chhote batches mein bhejein.');e.status=413;throw e;}return value;}
export function sameOrigin(req) {return req.headers.origin==='https://'+req.headers.host||(['localhost:5173','127.0.0.1:5173'].includes(req.headers.host)&&req.headers.origin==='http://'+req.headers.host);}
