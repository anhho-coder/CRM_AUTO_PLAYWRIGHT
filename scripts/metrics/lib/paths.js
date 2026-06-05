'use strict';
/**
 * Locate the newest Playwright JSON result file.
 * Run folders are named `YYYY-MM-DD-HHMMSS_<Folder>_[Worker-N]_<Passed|Failed>` (see playwright.config.ts),
 * each containing `test-results.json`. We pick the folder with the highest timestamp prefix.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const REPORT_DIR = path.join(REPO_ROOT, 'playwright-report');

/** @returns {string[]} absolute paths to every run's test-results.json, newest-first. */
function listResultsJsonNewestFirst(reportDir) {
  const dir = reportDir || REPORT_DIR;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // leading timestamp YYYY-MM-DD-HHMMSS
    .filter((name) => /^\d{4}-\d{2}-\d{2}-\d{6}/.test(name))
    .map((name) => ({ name, ts: name.slice(0, 17), file: path.join(dir, name, 'test-results.json') }))
    .filter((c) => fs.existsSync(c.file))
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)) // newest first
    .map((c) => c.file);
}

/** @returns {string|null} absolute path to the newest test-results.json, or null if none. */
function findLatestResultsJson(reportDir) {
  const all = listResultsJsonNewestFirst(reportDir);
  return all.length ? all[0] : null;
}

module.exports = { REPO_ROOT, REPORT_DIR, findLatestResultsJson, listResultsJsonNewestFirst };
