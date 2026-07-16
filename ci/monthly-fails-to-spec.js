// Resolve the FAILED / BROKEN test cases on a frozen MONTHLY Allure report into a
// per-suite re-run plan that the CRM-Rerun-Monthly-Fails job executes.
//
// By default it re-runs ONLY the failures with an ABNORMAL cause (environment / abort /
// timeout) - the ones a re-run can plausibly turn green - and SKIPS the failures that reached
// a business check and disagreed (expect() assertions, thrown "not found / should be" errors),
// which are the real-defect / known-bug failures that a re-run just reproduces. Widen or flip
// with MODE (see below).
//
// Source of truth = the frozen monthly report the CRM-Allure-Monthly job writes to disk:
//     C:\allure\periods\report\monthly\<yyyy-MM>\data\suites.json           (deduped Section-2 tree)
//     C:\allure\periods\report\monthly\<yyyy-MM>\data\test-cases\<uid>.json (per-test fullName + statusMessage)
// We read the SAME deduped "latest result per suite" set the report shows.
//
// Why filter by FILENAME and not full path: O12 folders contain a literal "->" (U+2192) arrow
// and one CMR spec contains "%", both of which corrupt / mis-parse through a Windows `bat`
// command line. A Playwright positional arg is matched as a regex against the whole test-file
// path, so passing the ASCII spec BASENAME reliably selects the file (even if it has moved
// folders since the report was frozen) without any non-ASCII / cmd-special char reaching cmd.
//
// Env in:
//   MONTH        latest | previous | current | yyyy-MM   (default: latest folder on disk)
//   STATUSES     allure statuses to consider (default: failed,broken)
//   MODE         abnormal | all | defect                 (default: abnormal)
//                  abnormal = re-run env/aborted/timeout/unclassified failures only
//                  defect   = only the assertion / business-error (real-defect-like) failures
//                  all      = every failed/broken case (no cause filtering)
//   SUITE        all | <SuiteName>  (informational; the Jenkinsfile does SUITE selection)
//   MONTHLY_REPORT_ROOT   override the report root (default: C:\allure\periods\report\monthly)
//
// Writes into <cwd>/rerun/:
//   _suites.txt         one "<SuiteName> <includedCount>" line per suite with cases to re-run
//   <SuiteName>.txt     space-joined double-quoted spec basenames to re-run for that suite
//   _summary.txt        human-readable breakdown (echoed into the build log)
//   _classification.txt every failure with its cause category + include/exclude decision

'use strict';
const fs = require('fs');
const path = require('path');

const REPORT_ROOT = process.env.MONTHLY_REPORT_ROOT || 'C:\\allure\\periods\\report\\monthly';
const MONTH = (process.env.MONTH || 'latest').trim();
const MODE = (process.env.MODE || 'abnormal').trim().toLowerCase();
const STATUSES = (process.env.STATUSES || 'failed,broken')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const TESTDIR = {
  SalesReport_Performance: 'tests/1.Project_CRM/1.SalesReport_Performance',
  Leads_Assignment:        'tests/1.Project_CRM/2.Leads_Assignment',
  Lead_Merging:            'tests/1.Project_CRM/3.Lead_Merging',
  Investments:             'tests/1.Project_CRM/4.Investments',
  CRM_Module:              'tests/1.Project_CRM/9.CRM_Module',
  O12:                     'tests/1.Project_CRM/O12_CE_to_O12_CC',
};

// Cause categories treated as ABNORMAL (a re-run can plausibly turn them green).
const ABNORMAL = new Set(['env', 'aborted', 'timeout', 'empty', 'unknown']);

// Classify a failure from its Allure statusMessage. Order matters: infra signals win over the
// generic "Error:" / "expect(" checks so a "page.goto: net::ERR_*" is env, not business-error.
function classify(msgRaw) {
  const s = (msgRaw || '').toLowerCase();
  if (/net::err_|err_connection|err_name_not_resolved|err_network_changed|err_internet_disconnected|err_timed_out|err_empty_response|err_aborted/.test(s)) return 'env';
  if (/test ended|has been closed|target page, context or browser/.test(s)) return 'aborted';
  if (/test timeout of|timeouterror|timeout \d+ms exceeded|waitforurl|waitfor: timeout/.test(s)) return 'timeout';
  if (/expect\(/.test(s)) return 'assertion';
  if (/^error:/.test(s)) return 'business-error';
  if (!s.trim()) return 'empty';
  return 'unknown';
}
function included(cat) {
  if (MODE === 'all') return true;
  if (MODE === 'defect') return !ABNORMAL.has(cat);
  return ABNORMAL.has(cat);   // 'abnormal' (default)
}

function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }
function pad2(n) { return String(n).padStart(2, '0'); }
function ym(y, m0) { return y + '-' + pad2(m0 + 1); }

