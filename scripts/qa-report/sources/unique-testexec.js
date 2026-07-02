'use strict';
/**
 * Source: Jira — "Unique Executed Test Cases". The DISTINCT (deduplicated) count of
 * test cases a tester logged work on within a range, via ONE window JQL:
 *
 *   [project = <project> AND] issuetype = "<issueType>"
 *     AND worklogAuthor in (<tester>)
 *     AND worklogDate > "<from − 1 day>" AND worklogDate <= "<to>"
 *
 * (`worklogDate > "from − 1 day"` == `worklogDate >= "from"`; written as the team's
 * sample JQL is — `... worklogDate > 2026-03-31 AND worklogDate <= 2026-06-30`.)
 *
 * Contrast with sources/testexec.js ("Manual Test cases executed"), which counts per
 * DAY and SUMS — so a test case worked on N days counts N times. This metric runs a
 * SINGLE window query per (range × tester), so a test case counts ONCE no matter how
 * many days it was touched. A distinct-over-range count is therefore NOT additive: it
 * cannot be derived by summing a daily series, so it is collected directly per range
 * here rather than through the generic lib/ranges.aggregate() daily-sum path.
 *
 * The trend bars are per-bucket DISTINCT counts (one window query per bucket × tester,
 * buckets matching lib/ranges: day / week / month), so each bar is a valid unique
 * count on its own. The bars therefore need NOT sum to the range total — a test case
 * touched in two buckets counts once per bucket but once overall.
 *
 * Counting is per tester (worklogAuthor in (T)), exactly like the sample JQL, so the
 * per-tester split is each tester's own distinct set and the team total is their sum
 * (a test case executed by both testers counts once each) — consistent with how every
 * other metric on the page splits by tester and totals as the sum.
 *
 * Cost: for each metric, (1 range-total + n buckets) window counts per tester, run
 * 8-way concurrently in one batch. ~90–190 maxResults=0 counts/build depending on the
 * calendar (bucket count grows toward quarter/month end) — the same lightweight query
 * profile as sources/testexec.js, comfortably inside JiraClient's retry/backoff.
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MEMBERS, JIRA_UNIQUE_METRICS } = require('../config');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoUTC = (d) => d.toISOString().slice(0, 10);
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
// A JQL string literal: wrap in double quotes, escape any embedded quote.
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

/** Monday (UTC) of the ISO date's week. */
function mondayOf(iso) {
  const x = new Date(`${iso}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}
/** The day before `iso` (so `worklogDate > prevDay(from)` == `worklogDate >= from`). */
function prevDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return isoUTC(d);
}

/** The team's single-window distinct-test-case JQL over the span [fromIso, toIso]. */
function uniqueJql(metric, jiraUser, fromIso, toIso) {
  const proj = metric.project ? `project = ${metric.project} AND ` : '';
  return `${proj}issuetype = ${jqlStr(metric.issueType)} AND worklogAuthor in (${jiraUser})` +
    ` AND worklogDate > "${prevDay(fromIso)}" AND worklogDate <= "${toIso}"`;
}

/**
 * Ordered trend buckets for a range, matching lib/ranges.aggregate's bucketing:
 *   day   → one bucket per calendar day             (label = MM-DD)
 *   week  → Monday-aligned weeks, clipped to range   (label = the Monday's MM-DD)
 *   month → calendar months, clipped to range        (label = month name)
 * Each: { label, from, to } as inclusive ISO dates.
 */
function bucketsFor(range) {
  const out = [];
  const end = new Date(`${range.to}T00:00:00Z`);
  if (range.bucket === 'week') {
    for (let wk = mondayOf(range.from); wk <= end; wk.setUTCDate(wk.getUTCDate() + 7)) {
      const wkStart = isoUTC(wk);
      const sun = new Date(wk); sun.setUTCDate(sun.getUTCDate() + 6);
      const from = wkStart < range.from ? range.from : wkStart;
      const to = isoUTC(sun) > range.to ? range.to : isoUTC(sun);
      out.push({ label: wkStart.slice(5), from, to });
    }
  } else if (range.bucket === 'month') {
    const start = new Date(`${range.from}T00:00:00Z`);
    let y = start.getUTCFullYear(), m = start.getUTCMonth();
    for (;;) {
      const mStart = isoUTC(new Date(Date.UTC(y, m, 1)));
      const mEnd = isoUTC(new Date(Date.UTC(y, m + 1, 0)));
      out.push({
        label: MONTHS[m],
        from: mStart < range.from ? range.from : mStart,
        to: mEnd > range.to ? range.to : mEnd,
      });
      if (mEnd >= range.to) break;
      m++; if (m > 11) { m = 0; y++; }
    }
  } else { // day
    for (let d = new Date(`${range.from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = isoUTC(d);
      out.push({ label: iso.slice(5), from: iso, to: iso });
    }
  }
  return out;
}

