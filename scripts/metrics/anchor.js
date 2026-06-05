'use strict';
/**
 * Daily anchor snapshot.
 *
 * Captures the state of every tests/**\/*.spec.ts (path -> sha1 of contents) at the moment the FIRST
 * Claude Code command of the day runs (wired as a SessionStart hook in .claude/settings.json).
 * Idempotent per calendar day: if today's anchor already exists it does nothing, so the FIRST command
 * of the day defines the anchor and later sessions don't reset it.
 *
 * The 9pm aggregator diffs the current specs against this anchor: files ABSENT at anchor = created today,
 * files with a CHANGED hash = updated today.
 *
 * Usage: node scripts/metrics/anchor.js            (idempotent - first of day wins)
 *        node scripts/metrics/anchor.js --force     (overwrite today's anchor)
 */
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./lib/paths');
const { sha1, todayStr, listSpecFiles } = require('./lib/tcid');

const METRICS_DIR = path.join(REPO_ROOT, 'metrics');
const ANCHOR_FILE = path.join(METRICS_DIR, 'anchor.json');
const TESTS_DIR = path.join(REPO_ROOT, 'tests');

function buildSnapshot() {
  const specs = {};
  for (const rel of listSpecFiles(TESTS_DIR, REPO_ROOT)) {
    try {
      specs[rel] = sha1(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
    } catch {
      /* unreadable file - skip */
    }
  }
  return specs;
}

function main() {
  const force = process.argv.includes('--force');
  const today = todayStr();

  if (fs.existsSync(ANCHOR_FILE) && !force) {
    try {
      const existing = JSON.parse(fs.readFileSync(ANCHOR_FILE, 'utf8'));
      if (existing.date === today) {
        console.log(`[anchor] Today's anchor (${today}) already set at ${existing.time} - keeping it (${Object.keys(existing.specs || {}).length} specs).`);
        return;
      }
    } catch {
      /* corrupt anchor - fall through and rewrite */
    }
  }

  fs.mkdirSync(METRICS_DIR, { recursive: true });
  const now = new Date();
  const snapshot = {
    date: today,
    time: now.toTimeString().slice(0, 8),
    specs: buildSnapshot(),
  };
  fs.writeFileSync(ANCHOR_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`[anchor] Wrote ${ANCHOR_FILE} for ${today} (${Object.keys(snapshot.specs).length} specs).`);

  // One-time baseline: the very first anchor also seeds metrics/baseline.json (starting inventory).
  const baselineFile = path.join(METRICS_DIR, 'baseline.json');
  if (!fs.existsSync(baselineFile)) {
    fs.writeFileSync(baselineFile, JSON.stringify({
      date: today,
      time: snapshot.time,
      totalSpecInventory: Object.keys(snapshot.specs).length,
      note: 'Baseline captured at first anchor. New/Updated counts grow from here.',
    }, null, 2));
    console.log(`[anchor] Seeded baseline.json (inventory ${Object.keys(snapshot.specs).length}).`);
  }
}

main();
