'use strict';
/**
 * Source: Jira — "Executed Test Cases per main feature" (the Manual test page).
 * A grouped bar chart per Xray Test Repository module, showing four outcomes:
 * Executed, Passed, Failed, Aborted. It counts DISTINCT test cases PER TESTER and SUMS
 * across the team (one window query per tester per (range × bar × outcome)) — a test
 * case counts ONCE per tester who worked on it, so a TC executed by both testers counts
 * twice. This matches the per-person figures and the "Unique Executed Test Cases" card
 * (Σ per-tester distinct = 802 in Q2), NOT the whole-team distinct union (782) and NOT
 * the per-day sum of "Manual Test cases executed".
 *
 * Each bar maps to ONE OR MORE Test Repository folders (its `paths`). A plain string
 * module is shorthand for the single folder "<repoRoot>/<name>"; an object bar
 * ({ name, paths }) lists FULL repository paths so a bar can span folders that are NOT
 * under repoRoot (e.g. "CRM module" also counts its automation folder
 * "CRM automation/CRM module"; "Migration Odoo 12CE to 12CC" is its own top-level
 * folder). For each range × bar:
 *
 *   EXECUTED: project = <project> AND issuetype = "<issueType>"
 *               AND worklogAuthor in (<one tester>)      // run once per tester, summed
 *               AND worklogDate > "<from − 1 day>" AND worklogDate <= "<to>"
 *               AND (issue in testRepositoryFolderTests("<project>","<path1>","true") OR … )
 *   PASSED:   EXECUTED + " AND " + passedJql       (TestRunStatus = PASS)
 *   FAILED:   EXECUTED + " AND " + failedJql       (TestRunStatus = FAIL)
 *   ABORTED:  EXECUTED + " AND " + abortedJql      (TestRunStatus in (aborted))
 *
 * Passed/Failed/Aborted come from the Xray test-run outcome (TestRunStatus), not the
 * Jira workflow status. They partition the executed set, but a TC worked on with no run
 * yet (TestRunStatus TODO/EXECUTING) is in Executed and none of the three — so Executed
 * is counted independently (not derived) and Passed+Failed+Aborted can be ≤ Executed.
 *
 * (`worklogDate > "from − 1 day"` == `worklogDate >= "from"`, written the way the team's
 * sample JQL is.) `testRepositoryFolderTests(project, path, "true")` is Xray's JQL
 * function — "true" includes tests in sub-folders (required).
 *
 * The "Other" bar = grand total − Σ(bars), computed per outcome: one extra window count
 * per range per outcome for the unfiltered grand total, then Other = total minus the sum
 * of the bars. Because the bars' folders are disjoint this is exactly the test cases in
 * NO configured bar (clamped at 0), and Σ(bars) + Other = the grand total.
 *
 * Run PER TESTER and summed (Σ per-tester distinct), so the totals match the per-person
 * figures and the "Unique Executed Test Cases" card, not the whole-team distinct union.
 *
 * Cost: (bars + 1 grand) × 4 outcomes × ranges × testers, run 8-way concurrently — e.g.
 * (20 + 1) × 4 × 6 × 2 ≈ 1008 maxResults=0 counts per build. Still the lightweight
 * count-only profile of the other window-count sources, inside JiraClient's retry/backoff.
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MEMBERS, FEATURE_EXEC } = require('../config');

const isoUTC = (d) => d.toISOString().slice(0, 10);
// A JQL string literal: wrap in double quotes, escape any embedded quote.
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
// The outcome sub-metrics (besides the base "executed" count), in draw order.
const OUTCOME_KEYS = ['passed', 'failed', 'aborted'];

/** The day before `iso` (so `worklogDate > prevDay(from)` == `worklogDate >= from`). */
function prevDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return isoUTC(d);
}

/** Normalise a module config entry to { name, paths:[<full repo path>, …] }. A plain
 *  string is shorthand for the single folder "<repoRoot>/<name>". */
function normModule(cfg, m) {
  if (typeof m === 'string') return { name: m, paths: [`${cfg.repoRoot}/${m}`] };
  return { name: m.name, paths: m.paths };
}

/** Base window JQL: ONE tester's distinct Test Cases with a worklog in [from, to].
 *  Called once per team member; the resulting counts are summed (see collectFeatureExec). */
