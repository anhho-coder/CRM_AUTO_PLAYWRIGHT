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
    const res = await fetch(url, {
      method,
      headers: { Authorization: this.auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Jira HTTP ${res.status} ${res.statusText} on ${method} ${apiPath}` +
        (text ? ` — ${text.slice(0, 300)}` : ''));
    }
    return res.json();
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
