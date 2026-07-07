#!/usr/bin/env node
/*
 * Capture the RAW all-runs summary statistic of a period, BEFORE dedupe-latest.js
 * collapses each test to one row.
 *
 * Section 1 of the Overview ("Total test cases run this period") must count EVERY run
 * in the window — a test that failed 5 times and passed once contributes 6 to Section 1
 * (5 failed + 1 passed), while Section 2 (the deduped Suites widget) shows it as 1.
 * `allure generate` runs on the DEDUPED result set, so its widgets/summary.json only
 * counts each test once. This script snapshots the pre-dedupe statistic so a later step
 * (allure-apply-allruns.js) can write the all-runs numbers back into the summary widget.
 *
 * Scans <resultsDir> for *-result.json and buckets each by its `status`
 * (passed/failed/broken/skipped/unknown), plus a wall-clock time span, and writes
 *   { statistic: {failed,broken,skipped,passed,unknown,total}, time: {start,stop,duration} }
 * to <outFile>.
 *
 * Usage: node ci/allure-capture-allruns.js <resultsDir> <outFile>
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'allure-merged';
const outFile = process.argv[3] || 'allure-allruns-summary.json';

const STATUSES = ['failed', 'broken', 'skipped', 'passed', 'unknown'];
const stat = { failed: 0, broken: 0, skipped: 0, passed: 0, unknown: 0, total: 0 };
let minStart = null, maxStop = null;

let files = [];
try { files = fs.readdirSync(dir); } catch (e) {
  console.log(`capture-allruns: results dir not found: ${dir}`); process.exit(0);
}

for (const f of files) {
  if (!f.endsWith('-result.json')) continue;
  let o;
  try { o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
  const st = STATUSES.indexOf(o.status) >= 0 ? o.status : 'unknown';
  stat[st]++;
  stat.total++;
  const start = Number(o.start || 0), stop = Number(o.stop || 0);
  if (start > 0) minStart = (minStart === null) ? start : Math.min(minStart, start);
  if (stop > 0) maxStop = (maxStop === null) ? stop : Math.max(maxStop, stop);
}

const time = {
  start: minStart || 0,
  stop: maxStop || 0,
  duration: (minStart !== null && maxStop !== null) ? (maxStop - minStart) : 0,
};

fs.writeFileSync(outFile, JSON.stringify({ statistic: stat, time }, null, 2));
console.log(`capture-allruns: ${stat.total} run(s) this period ` +
  `(passed ${stat.passed}, failed ${stat.failed}, broken ${stat.broken}, skipped ${stat.skipped}, unknown ${stat.unknown}) -> ${outFile}`);
