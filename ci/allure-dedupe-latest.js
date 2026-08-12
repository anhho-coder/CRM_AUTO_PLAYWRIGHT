#!/usr/bin/env node
/*
 * Env-aware "latest result per unique test" for a period Allure report.
 *
 * A period bucket can hold MANY runs of the same test (chunk re-runs, daily re-runs,
 * env-outage retries). We want each test's tile to reflect its LATEST *real* outcome —
 * not a VPN/DNS/connection drop that happened to be the most recent attempt. So per
 * historyId we keep exactly one result:
 *     latest NON-env result (by stop time)  ->  else latest env result (only if it
 *     NEVER ran cleanly in the window).
 * All other result files for that test are deleted before `allure generate`, so the
 * suite tiles and the period total count each unique test once, at its latest healthy
 * status. Containers/attachments are left as-is (Allure ignores unreferenced ones).
 *
 * "env" = a failed/broken result whose message or trace matches the same VPN/DNS/
 * connection patterns the Categories widget uses (see ci/allure-categories.json),
 * plus ERR_CONNECTION_TIMED_OUT / route-down (the pre-prod outage signature).
 *
 * Usage: node ci/allure-dedupe-latest.js <results-dir> [repoRoot]   (default: allure-merged, ci/..)
 */
const fs = require('fs');
const path = require('path');
const { createResolver, legacyKey } = require('./allure-test-identity');

const dir = process.argv[2] || 'allure-merged';
const repoRoot = process.argv[3] || path.join(__dirname, '..');
const ENV_RE = /(net::ERR_|ERR_NAME_NOT_RESOLVED|ERR_CERT_AUTHORITY_INVALID|ERR_EMPTY_RESPONSE|ERR_CONNECTION|ERR_NETWORK|ERR_TIMED_OUT|ERR_ADDRESS_UNREACHABLE|VPN route down|pre-prod VPN route)/i;

function isEnvFail(o) {
  const st = o.status;
  if (st !== 'failed' && st !== 'broken') return false;
  const d = o.statusDetails || {};
  return ENV_RE.test(String(d.message || '') + '\n' + String(d.trace || ''));
}

let files = [];
try { files = fs.readdirSync(dir); } catch (e) {
  console.log(`dedupe-latest: results dir not found: ${dir}`); process.exit(0);
}

// Project/run-independent identity of a test, so N runs of the SAME test collapse to 1
// (Allure's historyId does NOT: it bakes in the project-relative fullName + the Project
// param, so the same test run as --project=<Section> vs a SPEC chunk on chrome-headless,
// or after a line-number-shifting edit, gets DIFFERENT historyIds and is counted twice).
// Key = <spec path relative to tests/, resolved against the repo> :: <test title>, from
// ci/allure-test-identity.js. The recorded fullName is relative to Playwright's rootDir, which
// differs per launch (chunk run vs --project=<Section> vs a sub-tree project like
// BusinessProcess/PreSales), so it MUST be resolved back to the real file first - otherwise one
// file gets 2-3 identities and a PASS never supersedes the FAIL recorded under the other one.
// Two DIFFERENT spec files holding the same TC stay separate on purpose. Falls back to the old
// key when the tests/ tree is not next to ci/ (e.g. a report-only workspace).
const identity = createResolver(repoRoot);
const testKey = identity.ready ? (o) => identity.testKey(o) : legacyKey;
if (!identity.ready) console.log(`dedupe-latest: no tests/ tree under ${repoRoot} - using the legacy path key`);

// group result files by project-independent test identity
const groups = new Map();          // key -> [{file, time, env}]
let resultCount = 0;
for (const f of files) {
  if (!f.endsWith('-result.json')) continue;
  resultCount++;
  const p = path.join(dir, f);
  let o;
  try { o = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
  const key = testKey(o) || f;
  const time = Number(o.stop || o.start || 0);
  const rec = { file: p, time, env: isEnvFail(o) };
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(rec);
}

let kept = 0, deleted = 0, envOnly = 0;
for (const [, recs] of groups) {
  const clean = recs.filter(r => !r.env);
  let keeper;
  if (clean.length) {
    keeper = clean.reduce((a, b) => (b.time >= a.time ? b : a));   // latest non-env
  } else {
    keeper = recs.reduce((a, b) => (b.time >= a.time ? b : a));    // latest env (never ran clean)
    envOnly++;
  }
  kept++;
  for (const r of recs) {
    if (r.file === keeper.file) continue;
    try { fs.unlinkSync(r.file); deleted++; } catch (e) { /* ignore */ }
  }
}
console.log(`dedupe-latest: ${resultCount} result(s) -> ${kept} unique test(s) kept (latest non-env), ${deleted} redundant removed, ${envOnly} test(s) env-only (no clean run in period)`);
if (identity.ready) console.log('dedupe-latest: ' + identity.summary());
