#!/usr/bin/env node
'use strict';
/**
 * resolve-jira-path.js
 *
 * Map a Jira/Xray **Test Repository path** (or a CRM-#### ticket key) to the matching
 * Playwright spec files in this repo, and emit a single Jenkins SPEC value.
 *
 * Usage:
 *   node ci/resolve-jira-path.js "<jira repository path>" [--json]
 *
 * Examples:
 *   node ci/resolve-jira-path.js "CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options"
 *   node ci/resolve-jira-path.js "/CRM test/CRM module/CRM-10601 .../1. Mass Mark as duplicate" --json
 *   node ci/resolve-jira-path.js "CRM-2482"
 *
 * Matching precedence:
 *   1. header     - newer specs carry a "Test Repository Path:" line in their /** header
 *                   block; we segment-boundary prefix-match (input is ancestor-or-equal
 *                   of the stored path, or vice-versa). Coarse input -> whole suite;
 *                   a deeper sub-path -> just that sub-tree.
 *   2. ticketKey  - FALLBACK for older suites with no header line: match by the CRM-####
 *                   ticket key found in the input against the spec's Test Case ID / folder /
 *                   filename.
 *
 * Output (human): "matchMode=", "matched=", one spec path per line, then a single
 *   "SPEC=<value>" line (Jenkins captures this). Warnings go to stderr.
 *   With --json: a single JSON object on stdout.
 *
 * SPEC value: the common folder when it contains exactly the matched specs (compact),
 *   else the explicit space-joined list of repo-relative tests/ paths (Playwright accepts
 *   multiple paths). Always forward-slashed (the chrome-headless project has testDir './tests').
 *
 * Exit codes: 0 = matched | 2 = no match (suggestions on stderr) | 1 = bad usage.
 *
 * Zero-dependency (fs/path only), same walk + /** header-parse style as
 * ci/allure-inject-descriptions.js.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');

// Loose normalization so Xray header text ("/3. Visibility & Access") and a typed
// request ("3 visibility and access") compare equal: lowercase, slashes, drop leading
// slash, '&' == 'and', '-'/'_' -> space, collapse whitespace.
function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/^\s*\/+/, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/&/g, ' and ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toPosixRel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

function walkSpecs(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkSpecs(full, out);
    else if (name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

function headerBlock(content) {
  const m = content.match(/\/\*\*([\s\S]*?)\*\//);
  return m ? m[1] : '';
}

function buildIndex() {
  const files = walkSpecs(TESTS_DIR, []);
  return files.map((abs) => {
    const repoRel = toPosixRel(abs);
    let storedPath = null;
    let ticketKey = null;
    try {
      const head = headerBlock(fs.readFileSync(abs, 'utf8'));
      const sp = head.match(/Test Repository Path:\s*(.+)/);
      if (sp) storedPath = sp[1].replace(/\*\/\s*$/, '').trim();
      const tc = head.match(/Test Case ID:\s*CRM-(\d+)/i);
      if (tc) ticketKey = 'CRM-' + tc[1];
    } catch (e) {
      /* unreadable file - skip its metadata */
    }
    if (!ticketKey) {
      const fk = repoRel.match(/tc-crm-(\d+)-/i) || repoRel.match(/CRM[-_](\d+)/i);
      if (fk) ticketKey = 'CRM-' + fk[1];
    }
    return {
      repoRel,
      storedPath,
      normStored: storedPath ? norm(storedPath) : null,
      ticketKey,
    };
  });
}

// True if `longer` equals `shorter` or sits directly below it at a path-segment
// boundary (so "3 visibility" does NOT match "3 visibility and access").
function isAncestorOrEqual(longer, shorter) {
  return longer === shorter || longer.startsWith(shorter + '/');
}

