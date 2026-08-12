/*
 * Build the data for the "Fix branches" sub-tabs on the weekly "Failed cases trend" tab.
 *
 * Strategy: the team verifies / re-runs specific failed cases on dedicated per-effort
 * Jenkins jobs named CRM_Rerun_* (each building its own fix branch, e.g.
 * CRM_Rerun_FixBug_2026-08-03 -> branch fix-bug-2026-08-03). Each build stashes its raw
 * Allure results to a DATED bucket  <periodsResultsRoot>\<yyyy-MM-dd>\<JOB>\<BUILD>\  (the
 * main Jenkinsfile does this for every build). This script scans ONLY the dated buckets
 * for the DAYS OF THE REPORT'S WEEK (passed in), so each weekly report shows only the
 * verification jobs that ran DURING that week; per job it takes the latest build in the
 * window. It writes <reportDir>\crm-fix-branches.json -> one sub-tab per job with a
 * per-spec pass/fail table.
 *
 * THD / lead-assignment async: a spec that FAILED inline only because the Sales-Team CRON
 * had not assigned yet is NOT a real fail — the run drops a deferred-verify manifest
 * (<deferredRoot>\<day>\<JOB>-<build>.jsonl) that the CRM_Leads_Assignment_DeferredVerify
 * job re-checks ~1h later. Such a failed spec (its tcId present in a manifest for that job,
 * on a day in the window) is reported as status "async" (pending re-check), not "failed".
 *
 * Usage:
 *   node ci/allure-build-fix-branches.js <reportDir> <periodsResultsRoot> <deferredRoot> <jenkinsBase> <jobPrefix> <daysCsv>
 * Defaults: periodsResultsRoot=C:\allure\periods\results, deferredRoot=C:\deferred-verify,
 *           jenkinsBase=http://10.8.81.44:8080, jobPrefix=CRM_Rerun_, daysCsv='' (=> no branches).
 * Best-effort: never fails the build (always exits 0).
 */
const fs = require('fs');
const path = require('path');
const { createResolver, legacyKey } = require('./allure-test-identity');

const reportDir         = process.argv[2] || 'allure-report';
const periodsResultsRoot = process.argv[3] || 'C:\\allure\\periods\\results';
const deferredRoot      = process.argv[4] || 'C:\\deferred-verify';
const jenkinsBase       = (process.argv[5] || 'http://10.8.81.44:8080').replace(/\/+$/, '');
const jobPrefix         = process.argv[6] || 'CRM_Rerun_';
const daysCsv           = process.argv[7] || '';
const jenkinsHome       = process.argv[8] || 'C:\\ProgramData\\Jenkins\\.jenkins';
const repoRoot          = process.argv[9] || path.join(__dirname, '..');
const DV_JOB            = 'CRM_Leads_Assignment_DeferredVerify';

// One identity per spec FILE, twins kept apart - see ci/allure-test-identity.js.
const identity = createResolver(repoRoot);
function identityKey(j) { return identity.ready ? identity.testKey(j) : legacyKey(j); }

const RED = { failed: 1, broken: 1 };
const days = daysCsv.split(',').map(function (d) { return d.trim(); }).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); });

function log(m) { console.log('fix-branches: ' + m); }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function readdir(p) { try { return fs.readdirSync(p); } catch (e) { return []; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
function str(v) { return v == null ? '' : String(v).trim(); }
function firstLine(msg) {
  const s = str(msg).replace(/\r/g, '');
  const line = s.split('\n').map(function (x) { return x.trim(); }).filter(Boolean)[0] || s;
  return line.length > 400 ? line.slice(0, 399) + '…' : line;
}
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
  const hay = str(fullName) + ' ' + (labels || []).map(function (l) { return l.value; }).join(' ');
  if (/O12_CE_to_O12_CC/i.test(hay)) return 'O12';
  if (/Leads_Assignment/i.test(hay)) return 'Leads_Assignment';
  if (/Lead_Merging/i.test(hay)) return 'Lead_Merging';
  if (/CRM_Module/i.test(hay)) return 'CRM_Module';
  if (/Investment/i.test(hay)) return 'Investments';
  if (/SalesReport|Performance/i.test(hay)) return 'SalesReport_Performance';
  return '';
}

// tcIds (for a job) that have a deferred-verify manifest on any day of the window.
function deferredTcIdsForJob(jobName) {
  const ids = {};
  days.forEach(function (day) {
    const dir = path.join(deferredRoot, day);
    readdir(dir).filter(function (f) { return f.indexOf(jobName + '-') === 0 && f.endsWith('.jsonl'); })
      .forEach(function (f) {
        (function () { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return ''; } })()
          .split('\n').map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (l) {
            const rec = (function () { try { return JSON.parse(l); } catch (e) { return null; } })();
            if (rec && rec.tcId) ids[str(rec.tcId)] = true;
          });
      });
  });
  return ids;
}

