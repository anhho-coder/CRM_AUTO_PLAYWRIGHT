/*
 * Build the data for the WEEKLY "Failed cases trend" sidebar tab.
 *
 * This is a STATEFUL builder. The weekly Allure job regenerates the report several
 * times across the week; this script tracks, for ONE week, the failed test cases
 * that existed at the BEGINNING of the week and how many of them are still failing
 * as they get fixed day by day (a burndown).
 *
 *   - Beginning-of-week snapshot: the FIRST time we see this weekly periodKey, we
 *     freeze the current failed set (count + list + category breakdown).
 *   - Daily burndown series: every run appends/updates one point for "today"
 *     (latest run of the day wins), recording how many of the initial set are still
 *     failing vs already fixed (confirmed passing on re-run).
 *   - Current snapshot: recomputed fresh every run (count + list + categories).
 *
 * State that must survive between the week's runs is kept OUTSIDE the report, in
 *   <stateDir>\<periodKey>.json   (e.g. C:\allure\periods\failed-trend\weekly\2026-W31.json)
 * exactly like the rolling history store. The report-facing file is written to
 *   <reportDir>\crm-failed-trend.json
 * which the client tab (ci/allure-failed-trend-tab.js) fetches and renders.
 *
 * "Failed" = a red test: status in { failed, broken }. Cross-run identity is the
 * stabilised Allure historyId (see ci/allure-stabilize-history-id.js), so a test
 * that fails at the start of the week and passes later is matched and counted fixed.
 *
 * Usage: node ci/allure-build-failed-trend.js <report-dir> <periodKey> <scope> <stateDir>
 * Best-effort: never fails the build (always exits 0).
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const periodKey = (process.argv[3] || '').trim();
const scope     = (process.argv[4] || 'weekly').trim();
const stateDir  = (process.argv[5] || '').trim();

const RED = { failed: 1, broken: 1 };
const MAX_ERR = 500;

function log(m) { console.log('failed-trend: ' + m); }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function str(v) { return v == null ? '' : String(v).trim(); }

function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function firstLine(msg) {
  const s = str(msg).replace(/\r/g, '');
  const line = s.split('\n').map(x => x.trim()).filter(Boolean)[0] || s;
  return line.length > MAX_ERR ? line.slice(0, MAX_ERR - 1) + '…' : line;
}

// uid -> label, mapping each leaf test to the name of its depth-1 tree node
// (top-level child of the tree root). For data/suites.json that depth-1 name is the
// real section (O12, Leads_Assignment, …); for data/categories.json it is the
// Allure category (e.g. "potential defects need to verify").
function mapLeaves(tree) {
  const map = {};
  if (!tree || !Array.isArray(tree.children)) return map;
  tree.children.forEach(function (top) {
    const label = str(top.name);
    (function collect(n) {
      if (n && Array.isArray(n.children) && n.children.length) n.children.forEach(collect);
      else if (n && n.uid && !(n.uid in map)) map[n.uid] = label;
    })(top);
  });
  return map;
}

function keyOf(rec) {
  return rec.historyId ? ('h:' + rec.historyId) : ('n:' + rec.section + '::' + rec.name);
}

function toCase(rec) {
  return {
    key: keyOf(rec),
    section: rec.section || 'Other',
    name: rec.name || '',
    status: rec.status || '',
    category: rec.category || 'Uncategorized',
    error: rec.error || '',
  };
}

function breakdown(cases) {
  const by = {};
  cases.forEach(function (c) { const k = c.category || 'Uncategorized'; by[k] = (by[k] || 0) + 1; });
  return Object.keys(by).sort(function (a, b) { return by[b] - by[a] || a.localeCompare(b); })
    .map(function (k) { return { name: k, count: by[k] }; });
}

// ---- Read the current run: build key -> record for EVERY test (need the current
// status of beginning-of-week tests even after they turn green), plus the red list.
function readCurrent() {
  const suiteMap = mapLeaves(readJson(path.join(reportDir, 'data', 'suites.json')));
  const catMap   = mapLeaves(readJson(path.join(reportDir, 'data', 'categories.json')));

  const tcDir = path.join(reportDir, 'data', 'test-cases');
  const byKey = {};       // key -> representative record (all tests, deduped)
  let files = [];
  try { files = fs.readdirSync(tcDir).filter(f => f.endsWith('.json')); } catch (e) { files = []; }

  files.forEach(function (f) {
    const j = readJson(path.join(tcDir, f));
    if (!j || !j.uid) return;
    // Skip hidden results: Allure marks retry attempts (and other non-representative
    // results) hidden:true, and the UI counts only the ONE representative result per
    // test. Counting hidden retries would massively over-report failures (e.g. a test
    // that failed 4× then passed would add 4 red records). We count representative
    // results only, then dedupe by key below — so totals are PER TEST, matching the
    // Suites/donut counts, on both deduped and retry-carrying reports.
    if (j.hidden === true) return;
    const rec = {
      uid: j.uid,
      historyId: str(j.historyId),
      name: str(j.name),
      status: str(j.status).toLowerCase(),
      section: suiteMap[j.uid] || 'Other',
      category: catMap[j.uid] || 'Uncategorized',
      error: firstLine(j.statusMessage),
    };
    const k = keyOf(rec);
    // One record per key; prefer a red one if a key ever repeats (defensive).
    if (!byKey[k] || (RED[rec.status] && !RED[byKey[k].status])) byKey[k] = rec;
  });

  // Failed set = distinct (deduped) representative red tests.
  const failed = Object.keys(byKey)
    .filter(function (k) { return RED[byKey[k].status]; })
    .map(function (k) { return byKey[k]; });

  return { byKey: byKey, failed: failed, files: files.length };
}

(function () {
  const now = new Date().toISOString();
  const cur = readCurrent();

  if (scope !== 'weekly') {
    // The tab is weekly-only; still emit a minimal file so an accidental inject renders "no data".
    const outMin = { generatedAt: now, period: scope, week: periodKey, unsupported: true };
    try { fs.writeFileSync(path.join(reportDir, 'crm-failed-trend.json'), JSON.stringify(outMin, null, 2)); } catch (e) {}
    log('scope "' + scope + '" is not weekly; wrote placeholder.');
    process.exit(0);
  }

  const curFailedCases = cur.failed.map(toCase);
  const today = todayStr();

  // ---- Load persisted week state (survives between the week's runs) ----
  const statePath = stateDir ? path.join(stateDir, periodKey + '.json') : '';
  let state = statePath ? readJson(statePath) : null;
  if (!state || state.week !== periodKey || !state.beginning) {
    state = {
      week: periodKey,
      beginning: {
        capturedAt: today,
        total: curFailedCases.length,
        categories: breakdown(curFailedCases),
        cases: curFailedCases,
      },
      series: [],
    };
    log('initialised beginning-of-week snapshot: ' + curFailedCases.length + ' failed case(s).');
  }

  const beginning = state.beginning;
  const beginKeys = {};
  beginning.cases.forEach(function (c) { beginKeys[c.key] = c; });

  // ---- Match each beginning case to its CURRENT status ----
  let fixed = 0, stillFailing = 0, notRerun = 0;
  const initialCasesStatus = beginning.cases.map(function (c) {
    const now2 = cur.byKey[c.key];
    const cs = now2 ? now2.status : 'absent';
    const isFixed = cs === 'passed';
    if (isFixed) fixed++;
    else if (RED[cs]) stillFailing++;
    else notRerun++;   // skipped / absent / unknown — not confirmed fixed
    return { key: c.key, section: c.section, name: c.name, initialStatus: c.status, currentStatus: cs, fixed: isFixed };
  });

  const remaining = beginning.total - fixed;
  const newFailures = curFailedCases.filter(function (c) { return !(c.key in beginKeys); });

  const current = {
    capturedAt: today,
    total: curFailedCases.length,
    fixedOfInitial: fixed,
    remainingOfInitial: remaining,
    stillFailing: stillFailing,
    notRerun: notRerun,
    newFailures: newFailures.length,
    categories: breakdown(curFailedCases),
    cases: curFailedCases.map(function (c) { return Object.assign({ inInitial: c.key in beginKeys }, c); }),
  };

  // ---- Upsert today's burndown point (latest run of the day wins) ----
  const point = {
    date: today,
    total: beginning.total,
    remaining: remaining,
    fixed: fixed,
    stillFailing: stillFailing,
    notRerun: notRerun,
    currentTotalFailed: current.total,
  };
  const series = (state.series || []).filter(function (p) { return p.date !== today; });
  series.push(point);
  series.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  state.series = series;

  // ---- Persist state (best-effort) ----
  if (statePath) {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
      log('saved week state -> ' + statePath);
    } catch (e) { log('WARNING: could not save state (' + e.message + ').'); }
  } else {
    log('WARNING: no stateDir given; burndown will not accumulate across runs.');
  }

  // ---- Write the report-facing data file ----
  const out = {
    generatedAt: now,
    period: 'weekly',
    week: periodKey,
    beginning: beginning,
    current: current,
    series: series,
    initialCasesStatus: initialCasesStatus,
  };
  try {
    fs.writeFileSync(path.join(reportDir, 'crm-failed-trend.json'), JSON.stringify(out, null, 2));
    log('wrote crm-failed-trend.json — begin ' + beginning.total + ', fixed ' + fixed +
        ', remaining ' + remaining + ', current red ' + current.total + ' (from ' + cur.files + ' test-cases).');
  } catch (e) {
    log('WARNING: could not write crm-failed-trend.json (' + e.message + ').');
  }
  process.exit(0);
})();
