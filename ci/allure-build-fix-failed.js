/*
 * Build the data for the "Fix failed cases" Allure Overview card.
 *
 * Source is a hand-maintained committed file, ci/crm-fix-failed-cases.json (NOT
 * derived from the run): the failed test cases the team is fixing / has fixed this
 * period. This script normalizes it (guarantees the 7 rendered fields exist) and
 * writes <reportDir>/crm-fix-failed.json, which the client-side card fetches.
 *
 * A per-period override may be supplied: ci/crm-fix-failed-cases.<period>.json
 * (e.g. ...weekly.json) wins over the generic file when present.
 *
 * Output shape:
 *   { generatedAt, period, week, total, fixed, inProgress,
 *     cases:[{ section, summary, error, foundDate, fixDate, solution }] }
 *
 * Usage: node ci/allure-build-fix-failed.js <report-dir> [period]  (report-dir default "allure-report")
 * Best-effort: never fails the build.
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const period = (process.argv[3] || '').trim();
const outPath = path.join(reportDir, 'crm-fix-failed.json');

function log(m) { console.log('fix-failed: ' + m); }

function pickSource() {
  const candidates = [];
  if (period) candidates.push(path.join(__dirname, 'crm-fix-failed-cases.' + period + '.json'));
  candidates.push(path.join(__dirname, 'crm-fix-failed-cases.json'));
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return null;
}

function str(v) { return v == null ? '' : String(v).trim(); }

function normCase(c) {
  c = c || {};
  return {
    section: str(c.section),
    summary: str(c.summary),
    error: str(c.error),
    foundDate: str(c.foundDate),
    fixDate: str(c.fixDate),
    solution: str(c.solution),
  };
}

(function () {
  const src = pickSource();
  let raw = { cases: [] };
  if (src) {
    try { raw = JSON.parse(fs.readFileSync(src, 'utf8')); log('read source ' + path.basename(src) + '.'); }
    catch (e) { log('failed to parse ' + src + ' (' + e.message + '); writing empty list.'); raw = { cases: [] }; }
  } else {
    log('no source file (ci/crm-fix-failed-cases.json); writing empty list.');
  }

  const cases = Array.isArray(raw.cases) ? raw.cases.map(normCase) : [];
  const fixed = cases.filter(c => c.fixDate).length;
  const out = {
    generatedAt: new Date().toISOString(),
    period: raw.period || period || '',
    week: raw.week || '',
    total: cases.length,
    fixed: fixed,
    inProgress: cases.length - fixed,
    cases: cases,
  };

  try {
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    log('wrote ' + cases.length + ' case(s) (' + fixed + ' fixed) -> ' + outPath);
  } catch (e) {
    log('failed to write crm-fix-failed.json (' + e.message + ').');
  }
  process.exit(0);
})();
