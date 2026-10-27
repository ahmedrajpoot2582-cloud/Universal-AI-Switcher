'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Service } = require('./service.cjs');

class Identity {
  constructor({ baseUrl, root, verify, createService } = {}) {
    if (!baseUrl || new URL(baseUrl).protocol !== 'https:') throw Error('Verified account service is not configured.');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.root = root;
    this.profiles = new Map();
    this.revocationFile = path.join(root, 'revoked-sessions.json');
    // Persist only token digests so logout also survives a helper restart.
    this.revoked = fs.existsSync(this.revocationFile) ? new Map(JSON.parse(fs.readFileSync(this.revocationFile, 'utf8'))) : new Map();
    this.verify = verify;
    this.createService = createService || (directory => new Service(directory, { legacyFile: null }));
  }
  async claims(token) {
    if (typeof token !== 'string' || token.length > 12000) throw Error('Login required.');
    let payload;
    if (this.verify) payload = await this.verify(token);
    else {
      const { jwtVerify, createRemoteJWKSet } = await import('jose');
      this.keys ||= createRemoteJWKSet(new URL(this.baseUrl + '/.well-known/jwks.json'), { timeoutDuration: 5000, cooldownDuration: 30000 });
      ({ payload } = await jwtVerify(token, this.keys, {
        issuer: new URL(this.baseUrl).origin, audience: new URL(this.baseUrl).origin,
        algorithms: ['EdDSA'], maxTokenAge: '16m', clockTolerance: 5,
        requiredClaims: ['sub', 'exp', 'iat', 'email', 'emailVerified']
      }));
    }
    if (!payload.sub || payload.emailVerified !== true || payload.banned === true || !payload.exp || payload.exp * 1000 <= Date.now()) {
      throw Error('Pehle apna email verify karke login karein.');
    }
    return payload;
  }
  async authorize(token) {
    const digest = typeof token === 'string' ? crypto.createHash('sha256').update(token).digest('hex') : '';
    for (const [id, until] of this.revoked) if (until <= Date.now()) this.revoked.delete(id);
    if (this.revoked.has(digest)) throw Error('Logged-out session. Dobara login karein.');
    const payload = await this.claims(token);
    const id = crypto.createHash('sha256').update(this.baseUrl + '|' + payload.sub).digest('hex');
    let profile = this.profiles.get(id);
    if (!profile) {
      const root = path.join(this.root, 'profiles', id);
      fs.mkdirSync(root, { recursive: true });
      const service = this.createService(root);
      // Cached preferences never prove that a provider is currently connected.
      service.library.connections = { codex: false, antigravity: false, mcp: false };
      profile = { id, service, until: 0, tokens: new Map(), user: { id: payload.sub, email: payload.email, name: payload.name || '' } };
      this.profiles.set(id, profile);
    }
    profile.until = Math.min(payload.exp * 1000, Date.now() + 15 * 60000);
    profile.tokens.set(digest, payload.exp * 1000);
    for (const [id, until] of profile.tokens) if (until <= Date.now()) profile.tokens.delete(id);
    profile.service.identityLease = () => profile.until > Date.now();
    return profile;
  }
  async logout(profile) {
    // Closing the tool connection does not sign out the official AI applications.
    profile.until = 0;
    for (const [digest, until] of profile.tokens) this.revoked.set(digest, until);
    profile.tokens.clear();
    fs.writeFileSync(this.revocationFile + '.tmp', JSON.stringify([...this.revoked]), { mode: 0o600 });
    fs.renameSync(this.revocationFile + '.tmp', this.revocationFile);
    await Promise.allSettled(['codex', 'antigravity', 'mcp'].map(p => profile.service.disconnect(p)));
    profile.service.mcp?.suspend();
  }
  async refresh() {
    for (const profile of this.profiles.values()) {
      if (profile.until > Date.now()) {
        if (!profile.service.active) await profile.service.refreshConnected();
      } else if (!profile.service.active && profile.until !== 0) {
        await this.logout(profile);
      }
    }
  }
  async close() { await Promise.allSettled([...this.profiles.values()].map(p => p.service.close())); }
}
module.exports = { Identity };
