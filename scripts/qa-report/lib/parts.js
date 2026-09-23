'use strict';
/**
 * Part file management for the QA report collection system.
 *
 * The report collector is being split into independently-runnable SHARDS, each
 * emitting a PART file that describes what it computed. Each part carries a patch
 * (the data changes it produced) plus metadata (the unit's id, group, status, timing).
 * A MERGE step then reassembles these part files into the final latest.json by
 * applying patches in order, so a Jenkins retry loop can re-run a failed shard
 * without re-running all the others.
 *
 * This file handles the I/O: read/write part files, maintain a "last known good"
 * cache for recovery, and apply patches in the correct deep-merge order.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

// Part files are collected here during a build (wiped by Jenkins before each build).
// Last-known-good cache is outside the workspace for cross-build recovery on retry.
const PARTS_DIR = path.join(cfg.DATA_DIR, 'parts');
const LKG_DIR = path.join(cfg.CACHE_DIR, 'parts-lkg');

/**
 * Create an empty patch — the zero element for applyPatch merges.
 */
function emptyPatch() {
  return {
    metrics: {},
    quarterly: {},
    sources: {},
    kpiJql: {},
  };
}

/**
 * Deep-merge a patch into report data. Replaces some keys wholesale
 * (worklog, featureExec, bugByPriority, supportClassification, automationCoverage)
 * and merges others key-by-key (metrics, quarterly, sources, kpiJql).
 *
 * Does NOT mutate the patch — only reads it.
 *
 * @param {object} data    The accumulating report data object
 * @param {object} patch   The patch to apply (result of a unit's run())
 */
function applyPatch(data, patch) {
  if (!patch || typeof patch !== 'object') return;

  // Keys that are replaced wholesale (only if present in the patch)
  const REPLACE_KEYS = ['worklog', 'featureExec', 'bugByPriority', 'supportClassification', 'automationCoverage'];
  for (const key of REPLACE_KEYS) {
    if (key in patch) {
      data[key] = patch[key];
    }
  }

  // Keys that are merged per-key (Object.assign into the existing object)
  const MERGE_KEYS = ['metrics', 'quarterly', 'sources', 'kpiJql'];
  for (const key of MERGE_KEYS) {
    if (key in patch && patch[key] && typeof patch[key] === 'object') {
      Object.assign(data[key] || {}, patch[key]);
    }
  }
}

/**
 * Write a part file to the parts directory. Creates the directory if needed.
 *
 * @param {object} part   A part object with {id, group, status, generatedAt, ms, patch}
 */
function writePart(part) {
  fs.mkdirSync(PARTS_DIR, { recursive: true });
  const filepath = path.join(PARTS_DIR, `${part.id}.json`);
  fs.writeFileSync(filepath, JSON.stringify(part));
}

/**
 * Read a part file from the parts directory. Returns null if the file is missing,
 * empty, malformed JSON, or fails validation. Logs a line on error but never throws.
 *
 * @param {string} id   The part id (filename without .json)
 * @returns {object|null}
 */
function readPart(id) {
  const filepath = path.join(PARTS_DIR, `${id}.json`);
  try {
    const text = fs.readFileSync(filepath, 'utf8');
    if (!text.trim()) {
      console.error(`[parts] readPart("${id}"): file is empty`);
      return null;
    }
    const part = JSON.parse(text);
    // Validate shape: id, status, patch must be present
    if (!part.id || !part.status || !part.patch) {
      console.error(`[parts] readPart("${id}"): missing required fields (id, status, patch)`);
      return null;
    }
    return part;
  } catch (e) {
    if (e.code === 'ENOENT') {
      // File not found — not an error, just absent
      return null;
    }
    console.error(`[parts] readPart("${id}"): ${e.message}`);
    return null;
  }
}

/**
 * Read a part file from the LKG (last known good) cache. Same semantics as readPart —
 * returns null on any error without throwing.
 *
 * @param {string} id   The part id (filename without .json)
 * @returns {object|null}
 */
function readLkg(id) {
  const filepath = path.join(LKG_DIR, `${id}.json`);
  try {
    const text = fs.readFileSync(filepath, 'utf8');
    if (!text.trim()) {
      console.error(`[parts] readLkg("${id}"): file is empty`);
      return null;
    }
    const part = JSON.parse(text);
    // Validate shape: id, status, patch must be present
    if (!part.id || !part.status || !part.patch) {
      console.error(`[parts] readLkg("${id}"): missing required fields (id, status, patch)`);
      return null;
    }
    return part;
  } catch (e) {
    if (e.code === 'ENOENT') {
      // File not found — not an error, just absent
      return null;
    }
    console.error(`[parts] readLkg("${id}"): ${e.message}`);
    return null;
  }
}

/**
 * Promote a part to the LKG cache. Used to save the last successful run of each
 * unit so a later retry can reuse it if the unit fails. Only promotes parts with
 * status 'ok' or 'incomplete'.
 *
 * Creates the LKG directory if needed.
 *
 * @param {object} part   A part object with status 'ok' or 'incomplete'
 */
function promoteToLkg(part) {
  if (part.status !== 'ok' && part.status !== 'incomplete') {
    return;
  }
  fs.mkdirSync(LKG_DIR, { recursive: true });
  const filepath = path.join(LKG_DIR, `${part.id}.json`);
  fs.writeFileSync(filepath, JSON.stringify(part));
}

module.exports = {
  PARTS_DIR,
  LKG_DIR,
  emptyPatch,
  applyPatch,
  writePart,
  readPart,
  readLkg,
  promoteToLkg,
};
