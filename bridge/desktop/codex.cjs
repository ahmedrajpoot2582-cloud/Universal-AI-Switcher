'use strict';
const { EventEmitter } = require('node:events');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { subscriptionEnv, redact } = require('./core.cjs');
const exec = promisify(execFile);
const SUPPORTED_VERSION='codex-cli 0.164.0-alpha.11.1';
function isDesktopLauncher(file,exists=fs.existsSync){
  const normalized=file.replace(/\\/g,'/');
  if(/\/WindowsApps\/OpenAI\.Codex_[^/]+\/app\/Codex\.exe$/i.test(normalized))return true;
  const dir=path.dirname(file);
  return exists(path.join(dir,'chrome_100_percent.pak'))||exists(path.join(dir,'resources','app.asar'));
}
async function findCodex(saved,deps={}) {
  const exists=deps.exists||fs.existsSync,execute=deps.execute||exec,env=deps.env||process.env;
  const readdir=deps.readdir||fs.readdirSync,stat=deps.stat||fs.statSync,platform=deps.platform||process.platform;
  const candidates=[];
  const add=file=>{if(typeof file==='string'&&path.isAbsolute(file)&&/codex(?:\.exe)?$/i.test(file)&&exists(file)&&!isDesktopLauncher(file,exists)&&!candidates.some(p=>p.toLowerCase()===file.toLowerCase()))candidates.push(file);};
  add(saved);
  // The desktop launcher also calls itself Codex.exe. Prefer actual bundled CLI files over PATH aliases.
  const base=path.join(env.LOCALAPPDATA||'','OpenAI','Codex','bin');
  if(exists(base)){
    const dirs=readdir(base).map(name=>path.join(base,name,'codex.exe')).filter(exists);
    dirs.sort((a,b)=>stat(b).mtimeMs-stat(a).mtimeMs);dirs.forEach(add);
  }
  try{const {stdout}=await execute(platform==='win32'?'where.exe':'which',['codex'],{windowsHide:true,timeout:5000});stdout.split(/\r?\n/).map(s=>s.trim()).forEach(add);}catch{}
  const unsupported=[];let failed=false;
  for(const file of candidates){try{const v=await execute(file,['--version'],{windowsHide:true,env:subscriptionEnv(env),timeout:12000});const version=v.stdout.trim();if(version===SUPPORTED_VERSION)return file;if(/^codex-cli\s+/.test(version))unsupported.push(version);}catch{failed=true;}}
  if(unsupported.length)throw new Error(`CLI version needs adapter review: ${unsupported.join(', ')}. Supported: ${SUPPORTED_VERSION}.`);
  throw new Error(failed?'Codex CLI chal nahin saka. Auto-detect dobara karein ya asli CLI select karein; desktop Codex.exe istemal nahin hoti.':'Asli Codex CLI nahin mili. Auto-detect karein ya CLI select karein. WindowsApps wali desktop Codex.exe coding CLI nahin hai.');
}
class Codex extends EventEmitter {
  constructor(deps={}) { super(); this.pending = new Map(); this.nextId = 0; this.proc = null; this.binary = ''; this.stderr = ''; this.spawnProcess=deps.spawnProcess||spawn;this.execute=deps.execute||exec;this.findBinary=deps.findBinary||findCodex; }
  connect(binary) {
    if(this.connecting)return this.connecting;
    this.connecting=this.connectOnce(binary).finally(()=>{this.connecting=null;});return this.connecting;
  }
  async connectOnce(binary) {
    if (this.proc) return;
    this.binary = await this.findBinary(binary);
    if(isDesktopLauncher(this.binary))throw new Error('Yeh Codex desktop launcher hai. Auto-detect se asli coding CLI connect karein.');
    let v;try{v=await this.execute(this.binary, ['--version'], { windowsHide: true, env: subscriptionEnv(process.env), timeout: 12000 });}catch{throw new Error('Codex CLI start nahin ho saka. Auto-detect se connection repair karein.');}
    this.version = v.stdout.trim();
    // This adapter is tested against this protocol family. Do not silently claim compatibility.
    if (this.version !== SUPPORTED_VERSION) throw new Error(`CLI version needs adapter review: ${this.version}. Supported: ${SUPPORTED_VERSION}.`);
    const args = ['-c', 'model_provider="openai"', '-c', 'approvals_reviewer="user"', '-c', 'analytics.enabled=false', 'app-server', '--listen', 'stdio://'];
    this.proc = this.spawnProcess(this.binary, args, { windowsHide: true, env: subscriptionEnv(process.env), stdio: ['pipe','pipe','pipe'], shell: false });
    const proc = this.proc;
    this.lines = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
    this.lines.on('line', line => {
      if (!line.trim()) return;
      if (line.length > 8 * 1024 * 1024) return this.emit('diagnostic', 'Provider event exceeded the size limit.');
      let msg; try { msg = JSON.parse(line); } catch { this.emit('diagnostic', 'An unreadable provider event was ignored.'); return; }
      if (msg.method) this.emit(msg.id !== undefined ? 'request' : 'notification', msg);
      else if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id); this.pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(redact(msg.error.message || 'Provider request failed.'))); else p.resolve(msg.result);
      }
    });
    proc.stderr.on('data', bytes => { this.stderr = (this.stderr + redact(bytes.toString())).slice(-8000); });
    proc.on('error', e => this.fail(e));
    proc.on('exit', (code, signal) => {
      if (this.proc !== proc) return;
      this.proc = null; this.fail(new Error(`Codex disconnected (${signal || code}). ${this.stderr.slice(-700)}`)); this.emit('disconnected');
    });
    try {
      await this.call('initialize', { clientInfo: { name: 'universal_ai_switcher', title: 'Universal AI Switcher', version: '0.4.0' } });
      this.send({ method: 'initialized', params: {} });
    } catch (e) { await this.close(); throw e; }
  }
  send(msg) { if (!this.proc?.stdin.writable) throw new Error('Codex is not connected.'); this.proc.stdin.write(JSON.stringify(msg) + '\n'); }
  call(method, params = {}, timeout = 30000) {
    return new Promise((resolve,reject) => {
      const requestId = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(`Codex ${method} timed out. The result may be uncertain.`)); }, timeout);
      this.pending.set(requestId,{ resolve,reject,timer });
      try { this.send({ id: requestId, method, params }); } catch(e) { clearTimeout(timer); this.pending.delete(requestId); reject(e); }
    });
  }
  reply(requestId, result) { this.send({ id: requestId, result }); }
  rejectRequest(requestId) { this.send({ id: requestId, error: { code: -32601, message: 'This client does not support this interaction.' } }); }
  fail(error) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear(); }
  async terminate() {
    const proc=this.proc;if(!proc)return;
    if(process.platform==='win32')await exec('taskkill.exe',['/PID',String(proc.pid),'/T','/F'],{windowsHide:true,timeout:15000});
    else proc.kill('SIGTERM');
  }
  async account() {
    const result = await this.call('account/read', { refreshToken: false });
    const acc = result.account;
    return { connected: acc?.type === 'chatgpt', mode: acc?.type || 'signed_out', plan: acc?.planType || null, account: acc?.email ? acc.email.replace(/^(.{1,2})[^@]*(@.*)$/,'$1***$2') : null, version: this.version, binary: this.binary };
  }
  async close() {
    const proc = this.proc; if (!proc) return; this.proc = null;
    this.fail(new Error('Connection closed.')); this.lines?.close(); proc.stdin.end();
    await new Promise(resolve => {
      const timer = setTimeout(() => { proc.kill(); resolve(); }, 2500);
      proc.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
module.exports = { Codex, findCodex, isDesktopLauncher, SUPPORTED_VERSION };
