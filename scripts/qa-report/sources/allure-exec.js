'use strict';
/**
 * Source: ALLURE (this Jenkins host's filesystem) — "Unique Automation Test cases
 * executed". The ONE metric on the report that does not come from Jira or Odoo.
 *
 * WHERE THE NUMBER COMES FROM
 * ---------------------------
 * The CRM-Allure-{Daily,Weekly,Monthly,Quarterly,Yearly} jobs (ci/Jenkinsfile.period-allure
 * -> ci/allure-period-report.ps1) each merge the dated result buckets
 *     C:\allure\periods\results\<yyyy-MM-dd>\<JOB_BASE_NAME>\*.json
 * that every section/chunk job drops after a run, DEDUPE them to the latest result per
 * test identity (ci/allure-dedupe-latest.js + ci/allure-test-identity.js), generate the
 * report and freeze it at
 *     C:\allure\periods\report\<scope>\<periodKey>\
 * with scope ∈ {daily, weekly, monthly, quarterly, yearly} and periodKey
 *     daily=yyyy-MM-dd  weekly=yyyy-Www (ISO)  monthly=yyyy-MM  quarterly=yyyy-Qn  yearly=yyyy
 *
 * WHICH WIDGET — this matters, the two disagree ON PURPOSE:
 *   widgets/summary.json  is OVERWRITTEN after generate with the PRE-dedupe all-runs
 *                         statistic (ci/allure-apply-allruns.js) → counts retries/re-runs.
 *   widgets/suites.json   is left exactly as `allure generate` produced it, i.e. from the
 *                         DEDUPED set → ONE ROW PER UNIQUE TEST CASE.
 * So  unique = Σ items[].statistic.total  of suites.json. That is the number the Allure
 * report's Suites section shows and the one the weekly stakeholder email calls
 * "Unique TCs executed".
 *
 * WHY THIS SOURCE DOES NOT BUILD A DAILY SERIES
 * --------------------------------------------
 * "Unique" is not additive. A spec executed on Monday and re-run on Wednesday is 2 daily
 * uniques but 1 unique for the week. Measured on the live store (2026-06-18..2026-09-22):
 * summing the 95 daily reports gives 6845; the yearly report's true unique for the same
 * span is 1187. Summing a daily series would therefore report a number ~6× too large.
 *
 * Instead every range reads the ONE frozen report whose period matches it:
 *     currentWeek / lastWeek -> weekly      thisMonth              -> monthly
 *     thisQuarter / lastQuarter -> quarterly   thisYear / lastYear -> yearly
 * and the Quarterly view's bars read the quarterly reports. The Trend bars are per-bucket
 * uniques from the matching daily / weekly / monthly reports — they do NOT sum to the
 * range total, which the card's ℹ️ note states.
 *
 * IC SPLIT: an Allure result records which spec ran, never who ran it. `attributeTo`
 * (config) assigns the whole count to one IC so the card keeps the same "By IC" table as
 * "Automation Test cases created". It is an attribution, not a measurement.
 *
 * FAULT TOLERANCE: a missing period folder is 0 (that period was never generated), a
 * missing/corrupt suites.json is 0, and a missing ROOT throws so collect.js marks the
 * source failed instead of publishing silent zeros. That distinction is deliberate — a
 * zero must mean "the report exists and is empty", never "I could not look".
 */
const fs = require('fs');
const path = require('path');

/* ------------------------------- period keys -------------------------------- */

const iso = (d) => d.toISOString().slice(0, 10);
const utc = (s) => new Date(`${s}T00:00:00Z`);

