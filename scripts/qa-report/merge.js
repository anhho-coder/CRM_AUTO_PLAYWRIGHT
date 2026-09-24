'use strict';
/**
 * Merge sharded part files into the final qa-report-out/data/latest.json.
 *
 * The QA report collector is being split into independently-runnable SHARDS,
 * each emitting a part file with a status and a patch. This merge step reads
 * the part files in registry order, applies patches, and implements a fallback
 * strategy: if a shard failed or is missing, we serve the last-known-good
 * (LKG) version of that part, marked 'stale'. This removes the incentive for
 * aggressive retry loops and gives users yesterday's data rather than an
 * empty tab.
 *
 * Usage: node scripts/qa-report/merge.js
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { UNITS } = require('./sources/registry');
const { computeRanges, isoDate } = require('./lib/ranges');
const parts = require('./lib/parts');
const { buildSkeleton } = require('./lib/skeleton');

/**
 * Build the skeleton data structure that merge.js fills with patches.
 * Matches the skeleton that collect.js currently builds inline.
 */

/**
 * Validate and sanitize a patch against the current config.
 * Removes stale metric/quarterly keys that no longer exist in the config.
 * Returns a new patch with only valid keys.
 *
 * @param {object} patch   The patch to validate
 * @returns {object}       A sanitized patch with only config-compatible keys
 */
function validateAndSanitizePatch(patch) {
  if (!patch || typeof patch !== 'object') return patch;

  // Get the set of valid metric keys from current config
  const validMetricKeys = new Set(cfg.KPI_METRICS.map((m) => m.key));

  // For quarterly, we validate structure but don't filter aggressively
  // since quarterly format depends on date ranges, not static config.
  // However, we can warn if a metric key in quarterly is stale.

  const sanitized = { ...patch };

  // Filter metrics: keep only those whose keys are in current config
  if (sanitized.metrics && typeof sanitized.metrics === 'object') {
    const originalKeys = Object.keys(sanitized.metrics);
    const staleKeys = originalKeys.filter((k) => !validMetricKeys.has(k));

    if (staleKeys.length > 0) {
      console.warn(
        `[merge] LKG patch contained stale metric keys not in current config: ${staleKeys.join(', ')}. Removing them.`
      );
      const filtered = {};
      for (const k of originalKeys) {
        if (validMetricKeys.has(k)) {
          filtered[k] = sanitized.metrics[k];
        }
      }
      sanitized.metrics = filtered;
    }
  }

  // Filter quarterly metrics by the same logic
  if (sanitized.quarterly && typeof sanitized.quarterly === 'object') {
    const filtered = {};
    for (const [key, value] of Object.entries(sanitized.quarterly)) {
      if (validMetricKeys.has(key)) {
        filtered[key] = value;
      } else {
        console.warn(
          `[merge] LKG patch contained stale quarterly key '${key}' not in current config. Removing it.`
        );
      }
    }
    sanitized.quarterly = filtered;
  }

  return sanitized;
}

/**
 * Merge part files and produce the final report.
 */
