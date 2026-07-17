'use strict';
/**
 * Reporting ranges + aggregation. One place defines the four selectable windows
 * so the collector and the page never disagree.
 *
 *   currentWeek – Monday of this week → today (in progress) – daily buckets
 *   lastWeek    – previous completed Mon–Sun (default)   – daily buckets
 *   thisMonth   – 1st of this month → today              – daily buckets
 *   thisQuarter – 1st of this quarter → today            – weekly buckets
 *   lastQuarter – previous complete calendar quarter     – weekly buckets
 *   thisYear    – Jan 1 → today                          – monthly buckets
 *   lastYear    – Jan 1 → Dec 31 of last year            – monthly buckets
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoDate = (d) => d.toISOString().slice(0, 10);
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function mondayOf(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

/** The selectable ranges relative to `now` (a Date). The Metrics 'By range' view
 *  shows all of them; the Worklog page uses the four base ones (not lastYear). */
function computeRanges(now) {
  const today = isoDate(now);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const thisMon = mondayOf(now);
  const prevMon = new Date(thisMon); prevMon.setUTCDate(thisMon.getUTCDate() - 7);
  const prevSun = new Date(prevMon); prevSun.setUTCDate(prevMon.getUTCDate() + 6);
  const qStart = Math.floor(m / 3) * 3;
  // Previous complete quarter: the quarter before the current one. When the current
  // quarter is Q1 (qStart === 0) it wraps to Q4 of last year. `to` = last day of the
  // quarter via day-0-of-next-month (JS rolls month 12 into Jan of the next year).
  const lqStart = qStart === 0 ? 9 : qStart - 3;
  const lqYear = qStart === 0 ? y - 1 : y;
  return {
    // Current (in-progress) week: Monday of this week → today. Daily buckets, like
    // lastWeek. Sits before "Last week" in the Metrics selector (see METRIC_RANGE_ORDER).
    currentWeek: { key: 'currentWeek', label: 'Current week', from: isoDate(thisMon), to: today, bucket: 'day' },
    lastWeek: { key: 'lastWeek', label: 'Last week', from: isoDate(prevMon), to: isoDate(prevSun), bucket: 'day' },
    thisMonth: { key: 'thisMonth', label: 'This month', from: isoDate(new Date(Date.UTC(y, m, 1))), to: today, bucket: 'day' },
    thisQuarter: { key: 'thisQuarter', label: 'This quarter', from: isoDate(new Date(Date.UTC(y, qStart, 1))), to: today, bucket: 'week' },
    lastQuarter: { key: 'lastQuarter', label: 'Last quarter', from: isoDate(new Date(Date.UTC(lqYear, lqStart, 1))), to: isoDate(new Date(Date.UTC(lqYear, lqStart + 3, 0))), bucket: 'week' },
    thisYear: { key: 'thisYear', label: 'This year', from: isoDate(new Date(Date.UTC(y, 0, 1))), to: today, bucket: 'month' },
    lastYear: { key: 'lastYear', label: 'Last year', from: isoDate(new Date(Date.UTC(y - 1, 0, 1))), to: isoDate(new Date(Date.UTC(y - 1, 11, 31))), bucket: 'month' },
  };
}

// Earliest date any source must fetch to cover every range. "Last year" needs the
// whole previous calendar year, so go back to Jan 1 of LAST year (was: this year).
// NB: this widens the window for every metric source that calls it — the Odoo KPI
// query + the per-day Jira counters (testexec.js, automation-tc.js) now span ~1.5
// years. The Worklog page does NOT use this (it seeds its own this-year window).
const fetchStart = (now) => isoDate(new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)));

/**
 * Aggregate a per-day, per-employee series for one range.
 * @param daily   [{ date:'YYYY-MM-DD', byEmp:{ name: value } }]  (ascending)
 * @param members [name, ...]
 */
function aggregate(daily, members, range) {
  const inRange = daily.filter((d) => d.date >= range.from && d.date <= range.to);
  const byEmp = {}; members.forEach((m) => (byEmp[m] = 0));
  let total = 0;
  const buckets = {}; const order = [];

  for (const d of inRange) {
    let sum = 0;
    for (const m of members) { const v = d.byEmp[m] || 0; byEmp[m] += v; sum += v; }
    total += sum;

    let key, label;
    if (range.bucket === 'month') { key = d.date.slice(0, 7); label = MONTHS[Number(key.slice(5, 7)) - 1]; }
    // Quarter buckets: key 'YYYY-Qn' sorts correctly (chronologically) as a string,
    // both within and across years. Used by year ranges when a metric opts into a
    // quarterly Trend (config `yearBucket: 'quarter'`) instead of the monthly default.
    else if (range.bucket === 'quarter') { const mo = Number(d.date.slice(5, 7)); const qn = Math.floor((mo - 1) / 3) + 1; key = `${d.date.slice(0, 4)}-Q${qn}`; label = `Q${qn}`; }
    else if (range.bucket === 'week') { key = isoDate(mondayOf(new Date(d.date + 'T00:00:00Z'))); label = key.slice(5); }
    else { key = d.date; label = d.date.slice(5); }
    if (!(key in buckets)) { buckets[key] = { label, value: 0, byEmp: {} }; members.forEach((m) => { buckets[key].byEmp[m] = 0; }); order.push(key); }
    buckets[key].value += sum;
    for (const m of members) buckets[key].byEmp[m] += (d.byEmp[m] || 0);
  }

  return {
    key: range.key, label: range.label, from: range.from, to: range.to,
    total: round(total),
    byEmployee: members.map((m) => ({ name: m, value: round(byEmp[m]) })),
    // Each trend bucket keeps its per-tester split (byEmp) so the page can render a
    // stacked-by-tester trend; `value` stays the bucket total for the top label.
    series: order.sort().map((k) => ({
      label: buckets[k].label,
      value: round(buckets[k].value),
      byEmp: Object.fromEntries(members.map((m) => [m, round(buckets[k].byEmp[m])])),
    })),
  };
}

module.exports = { computeRanges, fetchStart, aggregate, isoDate };
