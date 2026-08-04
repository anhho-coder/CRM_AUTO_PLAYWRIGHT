/**
 * k6 SCALING load test - CREATE LEAD via Odoo JSON-RPC, Nakivo CRM PRE-PRODUCTION.
 *
 * Measures how the crm.lead create() operation scales with concurrent users. Runs bursts
 * at increasing concurrency (default 10,30,50,100): each level, N virtual users each log in
 * ONCE and then create a lead via POST /web/dataset/call_kw (create on crm.lead), timing only
 * the create RPC. All created leads are named  K6PERF-<RUN_ID>-<level>-<vu>-<iter>  and are
 * BULK-DELETED in teardown() by an admin account (a sales user can create but NOT unlink).
 *
 * WHY split accounts: verified on pre-prod - Thomas (sales IC) create() = OK, unlink() = AccessError.
 * So VUs create as the users.csv account (realistic sales user); teardown cleans as admin.csv.
 *
 * Env:
 *   LEVELS   concurrency levels                (default "10,30,50,100")
 *   LOOPS    leads per VU per level            (default 1)
 *   GAP_S    seconds between bursts            (default 30)
 *   RUN_ID   unique tag for this run's leads   (default "local"; Jenkins passes j<build#>)
 *   BASE_URL / MAP_IP                          (default https://pre-production.nakivo.site / 10.220.222.100)
 *   P95_MS   per-level create p95 gate ms      (default 4000)
 *
 * Run locally (VPN required):  k6 run -e RUN_ID=local1 perf/k6/create-lead-scale.js
 */
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate, Counter } from 'k6/metrics';
import exec from 'k6/execution';

// ---- Config ----
const BASE_URL = (__ENV.BASE_URL || 'https://pre-production.nakivo.site').replace(/\/+$/, '');
const MAP_IP = __ENV.MAP_IP === undefined ? '10.220.222.100' : __ENV.MAP_IP;
const LEVELS = (__ENV.LEVELS || '10,30,50,100')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => n > 0);
const LOOPS = parseInt(__ENV.LOOPS || '1', 10);
const GAP_S = parseInt(__ENV.GAP_S || '30', 10);
const P95_MS = parseInt(__ENV.P95_MS || '4000', 10);
const RUN_ID = (__ENV.RUN_ID || 'local').replace(/[^A-Za-z0-9_-]/g, '');
const PREFIX = 'K6PERF-' + RUN_ID + '-';

const hostFor = (u) => u.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
const hostsMap = {};
if (MAP_IP && hostFor(BASE_URL) !== MAP_IP) hostsMap[hostFor(BASE_URL)] = MAP_IP;

function parseCsv(raw) {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.toLowerCase().startsWith('email'))
    .map((l) => {
      const p = l.split(',');
      return { email: (p[0] || '').trim(), password: (p[1] || '').trim() };
    })
    .filter((u) => u.email && u.password);
}
const creators = new SharedArray('creators', () => parseCsv(open('./users.csv'))); // sales users (create)
// Admin creds for cleanup: prefer env (Jenkins credential 'crm-admin-preprod'); else a local,
// git-ignored admin.csv for local runs. open() is guarded so a missing file does not crash init.
const admins = new SharedArray('admins', () => {
  try {
    return parseCsv(open('./admin.csv'));
  } catch (e) {
    return [];
  }
});
function adminCreds() {
  if (__ENV.ADMIN_USER && __ENV.ADMIN_PASS) return { email: __ENV.ADMIN_USER, password: __ENV.ADMIN_PASS };
  return admins.length ? admins[0] : null;
}

// ---- Per-level metrics ----
const M = {};
LEVELS.forEach((n) => {
  M[n] = {
    dur: new Trend('lead_create_duration_' + n, true),
    succ: new Rate('lead_create_success_' + n),
    att: new Counter('lead_create_count_' + n),
  };
});

