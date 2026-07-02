'use strict';
/**
 * Source: DERIVED split metric "Test cases automated — with vs without Claude"
 * (config.JIRA_SPLIT_METRICS; Slide #16 of the QA Quarterly Review deck). It does NOT
 * fetch anything from Jira — it PARTITIONS an already-collected status-transition daily
 * series (the `sourceKey` metric, i.e. "Automation Test cases created") at a cutoff
 * date, per range:
 *
 *   with Claude    = automation-scope TCs resolved on days D >= claudeCutoff, in range
 *   without Claude = the rest of the range's TCs (D < claudeCutoff)  [legacy]
 *   total          = with + without = the sourceKey card's value for the same range
 *
 * `claudeCutoff` is the team's Claude-adoption date (first Claude co-authored commit in
 * CRM_AUTO_PLAYWRIGHT, 2026-06-05). The cutoff can fall INSIDE a range (Q2: Apr 1–Jun 4
 * legacy, Jun 5–Jun 30 with Claude), BEFORE it (a range entirely after adoption →
 * everything with Claude), or AFTER it (a pre-adoption range like Last year → everything
 * legacy). All three cases fall out of lib/ranges.aggregate: "with Claude" is aggregate
 * over the sub-window [max(from, cutoff) .. to] — aggregate filters date >= from &&
 * date <= to, so a cutoff past the range end yields an empty window (0) and a cutoff
 * before the range start leaves the whole range.
 *
 * Because it reuses the daily series collect.js already fetched for the transition
 * metric, this adds ZERO Jira queries. "By range" view only (no Quarterly card).
 */
const { aggregate } = require('../lib/ranges');

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
// max of two ISO dates — lexicographic order works for YYYY-MM-DD.
const maxIso = (a, b) => (a >= b ? a : b);

/**
 * @param metric   a JIRA_SPLIT_METRICS entry ({ key, label, kpiName, sourceKey, claudeCutoff }).
 * @param daily    [{ date:'YYYY-MM-DD', byEmp:{ name: value } }] — the sourceKey daily series.
 * @param ranges   computeRanges(now) — the selectable windows.
 * @param members  [name, ...]
 * @returns { label, kpiName, ranges: { <key>: { key, label, from, to, claudeCutoff,
 *           total, withClaude, withoutClaude, pctWith, pctWithout,
 *           byEmployee, withByEmployee, withoutByEmployee } } }
 */
function buildAutomationClaudeSplit(metric, daily, ranges, members) {
  const cutoff = metric.claudeCutoff;
  const out = { label: metric.label, kpiName: metric.kpiName, ranges: {} };
  const empMap = (agg) => Object.fromEntries(agg.byEmployee.map((e) => [e.name, e.value]));

  for (const range of Object.values(ranges)) {
    const totalAgg = aggregate(daily, members, range);
    // "With Claude" = the same daily series over the sub-window [max(from, cutoff) .. to].
    const withAgg = aggregate(daily, members, { ...range, from: maxIso(range.from, cutoff) });

    const total = totalAgg.total;
    const withClaude = withAgg.total;
    const withoutClaude = round(total - withClaude);
    const tEmp = empMap(totalAgg), wEmp = empMap(withAgg);

    out.ranges[range.key] = {
      key: range.key, label: range.label, from: range.from, to: range.to,
      claudeCutoff: cutoff,
      total, withClaude, withoutClaude,
      pctWith: pct(withClaude, total), pctWithout: pct(withoutClaude, total),
      byEmployee: totalAgg.byEmployee,
      withByEmployee: withAgg.byEmployee,
      withoutByEmployee: members.map((name) => ({ name, value: round((tEmp[name] || 0) - (wEmp[name] || 0)) })),
    };
  }
  return out;
}

module.exports = { buildAutomationClaudeSplit };
