'use strict';
/**
 * Unit registry for the QA report collector.
 *
 * The monolithic collect.js (18 try/catch blocks, 45 min runtime) is being split into
 * independent SHARDS — each a unit that fetches one logical collection group (odoo-kpi,
 * jira metrics, allure, worklog, etc.) and emits a part file. This registry defines the
 * 18 units and groups them so the Jenkins pipeline can run shards in parallel, then merge
 * the part files back into the exact same latest.json.
 *
 * Each unit.run(ctx) is a faithful transcription of its corresponding try/catch block in
 * collect.js, with the same calls, loops, and field names. The only change: instead of
 * mutating the shared `data` object, a unit returns a `patch` (a partial report object
 * with the same key structure). The driver merges patches into a final report.
 */

const { collectKpiMetrics, collectKpiJql } = require('./kpi');
const { collectJiraMetrics } = require('./support-ticket');
const { collectTestExecMetrics, quarterlyActualFromDaily } = require('./testexec');
const { collectUniqueMetrics } = require('./unique-testexec');
const { collectFrdMetrics } = require('./frd');
const { collectFeatureExec } = require('./feature-exec');
const { collectBugByPriority } = require('./bug-by-priority');
const { collectSupportClassification } = require('./support-classification');
const { collectExecEffortDaily, buildExecutedPerDay, holidaySetForYears } = require('./executed-per-day');
const { collectTransitionMetrics } = require('./automation-tc');
const { buildAutomationClaudeSplit } = require('./automation-split');
const { collectAllurePeriodMetrics } = require('./allure-exec');
const { collectStuckMetrics } = require('./stuck');
const { collectDefectQuality } = require('./defect-quality');
const { collectAutomationCoverage } = require('./automation-coverage');
const { collectQuarterly } = require('./quarterly');
const { collectWorklog } = require('./worklog');
const { collectLeave } = require('./leave');
const { collectHolidays } = require('./holidays');
const { fetchStart, aggregate, isoDate } = require('../lib/ranges');

const GROUPS = ['odoo-kpi', 'jira-dashboard', 'frd', 'manual-heavy', 'manual-light', 'support', 'automation', 'worklog'];

