'use strict';
/**
 * Source: Jira — "Executed Test Cases per main feature" (the Manual test page).
 * A grouped bar chart (Executed vs Passed) per Xray Test Repository module, WHOLE
 * TEAM. Like sources/unique-testexec.js / sources/frd.js it counts DISTINCT test
 * cases per range with ONE window query per (range × bar) — a test case counts ONCE
 * no matter how many days it was touched (NOT the per-day sum of "Manual Test cases
 * executed").
 *
 * Each bar maps to ONE OR MORE Test Repository folders (its `paths`). A plain string
 * module is shorthand for the single folder "<repoRoot>/<name>"; an object bar
 * ({ name, paths }) lists FULL repository paths so a bar can span folders that are NOT
 * under repoRoot (e.g. "CRM module" also counts its automation folder
 * "CRM automation/CRM module"; "Migration Odoo 12CE to 12CC" is its own top-level
 * folder). For each range × bar:
 *
 *   EXECUTED: project = <project> AND issuetype = "<issueType>"
 *               AND worklogAuthor in (<team>)
 *               AND worklogDate > "<from − 1 day>" AND worklogDate <= "<to>"
 *               AND (issue in testRepositoryFolderTests("<project>","<path1>","true") OR … )
 *   PASSED:   EXECUTED  +  " AND " + passedJql          (statusCategory = Done)
 *
 * (`worklogDate > "from − 1 day"` == `worklogDate >= "from"`, written the way the
 * team's sample JQL is: `... worklogDate > 2026-03-31 AND worklogDate <= 2026-06-30`.)
 * `testRepositoryFolderTests(project, path, "true")` is Xray's JQL function — "true"
 * includes tests in sub-folders (a module folder holds its tests in sub-folders, so it
 * is required).
 *
 * The "Other" bar = grand total − Σ(bars): one extra window count per range for the
 * unfiltered grand total (executed + passed), then Other = total minus the sum of the
 * bars. Because the bars' folders are disjoint, this is exactly the executed test cases
 * that fall in NO configured bar (clamped at 0). It also makes the chart reconcile:
 * Σ(bars) + Other = the range's grand total.
 *
 * WHOLE-TEAM only (worklogAuthor in (<all testers>)): the chart shows the team's
 * distinct executed/passed per feature, matching the team's own single-window JQL.
 *
 * Cost: (bars × 2 + 2 grand) counts × ranges, run 8-way concurrently — e.g.
 * (20 × 2 + 2) × 6 ≈ 252 maxResults=0 counts per build. The same lightweight profile
 * as the other window-count sources, comfortably inside JiraClient's retry/backoff.
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MEMBERS, FEATURE_EXEC } = require('../config');

const isoUTC = (d) => d.toISOString().slice(0, 10);
// A JQL string literal: wrap in double quotes, escape any embedded quote.
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

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

/** Base window JQL: the team's distinct Test Cases with a worklog in [from, to]. */
function windowJql(cfg, jiraUsers, fromIso, toIso) {
  return `project = ${cfg.project} AND issuetype = ${jqlStr(cfg.issueType)}` +
    ` AND worklogAuthor in (${jiraUsers})` +
    ` AND worklogDate > "${prevDay(fromIso)}" AND worklogDate <= "${toIso}"`;
}
/** Membership clause for a bar spanning one or more folders (each incl. sub-folders). */
function inAnyFolder(cfg, paths) {
  const clauses = paths.map((p) =>
    `issue in testRepositoryFolderTests(${jqlStr(cfg.project)}, ${jqlStr(p)}, "true")`);
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`;
}

/**
 * @param ranges  computeRanges(now) — the selectable windows.
 * @returns { label, ranges: { <rangeKey> -> { key, label, from, to,
 *          features: [{ name, executed, passed, isOther? }], totalExecuted, totalPassed } } }
 *          features are the bars with executed > 0, sorted executed desc, with the
 *          "Other" bar (grand total − Σ bars, if > 0) appended last.
 */
async function collectFeatureExec(ranges) {
  const cfg = FEATURE_EXEC;
  const jira = new JiraClient(loadJira());
  const jiraUsers = MEMBERS.map((m) => m.jira).join(', ');
  const rangeList = Object.values(ranges);
  const bars = cfg.modules.map((m) => normModule(cfg, m));

  // One flat task list across every (range × bar × {executed, passed}) plus a grand
  // total per range, so all counts run at the shared 8-way limit.
  const tasks = [];
  rangeList.forEach((range, ri) => {
    const base = windowJql(cfg, jiraUsers, range.from, range.to);
    bars.forEach((bar, bi) => {
      const execJql = `${base} AND ${inAnyFolder(cfg, bar.paths)}`;
      tasks.push({ ri, bi, kind: 'executed', jql: execJql });
      tasks.push({ ri, bi, kind: 'passed', jql: `${execJql} AND ${cfg.passedJql}` });
    });
    tasks.push({ ri, bi: 'grand', kind: 'executed', jql: base });
    tasks.push({ ri, bi: 'grand', kind: 'passed', jql: `${base} AND ${cfg.passedJql}` });
  });
  const results = await mapLimit(tasks, 8, async (t) => ({ ...t, n: await jira.count(t.jql) }));

  const out = {};
  rangeList.forEach((range, ri) => {
    const slots = bars.map(() => ({ executed: 0, passed: 0 }));
    const grand = { executed: 0, passed: 0 };
    for (const r of results) {
      if (r.ri !== ri) continue;
      if (r.bi === 'grand') grand[r.kind] = r.n;
      else slots[r.bi][r.kind] = r.n;
    }
    const mods = bars
      .map((bar, i) => ({ name: bar.name, executed: slots[i].executed, passed: slots[i].passed }))
      .filter((f) => f.executed > 0)
      .sort((a, b) => b.executed - a.executed);
    // Other = grand total − Σ bars (the bars' folders are disjoint). Clamp ≥ 0 in the
    // unlikely event of overlapping folders or a mid-fetch data change.
    const sumExec = bars.reduce((s, _b, i) => s + slots[i].executed, 0);
    const sumPass = bars.reduce((s, _b, i) => s + slots[i].passed, 0);
    const other = { executed: Math.max(0, grand.executed - sumExec), passed: Math.max(0, grand.passed - sumPass) };
    const features = other.executed > 0
      ? [...mods, { name: cfg.otherLabel, executed: other.executed, passed: other.passed, isOther: true }]
      : mods;
    out[range.key] = {
      key: range.key, label: range.label, from: range.from, to: range.to,
      features,
      totalExecuted: features.reduce((s, f) => s + f.executed, 0),
      totalPassed: features.reduce((s, f) => s + f.passed, 0),
    };
  });
  return { label: cfg.label, ranges: out };
}

module.exports = { collectFeatureExec, windowJql, inAnyFolder, normModule, prevDay };