// Per-tcId verdict from the CRM_Leads_Assignment_DeferredVerify job's build console logs
// (round-2 authoritative re-check). Each build logs one line per checkpoint:
//   "  PASS TC.THD_3.2.1.5.2 [sales_team] expected=... now=..."   (or FAIL / DEAD)
// A tcId is 'confirmed' when its LATEST deferred build had all its fields PASS (the async
// CRON caught up); 'stillwrong' when the latest still had a FAIL. Read straight off the
// agent's Jenkins home (this build runs on the agent). Best-effort: unreadable -> {} ->
// the spec stays "async" (pending), never a crash.
function deferredVerdicts() {
  const latest = {};   // tcId -> 'confirmed' | 'stillwrong'  (later build wins)
  const buildsDir = path.join(jenkinsHome, 'jobs', DV_JOB, 'builds');
  const builds = readdir(buildsDir).filter(function (b) { return /^\d+$/.test(b); })
    .map(Number).sort(function (a, b) { return a - b; });
  builds.slice(-50).forEach(function (n) {
    let txt = '';
    try { txt = fs.readFileSync(path.join(buildsDir, String(n), 'log'), 'utf8'); } catch (e) { return; }
    const thisBuild = {};   // tcId -> {pass, fail}
    txt.split('\n').forEach(function (line) {
      const m = line.match(/\b(PASS|FAIL)\s+(TC\.[-\w.]+|CRM-\d+[\w.]*)\s+\[/);
      if (!m) return;
      const tc = m[2].replace(/[:.]+$/, '');
      if (!thisBuild[tc]) thisBuild[tc] = { pass: 0, fail: 0 };
      if (m[1] === 'PASS') thisBuild[tc].pass++; else thisBuild[tc].fail++;
    });
    Object.keys(thisBuild).forEach(function (tc) {
      const v = thisBuild[tc];
      latest[tc] = (v.fail === 0 && v.pass > 0) ? 'confirmed' : 'stillwrong';   // later build overrides
    });
  });
  return latest;
}

// All {day, build, dir} for a job across the window's dated buckets, chronological.
function allBuildsInWindow(jobName) {
  const out = [];
  days.forEach(function (day) {
    const jobDay = path.join(periodsResultsRoot, day, jobName);
    readdir(jobDay).filter(function (b) { return /^\d+$/.test(b) && isDir(path.join(jobDay, b)); })
      .forEach(function (b) { out.push({ day: day, build: parseInt(b, 10), dir: path.join(jobDay, b) }); });
  });
  out.sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : a.build - b.build; });
  return out;
}

// Refine a test list with the async/deferred logic (in place): a red lead-assignment
// spec whose tcId has a deferred manifest becomes async-ok (round-2 confirmed) / failed
// (still wrong after re-check) / async (pending, not re-checked yet).
function applyAsync(tests, deferred, dv) {
  tests.forEach(function (t) {
    if (RED[t.status] && t.tcId && deferred[t.tcId]) {
      const v = dv[t.tcId];
      t.status = v === 'confirmed' ? 'async-ok' : v === 'stillwrong' ? 'failed' : 'async';
    }
  });
  return tests;
}
function countStatuses(tests) {
  return {
    total: tests.length,
    passed: tests.filter(function (t) { return t.status === 'passed'; }).length,
    asyncOk: tests.filter(function (t) { return t.status === 'async-ok'; }).length,
    asyncPending: tests.filter(function (t) { return t.status === 'async'; }).length,
    failed: tests.filter(function (t) { return RED[t.status]; }).length,
  };
}

