'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Service } = require('../bridge/service.cjs');
const { Identity } = require('../bridge/identity.cjs');
const { createBridge } = require('../bridge/server.cjs');
const claims = (sub='user-a', extra={}) => ({ sub, email: sub+'@example.invalid', emailVerified: true, exp: Math.floor(Date.now()/1000)+900, ...extra });
async function fixture(t) {
  const base = await fs.realpath(os.tmpdir()), root = await fs.mkdtemp(path.join(base,'universal-connections-'));
  t.after(async()=>{ assert.equal(path.dirname(root),base); assert(path.basename(root).startsWith('universal-connections-')); await fs.rm(root,{recursive:true,force:true}); });
  function createService(directory) {
    const provider = new EventEmitter();
    provider.calls = []; provider.connect = async()=>{}; provider.close = async()=>{};
    provider.account = async()=>({ connected:true, mode:'chatgpt', account:'us***@example.invalid' });
    provider.call = async(method,params)=>{ provider.calls.push([method,params]); return method==='thread/list'?{data:[],nextCursor:null}:{}; };
    const service = new Service(directory,{provider,legacyFile:null});
    service.antiBinary = ()=>'/installed/antigravity.exe'; return service;
  }
  const service=createService(path.join(root,'data'));
  return { root, service, createService };
}
async function project(service,root,id='p') { const directory=path.join(root,'project-'+id);await fs.mkdir(directory,{recursive:true});const p={id,name:'Project '+id,root:directory,continuityEnabled:false};service.library.projects.push(p);return p; }
async function setupMcp(service,root,provider='antigravity') {
  const p=await project(service,root);
  await service.connect(provider); const result=await service.setupMcp(provider,p.id);
  const files=await fs.readdir(path.join(service.root,'mcp'));
  const secret=JSON.parse(await fs.readFile(path.join(service.root,'mcp',files[0]),'utf8')).secret;
  return {p,result,secret};
}
test('installed Antigravity stays waiting until real MCP initialize; timeout removes active status',async t=>{
  const {service,root}=await fixture(t);const {secret}=await setupMcp(service,root);
  let state=await service.state();assert.equal(state.providers.antigravity.connected,false);assert.equal(state.providers.antigravity.connection.status,'waiting');assert.equal(state.providers.codex.connected,false);
  await assert.rejects(service.syncHistory('antigravity'),/connect/);
  await service.mcp.request(secret,{action:'initialize',sessionId:'one',clientInfo:{name:'Antigravity test client',version:'test'}});
  state=await service.state();assert.equal(state.providers.antigravity.connected,true);assert.equal(state.providers.antigravity.mcp.status,'connected');assert.equal(state.providers.codex.connected,false);
  service.mcp.sessions.get('one').seen=Date.now()-36000;
  state=await service.state();assert.equal(state.providers.antigravity.connected,false);assert.equal(state.providers.antigravity.mcp.status,'waiting');
});
test('MCP preserves existing configuration and saves live public progress without duplicate turns',async t=>{
  const {service,root}=await fixture(t);const p=await project(service,root);
  await fs.mkdir(path.join(p.root,'.agents'));await fs.writeFile(path.join(p.root,'.agents','mcp_config.json'),'// Keep this comment\n{"mcpServers":{"existing":{"command":"other"}}}');
  await service.connect('antigravity');await service.setupMcp('antigravity',p.id);
  const config=await fs.readFile(path.join(p.root,'.agents','mcp_config.json'),'utf8');assert.match(config,/Keep this comment/);assert.match(config,/existing/);assert(!config.includes('secretHash'));
  const files=await fs.readdir(path.join(service.root,'mcp'));const {secret}=JSON.parse(await fs.readFile(path.join(service.root,'mcp',files[0]),'utf8'));
  const sessionId='live';await service.mcp.request(secret,{action:'initialize',sessionId,clientInfo:{name:'Antigravity'}});
  const call={action:'tool',sessionId,name:'switcher_save_progress',arguments:{turnId:'stable-turn',title:'Actual public work',request:'Fix the cart',result:'Cart fixed',remaining:'Review tests'}};
  const first=await service.mcp.request(secret,call);call.arguments.result='Cart fixed; tests passed';await service.mcp.request(secret,call);
  const state=await service.state();assert.equal(state.chats.length,1);assert.equal(state.chats[0].source,'MCP public progress');assert.equal(state.chats[0].projectId,p.id);
  assert.match((await service.chat(first.conversationId)).messages[1].text,/tests passed/);
  const other=await project(service,root,'other');service.library.chats.push({id:'private-other',projectId:other.id,messages:[{role:'user',text:'not shared'}]});
  await assert.rejects(service.mcp.request(secret,{action:'tool',sessionId,name:'switcher_read_history',arguments:{conversationId:'private-other'}}),/outside/);
  await service.disconnect('antigravity');await assert.rejects(service.mcp.request(secret,{action:'heartbeat',sessionId}),/Reconnect/);
  assert.equal((await service.chat(first.conversationId)).messages.length,2);
});
test('Codex verifies account on every Connect and re-checks sign-out during live refresh',async t=>{
  const {service}=await fixture(t);let reads=0;service.provider.account=async()=>{reads++;return {connected:true,mode:'chatgpt'};};
  await service.connect('codex');await service.historyJobs.codex;assert(reads>=2);assert.equal((await service.state()).providers.codex.connected,true);
  service.provider.account=async()=>({connected:false,mode:'signed_out'});await service.refreshConnected();const state=await service.state();assert.equal(state.providers.codex.connected,false);assert.equal(state.providers.codex.connection.status,'error');
});
test('verified identities have isolated local libraries; unverified, expired and banned users fail closed',async t=>{
  const {root,createService}=await fixture(t);const auth=new Identity({baseUrl:'https://auth.example',root,createService,verify:async token=>claims(token)});
  const a=await auth.authorize('a'),same=await auth.authorize('a'),b=await auth.authorize('b');assert.equal(a,same);assert.notEqual(a.service.root,b.service.root);
  a.service.library.chats.push({id:'only-a',messages:[],title:'Private A'});assert.equal((await b.service.state()).chats.length,0);
  for(const extra of [{emailVerified:false},{emailVerified:'true'},{banned:true},{exp:1}]){const invalid=new Identity({baseUrl:'https://auth.example',root,createService,verify:async()=>claims('a',extra)});await assert.rejects(invalid.authorize('anything'),/verify/);}
  await auth.logout(a);assert.equal(a.service.identityLease(),false);await assert.rejects(auth.authorize('a'),/Logged-out/);
  const restarted=new Identity({baseUrl:'https://auth.example',root,createService,verify:async token=>claims(token)});await assert.rejects(restarted.authorize('a'),/Logged-out/);
});
test('bridge requires both private pairing and a verified identity; cached data is inaccessible after logout lease ends',async t=>{
  const {root,createService}=await fixture(t);const identity=new Identity({baseUrl:'https://auth.example',root,createService,verify:async token=>{if(token!=='valid')throw Error('invalid');return claims();}});
  const server=createBridge({identity,token:'pair',origins:['https://site.example'],siteUrl:'https://site.example'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port,headers={Origin:'https://site.example',Authorization:'Bearer pair'};
  assert.equal((await fetch(base+'/state',{headers})).status,401);
  assert.equal((await fetch(base+'/state',{headers:{...headers,'X-Switcher-Identity':'forged'}})).status,401);
  const ok=await fetch(base+'/state',{headers:{...headers,'X-Switcher-Identity':'valid'}});assert.equal(ok.status,200);assert.equal((await ok.json()).value.chats.length,0);
  assert.equal((await fetch(base+'/state',{headers:{...headers,Authorization:'Bearer wrong','X-Switcher-Identity':'valid'}})).status,401);
});
test('JWT verification validates signature, issuer, audience, expiry and verification claims',async t=>{
  const {root,createService}=await fixture(t);const {generateKeyPair,SignJWT,createLocalJWKSet,exportJWK}=await import('jose');
  const {privateKey,publicKey}=await generateKeyPair('EdDSA'),jwk=await exportJWK(publicKey);jwk.kid='test-key';
  const auth=new Identity({baseUrl:'https://auth.example/neondb/auth',root,createService});auth.keys=createLocalJWKSet({keys:[jwk]});
  const issue=(changes={},key=privateKey)=>new SignJWT({...claims(),...changes}).setProtectedHeader({alg:'EdDSA',kid:'test-key'}).setIssuedAt().setIssuer(changes.iss||'https://auth.example').setAudience(changes.aud||'https://auth.example').sign(key);
  assert.equal((await auth.authorize(await issue())).user.id,'user-a');
  for(const change of [{iss:'https://evil.example'},{aud:'https://other.example'},{emailVerified:false},{exp:1}])await assert.rejects(auth.authorize(await issue(change)));
  const other=await generateKeyPair('EdDSA');await assert.rejects(auth.authorize(await issue({},other.privateKey)));
});
test('stdio MCP protocol round-trip initializes over the authenticated loopback route and saves public progress',async t=>{
  const {service,root}=await fixture(t),{p,secret}=await setupMcp(service,root);
  const server=createBridge({service,token:'pair',origins:['https://site.example'],siteUrl:'https://site.example'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const config=path.join(root,'wire-config.json');await fs.writeFile(config,JSON.stringify({endpoint:'http://127.0.0.1:'+server.address().port+'/mcp',secret}));
  const {PassThrough}=require('node:stream'),input=new PassThrough(),responses=[];
  const connection=await require('../bridge/mcp.cjs').run(config,{input,write:message=>responses.push(message)});t.after(()=>connection.close());
  await connection.handle({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',clientInfo:{name:'Isolated MCP wire test',version:'1'}}});assert.equal(responses.at(-1).result.protocolVersion,'2025-06-18');
  await connection.handle({jsonrpc:'2.0',id:2,method:'tools/list'});assert.equal(responses.at(-1).result.tools.length,4);
  await connection.handle({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'switcher_save_progress',arguments:{turnId:'wire-turn',result:'Public test result'}}});assert.equal(responses.at(-1).result.isError,undefined);
  const state=await service.state();assert.equal(state.chats.length,1);assert.equal(state.chats[0].projectId,p.id);
  await connection.handle({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'not-a-tool',arguments:{}}});assert.equal(responses.at(-1).result.isError,true);
  await connection.close();input.end();
});
test('another MCP-compatible client connects independently and can read a selected handoff without Codex or Antigravity',async t=>{
  const {service,root}=await fixture(t);service.antiBinary=()=>{throw Error('Other MCP app must not inspect Antigravity');};
  const {p,secret,result}=await setupMcp(service,root,'mcp');assert.match(result.config,/mcpServers/);
  assert.equal((await service.state()).providers.mcp.connected,false);
  await service.mcp.request(secret,{action:'initialize',sessionId:'custom',clientInfo:{name:'Another compatible client',version:'1'}});
  let state=await service.state();assert.equal(state.providers.mcp.connected,true);assert.equal(state.providers.codex.connected,false);assert.equal(state.providers.antigravity.connected,false);
  service.library.chats.push({id:'context',title:'Selected context',provider:'mcp',projectId:p.id,source:'MCP public progress',messages:[{role:'assistant',text:'Resume from this actual public state'}]});
  const transfer=await service.prepare({conversationIds:['context'],projectIds:[p.id],focusProjectId:p.id,target:'mcp'},true);assert.equal(transfer.target,'mcp');assert.equal(transfer.chatId,undefined);
  const read=await service.mcp.request(secret,{action:'tool',sessionId:'custom',name:'switcher_read_context',arguments:{}});assert.match(read.context,/Resume from this actual public state/);
  await service.disconnect('mcp');state=await service.state();assert.equal(state.providers.mcp.connected,false);assert.equal(state.chats.length,1);
});
