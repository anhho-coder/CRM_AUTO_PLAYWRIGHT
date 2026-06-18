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
const fs = require('fs');
const path = require('path');
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MEMBERS, WORKLOG_COLUMNS, WORKLOG_REFRESH_DAYS, WORKLOG_EXCLUDE_LABELS, WORKLOG_COMMENT_RULES, DATA_DIR } = require('../config');
const { isoDate } = require('../lib/ranges');

const FETCH_CONCURRENCY = 8;       // simultaneous per-issue worklog reads
const CACHE_FILE = path.join(DATA_DIR, 'worklog-cache.json');
const MS_DAY = 86400000;
const addDaysIso = (iso, n) => isoDate(new Date(Date.parse(iso + 'T00:00:00Z') + n * MS_DAY));
const minIso = (a, b) => (a <= b ? a : b);
const maxIso = (a, b) => (a >= b ? a : b);

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const NAME_BY_USER = Object.fromEntries(MEMBERS.map((m) => [m.jira, m.name]));
const TEAM_USERS = new Set(MEMBERS.map((m) => m.jira));
const MATCHERS = WORKLOG_COLUMNS.filter((c) => c.match);                 // label-driven columns, in priority order
const EXCLUDE = new Set(WORKLOG_EXCLUDE_LABELS || []);                    // issues with any of these labels are dropped
const COMMENT_RULES = (WORKLOG_COMMENT_RULES || []).map((r) => ({ needle: String(r.contains).toLowerCase(), col: r.column }));
// Signature of the bucketing config; a change forces a full re-seed so cached
// rows are re-bucketed under the new columns/excludes/comment-rules.
const CFG_SIG = JSON.stringify({ m: MATCHERS.map((c) => [c.key, c.match]), x: [...EXCLUDE].sort(), c: COMMENT_RULES });
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

/** Column from a worklog comment (first matching rule), or null to fall back to label. */
function commentColumn(comment) {
  const s = String(comment || '').toLowerCase();
  for (const r of COMMENT_RULES) if (r.needle && s.includes(r.needle)) return r.col;
  return null;
}

/** Collapse raw entries to one row per (date, tester, col), summing hours. */
function collapse(entries) {
  const m = new Map();
  for (const e of entries) {
    const k = `${e.date}|${e.tester}|${e.col}`;
    m.set(k, (m.get(k) || 0) + e.hours);
  }
  return [...m.entries()].map(([k, hours]) => {
    const [date, tester, col] = k.split('|');
    return { date, tester, col, hours: round(hours) };
  });
}

function loadCache() {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (c && Array.isArray(c.entries)) return c;
  } catch (_) { /* missing/corrupt -> full seed */ }
  return null;
}

function saveCache(obj) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(obj)); }
  catch (e) { console.error('[worklog] cache write failed:', e.message || e); }
}

/**
 * @param ranges  the selectable windows from lib/ranges.computeRanges() (the
 *                worklog page uses the four base ones; the Metrics-only 'lastYear'
 *                range is skipped — see below)
 * @param now     Date
 * @returns { columns:[{key,label,kind}], ranges:{ <rangeKey>: <aggregate> } }
 */
async function collectWorklog(ranges, now, leaveEntries = []) {
  const jira = new JiraClient(loadJira());
  const year = now.getUTCFullYear();
  const yearStartIso = isoDate(new Date(Date.UTC(year, 0, 1)));
  const toIso = isoDate(now);
  const authors = MEMBERS.map((m) => m.jira).join(', ');

  // 1) Decide the fetch window. With a usable cache (same year) re-fetch only the
  //    recent window (also catches back-dated logs) and keep older cached days;
  //    otherwise seed a full-year fetch.
  const refreshDays = Number(WORKLOG_REFRESH_DAYS) || 35;
  const cache = loadCache();
  const useCache = !!(cache && cache.year === year && cache.cfgSig === CFG_SIG);
  const fetchFrom = useCache
    ? maxIso(yearStartIso, minIso(addDaysIso(toIso, -refreshDays), cache.fetchedThrough || yearStartIso))
    : yearStartIso;
  const keptOld = useCache ? cache.entries.filter((e) => e.date < fetchFrom) : [];
  console.log(`[worklog] ${useCache ? 'incremental' : 'full'} fetch ${fetchFrom}..${toIso}` +
    (useCache ? ` (cache through ${cache.fetchedThrough}, ${keptOld.length} cached rows kept)` : ''));

  // 2) Issues the team logged on within the window, with the routing label.
  const issues = await jira.searchAll(
    `worklogAuthor in (${authors}) AND worklogDate >= "${fetchFrom}" ORDER BY updated DESC`,
    ['labels'], 100);

  // 3) Read each issue's in-window worklogs; keep this team's, route by label.
  const startedAfterMs = Date.parse(fetchFrom + 'T00:00:00Z') - 2 * MS_DAY; // buffer; date string below is authoritative
  const perIssue = await mapLimit(issues, FETCH_CONCURRENCY, async (it) => {
    const labels = (it.fields && it.fields.labels) || [];
    if (labels.some((l) => EXCLUDE.has(l))) return [];   // drop excluded-label issues (e.g. QA-FTO/SL) entirely
    const labelCol = columnFor(labels);
    const logs = await jira.issueWorklogs(it.key, startedAfterMs);
    const rows = [];
    for (const w of logs) {
      const user = w.author && w.author.name;
      if (!TEAM_USERS.has(user)) continue;
      const date = String(w.started || '').slice(0, 10);
      if (!date || date < fetchFrom || date > toIso) continue;
      const hours = (Number(w.timeSpentSeconds) || 0) / 3600;
      if (!hours) continue;
      const col = commentColumn(w.comment) || labelCol;   // comment rule wins, else label
      rows.push({ date, tester: NAME_BY_USER[user], col, hours });
    }
    return rows;
  });

  // 4) Merge fresh window with the cached older days, then persist the year store.
  const jiraEntries = collapse([...keptOld, ...perIssue.flat()]);
  saveCache({ year, cfgSig: CFG_SIG, fetchedThrough: toIso, entries: jiraEntries });

  // 5) Fold in FTO/Sick-Leave + holiday hours (already {date, tester, hours}),
  //    routed to the dedicated 'leave' column.
  const leaveMapped = LEAVE_KEY
    ? leaveEntries
        .filter((e) => e && e.date >= yearStartIso && e.date <= toIso && byName(e.tester))
        .map((e) => ({ date: e.date, tester: e.tester, col: LEAVE_KEY, hours: Number(e.hours) || 0 }))
    : [];
  const entries = [...jiraEntries, ...leaveMapped];

  // 6) Aggregate into each selectable range. Also expose the per-day breakdown so
  //    the page can recompute a client-side custom date range without re-fetching.
  //    Skip 'lastYear' (a Metrics-Report-only range): the worklog page only seeds
  //    THIS year's data, so a lastYear bucket would just be an all-zero dead block.
  const out = {};
  for (const r of Object.values(ranges)) {
    if (r.key === 'lastYear') continue;
    out[r.key] = aggregateRange(entries, r);
  }
  const daily = collapse(entries).map((e) => ({ d: e.date, t: e.tester, c: e.col, h: e.hours }));
  return {
    columns: WORKLOG_COLUMNS.map((c) => ({ key: c.key, label: c.label, kind: c.kind || 'bucket' })),
    ranges: out,
    daily,
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

module.exports = { collectWorklog, aggregateRange, collapse };
