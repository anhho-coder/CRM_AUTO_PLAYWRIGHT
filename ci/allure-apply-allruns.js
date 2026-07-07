#!/usr/bin/env node
/*
 * Write the RAW all-runs statistic (captured by allure-capture-allruns.js BEFORE dedupe)
 * into the generated report's summary widget, so Section 1 of the Overview reflects EVERY
 * run this period (number + donut), while Section 2 (the Suites widget, generated from the
 * deduped set) keeps one row per unique test case.
 *
 * Allure renders the Overview summary widget (big count + pass-rate donut + reportName)
 * from widgets/summary.json at runtime, so replacing its `statistic` block (and time span)
 * re-colors the donut and re-counts the headline to the all-runs numbers. Only summary.json
 * is touched — widgets/suites.json (Section 2), categories, and trend are left untouched.
 *
 * Usage: node ci/allure-apply-allruns.js <reportDir> <stashFile>
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2] || 'allure-report';
const stashFile = process.argv[3] || 'allure-allruns-summary.json';
const summaryPath = path.join(reportDir, 'widgets', 'summary.json');

let stash;
try { stash = JSON.parse(fs.readFileSync(stashFile, 'utf8')); } catch (e) {
  console.log(`apply-allruns: stash not found/readable (${stashFile}); leaving summary as generated.`); process.exit(0);
}
if (!stash || !stash.statistic || !stash.statistic.total) {
  console.log('apply-allruns: stash has no runs; leaving summary as generated.'); process.exit(0);
}

let summary;
try { summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')); } catch (e) {
  console.log(`apply-allruns: summary.json not found (${summaryPath}); skipping.`); process.exit(0);
}

const before = (summary.statistic && summary.statistic.total) || 0;
summary.statistic = stash.statistic;                        // all-runs counts (donut + headline)
summary.time = Object.assign({}, summary.time, stash.time); // all-runs wall-clock span

fs.writeFileSync(summaryPath, JSON.stringify(summary));
console.log(`apply-allruns: Section 1 total ${before} (unique) -> ${stash.statistic.total} (all runs).`);
