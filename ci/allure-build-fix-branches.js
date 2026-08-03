/*
 * Build the data for the "Fix branches" sub-tabs on the weekly "Failed cases trend" tab.
 *
 * Strategy: the team verifies / re-runs specific failed cases on dedicated per-effort
 * Jenkins jobs named CRM_Rerun_* (each building its own fix branch, e.g.
 * CRM_Rerun_FixBug_2026-08-03 -> branch fix-bug-2026-08-03). Each such job stashes its
 * latest raw Allure results to  <resultsRoot>\<JOB_BASE_NAME>\  (the main Jenkinsfile
 * does this for every build). This script discovers those jobs from disk, reads the
 * per-spec pass/fail of each job's latest run, and writes <reportDir>\crm-fix-branches.json
 * so the report can show one sub-tab per verification job with a per-spec status table.
 *
 * THD / lead-assignment async: a spec that FAILED inline only because the Sales-Team CRON
 * had not assigned yet is NOT a real fail — the run drops a deferred-verify manifest
 * (<deferredRoot>\<day>\<JOB>-<build>.jsonl) that the CRM_Leads_Assignment_DeferredVerify
 * job re-checks ~1h later. Such a failed spec (its tcId present in a manifest for that job)
 * is reported as status "async" (pending re-check), not "failed".
 *
 * Usage:
 *   node ci/allure-build-fix-branches.js <reportDir> [resultsRoot] [deferredRoot] [jenkinsBase] [jobPrefix] [recentDays]
 * Defaults: resultsRoot=C:\allure\results, deferredRoot=C:\deferred-verify,
 *           jenkinsBase=http://10.8.81.44:8080, jobPrefix=CRM_Rerun_, recentDays=14
 * Best-effort: never fails the build (always exits 0).
 */
const fs = require('fs');
const path = require('path');

const reportDir    = process.argv[2] || 'allure-report';
const resultsRoot  = process.argv[3] || 'C:\\allure\\results';
const deferredRoot = process.argv[4] || 'C:\\deferred-verify';
const jenkinsBase  = (process.argv[5] || 'http://10.8.81.44:8080').replace(/\/+$/, '');
const jobPrefix    = process.argv[6] || 'CRM_Rerun_';
const recentDays   = parseInt(process.argv[7] || '14', 10);

const RED = { failed: 1, broken: 1 };

function log(m) { console.log('fix-branches: ' + m); }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function str(v) { return v == null ? '' : String(v).trim(); }
function firstLine(msg) {
  const s = str(msg).replace(/\r/g, '');
  const line = s.split('\n').map(x => x.trim()).filter(Boolean)[0] || s;
  return line.length > 400 ? line.slice(0, 399) + '…' : line;
}
function dstr(ms) { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

// TC id + friendly section/title from an Allure result name/fullName.
function parseTcId(name) {
  const m = String(name || '').match(/(TC\.[-\w.]+|CRM-\d+[\w.]*)/);
  return m ? m[1].replace(/[:.]+$/, '') : '';
}
function titleOf(name, tcId) {
  let t = str(name);
  if (tcId && t.indexOf(tcId) === 0) t = t.slice(tcId.length).replace(/^[:\s-]+/, '');
  return t || str(name);
}
function sectionOf(fullName, labels) {
  const hay = (str(fullName) + ' ' + (labels || []).map(l => l.value).join(' '));
  if (/O12_CE_to_O12_CC/i.test(hay)) return 'O12';
  if (/Leads_Assignment/i.test(hay)) return 'Leads_Assignment';
  if (/Lead_Merging/i.test(hay)) return 'Lead_Merging';
  if (/CRM_Module/i.test(hay)) return 'CRM_Module';
  if (/Investment/i.test(hay)) return 'Investments';
  if (/SalesReport|Performance/i.test(hay)) return 'SalesReport_Performance';
  return '';
}

// ---- deferred-verify: which tcIds for a job are "pending async re-check" ----
function deferredTcIdsForJob(jobName) {
  const ids = {};
  let days = [];
  try { days = fs.readdirSync(deferredRoot); } catch (e) { return ids; }
  const cutoff = Date.now() - recentDays * 864e5;
  days.forEach(function (day) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!m) return;
    if (new Date(+m[1], +m[2] - 1, +m[3]).getTime() < cutoff) return;
    const dir = path.join(deferredRoot, day);
    let files = [];
    try { files = fs.readdirSync(dir); } catch (e) { return; }
    files.filter(function (f) { return f.indexOf(jobName + '-') === 0 && f.endsWith('.jsonl'); })
      .forEach(function (f) {
        const txt = (function () { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return ''; } })();
        txt.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (l) {
          const rec = (function () { try { return JSON.parse(l); } catch (e) { return null; } })();
          if (rec && rec.tcId) ids[str(rec.tcId)] = true;
        });
      });
  });
  return ids;
}

