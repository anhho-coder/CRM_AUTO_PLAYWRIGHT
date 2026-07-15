'use strict';
/**
 * Source: Jira — "Manual Test cases executed" (and any future worklog-based
 * Metrics Report metric). For each day × tester it counts the DISTINCT issues of
 * `issueType` that tester logged work on that day, via the team's JQL:
 *
 *   issuetype = "<issueType>" AND worklogAuthor in (<tester>)
 *     AND worklogDate > "<D-1>" AND worklogDate <= "<D>"
 *
 * i.e. one lightweight count query (maxResults=0) per day × tester. The per-day
 * counts are summed into the selectable ranges by the collector, exactly like the
 * Odoo KPI metrics (sources/kpi.js) — so a test case worked on N different days
 * counts N times, matching the page's additive range model (range total = sum of
 * the day/week/month bars). `quarterlyActualFromDaily` sums the SAME daily series
 * per quarter for the Quarterly view's actual-only bar chart.
 *
 * Why not a single searchAll (as sources/support-ticket.js does)? That counts an
 * issue once by its `created` date. This metric is worklog-based: a test case
 * touched on several days must be counted on each of those days, which only the
 * per-day worklogDate window captures.
 *
 * Cost: ~ (days-in-year × testers) count queries per build (8 in flight, like the
 * Worklog page). Each is a maxResults=0 search, so it stays light on the shared
 * Jira; incremental caching (cf. the Worklog page) can be added later if needed.
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MEMBERS, JIRA_WORKLOG_METRICS } = require('../config');

const ord = (y, q) => y * 4 + q;
const r0 = (n) => Math.round(n);
// A JQL string literal: wrap in double quotes, escape any embedded quote.
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

/** Inclusive list of ISO days from `fromIso`..`toIso`, each with its previous day. */
function eachDay(fromIso, toIso) {
  const out = [];
  const end = new Date(`${toIso}T00:00:00Z`);
  for (let d = new Date(`${fromIso}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const prev = new Date(d); prev.setUTCDate(prev.getUTCDate() - 1);
    out.push({ date, prevDate: prev.toISOString().slice(0, 10) });
  }
  return out;
}

/** JQL counting the `issueType` issues `jiraUser` logged work on, on day `date`. */
function dayJql(metric, jiraUser, prevDate, date) {
  return `issuetype = ${jqlStr(metric.issueType)} AND worklogAuthor in (${jiraUser})` +
    ` AND worklogDate > "${prevDate}" AND worklogDate <= "${date}"`;
}

/**
 * @param {string} fetchFrom ISO date (inclusive) — earliest day to count.
 * @param {string} today     ISO date (inclusive) — latest day to count.
 * @returns per metric.key -> { label, kpiName, daily:[{date, byEmp:{name:val}}] }
 */
async function collectTestExecMetrics(fetchFrom, today) {
  const jira = new JiraClient(loadJira());
  const days = eachDay(fetchFrom, today);
  const out = {};
  for (const metric of JIRA_WORKLOG_METRICS) {
    const tasks = [];
    for (const day of days) for (const m of MEMBERS) tasks.push({ day, m });
    const counts = await mapLimit(tasks, 8, async ({ day, m }) =>
      ({ date: day.date, name: m.name, n: await jira.count(dayJql(metric, m.jira, day.prevDate, day.date)) }));

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

/**
 * Build the Quarterly-view object from a per-day series. Jira metrics have no
 * Odoo Forecast/Goal, so this is actual-only: a bar per quarter (the current one
 * highlighted) + the current quarter's per-tester split. `kpis: null` tells the
 * renderer to omit the QoQ/QvG/QvQY boxes (nothing to compute them from).
 *
 * @param members [name, ...]
 */
function quarterlyActualFromDaily(metric, daily, members, now) {
  const curY = now.getUTCFullYear();
  const curQ = Math.floor(now.getUTCMonth() / 3) + 1;
  const byQ = {}; // "Y-Q" -> { year, q, actual, byEmp }
  for (const d of daily) {
    const dt = new Date(`${d.date}T00:00:00Z`);
    const y = dt.getUTCFullYear(), q = Math.floor(dt.getUTCMonth() / 3) + 1;
    const k = `${y}-${q}`;
    if (!byQ[k]) byQ[k] = { year: y, q, actual: 0, byEmp: {} };
    const b = byQ[k];
    for (const name of members) { const v = d.byEmp[name] || 0; b.actual += v; b.byEmp[name] = (b.byEmp[name] || 0) + v; }
  }
  const cur = byQ[`${curY}-${curQ}`] || { year: curY, q: curQ, actual: 0, byEmp: {} };
  // `quarterlyFillEmpty` (leaked defects): show a CONTIGUOUS trailing window — the 4
  // calendar quarters immediately before the current one, filling any with no data as
  // 0 — so a rare metric keeps a stable 5-quarter x-axis (e.g. Q3-2025 = 0 still shows)
  // instead of collapsing to only the quarters that happen to have a hit. Default
  // behaviour (every other metric) keeps only the quarters actually present.
  let trailing;
  if (metric.quarterlyFillEmpty) {
    const curOrd = ord(curY, curQ);
    trailing = [];
    for (let o = 4; o >= 1; o--) {
      const n = curOrd - o;                       // ordinal of the quarter `o` steps back
      const q = ((n - 1) % 4) + 1, y = Math.floor((n - 1) / 4); // inverse of ord = y*4+q
      trailing.push(byQ[`${y}-${q}`] || { year: y, q, actual: 0, byEmp: {} });
    }
  } else {
    trailing = Object.values(byQ)
      .filter((b) => ord(b.year, b.q) < ord(curY, curQ))
      .sort((a, b) => ord(a.year, a.q) - ord(b.year, b.q))
      .slice(-4);
  }
  const bars = trailing.map((b) => ({ label: `Q${b.q}A-${b.year}`, value: r0(b.actual), type: 'actual' }));
  bars.push({ label: `Q${curQ}A-${curY}`, value: r0(cur.actual), type: 'current' });

  const total = r0(cur.actual);
  const byTester = members
    .map((name) => { const v = r0(cur.byEmp[name] || 0); return { name, value: v, pct: total ? Math.round((v / total) * 100) : 0 }; })
    .sort((a, b) => b.value - a.value);

  return {
    label: metric.label,
    kpiName: metric.kpiName,
    currentLabel: `Q${curQ}-${curY}`,
    bars,
    kpis: null,           // actual-only metric → renderer omits the QoQ/QvG/QvQY boxes
    byTester,
    total,
  };
}

module.exports = { collectTestExecMetrics, quarterlyActualFromDaily, eachDay, dayJql };
