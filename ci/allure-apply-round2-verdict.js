#!/usr/bin/env node
/*
 * Reclassify round-1 Lead-Assignment failures using the ROUND-2 authoritative verdict.
 *
 * The async Sales-Team / Salesperson cron often has not run when a round-1 lead-assignment spec
 * asserts, so the field is empty and the test fails with `Received: ""` (Allure category
 * "Automation - async/data not loaded (empty value)"). Round 2
 * (CRM_Leads_Assignment_DeferredVerify) re-opens each lead ~1h later and stashes a per-record
 * verdict to C:\deferred-verify\<day>\verdict-<JOB>-<BUILD>.json. This script folds that verdict
 * back into the WEEKLY Allure report BEFORE `allure generate`, so the Categories / Suites / success
 * rate reflect the eventual-assignment truth:
 *
 *   - recovered  (round-2 found the field assigned): flip the round-1 result failed -> PASSED,
 *                add a "round2-recovered" tag + a note with the values the cron ended up assigning.
 *   - still-wrong (still empty ~1h later): keep it FAILED but re-message it so it lands in the
 *                "Confirmed assignment defect (round-2 authoritative)" category (real defect), and
 *                add a "round2-confirmed-defect" tag. The original round-1 error is preserved in the
 *                statusDetails.trace.
 *   - dead / unknown / no round-2 record: left untouched.
 *
 * We match a round-1 result to a round-2 verdict by the SPEC FILE (the result's `fullName` carries
 * the spec path), not by tcId - the Leads_Assignment and O12 twins share the tcId
 * "TC.THD_3.2.1.5.2" but have different spec files, so tcId matching would cross-contaminate them.
 *
 * Only `status:"failed"` results whose message matches the async-empty signature are eligible, so a
 * genuine (non-async) assertion failure on the same spec is never silently flipped.
 *
 * Usage: node ci/allure-apply-round2-verdict.js <results-dir> <deferred-verify-root> <days-csv> [repoRoot]
 *   results-dir          default 'allure-merged'
 *   deferred-verify-root default 'C:\deferred-verify'
 *   days-csv             comma-separated yyyy-MM-dd (the report period's days); empty -> no-op
 *   repoRoot             default ci\.. - the checkout whose tests/ tree resolves spec paths
 */
const fs = require('fs');
const path = require('path');
const { createResolver } = require('./allure-test-identity');

const dir = process.argv[2] || 'allure-merged';
const dvRoot = process.argv[3] || 'C:\\deferred-verify';
const days = String(process.argv[4] || '').split(',').map((s) => s.trim()).filter(Boolean);
const repoRoot = process.argv[5] || path.join(__dirname, '..');
const identity = createResolver(repoRoot);

// Same signature as ci/allure-categories.json's "async/data not loaded (empty value)" category.
const ASYNC_EMPTY = /Received(?: string)?:\s*""/;

// Absolute/relative spec path -> ONE canonical key per spec file, so the round-1 result and the
// round-2 verdict record meet even though they spell the path differently: the verdict carries the
// runner's own (often absolute) path, while `fullName` is relative to Playwright's rootDir - and
// that rootDir has no "1.Project_CRM/" in it for a --project=<Section> or sub-tree
// (BusinessProcess / PreSales) run, which used to leave the tails unmatchable and silently drop the
// round-2 recovery. ci/allure-test-identity.js resolves either spelling to the real repo file, and
// still keeps the Leads_Assignment / O12 twins apart (different files => different keys).
// Falls back to the old tail when the tests/ tree is not available.
function specTail(s) {
  if (!s) return null;
  if (identity.ready) {
    const canon = identity.canonicalPath({ fullName: String(s) });
    if (canon) return canon.toLowerCase();
  }
  const n = String(s).replace(/\\/g, '/').replace(/:\d+(?::\d+)?$/, '');
  const k = n.indexOf('1.Project_CRM/');
  if (k >= 0) return n.slice(k).toLowerCase();
  const t = n.toLowerCase().lastIndexOf('/tests/');
  if (t >= 0) return n.slice(t + '/tests/'.length).toLowerCase();
  return n.toLowerCase();
}

function stripBom(s) { return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s; }

