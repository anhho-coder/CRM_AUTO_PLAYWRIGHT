'use strict';
/**
 * Orchestrator: gather every report section into qa-report-out/data/latest.json
 * (plus a dated snapshot in data/history/). Each KPI metric is aggregated into
 * the selectable ranges. Each source is wrapped so one failing system never
 * blocks the rest of the report; the overall status drives the Jenkins build colour.
 *
 * Usage: node scripts/qa-report/collect.js
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { collectKpiMetrics, collectKpiJql } = require('./sources/kpi');
const { collectJiraMetrics } = require('./sources/support-ticket');
const { collectTestExecMetrics, quarterlyActualFromDaily } = require('./sources/testexec');
const { collectUniqueMetrics } = require('./sources/unique-testexec');
const { collectFrdMetrics } = require('./sources/frd');
const { collectFeatureExec } = require('./sources/feature-exec');
const { collectExecEffortDaily, buildExecutedPerDay, holidaySetForYears } = require('./sources/executed-per-day');
const { collectTransitionMetrics } = require('./sources/automation-tc');
const { buildAutomationClaudeSplit } = require('./sources/automation-split');
const { collectStuckMetrics } = require('./sources/stuck');
const { collectDefectQuality } = require('./sources/defect-quality');
const { collectQuarterly } = require('./sources/quarterly');
const { collectWorklog } = require('./sources/worklog');
const { collectLeave } = require('./sources/leave');
const { collectHolidays } = require('./sources/holidays');
const { computeRanges, fetchStart, aggregate, isoDate } = require('./lib/ranges');

async function main() {
  const now = new Date();
  const ranges = computeRanges(now);
  const members = cfg.MEMBERS.map((m) => m.name);

  const data = {
    generatedAt: new Date().toISOString(),
    team: 'CRM QA Team',
    members,
    ranges,
    defaultView: 'quarterly',
    defaultRange: 'lastWeek',
    jiraBaseUrl: cfg.jiraBaseUrl(), // for the STUCK issue-list browse links
    sources: {},
    metrics: {},
    quarterly: {},
    worklog: null,
    featureExec: null,
    kpiJql: {},
  };

  // --- Odoo KPI data: quarterly (Actual/Forecast/Goal) + daily range view -----
  try {
    const daily = await collectKpiMetrics(fetchStart(now), isoDate(now));
    for (const m of cfg.KPI_METRICS) {
      const d = daily[m.key];
      const perRange = {};
      for (const r of Object.values(ranges)) perRange[r.key] = aggregate(d.daily, members, r);
      data.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: perRange };
    }
    data.quarterly = await collectQuarterly(now);
    data.sources.odooKpi = { status: 'ok', model: cfg.MODEL_KPI };
  } catch (e) {
    data.sources.odooKpi = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Odoo KPI source failed:', e.message || e);
  }

  // KPI definition JQL (for the Metrics "JQL per metric" note) — the jira_filter
  // Odoo runs to fill each KPI, read live each build so an Odoo-side edit follows.
  // Non-fatal: on failure the note falls back to a plain Odoo-query descriptor.
  try {
    data.kpiJql = await collectKpiJql(cfg.KPI_METRICS.map((m) => m.kpiName));
  } catch (e) {
    console.error('[collect] KPI JQL read failed (note falls back):', e.message || e);
  }

  // --- Jira-sourced metrics (Support tickets created): counted per day by the
  //     issue's `created` date and split per reporter, then aggregated into the
  //     same ranges as the KPI metrics. Shown in the Metrics Report "By range"
  //     view. Wrapped independently so a Jira failure never blocks the rest.
  try {
    const jiraDaily = await collectJiraMetrics(fetchStart(now), isoDate(now));
    for (const m of cfg.JIRA_METRICS) {
      const d = jiraDaily[m.key];
      const perRange = {};
      for (const r of Object.values(ranges)) perRange[r.key] = aggregate(d.daily, members, r);
      data.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: perRange };
      // Opt-in (`quarterly: true`): also surface an actual-only Quarterly card (no
      // Odoo Forecast/Goal exists for a Jira metric), same shape as the worklog
      // metrics. Otherwise the metric stays "By range" only.
      if (m.quarterly) data.quarterly[m.key] = quarterlyActualFromDaily(m, d.daily, members, now);
    }
    data.sources.jiraMetrics = { status: 'ok', source: 'jira support tickets' };
  } catch (e) {
    data.sources.jiraMetrics = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Jira metrics source failed:', e.message || e);
  }

  // --- Jira worklog-based metric(s) (Manual Test cases executed): for each day ×
  //     tester, the count of DISTINCT test cases that tester logged work on that
  //     day, summed into the ranges (like the KPI metrics) AND per quarter for an
  //     actual-only Quarterly chart. Wrapped independently so a Jira failure here
  //     never blocks the rest of the report.
  try {
    const teDaily = await collectTestExecMetrics(fetchStart(now), isoDate(now));
    for (const m of cfg.JIRA_WORKLOG_METRICS) {
      const d = teDaily[m.key];
      const perRange = {};
      for (const r of Object.values(ranges)) perRange[r.key] = aggregate(d.daily, members, r);
      data.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: perRange };
      data.quarterly[m.key] = quarterlyActualFromDaily(m, d.daily, members, now);
    }
    data.sources.jiraTestExec = { status: 'ok', source: 'jira test-case worklogs' };
  } catch (e) {
    data.sources.jiraTestExec = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Jira test-exec source failed:', e.message || e);
  }

  // --- Jira UNIQUE (single-window) metric(s) (Unique Executed Test Cases): the
  //     DEDUPLICATED count of DISTINCT test cases each tester logged work on within
  //     a range, via ONE window JQL per (range × tester) — a test case counts once
  //     no matter how many days it was touched (cf. the per-day-summed "Manual Test
  //     cases executed"). A distinct-over-range count is not additive, so it is
  //     collected directly per range (not via aggregate()); the module also computes
  //     a per-bucket distinct trend. "By range" view only. Wrapped independently so
  //     a Jira failure here never blocks the rest of the report.
  try {
    const uniq = await collectUniqueMetrics(ranges, members);
    for (const m of cfg.JIRA_UNIQUE_METRICS) {
      const d = uniq[m.key];
      data.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: d.ranges };
    }
    data.sources.jiraUniqueTc = { status: 'ok', source: 'jira distinct test-case worklogs' };
  } catch (e) {
    data.sources.jiraUniqueTc = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Jira unique test-case source failed:', e.message || e);
  }

  // --- Jira FRD / I2L metric(s) (FRD/Spec Review/I2L page): the DISTINCT count of
  //     spec-review / I2L issues the team logged work on in a range, split into
  //     worked / done / in progress via ONE window count per JQL (a distinct-over-
  //     range count is not additive, so collected directly per range like the unique
  //     metric). Whole-team only. Wrapped independently so a Jira failure here never
  //     blocks the rest of the report.
  try {
    const frd = await collectFrdMetrics(ranges, members);
    for (const m of cfg.JIRA_FRD_METRICS) {
      const d = frd[m.key];
      data.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: d.ranges };
    }
    data.sources.jiraFrd = { status: 'ok', source: 'jira FRD/I2L worklog issues' };
  } catch (e) {
    data.sources.jiraFrd = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Jira FRD/I2L source failed:', e.message || e);
  }

  // --- Jira FEATURE-EXEC (Executed Test Cases per main feature): the DISTINCT count
  //     of test cases the team executed (worklog in range) per Xray Test Repository
  //     module, split into executed vs passed (statusCategory = Done) via one window
  //     count per (range × module × metric). Whole-team; rendered as a grouped bar
  //     chart on the Manual test page ("By range"). Stored under data.featureExec (a
  //     custom shape, not the standard by-tester/trend card). Wrapped independently so
  //     a Jira failure here never blocks the rest of the report.
  try {
    data.featureExec = await collectFeatureExec(ranges);
    data.sources.jiraFeatureExec = { status: 'ok', source: 'jira test-case executions per repository module' };
  } catch (e) {
    data.sources.jiraFeatureExec = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Jira feature-exec source failed:', e.message || e);
  }

  // --- Jira DERIVED metric(s) (Executed test cases per day): a RATE, not a fetch.
  //     Numerator = the DISTINCT executed count already collected above (each
  //     metric's numeratorKey → data.metrics[...]); denominators = working days
  //     (Mon–Fri minus VN public holidays) for per-calendar-day, and test-case
  //     worklog HOURS ÷ 8 × workload for per-man-day. Only the man-day effort needs
  //     a fetch (collectExecEffortDaily). Skipped per metric if its numerator is
  //     absent (the unique source failed). Wrapped independently.
  try {
    const years = [now.getUTCFullYear(), now.getUTCFullYear() - 1];
    const holidaySet = await holidaySetForYears(years);
    for (const m of cfg.JIRA_DERIVED_METRICS) {
      const numerator = data.metrics[m.numeratorKey];
      if (!numerator) { console.error(`[collect] ${m.label}: numerator '${m.numeratorKey}' missing — skipped.`); continue; }
      const execDaily = await collectExecEffortDaily(m, fetchStart(now), isoDate(now));
      data.metrics[m.key] = buildExecutedPerDay(m, ranges, numerator, execDaily, holidaySet, members);
    }
    data.sources.jiraExecPerDay = { status: 'ok', source: 'jira test-case worklog hours (derived rate)' };
  } catch (e) {
    data.sources.jiraExecPerDay = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Jira executed-per-day source failed:', e.message || e);
  }

  // --- Jira status-transition metric(s) (Automation Test cases created): for each
  //     day × tester, the count of automation test cases whose status changed to
  //     Resolved that day (the team's exact per-day JQL), summed into the selectable
  //     ranges. Shown in the "By range" view; a metric opts into an actual-only
  //     Quarterly card with `quarterly: true`. Wrapped independently so a Jira
  //     failure here never blocks the rest of the report.
  try {
    const atDaily = await collectTransitionMetrics(fetchStart(now), isoDate(now));
    for (const m of cfg.JIRA_TRANSITION_METRICS) {
      const d = atDaily[m.key];
      const perRange = {};
      for (const r of Object.values(ranges)) perRange[r.key] = aggregate(d.daily, members, r);
      data.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: perRange };
      if (m.quarterly) data.quarterly[m.key] = quarterlyActualFromDaily(m, d.daily, members, now);
    }
    // Derived split (no extra Jira fetch): the "with vs without Claude" stat cards
    // partition a transition metric's daily series at the Claude-adoption cutoff,
    // reusing atDaily[sourceKey].daily fetched just above (see sources/automation-split.js).
    for (const m of cfg.JIRA_SPLIT_METRICS) {
      const src = atDaily[m.sourceKey];
      if (!src) { console.error(`[collect] ${m.label}: source '${m.sourceKey}' missing — skipped.`); continue; }
      data.metrics[m.key] = buildAutomationClaudeSplit(m, src.daily, ranges, members);
    }
    data.sources.jiraAutomationTc = { status: 'ok', source: 'jira automation test-case transitions' };
  } catch (e) {
    data.sources.jiraAutomationTc = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Jira automation test-case source failed:', e.message || e);
  }

  // --- Jira LIST metric(s) (STUCK — Dev done, QA not tested): issues currently in
  //     Resolved (assigned to the team, excluding the team's test/support types)
  //     that became resolved within the range — Dev finished but QA hasn't verified.
  //     Collected directly per range as a LIST (key/summary/assignee/days stuck),
  //     only for This quarter + Last quarter (the ranges the Jira Dashboard offers).
  //     Wrapped independently so a Jira failure here never blocks the rest.
  try {
    const stuckRanges = { thisQuarter: ranges.thisQuarter, lastQuarter: ranges.lastQuarter };
    const stuck = await collectStuckMetrics(stuckRanges, now);
    for (const m of cfg.JIRA_LIST_METRICS) {
      const d = stuck[m.key];
      data.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: d.ranges };
    }
    data.sources.jiraStuck = { status: 'ok', source: 'jira resolved-but-not-tested issues' };
  } catch (e) {
    data.sources.jiraStuck = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Jira stuck source failed:', e.message || e);
  }

  // --- Jira DEFECT-QUALITY metric (Defect quality — created; Jira Dashboard page):
  //     two of the team's saved JQLs per range — "Bugs created" (count per tester,
  //     by reporter) and "Leaked defects" (whole-team issue list) — with the leakage
  //     rate + a P1/P2/P3 breakdown derived from the leaked list. Slide-style stat
  //     cards + a leaked-defects table. Collected directly per range for ALL ranges
  //     (its own full 6-range selector), like sources/frd.js. Wrapped independently so
  //     a Jira failure here never blocks the rest.
  try {
    const dq = await collectDefectQuality(ranges);
    for (const m of cfg.JIRA_DEFECT_METRICS) {
      const d = dq[m.key];
      data.metrics[m.key] = { label: d.label, kpiName: d.kpiName, ranges: d.ranges };
    }
    data.sources.jiraDefectQuality = { status: 'ok', source: 'jira bugs created + leaked defects' };
  } catch (e) {
    data.sources.jiraDefectQuality = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Jira defect-quality source failed:', e.message || e);
  }

  // --- Worklog allocation page: Jira worklogs (label columns) + the
  //     FTO/SL/Holiday column = Odoo hr.leave (FTO/SL) + VN public holidays.
  //     Each source is wrapped independently so one failure never blocks the rest.
  let leaveEntries = [];
  try {
    leaveEntries = await collectLeave(now);
    data.sources.odooLeave = { status: 'ok', model: cfg.MODEL_LEAVE };
  } catch (e) {
    data.sources.odooLeave = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Odoo leave source failed:', e.message || e);
  }
  let holidayEntries = [];
  try {
    holidayEntries = await collectHolidays(now);
    data.sources.vnHolidays = { status: 'ok', source: 'google vietnamese holidays ics' };
  } catch (e) {
    data.sources.vnHolidays = { status: 'error', message: String(e.message || e) };
    console.error('[collect] VN holidays source failed:', e.message || e);
  }
  try {
    // leave + holidays both feed the FTO/SL/Holiday (leave) column.
    data.worklog = await collectWorklog(ranges, now, [...leaveEntries, ...holidayEntries]);
    // A few unreadable issues are tolerated by collectWorklog (it only throws on a
    // mass failure), but they make the page INCOMPLETE — surface that as a non-ok
    // status so the build is flagged UNSTABLE (not a silent green) and the Jenkins
    // retry loop re-attempts them (recovers transient reads; permission-restricted
    // issues stay skipped).
    const sk = (data.worklog && data.worklog.skipped) || 0;
    data.sources.jiraWorklog = sk > 0
      ? { status: 'incomplete', message: `${sk} issue(s) skipped on worklog read — data incomplete`, source: 'jira worklogs' }
      : { status: 'ok', source: 'jira worklogs' };
  } catch (e) {
    data.sources.jiraWorklog = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Jira worklog source failed:', e.message || e);
  }

  fs.mkdirSync(cfg.HISTORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'latest.json'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(cfg.HISTORY_DIR, `${isoDate(now)}.json`), JSON.stringify(data));

  // Overall status drives the Jenkins build colour (see Jenkinsfile.qa-report):
  // ok=green, degraded=yellow (some sources failed), failed=red (no data).
  const statuses = Object.values(data.sources).map((s) => s.status);
  const overall = statuses.length && statuses.every((s) => s === 'ok') ? 'ok'
    : statuses.some((s) => s === 'ok') ? 'degraded' : 'failed';
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'status.txt'), overall);

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
  if (data.worklog) {
    const lw = data.worklog.ranges.lastWeek;
    console.log(`[collect]   Worklog hrs (last week): ${lw.grandTotal} (` +
      lw.byTester.map((t) => `${t.name} ${t.total}`).join(', ') + ')');
  }
  console.log(`[collect] Wrote ${path.join(cfg.DATA_DIR, 'latest.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