// ---- read one job's latest allure-results dir -> deduped per-test list ----
function readJobResults(jobDir) {
  let files = [];
  try { files = fs.readdirSync(jobDir).filter(function (f) { return f.endsWith('-result.json'); }); } catch (e) { return null; }
  const byKey = {};   // historyId (or name) -> best (latest stop) result
  files.forEach(function (f) {
    const j = readJson(path.join(jobDir, f));
    if (!j || !j.name || j.stage === 'scheduled') return;
    const key = str(j.historyId) || ('n:' + str(j.name));
    const stop = +j.stop || 0;
    if (!byKey[key] || stop >= (byKey[key]._stop || 0)) byKey[key] = { r: j, _stop: stop };
  });
  const tests = Object.keys(byKey).map(function (k) {
    const j = byKey[k].r;
    const tcId = parseTcId(j.name);
    return {
      tcId: tcId,
      title: titleOf(j.name, tcId),
      section: sectionOf(j.fullName, j.labels),
      status: str(j.status).toLowerCase(),
      error: firstLine(j.statusDetails && j.statusDetails.message),
      stop: byKey[k]._stop,
    };
  });
  return tests;
}

(function () {
  const out = { generatedAt: new Date().toISOString(), jenkinsBase: jenkinsBase, branches: [] };

  let dirs = [];
  try { dirs = fs.readdirSync(resultsRoot); } catch (e) { log('no resultsRoot ' + resultsRoot + '; writing empty.'); }
  const jobs = dirs.filter(function (d) {
    if (d.indexOf(jobPrefix) !== 0) return false;
    try { return fs.statSync(path.join(resultsRoot, d)).isDirectory(); } catch (e) { return false; }
  });

  const cutoff = Date.now() - recentDays * 864e5;
  jobs.forEach(function (jobName) {
    const tests = readJobResults(path.join(resultsRoot, jobName));
    if (!tests || !tests.length) { log('skip ' + jobName + ' (no results).'); return; }
    const lastStop = tests.reduce(function (m, t) { return Math.max(m, t.stop || 0); }, 0);
    if (lastStop && lastStop < cutoff) { log('skip ' + jobName + ' (older than ' + recentDays + 'd).'); return; }

    const deferred = deferredTcIdsForJob(jobName);
    tests.forEach(function (t) {
      // A red lead-assignment spec whose tcId is in a deferred manifest = async pending.
      if (RED[t.status] && t.tcId && deferred[t.tcId]) t.status = 'async';
      delete t.stop;
    });
    tests.sort(function (a, b) { return (a.tcId || a.title).localeCompare(b.tcId || b.title); });

    const passed = tests.filter(function (t) { return t.status === 'passed'; }).length;
    const asyncN = tests.filter(function (t) { return t.status === 'async'; }).length;
    const failed = tests.filter(function (t) { return RED[t.status]; }).length;

    out.branches.push({
      jobName: jobName,
      branch: jobName.replace(/^CRM_Rerun_FixBug_/, 'fix-bug-').replace(/^CRM_Rerun_/, ''),
      buildUrl: jenkinsBase + '/job/' + jobName + '/lastBuild/',
      reportUrl: jenkinsBase + '/job/' + jobName + '/lastSuccessfulBuild/Playwright-Report/',
      date: lastStop ? dstr(lastStop) : '',
      total: tests.length,
      passed: passed,
      failed: failed,
      asyncPending: asyncN,
      tests: tests,
    });
  });

  // Newest verification effort first.
  out.branches.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : a.jobName.localeCompare(b.jobName); });

  try {
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'crm-fix-branches.json'), JSON.stringify(out, null, 2));
    log('wrote ' + out.branches.length + ' branch(es): ' +
        out.branches.map(function (b) { return b.jobName + '(' + b.passed + '/' + b.total + (b.asyncPending ? ',' + b.asyncPending + ' async' : '') + ')'; }).join(', '));
  } catch (e) {
    log('WARNING: could not write crm-fix-branches.json (' + e.message + ').');
  }
  process.exit(0);
})();
