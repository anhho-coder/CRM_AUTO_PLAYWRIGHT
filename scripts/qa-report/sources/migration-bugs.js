'use strict';
/**
 * Source: Jira — "Migration bugs - linked to the features' sub-tasks" (the Manual test
 * page · "By range" · table). The bugs linked to ANY sub-task of the Odoo-migration
 * features listed in Jira CRM-13900, per feature × status.
 *
 * A POINT-IN-TIME snapshot (NOT ranged): it reflects the current Jira state each build.
 *
 *   1. ONE scan of every sub-task with its issue links:  parent in (<feature keys>)
 *   2. per feature, the sub-tasks carrying ≥ 1 linked issue of a config `bugTypes` type
 *   3. per feature, the bug JQL regenerated from that live list —
 *        issuetype in (<bugTypes>) AND (issue in linkedIssues(<sub-task>) OR …)
 *      and every cell COUNTED by that JQL + its column clause (cheap maxResults=0
 *      counts), so the number on the page is exactly what its JQL returns in Jira.
 *
 * This Jira has no ScriptRunner (`issueFunction in linkedIssuesOf(...)` is rejected), so
 * no static JQL can follow a sub-task that gets its first bug later — step 1 regenerates
 * the JQL every build instead. The scan's own distinct bug count is kept next to the
 * counted one; a disagreement is surfaced on the page (`scanMismatch`), never hidden.
 *
 * Cost: 1-2 scan pages + (features + 1) × columns counts — e.g. 7 × 4 = 28 per build.
 * Verified vs live Jira 2026-10-28: 121 sub-tasks, 88 bugs (Setup New CRM 59 /
 * Subscriptions 24 / Discounts 5; Open 8 · Resolved 29 · Closed 51).
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MIGRATION_BUGS, JIRA_CONCURRENCY } = require('../config');

// A JQL string literal: wrap in double quotes, escape any embedded quote.
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

/** The bugs linked to any of `subtaskKeys`, or null when there are none to link from. */
function bugJql(c, subtaskKeys) {
  if (!subtaskKeys.length) return null;
  const types = c.bugTypes.map(jqlStr).join(', ');
  return `issuetype in (${types}) AND (${subtaskKeys.map((k) => `issue in linkedIssues(${k})`).join(' OR ')})`;
}
/** One cell's JQL: the feature's bug JQL + the column's status clause. */
function cellJql(base, col) {
  if (!base) return null;
  return col.clause ? `${base} AND ${col.clause}` : base;
}

async function collectMigrationBugs(c = MIGRATION_BUGS) {
  const jira = new JiraClient(loadJira());
  const featureKeys = c.features.map((f) => f.key);
  const scanJql = `parent in (${featureKeys.join(', ')}) ORDER BY key`;
  const subtasks = await jira.searchAll(scanJql, ['parent', 'issuelinks']);
  // The features always have sub-tasks: an empty scan means Jira answered anonymously (a
  // rejected token searches as "anonymous" and returns 0, not an error). Fail the unit so
  // the page flags the source instead of showing a table of zeros as if it were real.
  if (!subtasks.length) throw new Error(`sub-task scan returned 0 issues (${scanJql}) — Jira auth/permission?`);

  const bugTypes = new Set(c.bugTypes);
  const per = new Map(featureKeys.map((k) => [k, { subtasks: [], withBugs: [], bugKeys: new Set() }]));
  for (const st of subtasks) {
    const f = per.get(st.fields.parent && st.fields.parent.key);
    if (!f) continue;
    f.subtasks.push(st.key);
    const bugs = (st.fields.issuelinks || [])
      .map((l) => l.outwardIssue || l.inwardIssue)
      .filter((o) => o && o.fields && o.fields.issuetype && bugTypes.has(o.fields.issuetype.name));
    if (!bugs.length) continue;
    f.withBugs.push(st.key);
    for (const b of bugs) f.bugKeys.add(b.key);
  }

  const rows = c.features.map((ft, i) => {
    const f = per.get(ft.key);
    return {
      no: i + 1, key: ft.key, name: ft.name,
      subtasks: f.subtasks.length,
      subtasksJql: `parent = ${ft.key}`,
      withBugs: f.withBugs,
      withBugsJql: f.withBugs.length ? `key in (${f.withBugs.join(', ')})` : null,
      bugJql: bugJql(c, f.withBugs),
      scanBugs: f.bugKeys.size,
      cells: {}, jql: {},
    };
  });
  const allWithBugs = rows.flatMap((r) => r.withBugs);
  const allBugKeys = new Set([...per.values()].flatMap((f) => [...f.bugKeys]));
  const total = {
    subtasks: subtasks.length,
    subtasksJql: `parent in (${featureKeys.join(', ')})`,
    withBugs: allWithBugs,
    withBugsJql: allWithBugs.length ? `key in (${allWithBugs.join(', ')})` : null,
    bugJql: bugJql(c, allWithBugs),
    scanBugs: allBugKeys.size,
    cells: {}, jql: {},
  };

  // Count every cell by its own JQL; a feature with no bug-carrying sub-task is 0 with no JQL.
  const targets = [...rows, total];
  const tasks = [];
  for (const t of targets) {
    for (const col of c.columns) {
      const jql = cellJql(t.bugJql, col);
      t.jql[col.key] = jql;
      if (jql) tasks.push({ t, col, jql });
      else t.cells[col.key] = 0;
    }
  }
  const counts = await mapLimit(tasks, JIRA_CONCURRENCY, (x) => jira.count(x.jql));
  tasks.forEach((x, i) => { x.t.cells[x.col.key] = counts[i]; });

  // The status columns should partition the Bug column; report any remainder (a bug in
  // a status none of them names), and any gap between the scan and the counted total.
  const statusKeys = c.columns.filter((col) => col.clause).map((col) => col.key);
  for (const t of targets) {
    t.otherStatus = (t.cells.bugs || 0) - statusKeys.reduce((s, k) => s + (t.cells[k] || 0), 0);
    t.scanMismatch = t.scanBugs !== (t.cells.bugs || 0);
  }

  return {
    key: c.key,
    label: c.label,
    sourceTicket: c.sourceTicket,
    asOf: new Date().toISOString(),
    scanJql,
    bugTypes: c.bugTypes,
    columns: c.columns,
    rows,
    total,
  };
}

module.exports = { collectMigrationBugs, bugJql, cellJql };