// ---- Build the per-spec verdict from the week's dated verdict buckets ----
// bySpec: specTail -> { fields: Map(field -> {ok, now, runAtIso, dead}), leadUrl }
const bySpec = new Map();
let verdictFiles = 0, verdictRecords = 0;
for (const day of days) {
  const d = path.join(dvRoot, day);
  let files = [];
  try { files = fs.readdirSync(d); } catch (e) { continue; }
  for (const f of files) {
    if (!/^verdict-.*\.json$/i.test(f)) continue;
    let arr;
    try { arr = JSON.parse(stripBom(fs.readFileSync(path.join(d, f), 'utf8'))); } catch (e) { continue; }
    if (!Array.isArray(arr)) continue;
    verdictFiles++;
    for (const rec of arr) {
      if (!rec || !rec.specFile || !rec.field) continue;
      const key = specTail(rec.specFile);
      if (!key) continue;
      verdictRecords++;
      let e = bySpec.get(key);
      if (!e) { e = { fields: new Map(), leadUrl: rec.leadUrl || '' }; bySpec.set(key, e); }
      const prev = e.fields.get(rec.field);
      // keep the LATEST record per field (matches dedupe-latest keeping the latest round-1 run)
      if (!prev || String(rec.runAtIso || '') >= String(prev.runAtIso || '')) {
        e.fields.set(rec.field, { ok: !!rec.ok, now: rec.now || '', runAtIso: rec.runAtIso || '', dead: !!rec.dead });
        if (rec.leadUrl) e.leadUrl = rec.leadUrl;
      }
    }
  }
}

// specTail -> 'recovered' | 'stillwrong' | 'skip'
function decide(e) {
  const fields = [...e.fields.values()];
  if (!fields.length) return 'skip';
  if (fields.some((f) => f.dead)) return 'skip';        // unreachable lead -> can't judge
  return fields.some((f) => !f.ok) ? 'stillwrong' : 'recovered';
}
const decisions = new Map();
for (const [k, e] of bySpec) decisions.set(k, decide(e));

function nowOf(e, name) { const f = e.fields.get(name); return f ? f.now : ''; }
function addTag(o, val) {
  o.labels = Array.isArray(o.labels) ? o.labels : [];
  if (!o.labels.some((l) => l && l.name === 'tag' && l.value === val)) o.labels.push({ name: 'tag', value: val });
}
function addParam(o, name, val) {
  o.parameters = Array.isArray(o.parameters) ? o.parameters : [];
  const ex = o.parameters.find((p) => p && p.name === name);
  if (ex) ex.value = val; else o.parameters.push({ name, value: val });
}

// ---- Apply to the merged result files ----
let scanned = 0, recovered = 0, defect = 0;
let files = [];
try { files = fs.readdirSync(dir); } catch (e) {
  console.log(`apply-round2-verdict: results dir not found: ${dir}`); process.exit(0);
}
if (!bySpec.size) {
  console.log(`apply-round2-verdict: no round-2 verdicts for days [${days.join(', ') || 'none'}] under ${dvRoot} - nothing to reclassify.`);
  process.exit(0);
}
for (const f of files) {
  if (!f.endsWith('-result.json')) continue;
  scanned++;
  const p = path.join(dir, f);
  let o;
  try { o = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
  if (o.status !== 'failed') continue;                                   // only failed async-empty flips
  const msg = (o.statusDetails && o.statusDetails.message) || '';
  if (!ASYNC_EMPTY.test(msg)) continue;                                  // never touch non-async failures
  const key = specTail(o.fullName);
  if (!key) continue;
  const verdict = decisions.get(key);
  if (!verdict || verdict === 'skip') continue;
  const e = bySpec.get(key);

  if (verdict === 'recovered') {
    const parts = [];
    const t = nowOf(e, 'sales_team'); if (t) parts.push(`Sales Team="${t}"`);
    const sp = nowOf(e, 'salesperson'); if (sp) parts.push(`Salesperson="${sp}"`);
    const detail = parts.join(', ') || 'assignment populated';
    o.status = 'passed';
    o.statusDetails = { message: `Round-2 re-verify: assigned late (recovered). ${detail}. Async cron ran after round-1; not a defect.` };
    addTag(o, 'round2-recovered');
    addParam(o, 'Round-2', 'recovered (assigned late)');
    recovered++;
  } else {                                                              // stillwrong
    const orig = (o.statusDetails && o.statusDetails.message) || '';
    const trace = (o.statusDetails && o.statusDetails.trace) || orig;   // preserve the round-1 error
    o.statusDetails = {
      message: 'ROUND2 CONFIRMED DEFECT: assignment still empty ~1h after creation (round-2 authoritative). Real assignment defect, not cron lag.',
      trace,
    };
    addTag(o, 'round2-confirmed-defect');
    addParam(o, 'Round-2', 'confirmed defect (still empty after 1h)');
    defect++;
  }
  fs.writeFileSync(p, JSON.stringify(o));
}
console.log(
  `apply-round2-verdict: ${verdictRecords} verdict record(s) from ${verdictFiles} file(s) over ${days.length} day(s); ` +
  `scanned ${scanned} result(s) -> ${recovered} recovered->passed, ${defect} confirmed-defect.`
);
