#!/usr/bin/env node
/*
 * Builds crm-ic-execution.json: the "Unique test execution by IC" metric.
 *
 * WHO ran WHAT. Every result file carries an `owner` label = the Jenkins account
 * that triggered the build (playwright.config.ts globalLabels <- TRIGGERED_BY <-
 * the 'Resolve trigger' stage in Jenkinsfile). This script groups the results by
 * that owner and counts, per IC, how many DISTINCT tests they executed.
 *
 * "unique" = deduped by ci/allure-test-identity.js (the same project-independent
 * key the period dedupe uses), so a test an IC ran 5 times - retries, chunk
 * re-runs, a re-run of the whole section - counts ONCE for that IC. Raw attempts
 * are reported separately as `executions`.
 *
 * SUM CAVEAT, deliberately visible rather than hidden: the per-IC uniqueTests do
 * NOT have to add up to totalUnique. When two ICs each ran the same test, that
 * test is unique for BOTH of them and counted once globally. `sharedTests` says
 * how many tests that is, and `attributedUnique` is the sum of the column, so the
 * gap is readable instead of looking like an arithmetic bug.
 *
 * Results written before the globalLabels change carry no owner -> they land in
 * the "unattributed" bucket, which the card renders greyed. That bucket shrinking
 * to 0 is how you know every lane is stamped.
 *
 * Usage: node ci/allure-build-ic-execution.js <results-dir> <report-dir> [repoRoot]
 *   defaults: allure-merged  allure-report  ci/..
 * Best-effort: never fails the build.
 */
const fs = require('fs');
const path = require('path');

const resultsDir = process.argv[2] || 'allure-merged';
const reportDir = process.argv[3] || 'allure-report';
const repoRoot = process.argv[4] || path.join(__dirname, '..');
const OUT = 'crm-ic-execution.json';

// Reuse the canonical identity so "unique" means the same thing here as in the
// period dedupe; fall back to the legacy key when the tests/ tree is not present.
let testKey;
try {
  const { createResolver, legacyKey } = require('./allure-test-identity');
  const identity = createResolver(repoRoot);
  testKey = identity.ready ? (o) => identity.testKey(o) : legacyKey;
  if (!identity.ready) console.log(`ic-execution: no tests/ tree under ${repoRoot} - using the legacy path key`);
} catch (e) {
  console.log('ic-execution: allure-test-identity unavailable - falling back to fullName::name');
  testKey = (o) => `${o.fullName || ''}::${o.name || ''}`;
}

let files = [];
try { files = fs.readdirSync(resultsDir); } catch (e) {
  console.log(`ic-execution: results dir not found: ${resultsDir} (skipping).`);
  process.exit(0);
}

const labelValue = (o, name) => (o.labels || []).filter((l) => l && l.name === name).map((l) => l.value);
const taggedWith = (o, prefix) => labelValue(o, 'tag')
  .filter((v) => typeof v === 'string' && v.indexOf(prefix) === 0)
  .map((v) => v.slice(prefix.length));

const ics = new Map();      // ic -> { tests: Map<key, {status, stop}>, executions, builds:Set, triggers:Set }
const globalTests = new Map(); // key -> Set<ic>
let resultCount = 0;
let noOwner = 0;

for (const f of files) {
  if (!f.endsWith('-result.json')) continue;
  let o;
  try { o = JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')); } catch (e) { continue; }
  resultCount++;

  const owner = labelValue(o, 'owner')[0] || taggedWith(o, 'by:')[0] || null;
  const ic = owner || 'unattributed';
  if (!owner) noOwner++;

  if (!ics.has(ic)) {
    ics.set(ic, { tests: new Map(), executions: 0, builds: new Set(), triggers: new Set() });
  }
  const bucket = ics.get(ic);
  bucket.executions++;
  taggedWith(o, 'build:').forEach((b) => bucket.builds.add(b));
  taggedWith(o, 'trigger:').forEach((t) => bucket.triggers.add(t));

  const key = testKey(o);
  const stop = Number(o.stop || o.start || 0);
  // Keep the LATEST attempt per test per IC, so the status breakdown reflects
  // where that test finally landed for that person, not its first flake.
  const prev = bucket.tests.get(key);
  if (!prev || stop >= prev.stop) bucket.tests.set(key, { status: o.status || 'unknown', stop });

  if (!globalTests.has(key)) globalTests.set(key, new Set());
  globalTests.get(key).add(ic);
}

const rows = [];
for (const [ic, b] of ics) {
  const counts = { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
  for (const t of b.tests.values()) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }
  rows.push({
    ic,
    uniqueTests: b.tests.size,
    executions: b.executions,
    reruns: b.executions - b.tests.size,
    passed: counts.passed, failed: counts.failed, broken: counts.broken,
    skipped: counts.skipped, unknown: counts.unknown,
    builds: [...b.builds].sort(),
    buildCount: b.builds.size,
    triggers: [...b.triggers].sort(),
  });
}
// Busiest IC first; the unattributed bucket always sinks to the bottom.
rows.sort((a, b) => (a.ic === 'unattributed') - (b.ic === 'unattributed') || b.uniqueTests - a.uniqueTests);

let shared = 0;
for (const owners of globalTests.values()) if (owners.size > 1) shared++;

const out = {
  generatedAt: new Date().toISOString(),
  resultFiles: resultCount,
  totalUnique: globalTests.size,
  attributedUnique: rows.reduce((n, r) => n + r.uniqueTests, 0),
  sharedTests: shared,
  unattributedResults: noOwner,
  ics: rows,
};

try {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, OUT), JSON.stringify(out, null, 2));
  console.log(`ic-execution: ${rows.length} IC(s), ${out.totalUnique} unique tests from ${resultCount} result files -> ${path.join(reportDir, OUT)}`);
  if (noOwner) console.log(`ic-execution: ${noOwner} result file(s) carry no owner label (bucket "unattributed").`);
} catch (e) {
  console.error('ic-execution: could not write ' + OUT + ': ' + e.message);
}
