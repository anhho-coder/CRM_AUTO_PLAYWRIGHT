'use strict';
/**
 * Source: DERIVED metric "Executed test cases per day" (config.JIRA_DERIVED_METRICS;
 * Slide #9 "PRODUCTIVITY — Executed test cases per day" of the QA Quarterly Review
 * deck). Two rates, per range:
 *
 *   Per calendar-day = executed ÷ working days
 *       working days = Mon–Fri dates in the range MINUS Vietnamese public holidays
 *       that land on a working day (reuses sources/holidays.fetchHolidayDates —
 *       e.g. Q2 = 65 − 3 = 62).
 *   Per man-day = executed ÷ test-case-execution man-days ("pure execution speed")
 *       man-days(T) = (test-case worklog hours by T ÷ WORK_HOURS_PER_DAY) × workload(T)
 *       workload(T) is T's capacity factor on config.MEMBERS (Thuat 0.5, Anh 0.25).
 *
 * `executed` is the DISTINCT count already collected by sources/unique-testexec (the
 * metric named by `numeratorKey`) — REUSED here, not re-queried. Only the man-day
 * denominator needs a fetch: the per-day test-case worklog HOURS per tester
 * (collectExecEffortDaily), summed into ranges via lib/ranges.aggregate (the same
 * daily-series shape kpi.js emits).
 *
 * A rate is not additive across days, so this is built per range (not summed). The
 * canonical total/byEmployee/series carry the PER-CALENDAR-DAY rate (so any generic
 * consumer degrades gracefully); the PER-MAN-DAY rate + the raw inputs ride in
 * `manDay` and a per-tester `byTester` breakdown, both surfaced by render.js's card.
 * The per-tester per-calendar-day rates sum to the team total (shared denominator);
 * the per-man-day TEAM total is the BLENDED rate (Σexecuted ÷ Σman-days), which is
 * NOT the sum of the per-tester man-day rates (different denominators) — as noted
 * on the card.
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MEMBERS, WORK_HOURS_PER_DAY } = require('../config');
const { aggregate } = require('../lib/ranges');
const { fetchHolidayDates } = require('./holidays');
const { bucketsFor } = require('./unique-testexec');

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
const NAME_BY_USER = Object.fromEntries(MEMBERS.map((m) => [m.jira, m.name]));
const TEAM_USERS = new Set(MEMBERS.map((m) => m.jira));
const WORKLOAD = Object.fromEntries(MEMBERS.map((m) => [m.name, Number(m.workload) || 0]));

const FETCH_CONCURRENCY = 8;
const MS_DAY = 86400000;

/** Weekday? (Mon–Fri, in UTC — the whole pipeline dates in UTC). */
const isWorkday = (iso) => { const g = new Date(iso + 'T00:00:00Z').getUTCDay(); return g !== 0 && g !== 6; };

/**
 * Working days in [fromIso, toIso] inclusive: Mon–Fri dates minus any date in
 * `holidaySet` (Vietnamese public holidays, already restricted to working days).
 */
function workingDaysBetween(fromIso, toIso, holidaySet) {
  let n = 0;
  const end = new Date(toIso + 'T00:00:00Z');
  for (let d = new Date(fromIso + 'T00:00:00Z'); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (isWorkday(iso) && !holidaySet.has(iso)) n++;
  }
  return n;
}

/** Union of working-day public-holiday dates for the given years (Set of ISO). */
async function holidaySetForYears(years) {
  const set = new Set();
  for (const y of [...new Set(years)]) {
    let dates = [];
    try { dates = await fetchHolidayDates(y); }
    catch (e) { console.error(`[executed-per-day] holiday fetch ${y} failed (working days won't net holidays for ${y}):`, e.message || e); }
    for (const iso of dates) if (isWorkday(iso)) set.add(iso);
  }
  return set;
}

/**
 * Per-day test-case worklog HOURS per tester — the raw effort behind man-days.
 * Reads the worklogs of every `issueType` issue the team logged on since `fromIso`
 * (per issue, team-scoped, `startedAfter`-bounded — the same pattern as
 * sources/worklog), sums timeSpent per (date, tester).
 * @returns [{ date:'YYYY-MM-DD', byEmp:{ name: hours } }] ascending — the shape
 *          lib/ranges.aggregate consumes.
 */
