/**
 * k6 SCALING load test - generic CREATE via Odoo JSON-RPC, Nakivo CRM PRE-PRODUCTION.
 *
 * Measures how creating a record scales with concurrent users. Each VU logs in ONCE, then
 * create()s a record via call_kw, timing only the create. Every record is named
 * K6PERF-<RUN_ID>-* and BULK-DELETED in teardown by an admin account (a sales user can create
 * but not unlink). Reuse for any create feature (opportunity, contact, ...) via MODEL + VALS_JSON.
 *
 * Env:
 *   MODEL       Odoo model, e.g. crm.lead | res.partner        (required)
 *   VALS_JSON   create-vals template; __NAME__ and __EMAIL__ are substituted per record.
 *               e.g. {"name":"__NAME__","type":"opportunity","email_from":"__EMAIL__"}
 *   LABEL       short label for the report                      (default MODEL)
 *   CREATE_AS   'user' (users.csv) | 'admin' (ADMIN_USER/PASS)  (default user)
 *   LEVELS/LOOPS/GAP_S/P95_MS/RUN_ID/BASE_URL/MAP_IP            (P95_MS default 20000)
 *   ADMIN_USER / ADMIN_PASS  admin creds for teardown cleanup   (from Jenkins credential)
 */
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate, Counter } from 'k6/metrics';
import exec from 'k6/execution';

const BASE_URL = (__ENV.BASE_URL || 'https://pre-production.nakivo.site').replace(/\/+$/, '');
const MAP_IP = __ENV.MAP_IP === undefined ? '10.220.222.100' : __ENV.MAP_IP;
const LEVELS = (__ENV.LEVELS || '10,30,50,100').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0);
const LOOPS = parseInt(__ENV.LOOPS || '1', 10);
const GAP_S = parseInt(__ENV.GAP_S || '30', 10);
const P95_MS = parseInt(__ENV.P95_MS || '20000', 10);
const RUN_ID = (__ENV.RUN_ID || 'local').replace(/[^A-Za-z0-9_-]/g, '');
const PREFIX = 'K6PERF-' + RUN_ID + '-';

const MODEL = __ENV.MODEL || 'crm.lead';
const VALS_TEMPLATE = __ENV.VALS_JSON || (__ENV.VALS_FILE ? open('./' + __ENV.VALS_FILE) : '{"name":"__NAME__"}');
const LABEL = __ENV.LABEL || MODEL;
const CREATE_AS = (__ENV.CREATE_AS || 'user').toLowerCase();

const hostFor = (u) => u.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
const hostsMap = {};
if (MAP_IP && hostFor(BASE_URL) !== MAP_IP) hostsMap[hostFor(BASE_URL)] = MAP_IP;

function parseCsv(raw) {
  return raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.toLowerCase().startsWith('email'))
    .map((l) => { const p = l.split(','); return { email: (p[0] || '').trim(), password: (p[1] || '').trim() }; })
    .filter((u) => u.email && u.password);
}
const creators = new SharedArray('creators', () => parseCsv(open('./users.csv')));
const admins = new SharedArray('admins', () => { try { return parseCsv(open('./admin.csv')); } catch (e) { return []; } });
function adminCreds() {
  if (__ENV.ADMIN_USER && __ENV.ADMIN_PASS) return { email: __ENV.ADMIN_USER, password: __ENV.ADMIN_PASS };
  return admins.length ? admins[0] : null;
}

const M = {};
LEVELS.forEach((n) => {
  M[n] = { dur: new Trend('rec_create_duration_' + n, true), succ: new Rate('rec_create_success_' + n), att: new Counter('rec_create_count_' + n) };
});

const scenarios = {};
const thresholds = { http_req_failed: ['rate<0.05'] };
LEVELS.forEach((n, i) => {
  scenarios['load_' + n] = {
    executor: 'per-vu-iterations', vus: n, iterations: LOOPS,
    startTime: i * GAP_S + 's', maxDuration: '90s', exec: 'doCreate', tags: { level: String(n) },
  };
  thresholds['rec_create_success_' + n] = ['rate>0.99'];
  thresholds['rec_create_duration_' + n] = ['p(95)<' + P95_MS];
});

export const options = {
  hosts: hostsMap, insecureSkipTLSVerify: true, scenarios: scenarios, thresholds: thresholds,
  teardownTimeout: '1200s',
};

