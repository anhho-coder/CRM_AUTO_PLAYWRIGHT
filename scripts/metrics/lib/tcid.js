'use strict';
/**
 * Shared helpers for the automation-metrics pipeline.
 * Plain CommonJS (run with `node`) so the nightly .bat has zero ts-node/tsconfig dependencies.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Extract the stable Test-Case ID from a Playwright test title (everything before the first colon),
 * falling back to a filename slug. Covers: "TC.BDEU.1.1.1.1: ...", "CRM-2482_2.1.1: ...",
 * "TC.-A.7.2: ...", "TC.Performance.1.1.1.1: ...".
 * @param {string} specTitle
 * @param {string} fileName
 * @returns {string}
 */
function extractTcId(specTitle, fileName) {
  if (specTitle) {
    const m = specTitle.match(/^\s*([A-Za-z][^:]*?):/);
    if (m) return m[1].trim();
  }
  const base = fileName ? path.basename(fileName) : '';
  const fm = base.match(/^(tc-[a-z0-9]+(?:-[0-9a-z]+)+)/i);
  return fm ? fm[1] : base || (specTitle || '').trim() || 'unknown';
}

/**
 * Read the `Automation-Type` / `Automation-Date` header tags from a spec file's leading comment.
 * Returns { type: 'new'|'refactored'|null, date: 'YYYY-MM-DD'|null }.
 * @param {string} fileContents
 */
function parseHeaderTags(fileContents) {
  const out = { type: null, date: null };
  if (!fileContents) return out;
  // Only look at the first ~80 lines (the header block) to avoid matching body text.
  const head = fileContents.split(/\r?\n/).slice(0, 80).join('\n');
  const typeM = head.match(/Automation-Type\s*:\s*(new|refactored)/i);
  if (typeM) out.type = typeM[1].toLowerCase();
  const dateM = head.match(/Automation-Date\s*:\s*(\d{4}-\d{2}-\d{2})/);
  if (dateM) out.date = dateM[1];
  return out;
}

/** sha1 of a string (used to detect spec changes vs the daily anchor). */
function sha1(text) {
  return crypto.createHash('sha1').update(text || '', 'utf8').digest('hex');
}

/** Today's date as YYYY-MM-DD (local time). */
function todayStr(d) {
  const t = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/** Recursively list every *.spec.ts under a directory, returned as repo-relative POSIX paths. */
function listSpecFiles(testsDir, repoRoot) {
  const results = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.spec.ts')) {
        results.push(path.relative(repoRoot, full).split(path.sep).join('/'));
      }
    }
  }
  walk(testsDir);
  return results.sort();
}

module.exports = { extractTcId, parseHeaderTags, sha1, todayStr, listSpecFiles };
