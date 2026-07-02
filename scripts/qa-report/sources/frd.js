'use strict';
/**
 * Source: Jira — "FRD / I2L — done & in progress" (the FRD/Spec Review/I2L page).
 * The whole-team version of the QA Quarterly Review deck's Slide #15. For each range,
 * ONE searchAll of the "worked" set (a distinct-over-range set — NOT additive, so, like
 * sources/unique-testexec.js, it is collected directly per range) + ONE count query for
 * "estimates provided":
 *
 *   worked     = [labels = "<label>" AND …] worklogAuthor in (<team>)
 *                  AND worklogDate > "<from − 1 day>" AND worklogDate <= "<to>"
 *   done       = worked issues whose statusCategory = <doneStatusCategory> (Resolved / Closed)
 *   inProgress = worked − done                                              (Open / In Progress / Reopened)
 *   estimates  = worked AND (assignee NOT in <team> OR a comment matches an estimate marker)
 *   breakdown  = the worked issues classified by the QA activity in their summary
 *                (FRD / Spec review / I2L), for the slide's "N FRD · N Spec review · N I2L" line
 *
 * (`worklogDate > "from − 1 day"` == `worklogDate >= "from"`, written the way the
 * team's sample JQL is: `... worklogDate > 2026-03-31 AND worklogDate <= 2026-06-30`.)
 *
 * The worked set is fetched with only `summary` + `status` fields, so done/inProgress
 * (from statusCategory) and the type breakdown (from the summary) come from that single
 * searchAll — no separate count queries. "Estimates provided" needs the assignee/comment
 * predicate, kept as its own maxResults=0 count.
 *
 * "Estimates provided" definition (confirmed 2026-07-02): a worked spec counts if its
 * assignee is NOT a QA team member (QA estimated it and handed it back), OR a comment
 * carries a QA estimate — detected by the `estimateMarkers` substrings ("estimation",
 * "Manday"; the estimate tables reliably contain a "Manday (hour)"/"TOTAL TIME" row, and
 * "estimation" alone misses tables that don't spell the word — e.g. CRM-8285). The
 * comment match is any-author, but it only changes the result for team-assigned specs
 * (all others are already caught by the assignee clause), and on those the estimate is
 * authored by the QA team, so any-author ≈ "by Anh/Thuat" here. Verified Q2 2026 = 19
 * (18 handed-off + CRM-8285, which Anh estimated but kept assigned to himself).
 *
 * WHOLE-TEAM only: `worklogAuthor in (<all testers>)` counts a spec worked on by both
 * testers ONCE (the union), exactly like the slide. There is deliberately no per-tester
 * split — the per-tester distinct counts would not sum to the team union (e.g. Q2 2026:
 * Anh 19 + Thuat 3 = 22, but the team union is 20).
 *
 * Cost: 1 searchAll (small: summary+status, ≤ a few dozen issues) + 1 count per range,
 * run 8-way concurrently. Lightweight, like sources/unique-testexec.js.
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MEMBERS, JIRA_FRD_METRICS } = require('../config');

const isoUTC = (d) => d.toISOString().slice(0, 10);
// A JQL string literal: wrap in double quotes, escape any embedded quote.
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

// The "worked" set is split by the QA activity named in the issue summary (the team
// suffixes their spec sub-tasks "… - FRD review (QA)" / "… - Spec Review (QA)" / "… - I2L").
// Priority spec → FRD → I2L (a spec-review sub-task of an FRD feature is still a spec
// review). Order matters; keep 'other' last as the catch-all.
const TYPE_BUCKETS = [
  { key: 'frd', label: 'FRD' },
  { key: 'specReview', label: 'Spec review' },
  { key: 'i2l', label: 'I2L' },
  { key: 'other', label: 'Other' },
];
function classifyActivity(summary) {
  const s = String(summary || '').toLowerCase();
  if (/spec[\s-]*review/.test(s) || /\bspec\b/.test(s)) return 'specReview';
  if (/\bfrd\b/.test(s)) return 'frd';
  if (/\bi2l\b/.test(s)) return 'i2l';
  return 'other';
}

/** The day before `iso` (so `worklogDate > prevDay(from)` == `worklogDate >= from`). */
function prevDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return isoUTC(d);
}