async function collectExecEffortDaily(metric, fromIso, toIso) {
  const jira = new JiraClient(loadJira());
  const authors = MEMBERS.map((m) => m.jira).join(', ');
  const proj = metric.project ? `project = ${metric.project} AND ` : '';
  const jql = `${proj}issuetype = ${jqlStr(metric.issueType)} AND worklogAuthor in (${authors})` +
    ` AND worklogDate >= ${jqlStr(fromIso)} ORDER BY updated DESC`;
  const issues = await jira.searchAll(jql, [], 100);

  const startedAfterMs = Date.parse(fromIso + 'T00:00:00Z') - 2 * MS_DAY; // buffer; date string below is authoritative
  const byDate = new Map(); // date -> { name: hours }
  const add = (date, name, hours) => {
    const o = byDate.get(date) || byDate.set(date, {}).get(date);
    o[name] = (o[name] || 0) + hours;
  };
  const skipped = [];
  await mapLimit(issues, FETCH_CONCURRENCY, async (it) => {
    let logs;
    try { logs = await jira.issueWorklogs(it.key, startedAfterMs); }
    catch (e) { skipped.push(it.key); return; }   // one unreadable issue must not sink the metric
    for (const w of logs) {
      const user = w.author && w.author.name;
      if (!TEAM_USERS.has(user)) continue;
      const date = String(w.started || '').slice(0, 10);
      if (!date || date < fromIso || date > toIso) continue;
      const hours = (Number(w.timeSpentSeconds) || 0) / 3600;
      if (!hours) continue;
      add(date, NAME_BY_USER[user], hours);
    }
  });
  if (skipped.length) {
    console.error(`[executed-per-day] skipped ${skipped.length}/${issues.length} test-case issues on worklog read ` +
      `(man-days may be understated): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ', …' : ''}`);
  }
  return [...byDate.keys()].sort().map((date) => ({ date, byEmp: byDate.get(date) }));
}

/**
 * Build the per-range rate metric.
 * @param meta          the JIRA_DERIVED_METRICS entry.
 * @param ranges        computeRanges(now) — the selectable windows.
 * @param uniqueMetric  the already-collected numerator metric (data.metrics[numeratorKey]):
 *                      { ranges: { <key>: { total, byEmployee:[{name,value}], series } } }.
 * @param execDaily     collectExecEffortDaily() output (per-day test-case hours).
 * @param holidaySet    holidaySetForYears() — working-day public holidays.
 * @param memberNames   [name, ...] (defaults to the config team).
 * @returns { label, kpiName, perDay:true, ranges: { <key>: <range> } } where each
 *          range object is render-ready (see the module header for the shape).
 */
function buildExecutedPerDay(meta, ranges, uniqueMetric, execDaily, holidaySet, memberNames) {
  const members = memberNames || MEMBERS.map((m) => m.name);
  const out = { label: meta.label, kpiName: meta.kpiName, perDay: true, ranges: {} };
  if (!uniqueMetric || !uniqueMetric.ranges) return out;

  for (const range of Object.values(ranges)) {
    const num = uniqueMetric.ranges[range.key];
    if (!num) continue; // numerator missing for this range -> skip it
    const wd = workingDaysBetween(range.from, range.to, holidaySet);

    const execByName = Object.fromEntries((num.byEmployee || []).map((e) => [e.name, e.value]));
    const hoursByName = Object.fromEntries(aggregate(execDaily, members, range).byEmployee.map((e) => [e.name, e.value]));

    const byTester = members.map((name) => {
      const executed = execByName[name] || 0;
      const execHours = hoursByName[name] || 0;
      const workload = WORKLOAD[name] || 0;
      const manDays = (execHours / WORK_HOURS_PER_DAY) * workload;
      return {
        name, executed, execHours: round(execHours), workload, manDays: round(manDays),
        calPerDay: wd > 0 ? round(executed / wd) : 0,
        manDayPerDay: manDays > 0 ? round(executed / manDays) : 0,
      };
    });

    const execTotal = members.reduce((s, n) => s + (execByName[n] || 0), 0);
    const manDaysTotal = byTester.reduce((s, r) => s + r.manDays, 0);

    // Trend: per-bucket per-calendar-day rate = (bucket distinct executed) ÷
    // (bucket working days). Reuses the numerator's per-bucket distinct series
    // (bucketsFor gives the same buckets, in the same order) divided by each
    // bucket's own working days. Bars therefore need not sum to the range total.
    const buckets = bucketsFor(range);
    const series = (num.series || []).map((s, i) => {
      const b = buckets[i];
      const bwd = b ? workingDaysBetween(b.from, b.to, holidaySet) : 0;
      const byEmp = {};
      members.forEach((n) => { byEmp[n] = bwd > 0 ? round(((s.byEmp && s.byEmp[n]) || 0) / bwd) : 0; });
      return { label: s.label, value: bwd > 0 ? round((s.value || 0) / bwd) : 0, byEmp };
    });

    out.ranges[range.key] = {
      key: range.key, label: range.label, from: range.from, to: range.to,
      workingDays: wd,
      // Canonical fields carry the per-CALENDAR-day rate (additive: shared denominator).
      total: wd > 0 ? round(execTotal / wd) : 0,
      byEmployee: byTester.map((r) => ({ name: r.name, value: r.calPerDay })),
      series,
      // Per-MAN-day rate: team total is the BLENDED rate (Σexecuted ÷ Σman-days).
      manDay: {
        total: manDaysTotal > 0 ? round(execTotal / manDaysTotal) : 0,
        byEmployee: byTester.map((r) => ({ name: r.name, value: r.manDayPerDay })),
        manDaysTotal: round(manDaysTotal),
      },
      byTester,
    };
  }
  return out;
}

module.exports = { collectExecEffortDaily, buildExecutedPerDay, workingDaysBetween, holidaySetForYears };