const UNITS = [
  // --- odoo-kpi group ---
  {
    id: 'odooKpi',
    group: 'odoo-kpi',
    sourceKeys: ['odooKpi'],
    async run(ctx) {
      const { now, ranges, members, cfg } = ctx;
      const patch = { metrics: {}, quarterly: {}, sources: {}, kpiJql: {} };

      // Odoo KPI data: quarterly (Actual/Forecast/Goal) + daily range view
      const daily = await collectKpiMetrics(fetchStart(now), isoDate(now));
      for (const m of cfg.KPI_METRICS) {
        const d = daily[m.key];
        const perRange = {};
        for (const r of Object.values(ranges)) perRange[r.key] = aggregate(d.daily, members, r);
        patch.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: perRange };
      }
      patch.quarterly = await collectQuarterly(now);
      patch.sources.odooKpi = { status: 'ok', model: cfg.MODEL_KPI };

      return patch;
    }
  },
  {
    id: 'kpiJql',
    group: 'odoo-kpi',
    sourceKeys: [],
    async run(ctx) {
      const { cfg } = ctx;
      const patch = { kpiJql: {}, sources: {} };

      // KPI definition JQL (for the Metrics "JQL per metric" note) — the jira_filter
      // Odoo runs to fill each KPI, read live each build so an Odoo-side edit follows.
      // Non-fatal: on failure the note falls back to a plain Odoo-query descriptor.
      patch.kpiJql = await collectKpiJql(cfg.KPI_METRICS.map((m) => m.kpiName));

      return patch;
    }
  },

  // --- jira-dashboard group ---
  {
    id: 'jiraStuck',
    group: 'jira-dashboard',
    sourceKeys: ['jiraStuck'],
    async run(ctx) {
      const { now, ranges } = ctx;
      const patch = { metrics: {}, sources: {} };

      // Jira LIST metric(s) (STUCK — Dev done, QA not tested): issues currently in
      // Resolved (assigned to the team, excluding the team's test/support types)
      // that became resolved within the range — Dev finished but QA hasn't verified.
      // Collected directly per range as a LIST (key/summary/assignee/days stuck),
      // only for This quarter + Last quarter (the ranges the Jira Dashboard offers).
      const stuckRanges = { thisQuarter: ranges.thisQuarter, lastQuarter: ranges.lastQuarter };
      const stuck = await collectStuckMetrics(stuckRanges, now);
      for (const m of ctx.cfg.JIRA_LIST_METRICS) {
        const d = stuck[m.key];
        patch.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: d.ranges };
      }
      patch.sources.jiraStuck = { status: 'ok', source: 'jira resolved-but-not-tested issues' };

      return patch;
    }
  },
  {
    id: 'jiraDefectQuality',
    group: 'jira-dashboard',
    sourceKeys: ['jiraDefectQuality'],
    async run(ctx) {
      const { now, ranges, cfg } = ctx;
      const patch = { metrics: {}, quarterly: {}, sources: {} };

      // Jira DEFECT-QUALITY metric (Defect quality — created; Jira Dashboard page):
      // two of the team's saved JQLs per range — "Bugs created" (count per tester,
      // by reporter) and "Leaked defects" (whole-team issue list) — with the leakage
      // rate + a P1/P2/P3 breakdown derived from the leaked list. Slide-style stat
      // cards + a leaked-defects table. Collected directly per range for ALL ranges
      // (its own full 6-range selector), like sources/frd.js.
      const dq = await collectDefectQuality(ranges, now);
      for (const m of cfg.JIRA_DEFECT_METRICS) {
        const d = dq[m.key];
        patch.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: d.ranges };
        // Opt-in Quarterly card (`quarterly: true`, e.g. leaked defects) — see defect-quality.js.
        if (m.quarterly && d.quarterly) patch.quarterly[m.key] = d.quarterly;
      }
      patch.sources.jiraDefectQuality = { status: 'ok', source: 'jira bugs created + leaked defects' };

      return patch;
    }
  },

  // --- frd group ---
  {
    id: 'jiraFrd',
    group: 'frd',
    sourceKeys: ['jiraFrd'],
    async run(ctx) {
      const { ranges, members, cfg } = ctx;
      const patch = { metrics: {}, sources: {} };

      // Jira FRD / I2L metric(s) (FRD/Spec Review/I2L page): the DISTINCT count of
      // spec-review / I2L issues the team logged work on in a range, split into
      // worked / done / in progress via ONE window count per JQL (a distinct-over-
      // range count is not additive, so collected directly per range like the unique
      // metric). Whole-team only.
      const frd = await collectFrdMetrics(ranges, members);
      for (const m of cfg.JIRA_FRD_METRICS) {
        const d = frd[m.key];
        patch.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: d.ranges };
      }
      patch.sources.jiraFrd = { status: 'ok', source: 'jira FRD/I2L worklog issues' };

      return patch;
    }
  },

  // --- manual-heavy group ---
  {
    id: 'jiraTestExec',
    group: 'manual-heavy',
    sourceKeys: ['jiraTestExec'],
    async run(ctx) {
      const { now, ranges, members, cfg } = ctx;
      const patch = { metrics: {}, quarterly: {}, sources: {} };

      // Jira worklog-based metric(s) (Manual Test cases executed): for each day ×
      // tester, the count of DISTINCT test cases that tester logged work on that
      // day, summed into the ranges (like the KPI metrics) AND per quarter for an
      // actual-only Quarterly chart.
      const teDaily = await collectTestExecMetrics(fetchStart(now), isoDate(now));
      for (const m of cfg.JIRA_WORKLOG_METRICS) {
        const d = teDaily[m.key];
        const perRange = {};
        for (const r of Object.values(ranges)) perRange[r.key] = aggregate(d.daily, members, r);
        patch.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: perRange };
        patch.quarterly[m.key] = quarterlyActualFromDaily(m, d.daily, members, now);
      }
      patch.sources.jiraTestExec = { status: 'ok', source: 'jira test-case worklogs' };

      return patch;
    }
  },
  {
    id: 'jiraUniqueTc',
    group: 'manual-heavy',
    sourceKeys: ['jiraUniqueTc'],
    async run(ctx) {
      const { ranges, members, cfg } = ctx;
      const patch = { metrics: {}, sources: {} };

      // Jira UNIQUE (single-window) metric(s) (Unique Executed Test Cases): the
      // DEDUPLICATED count of DISTINCT test cases each tester logged work on within
      // a range, via ONE window JQL per (range × tester) — a test case counts once
      // no matter how many days it was touched (cf. the per-day-summed "Manual Test
      // cases executed"). A distinct-over-range count is not additive, so it is
      // collected directly per range (not via aggregate()); the module also computes
      // a per-bucket distinct trend. "By range" view only.
      const uniq = await collectUniqueMetrics(ranges, members);
      for (const m of cfg.JIRA_UNIQUE_METRICS) {
        const d = uniq[m.key];
        patch.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: d.ranges };
      }
      patch.sources.jiraUniqueTc = { status: 'ok', source: 'jira distinct test-case worklogs' };

      return patch;
    }
  },
  {
    id: 'jiraExecPerDay',
    group: 'manual-heavy',
    sourceKeys: ['jiraExecPerDay'],
    async run(ctx) {
      const { now, ranges, members, cfg, data } = ctx;
      const patch = { metrics: {}, sources: {} };

      // Jira DERIVED metric(s) (Executed test cases per day): a RATE, not a fetch.
      // Numerator = the DISTINCT executed count already collected above (each
      // metric's numeratorKey → data.metrics[...]); denominators = working days
      // (Mon–Fri minus VN public holidays) for per-calendar-day, and test-case
      // worklog HOURS ÷ 8 × workload for per-man-day. Only the man-day effort needs
      // a fetch (collectExecEffortDaily). Skipped per metric if its numerator is
      // absent (the unique source failed).
      const years = [now.getUTCFullYear(), now.getUTCFullYear() - 1];
      const holidaySet = await holidaySetForYears(years);
      for (const m of cfg.JIRA_DERIVED_METRICS) {
        const numerator = data.metrics[m.numeratorKey];
        if (!numerator) { console.error(`[collect] ${m.label}: numerator '${m.numeratorKey}' missing — skipped.`); continue; }
        const execDaily = await collectExecEffortDaily(m, fetchStart(now), isoDate(now));
        patch.metrics[m.key] = buildExecutedPerDay(m, ranges, numerator, execDaily, holidaySet, members);
      }
      patch.sources.jiraExecPerDay = { status: 'ok', source: 'jira test-case worklog hours (derived rate)' };

      return patch;
    }
  },

  // --- manual-light group ---
  {
    id: 'jiraMetrics',
    group: 'manual-light',
    sourceKeys: ['jiraMetrics'],
    async run(ctx) {
      const { now, ranges, members, cfg } = ctx;
      const patch = { metrics: {}, quarterly: {}, sources: {} };

      // Jira-sourced metrics (Support tickets created): counted per day by the
      // issue's `created` date and split per reporter, then aggregated into the
      // same ranges as the KPI metrics. Shown in the Metrics Report "By range"
      // view.
      const jiraDaily = await collectJiraMetrics(fetchStart(now), isoDate(now));
      for (const m of cfg.JIRA_METRICS) {
        const d = jiraDaily[m.key];
        // `splitOtherReporters` metrics (leaked defects) may carry an "Other" bucket for
        // non-team reporters — include it in the stacking/by-tester member list ONLY when
        // some day actually has one, so the common all-QA case still renders two bars.
        const hasOther = d.daily.some((x) => x.byEmp && x.byEmp.Other > 0);
        const mem = hasOther ? [...members, 'Other'] : members;
        const perRange = {};
        for (const r of Object.values(ranges)) {
          // `yearBucket: 'quarter'` (leaked defects) makes the year ranges' Trend bucket
          // per quarter instead of per month; other ranges/metrics are unaffected.
          const rr = (m.yearBucket && r.bucket === 'month') ? { ...r, bucket: m.yearBucket } : r;
          perRange[r.key] = aggregate(d.daily, mem, rr);
        }
        patch.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: perRange };
        // Carry the custom stacking list so render.js draws the "Other" bar/legend too.
        if (mem !== members) patch.metrics[m.key].members = mem;
        // Opt-in (`quarterly: true`): also surface an actual-only Quarterly card (no
        // Odoo Forecast/Goal exists for a Jira metric), same shape as the worklog
        // metrics. Otherwise the metric stays "By range" only. Pass the "Other"-inclusive
        // member list so the card's bars + BY TESTER total stay faithful to the saved
        // filter (non-team reporters counted, not dropped).
        if (m.quarterly) patch.quarterly[m.key] = quarterlyActualFromDaily(m, d.daily, mem, now);
      }
      patch.sources.jiraMetrics = { status: 'ok', source: 'jira support tickets' };

      return patch;
    }
  },
  {
    id: 'jiraFeatureExec',
    group: 'manual-light',
    sourceKeys: ['jiraFeatureExec'],
    async run(ctx) {
      const { ranges, cfg } = ctx;
      const patch = { featureExec: null, sources: {} };

      // Jira FEATURE-EXEC (Executed Test Cases per main feature): the DISTINCT count
      // of test cases the team executed (worklog in range) per Xray Test Repository
      // module, split into executed vs passed (statusCategory = Done) via one window
      // count per (range × module × metric). Whole-team; rendered as a grouped bar
      // chart on the Manual test page ("By range").
      patch.featureExec = await collectFeatureExec(ranges);
      patch.sources.jiraFeatureExec = { status: 'ok', source: 'jira test-case executions per repository module' };

      return patch;
    }
  },
  {
    id: 'jiraBugByPriority',
    group: 'manual-light',
    sourceKeys: ['jiraBugByPriority'],
    async run(ctx) {
      const { ranges, cfg } = ctx;
      const patch = { bugByPriority: null, sources: {} };

      // Jira BUG-BY-PRIORITY ("Valid bug reported - by Priority of bug"): the VALID
      // bugs the team reported (created in range) per PRIORITY (rows) × Total /
      // Backlog / Resolved-waiting-for-verification (columns). Whole-team; rendered
      // as a table on the Manual test page ("By range").
      patch.bugByPriority = await collectBugByPriority(ranges);
      patch.sources.jiraBugByPriority = { status: 'ok', source: 'jira valid bugs reported by priority' };

      return patch;
    }
  },

  // --- support group ---
  {
    id: 'jiraSupportClassification',
    group: 'support',
    sourceKeys: ['jiraSupportClassification'],
    async run(ctx) {
      const { ranges, cfg } = ctx;
      const patch = { supportClassification: null, sources: {} };

      // Jira SUPPORT CLASSIFICATION ("Classified Support ticket"; Support ticket
      // page): every CRM support ticket CREATED in the range split into the QA
      // review's 5 categories (A Check data & explain logic / B Request update
      // data-config & create data / C Bug leakage / D New improvement / E New
      // feature), plus an independently-counted TOTAL and a "Not classified"
      // residual row when the two disagree. Whole project, NO reporter clause
      // (tickets RECEIVED, not the ones a QA opened). One cheap count per
      // (range x category) + one per range for the total.
      patch.supportClassification = await collectSupportClassification(ranges);
      patch.sources.jiraSupportClassification = { status: 'ok', source: 'jira support tickets by Support Ticket Type' };

      return patch;
    }
  },

  // --- automation group ---
  {
    id: 'jiraAutomationTc',
    group: 'automation',
    sourceKeys: ['jiraAutomationTc'],
    async run(ctx) {
      const { now, ranges, members, cfg } = ctx;
      const patch = { metrics: {}, quarterly: {}, sources: {} };

      // Jira status-transition metric(s) (Automation Test cases created): for each
      // day × tester, the count of automation test cases whose status changed to
      // Resolved that day (the team's exact per-day JQL), summed into the selectable
      // ranges. Shown in the "By range" view; a metric opts into an actual-only
      // Quarterly card with `quarterly: true`.
      const atDaily = await collectTransitionMetrics(fetchStart(now), isoDate(now));
      for (const m of cfg.JIRA_TRANSITION_METRICS) {
        const d = atDaily[m.key];
        const perRange = {};
        for (const r of Object.values(ranges)) perRange[r.key] = aggregate(d.daily, members, r);
        patch.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: perRange };
        if (m.quarterly) patch.quarterly[m.key] = quarterlyActualFromDaily(m, d.daily, members, now);
      }
      // Derived split (no extra Jira fetch): the "with vs without Claude" stat cards
      // partition a transition metric's daily series at the Claude-adoption cutoff,
      // reusing atDaily[sourceKey].daily fetched just above (see sources/automation-split.js).
      for (const m of cfg.JIRA_SPLIT_METRICS) {
        const src = atDaily[m.sourceKey];
        if (!src) { console.error(`[collect] ${m.label}: source '${m.sourceKey}' missing — skipped.`); continue; }
        patch.metrics[m.key] = buildAutomationClaudeSplit(m, src.daily, ranges, members);
      }
      patch.sources.jiraAutomationTc = { status: 'ok', source: 'jira automation test-case transitions' };

      return patch;
    }
  },
  {
    id: 'jiraAutomationCoverage',
    group: 'automation',
    sourceKeys: ['jiraAutomationCoverage'],
    async run(ctx) {
      const patch = { automationCoverage: null, sources: {} };

      // Jira AUTOMATION COVERAGE (Automation test page · Quarterly KPI · donut):
      // a POINT-IN-TIME snapshot (NOT ranged) of what share of the whole CRM Post-EA
      // Test Case repository is in automation scope. Two whole-repo count() queries.
      patch.automationCoverage = await collectAutomationCoverage();
      patch.sources.jiraAutomationCoverage = { status: 'ok', source: 'jira automation-scope test-case coverage' };

      return patch;
    }
  },
  {
    id: 'allurePeriods',
    group: 'automation',
    sourceKeys: ['allurePeriods'],
    async run(ctx) {
      const { now, ranges, members, cfg } = ctx;
      const patch = { metrics: {}, quarterly: {}, sources: {} };

      // ALLURE metric(s) (Unique Automation Test cases executed): NOT Jira. Reads the
      // frozen Allure period reports this Jenkins host publishes (C:\allureperiods\
      // report<scope><periodKey>\widgets\suites.json — one row per UNIQUE test case,
      // re-runs collapsed). Each range reads the ONE report whose period matches it, so
      // there is no daily series to sum: "unique" is not additive (see
      // sources/allure-exec.js).
      const allure = collectAllurePeriodMetrics(cfg.ALLURE_PERIOD_METRICS, ranges, members, now);
      for (const m of cfg.ALLURE_PERIOD_METRICS) {
        const d = allure[m.key];
        if (!d) continue;
        patch.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: d.ranges };
        if (d.quarterly) patch.quarterly[m.key] = d.quarterly;
      }
      patch.sources.allurePeriods = { status: 'ok', source: 'allure frozen period reports (unique test cases)' };

      return patch;
    }
  },

  // --- worklog group ---
  {
    id: 'odooLeave',
    group: 'worklog',
    sourceKeys: ['odooLeave'],
    async run(ctx) {
      const { now, cfg } = ctx;
      const patch = { sources: {} };

      // Worklog allocation page: Jira worklogs (label columns) + the
      // FTO/SL/Holiday column = Odoo hr.leave (FTO/SL) + VN public holidays.
      const leaveEntries = await collectLeave(now);
      patch.sources.odooLeave = { status: 'ok', model: cfg.MODEL_LEAVE };

      // Store in scratch for jiraWorklog to consume
      ctx.scratch.leaveEntries = leaveEntries;

      return patch;
    }
  },
  {
    id: 'vnHolidays',
    group: 'worklog',
    sourceKeys: ['vnHolidays'],
    async run(ctx) {
      const patch = { sources: {} };

      // VN public holidays (ICS feed)
      const holidayEntries = await collectHolidays(ctx.now);
      patch.sources.vnHolidays = { status: 'ok', source: 'google vietnamese holidays ics' };

      // Store in scratch for jiraWorklog to consume
      ctx.scratch.holidayEntries = holidayEntries;

      return patch;
    }
  },
  {
    id: 'jiraWorklog',
    group: 'worklog',
    sourceKeys: ['jiraWorklog'],
    async run(ctx) {
      const { now, ranges } = ctx;
      const patch = { worklog: null, sources: {} };

      // leave + holidays both feed the FTO/SL/Holiday (leave) column.
      const leaveEntries = ctx.scratch.leaveEntries || [];
      const holidayEntries = ctx.scratch.holidayEntries || [];
      patch.worklog = await collectWorklog(ranges, now, [...leaveEntries, ...holidayEntries]);

      // A few unreadable issues are tolerated by collectWorklog (it only throws on a
      // mass failure), but they make the page INCOMPLETE — surface that as a non-ok
      // status so the build is flagged UNSTABLE (not a silent green) and the Jenkins
      // retry loop re-attempts them (recovers transient reads; permission-restricted
      // issues stay skipped).
      const sk = (patch.worklog && patch.worklog.skipped) || 0;
      patch.sources.jiraWorklog = sk > 0
        ? { status: 'incomplete', message: `${sk} issue(s) skipped on worklog read — data incomplete`, source: 'jira worklogs' }
        : { status: 'ok', source: 'jira worklogs' };

      return patch;
    }
  }
];

/**
 * Returns the subset of UNITS that belong to the given groups, in declaration order.
 * Throws a clear error if an unknown group is named (so a Jenkinsfile typo fails loudly).
 */
function unitsForGroups(groups) {
  const unknownGroups = groups.filter((g) => !GROUPS.includes(g));
  if (unknownGroups.length) {
    throw new Error(`Unknown group(s): ${unknownGroups.join(', ')}. Valid groups: ${GROUPS.join(', ')}`);
  }
  return UNITS.filter((u) => groups.includes(u.group));
}

// Assertions: validate the registry structure at module load
{
  const seenIds = new Set();
  for (const unit of UNITS) {
    if (!GROUPS.includes(unit.group)) {
      throw new Error(`Unit '${unit.id}' references unknown group '${unit.group}'. Valid: ${GROUPS.join(', ')}`);
    }
    if (seenIds.has(unit.id)) {
      throw new Error(`Duplicate unit id: ${unit.id}`);
    }
    seenIds.add(unit.id);
  }
}

module.exports = { GROUPS, UNITS, unitsForGroups };
