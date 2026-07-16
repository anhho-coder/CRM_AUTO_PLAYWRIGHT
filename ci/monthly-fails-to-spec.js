// Resolve the FAILED / BROKEN test cases on a frozen MONTHLY Allure report into a
// per-suite re-run plan that the CRM-Rerun-Monthly-Fails job executes.
//
// Source of truth = the frozen monthly report the CRM-Allure-Monthly job writes to disk:
//     C:\allure\periods\report\monthly\<yyyy-MM>\data\suites.json           (deduped Section-2 tree)
//     C:\allure\periods\report\monthly\<yyyy-MM>\data\test-cases\<uid>.json (per-test fullName)
// We read the SAME deduped "latest result per suite" set the report shows (not the raw
// all-runs), so the re-run targets exactly the red/broken cells the tester sees.
//
// Why filter by FILENAME and not full path: O12 folders contain a literal "->" (U+2192)
// arrow and one CMR spec contains "%", both of which corrupt / mis-parse when passed
// through a Windows `bat` command line. A Playwright positional argument is matched as a
// regex against the whole test-file path, so passing the ASCII spec BASENAME (e.g.
// "tc-a-4-3-2-assign-salesteam-eam-salesperson-bilal.spec.ts") reliably selects the file
// without any non-ASCII / cmd-special character ever reaching the shell.
//
// Env in:
//   MONTH        latest | previous | current | yyyy-MM   (default: latest folder on disk)
//   STATUSES     comma list of allure statuses to re-run (default: failed,broken)
//   SUITE        all | <SuiteName>                        (default: all)   -- informational; the
//                Jenkinsfile does the SUITE filtering, we always emit every suite that has fails.
//   MONTHLY_REPORT_ROOT   override the report root (default: C:\allure\periods\report\monthly)
//
// Writes into <cwd>/rerun/:
//   _suites.txt        one "<SuiteName> <failCount>" line per suite that has fails
//   <SuiteName>.txt    space-joined, double-quoted basename filters for that suite
//   _summary.txt       human-readable breakdown (echoed into the build log)
// Exit non-zero only on a hard error (report/month not found, no data).

'use strict';
const fs = require('fs');
const path = require('path');

const REPORT_ROOT = process.env.MONTHLY_REPORT_ROOT || 'C:\\allure\\periods\\report\\monthly';
const MONTH = (process.env.MONTH || 'latest').trim();
const STATUSES = (process.env.STATUSES || 'failed,broken')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// Section (Playwright project) name -> its testDir, used to rebuild a repo-root path when a
// test's fullName was recorded relative to the section testDir (section-project runs) rather
// than the repo root (SPEC / chrome-headless runs).
const TESTDIR = {
  SalesReport_Performance: 'tests/1.Project_CRM/1.SalesReport_Performance',
  Leads_Assignment:        'tests/1.Project_CRM/2.Leads_Assignment',
  Lead_Merging:            'tests/1.Project_CRM/3.Lead_Merging',
  Investments:             'tests/1.Project_CRM/4.Investments',
  CRM_Module:              'tests/1.Project_CRM/9.CRM_Module',
  O12:                     'tests/1.Project_CRM/O12_CE_to_O12_CC',
};

function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }
function pad2(n) { return String(n).padStart(2, '0'); }
function ym(y, m0) { return y + '-' + pad2(m0 + 1); }   // m0 = 0-based month

function listMonthDirs() {
  if (!fs.existsSync(REPORT_ROOT)) return [];
  return fs.readdirSync(REPORT_ROOT)
    .filter(n => /^\d{4}-\d{2}$/.test(n))
    .sort();
}

// ---- resolve which month folder to read ----
let monthKey;
if (/^\d{4}-\d{2}$/.test(MONTH)) {
  monthKey = MONTH;
} else {
  const now = new Date();
  if (MONTH === 'current') {
    monthKey = ym(now.getFullYear(), now.getMonth());
  } else if (MONTH === 'previous') {
    const p = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    monthKey = ym(p.getFullYear(), p.getMonth());
  } else { // 'latest' (default) -> newest yyyy-MM folder present on disk
    const dirs = listMonthDirs();
    if (!dirs.length) fail('No monthly report folders under ' + REPORT_ROOT + ' (run CRM-Allure-Monthly first).');
    monthKey = dirs[dirs.length - 1];
  }
}

