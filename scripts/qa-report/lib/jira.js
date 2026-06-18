'use strict';
/**
 * Minimal Jira (Server/DC 9.x) REST client. Uses Node 18+ global fetch — no
 * extra deps, so it runs on the same NodeJS-20 Jenkins agent as the Playwright
 * suite and the Odoo collector.
 *
 *   const c = new JiraClient(loadJira());
 *   const issues = await c.searchAll('worklogAuthor in (anh.ho) AND worklogDate >= "2026-01-01"', ['labels']);
 *   const logs   = await c.issueWorklogs('CRM-8322', Date.parse('2026-01-01'));
 *
 * Worklogs are read per issue (scoped to the issues the team actually logged on,
 * with `startedAfter` to bound the window) rather than via the instance-wide
 * /worklog/updated feed, so traffic is proportional to this team's activity and
 * stays predictable on a shared Jira.
 */

/** Run async `fn` over `items` with at most `limit` in flight; preserves order. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Exponential backoff with a little jitter, capped at 30s.
const backoffMs = (attempt) => Math.min(30000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);

class JiraClient {
  constructor(cfg) {
    this.base = String(cfg.url || '').replace(/\/+$/, '');
    if (cfg.token) {
      this.auth = `Bearer ${cfg.token}`;
    } else if (cfg.user && cfg.password) {
      this.auth = 'Basic ' + Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64');
    } else {
      throw new Error('JiraClient: need a token or user/password.');
    }
  }

  async _req(method, apiPath, { query, body } = {}) {
    let url = this.base + apiPath;
    if (query) {
      const qs = new URLSearchParams(query).toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    const init = {
      method,
      headers: { Authorization: this.auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    };
    // The per-day count metrics fire 1000+ requests/build at concurrency 8 against a
    // SHARED Jira DC, so transient 429/503/timeout become likely; left unhandled, one
    // rejection bubbles through mapLimit -> Promise.all and drops the whole metric.
    // Retry the retryable ones with backoff (honouring Retry-After) and bound each
    // attempt with a timeout. Non-retryable HTTP (e.g. 400/401/404) throws at once.
    const MAX_RETRIES = 4, TIMEOUT_MS = 45000;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (e) { // network error / timeout abort
        if (attempt >= MAX_RETRIES) {
          throw new Error(`Jira request failed on ${method} ${apiPath} after ${attempt + 1} tries — ${e.message || e}`);
        }
        await sleep(backoffMs(attempt));
        continue;
      }
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
      if (retryable && attempt < MAX_RETRIES) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 30000) : backoffMs(attempt));
        continue;
      }
      const text = await res.text().catch(() => '');
      throw new Error(`Jira HTTP ${res.status} ${res.statusText} on ${method} ${apiPath}` +
        (text ? ` — ${text.slice(0, 300)}` : ''));
    }
  }

  /** Run a JQL search, following pagination until every issue is collected. */
  async searchAll(jql, fields = [], pageSize = 100) {
    const out = [];
    let startAt = 0;
    for (;;) {
      const page = await this._req('POST', '/rest/api/2/search', {
        body: { jql, fields, startAt, maxResults: pageSize },
      });
      out.push(...(page.issues || []));
      startAt += page.issues ? page.issues.length : 0;
      if (!page.issues || !page.issues.length || startAt >= page.total) break;
    }
    return out;
  }

  /** Total number of issues matching `jql` — a cheap maxResults=0 search. */
  async count(jql) {
    const page = await this._req('POST', '/rest/api/2/search', {
      body: { jql, fields: [], startAt: 0, maxResults: 0 },
    });
    return page.total || 0;
  }

  /** All worklogs on one issue with `started` at/after `startedAfterMs` (epoch ms). */
  async issueWorklogs(issueKey, startedAfterMs) {
    const out = [];
    let startAt = 0;
    for (;;) {
      const page = await this._req('GET', `/rest/api/2/issue/${encodeURIComponent(issueKey)}/worklog`, {
        query: { startedAfter: Math.floor(startedAfterMs), startAt, maxResults: 1000 },
      });
      out.push(...(page.worklogs || []));
      startAt += page.worklogs ? page.worklogs.length : 0;
      if (!page.worklogs || !page.worklogs.length || startAt >= page.total) break;
    }
    return out;
  }
}

module.exports = { JiraClient, mapLimit };
