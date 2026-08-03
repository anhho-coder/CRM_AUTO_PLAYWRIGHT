/**
 * k6 load test - concurrent login to Nakivo Partner Portal CRM (Odoo) PRE-PRODUCTION.
 *
 * Simulates N virtual users (default 10) logging in SIMULTANEOUSLY via the real
 * Odoo form-login endpoint (POST /web/login), the same code path a browser uses -
 * but at the HTTP layer, so it measures the SERVER's login handling, not Chrome.
 *
 * Flow per VU/iteration:
 *   1) GET  /web/login   -> obtain a session cookie + scrape the csrf_token
 *   2) POST /web/login   -> login + password (+ csrf_token)
 *      success = HTTP 200 whose body is Odoo's JS redirect: window.location = '/web'
 *      failure = HTTP 200 re-rendering the login form (name="password" + alert-danger)
 *
 * Config via env (all optional, sensible defaults):
 *   BASE_URL  pre-prod base url          (default http://pre-production.nakivo.site)
 *   MAP_IP    IP the host maps to        (default 10.220.222.100; k6 DNS map = mirror of
 *                                         Playwright HOST_RESOLVER_MAP. Blank to disable.)
 *   VUS       concurrent virtual users   (default 10)  -> "10 users at once"
 *   LOOPS     logins per VU              (default 1)   -> one 10-user burst
 *   P95_MS    p95 login-duration gate ms (default 3000)
 *
 * Users are read from ./users.csv (columns: email,password), one distinct user per VU.
 *
 * Run locally (VPN to pre-prod required):
 *   k6 run perf/k6/login-load.js
 *   k6 run -e VUS=10 -e LOOPS=1 perf/k6/login-load.js
 */
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate, Counter } from 'k6/metrics';

// ---- Config from env ----
const BASE_URL = (__ENV.BASE_URL || 'https://pre-production.nakivo.site').replace(/\/+$/, '');
const MAP_IP = __ENV.MAP_IP === undefined ? '10.220.222.100' : __ENV.MAP_IP;
const VUS = parseInt(__ENV.VUS || '10', 10);
const LOOPS = parseInt(__ENV.LOOPS || '1', 10);
const P95_MS = parseInt(__ENV.P95_MS || '3000', 10);

// host -> IP map (mirrors HOST_RESOLVER_MAP). Only map when a distinct IP is given.
const host = BASE_URL.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
const hostsMap = {};
if (MAP_IP && host && host !== MAP_IP) hostsMap[host] = MAP_IP;

// ---- Users: one row per line "email,password" ----
const usersData = new SharedArray('users', function () {
  const raw = open('./users.csv');
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.toLowerCase().startsWith('email'))
    .map((l) => {
      const parts = l.split(',');
      return { email: (parts[0] || '').trim(), password: (parts[1] || '').trim() };
    })
    .filter((u) => u.email && u.password);
});

// ---- Custom metrics ----
const loginDuration = new Trend('login_duration', true);
const loginSuccess = new Rate('login_success');
const loginAttempts = new Counter('login_attempts');

export const options = {
  hosts: hostsMap,
  insecureSkipTLSVerify: true, // internal pre-prod TLS cert is not publicly trusted
  scenarios: {
    simultaneous_login: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: LOOPS,
      maxDuration: '5m',
    },
  },
  thresholds: {
    login_success: ['rate>0.99'], // <=1% of logins may fail
    http_req_failed: ['rate<0.01'], // <1% HTTP-level errors
    login_duration: [`p(95)<${P95_MS}`], // 95% of login POSTs under P95_MS
  },
};

export default function () {
  // Deterministic user-per-VU so each VU behaves as a distinct account.
  const u = usersData[(__VU - 1) % usersData.length];

  // 1) GET login page -> session cookie (auto-jarred per VU) + csrf_token.
  const getRes = http.get(`${BASE_URL}/web/login`, { tags: { step: 'get_login' } });
  let csrf = '';
  try {
    csrf = getRes.html().find('input[name=csrf_token]').first().attr('value') || '';
  } catch (e) {
    csrf = '';
  }

  // 2) POST credentials. redirects:0 so we can read the 303 as the success signal.
  const payload = { login: u.email, password: u.password, redirect: '' };
  if (csrf) payload.csrf_token = csrf;

  const res = http.post(`${BASE_URL}/web/login`, payload, {
    tags: { step: 'post_login' },
  });

  loginDuration.add(res.timings.duration);
  loginAttempts.add(1);

  // This Odoo returns 200 + a tiny JS redirect page on SUCCESS. The target depends on the
  // redirect param: window.location = '/web'  OR  '/web?'  (+ location.hash).
  // On FAILURE it re-renders the ~16KB login form (name="password" + alert-danger),
  // or loops back to '/web/login'. So: success = a JS redirect to /web that is NOT /web/login.
  const body = res.body || '';
  const ok =
    res.status === 200 &&
    body.indexOf("window.location = '/web") !== -1 &&
    body.indexOf('/web/login') === -1;

  loginSuccess.add(ok);
  check(res, { 'login accepted (Odoo JS redirect to /web)': () => ok });

  if (!ok) {
    console.error(`LOGIN FAILED user=${u.email} status=${res.status} bodyLen=${body.length}`);
  }
}

