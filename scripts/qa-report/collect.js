'use strict';
/**
 * Orchestrator: gather every report section into qa-report-out/data/latest.json
 * (plus a dated snapshot in data/history/). This driver has been refactored to support
 * independent shard collection via part files, while keeping backward compatibility
 * with the no-arg path (run all units in-process and write the same final output).
 *
 * Usage:
 *   node scripts/qa-report/collect.js                 -> run ALL groups in this process
 *   node scripts/qa-report/collect.js --only=<g>[,<g>] -> run only those groups; write parts/
 *   node scripts/qa-report/collect.js --dry-run        -> resolve and print the plan; exit 0
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { GROUPS, UNITS, unitsForGroups } = require('./sources/registry');
const parts = require('./lib/parts');
const { computeRanges, fetchStart, aggregate, isoDate } = require('./lib/ranges');
const { quarterlyActualFromDaily } = require('./sources/testexec');

/**
 * Build the skeleton data object that all collection drivers must produce.
 * Exported so merge.js can build the same shape when reassembling parts.
 */
function buildSkeleton(now) {
  const ranges = computeRanges(now);
  const members = cfg.MEMBERS.map((m) => m.name);

  return {
    generatedAt: new Date().toISOString(),
    team: 'CRM QA Team',
    members,
    ranges,
    defaultView: 'range',
    defaultRange: 'lastWeek',
    jiraBaseUrl: cfg.jiraBaseUrl(),
    sources: {},
    metrics: {},
    quarterly: {},
    worklog: null,
    featureExec: null,
    bugByPriority: null,
    supportClassification: null,
    automationCoverage: null,
    kpiJql: {},
  };
}

/**
 * Run a single unit inside try/catch, time it, and return a part object.
 * The part carries the unit's id, group, status, timing, and patch.
 */
async function runUnit(unit, ctx) {
  const startMs = Date.now();
  try {
    const patch = await unit.run(ctx);
    const ms = Date.now() - startMs;

    // Mark all sourceKeys in the patch with status 'ok'
    if (!patch.sources) patch.sources = {};
    for (const sourceKey of unit.sourceKeys) {
      if (!(sourceKey in patch.sources)) {
        patch.sources[sourceKey] = { status: 'ok' };
      }
    }

    return {
      id: unit.id,
      group: unit.group,
      status: 'ok',
      generatedAt: new Date().toISOString(),
      ms,
      patch,
    };
  } catch (e) {
    const ms = Date.now() - startMs;
    const patch = parts.emptyPatch();
    patch.sources = {};
    for (const sourceKey of unit.sourceKeys) {
      patch.sources[sourceKey] = {
        status: 'error',
        message: String(e.message || e),
      };
    }

    return {
      id: unit.id,
      group: unit.group,
      status: 'error',
      generatedAt: new Date().toISOString(),
      ms,
      patch,
    };
  }
}

/**
 * Parse CLI arguments.
 */
function parseCli() {
  const args = process.argv.slice(2);
  const result = { groupsToRun: null, dryRun: false };

  for (const arg of args) {
    if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg.startsWith('--only=')) {
      result.groupsToRun = arg.slice(7).split(',').map((s) => s.trim());
    }
  }

  return result;
}

/**
 * Main driver: run units, write parts (if --only), and optionally merge back to latest.json.
 */
