#!/usr/bin/env node
/*
 * Fold the rolling history of the OLD (regex-only) test identity into the new canonical one,
 * so switching to ci/allure-test-identity.js does not blank every test's History tab - and so
 * the chains that the old key had SPLIT (one spec file recorded under 2-3 paths) finally join.
 *
 * Allure's carry-forward file <history>/history.json is keyed by historyId:
 *     { "<md5(key)>": { "statistic": {...}, "items": [ {uid,status,time:{start,stop,duration}}, ... ] } }
 * The old key was  <fullName minus ":line:col", minus ".../1.Project_CRM/<section>/">::<title>,
 * and fullName is relative to Playwright's rootDir - so the SAME spec produced a different key
 * per launch shape (chunk run / --project=<Section> / sub-tree project / two sections at once).
 * For every spec+title in the repo we can therefore RECOMPUTE every id the old key could have
 * produced, and remap those entries onto the single new id.
 *
 * Merge rule: union of items, one row per distinct execution (time.start|time.stop, else uid),
 * newest first, capped at 20 (Allure's own history depth), statistic recomputed from the items.
 * Unknown ids (specs deleted/renamed since, or pre-move paths we cannot reconstruct) are left
 * untouched: they simply age out. Idempotent - running it twice changes nothing.
 *
 * Usage: node ci/allure-migrate-history-ids.js <historyDir> [repoRoot] [--dry-run]
 *        historyDir = the folder holding history.json (e.g. allure-merged\history)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createResolver, legacyKey, md5 } = require('./allure-test-identity');

const args = process.argv.slice(2).filter(a => a !== '--dry-run');
const dryRun = process.argv.includes('--dry-run');
const histDir = args[0] || path.join('allure-merged', 'history');
const repoRoot = args[1] || path.join(__dirname, '..');
const MAX_ITEMS = 20;

const histFile = path.join(histDir, 'history.json');
let hist;
try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch (e) {
  console.log(`migrate-history-ids: no readable ${histFile} - nothing to migrate.`);
  process.exit(0);
}
if (!hist || typeof hist !== 'object') { console.log('migrate-history-ids: unexpected history.json shape - skipped.'); process.exit(0); }

const identity = createResolver(repoRoot);
if (!identity.ready) { console.log(`migrate-history-ids: no tests/ tree under ${repoRoot} - skipped.`); process.exit(0); }

// ---- test titles per spec file (same shape the specs are written in) ----
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

// ---- every rootDir Playwright can pick => every legacy id a spec could have had ----
const rootDirs = ['', '1.Project_CRM', ...new Set(identity.projectDirs.values())];

const oldToNew = new Map();       // legacy historyId -> canonical historyId
let pairs = 0;
for (const rel of identity.specs) {
  const titles = titlesOf(rel);
  if (!titles.length) continue;
  for (const title of titles) {
    const newId = md5(rel + '::' + title);
    pairs++;
    for (const root of rootDirs) {
      const pref = root ? root + '/' : '';
      if (!rel.startsWith(pref)) continue;
      const oldId = md5(legacyKey({ fullName: rel.slice(pref.length), name: title }));
      if (oldId !== newId && !oldToNew.has(oldId)) oldToNew.set(oldId, newId);
    }
  }
}

// ---- remap ----
function execKey(it) {
  const t = (it && it.time) || {};
  return (t.start != null || t.stop != null) ? `t:${t.start}|${t.stop}` : `u:${it && it.uid}`;
}
const STATUSES = ['failed', 'broken', 'passed', 'skipped', 'unknown'];
function statOf(items) {
  const s = { failed: 0, broken: 0, passed: 0, skipped: 0, unknown: 0, total: 0 };
  for (const it of items) { const st = STATUSES.includes(it && it.status) ? it.status : 'unknown'; s[st]++; s.total++; }
  return s;
}
function mergeInto(target, extra) {
  const items = [...((target && target.items) || []), ...((extra && extra.items) || [])];
  const seen = new Set();
  const uniq = items.filter(it => { const k = execKey(it); if (seen.has(k)) return false; seen.add(k); return true; });
  uniq.sort((a, b) => Number(((b && b.time) || {}).start || 0) - Number(((a && a.time) || {}).start || 0));
  const capped = uniq.slice(0, MAX_ITEMS);
  return { statistic: statOf(capped), items: capped };
}

let moved = 0, mergedInto = 0, untouched = 0;
const before = Object.keys(hist).length;
for (const oldId of Object.keys(hist)) {
  const newId = oldToNew.get(oldId);
  if (!newId) { untouched++; continue; }
  const src = hist[oldId];
  if (hist[newId]) { hist[newId] = mergeInto(hist[newId], src); mergedInto++; }
  else { hist[newId] = src; moved++; }
  delete hist[oldId];
}
const after = Object.keys(hist).length;

console.log(`migrate-history-ids: ${identity.specCount} spec(s), ${pairs} test(s), ${oldToNew.size} legacy id(s) mapped`);
console.log(`migrate-history-ids: history entries ${before} -> ${after}  (renamed ${moved}, merged into an existing chain ${mergedInto}, left alone ${untouched})`);
if (dryRun) { console.log('migrate-history-ids: --dry-run, nothing written.'); process.exit(0); }
if (moved || mergedInto) {
  fs.writeFileSync(histFile, JSON.stringify(hist));
  console.log(`migrate-history-ids: rewrote ${histFile}`);
} else {
  console.log('migrate-history-ids: nothing to remap (already migrated).');
}