// Read one build's allure-results dir -> deduped-by-historyId per-test list.
function readResultsDir(dir) {
  const byKey = {};
  readdir(dir).filter(function (f) { return f.endsWith('-result.json'); }).forEach(function (f) {
    const j = readJson(path.join(dir, f));
    if (!j || !j.name || j.stage === 'scheduled') return;
    // These are RAW per-build results, so allure-playwright's own historyId is normally present.
    // When it is missing, fall back to the SPEC-QUALIFIED identity, never to the bare title: the
    // repo keeps 13 duplicated specs (same TC title under 2.Leads_Assignment and under
    // O12_CE_to_O12_CC), and a title-only key would fuse the two copies into one row - one copy's
    // pass would then hide the other copy's fail in the Fix-branches table.
    const key = str(j.historyId) || ('k:' + identityKey(j));
    const stop = +j.stop || 0;
    if (!byKey[key] || stop >= (byKey[key]._stop || 0)) byKey[key] = { r: j, _stop: stop };
  });
  return Object.keys(byKey).map(function (k) {
    const j = byKey[k].r;
    const tcId = parseTcId(j.name);
    return {
      tcId: tcId,
      title: titleOf(j.name, tcId),
      section: sectionOf(j.fullName, j.labels),
      status: str(j.status).toLowerCase(),
      error: firstLine(j.statusDetails && j.statusDetails.message),
    };
  });
}

(function () {
  const out = { generatedAt: new Date().toISOString(), jenkinsBase: jenkinsBase, week: days.length ? (days[0] + '..' + days[days.length - 1]) : '', branches: [] };

  if (!days.length) {
    log('no week days given; writing empty (feature is weekly-only).');
    try { fs.mkdirSync(reportDir, { recursive: true }); fs.writeFileSync(path.join(reportDir, 'crm-fix-branches.json'), JSON.stringify(out, null, 2)); } catch (e) {}
    process.exit(0);
  }

  // Discover CRM_Rerun_* jobs that ran on any day of the report's week.
  const jobsSet = {};
  days.forEach(function (day) {
    const dayDir = path.join(periodsResultsRoot, day);
    readdir(dayDir).filter(function (d) { return d.indexOf(jobPrefix) === 0 && isDir(path.join(dayDir, d)); })
      .forEach(function (d) { jobsSet[d] = true; });
  });

  const dv = deferredVerdicts();

  Object.keys(jobsSet).forEach(function (jobName) {
    const allB = allBuildsInWindow(jobName);
    if (!allB.length) return;
    const deferred = deferredTcIdsForJob(jobName);

    // Burndown series: one point per build in the window (chronological) so the branch
    // sub-tab can show a trend of its target specs being fixed across re-runs.
    const series = allB.map(function (bd) {
      const c = countStatuses(applyAsync(readResultsDir(bd.dir), deferred, dv));
      const resolved = c.passed + c.asyncOk;   // async-confirmed (deferred re-check passed) counts as resolved
      return { date: bd.day, build: bd.build, fixed: resolved, stillFailing: c.failed, notRerun: c.asyncPending, total: c.total, remaining: c.total - resolved };
    });

    // Latest build -> the per-spec table + headline counts.
    const latest = allB[allB.length - 1];
    const tests = applyAsync(readResultsDir(latest.dir), deferred, dv);
    if (!tests.length) { log('skip ' + jobName + ' (no results in window).'); return; }
    tests.sort(function (a, b) { return (a.tcId || a.title).localeCompare(b.tcId || b.title); });
    const c = countStatuses(tests);

    out.branches.push({
      jobName: jobName,
      branch: jobName.replace(/^CRM_Rerun_FixBug_/, 'fix-bug-').replace(/^CRM_Rerun_/, ''),
      buildUrl: jenkinsBase + '/job/' + jobName + '/' + latest.build + '/',
      date: latest.day,
      build: latest.build,
      total: c.total,
      passed: c.passed,
      failed: c.failed,
      asyncPending: c.asyncPending,
      asyncConfirmed: c.asyncOk,
      series: series,
      tests: tests,
    });
  });

  // Newest verification effort first.
  out.branches.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : a.jobName.localeCompare(b.jobName); });

  try {
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'crm-fix-branches.json'), JSON.stringify(out, null, 2));
    log('wrote ' + out.branches.length + ' branch(es) for week ' + out.week + ': ' +
        out.branches.map(function (b) { return b.jobName + '#' + b.build + '(' + b.passed + '/' + b.total + (b.asyncConfirmed ? ',' + b.asyncConfirmed + ' async-ok' : '') + (b.asyncPending ? ',' + b.asyncPending + ' async' : '') + ')'; }).join(', '));
  } catch (e) {
    log('WARNING: could not write crm-fix-branches.json (' + e.message + ').');
  }
  process.exit(0);
})();
