#!/usr/bin/env node
/*
 * Guard for the Allure test identity (ci/allure-test-identity.js). Run it after moving specs,
 * copying a spec into another section, or adding a Playwright project with its own testDir.
 *
 * It enforces the two rules the period reports depend on:
 *
 *   RULE 1 - one spec file = exactly ONE identity, no matter how it is launched. Every rootDir
 *            Playwright can pick (tests/, tests/1.Project_CRM, and each project's testDir) must
 *            resolve back to the same file. If it does not, that file gets several tiles in one
 *            period report and a PASS under one identity will not clear the FAIL under the other.
 *
 *   RULE 2 - two DIFFERENT spec files must NEVER share an identity, even when they hold the same
 *            TC and the same title (this repo keeps 13 such duplicated pairs, e.g. the THD/EAM/CMR
 *            specs living under BOTH 2.Leads_Assignment and O12_CE_to_O12_CC). A green run of one
 *            copy must not be written into the other copy's history, nor clear its red.
 *
 * Exit code 0 = both rules hold. 1 = a rule is broken (details printed). Duplicated file names
 * and duplicated titles are reported as INFO - they are allowed, they just have to stay isolated.
 *
 * Usage: node ci/check-test-identity.js [repoRoot]        (default: ci/..)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createResolver, md5 } = require('./allure-test-identity');

const repoRoot = process.argv[2] || path.join(__dirname, '..');
const identity = createResolver(repoRoot);
if (!identity.ready) { console.error(`check-test-identity: no tests/ tree under ${repoRoot}`); process.exit(1); }

const TEST_RE = /(?:^|[^.\w])test(?:\.(?:skip|only|fixme|fail))?\s*\(\s*(['"`])([\s\S]*?)\1/g;
function titlesOf(rel) {
  let src = '';
  try { src = fs.readFileSync(path.join(repoRoot, 'tests', rel), 'utf8'); } catch (e) { return []; }
  const out = [];
  TEST_RE.lastIndex = 0;
  let m;
  while ((m = TEST_RE.exec(src))) out.push(m[2].replace(/\s+/g, ' ').trim());
  return out;
}

let failures = 0;

// ---- RULE 1: launch-shape independence -----------------------------------------------------
const rootDirs = ['', '1.Project_CRM', ...new Set(identity.projectDirs.values())];
const projectOf = new Map();
for (const [name, dir] of identity.projectDirs) if (!projectOf.has(dir)) projectOf.set(dir, name);

let checked = 0;
const drift = [];
for (const root of rootDirs) {
  const pref = root ? root + '/' : '';
  const project = root ? projectOf.get(root) : 'chrome-headless';
  for (const rel of identity.specs) {
    if (!rel.startsWith(pref)) continue;
    checked++;
    const o = { fullName: rel.slice(pref.length) + ':1:1', name: 'title' };
    if (project) o.parameters = [{ name: 'Project', value: project }];
    const got = identity.canonicalPath(o);
    if (got !== rel) drift.push({ root: root || '<tests>', project, recorded: rel.slice(pref.length), got, want: rel });
  }
}
console.log(`RULE 1  one file = one identity : ${checked - drift.length}/${checked} launch shape(s) resolve to their own file`);
if (drift.length) {
  failures++;
  console.log('  BROKEN - these recorded paths do not resolve back to their own spec:');
  drift.slice(0, 30).forEach(d => console.log(`    rootDir=${d.root} project=${d.project}\n      recorded ${d.recorded}\n      got      ${d.got}\n      want     ${d.want}`));
  if (drift.length > 30) console.log(`    ... and ${drift.length - 30} more`);
}

// ---- RULE 2: different files never share an identity ---------------------------------------
const byId = new Map();          // historyId -> Set(spec files)
let tests = 0;
for (const rel of identity.specs) {
  for (const title of titlesOf(rel)) {
    tests++;
    const id = md5(rel + '::' + title);
    if (!byId.has(id)) byId.set(id, new Set());
    byId.get(id).add(rel);
  }
}
const shared = [...byId.entries()].filter(([, v]) => v.size > 1);
console.log(`RULE 2  distinct files stay separate : ${tests} test(s) over ${identity.specCount} spec(s), ${shared.length} shared identity(ies)`);
if (shared.length) {
  failures++;
  console.log('  BROKEN - one identity is claimed by several spec files:');
  shared.forEach(([id, v]) => { console.log('    id ' + id); [...v].forEach(f => console.log('      <- ' + f)); });
}

// ---- INFO: the duplicated specs that must keep their own history ---------------------------
const byBase = new Map();
for (const rel of identity.specs) {
  const b = rel.split('/').pop();
  if (!byBase.has(b)) byBase.set(b, []);
  byBase.get(b).push(rel);
}
const dupFiles = [...byBase.entries()].filter(([, v]) => v.length > 1);
console.log(`\nINFO  duplicated spec file names (isolated identities, own history each): ${dupFiles.length}`);
dupFiles.forEach(([b, v]) => { console.log('  ' + b); v.forEach(f => console.log('      ' + f + '   id=' + [...new Set(titlesOf(f).map(t => md5(f + '::' + t)))].join(','))); });

const byTitle = new Map();
for (const rel of identity.specs) for (const t of titlesOf(rel)) {
  if (!byTitle.has(t)) byTitle.set(t, new Set());
  byTitle.get(t).add(rel);
}
const dupTitles = [...byTitle.entries()].filter(([, v]) => v.size > 1);
console.log(`INFO  test titles used by more than one spec file: ${dupTitles.length}`);
dupTitles.forEach(([t, v]) => { console.log('  "' + t.slice(0, 100) + '"'); [...v].forEach(f => console.log('      ' + f)); });

console.log('\n' + identity.summary());
if (failures) { console.error(`\ncheck-test-identity: ${failures} rule(s) BROKEN`); process.exit(1); }
console.log('\ncheck-test-identity: OK');
