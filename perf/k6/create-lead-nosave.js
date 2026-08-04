/**
 * k6 SCALING load test - "CREATE A LEAD BUT DO NOT SAVE IT" via Odoo JSON-RPC, Nakivo CRM PRE-PRODUCTION.
 *
 * WHAT THIS SIMULATES
 *   A sales user clicks "New" on the CRM lead form and fills it in - salesperson, customer,
 *   contact e-mail/phone, name - but never presses Save. This is exactly the RPC sequence the
 *   Odoo 12 web client fires while the form is open: default_get (open the New form) then a
 *   series of onchange() calls as each field is filled. onchange builds an IN-MEMORY record
 *   (models `new()` / NewId) and runs every server-side compute/onchange method - the studio
 *   field x_studio_field_MPZM0 included - WITHOUT ever INSERTing a row. (This is the approach
 *   the Odoo developer pointed at with the `held == {"1": ["x_studio_field_MPZM0"]}` onchange
 *   assertion: assert the in-memory result, don't persist.)
 *
 * WHY (vs create-lead-scale.js which DOES save)
 *   Measuring the create() path pollutes pre-prod with real leads, trips the intentional
 *   sequential assignment/scoring cron (which locks each new lead -> slow, order-20s), and
 *   forces an admin bulk-delete teardown that often leaves orphans. This no-save variant
 *   exercises the SAME server-side lead-form workload (default_get + onchange compute) under
 *   concurrency, but writes NOTHING - so: no cron lock, no cleanup, no admin account, no DB
 *   drift, and latency reflects pure compute, not the assignment cron.
 *
 * PROVEN ON PRE-PROD (2026-08-04, Thomas sales IC):
 *   default_get -> {type:lead,user_id,team_id:56,stage_id:1,planned_revenue:750}
 *   onchange(user_id)    -> {value:{team_id:[56,"BDEU"]}}
 *   onchange(partner_id) -> {value:{city:"Bejubang Dua"}}   (rich _onchange_partner_id fill)
 *   search_count(name)   -> 0                                 (NOTHING saved)
 *
 * Flow per VU/iteration (all timed together as one "prepare lead, no save" transaction):
 *   login ONCE per VU, then per iteration:
 *     1) default_get([...])                      open the New Lead form
 *     2) onchange(name)                          type the lead name
 *     3) onchange(user_id)                        pick salesperson  -> server computes team
 *     4) onchange(partner_id)                     pick customer     -> server fills city/contact
 *     5) onchange(email_from + contact + studio)  fill contact details + the studio field
 *   NO create / write / unlink is ever called.
 *
 * Env:
 *   LEVELS   concurrency levels                (default "10,30,50,100")
 *   LOOPS    no-save leads per VU per level    (default 1)
 *   GAP_S    seconds between bursts            (default 20)
 *   PARTNER_ID  customer to select in onchange (default 0 = auto-pick one company in setup)
 *   RUN_ID   unique tag for this run           (default "local"; Jenkins passes j<build#>)
 *   BASE_URL / MAP_IP                          (default https://pre-production.nakivo.site / 10.220.222.100)
 *   P95_MS   per-level sequence p95 gate ms    (default 4000; pure compute, no cron)
 *   VERIFY_NOSAVE  1=assert 0 rows persisted   (default 1)
 *
 * Run locally (VPN required):  k6 run -e RUN_ID=local1 perf/k6/create-lead-nosave.js
 *                              k6 run -e LEVELS=5,10 perf/k6/create-lead-nosave.js
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
const GAP_S = parseInt(__ENV.GAP_S || '20', 10);
const P95_MS = parseInt(__ENV.P95_MS || '4000', 10); // pure server compute, no assignment cron in the path
const RUN_ID = (__ENV.RUN_ID || 'local').replace(/[^A-Za-z0-9_-]/g, '');
const PARTNER_ID_ENV = parseInt(__ENV.PARTNER_ID || '0', 10);
const VERIFY_NOSAVE = (__ENV.VERIFY_NOSAVE || '1') !== '0';
const MARKER = 'K6NOSAVE-' + RUN_ID + '-'; // lead name marker; must NEVER appear in the DB after the run

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
const creators = new SharedArray('creators', () => parseCsv(open('./users.csv'))); // sales users (fill form)

// ---- Per-level metrics ----
const M = {};
LEVELS.forEach((n) => {
  M[n] = {
    dur: new Trend('lead_nosave_duration_' + n, true), // full form sequence (default_get + all onchange)
    succ: new Rate('lead_nosave_success_' + n),
    att: new Counter('lead_nosave_count_' + n),
  };
});
const onchangeRpc = new Trend('onchange_rpc_duration', true); // every individual onchange call, all levels

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
    exec: 'doNoSave',
    tags: { level: String(n) },
  };
  thresholds['lead_nosave_success_' + n] = ['rate>0.99'];
  thresholds['lead_nosave_duration_' + n] = ['p(95)<' + P95_MS];
});

export const options = {
  hosts: hostsMap,
  insecureSkipTLSVerify: true,
  scenarios: scenarios,
  thresholds: thresholds,
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

function callKw(model, method, args, kwargs, tag) {
  return http.post(
    `${BASE_URL}/web/dataset/call_kw`,
    JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs: kwargs || {} } }),
    { headers: { 'Content-Type': 'application/json' }, tags: { rpc: tag || method } }
  );
}

const CTX = { context: { lang: 'en_US', tz: 'UTC' } };
// One comprehensive field_onchange spec reused for every onchange (marking a field "1" that has
// no handler is harmless; NOT marking one that does would skip its onchange).
const SPEC = {
  name: '1', partner_id: '1', user_id: '1', team_id: '1', email_from: '1', contact_name: '1',
  phone: '1', stage_id: '1', country_id: '1', city: '1', street: '1', type: '',
  x_studio_field_MPZM0: '1',
};
const FIELDS = ['name', 'contact_name', 'email_from', 'phone', 'partner_id', 'type', 'user_id',
  'team_id', 'stage_id', 'country_id', 'city', 'street', 'x_studio_field_MPZM0'];

function rpcOk(res) {
  const b = res.body || '';
  return res.status === 200 && b.indexOf('"error"') === -1;
}

// setup(): resolve a real customer partner to select (unless PARTNER_ID given), once for the run.
export function setup() {
  if (PARTNER_ID_ENV > 0) return { partnerId: PARTNER_ID_ENV };
  if (!login(creators[0])) return { partnerId: 0 };
  const r = callKw('res.partner', 'search_read', [[['is_company', '=', true]], ['id']], { limit: 1 });
  let pid = 0;
  try { pid = JSON.parse(r.body).result[0].id; } catch (e) { pid = 0; }
  console.log(`setup: partner_id to select in onchange = ${pid}`);
  return { partnerId: pid };
}

// Per-VU login guard (each VU has its own JS runtime).
let loggedIn = false;

export function doNoSave(data) {
  const n = parseInt(exec.scenario.name.split('_')[1], 10);
  const m = M[n];
  if (!loggedIn) {
    loggedIn = login(creators[(exec.vu.idInTest - 1) % creators.length]);
    if (!loggedIn) {
      m.succ.add(false);
      console.error(`LOGIN FAILED level=${n} vu=${exec.vu.idInTest}`);
      return;
    }
  }
  const vu = exec.vu.idInTest;
  const it = exec.vu.iterationInInstance;
  const name = `${MARKER}${n}-${vu}-${it}`;
  const email = `k6nosave-${RUN_ID}-${n}-${vu}-${it}@loadtest-nakivo.invalid`;
  const pid = (data && data.partnerId) || false;

  const t0 = Date.now();
  let ok = true;
  const step = (res) => {
    onchangeRpc.add(res.timings.duration);
    if (!rpcOk(res)) ok = false;
    return res;
  };

  // 1) open the New Lead form
  step(callKw('crm.lead', 'default_get', [FIELDS], CTX, 'default_get'));

  // running in-memory values, grown as the "user" fills fields
  const vals = { name: name, type: 'lead', user_id: false, team_id: false, partner_id: false,
    email_from: false, contact_name: false, phone: false, x_studio_field_MPZM0: false };

  // 2) type the name
  step(callKw('crm.lead', 'onchange', [[], vals, 'name', SPEC], CTX, 'onchange_name'));

  // 3) pick salesperson -> server computes the sales team (proves compute, no save)
  vals.user_id = 9470; // Thomas' user id (from default_get); the exact id is not important
  step(callKw('crm.lead', 'onchange', [[], vals, 'user_id', SPEC], CTX, 'onchange_user_id'));

  // 4) pick a customer -> _onchange_partner_id fills city/contact into the in-memory lead
  if (pid) {
    vals.partner_id = pid;
    step(callKw('crm.lead', 'onchange', [[], vals, 'partner_id', SPEC], CTX, 'onchange_partner_id'));
  }

  // 5) fill contact e-mail/name/phone + the studio field
  vals.email_from = email;
  vals.contact_name = `K6 NoSave ${vu}`;
  vals.phone = '+10000000000';
  vals.x_studio_field_MPZM0 = 'k6-nosave';
  step(callKw('crm.lead', 'onchange', [[], vals, 'email_from', SPEC], CTX, 'onchange_contact'));

  m.att.add(1);
  m.dur.add(Date.now() - t0);
  m.succ.add(ok);
  check(null, { ['lead prepared in-memory (no save) @' + n]: () => ok });
  if (!ok) console.error(`NO-SAVE SEQ FAILED level=${n} vu=${vu} it=${it}`);
}

// teardown(): PROVE nothing was persisted - search for any lead carrying this run's marker.
export function teardown(data) {
  if (!VERIFY_NOSAVE) return;
  if (!login(creators[0])) {
    console.error('VERIFY skipped: could not log in to count rows.');
    return;
  }
  const r = callKw('crm.lead', 'search_count', [[['name', '=like', MARKER + '%']]], {});
  let cnt = -1;
  try { cnt = JSON.parse(r.body).result; } catch (e) { cnt = -1; }
  if (cnt === 0) {
    console.log(`VERIFY OK: 0 leads persisted for marker '${MARKER}%' (nothing was saved).`);
  } else {
    console.error(`VERIFY FAILED: found ${cnt} persisted lead(s) for marker '${MARKER}%' - expected 0!`);
  }
}

// ---- Comparison report ----
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
    att: v('lead_nosave_count_' + n, 'count'),
    succ: v('lead_nosave_success_' + n, 'rate'),
    avg: v('lead_nosave_duration_' + n, 'avg'),
    p90: v('lead_nosave_duration_' + n, 'p(90)'),
    p95: v('lead_nosave_duration_' + n, 'p(95)'),
    mx: v('lead_nosave_duration_' + n, 'max'),
    okS: thrOk('lead_nosave_success_' + n),
    okD: thrOk('lead_nosave_duration_' + n),
  }));
  const allPass = rows.every((r) => r.okS !== false && r.okD !== false);
  const maxP95 = Math.max(1, ...rows.map((r) => r.p95 || 0));

  const badge = (ok) =>
    ok === null ? '<span class="b b-na">n/a</span>' : ok ? '<span class="b b-pass">PASS</span>' : '<span class="b b-fail">FAIL</span>';
  const cell = (ms) => `<td class="n">${num(ms)}</td>`;
  const cellB = (ms) => `<td class="n"><b>${num(ms)}</b></td>`;
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
      <div class="barval">${num(r.p95)} ms</div></div>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>k6 Create-Lead (NO SAVE) Scaling Report - Pre-Production</title>
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
  .bar{height:100%;background:linear-gradient(90deg,#2a9d5a,#137333)}
  .barval{width:120px;font-variant-numeric:tabular-nums}
  .cfg{margin-top:20px;font-size:13px;opacity:.85}code{background:#8882;padding:1px 5px;border-radius:3px}
  .note{font-size:12px;opacity:.7;margin-top:6px}
  .ns{display:inline-block;background:#0a7;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700}
</style></head><body>
  <h1>k6 Create-Lead <span class="ns">NO&nbsp;SAVE</span> Scaling Report - Nakivo CRM Pre-Production</h1>
  <div class="sub">Simulates opening the New Lead form and filling it (default_get + onchange, in-memory ORM) under concurrency. <b>No crm.lead row is ever written</b> - so no assignment-cron lock, no cleanup, no DB drift.</div>
  <div class="verdict ${allPass ? 'v-pass' : 'v-fail'}">${allPass ? 'ALL LEVELS PASSED' : 'SOME LEVELS FAILED'}</div>

  <h2>In-memory lead-form performance by concurrent users</h2>
  <table>
    <tr><th>Concurrent users</th><th>Sequences</th><th>Success</th><th>avg (ms)</th><th>p90 (ms)</th><th>p95 (ms)</th><th>max (ms)</th><th>Gate</th></tr>
    ${trs}
  </table>
  <div class="note">One "sequence" = default_get + onchange(name) + onchange(user_id) + onchange(partner_id) + onchange(contact/studio), i.e. the whole New-Lead form filled but NOT saved. Gate = success &gt; 99% AND p95 &lt; ${P95_MS} ms. Login done once per user, not counted.</div>

  <h2>No-save sequence latency (p95) by concurrency</h2>
  ${bars}

  <div class="cfg">
    <b>Config:</b> LEVELS=<code>${LEVELS.join(', ')}</code> &middot; LOOPS=<code>${LOOPS}</code>/user &middot;
    gap=<code>${GAP_S}s</code> &middot; RUN_ID=<code>${RUN_ID}</code> &middot; BASE_URL=<code>${BASE_URL}</code>
    <div class="note">No teardown delete needed - nothing is created. VERIFY step asserts 0 leads exist for marker <code>${MARKER}*</code> (see console).</div>
  </div>
</body></html>`;

  let text = '\n=== k6 Create-Lead (NO SAVE) Scaling Report ===\n';
  text += `LEVELS=${LEVELS.join(',')} LOOPS=${LOOPS} gap=${GAP_S}s RUN_ID=${RUN_ID}\n`;
  text += 'users  seqs  success%   avg    p90    p95    max   gate\n';
  rows.forEach((r) => {
    const sp = r.succ === null ? null : r.succ * 100;
    const gate = r.okS !== false && r.okD !== false ? 'PASS' : 'FAIL';
    text +=
      String(r.n).padStart(5) + num(r.att).padStart(6) + (num(sp, 2) + '%').padStart(10) +
      num(r.avg).padStart(7) + num(r.p90).padStart(7) + num(r.p95).padStart(7) + num(r.mx).padStart(7) + '  ' + gate + '\n';
  });
  text += `Verdict: ${allPass ? 'ALL PASS' : 'SOME FAIL'}  (no crm.lead written)\n`;

  return {
    'perf/k6/report/index.html': html,
    'perf/k6/report/summary.json': JSON.stringify(data, null, 2),
    stdout: text,
  };
}