const dataDir = path.join(REPORT_ROOT, monthKey, 'data');
const suitesFile = path.join(dataDir, 'suites.json');
if (!fs.existsSync(suitesFile)) {
  const avail = listMonthDirs();
  fail('Monthly report not found: ' + suitesFile +
       '\n  MONTH=' + MONTH + ' resolved to ' + monthKey +
       '\n  Available months: ' + (avail.length ? avail.join(', ') : '(none)'));
}

const suites = JSON.parse(fs.readFileSync(suitesFile, 'utf8'));

// ---- walk the deduped suites tree; collect failed/broken leaves with their top suite ----
const bySuite = {};   // suiteName -> { basenames:Set, tests:[{status,name,repoPath}] }
function walk(node, top) {
  const children = node.children;
  if (children && children.length) {
    const nextTop = top || node.name;   // first level under root = the section suite
    for (const c of children) walk(c, nextTop);
  } else if (STATUSES.includes((node.status || '').toLowerCase())) {
    const suite = top || '(unknown)';
    (bySuite[suite] || (bySuite[suite] = { basenames: new Set(), tests: [] }))
      ._pending = (bySuite[suite]._pending || []).concat([{ uid: node.uid, status: node.status, name: node.name }]);
  }
}
for (const c of (suites.children || [])) walk(c, '');

// ---- resolve each uid -> repo-root spec path -> ASCII basename filter ----
function repoPathFromFullName(fullName, suite) {
  let raw = (fullName || '').replace(/\\/g, '/').replace(/:\d+:\d+\s*$/, '');
  const i = raw.indexOf('tests/');
  if (i >= 0) return raw.slice(i);                       // already repo-root relative
  const td = TESTDIR[suite];
  return td ? td + '/' + raw : raw;                      // testDir-relative -> prepend section dir
}

let total = 0;
for (const suite of Object.keys(bySuite)) {
  const d = bySuite[suite];
  for (const t of (d._pending || [])) {
    let full = '';
    try {
      const tc = JSON.parse(fs.readFileSync(path.join(dataDir, 'test-cases', t.uid + '.json'), 'utf8'));
      full = tc.fullName || '';
    } catch (e) { /* fall back to name below */ }
    const repoPath = repoPathFromFullName(full, suite);
    const base = repoPath.split('/').pop();
    if (base && /\.spec\.ts$/.test(base)) {
      d.basenames.add(base);
      d.tests.push({ status: t.status, name: t.name, repoPath: repoPath });
      total++;
    } else {
      console.error('WARN: could not resolve a spec file for uid ' + t.uid + ' (' + t.name + ')');
    }
  }
  delete d._pending;
}

// ---- write the plan ----
const outDir = path.join(process.cwd(), 'rerun');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const suiteNames = Object.keys(bySuite).filter(s => bySuite[s].basenames.size).sort();
const suitesLines = [];
const summary = [];
summary.push('Monthly re-run plan');
summary.push('  report month : ' + monthKey + '   (MONTH=' + MONTH + ')');
summary.push('  statuses     : ' + STATUSES.join(', '));
summary.push('  total tests  : ' + total + '   across ' + suiteNames.length + ' suite(s)');
summary.push('');

for (const suite of suiteNames) {
  const d = bySuite[suite];
  const bases = [...d.basenames].sort();
  const filters = bases.map(b => '"' + b + '"').join(' ');
  fs.writeFileSync(path.join(outDir, suite + '.txt'), filters, 'utf8');
  suitesLines.push(suite + ' ' + d.tests.length);
  summary.push('## ' + suite + '  (' + d.tests.length + ' tests, ' + bases.length + ' spec files)');
  for (const t of d.tests.sort((a, b) => a.name.localeCompare(b.name))) {
    summary.push('   [' + t.status + '] ' + t.name);
  }
  summary.push('');
}

fs.writeFileSync(path.join(outDir, '_suites.txt'), suitesLines.join('\n') + (suitesLines.length ? '\n' : ''), 'utf8');
fs.writeFileSync(path.join(outDir, '_summary.txt'), summary.join('\n'), 'utf8');

// Echo to the build log (stdout is captured by Jenkins).
console.log(summary.join('\n'));
console.log('PLAN_MONTH=' + monthKey);
console.log('PLAN_TOTAL=' + total);
console.log('PLAN_SUITES=' + suiteNames.join(','));

// Zero fails is a GOOD outcome (the whole month was green) -> exit 0 with an empty plan;
// the Jenkinsfile's Run stage sees no suites and finishes the build green.
if (!total) { console.log('\nNo ' + STATUSES.join('/') + ' tests on the ' + monthKey + ' monthly report - nothing to re-run.'); }
