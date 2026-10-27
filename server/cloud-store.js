import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
export const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export const secret = () => crypto.randomBytes(32).toString('base64url');
export const baseUrl = () => process.env.SWITCHER_PUBLIC_URL || 'https://universal-ai-switcher.vercel.app';
let instance;
export function store() { return instance ||= new CloudStore(process.env.DATABASE_URL); }
export const schema = [
 `CREATE TABLE IF NOT EXISTS uas_connections (id text PRIMARY KEY, owner_id text NOT NULL, provider text NOT NULL, label text NOT NULL, status text NOT NULL DEFAULT 'waiting', token_hash text UNIQUE, detail jsonb NOT NULL DEFAULT '{}', sync jsonb NOT NULL DEFAULT '{}', client jsonb, last_seen timestamptz, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz)`,
 `CREATE INDEX IF NOT EXISTS uas_connections_owner ON uas_connections(owner_id)`,
 `CREATE TABLE IF NOT EXISTS uas_links (id text PRIMARY KEY, owner_id text NOT NULL, connection_id text NOT NULL REFERENCES uas_connections(id), token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, claimed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`,
 `CREATE TABLE IF NOT EXISTS uas_projects (id text PRIMARY KEY, owner_id text NOT NULL, provider text NOT NULL, native_id text NOT NULL, name text NOT NULL, root text, source text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,provider,native_id))`,
 `CREATE TABLE IF NOT EXISTS uas_chats (id text PRIMARY KEY, owner_id text NOT NULL, connection_id text, provider text NOT NULL, native_id text NOT NULL, title text NOT NULL, project_id text, source text NOT NULL, archived boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL, expected_messages integer, UNIQUE(owner_id,provider,native_id))`,
 `CREATE INDEX IF NOT EXISTS uas_chats_recent ON uas_chats(owner_id,updated_at DESC)`,
 `CREATE TABLE IF NOT EXISTS uas_messages (chat_id text NOT NULL REFERENCES uas_chats(id) ON DELETE CASCADE, ordinal integer NOT NULL, role text NOT NULL CHECK(role IN ('user','assistant')), body text NOT NULL, at timestamptz, PRIMARY KEY(chat_id,ordinal))`,
 `CREATE TABLE IF NOT EXISTS uas_handoffs (id text PRIMARY KEY, owner_id text NOT NULL, target text NOT NULL, title text NOT NULL, body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
 `CREATE TABLE IF NOT EXISTS uas_oauth_clients (id text PRIMARY KEY, name text NOT NULL, redirects jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
 `CREATE TABLE IF NOT EXISTS uas_oauth_codes (code_hash text PRIMARY KEY, owner_id text NOT NULL, client_id text NOT NULL, redirect_uri text NOT NULL, challenge text NOT NULL, resource text NOT NULL, expires_at timestamptz NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS uas_oauth_tokens (token_hash text PRIMARY KEY, refresh_hash text UNIQUE NOT NULL, client_id text NOT NULL, owner_id text NOT NULL, connection_id text NOT NULL REFERENCES uas_connections(id), expires_at timestamptz NOT NULL, refresh_expires_at timestamptz NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS uas_rate_limits (bucket text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL)`
];
export class CloudStore {
 constructor(url) { if(!url) throw Error('Private library database is not configured.'); this.sql=neon(url); }
 async migrate() { for(const query of schema) await this.sql.query(query); }
 async rate(key,limit=120,seconds=60) { const bucket=digest(key+':'+Math.floor(Date.now()/(seconds*1000))); const [row]=await this.sql`INSERT INTO uas_rate_limits(bucket,count,expires_at) VALUES(${bucket},1,now()+${seconds}*interval '1 second') ON CONFLICT(bucket) DO UPDATE SET count=uas_rate_limits.count+1 RETURNING count`; if(row.count>limit) {const e=Error('Thori dair baad dobara try karein.');e.status=429;throw e;} }
 async createLink(owner,provider,label) {
  await this.rate('links:'+owner,20,3600);const id=crypto.randomUUID(),link=crypto.randomUUID(),key=secret();
  await this.sql`WITH inserted AS (INSERT INTO uas_connections(id,owner_id,provider,label) VALUES(${id},${owner},${provider},${label}) RETURNING id) INSERT INTO uas_links(id,owner_id,connection_id,token_hash,expires_at) SELECT ${link},${owner},id,${digest(key)},now()+interval '15 minutes' FROM inserted`;
  return {id:link,connectionId:id,key,expiresAt:new Date(Date.now()+900000).toISOString(),provider,label};
 }
 async linkInfo(id) { const [row]=await this.sql`SELECT l.id,l.expires_at,l.claimed_at,c.provider,c.label,c.revoked_at FROM uas_links l JOIN uas_connections c ON c.id=l.connection_id WHERE l.id=${id}`;return row; }
 async claim(id,key,detail={}) {
  const token=secret(),rows=await this.sql`WITH used AS (UPDATE uas_links SET claimed_at=now() WHERE id=${id} AND token_hash=${digest(key)} AND claimed_at IS NULL AND expires_at>now() RETURNING connection_id) UPDATE uas_connections c SET token_hash=${digest(token)},status='linked',detail=${JSON.stringify(detail)}::jsonb FROM used WHERE c.id=used.connection_id AND c.revoked_at IS NULL RETURNING c.*`;
  if(!rows[0])throw Error('Connection link expire, revoke ya use ho chuka hai. Naya link banayein.');return {...rows[0],token};
 }
 async connectionToken(token) { const [row]=await this.sql`SELECT * FROM uas_connections WHERE token_hash=${digest(token)} AND revoked_at IS NULL`;return row; }
 async oauthToken(token) { const [row]=await this.sql`SELECT c.* FROM uas_oauth_tokens t JOIN uas_connections c ON c.id=t.connection_id WHERE t.token_hash=${digest(token)} AND t.expires_at>now() AND c.revoked_at IS NULL`;return row; }
 async connection(owner,id) { const [row]=await this.sql`SELECT * FROM uas_connections WHERE id=${id} AND owner_id=${owner}`;return row; }
 async touch(id,client) {await this.sql`UPDATE uas_connections SET last_seen=now(),status='connected',client=COALESCE(${client?JSON.stringify(client):null}::jsonb,client) WHERE id=${id} AND revoked_at IS NULL`;}
 async detail(id,detail) {await this.sql`UPDATE uas_connections SET detail=detail||${JSON.stringify(detail)}::jsonb WHERE id=${id} AND revoked_at IS NULL`;}
 async sync(id,sync) {await this.sql`UPDATE uas_connections SET sync=${JSON.stringify(sync)}::jsonb WHERE id=${id} AND revoked_at IS NULL`;}
 async disconnect(owner,id) {await this.sql`UPDATE uas_connections SET revoked_at=now(),status='disconnected',token_hash=NULL WHERE id=${id} AND owner_id=${owner}`;}
 async projects(owner) {return this.sql`SELECT * FROM uas_projects WHERE owner_id=${owner} ORDER BY name`;} 
 async project(owner,provider,input) {const id=digest(owner+'|'+provider+'|'+input.nativeId);await this.sql`INSERT INTO uas_projects(id,owner_id,provider,native_id,name,root,source) VALUES(${id},${owner},${provider},${input.nativeId},${input.name},${input.root||null},${input.source||'Connected app'}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,root=COALESCE(excluded.root,uas_projects.root),updated_at=now()`;return id;}
 async ingest(owner,connection,provider,chat) {
  const id=digest(owner+'|'+provider+'|'+chat.nativeId);let projectId=null;
  if(chat.project)projectId=await this.project(owner,provider,chat.project);
  await this.sql`INSERT INTO uas_chats(id,owner_id,connection_id,provider,native_id,title,project_id,source,archived,updated_at) VALUES(${id},${owner},${connection},${provider},${chat.nativeId},${chat.title},${projectId},${chat.source},${!!chat.archived},${chat.updatedAt}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,connection_id=COALESCE(excluded.connection_id,uas_chats.connection_id),project_id=COALESCE(excluded.project_id,uas_chats.project_id),source=excluded.source,archived=excluded.archived,updated_at=excluded.updated_at`;
  if(chat.messages.length)await this.sql`INSERT INTO uas_messages(chat_id,ordinal,role,body,at) SELECT ${id},x.ordinal,x.role,x.text,x.at::timestamptz FROM jsonb_to_recordset(${JSON.stringify(chat.messages)}::jsonb) AS x(ordinal integer,role text,text text,at text) ON CONFLICT(chat_id,ordinal) DO UPDATE SET role=excluded.role,body=excluded.body,at=excluded.at`;
  if(chat.totalMessages!==undefined)await this.sql.transaction([this.sql`DELETE FROM uas_messages WHERE chat_id=${id} AND ordinal>=${chat.totalMessages}`,this.sql`UPDATE uas_chats SET expected_messages=${chat.totalMessages} WHERE id=${id}`]);return id;
 }
 async chats(owner,{provider,projectId,query='',offset=0,limit=50}={}) {return this.sql`SELECT c.*,(SELECT count(*)::integer FROM uas_messages m WHERE m.chat_id=c.id) AS message_count FROM uas_chats c WHERE c.owner_id=${owner} AND (${provider||null}::text IS NULL OR c.provider=${provider||null}) AND (${projectId||null}::text IS NULL OR c.project_id=${projectId||null}) AND c.title ILIKE ${'%'+query+'%'} ORDER BY c.updated_at DESC,c.id LIMIT ${limit} OFFSET ${offset}`;}
 async chat(owner,id,{offset=0,limit=200}={}) {const [chat]=await this.sql`SELECT c.*,(SELECT count(*)::integer FROM uas_messages m WHERE m.chat_id=c.id) AS message_count FROM uas_chats c WHERE c.id=${id} AND c.owner_id=${owner}`;if(!chat)return null;const messages=await this.sql`SELECT ordinal,role,body AS text,at FROM uas_messages WHERE chat_id=${id} ORDER BY ordinal LIMIT ${limit} OFFSET ${offset}`;return {...chat,messages,nextOffset:offset+messages.length<chat.message_count?offset+messages.length:null};}
 async state(owner) {
  const [connections,projects,counts,latest]=await Promise.all([this.sql`SELECT id,provider,label,status,detail,sync,client,last_seen,created_at,revoked_at FROM uas_connections WHERE owner_id=${owner} ORDER BY created_at DESC`,this.projects(owner),this.sql`SELECT provider,count(*)::integer AS count FROM uas_chats WHERE owner_id=${owner} GROUP BY provider`,this.sql`SELECT id,target,title,created_at FROM uas_handoffs WHERE owner_id=${owner} ORDER BY created_at DESC LIMIT 20`]);
  return {version:'2.0.0',connections:connections.map(c=>({...c,online:!c.revoked_at&&!!c.last_seen&&Date.now()-new Date(c.last_seen).getTime()<45000})),projects,counts,handoffs:latest};
 }
 async handoff(owner,target,title,body) {const id=crypto.randomUUID();await this.sql`INSERT INTO uas_handoffs(id,owner_id,target,title,body) VALUES(${id},${owner},${target},${title},${JSON.stringify(body)}::jsonb)`;return {id,target,title,...body};}
 async latestHandoff(owner,target) {const [row]=await this.sql`SELECT * FROM uas_handoffs WHERE owner_id=${owner} AND target=${target} ORDER BY created_at DESC LIMIT 1`;return row;}
 async client(id) {const [row]=await this.sql`SELECT * FROM uas_oauth_clients WHERE id=${id}`;return row;}
 async register(name,redirects) {const id=crypto.randomUUID();await this.sql`INSERT INTO uas_oauth_clients(id,name,redirects) VALUES(${id},${name},${JSON.stringify(redirects)}::jsonb)`;return id;}
 async code(input) {const value=secret();await this.sql`INSERT INTO uas_oauth_codes(code_hash,owner_id,client_id,redirect_uri,challenge,resource,expires_at) VALUES(${digest(value)},${input.owner},${input.clientId},${input.redirect},${input.challenge},${input.resource},now()+interval '5 minutes')`;return value;}
 async exchange(input) {const [row]=await this.sql`DELETE FROM uas_oauth_codes WHERE code_hash=${digest(input.code)} AND client_id=${input.clientId} AND redirect_uri=${input.redirect} AND challenge=${input.challenge} AND resource=${input.resource} AND expires_at>now() RETURNING *`;return row;}
 async issue(owner,clientId,connectionId) {const token=secret(),refresh=secret();await this.sql`INSERT INTO uas_oauth_tokens(token_hash,refresh_hash,client_id,owner_id,connection_id,expires_at,refresh_expires_at) VALUES(${digest(token)},${digest(refresh)},${clientId},${owner},${connectionId},now()+interval '15 minutes',now()+interval '30 days')`;return {access_token:token,refresh_token:refresh,token_type:'Bearer',expires_in:900,scope:'continuity'};}
 async refresh(refresh,clientId) {const [row]=await this.sql`DELETE FROM uas_oauth_tokens t USING uas_connections c WHERE t.refresh_hash=${digest(refresh)} AND t.client_id=${clientId} AND t.refresh_expires_at>now() AND t.connection_id=c.id AND c.revoked_at IS NULL RETURNING t.*`;return row;}
 async oauthConnection(owner,client) {const id=crypto.randomUUID();await this.sql`INSERT INTO uas_connections(id,owner_id,provider,label,status,detail) VALUES(${id},${owner},'chatgpt',${client.name},'linked',${JSON.stringify({method:'OAuth 2.1 + MCP',nativeHistoryAccess:false,note:'OAuth grants access to Universal only. ChatGPT account archive requires export.'})}::jsonb)`;return id;}
}