function windowJql(cfg, jiraUser, fromIso, toIso) {
  return `project = ${cfg.project} AND issuetype = ${jqlStr(cfg.issueType)}` +
    ` AND worklogAuthor in (${jiraUser})` +
    ` AND worklogDate > "${prevDay(fromIso)}" AND worklogDate <= "${toIso}"`;
}
/** Membership clause for a bar spanning one or more folders (each incl. sub-folders). */
function inAnyFolder(cfg, paths) {
  const clauses = paths.map((p) =>
    `issue in testRepositoryFolderTests(${jqlStr(cfg.project)}, ${jqlStr(p)}, "true")`);
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`;
}
/** The TestRunStatus clause for an outcome key, from the config. */
const outcomeJql = (cfg, key) => cfg[`${key}Jql`];

/**
 * @param ranges  computeRanges(now) — the selectable windows.
 * @returns { label, ranges: { <rangeKey> -> { key, label, from, to,
 *          features: [{ name, executed, passed, failed, aborted, isOther? }],
 *          totalExecuted, totalPassed, totalFailed, totalAborted } } }
 *          features are the bars with executed > 0, sorted executed desc, with the
 *          "Other" bar (grand total − Σ bars, if executed > 0) appended last.
 */
async function collectFeatureExec(ranges) {
  const cfg = FEATURE_EXEC;
  const jira = new JiraClient(loadJira());
  const rangeList = Object.values(ranges);
  const bars = cfg.modules.map((m) => normModule(cfg, m));

  // One flat task list across every (range × bar × outcome × TESTER) plus a grand total
  // per range per tester, so all counts run at the shared 8-way limit. `bi` is the bar
  // index or the 'grand' sentinel; `kind` is 'executed' | 'passed' | 'failed' | 'aborted'.
  // Counts are collected PER TESTER and summed below (a test case executed by both testers
  // counts once per tester, i.e. twice), so the totals match the per-person figures and the
  // "Unique Executed Test Cases" card (Σ per-tester distinct), NOT the whole-team distinct
  // union.
  const tasks = [];
  const pushOutcomes = (ri, bi, execJql) => {
    tasks.push({ ri, bi, kind: 'executed', jql: execJql });
    for (const k of OUTCOME_KEYS) tasks.push({ ri, bi, kind: k, jql: `${execJql} AND ${outcomeJql(cfg, k)}` });
  };
  rangeList.forEach((range, ri) => {
    for (const member of MEMBERS) {
      const base = windowJql(cfg, member.jira, range.from, range.to);
      bars.forEach((bar, bi) => pushOutcomes(ri, bi, `${base} AND ${inAnyFolder(cfg, bar.paths)}`));
      pushOutcomes(ri, 'grand', base);
    }
  });
  const results = await mapLimit(tasks, 8, async (t) => ({ ...t, n: await jira.count(t.jql) }));

  const zero = () => ({ executed: 0, passed: 0, failed: 0, aborted: 0 });
  const out = {};
  rangeList.forEach((range, ri) => {
    const slots = bars.map(zero);
    const grand = zero();
    for (const r of results) {
      if (r.ri !== ri) continue;
      // += : sum the per-tester counts for this (bar, outcome).
      (r.bi === 'grand' ? grand : slots[r.bi])[r.kind] += r.n;
    }
    const mods = bars
      .map((bar, i) => ({ name: bar.name, ...slots[i] }))
      .filter((f) => f.executed > 0)
      .sort((a, b) => b.executed - a.executed);
    // Other = grand total − Σ bars, per outcome (bars' folders are disjoint). Clamp ≥ 0.
    const sum = (k) => bars.reduce((s, _b, i) => s + slots[i][k], 0);
    const other = { executed: Math.max(0, grand.executed - sum('executed')) };
    for (const k of OUTCOME_KEYS) other[k] = Math.max(0, grand[k] - sum(k));
    const features = other.executed > 0 ? [...mods, { name: cfg.otherLabel, ...other, isOther: true }] : mods;
    const total = (k) => features.reduce((s, f) => s + f[k], 0);
    out[range.key] = {
      key: range.key, label: range.label, from: range.from, to: range.to,
      features,
      totalExecuted: total('executed'), totalPassed: total('passed'),
      totalFailed: total('failed'), totalAborted: total('aborted'),
    };
  });
  return { label: cfg.label, ranges: out };
}

module.exports = { collectFeatureExec, windowJql, inAnyFolder, outcomeJql, normModule, prevDay, OUTCOME_KEYS };
