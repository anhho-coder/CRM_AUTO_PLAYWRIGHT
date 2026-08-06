#!/usr/bin/env node
/*
 * Make the per-test HISTORY tab include THIS run (the latest result) as its newest row.
 *
 * WHY: allure generate carries prior runs into each test's `extra.history.items`, but it
 * does NOT add the CURRENT run to that list - the current run is only shown on the Overview
 * tab. Yet `extra.history.statistic.total` DOES count the current run. The result is the
 * confusing mismatch you see in the History tab: "Success rate 0% (0 of 2)" while only ONE
 * (older) row is listed - the latest run is missing from the list even though it's in the
 * count. (Verified against allure-commandline 2.x: statistic.total = priors + current, but
 * items = priors only.)
 *
 * FIX: after `allure generate`, for every data/test-cases/<uid>.json, prepend the current
 * run (built from the test-case's own top-level status/time/message) as the newest history
 * item, then reconcile `statistic` so it equals the item list (X of Y stays consistent).
 * Idempotent: an already-injected current row (matched by uid) is replaced, not duplicated.
 *
 * This touches ONLY the rendered report (<reportDir>/data/test-cases). It does NOT write
 * <reportDir>/history/*.json (the carry-forward chain), so the rolling trend is unaffected
 * and the next period will still add this run exactly once through allure's own mechanism.
 *
 * Must run AFTER `allure generate`. Order vs the other post-generate injectors is irrelevant.
 *
 * Usage: node ci/allure-include-current-in-history.js <reportDir>   (default: allure-report)
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const tcDir = path.join(reportDir, 'data', 'test-cases');

const STATUSES = ['failed', 'broken', 'passed', 'skipped', 'unknown'];
function newStat() { return { failed: 0, broken: 0, passed: 0, skipped: 0, unknown: 0, total: 0 }; }

let files = [];
try { files = fs.readdirSync(tcDir); } catch (e) {
  console.log(`include-current-in-history: test-cases dir not found: ${tcDir}`); process.exit(0);
}

let scanned = 0, changed = 0;
for (const f of files) {
  if (!f.endsWith('.json')) continue;
  scanned++;
  const p = path.join(tcDir, f);
  let o;
  try { o = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
  if (!o || !o.uid) continue;

  // The current run as a history item, in the same shape allure writes for prior items.
  const status = STATUSES.indexOf(o.status) >= 0 ? o.status : 'unknown';
  const cur = { uid: o.uid, status, time: (o.time && typeof o.time === 'object') ? o.time : {} };
  if (o.statusMessage) cur.statusDetails = o.statusMessage;

  o.extra = o.extra || {};
  const hist = (o.extra.history && typeof o.extra.history === 'object') ? o.extra.history : {};
  let items = Array.isArray(hist.items) ? hist.items : [];

  // Idempotent: drop any previously-injected current row (same uid) before re-adding.
  items = items.filter((it) => !(it && it.uid === o.uid));
  items.unshift(cur);                                   // newest first (matches allure ordering)

  // Reconcile the statistic so "X of Y" == the visible list (Y = items.length).
  const stat = newStat();
  for (const it of items) {
    const s = it && STATUSES.indexOf(it.status) >= 0 ? it.status : 'unknown';
    stat[s]++; stat.total++;
  }
  hist.items = items;
  hist.statistic = stat;
  o.extra.history = hist;

  fs.writeFileSync(p, JSON.stringify(o));
  changed++;
}
console.log(`include-current-in-history: scanned ${scanned} test-case(s), added the current run to ${changed} history list(s).`);
