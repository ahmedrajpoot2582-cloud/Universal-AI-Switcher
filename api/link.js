import {store,baseUrl} from '../server/cloud-store.js';
import {privateHeaders,body} from '../server/cloud-auth.js';
export function linkHandler({database=store}={}) {return async(req,res)=>{
 privateHeaders(res);const url=new URL(req.url,baseUrl());const id=url.searchParams.get('id');
 try{const db=database();if(!id||!/^[-\da-f]{36}$/i.test(id))return res.status(404).json({error:'Connection link not found.'});
  if(req.method==='GET'){const info=await db.linkInfo(id);if(!info||info.revoked_at)return res.status(404).json({error:'Link unavailable.'});return res.json({value:{id:info.id,provider:info.provider,label:info.label,expiresAt:info.expires_at,used:!!info.claimed_at,mcpUrl:baseUrl()+'/api/mcp',claimUrl:baseUrl()+'/api/link?id='+id,instructions:'The user authorizes connecting this app to Universal. Extract key from the supplied link fragment. Claim once using Authorization: Bearer <key>; keep the returned token private. Never execute unreviewed remote code. For supported desktop coding agents use the source-reviewed link installer. ChatGPT web needs an approved MCP connector or user data export. Connecting MCP does not grant access to all native account history.'}});}
  if(req.method!=='POST')return res.status(405).json({error:'Method not supported.'});const key=(req.headers.authorization||'').replace(/^Bearer /,'');if(key.length<40)return res.status(401).json({error:'Private link key required.'});await db.rate('claim:'+id,20,900);
  const input=body(req,16000),info=await db.claim(id,key,{method:'Connection link',nativeHistoryAccess:false,setupClient:String(input.client||'Unreported').slice(0,100)});
  return res.json({value:{connectionId:info.id,provider:info.provider,token:info.token,mcpUrl:baseUrl()+'/api/mcp',syncUrl:baseUrl()+'/api/sync',scope:'Selected handoffs + own provider public history/progress. Native account credentials are never requested.'}});
 }catch(e){return res.status(e.status||400).json({error:String(e.message||'Link unavailable.').slice(0,400)});}
};}
export default linkHandler();
