/*
 * Enrich crm-skips.json with each blocking bug's Jira status / assignee / last-updated.
 *
 * The Skipped-by-Suite card runs client-side and cannot reach Jira (CSP + no creds),
 * so we resolve the Jira metadata at BUILD time and bake it into crm-skips.json.
 *
 * Source of the metadata, in order:
 *   1. LIVE Jira REST (preferred) if a Personal Access Token is available:
 *        env JIRA_PAT            -> bearer token, or
 *        file JIRA_PAT_FILE      -> path to a file holding the token
 *                                   (default C:\allure\jira-pat.txt)
 *      Base URL: env JIRA_BASE_URL (default http://jira.nakivo.com).
 *   2. Committed CACHE ci/crm-skip-bug-meta.json (fallback when no token / Jira down).
 *   3. Nothing (columns render as "—").
 *
 * Writes back into <reportDir>/crm-skips.json:
 *   bugMeta[<KEY>] = { status, statusCategory, assignee, active, updated }
 *   bugMetaSource  = 'jira-live' | 'cache' | 'none'
 *   bugMetaAsOf    = ISO timestamp of the data
 *
 * Usage: node ci/allure-fetch-jira-meta.js <report-dir>   (default "allure-report")
 * Best-effort: never throws in a way that fails the build.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const reportDir = process.argv[2] || 'allure-report';
const skipsPath = path.join(reportDir, 'crm-skips.json');
const cachePath = path.join(__dirname, 'crm-skip-bug-meta.json');
const BASE = (process.env.JIRA_BASE_URL || 'http://jira.nakivo.com').replace(/\/+$/, '');

function log(m) { console.log('jira-meta: ' + m); }

function resolveToken() {
  if (process.env.JIRA_PAT && process.env.JIRA_PAT.trim()) return process.env.JIRA_PAT.trim();
  const f = process.env.JIRA_PAT_FILE || 'C:\\allure\\jira-pat.txt';
  try {
    if (fs.existsSync(f)) {
      const t = fs.readFileSync(f, 'utf8').trim();
      if (t) return t;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function postJson(url, token, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = Buffer.from(JSON.stringify(bodyObj), 'utf8');
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': body.length,
      },
      timeout: 15000,
    }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad JSON from Jira')); }
        } else {
          reject(new Error('Jira HTTP ' + res.statusCode + ' ' + data.slice(0, 200)));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Jira request timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function normFromIssue(issue) {
  const f = issue.fields || {};
  const st = f.status || {};
  const cat = st.statusCategory || {};
  const a = f.assignee;
  return {
    status: st.name || null,
    statusCategory: cat.key || null,   // 'new' | 'indeterminate' | 'done'
    assignee: a ? (a.displayName || a.name) : 'Unassigned',
    active: a ? !!a.active : null,
    updated: f.updated || null,
  };
}

async function fromJira(keys, token) {
  const jql = 'key in (' + keys.join(',') + ')';
  const res = await postJson(BASE + '/rest/api/2/search', token, {
    jql, fields: ['status', 'assignee', 'updated'], maxResults: keys.length,
  });
  const meta = {};
  (res.issues || []).forEach(i => { meta[i.key] = normFromIssue(i); });
  return meta;
}

function fromCache(keys) {
  try {
    if (!fs.existsSync(cachePath)) return null;
    const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const bugs = c.bugs || {};
    const meta = {};
    keys.forEach(k => { if (bugs[k]) meta[k] = bugs[k]; });
    return { meta, asOf: c.asOf || null };
  } catch (e) { return null; }
}

(async () => {
  let skips;
  try { skips = JSON.parse(fs.readFileSync(skipsPath, 'utf8')); }
  catch (e) { log('no crm-skips.json (' + skipsPath + '); skipping.'); process.exit(0); }

  const keys = skips.bugKeys || [];
  if (!keys.length) { log('no bug keys to resolve.'); process.exit(0); }

  let meta = null, source = 'none', asOf = null;
  const token = resolveToken();

  if (token) {
    try {
      meta = await fromJira(keys, token);
      source = 'jira-live';
      asOf = new Date().toISOString();
      log('fetched ' + Object.keys(meta).length + '/' + keys.length + ' bug(s) LIVE from Jira.');
    } catch (e) {
      log('LIVE fetch failed (' + e.message + '); falling back to cache.');
    }
  } else {
    log('no Jira token (env JIRA_PAT / file C:\\allure\\jira-pat.txt); using cache.');
  }

  if (!meta || !Object.keys(meta).length) {
    const c = fromCache(keys);
    if (c && Object.keys(c.meta).length) {
      meta = c.meta; source = 'cache'; asOf = c.asOf;
      log('using cached bug meta (' + Object.keys(meta).length + '/' + keys.length + ', as of ' + asOf + ').');
    }
  }

  skips.bugMeta = meta || {};
  skips.bugMetaSource = source;
  skips.bugMetaAsOf = asOf;
  try {
    fs.writeFileSync(skipsPath, JSON.stringify(skips, null, 2));
    log('wrote bugMeta (source=' + source + ') into ' + skipsPath + '.');
  } catch (e) {
    log('failed to write crm-skips.json (' + e.message + ').');
  }
  process.exit(0);
})().catch(e => { log('unexpected error: ' + e.message); process.exit(0); });
