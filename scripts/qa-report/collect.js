'use strict';
/**
 * Orchestrator: gather every report section into qa-report-out/data/latest.json
 * (plus a dated snapshot in data/history/). Each KPI metric is aggregated into
 * the four selectable ranges. Each source is wrapped so one failing system never
 * blocks the rest of the report; the overall status drives the Jenkins build colour.
 *
 * Usage: node scripts/qa-report/collect.js
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { collectKpiMetrics } = require('./sources/kpi');
const { collectJiraMetrics } = require('./sources/support-ticket');
const { collectTestExecMetrics, quarterlyActualFromDaily } = require('./sources/testexec');
const { collectTransitionMetrics } = require('./sources/automation-tc');
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
    sources: {},
    metrics: {},
    quarterly: {},
    worklog: null,
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
    data.sources.jiraAutomationTc = { status: 'ok', source: 'jira automation test-case transitions' };
  } catch (e) {
    data.sources.jiraAutomationTc = { status: 'error', message: String(e.message || e) };
    console.error('[collect] Jira automation test-case source failed:', e.message || e);
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
    data.sources.jiraWorklog = { status: 'ok', source: 'jira worklogs' };
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
  for (const m of [...cfg.KPI_METRICS, ...cfg.JIRA_METRICS, ...cfg.JIRA_WORKLOG_METRICS, ...cfg.JIRA_TRANSITION_METRICS]) {
    const v = data.metrics[m.key];
    if (!v) continue;
    const lw = v.ranges.lastWeek;
    console.log(`[collect]   ${m.label} (last week): ${lw.total} (` +
      lw.byEmployee.map((e) => `${e.name} ${e.value}`).join(', ') + ')');
  }
  if (data.worklog) {
    const lw = data.worklog.ranges.lastWeek;
    console.log(`[collect]   Worklog hrs (last week): ${lw.grandTotal} (` +
      lw.byTester.map((t) => `${t.name} ${t.total}`).join(', ') + ')');
  }
  console.log(`[collect] Wrote ${path.join(cfg.DATA_DIR, 'latest.json')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
