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
 * Usage: node ci/allure-dedupe-latest.js <results-dir>   (default: allure-merged)
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'allure-merged';
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
// Key = <section-relative spec path, line:col stripped> :: <test title>.
function testKey(o) {
  let full = String(o.fullName || '').replace(/\\/g, '/');
  full = full.replace(/:\d+(:\d+)?$/, '');              // drop trailing :line[:col]
  full = full.replace(/^.*?1\.Project_CRM\/[^/]+\//, ''); // strip ".../1.Project_CRM/<section>/" (chunk runs carry it, section runs don't)
  full = full.replace(/^tests\//, '');
  return full + '::' + String(o.name || '');
}

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
