'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const runFile = promisify(execFile);

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const BLOCKED = /(^|[/\\])(\.env(?:\..*)?|\.git|node_modules|\.ssh|\.aws|\.codex|dist|build|coverage|vendor|credentials[^/\\]*|secrets?[^/\\]*)([/\\]|$)|\.(pem|p12|pfx|key|keystore)$/i;
const SECRET = /(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["'][^"'\s]{12,}["'])/i;
function redact(value) {
  return String(value ?? '').replace(/sk-(?:proj-)?[\w-]{16,}/g, '[redacted key]')
    .replace(/(Bearer\s+)[\w.\-]+/gi, '$1[redacted]')
    .replace(/(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[redacted]');
}
function within(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep));
}
async function safeFile(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\0')) throw new Error('Invalid file path.');
  root = await fsp.realpath(root);
  const target = path.resolve(root, relative);
  if (!within(root, target) || BLOCKED.test(relative)) throw new Error('Protected file or path outside this project.');
  const real = await fsp.realpath(target);
  if (!within(root, real)) throw new Error('Linked file points outside this project.');
  if (!(await fsp.stat(real)).isFile()) throw new Error('Only regular files are supported.');
  return real;
}
async function git(root, args) {
  const { stdout } = await runFile('git', ['--no-optional-locks', '-C', root, ...args], { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 20000, encoding: 'utf8' });
  return stdout;
}
async function inspect(root) {
  root = await fsp.realpath(root);
  let branch = '', head = '', status = '', isGit = false;
  try {
    const gitRoot = (await git(root, ['rev-parse', '--show-toplevel'])).trim();
    if (path.normalize(await fsp.realpath(gitRoot)).toLowerCase() !== path.normalize(root).toLowerCase()) throw new Error('Open the repository root folder.');
    isGit = true;
    branch = (await git(root, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => 'detached')).trim();
    head = (await git(root, ['rev-parse', '--verify', 'HEAD']).catch(() => '')).trim();
    status = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  } catch (e) {
    if (e.message === 'Open the repository root folder.') throw e;
  }
  return { root, name: path.basename(root), branch, head, isGit, dirty: !!status, status };
}
async function files(root) {
  const list = (await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean);
  return [...new Set(list)].filter(p=>!p.replace(/\\/g,'/').startsWith('.universal-ai-switcher/')).sort();
}
async function fingerprint(root) {
  const entries = [];
  for (const relative of await files(root)) {
    if (BLOCKED.test(relative)) continue;
    try {
      const target = await safeFile(root, relative), stat = await fsp.stat(target);
      entries.push([relative, stat.size, stat.mtimeMs, stat.size <= 1024 * 1024 ? hash(await fsp.readFile(target)) : 'large']);
    } catch { entries.push([relative, 'missing-or-excluded']); }
  }
  return hash(JSON.stringify(entries));
}
async function changes(root) {
  const state = await inspect(root);
  if (!state.isGit) return { files: [], diff: '', branch: '', isGit: false };
  const raw = (await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).split('\0');
  const list = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]; if (!line) continue;
    const status = line.slice(0, 2), name = line.slice(3);
    if (/[RC]/.test(status)) i++;
    if(name.replace(/\\/g,'/').startsWith('.universal-ai-switcher/'))continue;
    list.push({ path: name, status: status.trim() || 'M', protected: BLOCKED.test(name) });
  }
  const args = ['diff', '--no-ext-diff', '--no-textconv', '--unified=3'];
  if (state.head) args.push('HEAD');
  args.push('--', ...list.filter(f => !f.protected && f.status !== '??').map(f => f.path));
  // Never use an empty pathspec, because that would include protected changes.
  let diff = args.at(-1) === '--' ? '' : await git(root, args).catch(() => 'Diff could not be read.');
  if (SECRET.test(diff)) diff = 'This diff contains a possible credential. View it in your trusted editor; it is excluded from this preview and handoff.';
  return { files: list, diff: redact(diff).slice(0, 180000), branch: state.branch, isGit: true, head: state.head };
}
async function snapshot(project, dataRoot) {
  const checkpointId = id(), dest = path.join(dataRoot, 'checkpoints', checkpointId);
  await fsp.mkdir(path.join(dest, 'files'), { recursive: true });
  const manifest = { id: checkpointId, projectId: project.id, createdAt: now(), head: '', files: [], excluded: [] };
  manifest.head = (await inspect(project.root)).head;
  let total = 0;
  for (const relative of await files(project.root)) {
    if (BLOCKED.test(relative)) { manifest.excluded.push({ path: relative, reason: 'Protected path' }); continue; }
    try {
      const src = await safeFile(project.root, relative), stat = await fsp.stat(src);
      if (stat.size > 1024 * 1024 || total + stat.size > 60 * 1024 * 1024 || manifest.files.length >= 5000) {
        manifest.excluded.push({ path: relative, reason: 'Snapshot size limit' }); continue;
      }
      const bytes = await fsp.readFile(src);
      if (SECRET.test(bytes.toString('utf8'))) { manifest.excluded.push({ path: relative, reason: 'Possible credential' }); continue; }
      const target = path.resolve(dest, 'files', relative);
      if (!within(path.join(dest, 'files'), target)) throw new Error('Invalid snapshot path');
      await fsp.mkdir(path.dirname(target), { recursive: true }); await fsp.writeFile(target, bytes);
      total += bytes.length; manifest.files.push({ path: relative, sha256: hash(bytes), bytes: bytes.length });
    } catch { manifest.excluded.push({ path: relative, reason: 'Missing, linked, or unreadable file' }); }
  }
  manifest.fingerprint = await fingerprint(project.root);
  await fsp.writeFile(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { ...manifest, directory: dest };
}
function makeHandoff(project, task, change, checkpoint) {
  const selected = change.files.filter(f => !f.protected).map(f => f.path);
  const text = [
    '# Project handoff', '', `Created: ${now()}`, `Project: ${project.name}`, `Project folder: ${project.root}`,
    `Branch: ${change.branch || 'unknown'}`, `Base commit: ${change.head || 'No commit yet'}`, '',
    '## Goal', task?.goal || 'Continue the current project. Ask the user for the next task.', '',
    '## Current status', task?.status || 'No task recorded', '',
    '## Latest result', redact(task?.answer || 'No verified completion yet. Inspect actual files before continuing.'), '',
    '## Changed files', ...selected.map(x => `- ${x}`), ...(selected.length ? [] : ['No visible non-protected changes.']), '',
    '## Tests', redact(task?.tests || 'No test result recorded. Run the project checks before calling the task complete.'), '',
    '## Safety and continuity',
    '- Work in the project folder above. Read the actual files and existing instructions first.',
    '- Preserve all existing user changes. A run may have stopped after making partial edits.',
    '- Do not repeat deployments, pushes, publications, messages, or other external side effects.',
    '- This packet does not transfer hidden reasoning or the previous provider session.',
    '- Ask before destructive operations or actions outside the project.',
    '- Update the user with completed work, remaining work, and actual test results.', '',
    '## Snapshot', checkpoint ? `${checkpoint.id} (${checkpoint.createdAt})` : 'No snapshot recorded.',
    'Snapshots exclude protected paths, possible credentials and oversized files. Review exclusions in the manifest.', '',
    '## Provider boundary',
    'Open the official Google Antigravity app yourself and provide this packet after reviewing it. This application does not automate Antigravity login or run its consumer CLI.', ''
  ].join('\n');
  return redact(text);
}
function classifyError(message) {
  const s = String(message).toLowerCase();
  if (/quota|rate.?limit|usage.?limit|credits? (?:exhausted|depleted)|insufficient_quota/.test(s)) return 'waiting_quota';
  if (/auth|unauthorized|sign.?in|token.*expired|401/.test(s)) return 'waiting_auth';
  return 'failed';
}
function subscriptionEnv(env) {
  const result = { ...env };
  for (const key of Object.keys(result)) if (/^(OPENAI|CODEX)_(API_KEY|BASE_URL|ACCESS_TOKEN|AUTH_TOKEN)$/i.test(key) || /^(ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_EXTRA_CA_CERTS)$/i.test(key)) delete result[key];
  return result;
}
function verifyBilling(info, usage, acknowledged) {
  if (!info?.connected || info.mode !== 'chatgpt') throw new Error('ChatGPT subscription sign-in is required. API-key and unknown authentication modes are blocked.');
  if (!acknowledged) throw new Error('Review the subscription and credit settings in Providers before running a task.');
  if (usage?.ordinaryUsageAllowed === false) throw new Error('Usage limit reached. Wait for the provider reset or prepare a manual handoff.');
  if (usage?.ordinaryUsageAllowed !== true) throw new Error('Included usage permission is unknown. Subscription-only run blocked; verify the connection again.');
  const buckets=Object.values(usage.rateLimitsByLimitId || { default:usage.rateLimits }).filter(Boolean);
  if (!buckets.length) throw new Error('Billing state is unknown. Run blocked.');
  for (const bucket of buckets) {
    if (bucket.rateLimitReachedType || bucket.spendControlReached === true) throw new Error('Usage limit reached. No paid fallback will be started.');
    if (!bucket.credits || typeof bucket.credits.hasCredits !== 'boolean') throw new Error('Credit state is unknown. Subscription-only run blocked.');
    if (bucket.credits.hasCredits || bucket.credits.unlimited) throw new Error('Extra or credit-based usage is available on this account. This build cannot enforce which balance is used, so subscription-only runs are blocked. Review your usage settings.');
  }
}
async function runChecks(root, kind, onOutput, onChild) {
  const pkgPath = await safeFile(root, 'package.json');
  const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf8'));
  if (!['test', 'lint', 'build', 'typecheck'].includes(kind) || !pkg.scripts?.[kind]) throw new Error(`This project has no ${kind} script in package.json.`);
  const npmScript = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  // Resolve npm's CLI file without passing project input to a shell.
  const candidates = [npmScript, path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js')];
  const cli = candidates.find(p => fs.existsSync(p));
  if (!cli) throw new Error('Node.js and npm are required to run project checks.');
  const node = process.env.SWITCHER_NODE || (process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : 'node');
  return await new Promise((resolve, reject) => {
    const proc = spawn(node, [cli, 'run', kind, '--ignore-scripts=false'], { cwd: root, env: subscriptionEnv(process.env), windowsHide: true, shell: false });
    onChild?.(proc); let output = '';
    const add = bytes => { const s = redact(bytes.toString()); output = (output + s).slice(-120000); onOutput?.(s); };
    proc.stdout.on('data', add); proc.stderr.on('data', add); proc.on('error', reject);
    const timeout = setTimeout(() => { proc.kill(); reject(new Error('Check exceeded the ten minute limit.')); }, 600000);
    proc.on('exit', (code, signal) => { clearTimeout(timeout); resolve({ code, signal, output, script: kind, at: now() }); });
  });
}
module.exports = { id, now, hash, within, safeFile, BLOCKED, SECRET, redact, git, inspect, files, changes, fingerprint, snapshot, makeHandoff, classifyError, subscriptionEnv, verifyBilling, runChecks };