function login(u) {
  const g = http.get(`${BASE_URL}/web/login`);
  let csrf = '';
  try { csrf = g.html().find('input[name=csrf_token]').first().attr('value') || ''; } catch (e) { csrf = ''; }
  const payload = { login: u.email, password: u.password, redirect: '' };
  if (csrf) payload.csrf_token = csrf;
  const r = http.post(`${BASE_URL}/web/login`, payload);
  return r.status === 200 && (r.body || '').indexOf("window.location = '/web") !== -1;
}
function callKw(model, method, args, kwargs, timeoutSec) {
  const params = { headers: { 'Content-Type': 'application/json' }, tags: { rpc: method } };
  if (timeoutSec) params.timeout = timeoutSec + 's';
  return http.post(`${BASE_URL}/web/dataset/call_kw`,
    JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs: kwargs || {} } }), params);
}
function buildVals(name, email) {
  return JSON.parse(VALS_TEMPLATE.split('__NAME__').join(name).split('__EMAIL__').join(email));
}

let loggedIn = false;
export function doCreate() {
  const n = parseInt(exec.scenario.name.split('_')[1], 10);
  const m = M[n];
  if (!loggedIn) {
    const who = CREATE_AS === 'admin' ? adminCreds() : creators[(exec.vu.idInTest - 1) % creators.length];
    loggedIn = who && login(who);
    if (!loggedIn) { m.succ.add(false); console.error(`LOGIN FAILED level=${n} vu=${exec.vu.idInTest}`); return; }
  }
  const vu = exec.vu.idInTest, it = exec.vu.iterationInInstance;
  const name = `${PREFIX}${n}-${vu}-${it}`;
  const email = `k6perf-${RUN_ID}-${n}-${vu}-${it}@loadtest-nakivo.invalid`;

  const res = callKw(MODEL, 'create', [buildVals(name, email)], { context: { lang: 'en_US', tz: 'UTC' } });
  const body = res.body || '';
  const ok = res.status === 200 && body.indexOf('"error"') === -1 && /"result":\s*\d+/.test(body);
  m.att.add(1); m.dur.add(res.timings.duration); m.succ.add(ok);
  check(res, { ['created @' + n]: () => ok });
  if (!ok) console.error(`CREATE FAILED level=${n} vu=${vu} status=${res.status} body=${body.substring(0, 180)}`);
}

// Cleanup: retry-loop unlink by name prefix as ADMIN (a sales user cannot unlink).
export function teardown() {
  const adm = adminCreds();
  if (!adm || !login(adm)) { console.error(`CLEANUP SKIPPED: no/failed admin login. Manually delete ${MODEL} name like '${PREFIX}%'.`); return; }
  let deleted = 0, rounds = 0;
  while (rounds < 120) {
    rounds++;
    const sr = callKw(MODEL, 'search', [[['name', '=like', PREFIX + '%']]], { limit: 8 }, 60);
    let ids = [];
    try { ids = JSON.parse(sr.body).result || []; } catch (e) { ids = []; }
    if (!ids.length) break;
    const ul = callKw(MODEL, 'unlink', [ids], {}, 180);
    const b = ul.body || '';
    if (b.indexOf('"result": true') !== -1 || b.indexOf('"result":true') !== -1) deleted += ids.length;
  }
  const fc = callKw(MODEL, 'search_count', [[['name', '=like', PREFIX + '%']]], {}, 60);
  let left = '?';
  try { left = JSON.parse(fc.body).result; } catch (e) { left = '?'; }
  console.log(`CLEANUP: deleted ~${deleted} ${MODEL} over ${rounds} rounds for RUN_ID=${RUN_ID}; remaining=${left}`);
}

