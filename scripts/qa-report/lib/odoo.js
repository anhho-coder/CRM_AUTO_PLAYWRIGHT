'use strict';
/**
 * Minimal Odoo 12 JSON-RPC client. Uses Node 18+ global fetch — no extra deps,
 * so it runs on the same NodeJS-20 Jenkins agent as the Playwright suite.
 *
 *   const c = new OdooClient(loadOdoo());
 *   await c.login();
 *   const rows = await c.searchRead('nakivo.kpi.database', [['name','=','Bugs - Valid reported']], { fields:['result_count'] });
 */

async function jsonRpc(baseUrl, params) {
  const url = baseUrl.replace(/\/+$/, '') + '/jsonrpc';
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params, id: 1 }),
    });
  } catch (e) {
    // Node/undici collapses EVERY transport failure into the useless message
    // "fetch failed" and hides the real reason in e.cause. Two Jenkins outages
    // (builds #105-#108 and #114) lost the Odoo sources for hours and the log never
    // said whether it was DNS, TLS, a refused connection or a timeout. Unwrap it —
    // on ONE line, so the existing "[collect] ... source failed" console greps match.
    const c = (e && e.cause) || null;
    const detail = c ? [c.code, c.syscall, c.hostname || c.host, c.errno, c.message]
      .filter(Boolean).join(' ') : '';
    throw new Error(`Odoo transport failure on POST ${url} — ${e.message || e}` +
      (detail ? ` (cause: ${detail})` : ' (no e.cause available)'));
  }
  if (!res.ok) throw new Error(`Odoo HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (data.error) {
    const d = data.error.data || {};
    throw new Error(`Odoo RPC error: ${d.message || data.error.message || 'unknown'}`);
  }
  return data.result;
}

class OdooClient {
  constructor(cfg) {
    this.cfg = cfg;
    this.uid = null;
    // prod uses a valid cert; preprod is self-signed -> allow opt-out for dev.
    if (cfg.verifySsl === false) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  async login() {
    this.uid = await jsonRpc(this.cfg.url, {
      service: 'common', method: 'login',
      args: [this.cfg.db, this.cfg.user, this.cfg.password],
    });
    if (!this.uid) {
      throw new Error(`Odoo login failed for "${this.cfg.user}" @ ${this.cfg.url} (db "${this.cfg.db}") ` +
        '— the server rejected the username/password. Verify the credential holds the PROD ' +
        '(portal.nakivo.com) password and the username is the full email.');
    }
    console.log(`[odoo] login OK as ${this.cfg.user} (uid ${this.uid}) @ ${this.cfg.url}`);
    return this.uid;
  }

  async execKw(model, method, args = [], kwargs = {}) {
    if (!this.uid) await this.login();
    return jsonRpc(this.cfg.url, {
      service: 'object', method: 'execute_kw',
      args: [this.cfg.db, this.uid, this.cfg.password, model, method, args, kwargs],
    });
  }

  /** search_read(domain, {fields, limit, offset, order}) */
  searchRead(model, domain = [], opts = {}) {
    return this.execKw(model, 'search_read', [domain], opts);
  }

  /** read_group(domain, fields, groupby, {lazy}) */
  readGroup(model, domain = [], fields = [], groupby = [], opts = { lazy: false }) {
    return this.execKw(model, 'read_group', [domain, fields, groupby], opts);
  }
}

module.exports = { OdooClient };
