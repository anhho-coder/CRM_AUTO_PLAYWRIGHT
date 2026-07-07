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

// group result files by historyId
const groups = new Map();          // hid -> [{file, o, time, env}]
let resultCount = 0;
for (const f of files) {
  if (!f.endsWith('-result.json')) continue;
  resultCount++;
  const p = path.join(dir, f);
  let o;
  try { o = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
  const hid = o.historyId || (String(o.fullName || '') + '|' + String(o.name || f));
  const time = Number(o.stop || o.start || 0);
  const rec = { file: p, time, env: isEnvFail(o) };
  if (!groups.has(hid)) groups.set(hid, []);
  groups.get(hid).push(rec);
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
