'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
// Execute the production parameterized SQL against isolated, in-memory PostgreSQL.
// This adapter does not connect to Neon or read any database credentials.
function sqlAdapter(pg){
 const plan=(text,params=[])=>({text,params,then(resolve,reject){return pg.query(text,params).then(r=>r.rows).then(resolve,reject);}});
 const sql=(strings,...params)=>plan(strings.reduce((text,part,index)=>text+(index?'$'+index:'')+part,''),params);
 sql.query=(text,params)=>plan(text,params);
 sql.transaction=plans=>pg.transaction(async tx=>{const rows=[];for(const p of plans)rows.push((await tx.query(p.text,p.params)).rows);return rows;});return sql;
}
test('production SQL passes isolated PostgreSQL: link claims, pagination, owner isolation, message updates, handoffs, OAuth code binding and revocation',async t=>{
 const{PGlite}=await import('@electric-sql/pglite'),{CloudStore}=await import('../server/cloud-store.js'),{challengeFor}=await import('../api/oauth.js');const pg=new PGlite();t.after(()=>pg.close());
 const db=Object.create(CloudStore.prototype);db.sql=sqlAdapter(pg);await db.migrate();
 const owner='a',link=await db.createLink(owner,'codex','SQL test'),connection=await db.claim(link.id,link.key,{method:'Local Postgres test'});assert.equal(connection.owner_id,owner);assert.equal(connection.status,'linked');await assert.rejects(db.claim(link.id,link.key,{}));
 const expired=await db.createLink(owner,'codex','Expired');await pg.query('UPDATE uas_links SET expires_at=$1 WHERE id=$2',[new Date(0).toISOString(),expired.id]);await assert.rejects(db.claim(expired.id,expired.key,{}));
 for(let i=0;i<57;i++)await db.ingest(owner,connection.id,'codex',{nativeId:'chat-'+i,title:'Synthetic '+i,source:'Isolated test',updatedAt:new Date().toISOString(),archived:i===0,project:{nativeId:'p',name:'Test project',source:'Fixture'},messages:[{ordinal:0,role:'user',text:'Request',at:null},{ordinal:1,role:'assistant',text:'Result',at:null}],totalMessages:2});
 assert.equal((await db.chats(owner)).length,50);assert.equal((await db.chats(owner,{offset:50})).length,7);assert.equal((await db.state('b')).connections.length,0);const chat=(await db.chats(owner))[0];assert.equal(await db.chat('b',chat.id),null);
 await db.ingest(owner,connection.id,'codex',{nativeId:chat.native_id,title:'Updated',source:'Fixture',updatedAt:new Date().toISOString(),messages:[{ordinal:0,role:'assistant',text:'Updated result',at:null}],totalMessages:1});assert.equal((await db.chat(owner,chat.id)).message_count,1);assert.equal((await db.projects(owner)).length,1);
 const handoff=await db.handoff(owner,'antigravity','Selected',{chatIds:[chat.id]});assert.equal((await db.latestHandoff(owner,'antigravity')).id,handoff.id);assert.equal(await db.latestHandoff('b','antigravity'),undefined);
 const client=await db.register('Isolated OAuth',['http://127.0.0.1:8123/callback']);assert.deepEqual((await db.client(client)).redirects,['http://127.0.0.1:8123/callback']);const verifier='a'.repeat(43),resource='https://universal-ai-switcher.vercel.app/api/mcp',redirect='http://127.0.0.1:8123/callback';
 const code=await db.code({owner,clientId:client,redirect,resource,challenge:challengeFor(verifier)});assert.equal(await db.exchange({code,clientId:client,redirect,resource,challenge:challengeFor('bad')}),undefined);const grant=await db.exchange({code,clientId:client,redirect,resource,challenge:challengeFor(verifier)});assert.equal(grant.owner_id,owner);assert.equal(await db.exchange({code,clientId:client,redirect,resource,challenge:challengeFor(verifier)}),undefined);
 const oid=await db.oauthConnection(owner,{name:'OAuth test'}),tokens=await db.issue(owner,client,oid);assert.equal((await db.oauthToken(tokens.access_token)).owner_id,owner);assert.equal(await db.refresh(tokens.refresh_token,'other-client'),undefined);const rotation=await db.refresh(tokens.refresh_token,client);assert.equal(rotation.owner_id,owner);assert.equal(await db.refresh(tokens.refresh_token,client),undefined);assert.equal(await db.oauthToken(tokens.access_token),undefined);
 await db.disconnect('b',connection.id);assert(await db.connectionToken(connection.token));await db.disconnect(owner,connection.id);assert.equal(await db.connectionToken(connection.token),undefined);await db.disconnect(owner,oid);assert.equal(await db.issue(owner,client,oid).then(t=>db.oauthToken(t.access_token)),undefined);
 for(let i=0;i<2;i++)await db.rate('small-limit',2,3600);await assert.rejects(db.rate('small-limit',2,3600),/Thori dair/);
});
