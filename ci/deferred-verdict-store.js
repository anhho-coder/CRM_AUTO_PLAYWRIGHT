#!/usr/bin/env node
/*
 * ONE reader for the round-2 (deferred re-verify) evidence, keyed by SPEC FILE.
 *
 * The round-1 assignment specs emit a manifest record per lead checkpoint
 * (<deferredRoot>\<day>\<JOB>-<BUILD>.jsonl, see helpers/deferred-verify.helper.ts), and the
 * CRM_Leads_Assignment_DeferredVerify job re-opens each lead ~1h later and stashes its verdict
 * (<deferredRoot>\<day>\verdict-<JOB>-<BUILD>.json). Both records carry `specFile`, so the whole
 * chain can be keyed on the SPEC FILE - which matters because the repo keeps 13 duplicated specs
 * that share a TC id (e.g. "TC.THD_3.2.1.5.2" exists under BOTH 2.Leads_Assignment and
 * O12_CE_to_O12_CC). Keying on tcId fuses those twins: one copy's round-2 recovery would silence
 * the other copy's failure, or mark it async when it never deferred at all.
 *
 * Key = the spec's canonical path relative to tests/ (ci/allure-test-identity.js resolves the many
 * spellings: absolute runner path, chunk-run fullName, --project=<Section> fullName, sub-tree
 * project fullName, pre-move path), lowercased. Falls back to the old "tail from 1.Project_CRM/"
 * when the tests/ tree is not available.
 *
 * Consumers: ci/allure-apply-round2-verdict.js (flips round-1 async-empty failures in the weekly
 * report) and ci/allure-build-fix-branches.js (async / async-ok / failed on the Fix-branches tab).
 *
 * Usage:
 *   const { createStore } = require('./deferred-verdict-store');
 *   const store = createStore({ dvRoot: 'C:\\deferred-verify', days: ['2026-08-11'], repoRoot });
 *   store.keyOf(specPathOrFullName)   // canonical key for a result / manifest / verdict record
 *   store.decide(key)                 // 'recovered' | 'stillwrong' | 'skip' (no usable verdict)
 *   store.entry(key)                  // { fields: Map(field -> {ok,now,runAtIso,dead}), leadUrl }
 *   store.manifestKeys(jobName)       // Set of spec keys that job DEFERRED (round-1 manifests)
 *   store.manifestTcIds(jobName)      // Set of tcIds, for records written before specFile existed
 *   store.summary()
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createResolver } = require('./allure-test-identity');

function stripBom(s) { return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s; }
function readJsonFile(p) { try { return JSON.parse(stripBom(fs.readFileSync(p, 'utf8'))); } catch (e) { return null; } }
function readLines(p) {
  try { return stripBom(fs.readFileSync(p, 'utf8')).split('\n').map(l => l.trim()).filter(Boolean); } catch (e) { return []; }
}
function readdir(p) { try { return fs.readdirSync(p); } catch (e) { return []; } }

// Legacy key, kept so nothing breaks when tests/ is not next to ci/.
function legacyTail(s) {
  const n = String(s || '').replace(/\\/g, '/').replace(/:\d+(?::\d+)?$/, '');
  const k = n.indexOf('1.Project_CRM/');
  if (k >= 0) return n.slice(k).toLowerCase();
  const t = n.toLowerCase().lastIndexOf('/tests/');
  if (t >= 0) return n.slice(t + '/tests/'.length).toLowerCase();
  return n.toLowerCase();
}

function createStore(opts) {
  const o = opts || {};
  const dvRoot = o.dvRoot || 'C:\\deferred-verify';
  const days = Array.isArray(o.days) ? o.days.filter(Boolean) : [];
  const identity = o.resolver || createResolver(o.repoRoot || path.join(__dirname, '..'));

  function keyOf(pathLike) {
    if (!pathLike) return null;
    if (identity.ready) {
      const canon = identity.canonicalPath({ fullName: String(pathLike) });
      if (canon) return canon.toLowerCase();
    }
    return legacyTail(pathLike) || null;
  }

  // ---- round-2 verdicts: key -> { fields: Map(field -> {ok,now,runAtIso,dead}), leadUrl } ----
  const bySpec = new Map();
  let verdictFiles = 0, verdictRecords = 0, verdictNoSpec = 0;
  for (const day of days) {
    const d = path.join(dvRoot, day);
    for (const f of readdir(d)) {
      if (!/^verdict-.*\.json$/i.test(f)) continue;
      const arr = readJsonFile(path.join(d, f));
      if (!Array.isArray(arr)) continue;
      verdictFiles++;
      for (const rec of arr) {
        if (!rec || !rec.field) continue;
        if (!rec.specFile) { verdictNoSpec++; continue; }
        const key = keyOf(rec.specFile);
        if (!key) continue;
        verdictRecords++;
        let e = bySpec.get(key);
        if (!e) { e = { fields: new Map(), leadUrl: rec.leadUrl || '' }; bySpec.set(key, e); }
        const prev = e.fields.get(rec.field);
        // keep the LATEST record per field (mirrors dedupe-latest keeping the latest round-1 run)
        if (!prev || String(rec.runAtIso || '') >= String(prev.runAtIso || '')) {
          e.fields.set(rec.field, { ok: !!rec.ok, now: rec.now || '', runAtIso: rec.runAtIso || '', dead: !!rec.dead });
          if (rec.leadUrl) e.leadUrl = rec.leadUrl;
        }
      }
    }
  }

  function decide(key) {
    const e = bySpec.get(key);
    if (!e) return 'skip';
    const fields = [...e.fields.values()];
    if (!fields.length) return 'skip';
    if (fields.some(f => f.dead)) return 'skip';           // unreachable lead -> cannot judge
    return fields.some(f => !f.ok) ? 'stillwrong' : 'recovered';
  }

  // ---- round-1 manifests: which specs a given job DEFERRED in the window ----
  const manifestCache = new Map();
  function manifests(jobName) {
    if (manifestCache.has(jobName)) return manifestCache.get(jobName);
    const keys = new Set(), tcIds = new Set();
    for (const day of days) {
      const d = path.join(dvRoot, day);
      for (const f of readdir(d)) {
        if (f.indexOf(jobName + '-') !== 0 || !f.endsWith('.jsonl')) continue;
        for (const line of readLines(path.join(d, f))) {
          let rec;
          try { rec = JSON.parse(line); } catch (e) { continue; }
          if (!rec) continue;
          if (rec.tcId) tcIds.add(String(rec.tcId).trim());
          const k = rec.specFile ? keyOf(rec.specFile) : null;
          if (k) keys.add(k);
        }
      }
    }
    const out = { keys, tcIds };
    manifestCache.set(jobName, out);
    return out;
  }

  return {
    ready: identity.ready,
    identity,
    keyOf,
    decide,
    entry: (key) => bySpec.get(key) || null,
    has: (key) => bySpec.has(key),
    size: bySpec.size,
    keys: () => [...bySpec.keys()],
    manifestKeys: (jobName) => manifests(jobName).keys,
    manifestTcIds: (jobName) => manifests(jobName).tcIds,
    summary() {
      return `deferred-verdicts: ${verdictFiles} verdict file(s), ${verdictRecords} record(s) -> ${bySpec.size} spec(s)` +
             (verdictNoSpec ? `, ${verdictNoSpec} record(s) without specFile ignored` : '') +
             (identity.ready ? '' : ' (legacy path keys - no tests/ tree)');
    },
  };
}

module.exports = { createStore, legacyTail };
