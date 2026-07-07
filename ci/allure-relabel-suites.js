#!/usr/bin/env node
/*
 * Relabel chunk (SPEC / ad-hoc) Allure results to their REAL section suite.
 *
 * SPEC runs execute under `--project=chrome-headless`, so allure-playwright tags every
 * result with parentSuite = "chrome-headless" and a "Project" parameter = "chrome-headless".
 * That collapses O12's ~16 chunk builds into one generic "chrome-headless" tile.
 *
 * We derive the section from the test file path carried in the result's `fullName`
 * (e.g. `1.Project_CRM/O12_CE_to_O12_CC/.../tc-...spec.ts:NN:NN`) and rewrite:
 *   - the `parentSuite` label   (drives the Overview "Suites" tile the user sees)
 *   - the `Project` parameter    (used by the period report / kept consistent)
 * so all O12 chunks land under ONE "O12" suite. Real section-project runs
 * (--project=O12, --project=Lead_Merging, ...) already carry the right parentSuite and
 * are left untouched.
 *
 * Usage: node ci/allure-relabel-suites.js <results-dir>   (default: allure-merged)
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'allure-merged';

// tests/1.Project_CRM/O12_CE_to_O12_CC/... -> "O12"
// tests/1.Project_CRM/3.Lead_Merging/...   -> "Lead_Merging"
// tests/1.Project_CRM/9.CRM_Module/...     -> "CRM_Module"
function suiteFromPath(full) {
  if (!full) return null;
  const n = String(full).replace(/\\/g, '/');
  let m = n.match(/1\.Project_CRM\/([^/]+)\//);
  let seg = m ? m[1] : null;
  if (!seg) { const m2 = n.match(/(?:^|\/)tests\/([^/]+)\//); seg = m2 ? m2[1] : null; }
  if (!seg) return null;
  if (seg === 'O12_CE_to_O12_CC') return 'O12';
  return seg.replace(/^\d+\./, '');
}

let scanned = 0, relabeled = 0;
let files = [];
try { files = fs.readdirSync(dir); } catch (e) {
  console.log(`relabel-suites: results dir not found: ${dir}`); process.exit(0);
}
for (const f of files) {
  if (!f.endsWith('-result.json')) continue;
  scanned++;
  const p = path.join(dir, f);
  let o;
  try { o = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
  o.labels = Array.isArray(o.labels) ? o.labels : [];
  o.parameters = Array.isArray(o.parameters) ? o.parameters : [];
  const ps = o.labels.find(l => l && l.name === 'parentSuite');
  const proj = o.parameters.find(pp => pp && pp.name === 'Project');
  const isChunk = (proj && String(proj.value) === 'chrome-headless') ||
                  (ps && String(ps.value) === 'chrome-headless');
  if (!isChunk) continue;                 // real section-project run -> leave alone
  let sec = suiteFromPath(o.fullName);
  if (!sec) { const sl = o.labels.find(l => l && l.name === 'suite'); if (sl) sec = suiteFromPath(sl.value); }
  if (!sec) continue;                      // can't classify -> leave as-is
  if (ps) ps.value = sec; else o.labels.push({ name: 'parentSuite', value: sec });
  if (proj) proj.value = sec; else o.parameters.push({ name: 'Project', value: sec });
  fs.writeFileSync(p, JSON.stringify(o));
  relabeled++;
}
console.log(`relabel-suites: scanned ${scanned} result(s), relabeled ${relabeled} chunk result(s) -> section suites`);
