'use strict';
/**
 * Aggregator: turn the latest Playwright run into the daily automation-metrics snapshot.
 *
 * Sources joined:
 *   - Spec-header tags (Automation-Type / Automation-Date)  -> classify each tracked spec New vs Refactored.
 *   - metrics/anchor.json (today's session-start snapshot)   -> what was created/updated TODAY (hash diff).
 *   - newest playwright-report/<run>/test-results.json       -> per-spec status + duration (latest run).
 *
 * Maintains a running per-spec store (metrics/specs-latest.json) so the cumulative report keeps each
 * spec's most-recent result even on days it wasn't re-run. Writes a per-day snapshot + appends/overwrites
 * a row in metrics/history.csv (the trend source).
 *
 * Usage: node scripts/metrics/aggregate.js
 */
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, listResultsJsonNewestFirst } = require('./lib/paths');
const { extractTcId, parseHeaderTags, todayStr, listSpecFiles } = require('./lib/tcid');

const METRICS_DIR = path.join(REPO_ROOT, 'metrics');
const HISTORY_DIR = path.join(METRICS_DIR, 'history');
const STORE_FILE = path.join(METRICS_DIR, 'specs-latest.json');
const ANCHOR_FILE = path.join(METRICS_DIR, 'anchor.json');
const HISTORY_CSV = path.join(METRICS_DIR, 'history.csv');
const TESTS_DIR = path.join(REPO_ROOT, 'tests');
const PROJECT_FILTER = 'chromium-headless';

const isFail = (s) => s === 'failed' || s === 'timedOut';

