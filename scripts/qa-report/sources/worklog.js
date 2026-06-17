'use strict';
/**
 * Source: Jira worklogs — powers the "Worklog allocation" page.
 *
 * For each QA tester we sum the hours they logged in Jira and split them across
 * the columns in cfg.WORKLOG_COLUMNS. A worklog is routed by the *issue's Jira
 * label* (first matching column wins); anything that matches no mapped label
 * falls into the "Non-CRM Project" catch-all. "All Jira logged time" is the
 * per-tester grand total.
 *
 * Worklogs are pulled in bulk for the whole year (/worklog/updated +
 * /worklog/list) and then aggregated into each selectable range, so the heavy
 * Jira traffic happens once per build regardless of how many ranges we show.
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MEMBERS, WORKLOG_COLUMNS } = require('../config');
const { isoDate } = require('../lib/ranges');

const FETCH_CONCURRENCY = 8; // simultaneous per-issue worklog reads

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const NAME_BY_USER = Object.fromEntries(MEMBERS.map((m) => [m.jira, m.name]));
const TEAM_USERS = new Set(MEMBERS.map((m) => m.jira));
const MATCHERS = WORKLOG_COLUMNS.filter((c) => c.match);                 // label-driven columns, in priority order
const OTHER = (WORKLOG_COLUMNS.find((c) => c.kind === 'other') || {}).key; // catch-all column key
const TOTAL = (WORKLOG_COLUMNS.find((c) => c.kind === 'total') || {}).key;  // grand-total column key
const LEAVE_KEY = (WORKLOG_COLUMNS.find((c) => c.kind === 'leave') || {}).key; // Odoo leave column key
// Jira columns = label buckets + the 'other' catch-all. These are the only ones
// summed into "All Jira logged time"; the 'leave' column sits outside that total.
const JIRA_BUCKETS = WORKLOG_COLUMNS.filter((c) => c.match || c.kind === 'other').map((c) => c.key);
const VALUE_KEYS = LEAVE_KEY ? [...JIRA_BUCKETS, LEAVE_KEY] : JIRA_BUCKETS; // every column that holds hours

/** Pick the column key for an issue's labels (first configured match, else catch-all). */
function columnFor(labels) {
  const set = new Set(labels || []);
  for (const c of MATCHERS) if (set.has(c.match)) return c.key;
  return OTHER;
}

/**
 * @param ranges  the four selectable windows from lib/ranges.computeRanges()
 * @param now     Date
 * @returns { columns:[{key,label,kind}], ranges:{ <rangeKey>: <aggregate> } }
 */
async function collectWorklog(ranges, now, leaveEntries = []) {
  const jira = new JiraClient(loadJira());
  const year = now.getUTCFullYear();
  const yearStartMs = Date.UTC(year, 0, 1);
  const fromIso = isoDate(new Date(yearStartMs));
  const toIso = isoDate(now);
  const authors = MEMBERS.map((m) => m.jira).join(', ');

  // 1) Every issue the team logged work on this year, with the label that routes
  //    its worklogs into a column. Bounded by team activity (~hundreds/year).
  const issues = await jira.searchAll(
    `worklogAuthor in (${authors}) AND worklogDate >= "${fromIso}" ORDER BY updated DESC`,
    ['labels'], 100);

  // 2) Read each issue's worklogs (this year only), keep this team's entries.
  const perIssue = await mapLimit(issues, FETCH_CONCURRENCY, async (it) => {
    const col = columnFor(it.fields && it.fields.labels);
    const logs = await jira.issueWorklogs(it.key, yearStartMs);
    const rows = [];
    for (const w of logs) {
      const user = w.author && w.author.name;
      if (!TEAM_USERS.has(user)) continue;
      const date = String(w.started || '').slice(0, 10);
      if (!date || date < fromIso || date > toIso) continue;
      const hours = (Number(w.timeSpentSeconds) || 0) / 3600;
      if (!hours) continue;
      rows.push({ date, tester: NAME_BY_USER[user], col, hours });
    }
    return rows;
  });
  const jiraEntries = perIssue.flat();

  // 3) Fold in FTO/Sick-Leave hours from Odoo (already {date, tester, hours}),
  //    routed to the dedicated 'leave' column.
  const leaveMapped = LEAVE_KEY
    ? leaveEntries
        .filter((e) => e && e.date >= fromIso && e.date <= toIso && byName(e.tester))
        .map((e) => ({ date: e.date, tester: e.tester, col: LEAVE_KEY, hours: Number(e.hours) || 0 }))
    : [];
  const entries = [...jiraEntries, ...leaveMapped];

  // 4) Aggregate into each selectable range.
  const out = {};
  for (const r of Object.values(ranges)) out[r.key] = aggregateRange(entries, r);
  return {
    columns: WORKLOG_COLUMNS.map((c) => ({ key: c.key, label: c.label, kind: c.kind || 'bucket' })),
    ranges: out,
    issueCount: issues.length,
  };
}

const byName = (n) => MEMBERS.some((m) => m.name === n);

function aggregateRange(entries, range) {
  // tester -> { colKey: hours }  (Jira buckets + the leave column)
  const byTester = {};
  MEMBERS.forEach((m) => { byTester[m.name] = Object.fromEntries(VALUE_KEYS.map((k) => [k, 0])); });
  for (const e of entries) {
    if (e.date < range.from || e.date > range.to) continue;
    if (!byTester[e.tester] || byTester[e.tester][e.col] == null) continue;
    byTester[e.tester][e.col] += e.hours;
  }

  // Per-tester row: Jira buckets sum into `total`; the leave column is carried
  // alongside but excluded from "All Jira logged time".
  const rows = MEMBERS.map((m) => {
    const cols = {};
    let total = 0;
    for (const k of JIRA_BUCKETS) { const v = round(byTester[m.name][k]); cols[k] = v; total += v; }
    total = round(total);
    if (LEAVE_KEY) cols[LEAVE_KEY] = round(byTester[m.name][LEAVE_KEY]);
    if (TOTAL) cols[TOTAL] = total;
    return { name: m.name, cols, total };
  });

  const totals = {};
  let grandTotal = 0;
  for (const k of JIRA_BUCKETS) { const v = round(rows.reduce((s, r) => s + r.cols[k], 0)); totals[k] = v; grandTotal += v; }
  grandTotal = round(grandTotal);
  if (LEAVE_KEY) totals[LEAVE_KEY] = round(rows.reduce((s, r) => s + r.cols[LEAVE_KEY], 0));
  if (TOTAL) totals[TOTAL] = grandTotal;

  // % share is of the team's "All Jira logged time" (so Jira buckets total 100%);
  // the leave column is shown as its size relative to that same Jira total.
  const pct = {};
  for (const k of JIRA_BUCKETS) pct[k] = grandTotal ? Math.round((totals[k] / grandTotal) * 1000) / 10 : 0;
  if (LEAVE_KEY) pct[LEAVE_KEY] = grandTotal ? Math.round((totals[LEAVE_KEY] / grandTotal) * 1000) / 10 : 0;
  if (TOTAL) pct[TOTAL] = grandTotal ? 100 : 0;

  return {
    key: range.key, label: range.label, from: range.from, to: range.to,
    byTester: rows, totals, grandTotal, pct,
  };
}

module.exports = { collectWorklog };
