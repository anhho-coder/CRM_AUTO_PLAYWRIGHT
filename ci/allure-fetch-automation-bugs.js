/*
 * Fetch the list of bugs found by the automation tests and write it for the
 * "Bugs found by automation test" Allure Overview card.
 *
 * The set of bugs is a Jira query (NOT derived from sources): CRM bugs labelled
 * QA-CRM_Automation. Resolved at BUILD time (the card is client-side and cannot
 * reach Jira) and written to <reportDir>/crm-automation-bugs.json.
 *
 * Data source, in order:
 *   1. LIVE Jira REST if a token is available (env JIRA_PAT or file
 *      C:\allure\jira-pat.txt; base env JIRA_BASE_URL, default jira.nakivo.com).
 *      JQL from env AUTOMATION_BUGS_JQL or the default below.
 *   2. Committed cache ci/crm-automation-bugs-cache.json (fallback).
 *
 * Output shape:
 *   { asOf, source:'jira-live'|'cache', jiraBase, jql, total,
 *     bugs:[{ key, summary, status, statusCategory, assignee, active, updated }] }
 *
 * Usage: node ci/allure-fetch-automation-bugs.js <report-dir>  (default "allure-report")
 * Best-effort: never fails the build.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const reportDir = process.argv[2] || 'allure-report';
const outPath = path.join(reportDir, 'crm-automation-bugs.json');
const cachePath = path.join(__dirname, 'crm-automation-bugs-cache.json');
const BASE = (process.env.JIRA_BASE_URL || 'http://jira.nakivo.com').replace(/\/+$/, '');
const JIRA_BROWSE = BASE + '/browse/';
const JQL = process.env.AUTOMATION_BUGS_JQL ||
  'project = CRM AND issuetype in ("Bug","Bug [Maintenance]") AND labels = QA-CRM_Automation ORDER BY updated DESC';

function log(m) { console.log('automation-bugs: ' + m); }

function resolveToken() {
  if (process.env.JIRA_PAT && process.env.JIRA_PAT.trim()) return process.env.JIRA_PAT.trim();
  const f = process.env.JIRA_PAT_FILE || 'C:\\allure\\jira-pat.txt';
  try { if (fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8').trim(); if (t) return t; } } catch (e) {}
  return null;
}

function postJson(url, token, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = Buffer.from(JSON.stringify(bodyObj), 'utf8');
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'POST', hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
        'Accept': 'application/json', 'Content-Length': body.length,
      },
      timeout: 20000,
    }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad JSON from Jira')); }
        } else reject(new Error('Jira HTTP ' + res.statusCode + ' ' + data.slice(0, 200)));
      });
    });
    req.on('timeout', () => req.destroy(new Error('Jira request timed out')));
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function normIssue(issue) {
  const f = issue.fields || {};
  const st = f.status || {};
  const cat = st.statusCategory || {};
  const a = f.assignee;
  return {
    key: issue.key,
    summary: f.summary || '',
    status: st.name || null,
    statusCategory: cat.key || null,     // 'new' | 'indeterminate' | 'done'
    assignee: a ? (a.displayName || a.name) : 'Unassigned',
    active: a ? !!a.active : null,
    updated: f.updated || null,
  };
}

async function fromJira(token) {
  const bugs = [];
  let startAt = 0;
  for (let page = 0; page < 20; page++) {           // hard cap: 20 pages
    const res = await postJson(BASE + '/rest/api/2/search', token, {
      jql: JQL, fields: ['summary', 'status', 'assignee', 'updated'], startAt, maxResults: 100,
    });
    (res.issues || []).forEach(i => bugs.push(normIssue(i)));
    const total = res.total || bugs.length;
    startAt += (res.issues || []).length;
    if (startAt >= total || !(res.issues || []).length) break;
  }
  return bugs;
}

(async () => {
  let bugs = null, source = 'cache', asOf = null;
  const token = resolveToken();

  if (token) {
    try {
      bugs = await fromJira(token);
      source = 'jira-live';
      asOf = new Date().toISOString();
      log('fetched ' + bugs.length + ' bug(s) LIVE from Jira.');
    } catch (e) {
      log('LIVE fetch failed (' + e.message + '); falling back to cache.');
      bugs = null;
    }
  } else {
    log('no Jira token (env JIRA_PAT / file C:\\allure\\jira-pat.txt); using cache.');
  }

  if (!bugs) {
    try {
      const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      bugs = c.bugs || [];
      asOf = c.asOf || null;
      source = 'cache';
      log('using cached automation-bugs (' + bugs.length + ', as of ' + asOf + ').');
    } catch (e) {
      log('no cache available (' + e.message + '); writing empty list.');
      bugs = []; source = 'none';
    }
  }

  const out = { asOf, source, jiraBase: JIRA_BROWSE, jql: JQL, total: bugs.length, bugs };
  try {
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    log('wrote ' + bugs.length + ' bug(s) (source=' + source + ') -> ' + outPath);
  } catch (e) {
    log('failed to write crm-automation-bugs.json (' + e.message + ').');
  }
  process.exit(0);
})().catch(e => { log('unexpected error: ' + e.message); process.exit(0); });
