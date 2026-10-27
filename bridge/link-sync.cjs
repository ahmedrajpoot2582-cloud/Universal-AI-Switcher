'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Codex}=require('./desktop/codex.cjs');
const {publicMessages}=require('./service.cjs');
const continuity=require('./desktop/continuity.cjs');
const fingerprint=value=>crypto.createHash('sha256').update(value).digest('hex');
async function upload(config,action,value){const response=await fetch(config.syncUrl,{method:'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify({action,...value}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Private history sync failed.');return data.value;}
function historyBatches(chat){const result=[];let batch=[];for(let index=0;index<chat.messages.length;index++){const message={...chat.messages[index],ordinal:index};if(Buffer.byteLength(JSON.stringify(message))>2000000)throw Error('A public message exceeds 2 MB. Conversation is partial; export/import a smaller text representation.');if(batch.length>=100||Buffer.byteLength(JSON.stringify(batch))+Buffer.byteLength(JSON.stringify(message))>2200000){result.push({...chat,messages:batch});batch=[];}batch.push(message);}result.push({...chat,messages:batch,totalMessages:chat.messages.length});return result;}
class LinkSync{
 constructor(config,options={}){this.config=config;this.provider=options.provider||new Codex();this.send=options.upload||upload;this.root=options.root||path.dirname(config.file||path.join(process.cwd(),'config.json'));this.file=path.join(this.root,'sync-cache.json');this.cache=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{};this.closed=false;}
 async run(){if(this.running||this.closed)return;this.running=true;try{if(this.config.provider==='codex')await this.codex();else if(this.config.provider==='antigravity')await this.antigravity();}finally{this.running=false;}}
 async codex(){
  await this.provider.connect();const account=await this.provider.account();if(!account.connected)throw Error('Official Codex mein ChatGPT login required hai. Koi API key use nahin hui.');
  await this.send(this.config,'detail',{detail:{os:process.platform,adapterVersion:'2.0.0',cliVersion:account.version,account:account.account,plan:account.plan,nativeHistoryAccess:true,historyScope:'All available local active + archived Codex public conversations. ChatGPT web-only archive is separate.'}});
  const found=new Map();for(const archived of [false,true]){let cursor=null;const seen=new Set();do{const page=await this.provider.call('thread/list',{limit:100,sortKey:'updated_at',sourceKinds:['cli','vscode','appServer','exec','unknown'],archived,...(cursor?{cursor}:{})});if(!Array.isArray(page.data))throw Error('Codex did not return a history page.');for(const thread of page.data)found.set(thread.id,{...thread,archived});cursor=page.nextCursor||null;if(cursor&&seen.has(cursor))throw Error('Repeated Codex page cursor; history is incomplete.');if(cursor)seen.add(cursor);}while(cursor);}
  const status={status:'syncing',total:found.size,saved:0,failed:0};await this.send(this.config,'status',{status});
  for(const thread of found.values()){
   if(this.closed)break;
   try{const revision=String(thread.updatedAt||thread.createdAt);if(this.cache[thread.id]!==revision){let turns=[],cursor=null;const seen=new Set();do{const page=await this.provider.call('thread/turns/list',{threadId:thread.id,limit:25,sortDirection:'asc',itemsView:'summary',...(cursor?{cursor}:{})});if(!Array.isArray(page.data))throw Error('Codex readable history page missing.');turns.push(...page.data);cursor=page.nextCursor||null;if(cursor&&seen.has(cursor))throw Error('Repeated conversation cursor.');if(cursor)seen.add(cursor);}while(cursor);
    const cwd=thread.cwd||'',chat={nativeId:thread.id,title:thread.name||thread.preview?.slice(0,120)||'Codex conversation',updatedAt:new Date((thread.updatedAt||thread.createdAt||Date.now()/1000)*1000).toISOString(),archived:thread.archived,messages:publicMessages({turns}),...(cwd?{project:{nativeId:cwd,name:path.basename(cwd)||cwd,root:cwd}}:{})};
    for(const batch of historyBatches(chat))await this.send(this.config,'history',{chats:[batch]});this.cache[thread.id]=revision;fs.mkdirSync(this.root,{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.cache),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);
   }status.saved++;}catch(e){status.failed++;status.lastError=String(e.message).slice(0,500);}await this.send(this.config,'status',{status});
  }
  status.status=this.closed||status.failed?'partial':'complete';await this.send(this.config,'status',{status});
 }
 async antigravity(){
  await this.send(this.config,'detail',{detail:{os:process.platform,adapterVersion:'2.0.0',nativeHistoryAccess:false,historyScope:'Selected project public journals + MCP progress. Full native Antigravity account archive requires export.'}});
  const cwd=this.config.project;if(!cwd)return;const saved=await continuity.readJson({root:cwd},'config.json'),project={id:typeof saved?.projectId==='string'?saved.projectId:fingerprint(cwd),root:cwd,name:path.basename(cwd),continuityEnabled:true};const data=await continuity.collect(project);const messages=data.messages||[];const revision=fingerprint(JSON.stringify({messages,progress:data.progress}));
  if(this.cache.journal===revision)return;
  if(messages.length){const chat={nativeId:'project-journal:'+cwd,title:project.name+' — saved public progress',updatedAt:data.journalAt||new Date().toISOString(),project:{nativeId:cwd,name:project.name,root:cwd},messages:messages.map(m=>({role:m.role,text:m.text,at:m.at})).filter(m=>['user','assistant'].includes(m.role))};for(const batch of historyBatches(chat))await this.send(this.config,'history',{chats:[batch]});}
  this.cache.journal=revision;fs.mkdirSync(this.root,{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.cache),{mode:0o600});await this.send(this.config,'status',{status:{status:'complete',total:messages.length?1:0,saved:messages.length?1:0,failed:0}});
 }
 async close(){this.closed=true;await this.provider.close();}
}
module.exports={LinkSync,upload,historyBatches};
