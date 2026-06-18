'use strict';
/**
 * Source: Jira — "Automation Test cases created" (and any future status-transition
 * Metrics Report metric). Counts test cases with `"Automation scope" = yes` on the
 * day their status changed to Resolved, split per tester (the tester who made the
 * transition).
 *
 * For each day × tester we run the team's EXACT per-day JQL once as a cheap
 * maxResults=0 count:
 *
 *   <scopeJql> AND status changed to (resolved)
 *     during ("<D> 00:00", "<D> 23:59") BY <tester>
 *
 * Running the team's own JQL per day means the page matches what they see in Jira
 * exactly — no changelog re-derivation, no timezone re-projection (Jira evaluates
 * the `during` window in the querying user's timezone, the same as when the team
 * runs it). The per-day counts are summed into the selectable ranges by the
 * collector AND per quarter for the Quarterly view, exactly like sources/testexec.js
 * (a test case resolved on N different days counts N times, matching the page's
 * additive range model: range total = sum of the day/week/month bars).
 *
 * Cost: ~ (days-in-year × active testers) maxResults=0 count queries per build
 * (8 in flight) — the same profile testexec.js already uses. As a courtesy to the
 * shared Jira, a tester with zero hits over the WHOLE window is detected with a
 * single count and skipped, so an inactive tester costs 1 query instead of 365.
 *
 * Shares eachDay + quarterlyActualFromDaily with sources/testexec.js (the canonical
 * per-day-count helpers) to stay DRY.
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MEMBERS, JIRA_TRANSITION_METRICS } = require('../config');
const { eachDay } = require('./testexec');

/** Status-transition JQL across [from..to], for one tester. `to` may equal `from`. */
function transitionJql(metric, jiraUser, from, to) {
  return `${metric.scopeJql} AND status changed to (${metric.changedToStatus}) ` +
    `during ("${from} 00:00", "${to} 23:59") BY ${jiraUser}`;
}

/** The team's exact per-day JQL: the transition window bounded to one day `date`. */
const dayJql = (metric, jiraUser, date) => transitionJql(metric, jiraUser, date, date);

/**
 * @param {string} fetchFrom ISO date (inclusive) — earliest day to count.
 * @param {string} today     ISO date (inclusive) — latest day to count.
 * @returns per metric.key -> { label, kpiName, daily:[{date, byEmp:{name:val}}] }
 */
async function collectTransitionMetrics(fetchFrom, today) {
  const jira = new JiraClient(loadJira());
  const days = eachDay(fetchFrom, today);
  const out = {};
  for (const metric of JIRA_TRANSITION_METRICS) {
    // Skip the per-day breakdown for any tester with no hits in the whole window.
    const active = [];
    for (const m of MEMBERS) {
      if ((await jira.count(transitionJql(metric, m.jira, fetchFrom, today))) > 0) active.push(m);
    }

    const tasks = [];
    for (const day of days) for (const m of active) tasks.push({ day, m });
    const counts = await mapLimit(tasks, 8, async ({ day, m }) =>
      ({ date: day.date, name: m.name, n: await jira.count(dayJql(metric, m.jira, day.date)) }));

    const map = {};
    for (const c of counts) {
      if (!c.n) continue;                                  // skip empty (day, tester)
      if (!map[c.date]) map[c.date] = {};
      map[c.date][c.name] = (map[c.date][c.name] || 0) + c.n;
    }
    out[metric.key] = {
      label: metric.label,
      kpiName: metric.kpiName,
      daily: Object.keys(map).sort().map((d) => ({ date: d, byEmp: map[d] })),
    };
  }
  return out;
}

module.exports = { collectTransitionMetrics, transitionJql, dayJql };
