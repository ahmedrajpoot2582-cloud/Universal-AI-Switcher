import {store,secret,digest,baseUrl} from '../server/cloud-store.js';
import {verifiedUser,privateHeaders,body,sameOrigin} from '../server/cloud-auth.js';
export function validRedirect(value){try{const url=new URL(value);return !url.hash&&!url.username&&!url.password&&(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname));}catch{return false;}}
export const challengeFor=value=>Buffer.from(digest(value),'hex').toString('base64url');
export function validateAuthorization(input,client){
 if(!client||input.response_type!=='code'||input.code_challenge_method!=='S256'||!/^[-_a-zA-Z0-9]{43}$/.test(input.code_challenge||'')||input.resource!==baseUrl()+'/api/mcp'||!client.redirects.includes(input.redirect_uri)||!validRedirect(input.redirect_uri))throw Error('Invalid MCP authorization request.');
 if(input.scope&&input.scope!=='continuity'||input.state&&String(input.state).length>1000)throw Error('Unsupported scope or invalid state.');
}
export function oauthHandler({database=store,authenticate=verifiedUser}={}){return async(req,res)=>{
 privateHeaders(res);const url=new URL(req.url,baseUrl()),action=url.searchParams.get('action')||req.query?.action;
 try{
  if(action==='resource')return res.json({resource:baseUrl()+'/api/mcp',authorization_servers:[baseUrl()],scopes_supported:['continuity'],bearer_methods_supported:['header']});
  if(action==='metadata')return res.json({issuer:baseUrl(),authorization_endpoint:baseUrl()+'/authorize',token_endpoint:baseUrl()+'/api/oauth?action=token',registration_endpoint:baseUrl()+'/api/oauth?action=register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:['continuity']});
  const db=database();
  if(action==='client'&&req.method==='GET'){const client=await db.client(url.searchParams.get('id'));return client?res.json({client_id:client.id,client_name:client.name}):res.status(404).json({error:'Unknown client.'});}
  if(req.method!=='POST')return res.status(405).json({error:'POST required.'});
  if(Buffer.byteLength(typeof req.body==='string'?req.body:JSON.stringify(req.body||{}))>16000)return res.status(413).json({error:'invalid_request'});
  let input;if(String(req.headers['content-type']||'').includes('application/x-www-form-urlencoded'))input=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body;else input=body(req,16000);
  if(action==='register'){
   const redirects=input.redirect_uris;if(!Array.isArray(redirects)||!redirects.length||redirects.length>5||!redirects.every(validRedirect))return res.status(400).json({error:'invalid_redirect_uri'});
   if(input.token_endpoint_auth_method&&input.token_endpoint_auth_method!=='none')return res.status(400).json({error:'invalid_client_metadata'});
   await db.rate('oauth-register:'+digest(JSON.stringify(redirects)),10,3600);
   await db.rate('oauth-register-global',100,3600);
   const name=String(input.client_name||'MCP client').slice(0,100),id=await db.register(name,redirects);return res.status(201).json({client_id:id,client_name:name,redirect_uris:redirects,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']});
  }
  if(action==='approve'){
   if(!sameOrigin(req))return res.status(403).json({error:'Untrusted authorization origin.'});let user;try{user=await authenticate(req);}catch{return res.status(401).json({error:'Verified email login required.'});}
   const client=await db.client(input.client_id);validateAuthorization(input,client);await db.rate('oauth-approve:'+user.sub,30,3600);
   const code=await db.code({owner:user.sub,clientId:client.id,redirect:input.redirect_uri,challenge:input.code_challenge,resource:input.resource});const destination=new URL(input.redirect_uri);destination.searchParams.set('code',code);if(input.state)destination.searchParams.set('state',String(input.state).slice(0,1000));return res.json({url:destination.toString()});
  }
  if(action==='token'){
   const client=await db.client(input.client_id);if(!client)return res.status(400).json({error:'invalid_client'});
   if(input.grant_type==='authorization_code'){
    if(!/^[-._~a-zA-Z0-9]{43,128}$/.test(input.code_verifier||'')||input.resource!==baseUrl()+'/api/mcp')return res.status(400).json({error:'invalid_grant'});
    const saved=await db.exchange({code:input.code,clientId:client.id,redirect:input.redirect_uri,challenge:challengeFor(input.code_verifier),resource:input.resource});if(!saved)return res.status(400).json({error:'invalid_grant'});
    const connection=await db.oauthConnection(saved.owner_id,client);return res.json(await db.issue(saved.owner_id,client.id,connection));
   }
   if(input.grant_type==='refresh_token'){
    if(input.resource&&input.resource!==baseUrl()+'/api/mcp')return res.status(400).json({error:'invalid_target'});
    const saved=await db.refresh(input.refresh_token,client.id);if(!saved)return res.status(400).json({error:'invalid_grant'});return res.json(await db.issue(saved.owner_id,client.id,saved.connection_id));
   }
   return res.status(400).json({error:'unsupported_grant_type'});
  }
  return res.status(404).json({error:'Unknown authorization action.'});
 }catch(e){res.status(e.status||400).json({error:'invalid_request',error_description:String(e.message||'Authorization failed.').slice(0,400)});}
};}
export default oauthHandler();
