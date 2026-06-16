'use strict';
/**
 * Reporting ranges + aggregation. One place defines the four selectable windows
 * so the collector and the page never disagree.
 *
 *   lastWeek    – previous completed Mon–Sun (default)   – daily buckets
 *   thisMonth   – 1st of this month → today              – daily buckets
 *   thisQuarter – 1st of this quarter → today            – weekly buckets
 *   thisYear    – Jan 1 → today                          – monthly buckets
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoDate = (d) => d.toISOString().slice(0, 10);
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function mondayOf(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

/** The four selectable ranges relative to `now` (a Date). */
function computeRanges(now) {
  const today = isoDate(now);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const thisMon = mondayOf(now);
  const prevMon = new Date(thisMon); prevMon.setUTCDate(thisMon.getUTCDate() - 7);
  const prevSun = new Date(prevMon); prevSun.setUTCDate(prevMon.getUTCDate() + 6);
  const qStart = Math.floor(m / 3) * 3;
  return {
    lastWeek: { key: 'lastWeek', label: 'Last week', from: isoDate(prevMon), to: isoDate(prevSun), bucket: 'day' },
    thisMonth: { key: 'thisMonth', label: 'This month', from: isoDate(new Date(Date.UTC(y, m, 1))), to: today, bucket: 'day' },
    thisQuarter: { key: 'thisQuarter', label: 'This quarter', from: isoDate(new Date(Date.UTC(y, qStart, 1))), to: today, bucket: 'week' },
    thisYear: { key: 'thisYear', label: 'This year', from: isoDate(new Date(Date.UTC(y, 0, 1))), to: today, bucket: 'month' },
  };
}

/** Earliest date we must fetch to cover every range (start of the year). */
const fetchStart = (now) => isoDate(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));

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
    else if (range.bucket === 'week') { key = isoDate(mondayOf(new Date(d.date + 'T00:00:00Z'))); label = key.slice(5); }
    else { key = d.date; label = d.date.slice(5); }
    if (!(key in buckets)) { buckets[key] = { label, value: 0 }; order.push(key); }
    buckets[key].value += sum;
  }

  return {
    key: range.key, label: range.label, from: range.from, to: range.to,
    total: round(total),
    byEmployee: members.map((m) => ({ name: m, value: round(byEmp[m]) })),
    series: order.sort().map((k) => ({ label: buckets[k].label, value: round(buckets[k].value) })),
  };
}

module.exports = { computeRanges, fetchStart, aggregate, isoDate };