function listMonthDirs() {
  if (!fs.existsSync(REPORT_ROOT)) return [];
  return fs.readdirSync(REPORT_ROOT).filter(n => /^\d{4}-\d{2}$/.test(n)).sort();
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
  } else {
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
if (!['abnormal', 'all', 'defect'].includes(MODE)) fail('MODE must be abnormal | all | defect (got "' + MODE + '").');

const suites = JSON.parse(fs.readFileSync(suitesFile, 'utf8'));

// ---- walk the deduped suites tree; collect failed/broken leaves with their top suite ----
const bySuite = {};
function walk(node, top) {
  const children = node.children;
  if (children && children.length) {
    const nextTop = top || node.name;
    for (const c of children) walk(c, nextTop);
  } else if (STATUSES.includes((node.status || '').toLowerCase())) {
    const suite = top || '(unknown)';
    (bySuite[suite] || (bySuite[suite] = { basenames: new Set(), tests: [] }))
      ._pending = (bySuite[suite]._pending || []).concat([{ uid: node.uid, status: node.status, name: node.name }]);
  }
}
for (const c of (suites.children || [])) walk(c, '');

// ---- resolve each uid -> repo path + cause category + include decision ----
function repoPathFromFullName(fullName, suite) {
  let raw = (fullName || '').replace(/\\/g, '/').replace(/:\d+:\d+\s*$/, '');
  const i = raw.indexOf('tests/');
  if (i >= 0) return raw.slice(i);
  const td = TESTDIR[suite];
  return td ? td + '/' + raw : raw;
}

let totalFails = 0, totalIncluded = 0;
const catCount = {};
for (const suite of Object.keys(bySuite)) {
  const d = bySuite[suite];
  for (const t of (d._pending || [])) {
    let full = '', msg = '';
    try {
      const tc = JSON.parse(fs.readFileSync(path.join(dataDir, 'test-cases', t.uid + '.json'), 'utf8'));
      full = tc.fullName || '';
      msg = (tc.statusMessage || '').replace(/\s+/g, ' ').trim();
    } catch (e) { /* fall through */ }
    const repoPath = repoPathFromFullName(full, suite);
    const base = repoPath.split('/').pop();
    if (!(base && /\.spec\.ts$/.test(base))) {
      console.error('WARN: could not resolve a spec file for uid ' + t.uid + ' (' + t.name + ')');
      continue;
    }
    const cat = classify(msg);
    const inc = included(cat);
    catCount[cat] = (catCount[cat] || 0) + 1;
    totalFails++;
    if (inc) { d.basenames.add(base); totalIncluded++; }
    d.tests.push({ status: t.status, name: t.name, cat: cat, inc: inc, msg: msg.slice(0, 140) });
  }
  delete d._pending;
}

// ---- write the plan ----
const outDir = path.join(process.cwd(), 'rerun');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const suiteNames = Object.keys(bySuite).sort();
const suitesLines = [];       // only suites that actually have INCLUDED specs
const summary = [];
const classif = [];

summary.push('Monthly re-run plan');
summary.push('  report month : ' + monthKey + '   (MONTH=' + MONTH + ')');
summary.push('  statuses     : ' + STATUSES.join(', '));
summary.push('  mode         : ' + MODE + '   (abnormal = env/aborted/timeout only)');
summary.push('  failures     : ' + totalFails + ' total  ->  ' + totalIncluded + ' selected to re-run');
summary.push('  by cause     : ' + Object.keys(catCount).sort().map(k => k + '=' + catCount[k]).join('  '));
summary.push('');

for (const suite of suiteNames) {
  const d = bySuite[suite];
  const bases = [...d.basenames].sort();
  const incCount = d.tests.filter(t => t.inc).length;
  if (bases.length) {
    fs.writeFileSync(path.join(outDir, suite + '.txt'), bases.map(b => '"' + b + '"').join(' '), 'utf8');
    suitesLines.push(suite + ' ' + incCount);
  }
  summary.push('## ' + suite + '  (' + incCount + ' to re-run / ' + d.tests.length + ' failed)');
  for (const t of d.tests.sort((a, b) => a.name.localeCompare(b.name))) {
    summary.push('   ' + (t.inc ? '[RE-RUN]' : '[ skip ]') + ' (' + t.cat + ') ' + t.name);
    classif.push([suite, t.status, t.cat, (t.inc ? 'RERUN' : 'SKIP'), t.name, t.msg].join(' | '));
  }
  summary.push('');
}

fs.writeFileSync(path.join(outDir, '_suites.txt'), suitesLines.join('\n') + (suitesLines.length ? '\n' : ''), 'utf8');
fs.writeFileSync(path.join(outDir, '_summary.txt'), summary.join('\n'), 'utf8');
fs.writeFileSync(path.join(outDir, '_classification.txt'), classif.join('\n') + '\n', 'utf8');

console.log(summary.join('\n'));
console.log('PLAN_MONTH=' + monthKey);
console.log('PLAN_MODE=' + MODE);
console.log('PLAN_FAILS=' + totalFails);
console.log('PLAN_TOTAL=' + totalIncluded);
console.log('PLAN_SUITES=' + suitesLines.map(l => l.split(' ')[0]).join(','));

if (!totalIncluded) {
  console.log('\nNothing to re-run for MODE=' + MODE + ' on the ' + monthKey + ' report ' +
              '(' + totalFails + ' failure(s), all filtered out by cause).');
}
