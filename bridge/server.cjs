'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Service}=require('./service.cjs'),{redact}=require('./desktop/core.cjs');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function createBridge({service:fixedService,identity,token,origins,siteUrl}){
 return http.createServer(async(req,res)=>{
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
  const origin=req.headers.origin;
  const reply=(status,value)=>{res.writeHead(status,headers);res.end(JSON.stringify(value));};
  if(!/^(?:127\.0\.0\.1|localhost):\d+$/.test(req.headers.host||''))return reply(403,{error:'Invalid bridge host.'});
  if(origin&&!origins.includes(origin))return reply(403,{error:'Website is not paired with this bridge. Set SWITCHER_SITE_URL to your deployed site.'});
  if(origin){headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin';headers['Access-Control-Allow-Headers']='Authorization, Content-Type, X-Switcher-Identity';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';headers['Access-Control-Allow-Private-Network']='true';}
  if(req.method==='OPTIONS'){res.writeHead(204,headers);return res.end();}
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET'&&url.pathname==='/health')return reply(200,{service:'Universal AI Switcher local bridge',version:'1.2.0',identityRequired:!!identity});
  if(req.method==='POST'&&url.pathname==='/mcp'){
   if(origin)return reply(403,{error:'MCP uses a registered local stdio client.'});
   try{let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>150000)return reply(413,{error:'MCP request too large.'});chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString()),secret=req.headers['x-switcher-mcp'];const services=identity?[...identity.profiles.values()].map(p=>p.service):[fixedService];const target=services.find(s=>Object.values(s?.library.mcp||{}).some(r=>r.enabled&&r.secretHash===crypto.createHash('sha256').update(typeof secret==='string'?secret:'').digest('hex')));if(!target)return reply(401,{error:'MCP connection is not registered with this active profile.'});return reply(200,{value:await target.mcp.request(secret,body)});}catch(e){return reply(403,{error:redact(e.message)});}
  }
  if(req.method==='GET'&&url.pathname==='/pair'&&!origin){const pairUrl=siteUrl+'/#pair='+encodeURIComponent(token);res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});return res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Pair Universal</title><style>body{background:#f5f6f7;color:#19212b;font:16px system-ui;max-width:600px;margin:100px auto;padding:24px}a{display:inline-block;background:#273f36;color:white;padding:15px 24px;border-radius:10px;text-decoration:none}code{display:block;overflow-wrap:anywhere;padding:16px;background:white;margin:24px 0}p{line-height:1.7;color:#616b77}</style><h1>Your local bridge is ready.</h1><p>Is computer ki history aur projects sirf paired website ko milenge. Neeche button se apni website connect karein. Pairing code private rakhein.</p><a href="${escape(pairUrl)}" rel="noreferrer">Open & pair Universal →</a><p>Manual pairing code:</p><code>${escape(token)}</code><p>Website: ${escape(siteUrl)}<br>Bridge: 127.0.0.1 only. API keys ki zaroorat nahin.</p>`);}
  const auth=req.headers.authorization||'',actual=Buffer.from(auth),expected=Buffer.from('Bearer '+token);if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return reply(401,{error:'Pairing code ghalat hai. Local bridge ka /pair page khol kar dobara pair karein.'});
  try{
   let service=fixedService,profile;
   if(identity){try{profile=await identity.authorize(req.headers['x-switcher-identity']);service=profile.service;}catch{return reply(401,{error:'Verified email login required. Sign in again, then pair this computer.'});}}
   let body={};if(req.method==='POST'){let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>(url.pathname==='/import'?100:8)*1024*1024)return reply(413,{error:url.pathname==='/import'?'Import request 100 MB se chhoti rakhein.':'Request 8 MB se chhoti rakhein.'});chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}
   let out;
   if(req.method==='GET'&&url.pathname==='/state')out=await service.state();
   else if(req.method==='GET'&&url.pathname.startsWith('/chat/'))out=await service.chat(decodeURIComponent(url.pathname.slice(6)));
   else if(req.method==='POST'&&url.pathname==='/connect')out=await service.connect(body.provider,body.projectId);
   else if(req.method==='POST'&&url.pathname==='/disconnect')out=await service.disconnect(body.provider);
   else if(req.method==='POST'&&url.pathname==='/mcp/setup')out=await service.setupMcp(body.provider,body.projectId);
   else if(req.method==='POST'&&url.pathname==='/session/logout'){if(identity)await identity.logout(profile);out={loggedOut:true};}
   else if(req.method==='POST'&&url.pathname==='/sync')out=await service.syncHistory(body.provider);
   else if(req.method==='POST'&&url.pathname==='/refresh')out=await service.refreshConnected();
   else if(req.method==='POST'&&url.pathname==='/projects')out=await service.addProject(body.root);
   else if(req.method==='POST'&&url.pathname==='/import')out=await service.import(body.conversations,body.provider||'codex',body.files);
   else if(req.method==='POST'&&url.pathname==='/preview')out=await service.prepare(body,false);
   else if(req.method==='POST'&&url.pathname==='/transfer')out=await service.prepare(body,true);
   else if(req.method==='POST'&&url.pathname==='/open-antigravity')out=await service.openAntigravity(body.projectId);
   else if(req.method==='POST'&&url.pathname==='/send')out=await service.send(body);
   else if(req.method==='POST'&&url.pathname==='/stop')out=await service.stop();
   else if(req.method==='POST'&&url.pathname==='/approval')out=await service.approve(body);
   else return reply(404,{error:'Unknown bridge action.'});
   reply(200,{value:out});
  }catch(e){reply(400,{error:redact(e.message).slice(0,2000)});}
 });
}
async function start(){
 const root=path.resolve(process.env.SWITCHER_BRIDGE_DATA||path.join(process.env.LOCALAPPDATA||process.cwd(),'UniversalAISwitcher','web-bridge'));
 fs.mkdirSync(root,{recursive:true});const tokenFile=path.join(root,'pairing.json');let pairing;if(fs.existsSync(tokenFile))pairing=JSON.parse(fs.readFileSync(tokenFile,'utf8'));else{pairing={token:crypto.randomBytes(32).toString('hex')};fs.writeFileSync(tokenFile,JSON.stringify(pairing),{mode:0o600});}
 let siteUrl=process.env.SWITCHER_SITE_URL;const siteFile=path.join(__dirname,'site.json');if(!siteUrl&&fs.existsSync(siteFile))siteUrl=JSON.parse(fs.readFileSync(siteFile)).url;siteUrl=siteUrl||'http://localhost:5173';siteUrl=new URL(siteUrl).origin;
 const authFile=path.join(__dirname,'auth.json');
 if(!fs.existsSync(authFile))throw Error('Email-auth configuration missing. Download the latest helper.');
 const{Identity}=require('./identity.cjs'),identity=new Identity({baseUrl:JSON.parse(fs.readFileSync(authFile)).url,root});
 const origins=[siteUrl,'http://localhost:5173','http://127.0.0.1:5173','http://localhost:4173','http://127.0.0.1:4173'];const server=createBridge({identity,token:pairing.token,origins,siteUrl});
 server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Bridge pehle se chal raha hai. http://127.0.0.1:47831/pair kholain.':e.message);process.exitCode=1;});server.listen(47831,'127.0.0.1',()=>{console.log('Universal bridge ready. Open http://127.0.0.1:47831/pair — log in and pair your computer.');});
 const historyTimer=setInterval(()=>identity.refresh().catch(()=>{}),10000);historyTimer.unref();
 process.on('SIGINT',()=>{clearInterval(historyTimer);server.close();identity.close().finally(()=>process.exit(0));});return {server,identity};
}
if(require.main===module)start();module.exports={createBridge,start};