/**
 * @param ranges       computeRanges(now) — the selectable windows.
 * @param memberNames  [name, ...] (defaults to the config team).
 * @returns per metric.key -> { label, kpiName, ranges: { key -> aggregate-shaped } }
 *          where each range object matches lib/ranges.aggregate's shape
 *          ({ key, label, from, to, total, byEmployee, series }) so render.js's
 *          rangeSection renders it identically to the daily-sum metrics.
 */
async function collectUniqueMetrics(ranges, memberNames) {
  const jira = new JiraClient(loadJira());
  const members = memberNames || MEMBERS.map((m) => m.name);
  const rangeList = Object.values(ranges);
  const out = {};

  for (const metric of JIRA_UNIQUE_METRICS) {
    // Plan every window count up front (range total + each trend bucket, per tester)
    // and run them in one 8-way batch — a distinct-over-range count needs its own
    // query, so there is nothing to reuse across ranges.
    const plan = rangeList.map((range) => ({ range, buckets: bucketsFor(range) }));
    const tasks = [];
    plan.forEach((p, ri) => {
      for (const m of MEMBERS) {
        tasks.push({ ri, kind: 'total', name: m.name, jira: m.jira, from: p.range.from, to: p.range.to });
        p.buckets.forEach((b, bi) =>
          tasks.push({ ri, kind: 'bucket', bi, name: m.name, jira: m.jira, from: b.from, to: b.to }));
      }
    });
    const results = await mapLimit(tasks, 8, async (t) =>
      ({ ...t, n: await jira.count(uniqueJql(metric, t.jira, t.from, t.to)) }));

    const perRange = {};
    plan.forEach((p, ri) => {
      const range = p.range;
      const byEmpVal = {}; members.forEach((n) => (byEmpVal[n] = 0));
      const bucketByEmp = p.buckets.map(() => { const o = {}; members.forEach((n) => (o[n] = 0)); return o; });
      for (const r of results) {
        if (r.ri !== ri) continue;
        if (r.kind === 'total') byEmpVal[r.name] = r.n;
        else bucketByEmp[r.bi][r.name] = r.n;
      }
      const total = members.reduce((s, n) => s + byEmpVal[n], 0);
      perRange[range.key] = {
        key: range.key, label: range.label, from: range.from, to: range.to,
        total: round(total),
        byEmployee: members.map((n) => ({ name: n, value: round(byEmpVal[n]) })),
        series: p.buckets.map((b, bi) => ({
          label: b.label,
          value: round(members.reduce((s, n) => s + bucketByEmp[bi][n], 0)),
          byEmp: Object.fromEntries(members.map((n) => [n, round(bucketByEmp[bi][n])])),
        })),
      };
    });
    out[metric.key] = { label: metric.label, kpiName: metric.kpiName, ranges: perRange };
  }
  return out;
}

module.exports = { collectUniqueMetrics, uniqueJql, bucketsFor, prevDay };