// ---- Self-contained report (no remote imports) ----
export function handleSummary(data) {
  const m = data.metrics || {};
  const v = (name, key) =>
    m[name] && m[name].values && m[name].values[key] !== undefined ? m[name].values[key] : null;
  const num = (n, d = 0) => (n === null ? 'n/a' : Number(n).toFixed(d));

  const successRate = v('login_success', 'rate');
  const failRate = v('http_req_failed', 'rate');
  const attempts = v('login_attempts', 'count');
  const durAvg = v('login_duration', 'avg');
  const durMin = v('login_duration', 'min');
  const durMax = v('login_duration', 'max');
  const durP90 = v('login_duration', 'p(90)');
  const durP95 = v('login_duration', 'p(95)');

  const thrOk = (name) => {
    const t = m[name] && m[name].thresholds;
    if (!t) return null;
    return Object.keys(t).every((k) => t[k].ok);
  };
  const badge = (ok) =>
    ok === null
      ? '<span class="b b-na">n/a</span>'
      : ok
      ? '<span class="b b-pass">PASS</span>'
      : '<span class="b b-fail">FAIL</span>';

  const allPass =
    thrOk('login_success') !== false &&
    thrOk('http_req_failed') !== false &&
    thrOk('login_duration') !== false;

  const rows = [
    ['Login success rate', `${num(successRate === null ? null : successRate * 100, 2)} %`, badge(thrOk('login_success')), '> 99%'],
    ['HTTP request failed rate', `${num(failRate === null ? null : failRate * 100, 2)} %`, badge(thrOk('http_req_failed')), '< 1%'],
    ['Login duration p95', `${num(durP95, 0)} ms`, badge(thrOk('login_duration')), `< ${P95_MS} ms`],
    ['Login duration p90', `${num(durP90, 0)} ms`, '', ''],
    ['Login duration avg', `${num(durAvg, 0)} ms`, '', ''],
    ['Login duration min / max', `${num(durMin, 0)} / ${num(durMax, 0)} ms`, '', ''],
    ['Total login attempts', `${num(attempts, 0)}`, '', ''],
  ]
    .map(
      (r) =>
        `<tr><td>${r[0]}</td><td class="n">${r[1]}</td><td>${r[2]}</td><td class="t">${r[3]}</td></tr>`
    )
    .join('\n');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>k6 Login Load Test - Pre-Production</title>
<style>
  :root{color-scheme:light dark}
  body{font-family:Segoe UI,Arial,sans-serif;margin:24px;line-height:1.4}
  h1{font-size:20px;margin:0 0 4px}
  .sub{opacity:.7;font-size:13px;margin-bottom:16px}
  .verdict{display:inline-block;padding:6px 14px;border-radius:6px;font-weight:700;margin-bottom:16px}
  .v-pass{background:#137333;color:#fff}.v-fail{background:#a50e0e;color:#fff}
  table{border-collapse:collapse;width:100%;max-width:760px}
  th,td{border:1px solid #8884;padding:8px 10px;text-align:left;font-size:14px}
  th{background:#8881}
  td.n{font-variant-numeric:tabular-nums;font-weight:600}
  td.t{opacity:.7}
  .b{padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700}
  .b-pass{background:#137333;color:#fff}.b-fail{background:#a50e0e;color:#fff}.b-na{background:#8884}
  .cfg{margin-top:18px;font-size:13px;opacity:.85}
  code{background:#8882;padding:1px 5px;border-radius:3px}
</style></head><body>
  <h1>k6 Login Load Test - Nakivo CRM Pre-Production</h1>
  <div class="sub">Concurrent login via POST /web/login (server-side auth, not browser)</div>
  <div class="verdict ${allPass ? 'v-pass' : 'v-fail'}">${allPass ? 'THRESHOLDS PASSED' : 'THRESHOLDS FAILED'}</div>
  <table>
    <tr><th>Metric</th><th>Value</th><th>Gate</th><th>Threshold</th></tr>
    ${rows}
  </table>
  <div class="cfg">
    <b>Config:</b>
    VUS=<code>${VUS}</code> (simultaneous users) &middot;
    LOOPS=<code>${LOOPS}</code> (logins/VU) &middot;
    BASE_URL=<code>${BASE_URL}</code> &middot;
    MAP_IP=<code>${MAP_IP || '(none)'}</code>
  </div>
</body></html>`;

  const text =
    `\n=== k6 Login Load Test ===\n` +
    `VUS=${VUS} LOOPS=${LOOPS} BASE_URL=${BASE_URL}\n` +
    `Login success : ${num(successRate === null ? null : successRate * 100, 2)}%\n` +
    `HTTP failed   : ${num(failRate === null ? null : failRate * 100, 2)}%\n` +
    `Login p95     : ${num(durP95, 0)} ms (gate < ${P95_MS} ms)\n` +
    `Login avg     : ${num(durAvg, 0)} ms | max ${num(durMax, 0)} ms\n` +
    `Attempts      : ${num(attempts, 0)}\n` +
    `Verdict       : ${allPass ? 'PASS' : 'FAIL'}\n`;

  return {
    'perf/k6/report/index.html': html,
    'perf/k6/report/summary.json': JSON.stringify(data, null, 2),
    stdout: text,
  };
}