// ---- Scenarios + thresholds ----
const scenarios = {};
const thresholds = { http_req_failed: ['rate<0.05'] };
LEVELS.forEach((n, i) => {
  scenarios['load_' + n] = {
    executor: 'per-vu-iterations',
    vus: n,
    iterations: LOOPS,
    startTime: i * GAP_S + 's',
    maxDuration: '90s',
    exec: 'doCreate',
    tags: { level: String(n) },
  };
  thresholds['lead_create_success_' + n] = ['rate>0.99'];
  thresholds['lead_create_duration_' + n] = ['p(95)<' + P95_MS];
});

export const options = {
  hosts: hostsMap,
  insecureSkipTLSVerify: true,
  scenarios: scenarios,
  thresholds: thresholds,
  // Deleting many crm.lead on this Odoo is slow (~1-2s each) - give teardown room and
  // unlink in small batches (see teardown) so cleanup never times out and leaves orphans.
  teardownTimeout: '600s',
};

// ---- helpers ----
function login(u) {
  const g = http.get(`${BASE_URL}/web/login`);
  let csrf = '';
  try {
    csrf = g.html().find('input[name=csrf_token]').first().attr('value') || '';
  } catch (e) {
    csrf = '';
  }
  const payload = { login: u.email, password: u.password, redirect: '' };
  if (csrf) payload.csrf_token = csrf;
  const r = http.post(`${BASE_URL}/web/login`, payload);
  return r.status === 200 && (r.body || '').indexOf("window.location = '/web") !== -1;
}

function callKw(model, method, args, kwargs) {
  return http.post(
    `${BASE_URL}/web/dataset/call_kw`,
    JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs: kwargs || {} } }),
    { headers: { 'Content-Type': 'application/json' }, tags: { rpc: method } }
  );
}

// Per-VU login guard (each VU has its own JS runtime -> this is per-VU).
let loggedIn = false;

export function doCreate() {
  const n = parseInt(exec.scenario.name.split('_')[1], 10);
  const m = M[n];
  if (!loggedIn) {
    loggedIn = login(creators[(exec.vu.idInTest - 1) % creators.length]);
    if (!loggedIn) {
      m.succ.add(false);
      console.error(`LOGIN FAILED (creator) level=${n} vu=${exec.vu.idInTest}`);
      return;
    }
  }
  const vu = exec.vu.idInTest;
  const it = exec.vu.iterationInInstance;
  const name = `${PREFIX}${n}-${vu}-${it}`;
  const email = `k6perf-${RUN_ID}-${n}-${vu}-${it}@loadtest-nakivo.invalid`;

  const res = callKw(
    'crm.lead',
    'create',
    [{ name: name, contact_name: `K6 Perf ${vu}`, email_from: email, type: 'lead' }],
    { context: { lang: 'en_US', tz: 'UTC' } }
  );

  const body = res.body || '';
  const ok = res.status === 200 && body.indexOf('"error"') === -1 && /"result":\s*\d+/.test(body);
  m.att.add(1);
  m.dur.add(res.timings.duration);
  m.succ.add(ok);
  check(res, { ['lead created @' + n]: () => ok });
  if (!ok) {
    console.error(`CREATE FAILED level=${n} vu=${vu} status=${res.status} body=${body.substring(0, 180)}`);
  }
}

