/*
 * Inject each spec's leading /** ... *\/ header comment into its Allure result
 * as the test Description, so it shows in the Allure report's test Overview.
 *
 * Usage: node ci/allure-inject-descriptions.js <allure-results-dir> <repo-root>
 * Runs in the CRM-Total_Allure_Report pipeline, between merge and `allure generate`.
 * Touches no spec files; reads the result JSONs and the spec sources from the checkout.
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'allure-merged';
const repo = process.argv[3] || '.';

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Pull the first /** ... */ block and strip the comment decoration.
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

let total = 0, injected = 0, noMatch = 0;
const cache = {};
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('-result.json')) continue;
  total++;
  const p = path.join(dir, f);
  let j;
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
  const fn = j.fullName || '';
  const mm = fn.match(/tests[\\/][\s\S]*?\.spec\.ts/);
  if (!mm) { noMatch++; continue; }
  const rel = mm[0].replace(/\\/g, '/');
  if (!(rel in cache)) cache[rel] = headerComment(path.join(repo, rel));
  const desc = cache[rel];
  if (!desc) continue;
  j.descriptionHtml = '<pre style="white-space:pre-wrap;font-family:monospace">' + escapeHtml(desc) + '</pre>';
  fs.writeFileSync(p, JSON.stringify(j));
  injected++;
}
console.log(`allure descriptions: ${total} results, injected ${injected}, no-spec-path ${noMatch}`);