/** Read header tags for every spec file -> { relPath: {type,date} } (only tagged specs are "tracked"). */
function readTrackedSpecs() {
  const tracked = {};
  for (const rel of listSpecFiles(TESTS_DIR, REPO_ROOT)) {
    let contents = '';
    try { contents = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); } catch { continue; }
    const tags = parseHeaderTags(contents);
    if (tags.type) {
      // first test title in the file -> TC ID (best-effort; report keys on file path anyway)
      const titleM = contents.match(/test(?:\.\w+)?\(\s*['"`]([^'"`]+)['"`]/);
      tracked[rel] = {
        type: tags.type,            // 'new' | 'refactored'
        date: tags.date || null,
        id: extractTcId(titleM ? titleM[1] : '', rel),
      };
    }
  }
  return tracked;
}

// How many recent run folders to scan when resolving each spec's latest result.
// One run that exercised the tracked specs normally suffices, but concurrent/other runs
// (the user running an unrelated folder while the nightly job runs) create newer folders
// that don't contain the tracked specs - so we scan back across several runs and take,
// per spec file, the result from the newest run that actually contains it.
const RUN_SCAN_WINDOW = 80;

/**
 * Resolve each spec's most-recent result across recent runs (chromium-headless).
 * Rule: last-wins WITHIN a single run; newest-run-wins ACROSS runs. A newer run that
 * lacks a given spec never clobbers an older run's result for that spec.
 * @returns {{ runFile: string|null, runFolders: string[], byFile: Object }}
 */
function readLatestRun(trackedRel) {
  const files = listResultsJsonNewestFirst().slice(0, RUN_SCAN_WINDOW); // newest first
  const byFile = {};
  const runFolders = [];
  if (!files.length) return { runFile: null, runFolders, byFile };

  // Playwright emits spec.file relative to testDir ("1.Project_CRM/...", no "tests/" prefix);
  // tracked keys are repo-relative ("tests/1.Project_CRM/..."). Normalize to the tracked form.
  const norm = (p) => {
    const s = String(p || '').replace(/\\/g, '/');
    const i = s.indexOf('tests/');
    return i >= 0 ? s.slice(i) : 'tests/' + s.replace(/^\/+/, '');
  };
  const trackedSet = trackedRel ? new Set(trackedRel) : null;

  for (const file of files) { // newest -> oldest
    let json;
    try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }

    const local = {}; // results from THIS run (last-wins within the run)
    function walk(suite, inheritedFile) {
      const suiteFile = suite.file || inheritedFile;
      for (const spec of suite.specs || []) {
        const relFile = norm(spec.file || suiteFile);
        for (const t of spec.tests || []) {
          if (t.projectName && t.projectName !== PROJECT_FILTER) continue;
          const last = (t.results || [])[t.results.length - 1];
          if (!last) continue;
          const errMsg = last.error && last.error.message ? String(last.error.message).split('\n')[0] : '';
          local[relFile] = {
            status: last.status,
            durationMs: last.duration || 0,
            error: isFail(last.status) ? errMsg : '',
            id: extractTcId(spec.title, relFile),
          };
        }
      }
      for (const child of suite.suites || []) walk(child, suiteFile);
    }
    for (const s of json.suites || []) walk(s, json.file);

    // merge: only fill files not already resolved by a NEWER run
    let contributed = false;
    for (const [rel, res] of Object.entries(local)) {
      if (!(rel in byFile)) { byFile[rel] = res; contributed = true; }
    }
    if (contributed) runFolders.push(path.basename(path.dirname(file)));

    // early-exit once every tracked spec has a result
    if (trackedSet && [...trackedSet].every((r) => r in byFile)) break;
  }

  return { runFile: runFolders[0] ? files[0] : files[0] || null, runFolders, byFile };
}

/** today's created/updated, by diffing current spec hashes vs the anchor snapshot. */
function computeTodayDelta(tracked) {
  let anchor = null;
  try { anchor = JSON.parse(fs.readFileSync(ANCHOR_FILE, 'utf8')); } catch { /* no anchor */ }
  const created = [];
  const updated = [];
  if (!anchor || !anchor.specs) return { created, updated, anchorDate: null };
  const { sha1 } = require('./lib/tcid');
  for (const rel of listSpecFiles(TESTS_DIR, REPO_ROOT)) {
    let h = '';
    try { h = sha1(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')); } catch { continue; }
    if (!(rel in anchor.specs)) created.push(rel);
    else if (anchor.specs[rel] !== h) updated.push(rel);
  }
  return { created, updated, anchorDate: anchor.date };
}

function main() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const today = todayStr();

  const tracked = readTrackedSpecs();
  const { runFolders, byFile } = readLatestRun(Object.keys(tracked));
  const delta = computeTodayDelta(tracked);
  const runFileLabel = runFolders.length
    ? (runFolders.length === 1 ? runFolders[0] : `${runFolders[0]} (+${runFolders.length - 1} more)`)
    : null;

  // running per-spec store: keep last-known result per spec, refresh type/date from headers
  let store = {};
  try { store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch { store = {}; }

  for (const [rel, meta] of Object.entries(tracked)) {
    const prev = store[rel] || {};
    const run = byFile[rel];
    store[rel] = {
      id: meta.id,
      type: meta.type,
      date: meta.date,
      status: run ? run.status : (prev.status || 'not-run'),
      durationMs: run ? run.durationMs : (prev.durationMs || 0),
      error: run ? run.error : (prev.error || ''),
      lastRun: run ? today : (prev.lastRun || null),
    };
  }
  // drop store entries for specs that are no longer tracked (tag removed/deleted)
  for (const rel of Object.keys(store)) if (!(rel in tracked)) delete store[rel];
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));

  // aggregate by category
  const cat = (type) => {
    const rows = Object.entries(store).filter(([, v]) => v.type === type)
      .map(([file, v]) => ({ file, ...v }));
    const withResult = rows.filter((r) => r.status !== 'not-run');
    const fails = withResult.filter((r) => isFail(r.status));
    const skipped = withResult.filter((r) => r.status === 'skipped');
    const ranForRate = withResult.filter((r) => r.status !== 'skipped');
    const passed = ranForRate.filter((r) => r.status === 'passed');
    const totalDurMs = withResult.reduce((a, r) => a + (r.durationMs || 0), 0);
    return {
      count: rows.length,
      ran: withResult.length,
      failed: fails.length,
      skipped: skipped.length,
      passRate: ranForRate.length ? +(100 * passed.length / ranForRate.length).toFixed(1) : null,
      totalDurMin: +(totalDurMs / 60000).toFixed(1),
      avgDurSec: withResult.length ? +(totalDurMs / withResult.length / 1000).toFixed(1) : 0,
      rows,
      failing: fails.map((r) => ({ id: r.id, file: r.file, error: r.error })),
    };
  };

  const created = cat('new');
  const refactored = cat('refactored');

  const overallRan = created.ran + refactored.ran;
  const overallFails = created.failed + refactored.failed;
  const overallPassDenom = (created.ran - created.skipped) + (refactored.ran - refactored.skipped);
  const overallPassed = overallPassDenom - overallFails;
  const overallPassRate = overallPassDenom ? +(100 * overallPassed / overallPassDenom).toFixed(1) : null;

  const snapshot = {
    date: today,
    runFile: runFileLabel,
    new: created,
    refactored,
    today: { created: delta.created, updated: delta.updated, anchorDate: delta.anchorDate },
    overall: { tracked: created.count + refactored.count, ran: overallRan, fails: overallFails, passRate: overallPassRate },
  };

  fs.writeFileSync(path.join(HISTORY_DIR, `${today}.json`), JSON.stringify(snapshot, null, 2));

  // append/overwrite today's row in history.csv
  const header = 'date,newCount,updatedCount,newFails,updatedFails,newDurMin,updatedDurMin,passRate,newToday,updatedToday';
  const row = [
    today, created.count, refactored.count, created.failed, refactored.failed,
    created.totalDurMin, refactored.totalDurMin, overallPassRate == null ? '' : overallPassRate,
    delta.created.length, delta.updated.length,
  ].join(',');
  let lines = [];
  try { lines = fs.readFileSync(HISTORY_CSV, 'utf8').trim().split(/\r?\n/).filter(Boolean); } catch { lines = []; }
  if (!lines.length || lines[0] !== header) lines = [header, ...lines.filter((l) => l !== header)];
  lines = lines.filter((l) => !l.startsWith(today + ','));
  lines.push(row);
  // keep header first, data sorted by date
  const data = lines.slice(1).sort();
  fs.writeFileSync(HISTORY_CSV, [header, ...data].join('\n') + '\n');

  console.log('[aggregate] Runs parsed:', runFolders.length ? runFolders.join(', ') : '(none found)');
  console.log(`[aggregate] New: ${created.count} (fails ${created.failed}, ${created.totalDurMin}min) | Refactored: ${refactored.count} (fails ${refactored.failed}, ${refactored.totalDurMin}min)`);
  console.log(`[aggregate] Today's delta: +${delta.created.length} created, ~${delta.updated.length} updated. Overall pass-rate: ${overallPassRate == null ? 'n/a' : overallPassRate + '%'}`);
  console.log(`[aggregate] Wrote ${path.join('metrics', 'history', today + '.json')} and updated history.csv`);
}

main();
