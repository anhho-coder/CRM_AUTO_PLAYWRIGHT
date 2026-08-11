/*
 * Build the data for the "Fix failed cases" Allure Overview card.
 *
 * Source is a hand-maintained committed file, PER WEEK:
 *   ci/crm-fix-failed-cases.<periodKey>.json   (e.g. crm-fix-failed-cases.2026-W32.json)
 * These are the failed test cases the team fixed in THAT week. Each weekly report reads
 * ONLY its own week's file, so a week's fix list never leaks onto another week's report
 * (a week with no file renders an empty "No fix records" card). This script normalizes
 * the chosen file (guarantees the 7 rendered fields exist) and writes
 * <reportDir>/crm-fix-failed.json, which the client-side card fetches.
 *
 * Legacy fallbacks (only when no per-week file exists): ci/crm-fix-failed-cases.<scope>.json
 * (e.g. ...weekly.json) then the generic ci/crm-fix-failed-cases.json. New data should use
 * the per-week filename; the generic file is kept only for backward compatibility.
 *
 * Output shape:
 *   { generatedAt, period, week, total, fixed, inProgress,
 *     cases:[{ section, summary, error, foundDate, fixDate, solution }] }
 *
 * Usage: node ci/allure-build-fix-failed.js <report-dir> <periodKey> [scope]
 *        (report-dir default "allure-report")
 * Best-effort: never fails the build.
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const periodKey = (process.argv[3] || '').trim();
const scope     = (process.argv[4] || '').trim();
const outPath = path.join(reportDir, 'crm-fix-failed.json');

function log(m) { console.log('fix-failed: ' + m); }

// Per-week source wins. Only when NO per-week file exists do we consider the legacy
// scope/generic files — so an existing per-week file guarantees week-isolation, while a
// week with no file (the common case going forward) yields an empty list, not a leak.
function pickSource() {
  const perWeek = periodKey ? path.join(__dirname, 'crm-fix-failed-cases.' + periodKey + '.json') : '';
  if (perWeek && fs.existsSync(perWeek)) return perWeek;
  const legacy = [];
  if (scope) legacy.push(path.join(__dirname, 'crm-fix-failed-cases.' + scope + '.json'));
  legacy.push(path.join(__dirname, 'crm-fix-failed-cases.json'));
  for (const c of legacy) { if (fs.existsSync(c)) return c; }
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
    log('no source file for ' + (periodKey || '(no periodKey)') + ' (ci/crm-fix-failed-cases.' + periodKey + '.json); writing empty list.');
  }

  const cases = Array.isArray(raw.cases) ? raw.cases.map(normCase) : [];
  const fixed = cases.filter(c => c.fixDate).length;
  const out = {
    generatedAt: new Date().toISOString(),
    period: raw.period || scope || '',
    week: raw.week || periodKey || '',
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
