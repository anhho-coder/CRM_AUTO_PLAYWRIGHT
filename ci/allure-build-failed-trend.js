/*
 * Build the data for the WEEKLY "Failed cases trend" sidebar tab.
 *
 * The two Week-overview "Categories" boxes are the STATIC roll-up of what the week's
 * CRM_Rerun_* FIX BRANCHES set out to fix (read from crm-fix-branches.json, produced
 * by ci/allure-build-fix-branches.js just before this in the pipeline):
 *
 *   - "Categories - Failures this week"  = ALL target specs across every fix branch,
 *     counted PER BRANCH (a spec targeted by two branches counts twice — the total
 *     mirrors the "Verification branches" aggregate target-spec count).
 *   - "Categories - Current status"      = the target specs still NOT resolved. A spec
 *     is RESOLVED when its branch status is 'passed' OR 'async-ok' (the deferred
 *     re-check confirmed the async CRON caught up = a pass).
 *   - Burndown series: a carry-forward aggregate of each branch's own per-build series.
 *
 * (The Overview page's native Allure "Categories - list of failed cases" stays the
 * LIVE current-failure list; THIS tab is the static fix-tracking view.)
 *
 * A per-week category cache (tcId -> category) is kept OUTSIDE the report, in
 *   <stateDir>\<periodKey>.json   (e.g. C:\allure\periods\failed-trend\weekly\2026-W32.json)
 * seeded from every case ever RED in the weekly report this week, so a fix-branch
 * target that has since gone green still shows the category of the failure it fixed.
 * The report-facing file is written to
 *   <reportDir>\crm-failed-trend.json
 * which the client tab (ci/allure-failed-trend-tab.js) fetches and renders.
 *
 * "Failed" = a red test: status in { failed, broken }. tcId is the greppable case id.
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

// Extract the greppable test-case id ("TC.THD_3.2.1.5.2", "CRM-1234") from a test name.
// Used to cross-reference a beginning-of-week failure with the same case re-run on a fix
// branch (crm-fix-branches.json keys tests by tcId, not by the report's historyId).
function parseTcId(name) {
  const m = String(name || '').match(/(TC\.[-\w.]+|CRM-\d+[\w.]*)/);
  return m ? m[1].replace(/[:.]+$/, '') : '';
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

  // ---- Category classifier (mirrors the custom Allure categories in ci/allure-categories.json;
  // first messageRegex match wins). Fallback label for a fix-branch target we have no live or
  // cached category for, derived from whatever error text the branch carries. ----
  const catRules = readJson(path.join(__dirname, 'allure-categories.json')) || [];
  function classify(msg) {
    const m = str(msg);
    if (!m) return '';
    for (let i = 0; i < catRules.length; i++) {
      const rx = catRules[i] && catRules[i].messageRegex;
      if (!rx) continue;
      try { if (new RegExp(rx).test(m)) return catRules[i].name; } catch (e) {}
    }
    return '';
  }

  // Current-report category by tcId (only red cases carry an Allure category).
  const curByTcId = {};
  Object.keys(cur.byKey).forEach(function (k) {
    const r = cur.byKey[k]; const tc = parseTcId(r.name); if (!tc) return;
    if (!curByTcId[tc] || (RED[r.status] && !RED[curByTcId[tc].status])) curByTcId[tc] = r;
  });

  // ---- Persisted per-week category cache: tcId -> category, seeded from every case ever RED in
  // the weekly report this week, so a fix-branch target that has since gone green still shows the
  // category of the failure it fixed. (Migrates the earlier union-state's beginning.cases.) ----
  const statePath = stateDir ? path.join(stateDir, periodKey + '.json') : '';
  let state = statePath ? readJson(statePath) : null;
  if (!state || state.week !== periodKey) state = { week: periodKey, catCache: {}, series: [] };
  if (!state.catCache) state.catCache = {};
  if (state.beginning && Array.isArray(state.beginning.cases)) {
    state.beginning.cases.forEach(function (c) {
      const tc = parseTcId(c.name);
      if (tc && c.category && c.category !== 'Uncategorized' && !state.catCache[tc]) state.catCache[tc] = c.category;
    });
    delete state.beginning;
  }
  curFailedCases.forEach(function (c) {
    const tc = parseTcId(c.name);
    if (tc && c.category && c.category !== 'Uncategorized') state.catCache[tc] = c.category;
  });

  function categoryFor(tcId, err) {
    const live = curByTcId[tcId];
    if (live && RED[live.status] && live.category && live.category !== 'Uncategorized') return live.category;
    if (tcId && state.catCache[tcId]) return state.catCache[tcId];
    return classify(err) || 'Uncategorized';
  }

  // ---- Resolve a fix-branch target to the SAME weekly report's native test, so the tab can
  // deep-link the "Test case" into Categories/Suites for fast debugging. The Allure route id
  // is the test-case uid (== data/test-cases/<uid>.json == the suites/categories tree leaf
  // uid == what "#categories/<uid>" / "#suites/<uid>" navigate to). Many targets carry no
  // tcId, so match by tcId first then by exact test name / title. Prefer the Categories route
  // when the test is in a category; else fall back to Suites (contains every test) so the link
  // is never dead. Also surfaces the native category to fill our 'Uncategorized' gaps. ----
  function stripTcPrefix(s) { return str(s).replace(/^\s*(TC\.[-\w.]+|CRM-\d+[\w.]*)\s*:\s*/, ''); }
  const recByName = {}, recBySecName = {};
  function upsertRec(map, key, r) {
    if (!key) return;
    if (!map[key] || (RED[r.status] && !RED[map[key].status])) map[key] = r;   // red-preferred
  }
  // Index each weekly record under BOTH its full name AND its tcId-stripped name (and the
  // same section-scoped), so a target carrying only a stripped title (no tcId) still matches
  // a "TC.x: title" weekly record, and vice-versa.
  Object.keys(cur.byKey).forEach(function (k) {
    const r = cur.byKey[k];
    if (!r.name) return;
    const bare = stripTcPrefix(r.name), sec = str(r.section);
    upsertRec(recByName, r.name, r);
    upsertRec(recByName, bare, r);
    upsertRec(recBySecName, sec + '||' + r.name, r);
    upsertRec(recBySecName, sec + '||' + bare, r);
  });
  // Match by tcId first; else by SECTION+name (guards against two suites sharing a title),
  // then fall back to name-only. Both the target title and the index keys are tried raw and
  // tcId-stripped. uid resolves the same-report Allure route.
  function resolveNative(section, tcId, title) {
    const t = str(title), sec = str(section), bt = stripTcPrefix(t);
    const r = (tcId && curByTcId[tcId]) ||
              recBySecName[sec + '||' + t] || recBySecName[sec + '||' + bt] ||
              recByName[t] || recByName[bt] ||
              recByName[(tcId ? tcId + ': ' : '') + t] || null;
    if (!r || !r.uid) return { uid: '', route: '', nativeCategory: '' };
    const inCat = r.category && r.category !== 'Uncategorized';
    return { uid: r.uid, route: (inCat ? 'categories/' : 'suites/') + r.uid, nativeCategory: r.category || '' };
  }

  // ---- "Failures this week" = ALL target specs across the week's CRM_Rerun_* fix branches
  // (crm-fix-branches.json), counted PER BRANCH. RESOLVED = branch status 'passed' or 'async-ok'
  // (deferred re-check confirmed = a pass, per team rule). ----
  const RESOLVED = { passed: 1, 'async-ok': 1 };
  const fb = readJson(path.join(reportDir, 'crm-fix-branches.json'));
  const branches = (fb && Array.isArray(fb.branches)) ? fb.branches : [];
  const targets = [];
  branches.forEach(function (b) {
    (b.tests || []).forEach(function (t, ti) {
      const tcId = str(t.tcId);
      const title = str(t.title);
      const nat = resolveNative(t.section, tcId, title);
      let cat = categoryFor(tcId, t.error);
      if ((!cat || cat === 'Uncategorized') && nat.nativeCategory && nat.nativeCategory !== 'Uncategorized') cat = nat.nativeCategory;
      targets.push({
        key: b.jobName + '::' + ti + '::' + (tcId || title),
        section: str(t.section) || 'Other',
        name: (tcId ? tcId + ': ' : '') + title,
        status: str(t.status).toLowerCase(),
        category: cat,
        error: str(t.error),
        branch: b.jobName,
        branchRef: str(b.branch),
        build: b.build,
        buildUrl: str(b.buildUrl),
        runDate: str(b.date),
        uid: nat.uid,
        route: nat.route,
      });
    });
  });

  const beginning = { capturedAt: today, total: targets.length, categories: breakdown(targets), cases: targets };

  // ---- Resolve each target spec's status (branch verdict is authoritative) ----
  let fixed = 0, remaining = 0;
  const initialCasesStatus = targets.map(function (c) {
    const isFixed = !!RESOLVED[c.status];
    if (isFixed) fixed++; else remaining++;
    return { key: c.key, section: c.section, name: c.name, initialStatus: c.status, currentStatus: c.status, fixed: isFixed, confirmedByBranch: c.status === 'async-ok' };
  });
  const remainingCases = targets.filter(function (c) { return !RESOLVED[c.status]; });

  const current = {
    capturedAt: today,
    total: remainingCases.length,
    fixedOfInitial: fixed,
    remainingOfInitial: remaining,
    stillFailing: targets.filter(function (c) { return RED[c.status]; }).length,
    notRerun: targets.filter(function (c) { return !RESOLVED[c.status] && !RED[c.status]; }).length,
    newFailures: 0,
    confirmedByBranch: targets.filter(function (c) { return c.status === 'async-ok'; }).length,
    categories: breakdown(remainingCases),
    cases: remainingCases.map(function (c) { return Object.assign({ inInitial: true }, c); }),
  };

  // ---- Burndown series = carry-forward aggregate of each branch's own per-build series, so the
  // Trend chart matches the "Verification branches" aggregate. ----
  const dset = {};
  branches.forEach(function (b) { (b.series || []).forEach(function (p) { dset[p.date] = 1; }); });
  const series = Object.keys(dset).sort().map(function (d) {
    const acc = { date: d, total: 0, remaining: 0, fixed: 0, stillFailing: 0, notRerun: 0, currentTotalFailed: 0 };
    branches.forEach(function (b) {
      let pt = null; (b.series || []).forEach(function (p) { if (p.date <= d) pt = p; });
      if (pt) { acc.fixed += pt.fixed; acc.stillFailing += pt.stillFailing; acc.notRerun += pt.notRerun; acc.total += pt.total; acc.remaining += pt.remaining; }
    });
    acc.currentTotalFailed = acc.remaining;
    return acc;
  });

  // ---- Persist state (category cache + latest series; best-effort) ----
  state.series = series;
  if (statePath) {
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
      log('saved week state -> ' + statePath);
    } catch (e) { log('WARNING: could not save state (' + e.message + ').'); }
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
    log('wrote crm-failed-trend.json — failures-this-week ' + beginning.total + ', fixed ' + fixed +
        ', remaining ' + remaining + ' (from ' + branches.length + ' branch(es); ' + cur.files + ' test-cases scanned).');
  } catch (e) {
    log('WARNING: could not write crm-failed-trend.json (' + e.message + ').');
  }
  process.exit(0);
})();