// ---- Cleanup: delete every lead this run created, as ADMIN (sales user cannot unlink) ----
export function teardown() {
  const adm = adminCreds();
  if (!adm || !login(adm)) {
    console.error(`CLEANUP SKIPPED: no/failed admin login. Manually delete leads name like '${PREFIX}%'.`);
    return;
  }
  const sr = callKw('crm.lead', 'search', [[['name', '=like', PREFIX + '%']]], {});
  let ids = [];
  try {
    ids = JSON.parse(sr.body).result || [];
  } catch (e) {
    ids = [];
  }
  if (!ids.length) {
    console.log(`CLEANUP: no leads found for prefix ${PREFIX}`);
    return;
  }
  // Delete in small batches (8) - one big unlink of ~190 leads exceeds the timeout.
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 8) {
    const chunk = ids.slice(i, i + 8);
    const ul = callKw('crm.lead', 'unlink', [chunk], {});
    const body = ul.body || '';
    if (body.indexOf('"result": true') !== -1 || body.indexOf('"result":true') !== -1) {
      deleted += chunk.length;
    } else {
      console.error(`CLEANUP batch@${i} failed: ${body.substring(0, 150)}`);
    }
  }
  console.log(`CLEANUP: deleted ${deleted}/${ids.length} leads for RUN_ID=${RUN_ID}`);
}

