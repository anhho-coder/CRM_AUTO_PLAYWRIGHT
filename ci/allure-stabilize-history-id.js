#!/usr/bin/env node
/*
 * Stabilise the Allure historyId (+ testCaseId) so the per-test HISTORY tab chains
 * across period reports (daily/weekly/monthly/...).
 *
 * WHY: allure-playwright writes  historyId = md5(fullName) : md5(parameters), where
 *   - fullName ends in ":<line>:<col>"  -> shifts on ANY code edit, and
 *   - parameters include "Project"      -> differs for a SPEC chunk (chrome-headless)
 *     vs a real section run (--project=O12).
 * Both make the id UNSTABLE from one period to the next, so the history.json carried
 * forward (keyed by last period's id) never matches this period's result id, and every
 * test shows "No history information available" even though the trend widget works.
 *
 * FIX: recompute historyId/testCaseId from a project- AND line-independent identity -
 * the SAME key ci/allure-dedupe-latest.js already uses to collapse reruns:
 *     <section-relative spec path, line:col stripped> :: <test title>
 * Once stable, the rolling history in C:\allure\periods\history\<scope> chains: the
 * History tab starts showing prior points from the NEXT period on (daily fills fastest;
 * monthly gains one point per month). This period stays empty by nature - you cannot
 * retro-match ids that were unstable when the old history was written.
 *
 * Must run BEFORE `allure generate`. Order vs relabel/dedupe does not matter: the key is
 * derived from fullName+name, not from the Project param or historyId.
 *
 * Usage: node ci/allure-stabilize-history-id.js <results-dir>   (default: allure-merged)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = process.argv[2] || 'allure-merged';

// Project/line-independent identity of a test - identical to allure-dedupe-latest.js's
// testKey(), so exactly one stable historyId maps to each unique test the dedupe keeps.
function testKey(o) {
  let full = String(o.fullName || '').replace(/\\/g, '/');
  full = full.replace(/:\d+(:\d+)?$/, '');                // drop trailing :line[:col]
  full = full.replace(/^.*?1\.Project_CRM\/[^/]+\//, ''); // strip ".../1.Project_CRM/<section>/"
  full = full.replace(/^tests\//, '');
  return full + '::' + String(o.name || '');
}

function md5(s) { return crypto.createHash('md5').update(s, 'utf8').digest('hex'); }

let files = [];
try { files = fs.readdirSync(dir); } catch (e) {
  console.log(`stabilize-history-id: results dir not found: ${dir}`); process.exit(0);
}

let scanned = 0, changed = 0;
for (const f of files) {
  if (!f.endsWith('-result.json')) continue;
  scanned++;
  const p = path.join(dir, f);
  let o;
  try { o = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
  const key = testKey(o);
  if (!key || key === '::') continue;            // can't identify -> leave allure's default
  const id = md5(key);
  if (o.historyId === id && o.testCaseId === id) continue;
  o.historyId = id;
  o.testCaseId = id;
  fs.writeFileSync(p, JSON.stringify(o));
  changed++;
}
console.log(`stabilize-history-id: scanned ${scanned} result(s), rewrote historyId/testCaseId on ${changed} -> stable, period-independent ids`);
