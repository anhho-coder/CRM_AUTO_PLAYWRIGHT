/*
 * Inject each spec's leading block-comment header into its Allure result as the
 * test Description, so it shows in the Allure report's test Overview.
 *
 * Usage: node ci/allure-inject-descriptions.js <allure-results-dir> <repo-root>
 * Runs in the CRM-Total_Allure_Report pipeline, between merge and `allure generate`.
 * Touches no spec files.
 *
 * Note: section projects use a scoped testDir, so a result's fullName is
 * testDir-relative (e.g. "CRM-2482_.../tc-...spec.ts:104:7") - it does NOT start
 * with "tests/". So we match on the spec BASENAME and look it up in the repo.
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'allure-merged';
const repo = process.argv[3] || '.';

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function headerComment(file) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
  const m = src.match(/\/\*\*([\s\S]*?)\*\//);
  if (!m) return null;
  const body = m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').replace(/\s+$/, ''))
    .join('\n')
    .trim();
  return body || null;
}

// Index every spec by basename: { 'tc-...spec.ts': 'C:\\...\\tests\\...\\tc-...spec.ts' }
const byBase = {};
(function walk(d) {
  let ents;
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp);
    else if (e.name.endsWith('.spec.ts')) byBase[e.name] = fp;
  }
})(path.join(repo, 'tests'));

let total = 0, injected = 0, unmatched = 0;
const cache = {};
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('-result.json')) continue;
  total++;
  const p = path.join(dir, f);
  let j;
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
  const fn = j.fullName || j.name || '';
  const m = fn.match(/([^\/\\>:]+\.spec\.ts)/); // the basename token
  if (!m) { unmatched++; continue; }
  const base = m[1];
  const file = byBase[base];
  if (!file) { unmatched++; continue; }
  if (!(base in cache)) cache[base] = headerComment(file);
  const desc = cache[base];
  if (!desc) continue;
  j.descriptionHtml = '<pre style="white-space:pre-wrap;font-family:monospace">' + escapeHtml(desc) + '</pre>';
  fs.writeFileSync(p, JSON.stringify(j));
  injected++;
}
console.log(`allure descriptions: ${total} results, indexed ${Object.keys(byBase).length} specs, injected ${injected}, unmatched ${unmatched}`);
