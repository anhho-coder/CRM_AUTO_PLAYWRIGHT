'use strict';
/**
 * Source: Jira — "Executed Test Cases per main feature" (the Manual test page).
 * A grouped bar chart (Executed vs Passed) per Xray Test Repository module, WHOLE
 * TEAM. Like sources/unique-testexec.js / sources/frd.js it counts DISTINCT test
 * cases per range with ONE window query per (range × module) — a test case counts
 * ONCE no matter how many days it was touched (NOT the per-day sum of "Manual Test
 * cases executed"). For each range × module:
 *
 *   EXECUTED: project = <project> AND issuetype = "<issueType>"
 *               AND worklogAuthor in (<team>)
 *               AND worklogDate > "<from − 1 day>" AND worklogDate <= "<to>"
 *               AND issue in testRepositoryFolderTests("<project>", "<repoRoot>/<module>", "true")
 *   PASSED:   EXECUTED  +  " AND " + passedJql          (statusCategory = Done)
 *
 * (`worklogDate > "from − 1 day"` == `worklogDate >= "from"`, written the way the
 * team's sample JQL is: `... worklogDate > 2026-03-31 AND worklogDate <= 2026-06-30`.)
 * `testRepositoryFolderTests(project, path, "true")` is Xray's JQL function — the
 * "true" includes tests in sub-folders (a module folder holds its tests in
 * sub-folders, so it is required). The "Other" bar uses `issue not in
 * testRepositoryFolderTests(project, repoRoot, "true")` to catch test cases the team
 * executed but that are filed outside the repoRoot tree.
 *
 * WHOLE-TEAM only (worklogAuthor in (<all testers>)): the chart shows the team's
 * distinct executed/passed per module, matching the team's own single-window JQL.
 *
 * Cost: (modules + 1 Other) × 2 counts × ranges, run 8-way concurrently — e.g.
 * (19 + 1) × 2 × 6 = 240 maxResults=0 counts per build. The same lightweight profile
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

/** Base window JQL: the team's distinct Test Cases with a worklog in [from, to]. */
function windowJql(cfg, jiraUsers, fromIso, toIso) {
  return `project = ${cfg.project} AND issuetype = ${jqlStr(cfg.issueType)}` +
    ` AND worklogAuthor in (${jiraUsers})` +
    ` AND worklogDate > "${prevDay(fromIso)}" AND worklogDate <= "${toIso}"`;
}
/** Xray Test-Repository membership clause for one module folder (incl. sub-folders). */
const inFolder = (cfg, moduleName) =>
  `issue in testRepositoryFolderTests(${jqlStr(cfg.project)}, ${jqlStr(`${cfg.repoRoot}/${moduleName}`)}, "true")`;
/** Everything executed but NOT under the repoRoot tree (the "Other" bar). */
const notInRoot = (cfg) =>
  `issue not in testRepositoryFolderTests(${jqlStr(cfg.project)}, ${jqlStr(cfg.repoRoot)}, "true")`;

const OTHER = '__other__'; // internal bucket sentinel for the "Other" bar

/**
 * @param ranges  computeRanges(now) — the selectable windows.
 * @returns { label, ranges: { <rangeKey> -> { key, label, from, to,
 *          features: [{ name, executed, passed, isOther? }], totalExecuted, totalPassed } } }
 *          features are the modules with executed > 0, sorted executed desc, with the
 *          "Other" bar (if any) appended last.
 */
async function collectFeatureExec(ranges) {
  const cfg = FEATURE_EXEC;
  const jira = new JiraClient(loadJira());
  const jiraUsers = MEMBERS.map((m) => m.jira).join(', ');
  const rangeList = Object.values(ranges);
  const buckets = [...cfg.modules, OTHER];

  // One flat task list across every (range × bucket × {executed, passed}) so all
  // counts run at the shared 8-way limit — nothing is reusable across ranges.
  const tasks = [];
  rangeList.forEach((range, ri) => {
    const base = windowJql(cfg, jiraUsers, range.from, range.to);
    buckets.forEach((bucket, bi) => {
      const scope = bucket === OTHER ? notInRoot(cfg) : inFolder(cfg, bucket);
      const execJql = `${base} AND ${scope}`;
      tasks.push({ ri, bi, kind: 'executed', jql: execJql });
      tasks.push({ ri, bi, kind: 'passed', jql: `${execJql} AND ${cfg.passedJql}` });
    });
  });
  const results = await mapLimit(tasks, 8, async (t) => ({ ...t, n: await jira.count(t.jql) }));

  const out = {};
  rangeList.forEach((range, ri) => {
    // slot per bucket index -> { executed, passed }
    const slots = buckets.map(() => ({ executed: 0, passed: 0 }));
    for (const r of results) {
      if (r.ri !== ri) continue;
      slots[r.bi][r.kind] = r.n;
    }
    const mods = cfg.modules
      .map((name, i) => ({ name, executed: slots[i].executed, passed: slots[i].passed }))
      .filter((f) => f.executed > 0)
      .sort((a, b) => b.executed - a.executed);
    const otherSlot = slots[buckets.indexOf(OTHER)];
    const features = otherSlot.executed > 0
      ? [...mods, { name: cfg.otherLabel, executed: otherSlot.executed, passed: otherSlot.passed, isOther: true }]
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

module.exports = { collectFeatureExec, windowJql, inFolder, notInRoot, prevDay };
