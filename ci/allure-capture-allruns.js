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
 *   { statistic: {failed,broken,skipped,passed,unknown,total}, time: {start,stop,duration},
 *     byQa: { "<QA name>": {failed,broken,skipped,passed,unknown,total}, ... } }
 * to <outFile>.
 *
 * byQa splits the SAME all-runs count by which QA executed each run, resolved from the
 * result's `host` label (the machine the test ran on) via HOST_QA below. Sum of the byQa
 * totals equals statistic.total. Add a teammate's machine to HOST_QA to name their bucket;
 * any unmapped host is shown by its raw hostname so it still appears as a distinct QA.
 *
 * Usage: node ci/allure-capture-allruns.js <resultsDir> <outFile>
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'allure-merged';
const outFile = process.argv[3] || 'allure-allruns-summary.json';

// Machine host -> QA display name. Keys are matched case-insensitively. Add teammates here.
const HOST_QA = {
  'ANHHO10D': 'Anh Ho',
  // '<#A-MACHINE-HOSTNAME>': '#A',
};
function qaForHost(host) {
  const h = (host || '').trim();
  if (!h) return 'unknown host';
  return HOST_QA[h.toUpperCase()] || h; // unmapped host shows by its own name
}
function hostOf(o) {
  const labels = Array.isArray(o.labels) ? o.labels : [];
  const l = labels.find(function (x) { return x && x.name === 'host'; });
  return l ? l.value : '';
}
function newStat() { return { failed: 0, broken: 0, skipped: 0, passed: 0, unknown: 0, total: 0 }; }

const STATUSES = ['failed', 'broken', 'skipped', 'passed', 'unknown'];
const stat = { failed: 0, broken: 0, skipped: 0, passed: 0, unknown: 0, total: 0 };
const byQa = {};
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
  const qa = qaForHost(hostOf(o));
  if (!byQa[qa]) byQa[qa] = newStat();
  byQa[qa][st]++;
  byQa[qa].total++;
  const start = Number(o.start || 0), stop = Number(o.stop || 0);
  if (start > 0) minStart = (minStart === null) ? start : Math.min(minStart, start);
  if (stop > 0) maxStop = (maxStop === null) ? stop : Math.max(maxStop, stop);
}

const time = {
  start: minStart || 0,
  stop: maxStop || 0,
  duration: (minStart !== null && maxStop !== null) ? (maxStop - minStart) : 0,
};

fs.writeFileSync(outFile, JSON.stringify({ statistic: stat, time, byQa }, null, 2));
console.log(`capture-allruns: ${stat.total} run(s) this period ` +
  `(passed ${stat.passed}, failed ${stat.failed}, broken ${stat.broken}, skipped ${stat.skipped}, unknown ${stat.unknown}) -> ${outFile}`);
const qaLine = Object.keys(byQa).map(function (k) { return `${k} ${byQa[k].total}`; }).join(', ');
console.log(`capture-allruns: by QA -> ${qaLine || '(none)'}`);
