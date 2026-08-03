/**
 * k6 SCALING load test - concurrent login to Nakivo CRM (Odoo) PRE-PRODUCTION.
 *
 * Runs several SIMULTANEOUS-login bursts at increasing concurrency (default 10, 30, 50, 100),
 * one after another with a recovery gap, and measures each level SEPARATELY so you can see
 * how login latency / success scales with the number of concurrent users. Produces one
 * self-contained comparison report (table + p95 bar chart).
 *
 * Each level N: N virtual users each do LOOPS logins, all starting together (a burst).
 * Auth is the real Odoo POST /web/login at the HTTP layer (server-side, not a browser):
 *   GET /web/login (session cookie + csrf) -> POST login+password+csrf.
 *   SUCCESS = 200 whose body is Odoo's JS redirect window.location = '/web' | '/web?'.
 *
 * Env (all optional):
 *   LEVELS    comma list of concurrency levels   (default "10,30,50,100")
 *   LOOPS     logins per VU per level             (default 1)
 *   GAP_S     seconds between bursts (recovery)   (default 30)
 *   BASE_URL  pre-prod base url                   (default https://pre-production.nakivo.site)
 *   MAP_IP    host->IP map (mirror HOST_RESOLVER) (default 10.220.222.100; blank to disable)
 *   P95_MS    per-level p95 gate ms               (default 5000)
 *
 * Run locally (VPN required):  k6 run perf/k6/login-scale.js
 *   k6 run -e LEVELS=10,30,50,100 -e GAP_S=30 perf/k6/login-scale.js
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
const P95_MS = parseInt(__ENV.P95_MS || '5000', 10);

const host = BASE_URL.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
const hostsMap = {};
if (MAP_IP && host && host !== MAP_IP) hostsMap[host] = MAP_IP;

// ---- Users (email,password per line); cycled across VUs ----
const usersData = new SharedArray('users', function () {
  const raw = open('./users.csv');
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.toLowerCase().startsWith('email'))
    .map((l) => {
      const p = l.split(',');
      return { email: (p[0] || '').trim(), password: (p[1] || '').trim() };
    })
    .filter((u) => u.email && u.password);
});

// ---- Per-level metrics ----
const M = {};
LEVELS.forEach((n) => {
  M[n] = {
    dur: new Trend('login_duration_' + n, true),
    succ: new Rate('login_success_' + n),
    att: new Counter('login_attempts_' + n),
  };
});

// ---- Sequential burst scenarios + per-level thresholds ----
const scenarios = {};
const thresholds = { http_req_failed: ['rate<0.05'] };
LEVELS.forEach((n, i) => {
  scenarios['load_' + n] = {
    executor: 'per-vu-iterations',
    vus: n,
    iterations: LOOPS,
    startTime: i * GAP_S + 's',
    maxDuration: '60s',
    exec: 'doLogin',
    tags: { level: String(n) },
  };
  thresholds['login_success_' + n] = ['rate>0.99']; // logins must keep working under load
  thresholds['login_duration_' + n] = ['p(95)<' + P95_MS]; // latency budget per level
});

export const options = {
  hosts: hostsMap,
  insecureSkipTLSVerify: true, // internal pre-prod cert
  scenarios: scenarios,
  thresholds: thresholds,
};

export function doLogin() {
  const n = parseInt(exec.scenario.name.split('_')[1], 10);
  const m = M[n];
  const u = usersData[(exec.vu.idInTest - 1) % usersData.length];

  const getRes = http.get(`${BASE_URL}/web/login`, { tags: { level: String(n), step: 'get' } });
  let csrf = '';
  try {
    csrf = getRes.html().find('input[name=csrf_token]').first().attr('value') || '';
  } catch (e) {
    csrf = '';
  }

  const payload = { login: u.email, password: u.password, redirect: '' };
  if (csrf) payload.csrf_token = csrf;
  const res = http.post(`${BASE_URL}/web/login`, payload, { tags: { level: String(n), step: 'post' } });

  m.att.add(1);
  m.dur.add(res.timings.duration);
  const body = res.body || '';
  const ok =
    res.status === 200 &&
    body.indexOf("window.location = '/web") !== -1 &&
    body.indexOf('/web/login') === -1;
  m.succ.add(ok);
  check(res, { ['login ok @' + n]: () => ok });
  if (!ok) {
    console.error(`LOGIN FAILED level=${n} vu=${exec.vu.idInTest} status=${res.status} len=${body.length}`);
  }
}

// ---- Self-contained comparison report ----
export function handleSummary(data) {
  const m = data.metrics || {};
  const v = (name, key) =>
    m[name] && m[name].values && m[name].values[key] !== undefined ? m[name].values[key] : null;
  const num = (x, d = 0) => (x === null ? 'n/a' : Number(x).toFixed(d));
  const thrOk = (name) => {
    const t = m[name] && m[name].thresholds;
    if (!t) return null;
    return Object.keys(t).every((k) => t[k].ok);
  };

  const rows = LEVELS.map((n) => ({
    n: n,
    att: v('login_attempts_' + n, 'count'),
    succ: v('login_success_' + n, 'rate'),
    avg: v('login_duration_' + n, 'avg'),
    p90: v('login_duration_' + n, 'p(90)'),
    p95: v('login_duration_' + n, 'p(95)'),
    mx: v('login_duration_' + n, 'max'),
    okS: thrOk('login_success_' + n),
    okD: thrOk('login_duration_' + n),
  }));
  const allPass = rows.every((r) => r.okS !== false && r.okD !== false);
  const maxP95 = Math.max(1, ...rows.map((r) => r.p95 || 0));

  const badge = (ok) =>
    ok === null
      ? '<span class="b b-na">n/a</span>'
      : ok
      ? '<span class="b b-pass">PASS</span>'
      : '<span class="b b-fail">FAIL</span>';

  const trs = rows
    .map((r) => {
      const succPct = r.succ === null ? null : r.succ * 100;
      return `<tr>
      <td class="n">${r.n}</td>
      <td class="n">${num(r.att)}</td>
      <td class="n">${num(succPct, 2)}%</td>
      <td class="n">${num(r.avg)}</td>
      <td class="n">${num(r.p90)}</td>
      <td class="n"><b>${num(r.p95)}</b></td>
      <td class="n">${num(r.mx)}</td>
      <td>${badge(r.okS !== false && r.okD !== false)}</td>
    </tr>`;
    })
    .join('\n');

  const bars = rows
    .map((r) => {
      const w = Math.round(((r.p95 || 0) / maxP95) * 100);
      return `<div class="barrow"><div class="barlbl">${r.n} users</div>
      <div class="bartrack"><div class="bar" style="width:${w}%"></div></div>
      <div class="barval">${num(r.p95)} ms</div></div>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>k6 Login Scaling Report - Pre-Production</title>
<style>
  :root{color-scheme:light dark}
  body{font-family:Segoe UI,Arial,sans-serif;margin:24px;line-height:1.45;max-width:900px}
  h1{font-size:21px;margin:0 0 4px}
  .sub{opacity:.7;font-size:13px;margin-bottom:16px}
  .verdict{display:inline-block;padding:6px 14px;border-radius:6px;font-weight:700;margin-bottom:18px}
  .v-pass{background:#137333;color:#fff}.v-fail{background:#a50e0e;color:#fff}
  h2{font-size:15px;margin:22px 0 8px}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #8884;padding:7px 10px;text-align:left;font-size:14px}
  th{background:#8881}
  td.n{font-variant-numeric:tabular-nums;text-align:right}
  th:nth-child(n+2){text-align:right}
  .b{padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700}
  .b-pass{background:#137333;color:#fff}.b-fail{background:#a50e0e;color:#fff}.b-na{background:#8884}
  .barrow{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px}
  .barlbl{width:80px;text-align:right;opacity:.85}
  .bartrack{flex:1;background:#8882;border-radius:4px;height:18px;overflow:hidden}
  .bar{height:100%;background:linear-gradient(90deg,#2a7ade,#1a56b0)}
  .barval{width:80px;font-variant-numeric:tabular-nums}
  .cfg{margin-top:20px;font-size:13px;opacity:.85}
  code{background:#8882;padding:1px 5px;border-radius:3px}
  .note{font-size:12px;opacity:.7;margin-top:6px}
</style></head><body>
  <h1>k6 Login Scaling Report - Nakivo CRM Pre-Production</h1>
  <div class="sub">Concurrent-login bursts at increasing user counts via POST /web/login (server-side auth, not browser)</div>
  <div class="verdict ${allPass ? 'v-pass' : 'v-fail'}">${allPass ? 'ALL LEVELS PASSED' : 'SOME LEVELS FAILED'}</div>

  <h2>Comparison by concurrent users</h2>
  <table>
    <tr><th>Concurrent users</th><th>Logins</th><th>Success</th><th>avg (ms)</th><th>p90 (ms)</th><th>p95 (ms)</th><th>max (ms)</th><th>Gate</th></tr>
    ${trs}
  </table>
  <div class="note">Gate = login success &gt; 99% AND p95 &lt; ${P95_MS} ms at that level.</div>

  <h2>Login latency (p95) by concurrency</h2>
  ${bars}

  <div class="cfg">
    <b>Config:</b> LEVELS=<code>${LEVELS.join(', ')}</code> &middot;
    LOOPS=<code>${LOOPS}</code>/user &middot;
    gap=<code>${GAP_S}s</code> &middot;
    BASE_URL=<code>${BASE_URL}</code> &middot;
    MAP_IP=<code>${MAP_IP || '(none)'}</code>
    <div class="note">Bursts run sequentially (server recovers between levels). Same test account reused across VUs = concurrent sessions.</div>
  </div>
</body></html>`;

  let text = '\n=== k6 Login Scaling Report ===\n';
  text += `LEVELS=${LEVELS.join(',')} LOOPS=${LOOPS} gap=${GAP_S}s BASE_URL=${BASE_URL}\n`;
  text += 'users  logins  success%   avg    p90    p95    max   gate\n';
  rows.forEach((r) => {
    const succPct = r.succ === null ? null : r.succ * 100;
    const gate = r.okS !== false && r.okD !== false ? 'PASS' : 'FAIL';
    text +=
      String(r.n).padStart(5) +
      num(r.att).padStart(8) +
      (num(succPct, 2) + '%').padStart(10) +
      num(r.avg).padStart(7) +
      num(r.p90).padStart(7) +
      num(r.p95).padStart(7) +
      num(r.mx).padStart(7) +
      '  ' + gate + '\n';
  });
  text += `Verdict: ${allPass ? 'ALL PASS' : 'SOME FAIL'}\n`;

  return {
    'perf/k6/report/index.html': html,
    'perf/k6/report/summary.json': JSON.stringify(data, null, 2),
    stdout: text,
  };
}