/** Monday of the ISO week containing `d` (UTC). */
function mondayOf(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

/**
 * ISO week key 'YYYY-Www' — the SAME formula ci/allure-period-report.ps1 uses to name
 * the folder (the week's Thursday decides both the year and the number), so the key
 * built here always addresses the folder that pipeline wrote.
 */
function weekKey(d) {
  const mon = mondayOf(d);
  const thu = new Date(mon); thu.setUTCDate(mon.getUTCDate() + 3);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((thu.getTime() - jan1) / 86400000) + 1;
  const wn = Math.floor((dayOfYear - 1) / 7) + 1;
  return `${thu.getUTCFullYear()}-W${String(wn).padStart(2, '0')}`;
}
const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const quarterKey = (d) => `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
const yearKey = (d) => String(d.getUTCFullYear());

// Which frozen scope answers each selectable range. A range is always fully inside one
// period of its scope (see lib/ranges.js), so one report is the whole answer.
const RANGE_SCOPE = {
  currentWeek: 'weekly', lastWeek: 'weekly',
  thisMonth: 'monthly',
  thisQuarter: 'quarterly', lastQuarter: 'quarterly',
  thisYear: 'yearly', lastYear: 'yearly',
};
const KEY_OF = { daily: iso, weekly: weekKey, monthly: monthKey, quarterly: quarterKey, yearly: yearKey };

/* ------------------------------ reading a report ---------------------------- */

/**
 * Σ of the per-suite unique counts of one frozen period, plus the per-suite rows.
 * @returns {{ total:number, suites:Array<{name:string,value:number}>, found:boolean }}
 */
function readPeriod(reportRoot, scope, key) {
  const file = path.join(reportRoot, scope, key, 'widgets', 'suites.json');
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return { total: 0, suites: [], found: false }; }
  let items;
  try { items = (JSON.parse(raw) || {}).items || []; } catch (e) {
    console.error(`[allure-exec] ${scope}/${key}: suites.json is not valid JSON — counted 0.`);
    return { total: 0, suites: [], found: false };
  }
  const suites = items
    .map((it) => ({ name: String((it && it.name) || '?'), value: Number(((it || {}).statistic || {}).total) || 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  return { total: suites.reduce((n, s) => n + s.value, 0), suites, found: true };
}

/* --------------------------------- buckets ---------------------------------- */

/** The Trend buckets of a range: one frozen period per bar, at the range's granularity. */
function bucketsFor(range) {
  const from = utc(range.from), to = utc(range.to);
  const out = [];
  if (range.bucket === 'month') {
    for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d.setUTCMonth(d.getUTCMonth() + 1)) {
      out.push({ scope: 'monthly', key: monthKey(d), label: MONTHS[d.getUTCMonth()] });
    }
  } else if (range.bucket === 'week') {
    for (let d = mondayOf(from); d <= to; d.setUTCDate(d.getUTCDate() + 7)) {
      out.push({ scope: 'weekly', key: weekKey(d), label: iso(d).slice(5) });
    }
  } else {
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push({ scope: 'daily', key: iso(d), label: iso(d).slice(5) });
    }
  }
  return out;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** byEmp map with the whole value on the attributed IC and 0 on everyone else. */
const attribute = (members, attributeTo, value) =>
  Object.fromEntries(members.map((m) => [m, m === attributeTo ? value : 0]));

/* --------------------------------- builders --------------------------------- */

/** One range → the shape render.js's rangeSection() consumes. */
function buildRange(metric, range, members, attributeTo) {
  const scope = RANGE_SCOPE[range.key];
  const period = readPeriod(metric.reportRoot, scope, KEY_OF[scope](utc(range.from)));
  const series = bucketsFor(range).map((b) => {
    const v = readPeriod(metric.reportRoot, b.scope, b.key).total;
    return { label: b.label, value: v, byEmp: attribute(members, attributeTo, v) };
  });
  return {
    key: range.key, label: range.label, from: range.from, to: range.to,
    total: period.total,
    byEmployee: members.map((m) => ({ name: m, value: m === attributeTo ? period.total : 0 })),
    series,
    // Kept for provenance / future use — the per-suite split behind the total.
    bySuite: period.suites,
    periodKey: KEY_OF[scope](utc(range.from)),
    periodScope: scope,
  };
}

const ord = (y, q) => y * 4 + q;

/** One quarter snapshot → the shape render.js's qSnapBlock() consumes. */
function quarterSnap(metric, y, q, members, attributeTo, window) {
  const valueOf = (yy, qq) => readPeriod(metric.reportRoot, 'quarterly', `${yy}-Q${qq}`).total;
  const bars = [];
  const cur = ord(y, q);
  for (let back = window - 1; back >= 1; back--) {
    const n = cur - back;
    const bq = ((n - 1) % 4) + 1, by = Math.floor((n - 1) / 4);
    bars.push({ label: `Q${bq}A-${by}`, value: valueOf(by, bq), type: 'actual' });
  }
  const total = valueOf(y, q);
  bars.push({ label: `Q${q}A-${y}`, value: total, type: 'current' });
  return {
    key: `${y}-${q}`,
    currentLabel: `Q${q}-${y}`,
    colLabel: `Q${q}A`,
    bars,
    kpis: null,                       // actual-only metric → no QoQ/QvG/QvQY boxes
    byTester: members
      .map((name) => { const v = name === attributeTo ? total : 0; return { name, value: v, pct: total ? Math.round((v / total) * 100) : 0 }; })
      .sort((a, b) => b.value - a.value),
    total,
  };
}

/** The Quarterly-view payload: every quarter the frozen store holds, plus the current one. */
function buildQuarterly(metric, members, attributeTo, now) {
  const curY = now.getUTCFullYear(), curQ = Math.floor(now.getUTCMonth() / 3) + 1;
  const window = metric.quarterWindow || 4;

  // Offer every quarter this card can draw: the ones that exist on disk, PLUS the whole
  // trailing window ending at the current quarter. The quarterly picker is shared by all
  // metrics on the page, so a quarter another metric offers (e.g. Q4-2025 on "Automation
  // Test cases created") must resolve to a real card here — a 0 one — instead of the
  // "no data" placeholder.
  const dir = path.join(metric.reportRoot, 'quarterly');
  let onDisk = [];
  try { onDisk = fs.readdirSync(dir).filter((n) => /^\d{4}-Q[1-4]$/.test(n)); } catch (e) { onDisk = []; }
  const seen = new Map();
  const add = (y, q) => { const k = `${y}-${q}`; if (!seen.has(k)) seen.set(k, { year: y, q, key: k, label: `Q${q}-${y}` }); };
  onDisk.forEach((n) => add(Number(n.slice(0, 4)), Number(n.slice(6))));
  const cur = ord(curY, curQ);
  for (let back = window - 1; back >= 0; back--) { const n = cur - back; add(Math.floor((n - 1) / 4), ((n - 1) % 4) + 1); }
  const currentKey = `${curY}-${curQ}`;
  const available = [...seen.values()].sort((a, b) => ord(a.year, a.q) - ord(b.year, b.q));

  const byQuarter = {};
  for (const a of available) byQuarter[a.key] = quarterSnap(metric, a.year, a.q, members, attributeTo, window);

  return {
    label: metric.label,
    kpiName: metric.kpiName,
    memberCount: members.length,      // the trend line = bar ÷ team size, as on the other cards
    currentKey,
    available,
    byQuarter,
    ...byQuarter[currentKey],
  };
}

/* ---------------------------------- entry ----------------------------------- */

/**
 * @param {Array}  metrics  cfg.ALLURE_PERIOD_METRICS
 * @param {Object} ranges   lib/ranges.js computeRanges(now)
 * @param {Array}  members  team member names (the IC rows)
 * @param {Date}   now
 * @returns per metric.key -> { label, kpiName, ranges, quarterly }
 */
function collectAllurePeriodMetrics(metrics, ranges, members, now) {
  const out = {};
  for (const metric of metrics) {
    if (!fs.existsSync(metric.reportRoot)) {
      throw new Error(`Allure period reports not found at ${metric.reportRoot} — ` +
        'this metric reads the frozen reports on the Jenkins agent (set ALLURE_PERIODS_REPORT_ROOT to run it elsewhere).');
    }
    const attributeTo = metric.attributeTo && members.includes(metric.attributeTo) ? metric.attributeTo : members[0];
    if (metric.attributeTo && attributeTo !== metric.attributeTo) {
      console.error(`[allure-exec] attributeTo '${metric.attributeTo}' is not a team member — attributed to '${attributeTo}'.`);
    }
    const perRange = {};
    for (const r of Object.values(ranges)) {
      if (!RANGE_SCOPE[r.key]) continue;             // a range with no matching frozen scope
      perRange[r.key] = buildRange(metric, r, members, attributeTo);
    }
    out[metric.key] = {
      label: metric.label,
      kpiName: metric.kpiName,
      ranges: perRange,
      quarterly: metric.quarterly ? buildQuarterly(metric, members, attributeTo, now) : null,
    };
  }
  return out;
}

/**
 * The frozen report a range reads, as {scope, key} — exported so render.js can show the
 * exact file path in the "where each number comes from" hover without re-deriving it.
 */
function periodFor(rangeKey, fromIso) {
  const scope = RANGE_SCOPE[rangeKey];
  if (!scope) return null;
  return { scope, key: KEY_OF[scope](utc(fromIso)) };
}

module.exports = { collectAllurePeriodMetrics, readPeriod, weekKey, periodFor, RANGE_SCOPE };
