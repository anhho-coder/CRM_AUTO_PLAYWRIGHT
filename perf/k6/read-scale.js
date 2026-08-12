/**
 * k6 SCALING load test - generic READ via Odoo JSON-RPC, Nakivo CRM PRE-PRODUCTION.
 *
 * Measures how a read RPC (e.g. loading the leads list / pipeline, or a report read_group)
 * scales with concurrent users. Each VU logs in ONCE, then repeatedly calls one read RPC,
 * timing only that call. READ-ONLY: writes no data, needs no cleanup, no admin credential.
 * Reuse for any read feature by passing MODEL / METHOD / ARGS_JSON / KWARGS_JSON.
 *
 * Env:
 *   MODEL       Odoo model, e.g. crm.lead                 (required)
 *   METHOD      read method, e.g. search_read | read_group (default search_read)
 *   ARGS_JSON   JSON array of positional args              (default [[]])
 *   KWARGS_JSON JSON object of kwargs                      (default {"limit":80})
 *   LABEL       short label for the report title           (default MODEL.METHOD)
 *   LEVELS/LOOPS/GAP_S/P95_MS/BASE_URL/MAP_IP              (see below; P95_MS default 3000)
 *
 * Users come from ./users.csv (any account that can read the model). Login is not counted.
 * Grafana: the Jenkinsfile tags http_req_duration with testid=<feature> + build + level.
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
const GAP_S = parseInt(__ENV.GAP_S || '20', 10);
const P95_MS = parseInt(__ENV.P95_MS || '3000', 10);

// Read config: prefer a committed JSON file (READ_CONFIG = {model, method, args, kwargs, label}) so
// the field list never has to pass through a Windows bat command line. Else use individual env vars.
// NOTE: always pass an explicit field list in args - a fields-less search_read reads ALL fields,
// which is slow and can raise an Odoo ValueError on a broken computed field.
const RCFG = __ENV.READ_CONFIG ? JSON.parse(open('./' + __ENV.READ_CONFIG)) : {};
const MODEL = __ENV.MODEL || RCFG.model || 'crm.lead';
const METHOD = __ENV.METHOD || RCFG.method || 'search_read';
const ARGS = __ENV.ARGS_JSON ? JSON.parse(__ENV.ARGS_JSON) : RCFG.args || [[]];
const KWARGS = __ENV.KWARGS_JSON ? JSON.parse(__ENV.KWARGS_JSON) : RCFG.kwargs || { limit: 80 };
const LABEL = __ENV.LABEL || RCFG.label || MODEL + '.' + METHOD;

const hostFor = (u) => u.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
const hostsMap = {};
if (MAP_IP && hostFor(BASE_URL) !== MAP_IP) hostsMap[hostFor(BASE_URL)] = MAP_IP;

function parseCsv(raw) {
  return raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.toLowerCase().startsWith('email'))
    .map((l) => { const p = l.split(','); return { email: (p[0] || '').trim(), password: (p[1] || '').trim() }; })
    .filter((u) => u.email && u.password);
}
const users = new SharedArray('users', () => parseCsv(open('./users.csv')));

const M = {};
LEVELS.forEach((n) => {
  M[n] = { dur: new Trend('read_duration_' + n, true), succ: new Rate('read_success_' + n), att: new Counter('read_count_' + n) };
});

const scenarios = {};
const thresholds = { http_req_failed: ['rate<0.05'] };
LEVELS.forEach((n, i) => {
  scenarios['load_' + n] = {
    executor: 'per-vu-iterations', vus: n, iterations: LOOPS,
    startTime: i * GAP_S + 's', maxDuration: '60s', exec: 'doRead', tags: { level: String(n) },
  };
  thresholds['read_success_' + n] = ['rate>0.99'];
  thresholds['read_duration_' + n] = ['p(95)<' + P95_MS];
});

export const options = { hosts: hostsMap, insecureSkipTLSVerify: true, scenarios: scenarios, thresholds: thresholds };

function login(u) {
  const g = http.get(`${BASE_URL}/web/login`);
  let csrf = '';
  try { csrf = g.html().find('input[name=csrf_token]').first().attr('value') || ''; } catch (e) { csrf = ''; }
  const payload = { login: u.email, password: u.password, redirect: '' };
  if (csrf) payload.csrf_token = csrf;
  const r = http.post(`${BASE_URL}/web/login`, payload);
  return r.status === 200 && (r.body || '').indexOf("window.location = '/web") !== -1;
}
function callKw(model, method, args, kwargs) {
  return http.post(`${BASE_URL}/web/dataset/call_kw`,
    JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs: kwargs || {} } }),
    { headers: { 'Content-Type': 'application/json' }, tags: { rpc: method } });
}

let loggedIn = false;
export function doRead() {
  const n = parseInt(exec.scenario.name.split('_')[1], 10);
  const m = M[n];
  if (!loggedIn) {
    loggedIn = login(users[(exec.vu.idInTest - 1) % users.length]);
    if (!loggedIn) { m.succ.add(false); console.error(`LOGIN FAILED level=${n} vu=${exec.vu.idInTest}`); return; }
  }
  const res = callKw(MODEL, METHOD, ARGS, KWARGS);
  const body = res.body || '';
  const ok = res.status === 200 && body.indexOf('"error"') === -1 && body.indexOf('"result"') !== -1;
  m.att.add(1); m.dur.add(res.timings.duration); m.succ.add(ok);
  check(res, { ['read ok @' + n]: () => ok });
  if (!ok) console.error(`READ FAILED level=${n} vu=${exec.vu.idInTest} status=${res.status} body=${body.substring(0, 180)}`);
}

export function handleSummary(data) {
  const m = data.metrics || {};
  const v = (name, key) => (m[name] && m[name].values && m[name].values[key] !== undefined ? m[name].values[key] : null);
  const num = (x, d = 0) => (x === null ? 'n/a' : Number(x).toFixed(d));
  const thrOk = (name) => { const t = m[name] && m[name].thresholds; if (!t) return null; return Object.keys(t).every((k) => t[k].ok); };

  const rows = LEVELS.map((n) => ({
    n: n, att: v('read_count_' + n, 'count'), succ: v('read_success_' + n, 'rate'),
    avg: v('read_duration_' + n, 'avg'), p90: v('read_duration_' + n, 'p(90)'),
    p95: v('read_duration_' + n, 'p(95)'), mx: v('read_duration_' + n, 'max'),
    okS: thrOk('read_success_' + n), okD: thrOk('read_duration_' + n),
  }));
  const allPass = rows.every((r) => r.okS !== false && r.okD !== false);
  const badge = (ok) => (ok === null ? '<span class="b b-na">n/a</span>' : ok ? '<span class="b b-pass">PASS</span>' : '<span class="b b-fail">FAIL</span>');
  const trs = rows.map((r) => {
    const sp = r.succ === null ? null : r.succ * 100;
    return `<tr><td class="n">${r.n}</td><td class="n">${num(r.att)}</td><td class="n">${num(sp, 2)}%</td>
      <td class="n">${num(r.avg)}</td><td class="n">${num(r.p90)}</td><td class="n"><b>${num(r.p95)}</b></td>
      <td class="n">${num(r.mx)}</td><td>${badge(r.okS !== false && r.okD !== false)}</td></tr>`;
  }).join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>k6 Read Scaling Report - ${LABEL}</title>
<style>:root{color-scheme:light dark}body{font-family:Segoe UI,Arial,sans-serif;margin:24px;line-height:1.45;max-width:820px}
h1{font-size:20px;margin:0 0 4px}.sub{opacity:.7;font-size:13px;margin-bottom:16px}
.verdict{display:inline-block;padding:6px 14px;border-radius:6px;font-weight:700;margin-bottom:16px}
.v-pass{background:#137333;color:#fff}.v-fail{background:#a50e0e;color:#fff}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #8884;padding:7px 10px;text-align:left;font-size:14px}
th{background:#8881}td.n{font-variant-numeric:tabular-nums;text-align:right}th:nth-child(n+2){text-align:right}
.b{padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700}.b-pass{background:#137333;color:#fff}.b-fail{background:#a50e0e;color:#fff}.b-na{background:#8884}
.cfg{margin-top:18px;font-size:13px;opacity:.85}code{background:#8882;padding:1px 5px;border-radius:3px}.note{font-size:12px;opacity:.7;margin-top:6px}</style></head><body>
<h1>k6 Read Scaling Report - ${LABEL}</h1>
<div class="sub">Concurrent read via JSON-RPC (${MODEL}.${METHOD}). Read-only - no data written.</div>
<div class="verdict ${allPass ? 'v-pass' : 'v-fail'}">${allPass ? 'ALL LEVELS PASSED' : 'SOME LEVELS FAILED'}</div>
<table><tr><th>Concurrent users</th><th>Requests</th><th>Success</th><th>avg (ms)</th><th>p90 (ms)</th><th>p95 (ms)</th><th>max (ms)</th><th>Gate</th></tr>
${trs}</table>
<div class="note">Gate = read success &gt; 99% AND p95 &lt; ${P95_MS} ms. Latency = the ${METHOD} RPC only (login done once per user, not counted).</div>
<div class="cfg"><b>Config:</b> LEVELS=<code>${LEVELS.join(', ')}</code> &middot; LOOPS=<code>${LOOPS}</code>/user &middot; gap=<code>${GAP_S}s</code> &middot; call=<code>${MODEL}.${METHOD}</code> &middot; BASE_URL=<code>${BASE_URL}</code></div>
</body></html>`;

  let text = `\n=== k6 Read Scaling Report - ${LABEL} ===\ncall=${MODEL}.${METHOD} LEVELS=${LEVELS.join(',')} gap=${GAP_S}s\nusers  reqs  success%   avg    p90    p95    max   gate\n`;
  rows.forEach((r) => {
    const sp = r.succ === null ? null : r.succ * 100;
    const gate = r.okS !== false && r.okD !== false ? 'PASS' : 'FAIL';
    text += String(r.n).padStart(5) + num(r.att).padStart(6) + (num(sp, 2) + '%').padStart(10) + num(r.avg).padStart(7) + num(r.p90).padStart(7) + num(r.p95).padStart(7) + num(r.mx).padStart(7) + '  ' + gate + '\n';
  });
  text += `Verdict: ${allPass ? 'ALL PASS' : 'SOME FAIL'}\n`;
  return { 'perf/k6/report/index.html': html, 'perf/k6/report/summary.json': JSON.stringify(data, null, 2), stdout: text };
}