// ---- Comparison report ----
export function handleSummary(data) {
  const m = data.metrics || {};
  const v = (name, key) =>
    m[name] && m[name].values && m[name].values[key] !== undefined ? m[name].values[key] : null;
  const num = (x, d = 0) => (x === null ? 'n/a' : Number(x).toFixed(d));
  const toMin = (ms) => (ms === null || ms === undefined ? 'n/a' : (Number(ms) / 60000).toFixed(2));
  const thrOk = (name) => {
    const t = m[name] && m[name].thresholds;
    if (!t) return null;
    return Object.keys(t).every((k) => t[k].ok);
  };

  const rows = LEVELS.map((n) => ({
    n: n,
    att: v('lead_create_count_' + n, 'count'),
    succ: v('lead_create_success_' + n, 'rate'),
    avg: v('lead_create_duration_' + n, 'avg'),
    p90: v('lead_create_duration_' + n, 'p(90)'),
    p95: v('lead_create_duration_' + n, 'p(95)'),
    mx: v('lead_create_duration_' + n, 'max'),
    okS: thrOk('lead_create_success_' + n),
    okD: thrOk('lead_create_duration_' + n),
  }));
  const allPass = rows.every((r) => r.okS !== false && r.okD !== false);
  const maxP95 = Math.max(1, ...rows.map((r) => r.p95 || 0));

  const badge = (ok) =>
    ok === null ? '<span class="b b-na">n/a</span>' : ok ? '<span class="b b-pass">PASS</span>' : '<span class="b b-fail">FAIL</span>';

  const cell = (ms) => `<td class="n">${num(ms)}<span class="mn">${toMin(ms)} min</span></td>`;
  const cellB = (ms) => `<td class="n"><b>${num(ms)}</b><span class="mn">${toMin(ms)} min</span></td>`;
  const trs = rows
    .map((r) => {
      const sp = r.succ === null ? null : r.succ * 100;
      return `<tr><td class="n">${r.n}</td><td class="n">${num(r.att)}</td><td class="n">${num(sp, 2)}%</td>
      ${cell(r.avg)}${cell(r.p90)}${cellB(r.p95)}${cell(r.mx)}
      <td>${badge(r.okS !== false && r.okD !== false)}</td></tr>`;
    })
    .join('\n');

  const bars = rows
    .map((r) => {
      const w = Math.round(((r.p95 || 0) / maxP95) * 100);
      return `<div class="barrow"><div class="barlbl">${r.n} users</div>
      <div class="bartrack"><div class="bar" style="width:${w}%"></div></div>
      <div class="barval">${num(r.p95)} ms &middot; ${toMin(r.p95)} min</div></div>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>k6 Create-Lead Scaling Report - Pre-Production</title>
<style>
  :root{color-scheme:light dark}
  body{font-family:Segoe UI,Arial,sans-serif;margin:24px;line-height:1.45;max-width:900px}
  h1{font-size:21px;margin:0 0 4px}.sub{opacity:.7;font-size:13px;margin-bottom:16px}
  .verdict{display:inline-block;padding:6px 14px;border-radius:6px;font-weight:700;margin-bottom:18px}
  .v-pass{background:#137333;color:#fff}.v-fail{background:#a50e0e;color:#fff}
  h2{font-size:15px;margin:22px 0 8px}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #8884;padding:7px 10px;text-align:left;font-size:14px}
  th{background:#8881}td.n{font-variant-numeric:tabular-nums;text-align:right}
  th:nth-child(n+2){text-align:right}
  .b{padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700}
  .b-pass{background:#137333;color:#fff}.b-fail{background:#a50e0e;color:#fff}.b-na{background:#8884}
  .barrow{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px}
  .barlbl{width:80px;text-align:right;opacity:.85}
  .bartrack{flex:1;background:#8882;border-radius:4px;height:18px;overflow:hidden}
  .bar{height:100%;background:linear-gradient(90deg,#2a7ade,#1a56b0)}
  .barval{width:160px;font-variant-numeric:tabular-nums}
  .mn{display:block;font-size:11px;opacity:.55;font-weight:400}
  .cfg{margin-top:20px;font-size:13px;opacity:.85}code{background:#8882;padding:1px 5px;border-radius:3px}
  .note{font-size:12px;opacity:.7;margin-top:6px}
</style></head><body>
  <h1>k6 Create-Lead Scaling Report - Nakivo CRM Pre-Production</h1>
  <div class="sub">Concurrent crm.lead create() via JSON-RPC (server-side ORM). Created leads are auto-deleted after the run.</div>
  <div class="verdict ${allPass ? 'v-pass' : 'v-fail'}">${allPass ? 'ALL LEVELS PASSED' : 'SOME LEVELS FAILED'}</div>

  <h2>Create-lead performance by concurrent users</h2>
  <table>
    <tr><th>Concurrent users</th><th>Leads created</th><th>Success</th><th>avg<br>(ms / min)</th><th>p90<br>(ms / min)</th><th>p95<br>(ms / min)</th><th>max<br>(ms / min)</th><th>Gate</th></tr>
    ${trs}
  </table>
  <div class="note">Gate = create success &gt; 99% AND p95 &lt; ${P95_MS} ms at that level. Latency = the create() RPC only (login done once per user, not counted). Each latency cell shows milliseconds with the minute equivalent below.</div>

  <h2>Create latency (p95) by concurrency</h2>
  ${bars}

  <div class="cfg">
    <b>Config:</b> LEVELS=<code>${LEVELS.join(', ')}</code> &middot; LOOPS=<code>${LOOPS}</code>/user &middot;
    gap=<code>${GAP_S}s</code> &middot; RUN_ID=<code>${RUN_ID}</code> &middot; BASE_URL=<code>${BASE_URL}</code>
    <div class="note">Bursts run sequentially. Leads named <code>${PREFIX}*</code> bulk-deleted in teardown as admin (see console for deleted count). Async Sales-Team/Salesperson assignment cron runs later and is NOT part of this measurement.</div>
  </div>
</body></html>`;

  let text = '\n=== k6 Create-Lead Scaling Report ===\n';
  text += `LEVELS=${LEVELS.join(',')} LOOPS=${LOOPS} gap=${GAP_S}s RUN_ID=${RUN_ID}\n`;
  text += 'users  created  success%   avg    p90    p95    max   gate\n';
  rows.forEach((r) => {
    const sp = r.succ === null ? null : r.succ * 100;
    const gate = r.okS !== false && r.okD !== false ? 'PASS' : 'FAIL';
    text +=
      String(r.n).padStart(5) + num(r.att).padStart(9) + (num(sp, 2) + '%').padStart(10) +
      num(r.avg).padStart(7) + num(r.p90).padStart(7) + num(r.p95).padStart(7) + num(r.mx).padStart(7) + '  ' + gate + '\n';
  });
  text += `Verdict: ${allPass ? 'ALL PASS' : 'SOME FAIL'}\n`;

  return {
    'perf/k6/report/index.html': html,
    'perf/k6/report/summary.json': JSON.stringify(data, null, 2),
    stdout: text,
  };
}
