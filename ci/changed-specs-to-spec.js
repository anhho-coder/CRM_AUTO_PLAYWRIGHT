#!/usr/bin/env node
/**
 * changed-specs-to-spec.js - turn "spec files DEPLOYED since <SINCE>" into the re-run plan
 * that ci/Jenkinsfile.rerun-deployed consumes.
 *
 * Sibling of ci/weekly-fails-to-spec.js (fails from a frozen Allure report) and
 * ci/weekly-submitted-to-spec.js. Same OUTPUT CONTRACT, so the per-group re-run loop is
 * identical:
 *     rerun/<Group>.txt   space-joined, double-quoted spec BASENAMES (Playwright filters)
 *     rerun/_suites.txt   one "<Group> <count>" line per group
 *     rerun/_summary.txt  human-readable plan
 *     stdout              PLAN_SINCE= / PLAN_GROUPS= / PLAN_SPECS= / PLAN_TOTAL= lines
 *
 * WHY BASENAMES, not paths (same reason as weekly-fails-to-spec.js:19-23): a positional
 * Playwright arg is a REGEX matched against the whole file path, so the ASCII basename still
 * finds a spec that MOVED folders since it was committed (the PreSales project moved its whole
 * testDir on 2026-09-18), and no U+2192 arrow / '%' / space from the O12 tree ever reaches cmd.
 * Regex metacharacters in a basename ARE escaped here - "...-(TEMPLATE).spec.ts" as a raw regex
 * matches nothing, because the parentheses are read as a capture group.
 *
 * ENV:
 *   SINCE    'monday' (default, = Monday 00:00 of the current ISO week) | any git --since value
 *            ('7 days', '2026-09-14') | a git ref/sha (then <ref>..HEAD is diffed instead)
 *   SPEC_GROUPS  'preprod' (default) | 'all' | 'mig' | an exact group name (e.g. CRM_Module)
 *   REF      git ref to scan, default HEAD (the branch Jenkins checked out)
 *   OUT_DIR  default 'rerun'
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SINCE = (process.env.SINCE || 'monday').trim();
// NOTE: the env var is SPEC_GROUPS, not GROUPS - bash keeps GROUPS as a read-only array,
// so `GROUPS=mig node ci/changed-specs-to-spec.js` silently keeps the default in Git Bash.
const GROUPS = (process.env.SPEC_GROUPS || 'preprod').trim();
const REF = (process.env.REF || 'HEAD').trim();
const OUT_DIR = process.env.OUT_DIR || 'rerun';

// A spec's group is decided by its path. 'mig' = the crm-mig tree (different server, write rules,
// mandatory teardown); everything else runs against pre-production.
const GROUP_BY_PREFIX = [
  ['tests/1.Project_CRM/1.SalesReport_Performance/', 'SalesReport_Performance', 'preprod'],
  ['tests/1.Project_CRM/2.Leads_Assignment/', 'Leads_Assignment', 'preprod'],
  ['tests/1.Project_CRM/3.Lead_Merging/', 'Lead_Merging', 'preprod'],
  ['tests/1.Project_CRM/4.Investments/', 'Investments', 'preprod'],
  ['tests/1.Project_CRM/5.Contact/', 'Contact', 'preprod'],
  ['tests/1.Project_CRM/6.Helpdesk_Module/', 'Helpdesk_Module', 'preprod'],
  ['tests/1.Project_CRM/7.Licenses_Module/', 'Licenses_Module', 'preprod'],
  ['tests/1.Project_CRM/9.CRM_Module/', 'CRM_Module', 'preprod'],
  ['tests/1.Project_CRM/10.Sales_Module/', 'Sales_Module', 'preprod'],
  ['tests/1.Project_CRM/O12_CE_to_O12_CC/', 'O12_Mig', 'mig'],
];

// Scratch / helper trees that are not test cases - never re-run them.
const EXCLUDE_PREFIXES = [
  'tests/demo_test/',
  'tests/test_piece_of_code/',
  'tests/_explore/',
  'tests/Regular_commands/',
];
const EXCLUDE_BASENAMES = ['seed.spec.ts', 'example.spec.ts'];

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// 'monday' -> the ISO-week Monday at 00:00 local, as a git-friendly date string.
function resolveSince(v) {
  if (v.toLowerCase() !== 'monday') return v;
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 00:00:00`;
}

function isGitRef(v) {
  try {
    sh(`git rev-parse --verify --quiet "${v}^{commit}"`);
    return true;
  } catch (e) {
    return false;
  }
}

// Playwright positional filters are regexes over the full path - escape everything that would
// otherwise change the meaning of a literal file name.
function escapeRegex(s) {
  return s.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');
}

function groupOf(p) {
  for (const [prefix, name, env] of GROUP_BY_PREFIX) {
    if (p.startsWith(prefix)) return { name, env };
  }
  return { name: 'Other', env: 'preprod' };
}

function selected(g) {
  if (GROUPS === 'all') return true;
  if (GROUPS === 'preprod' || GROUPS === 'mig') return g.env === GROUPS;
  return g.name === GROUPS;
}

// ---- collect the changed spec paths ---------------------------------------------------------
const sinceResolved = resolveSince(SINCE);
let raw;
let scanDesc;
if (SINCE.toLowerCase() !== 'monday' && isGitRef(SINCE)) {
  scanDesc = `git diff ${SINCE}..${REF}`;
  raw = sh(`git diff --name-only --diff-filter=AMR "${SINCE}" "${REF}" -- "*.spec.ts"`);
} else {
  scanDesc = `git log --since="${sinceResolved}" ${REF}`;
  raw = sh(`git log --since="${sinceResolved}" --name-only --pretty=format: "${REF}" -- "*.spec.ts"`);
}

const touched = [...new Set(raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))].sort();

const dropped = { deleted: [], excluded: [], notSelected: [] };
const byGroup = new Map();
const basenameOwners = new Map();

for (const p of touched) {
  if (!fs.existsSync(p)) { dropped.deleted.push(p); continue; }            // deleted or renamed away
  if (EXCLUDE_PREFIXES.some((x) => p.startsWith(x))) { dropped.excluded.push(p); continue; }
  const base = path.basename(p);
  if (EXCLUDE_BASENAMES.includes(base)) { dropped.excluded.push(p); continue; }
  const g = groupOf(p);
  if (!selected(g)) { dropped.notSelected.push(p); continue; }
  if (!byGroup.has(g.name)) byGroup.set(g.name, []);
  byGroup.get(g.name).push({ p, base });
  if (!basenameOwners.has(base)) basenameOwners.set(base, []);
  basenameOwners.get(base).push(p);
}

// ---- write the contract ---------------------------------------------------------------------
if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const summary = [];
const suiteLines = [];
let total = 0;

for (const name of [...byGroup.keys()].sort()) {
  const items = byGroup.get(name);
  const bases = [...new Set(items.map((i) => i.base))].sort();
  fs.writeFileSync(path.join(OUT_DIR, `${name}.txt`), bases.map((b) => `"${escapeRegex(b)}"`).join(' '));
  suiteLines.push(`${name} ${bases.length}`);
  summary.push(`${name}: ${bases.length} spec(s)`);
  items.slice().sort((a, b) => a.p.localeCompare(b.p)).forEach((i) => summary.push(`    ${i.p}`));
  total += bases.length;
}

fs.writeFileSync(path.join(OUT_DIR, '_suites.txt'), suiteLines.join('\n'));

const collisions = [...basenameOwners.entries()].filter(([, paths]) => paths.length > 1);
const head = [
  `Scan:    ${scanDesc}`,
  `SINCE:   ${SINCE}${SINCE.toLowerCase() === 'monday' ? ` (= ${sinceResolved})` : ''}`,
  `GROUPS:  ${GROUPS}`,
  `Touched: ${touched.length} spec file(s) in the range`,
  `Dropped: ${dropped.deleted.length} deleted/renamed, ${dropped.excluded.length} scratch, ${dropped.notSelected.length} not in GROUPS`,
  `To run:  ${total} spec(s)`,
  '',
];
if (collisions.length) {
  head.push('WARNING - basenames shared by more than one spec (each filter runs BOTH files):');
  collisions.forEach(([b, paths]) => head.push(`  ${b} -> ${paths.join(' , ')}`));
  head.push('');
}
fs.writeFileSync(path.join(OUT_DIR, '_summary.txt'), head.concat(summary).join('\n'));

console.log(head.join('\n'));
summary.forEach((l) => console.log(l));
console.log(`PLAN_SINCE=${sinceResolved}`);
console.log(`PLAN_GROUPS=${GROUPS}`);
console.log(`PLAN_SPECS=${suiteLines.join(' | ') || '(none)'}`);
console.log(`PLAN_TOTAL=${total}`);