/** The "worked" JQL: distinct issues carrying `labels` the team logged work on in the span. */
function workedJql(metric, jiraUsers, fromIso, toIso) {
  const labels = (metric.labels || []).map((l) => `labels = ${jqlStr(l)}`).join(' AND ');
  const scope = labels ? `${labels} AND ` : '';
  return `${scope}worklogAuthor in (${jiraUsers})` +
    ` AND worklogDate > "${prevDay(fromIso)}" AND worklogDate <= "${toIso}"`;
}

/** The "done" JQL = worked AND statusCategory = <doneStatusCategory> (used by the JQL note). */
function doneJql(metric, jiraUsers, fromIso, toIso) {
  return `${workedJql(metric, jiraUsers, fromIso, toIso)} AND statusCategory = ${jqlStr(metric.doneStatusCategory || 'Done')}`;
}

/** The "estimates provided" JQL = worked AND (assignee not in team OR an estimate-marker comment). */
function estimatesJql(metric, jiraUsers, fromIso, toIso) {
  const markers = (metric.estimateMarkers || ['estimation', 'Manday'])
    .map((m) => `comment ~ ${jqlStr(m)}`).join(' OR ');
  const clause = `assignee not in (${jiraUsers})${markers ? ` OR ${markers}` : ''}`;
  return `${workedJql(metric, jiraUsers, fromIso, toIso)} AND (${clause})`;
}

/**
 * @param ranges  computeRanges(now) — the selectable windows.
 * @returns per metric.key -> { label, kpiName, ranges: { rangeKey ->
 *          { key, label, from, to, worked, done, inProgress, estimates,
 *            breakdown: { frd, specReview, i2l, other } } } }
 */
async function collectFrdMetrics(ranges) {
  const jira = new JiraClient(loadJira());
  const jiraUsers = MEMBERS.map((m) => m.jira).join(', ');
  const rangeList = Object.values(ranges);
  const out = {};

  for (const metric of JIRA_FRD_METRICS) {
    // ONE searchAll (worked issues: summary + status) + ONE count (estimates) per range,
    // each 8-way concurrent. mapLimit preserves order, so results align to rangeList.
    const searched = await mapLimit(rangeList, 8, (range) =>
      jira.searchAll(workedJql(metric, jiraUsers, range.from, range.to), ['summary', 'status']));
    const estimated = await mapLimit(rangeList, 8, (range) =>
      jira.count(estimatesJql(metric, jiraUsers, range.from, range.to)));

    const perRange = {};
    rangeList.forEach((range, ri) => {
      const issues = searched[ri] || [];
      let done = 0;
      const breakdown = { frd: 0, specReview: 0, i2l: 0, other: 0 };
      for (const it of issues) {
        const f = it.fields || {};
        const cat = f.status && f.status.statusCategory && f.status.statusCategory.key;
        if (cat === 'done') done++;                      // statusCategory Done = Resolved/Closed
        breakdown[classifyActivity(f.summary)]++;
      }
      const worked = issues.length;
      perRange[range.key] = {
        key: range.key, label: range.label, from: range.from, to: range.to,
        worked,
        done,
        inProgress: Math.max(0, worked - done),          // statusCategory partitions all issues
        estimates: estimated[ri] || 0,
        breakdown,
      };
    });
    out[metric.key] = { label: metric.label, kpiName: metric.kpiName, ranges: perRange };
  }
  return out;
}

module.exports = { collectFrdMetrics, workedJql, doneJql, estimatesJql, classifyActivity, TYPE_BUCKETS, prevDay };
