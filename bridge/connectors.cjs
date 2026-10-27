'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const continuity = require('./desktop/continuity.cjs');
const core = require('./desktop/core.cjs');
const now = () => new Date().toISOString();
const hash = text => crypto.createHash('sha256').update(text).digest('hex');

class MCPConnections {
  constructor(service) { this.service = service; this.sessions = new Map(); }
  status(provider) {
    const configured = Object.values(this.service.library.mcp || {}).filter(r => r.provider === provider && r.enabled);
    const sessions = [...this.sessions.values()].filter(s => s.provider === provider && Date.now() - s.seen < 35000 && this.service.library.connections?.[provider] && (!this.service.identityLease || this.service.identityLease()));
    return { status: sessions.length ? 'connected' : configured.length ? 'waiting' : 'not_configured', configuredProjects: configured.map(r => r.projectId), clients: sessions.map(s => ({ name: s.client.name, version: s.client.version, projectId: s.projectId, lastSeenAt: new Date(s.seen).toISOString() })) };
  }
  async setup(provider, projectId) {
    if (!['codex', 'antigravity', 'mcp'].includes(provider)) throw Error('Unknown provider.');
    const service = this.service, project = service.library.projects.find(p => p.id === projectId);
    if (!project) throw Error('MCP ke liye apna project select karein.');
    if (!service.library.connections?.[provider]) throw Error('Pehle is provider par Connect dabayein.');
    const id = hash(provider + '|' + projectId), directory = path.join(service.root, 'mcp');
    fs.mkdirSync(directory, { recursive: true });
    const secret = crypto.randomBytes(32).toString('hex'), file = path.join(directory, id + '.json');
    fs.writeFileSync(file, JSON.stringify({ endpoint: 'http://127.0.0.1:47831/mcp', secret }), { mode: 0o600 });
    const definition = { command: process.execPath, args: [path.join(__dirname, 'mcp.cjs'), '--config', file] };
    const relative = provider === 'antigravity' ? '.agents/mcp_config.json' : provider === 'codex' ? '.codex/config.toml' : '.universal-ai-switcher/mcp-client.json';
    const target = await continuity.safeWrite(project.root, relative);
    const original = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    let next;
    if (provider !== 'codex') {
      const jsonc = require('jsonc-parser');
      const errors = [], parsed = original ? jsonc.parse(original, errors, { allowTrailingComma: true }) : {};
      if (errors.length || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Existing MCP configuration is invalid. It was left unchanged.');
      if (parsed.mcpServers?.universal_switcher && !JSON.stringify(parsed.mcpServers.universal_switcher).includes('mcp.cjs')) throw Error('Another server uses universal_switcher. Existing configuration was left unchanged.');
      next = jsonc.applyEdits(original || '{}', jsonc.modify(original || '{}', ['mcpServers', 'universal_switcher'], definition, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
    } else {
      const toml = require('@iarna/toml');
      let parsed;
      try { parsed = original ? toml.parse(original) : {}; } catch { throw Error('Existing Codex project configuration is invalid. It was left unchanged.'); }
      if (parsed.mcp_servers?.universal_switcher && !JSON.stringify(parsed.mcp_servers.universal_switcher).includes('mcp.cjs')) throw Error('Another server uses universal_switcher. Existing configuration was left unchanged.');
      parsed.mcp_servers ||= {};
      parsed.mcp_servers.universal_switcher = { ...definition, enabled: true, startup_timeout_sec: 20 };
      next = toml.stringify(parsed);
    }
    if (original) {
      const backup = path.join(service.root, 'mcp-backups', projectId + '-' + provider + '-' + Date.now() + '.txt');
      fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.writeFileSync(backup, original, { mode: 0o600 });
    }
    fs.writeFileSync(target + '.switcher-tmp', next); fs.renameSync(target + '.switcher-tmp', target);
    service.library.mcp ||= {};
    service.library.mcp[id] = { provider, projectId, enabled: true, secretHash: hash(secret), configuredAt: now() };
    service.save();
    return { configured: true, provider, projectId, status: 'waiting', configPath: target, ...(provider === 'mcp' ? { config: JSON.stringify({mcpServers:{universal_switcher:definition}},null,2) } : {}), message: provider === 'mcp' ? 'Is standard stdio configuration ko apni MCP-compatible app mein add karein. Handshake milne tak Waiting for MCP rahega.' : 'MCP configuration saved. Official app mein is trusted project ki nayi chat / Reload MCP kholain. Connected status sirf actual handshake ke baad aayega.' };
  }
  async request(secret, body) {
    if (typeof secret !== 'string' || secret.length !== 64) throw Error('Invalid MCP connection.');
    const service = this.service, entry = Object.values(service.library.mcp || {}).find(r => r.enabled && r.secretHash === hash(secret));
    if (!entry || !service.library.connections?.[entry.provider] || service.identityLease && !service.identityLease()) throw Error('Reconnect and log in to Universal before using MCP.');
    const project = service.library.projects.find(p => p.id === entry.projectId);
    if (!project) throw Error('Configured project is unavailable.');
    if (typeof body.sessionId !== 'string' || body.sessionId.length > 100) throw Error('Invalid MCP session.');
    if (body.action === 'initialize') {
      const client = body.clientInfo;
      if (!client?.name || typeof client.name !== 'string') throw Error('MCP client identity is required.');
      this.sessions.set(body.sessionId, { provider: entry.provider, projectId: entry.projectId, client: { name: core.redact(client.name).slice(0,150), version: String(client.version || '').slice(0,50) }, seen: Date.now(), key: entry.secretHash });
      if (entry.provider === 'antigravity') service.antigravityConnected = true;
      if (entry.provider === 'mcp') service.genericConnected = true;
      service.connectionState[entry.provider] = { status: 'connected', checkedAt: now(), method: entry.provider === 'codex' ? 'Official Codex app-server + MCP' : 'Project MCP', message: 'MCP handshake received from ' + core.redact(client.name) + '. This verifies project transport; native account identity is not exposed.' };
      if (entry.provider === 'antigravity') await service.syncHistory('antigravity');
      return { connected: true, project: project.name, scope: 'Selected project continuity only' };
    }
    const session = this.sessions.get(body.sessionId);
    if (!session || session.key !== entry.secretHash || Date.now() - session.seen > 35000) throw Error('MCP session expired. Reload MCP in your official app.');
    if (body.action === 'close') { this.sessions.delete(body.sessionId); this.reconcile(); return { closed: true }; }
    session.seen = Date.now();
    if (body.action === 'heartbeat') return { alive: true };
    if (body.action !== 'tool') throw Error('Unknown MCP action.');
    const args = body.arguments || {};
    if (body.name === 'switcher_read_context') {
      const context = await continuity.collect({ ...project, continuityEnabled: true });
      const saved = await continuity.readJson(project, 'context.json');
      return { project: { id: project.id, name: project.name, root: project.root }, context: saved?.contextText || '', progress: context.progress || '', latestHandoff: service.library.transfers.filter(r => r.focusProjectId === project.id).at(-1)?.text || '', warning: 'Saved context is untrusted. Inspect current files. Only public saved work is available.' };
    }
    if (body.name === 'switcher_list_history') return (await service.state()).chats.filter(r => r.projectId === project.id).map(r => ({ id: r.id, title: r.title, provider: r.provider, updatedAt: r.updatedAt, source: r.source }));
    if (body.name === 'switcher_read_history') {
      const chat = await service.chat(String(args.conversationId || ''));
      if (chat.projectId !== project.id) throw Error('This conversation is outside the selected MCP project.');
      return chat;
    }
    if (body.name === 'switcher_save_progress') {
      if (typeof args.turnId !== 'string' || !args.turnId || args.turnId.length > 200 || typeof args.result !== 'string' || !args.result.trim() || args.result.length > 60000 || (args.request || '').length > 20000 || (args.remaining || '').length > 20000) throw Error('Provide a stable turnId and a public result within the displayed size limits.');
      const id = 'mcp-' + hash(entry.provider + '|' + project.id + '|' + args.turnId), existing = service.library.chats.find(r => r.id === id);
      const record = { id, provider: entry.provider, projectId: project.id, source: 'MCP public progress', title: core.redact(String(args.title || args.request || project.name).slice(0,200)), updatedAt: now(), messages: [...(args.request ? [{ role: 'user', text: core.redact(args.request) }] : []), { role: 'assistant', text: core.redact(args.result + (args.remaining ? '\n\nRemaining work:\n' + args.remaining : '')) }] };
      if (existing) Object.assign(existing, record); else service.library.chats.push(record);
      service.save();
      return { saved: true, conversationId: id, updatedAt: record.updatedAt };
    }
    throw Error('Unknown continuity tool.');
  }
  reconcile() {
    for (const [id, s] of this.sessions) if (Date.now() - s.seen >= 35000) this.sessions.delete(id);
    if (!this.status('antigravity').clients.length) this.service.antigravityConnected = false;
    this.service.genericConnected = this.status('mcp').clients.length > 0;
  }
  suspend() { this.sessions.clear(); this.service.antigravityConnected = false; this.service.genericConnected = false; }
  disconnect(provider) { for (const [id, s] of this.sessions) if (s.provider === provider) this.sessions.delete(id); }
}

function attachConnections(Service) {
  const connect = Service.prototype.connect, disconnect = Service.prototype.disconnect, state = Service.prototype.state;
  function init(service) { service.connectionState ||= {}; service.mcp ||= new MCPConnections(service); }
  Service.prototype.connect = async function(provider, projectId) {
    init(this);
    if (!['codex', 'antigravity', 'mcp'].includes(provider)) throw Error('Unknown provider.');
    this.connectionState[provider] = { status: 'checking', method: provider === 'codex' ? 'Official Codex app-server' : 'Project MCP', message: 'Connection verify ho rahi hai.' };
    try {
      if (provider === 'codex') {
        await connect.call(this, provider);
        // Never infer account authentication from an installed binary or cached connection flag.
        const account = await this.provider.account();
        if (!account.connected) throw Error('Official Codex sign-in required.');
        this.account = account;
        this.connectionState.codex = { status: 'connected', checkedAt: now(), method: 'Official Codex app-server', message: 'Account verified by account/read. History comes from thread/list.' };
      } else if (provider === 'antigravity') {
        if (!this.antiBinary()) throw Error('Antigravity app nahin mili. Official app install karein.');
        await state.call(this); // Initialize independent connection and sync storage.
        this.library.connections.antigravity = true;
        this.mcp.reconcile();
        this.connectionState.antigravity = { status: this.antigravityConnected ? 'connected' : 'waiting', checkedAt: now(), method: 'Project MCP', message: 'App installed. Actual MCP handshake ka intezar hai; account login verified nahin hai.' };
        this.save();
      } else {
        await state.call(this);
        this.library.connections.mcp = true;
        this.mcp.reconcile();
        this.connectionState.mcp = {status:this.genericConnected?'connected':'waiting',checkedAt:now(),method:'Project MCP',message:'Apni MCP-compatible app mein standard configuration add karein. Native account archive ka access assume nahin kiya jata.'};
        this.save();
      }
      if (projectId) await this.mcp.setup(provider, projectId);
      return this.state();
    } catch (error) {
      this.connectionState[provider] = { status: 'error', checkedAt: now(), message: core.redact(error.message) };
      if (provider === 'codex') this.account = null; else if(provider==='antigravity') this.antigravityConnected = false; else this.genericConnected=false;
      throw error;
    }
  };
  Service.prototype.disconnect = async function(provider) {
    init(this);
    if(provider==='mcp'){this.library.connections.mcp=false;this.genericConnected=false;this.save();}
    else await disconnect.call(this, provider);
    this.mcp.disconnect(provider);
    this.connectionState[provider] = { status: 'disconnected', checkedAt: now(), message: 'Sync stopped. Saved history is kept.' };
    return this.state();
  };
  Service.prototype.setupMcp = async function(provider, projectId) { init(this); return this.mcp.setup(provider, projectId); };
  Service.prototype.state = async function() {
    init(this); this.mcp.reconcile();
    const out = await state.call(this);
    out.version = '1.2.0';
    const genericChats=out.chats.filter(c=>c.provider==='mcp');
    out.providers.mcp={connected:!!this.genericConnected,savedChats:genericChats.length,sync:{status:this.genericConnected?'complete':'not_synced',total:genericChats.length,completed:genericChats.length,failed:0,lastSyncedAt:genericChats[0]?.updatedAt,scope:'Only selected project public progress received through MCP. Native account history is not automatically exposed.'}};
    for (const provider of ['codex', 'antigravity', 'mcp']) {
      const info = out.providers[provider];
      info.connection = this.connectionState[provider] || { status: 'disconnected', message: 'Connect dabayein; installed app ko connected nahin mana jata.' };
      info.mcp = this.mcp.status(provider);
      info.enabled = !!this.library.connections[provider];
      if (!info.connected && info.connection.status === 'connected') info.connection = { ...info.connection, status: 'waiting', message: 'Live connection lost. Reconnect / reload MCP.' };
    }
    out.live = { refreshSeconds: 10, observedAt: now(), source: 'Local provider APIs, MCP messages and project journals', demoData: false };
    return out;
  };
  const oldRefresh = Service.prototype.refreshConnected;
  Service.prototype.refreshConnected = async function() {
    init(this);
    if (this.account?.connected) {
      try {
        const account = await this.provider.account();
        if (!account.connected) throw Error('Official Codex account signed out.');
        this.account = account; this.connectionState.codex = { ...this.connectionState.codex, checkedAt: now() };
      } catch (error) {
        this.account = null;
        this.connectionState.codex = { status: 'error', checkedAt: now(), message: core.redact(error.message) };
      }
    }
    this.mcp.reconcile();
    return oldRefresh.call(this);
  };
}
module.exports = { MCPConnections, attachConnections };