async function main() {
  const now = new Date();
  const ranges = computeRanges(now);
  const members = cfg.MEMBERS.map((m) => m.name);

  // Build the base skeleton
  const data = buildSkeleton(now);

  // Track which units are served stale for logging
  const staleUnits = [];

  // Process each unit in registry order
  for (const unit of UNITS) {
    const partStart = Date.now();

    // Try to read the current part
    let part = parts.readPart(unit.id);

    if (part && (part.status === 'ok' || part.status === 'incomplete')) {
      // Part is good: apply it and promote to LKG
      parts.applyPatch(data, part.patch);
      parts.promoteToLkg(part);

      // Set source statuses from the part (they carry the unit's result)
      if (part.patch && part.patch.sources) {
        Object.assign(data.sources, part.patch.sources);
      }

      // Log successful parts
      const ms = Date.now() - partStart;
      console.log(`[merge] ${unit.id}: ${part.status} (${ms}ms)`);
    } else {
      // Part missing, unreadable, or error: try LKG
      const lkg = parts.readLkg(unit.id);

      if (lkg) {
        // LKG exists: serve it but mark as stale
        // Validate and sanitize the LKG patch against current config
        const sanitizedLkg = validateAndSanitizePatch(lkg.patch);
        parts.applyPatch(data, sanitizedLkg);

        // Override each source status to 'stale' with the original generatedAt
        for (const sourceKey of unit.sourceKeys) {
          data.sources[sourceKey] = {
            status: 'stale',
            asOf: lkg.generatedAt,
            message: 'served from last known good',
          };
        }

        staleUnits.push({ id: unit.id, sourceKey: unit.sourceKeys[0] || unit.id });
        const ms = Date.now() - partStart;
        console.log(`[merge] ${unit.id}: STALE (served from LKG, ${ms}ms)`);
      } else {
        // No LKG either: set each source to 'missing'
        for (const sourceKey of unit.sourceKeys) {
          data.sources[sourceKey] = {
            status: 'missing',
            message: 'shard produced no part this build',
          };
        }

        const ms = Date.now() - partStart;
        console.log(`[merge] ${unit.id}: MISSING (no part and no LKG, ${ms}ms)`);
      }
    }
  }

  // Compute overall status:
  // - 'ok' when all sources are 'ok'
  // - 'degraded' when some sources are 'ok' but not all
  // - 'failed' when no source is 'ok'
  const sourceStatuses = Object.values(data.sources).map((s) => s.status);
  const allOk = sourceStatuses.length && sourceStatuses.every((s) => s === 'ok');
  const someOk = sourceStatuses.some((s) => s === 'ok');
  const overall = allOk ? 'ok' : someOk ? 'degraded' : 'failed';

  // Write outputs
  fs.mkdirSync(cfg.DATA_DIR, { recursive: true });
  fs.mkdirSync(cfg.HISTORY_DIR, { recursive: true });

  // Write latest.json with pretty-printing (matches collect.js)
  fs.writeFileSync(
    path.join(cfg.DATA_DIR, 'latest.json'),
    JSON.stringify(data, null, 2)
  );

  // Write dated history snapshot (no pretty-printing, for storage efficiency)
  fs.writeFileSync(
    path.join(cfg.HISTORY_DIR, `${isoDate(now)}.json`),
    JSON.stringify(data)
  );

  // Write overall status
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'status.txt'), overall);

  // Write failed-sources.txt (comma-separated, sorted names of non-ok sources)
  const failedNames = Object.entries(data.sources)
    .filter(([, s]) => s.status !== 'ok')
    .map(([k]) => k)
    .sort();
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'failed-sources.txt'), failedNames.join(','));

  // Log summary
  console.log();
  console.log('[merge] Summary:');
  console.log(`[merge]   Status: ${overall}`);
  console.log(`[merge]   Sources: ${sourceStatuses.length} total, ` +
    `${sourceStatuses.filter((s) => s === 'ok').length} ok, ` +
    `${sourceStatuses.filter((s) => s === 'stale').length} stale, ` +
    `${sourceStatuses.filter((s) => s === 'missing').length} missing, ` +
    `${sourceStatuses.filter((s) => s === 'error').length} error, ` +
    `${sourceStatuses.filter((s) => s === 'incomplete').length} incomplete`);

  if (staleUnits.length > 0) {
    console.log(`[merge]   STALE units (served from LKG):`);
    for (const u of staleUnits) {
      const src = data.sources[u.sourceKey];
      console.log(`[merge]     ${u.id} (as of ${src.asOf})`);
    }
  }

  if (failedNames.length > 0) {
    console.log(`[merge]   Failed sources: ${failedNames.join(', ')}`);
  }

  console.log(`[merge] Wrote ${path.join(cfg.DATA_DIR, 'latest.json')}`);
  console.log(`[merge]   + ${path.join(cfg.HISTORY_DIR, isoDate(now) + '.json')}`);
  console.log(`[merge]   + ${path.join(cfg.DATA_DIR, 'status.txt')} (${overall})`);
  console.log(`[merge]   + ${path.join(cfg.DATA_DIR, 'failed-sources.txt')}`);

  // Always exit with 0: the data files (latest.json, status.txt) were successfully written.
  // The Jenkins pipeline reads status.txt in the "Check data status" stage to decide the
  // build result (UNSTABLE for degraded, FAILURE for failed). Exiting non-zero here would
  // cause the Merge stage to fail, skipping subsequent Render and Check stages, which
  // breaks the "always published" guarantee (index.html wouldn't be created, and the
  // post.always.publishHTML would fail trying to publish a missing file).
  process.exit(0);
}

main().catch((e) => {
  console.error('[merge] Fatal error:', e.message || e);
  process.exit(1);
});