export function handleSummary(data) {
  const m = data.metrics || {};
  const v = (name, key) => (m[name] && m[name].values && m[name].values[key] !== undefined ? m[name].values[key] : null);
  const num = (x, d = 0) => (x === null ? 'n/a' : Number(x).toFixed(d));
  const toMin = (ms) => (ms === null ? 'n/a' : (Number(ms) / 60000).toFixed(2));
  const thrOk = (name) => { const t = m[name] && m[name].thresholds; if (!t) return null; return Object.keys(t).every((k) => t[k].ok); };
  const rows = LEVELS.map((n) => ({
    n: n, att: v('rec_create_count_' + n, 'count'), succ: v('rec_create_success_' + n, 'rate'),
    avg: v('rec_create_duration_' + n, 'avg'), p90: v('rec_create_duration_' + n, 'p(90)'),
    p95: v('rec_create_duration_' + n, 'p(95)'), mx: v('rec_create_duration_' + n, 'max'),
    okS: thrOk('rec_create_success_' + n), okD: thrOk('rec_create_duration_' + n),
  }));
  const allPass = rows.every((r) => r.okS !== false && r.okD !== false);
  const badge = (ok) => (ok === null ? '<span class="b b-na">n/a</span>' : ok ? '<span class="b b-pass">PASS</span>' : '<span class="b b-fail">FAIL</span>');
  const cell = (ms) => `<td class="n">${num(ms)}<span class="mn">${toMin(ms)} min</span></td>`;
  const trs = rows.map((r) => {
    const sp = r.succ === null ? null : r.succ * 100;
    return `<tr><td class="n">${r.n}</td><td class="n">${num(r.att)}</td><td class="n">${num(sp, 2)}%</td>
      ${cell(r.avg)}${cell(r.p90)}${cell(r.p95)}${cell(r.mx)}<td>${badge(r.okS !== false && r.okD !== false)}</td></tr>`;
  }).join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>k6 Create Scaling Report - ${LABEL}</title>
<style>:root{color-scheme:light dark}body{font-family:Segoe UI,Arial,sans-serif;margin:24px;line-height:1.45;max-width:880px}
h1{font-size:20px;margin:0 0 4px}.sub{opacity:.7;font-size:13px;margin-bottom:16px}
.verdict{display:inline-block;padding:6px 14px;border-radius:6px;font-weight:700;margin-bottom:16px}
.v-pass{background:#137333;color:#fff}.v-fail{background:#a50e0e;color:#fff}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #8884;padding:7px 10px;text-align:left;font-size:14px}
th{background:#8881}td.n{font-variant-numeric:tabular-nums;text-align:right}th:nth-child(n+2){text-align:right}
.b{padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700}.b-pass{background:#137333;color:#fff}.b-fail{background:#a50e0e;color:#fff}.b-na{background:#8884}
.mn{display:block;font-size:11px;opacity:.55;font-weight:400}.cfg{margin-top:18px;font-size:13px;opacity:.85}code{background:#8882;padding:1px 5px;border-radius:3px}.note{font-size:12px;opacity:.7;margin-top:6px}</style></head><body>
<h1>k6 Create Scaling Report - ${LABEL}</h1>
<div class="sub">Concurrent ${MODEL} create() via JSON-RPC. Timed = the Save (create) only. Created records auto-deleted after the run.</div>
<div class="verdict ${allPass ? 'v-pass' : 'v-fail'}">${allPass ? 'ALL LEVELS PASSED' : 'SOME LEVELS FAILED'}</div>
<table><tr><th>Concurrent users</th><th>Created</th><th>Success</th><th>avg<br>(ms / min)</th><th>p90<br>(ms / min)</th><th>p95<br>(ms / min)</th><th>max<br>(ms / min)</th><th>Gate</th></tr>
${trs}</table>
<div class="note">Gate = create success &gt; 99% AND p95 &lt; ${P95_MS} ms. Latency = the create() RPC only (login done once per user, not counted). Records named <code>${PREFIX}*</code> bulk-deleted in teardown as admin.</div>
<div class="cfg"><b>Config:</b> LEVELS=<code>${LEVELS.join(', ')}</code> &middot; LOOPS=<code>${LOOPS}</code>/user &middot; gap=<code>${GAP_S}s</code> &middot; model=<code>${MODEL}</code> &middot; RUN_ID=<code>${RUN_ID}</code></div>
</body></html>`;

  let text = `\n=== k6 Create Scaling Report - ${LABEL} ===\nmodel=${MODEL} LEVELS=${LEVELS.join(',')} gap=${GAP_S}s RUN_ID=${RUN_ID}\nusers  created  success%   avg    p90    p95    max   gate\n`;
  rows.forEach((r) => {
    const sp = r.succ === null ? null : r.succ * 100;
    const gate = r.okS !== false && r.okD !== false ? 'PASS' : 'FAIL';
    text += String(r.n).padStart(5) + num(r.att).padStart(9) + (num(sp, 2) + '%').padStart(10) + num(r.avg).padStart(7) + num(r.p90).padStart(7) + num(r.p95).padStart(7) + num(r.mx).padStart(7) + '  ' + gate + '\n';
  });
  text += `Verdict: ${allPass ? 'ALL PASS' : 'SOME FAIL'}\n`;
  return { 'perf/k6/report/index.html': html, 'perf/k6/report/summary.json': JSON.stringify(data, null, 2), stdout: text };
}