async function main() {
  const now = new Date();
  const cli = parseCli();

  // Resolve which units to run
  const unitsToRun = cli.groupsToRun === null
    ? UNITS  // no --only flag: run all units
    : unitsForGroups(cli.groupsToRun);

  // DRY-RUN: print the plan and exit
  if (cli.dryRun) {
    console.log('[collect] Dry-run: unit collection plan');
    const seen = new Set();
    for (const group of GROUPS) {
      const groupUnits = unitsToRun.filter((u) => u.group === group);
      if (groupUnits.length === 0) continue;
      if (!seen.has(group)) {
        console.log(`  Group: ${group}`);
        seen.add(group);
      }
      for (const unit of groupUnits) {
        console.log(`    Unit: ${unit.id}`);
        if (unit.sourceKeys.length > 0) {
          console.log(`      Sources: ${unit.sourceKeys.join(', ')}`);
        } else {
          console.log(`      Sources: (none — internal metric)`);
        }
      }
    }
    return;
  }

  // Build the base skeleton
  const data = buildSkeleton(now);

  // Build the context object (shared state within this process)
  const ranges = data.ranges;
  const members = data.members;
  const scratch = {}; // in-memory state shared by units in the same group

  const ctx = {
    now,
    ranges,
    members,
    cfg,
    data,
    scratch,
  };

  console.log(`[collect] Running ${unitsToRun.length} unit(s)...`);

  // Run all units, accumulating patches into `data`
  let currentGroup = null;
  for (const unit of unitsToRun) {
    // Reset scratch for each group boundary (so intra-group dependents see shared data,
    // but units from different groups start fresh).
    if (currentGroup !== unit.group) {
      ctx.scratch = {};
      currentGroup = unit.group;
    }

    const part = await runUnit(unit, ctx);

    // Log the unit result
    const sec = (part.ms / 1000).toFixed(1);
    console.log(`[collect]   ${part.id} (${part.group}): ${part.status} ${sec}s`);

    // Accumulate into `data` in BOTH modes, not just the all-in-process one.
    // ctx.data is how a unit reaches what an EARLIER unit of its own group produced:
    // jiraExecPerDay reads data.metrics[m.numeratorKey], the metric jiraUniqueTc writes
    // two units before it. Applying the patch only in the no-arg path left data.metrics
    // empty under --only, so on Jenkins that numerator lookup missed, jiraExecPerDay
    // skipped every metric it owns — and still reported status 'ok', because its source
    // status is set after the loop regardless. "Executed test cases per day" would have
    // vanished from the Manual test tab on a GREEN build.
    parts.applyPatch(data, part.patch);

    // --only additionally persists the part; merge.js reassembles them.
    if (cli.groupsToRun !== null) {
      parts.writePart(part);
      if (part.status === 'ok' || part.status === 'incomplete') {
        parts.promoteToLkg(part);
      }
    }
  }

  // If --only is set, we write parts but NOT latest.json (merge.js does that)
  if (cli.groupsToRun !== null) {
    console.log(`[collect] Wrote parts to ${parts.PARTS_DIR}`);
    return;
  }

  // NO --only flag: merge is in-process, write final output
  fs.mkdirSync(cfg.HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'latest.json'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(cfg.HISTORY_DIR, `${isoDate(now)}.json`), JSON.stringify(data));

  // Overall status drives the Jenkins build colour (see Jenkinsfile.qa-report):
  // ok=green, degraded=yellow (some sources failed), failed=red (no data).
  const statuses = Object.values(data.sources).map((s) => s.status);
  const overall = statuses.length && statuses.every((s) => s === 'ok') ? 'ok'
    : statuses.some((s) => s === 'ok') ? 'degraded' : 'failed';
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'status.txt'), overall);

  // WHICH and HOW MANY sources failed. status.txt alone cannot tell a run that lost one
  // source from a run that lost five, so the Jenkins retry loop used to publish whichever
  // attempt happened to run LAST — on build #114 that threw away five good attempts to
  // publish a sixth that had lost jiraAutomationTc to a transient Jira 400.
  // See the best-attempt selection in Jenkinsfile.qa-report.
  const failedNames = Object.entries(data.sources)
    .filter(([, s]) => s.status !== 'ok').map(([k]) => k).sort();
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'failed-sources.txt'), failedNames.join(','));
  console.log(`[collect] ${failedNames.length} source(s) failed` +
    (failedNames.length ? `: ${failedNames.join(', ')}` : ''));

  console.log(`[collect] status=${overall}; default range lastWeek ${ranges.lastWeek.from}..${ranges.lastWeek.to}`);
  for (const m of [...cfg.KPI_METRICS, ...cfg.JIRA_METRICS, ...cfg.JIRA_WORKLOG_METRICS, ...cfg.JIRA_UNIQUE_METRICS, ...cfg.JIRA_DERIVED_METRICS, ...cfg.JIRA_TRANSITION_METRICS]) {
    const v = data.metrics[m.key];
    if (!v) continue;
    const lw = v.ranges.lastWeek;
    console.log(`[collect]   ${m.label} (last week): ${lw.total} (` +
      lw.byEmployee.map((e) => `${e.name} ${e.value}`).join(', ') + ')');
  }
  for (const m of cfg.JIRA_LIST_METRICS) {
    const v = data.metrics[m.key];
    if (!v) continue;
    const tq = v.ranges.thisQuarter, lq = v.ranges.lastQuarter;
    console.log(`[collect]   ${m.label}: thisQuarter ${tq ? tq.total : 'n/a'}, lastQuarter ${lq ? lq.total : 'n/a'}`);
  }
  for (const m of cfg.JIRA_DEFECT_METRICS) {
    const v = data.metrics[m.key];
    if (!v) continue;
    const lq = v.ranges.lastQuarter;
    if (lq) console.log(`[collect]   ${m.label} (last quarter): bugs created ${lq.bugsCreated} (` +
      lq.byEmployee.map((e) => `${e.name} ${e.value}`).join(', ') + `), leaked ${lq.leaked} (${lq.leakRate}%)`);
  }
  if (data.automationCoverage) {
    const ac = data.automationCoverage;
    console.log(`[collect]   Automation coverage: ${ac.automationTcs}/${ac.totalTcs} = ${ac.coverage}% (remaining ${ac.remaining})`);
  }
  if (data.supportClassification) {
    const tq = data.supportClassification.ranges.thisQuarter;
    if (tq) console.log(`[collect]   Classified Support ticket (this quarter): ${tq.total.tickets} = ` +
      tq.rows.map((r) => `${r.code} ${r.tickets}`).join(', ') + (tq.residual ? `, unclassified ${tq.residual.tickets}` : ''));
  }
  if (data.worklog) {
    const lw = data.worklog.ranges.lastWeek;
    console.log(`[collect]   Worklog hrs (last week): ${lw.grandTotal} (` +
      lw.byTester.map((t) => `${t.name} ${t.total}`).join(', ') + ')');
  }
  console.log(`[collect] Wrote ${path.join(cfg.DATA_DIR, 'latest.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { buildSkeleton };