function ticketKeysFrom(raw) {
  const out = [];
  const re = /crm[-\s_]?(\d+)/gi;
  let m;
  while ((m = re.exec(raw))) {
    const k = 'CRM-' + m[1];
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

// Longest common leading directory of a set of posix file paths.
function commonDir(paths) {
  if (paths.length === 0) return '';
  if (paths.length === 1) return paths[0].split('/').slice(0, -1).join('/');
  const split = paths.map((p) => p.split('/'));
  const first = split[0];
  let i = 0;
  outer: for (; i < first.length; i++) {
    for (const s of split) {
      if (s[i] !== first[i]) break outer;
    }
  }
  return first.slice(0, i).join('/');
}

// Collapse the matched paths to one SPEC value: the common folder if it physically
// contains exactly the matched specs, else the explicit space-joined list.
function collapseSpec(matchedPaths, allPaths) {
  const sorted = [...new Set(matchedPaths)].sort();
  const dir = commonDir(sorted);
  if (dir) {
    const under = allPaths.filter((p) => p === dir || p.startsWith(dir + '/'));
    if (under.length === sorted.length && sorted.every((p) => p.startsWith(dir + '/'))) {
      return dir;
    }
  }
  return sorted.join(' ');
}

// Up to 5 stored paths sharing the most normalized tokens with the input.
function suggestions(index, raw) {
  const inTokens = new Set(norm(raw).split(/[\/ ]+/).filter(Boolean));
  const scored = index
    .filter((e) => e.normStored)
    .map((e) => {
      const toks = new Set(e.normStored.split(/[\/ ]+/).filter(Boolean));
      let score = 0;
      for (const t of inTokens) if (toks.has(t)) score++;
      return { p: e.storedPath, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const seen = new Set();
  const out = [];
  for (const s of scored) {
    if (!seen.has(s.p)) {
      seen.add(s.p);
      out.push(s.p);
    }
    if (out.length >= 5) break;
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const input = argv.filter((a) => a !== '--json').join(' ').trim();
  if (!input) {
    process.stderr.write('Usage: node ci/resolve-jira-path.js "<jira repository path>" [--json]\n');
    process.exit(1);
  }

  const index = buildIndex();
  const allPaths = index.map((e) => e.repoRel);
  const nin = norm(input);
  const warnings = [];

  // 1. PRIMARY: header "Test Repository Path:" prefix match.
  let matchMode = 'header';
  let matched = index.filter(
    (e) => e.normStored && (isAncestorOrEqual(e.normStored, nin) || isAncestorOrEqual(nin, e.normStored))
  );

  // 2. FALLBACK: ticket key.
  if (matched.length === 0) {
    const keys = ticketKeysFrom(input);
    if (keys.length === 0) {
      process.stderr.write(`No match for: ${input}\n`);
      const sug = suggestions(index, input);
      if (sug.length) {
        process.stderr.write('Did you mean one of:\n');
        sug.forEach((s) => process.stderr.write('  ' + s + '\n'));
      }
      process.exit(2);
    }
    matchMode = 'ticketKey';
    matched = index.filter((e) => e.ticketKey && keys.includes(e.ticketKey));
    if (keys.length > 1) warnings.push(`multiple ticket keys: ${keys.join(', ')}`);
    if (matched.length === 0) {
      process.stderr.write(`No specs found for ticket key(s): ${keys.join(', ')}\n`);
      process.exit(2);
    }
  }

  const paths = [...new Set(matched.map((e) => e.repoRel))].sort();
  const spec = collapseSpec(paths, allPaths);
  if (paths.length > 40) {
    warnings.push(
      `matched ${paths.length} specs; at workers=1 this can approach the 480-min Jenkins timeout - consider a sub-path`
    );
  }

  if (json) {
    process.stdout.write(
      JSON.stringify({ matchMode, input, count: paths.length, specs: paths, spec, warnings }, null, 2) + '\n'
    );
  } else {
    process.stdout.write(`matchMode=${matchMode}\n`);
    process.stdout.write(`matched=${paths.length}\n`);
    paths.forEach((p) => process.stdout.write('  ' + p + '\n'));
    process.stdout.write(`SPEC=${spec}\n`);
  }
  warnings.forEach((w) => process.stderr.write('WARN: ' + w + '\n'));
}

main();
