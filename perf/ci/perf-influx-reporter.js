/**
 * Playwright reporter that streams the single-user timing of the 1.SalesReport_Performance
 * perf specs into InfluxDB (measurement `pw_perf`) so the Playwright "single-user timing"
 * track shows up in the same Grafana as the k6 "concurrent load" track.
 *
 * Non-invasive: it parses each perf spec's own "(MEASURED)  X.XXs" console line (the spec
 * already prints it) - no spec edits. Load it by absolute path on the CLI, e.g.:
 *   npx playwright test <spec> --reporter=line,D:\Automation_CRM\_wt_performance\perf\ci\perf-influx-reporter.js
 *
 * Env:
 *   INFLUX_WRITE_URL  default http://10.8.81.44:8086/write?db=k6
 *   PW_BUILD          run/build tag (default "local")
 * Best-effort: never fails the test run if InfluxDB is down.
 */
const http = require('http');

function post(urlStr, body) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return resolve(false); }
    const req = http.request(
      { hostname: u.hostname, port: u.port || 8086, path: u.pathname + u.search, method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) }, timeout: 8000 },
      (res) => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300)); }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(body); req.end();
  });
}

// tc-performance-1-1-4-1-create-deal-element.spec.ts -> create-deal-element
function testidFromFile(file) {
  const base = String(file).replace(/\\/g, '/').split('/').pop() || '';
  return base.replace(/\.spec\.ts$/, '').replace(/^tc-performance-[\d-]+-/, '') || base;
}

function measuredSeconds(stdout) {
  // 1) the spec's "(MEASURED)  3.45s" breakdown line
  let m = stdout.match(/\(MEASURED\)[^\d\n]*([\d.]+)\s*s\b/);
  if (m) return parseFloat(m[1]);
  // 2) fallbacks: "Operation Time: 3.45 seconds" / "Time: 3.45 seconds"
  m = stdout.match(/Operation Time:\s*([\d.]+)\s*seconds/i) || stdout.match(/\bTime:\s*([\d.]+)\s*seconds/i);
  return m ? parseFloat(m[1]) : null;
}

class PerfInfluxReporter {
  constructor() {
    this.url = process.env.INFLUX_WRITE_URL || 'http://10.8.81.44:8086/write?db=k6';
    this.build = (process.env.PW_BUILD || 'local').replace(/[^A-Za-z0-9_.-]/g, '');
    this.pending = [];
    this.count = 0;
  }
  onTestEnd(test, result) {
    const file = test.location && test.location.file;
    if (!file || !String(file).replace(/\\/g, '/').includes('/1.SalesReport_Performance/')) return;
    const stdout = (result.stdout || []).map((s) => (typeof s === 'string' ? s : (s && s.text) || '')).join('');
    const sec = measuredSeconds(stdout);
    if (sec === null || !isFinite(sec)) return;
    const testid = testidFromFile(file);
    const status = result.status || 'unknown';
    // line protocol: measurement,tags fields  (tag values must escape spaces/commas; ours are safe)
    const line = `pw_perf,testid=${testid},build=${this.build},result=${status} duration_s=${sec},duration_ms=${Math.round(sec * 1000)}`;
    // POST immediately (not batched): a long chain run can lose its agent mid-way -> incremental
    // writes keep every measurement taken so far. onTestEnd isn't awaited by Playwright, so we
    // dispatch the request now and await the in-flight promises in onEnd for a clean finish.
    this.count++;
    const p = post(this.url, line + '\n').then((ok) => {
      console.log(`  [perf-influx] ${testid}: ${sec}s (${status}) -> ${ok ? 'written to InfluxDB' : 'FAILED (best-effort, ignored)'}`);
    });
    this.pending.push(p);
  }
  async onEnd() {
    if (!this.count) { console.log('[perf-influx] no perf metrics to stream.'); return; }
    await Promise.all(this.pending);
    console.log(`[perf-influx] streamed ${this.count} metric(s) to ${this.url} (incremental, build=${this.build}).`);
  }
}

module.exports = PerfInfluxReporter;
