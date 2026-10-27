import {store} from '../server/cloud-store.js';
import {privateHeaders,body} from '../server/cloud-auth.js';
import {ingestBatch,ingestProjects} from '../server/library.js';
export default async function handler(req,res){privateHeaders(res);if(req.method!=='POST')return res.status(405).json({error:'POST required.'});
 try{const db=store(),token=(req.headers.authorization||'').replace(/^Bearer /,''),connection=await db.connectionToken(token);if(!connection)return res.status(401).json({error:'Connection expired or disconnected. Make a new link.'});await db.rate('sync:'+connection.id,600,60);const input=body(req);
  if(input.action==='detail'){const detail=input.detail||{};const allowed={};for(const key of ['os','adapterVersion','cliVersion','account','plan','nativeHistoryAccess','historyScope','projectCount','lastError'])if(detail[key]!==undefined)allowed[key]=typeof detail[key]==='string'?detail[key].slice(0,1000):detail[key];await db.detail(connection.id,allowed);return res.json({value:{saved:true}});}
  if(input.action==='status'){const status=input.status||{};if(!['syncing','complete','partial','error'].includes(status.status))throw Error('Invalid sync state.');const saved={status:status.status,total:Math.max(0,Number(status.total)||0),saved:Math.max(0,Number(status.saved)||0),failed:Math.max(0,Number(status.failed)||0),lastError:String(status.lastError||'').slice(0,500),at:new Date().toISOString()};if(saved.status==='complete'&&(saved.failed||saved.saved!==saved.total))throw Error('Incomplete sync cannot be marked complete.');await db.sync(connection.id,saved);return res.json({value:saved});}
  if(input.action==='projects')return res.json({value:await ingestProjects(db,connection,input.projects,'Connected adapter project metadata')});
  return res.json({value:await ingestBatch(db,connection,input.chats,connection.provider==='codex'?'Codex local API':connection.provider==='antigravity'?'Antigravity public project journal':'Connected app public history')});
 }catch(e){res.status(e.status||400).json({error:String(e.message||'Sync failed.').slice(0,500)});}
}
