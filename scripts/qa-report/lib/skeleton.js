'use strict';
/**
 * The empty report document that every run starts from — the fields that do NOT come
 * from a collected source (identity, the selectable ranges, the base URL) plus an empty
 * container for each field that does.
 *
 * It lives in its own module because BOTH entry points need it: collect.js builds one and
 * fills it in-process, and merge.js builds the same one and fills it from the shard parts.
 * They were duplicated at first, which is a quiet way to break the report — the two copies
 * only have to disagree by one container for a patch aimed at the missing key to be dropped
 * on the floor by applyPatch (`Object.assign(data[key] || {}, ...)` merges into a throwaway
 * object when the key is absent). Sharing the definition removes that whole class of bug.
 *
 * merge.js cannot simply import it from collect.js: requiring collect.js runs a full
 * collection as a side effect of the module load.
 */
const cfg = require('../config');
const { computeRanges } = require('./ranges');

/**
 * @param now {Date} the build's reference time; the ranges are derived from it.
 */
function buildSkeleton(now) {
  return {
    generatedAt: new Date().toISOString(),
    team: 'CRM QA Team',
    members: cfg.MEMBERS.map((m) => m.name),
    ranges: computeRanges(now),
    defaultView: 'range',
    defaultRange: 'lastWeek',
    jiraBaseUrl: cfg.jiraBaseUrl(),
    // Merged per-key by lib/parts.js applyPatch — each must exist, see above.
    sources: {},
    metrics: {},
    quarterly: {},
    kpiJql: {},
    // Replaced wholesale by whichever unit owns them; null until that unit reports.
    worklog: null,
    featureExec: null,
    bugByPriority: null,
    supportClassification: null,
    automationCoverage: null,
  };
}

module.exports = { buildSkeleton };
