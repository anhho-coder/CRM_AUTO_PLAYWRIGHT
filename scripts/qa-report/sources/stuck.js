'use strict';
/**
 * Source: Jira — "STUCK — Dev done, QA not tested" (QA CRM · Jira · Dashboard page).
 *
 * Issues Dev has finished (currently in Resolved) that QA has NOT yet verified or
 * advanced — assigned to the QA team, excluding the team's own Test-Case /
 * Support-Ticket issue types. Per range we run the team's EXACT JQL once and LIST
 * every matching issue (this is a list metric, not a per-day count):
 *
 *   assignee in (<team>) AND status = <currentStatus>
 *     AND issuetype not in (<excludeIssueTypes>)
 *     AND status changed to (<changedToStatus>) during ("<from> 00:00","<to> 23:59")
 *
 * The `status = Resolved` clause is point-in-time — the issue must STILL be Resolved
 * now (i.e. still waiting on QA), so the result is a snapshot, not an additive daily
 * series; it is collected directly per range (like sources/unique-testexec.js) rather
 * than through lib/ranges.aggregate(). Each issue carries its "days stuck" = today
 * minus the issue's resolution date. The page shows a headline total + a per-assignee
 * split + a table sorted most-stuck-first.
 *
 * Cost: one paginated search per range (2 ranges = This/Last quarter) — negligible
 * next to the per-day count metrics; JiraClient's retry/backoff still applies.
 */
const { JiraClient } = require('../lib/jira');
const { loadJira, MEMBERS, JIRA_LIST_METRICS } = require('../config');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// A JQL string literal: wrap in double quotes, escape any embedded quote.
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

/** The team's exact STUCK JQL over the inclusive [from..to] day window. */
function stuckJql(metric, jiraUsers, from, to) {
  const excl = metric.excludeIssueTypes.map(jqlStr).join(', ');
  return `assignee in (${jiraUsers.join(', ')}) AND status = ${metric.currentStatus}` +
    ` AND issuetype not in (${excl})` +
    ` AND status changed to (${metric.changedToStatus}) during ("${from} 00:00", "${to} 23:59")`;
}

/** Whole days between an ISO date-time (resolution) and `now`, floored at 0. */
function daysSince(iso, now) {
  if (!iso) return null;
  const d = Math.floor((now.getTime() - new Date(iso).getTime()) / MS_PER_DAY);
  return d < 0 ? 0 : d;
}

/**
 * @param ranges  a subset of computeRanges(now) — the windows to build (This/Last quarter).
 * @param now     Date — the "days stuck" reference (today).
 * @returns per metric.key -> { label, kpiName, ranges: { key -> {
 *            key, label, from, to, total, byEmployee:[{name,value}],
 *            issues:[{key, summary, type, assignee, resolved, daysStuck}] } } }
 */
async function collectStuckMetrics(ranges, now) {
  const jira = new JiraClient(loadJira());
  const jiraUsers = MEMBERS.map((m) => m.jira);
  const memberNames = MEMBERS.map((m) => m.name);
  // Jira username -> the report's display name, so we split by assignee consistently.
  const nameByUser = new Map(MEMBERS.map((m) => [m.jira, m.name]));
  const out = {};

  for (const metric of JIRA_LIST_METRICS) {
    const perRange = {};
    for (const range of Object.values(ranges)) {
      const issues = await jira.searchAll(
        stuckJql(metric, jiraUsers, range.from, range.to),
        ['summary', 'assignee', 'issuetype', 'resolutiondate', 'created']
      );
      const rows = issues.map((it) => {
        const f = it.fields || {};
        const user = f.assignee ? f.assignee.name : null;
        return {
          key: it.key,
          summary: f.summary || '',
          type: f.issuetype ? f.issuetype.name : '',
          assignee: (user && nameByUser.get(user)) || (f.assignee && f.assignee.displayName) || 'Unassigned',
          resolved: f.resolutiondate ? f.resolutiondate.slice(0, 10) : null,
          daysStuck: daysSince(f.resolutiondate, now),
        };
      }).sort((a, b) => (b.daysStuck || 0) - (a.daysStuck || 0)); // most-stuck first

      const byEmp = {}; memberNames.forEach((n) => (byEmp[n] = 0));
      for (const r of rows) if (r.assignee in byEmp) byEmp[r.assignee] += 1;

      perRange[range.key] = {
        key: range.key, label: range.label, from: range.from, to: range.to,
        total: rows.length,
        byEmployee: memberNames.map((n) => ({ name: n, value: byEmp[n] })),
        issues: rows,
      };
    }
    out[metric.key] = { label: metric.label, kpiName: metric.kpiName, ranges: perRange };
  }
  return out;
}

module.exports = { collectStuckMetrics, stuckJql, daysSince };
