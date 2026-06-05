'use strict';
/**
 * Daily orchestrator: run today's created/updated specs, then aggregate + rebuild the HTML report.
 * Cross-shell safe (spawns Playwright with an args array - no PowerShell/bash arg-expansion games).
 *
 * Run-list = specs created or updated since today's session-start anchor (metrics/anchor.json).
 * If nothing changed today, the Playwright run is skipped but the report is still regenerated
 * (so the trend gets a "0 changed today" data point).
 *
 * Usage: node scripts/metrics/run-daily.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT } = require('./lib/paths');
const { sha1, listSpecFiles } = require('./lib/tcid');

const METRICS_DIR = path.join(REPO_ROOT, 'metrics');
const ANCHOR_FILE = path.join(METRICS_DIR, 'anchor.json');
const RUN_LIST = path.join(METRICS_DIR, 'run-list.txt');
const TESTS_DIR = path.join(REPO_ROOT, 'tests');

function changedSinceAnchor() {
  let anchor = null;
  try { anchor = JSON.parse(fs.readFileSync(ANCHOR_FILE, 'utf8')); } catch { /* none */ }
  const changed = [];
  const anchorSpecs = (anchor && anchor.specs) || null;
  for (const rel of listSpecFiles(TESTS_DIR, REPO_ROOT)) {
    if (!anchorSpecs) { changed.push(rel); continue; } // no anchor -> treat all as in-scope
    let h = '';
    try { h = sha1(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')); } catch { continue; }
    if (!(rel in anchorSpecs) || anchorSpecs[rel] !== h) changed.push(rel);
  }
  return changed;
}

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status;
}

function main() {
  fs.mkdirSync(METRICS_DIR, { recursive: true });
  const changed = changedSinceAnchor();
  fs.writeFileSync(RUN_LIST, changed.join('\n') + (changed.length ? '\n' : ''));
  console.log(`[run-daily] ${changed.length} spec(s) created/updated today.`);

  if (changed.length) {
    // Run only today's changed specs, headless. Per-test timeout is set inside each spec.
    run('npx', ['playwright', 'test', ...changed, '--project=chromium-headless']);
    // (non-zero exit just means some tests failed - we still aggregate + report.)
  } else {
    console.log('[run-daily] Nothing changed today - skipping Playwright run, regenerating report only.');
  }

  run('node', ['scripts/metrics/aggregate.js']);
  run('node', ['scripts/metrics/build-report.js']);
  console.log('\n[run-daily] Done. Report: metrics/master-report.html');
}

main();
