'use strict';
/**
 * Source: Jira — "Defect quality — created" (QA CRM · Jira · Dashboard page).
 *
 * Slide #10 of the QA Quarterly Review deck ("QUALITY — Defect quality — created in
 * Q2 / Leaked defects list"), the CRM-team version. Per range it answers two of the
 * team's saved Jira queries and derives the leakage rate + a priority breakdown:
 *
 *   Bugs created (per tester T, split by reporter):
 *     type in (<bugTypes>) AND created > "<from − 1 day>" AND created <= "<to>"
 *       AND reporter = T
 *       AND (status in (<bugStatuses>) OR resolution changed to (<bugResolvedTransitions>))
 *
 *   Leaked defects (whole team, by label + the "Leaked defect priority" field + priority):
 *     labels in (<leakLabel>) AND "<leakField>" is not EMPTY
 *       AND createdDate >= "<from>" AND createdDate <= "<to>"
 *       AND priority in (<leakPriorities>)
 *
 * The two JQLs are reproduced VERBATIM from the team's samples (Anh's decision
 * 2026-07-02: match the saved filters literally rather than "fix" their date
 * boundaries). Note the deliberate asymmetry the samples carry: bugs-created uses
 * `created > (from − 1 day)` (so it includes the day BEFORE `from` and, being a
 * datetime field compared to a bare date, excludes `to`'s daytime), while leaked
 * uses `createdDate >= from`. Verified live for Last quarter (Q2 2026): bugs created
 * 170 (Anh Ho 30 / Thuat Phung 140), leaked 4 (all P1). The "correct" day-inclusive
 * window would give 161 — the +9 is the 10 bugs created on 2026-03-31 (a Q1 day the
 * `> 2026-03-31` lower bound lets in) minus the 1 dropped on 2026-06-30.
 *
 * Like sources/frd.js and sources/stuck.js this is a point-in-time, distinct set per
 * range (not an additive daily series), so it is collected directly per range rather
 * than through lib/ranges.aggregate(). "Bugs created" splits by reporter (a count per
 * range × tester); "Leaked defects" is whole-team (its `is not EMPTY` classification
 * is not a per-reporter signal) and is fetched as an issue LIST for the page's table.
 *
 * Cost: 2 counts (per-tester bugs) + 1 searchAll (leaked list) per range, run 8-way
 * concurrent — negligible next to the per-day count metrics; JiraClient retry applies.
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MEMBERS, JIRA_DEFECT_METRICS } = require('../config');

// A JQL string literal: wrap in double quotes, escape any embedded quote.
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

/** The day before `iso` (so `created > prevDay(from)` reproduces the sample's `> from − 1 day`). */
function prevDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** "Bugs created" JQL for one reporter clause over the range (sample-literal form). */
function bugsCreatedJql(metric, reporterClause, from, to) {
  const types = metric.bugTypes.map(jqlStr).join(', ');
  const statuses = metric.bugStatuses.map(jqlStr).join(', ');
  const trans = metric.bugResolvedTransitions.map(jqlStr).join(', ');
  return `type in (${types})` +
    ` AND created > ${jqlStr(prevDay(from))} AND created <= ${jqlStr(to)}` +
    ` AND ${reporterClause}` +
    ` AND (status in (${statuses}) OR resolution changed to (${trans}))`;
}

/** "Leaked defects" JQL over the range (sample-literal form). */
function leakedJql(metric, from, to) {
  const prios = metric.leakPriorities.map(jqlStr).join(', ');
  return `labels in (${jqlStr(metric.leakLabel)}) AND ${jqlStr(metric.leakField)} is not EMPTY` +
    ` AND createdDate >= ${jqlStr(from)} AND createdDate <= ${jqlStr(to)}` +
    ` AND priority in (${prios})`;
}

// Map a Jira priority name to a P1/P2/P3/other bucket (the deck's OPEN-NOW split).
function priorityBucket(name) {
  const p = String(name || '').toLowerCase();
  if (p.includes('p1') || p.includes('blocker')) return 'p1';
  if (p.includes('p2') || p.includes('critical')) return 'p2';
  if (p.includes('p3') || p.includes('major')) return 'p3';
  return 'other';
}
const PRIORITY_RANK = { p1: 0, p2: 1, p3: 2, other: 3 };

/**
 * @param ranges  computeRanges(now) — every selectable window (full 6-range group).
 * @returns per metric.key -> { label, kpiName, ranges: { rangeKey -> {
 *            key, label, from, to,
 *            bugsCreated, byEmployee:[{name,value}],
 *            leaked, leakRate, priorityBreakdown:{p1,p2,p3,other},
 *            leakedIssues:[{key,summary,priority,reporter,created}] } } }
 */
async function collectDefectQuality(ranges) {
  const jira = new JiraClient(loadJira());
  const nameByUser = new Map(MEMBERS.map((m) => [m.jira, m.name]));
  const rangeList = Object.values(ranges);
  const out = {};

  for (const metric of JIRA_DEFECT_METRICS) {
    // Bugs created: one count per (range × tester), so the card can show a reporter split.
    const perTesterCounts = {}; // jiraUser -> counts aligned to rangeList
    for (const mem of MEMBERS) {
      perTesterCounts[mem.jira] = await mapLimit(rangeList, 8, (range) =>
        jira.count(bugsCreatedJql(metric, `reporter = ${mem.jira}`, range.from, range.to)));
    }
    // Leaked defects: the matching issues per range (for the total, priority split + table).
    const leakedLists = await mapLimit(rangeList, 8, (range) =>
      jira.searchAll(leakedJql(metric, range.from, range.to), ['summary', 'priority', 'created', 'reporter']));

    const perRange = {};
    rangeList.forEach((range, ri) => {
      const byEmployee = MEMBERS.map((m) => ({ name: m.name, value: perTesterCounts[m.jira][ri] || 0 }));
      const bugsCreated = byEmployee.reduce((s, e) => s + e.value, 0);

      const leakedIssues = (leakedLists[ri] || []).map((it) => {
        const f = it.fields || {};
        const user = f.reporter ? f.reporter.name : null;
        return {
          key: it.key,
          summary: f.summary || '',
          priority: f.priority ? f.priority.name : '',
          reporter: (user && nameByUser.get(user)) || (f.reporter && f.reporter.displayName) || '—',
          created: f.created ? f.created.slice(0, 10) : null,
        };
      });
      const priorityBreakdown = { p1: 0, p2: 0, p3: 0, other: 0 };
      for (const it of leakedIssues) priorityBreakdown[priorityBucket(it.priority)]++;
      // Highest priority first, then newest first — the deck's "Leaked defects list".
      leakedIssues.sort((a, b) =>
        (PRIORITY_RANK[priorityBucket(a.priority)] - PRIORITY_RANK[priorityBucket(b.priority)]) ||
        String(b.created || '').localeCompare(String(a.created || '')));

      const leaked = leakedIssues.length;
      perRange[range.key] = {
        key: range.key, label: range.label, from: range.from, to: range.to,
        bugsCreated,
        byEmployee,
        leaked,
        // Leakage rate = leaked ÷ bugs created, one decimal (0 when no bugs created).
        leakRate: bugsCreated ? Math.round((leaked / bugsCreated) * 1000) / 10 : 0,
        priorityBreakdown,
        leakedIssues,
      };
    });
    out[metric.key] = { label: metric.label, kpiName: metric.kpiName, ranges: perRange };
  }
  return out;
}

module.exports = { collectDefectQuality, bugsCreatedJql, leakedJql, prevDay, priorityBucket };
