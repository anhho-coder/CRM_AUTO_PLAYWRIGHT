'use strict';
/**
 * Source: Jira — "Valid bug reported - by Priority of bug" (the Manual test page).
 * A table of the VALID bugs the QA team REPORTED (created within the range), broken
 * down BY PRIORITY (rows) across three columns — Total / Backlog / Resolved-waiting-
 * for-verification (the team's saved filters). Whole-team, by `reporter` ∈ MEMBERS.
 *
 * Base window (shared by every cell):
 *   issuetype in (<types>) AND createdDate >= "<from>" AND createdDate <= "<to>"
 *     AND reporter in (<MEMBERS.jira>)
 * Each COLUMN AND-s its own status/resolution clause (config.BUG_BY_PRIORITY.columns);
 * each PRIORITY row additionally AND-s `AND priority = "<priority>"`. The bottom
 * "Total" row is the column query with NO priority filter — so the priority rows sum
 * to it (verified Q2 2026: Total column 161 = 62 P1 + 23 P2 + 74 P3 + 1 P4 + 1 P5).
 *
 * Every cell is a cheap maxResults=0 count. Cost: ranges × columns × (priorities + 1)
 * — e.g. 6 × 3 × (5 + 1) = 108 counts per build, run 8-way concurrent inside
 * JiraClient's retry/backoff. Same lightweight count-only profile as feature-exec.js.
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, MEMBERS, BUG_BY_PRIORITY } = require('../config');

// A JQL string literal: wrap in double quotes, escape any embedded quote.
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

/** The base window: the team's "valid bug reported" scope over [from, to]. */
function baseJql(cfg, from, to) {
  const types = cfg.types.map(jqlStr).join(', ');
  const reporters = MEMBERS.map((m) => m.jira).join(', ');
  return `issuetype in (${types})` +
    ` AND createdDate >= ${jqlStr(from)} AND createdDate <= ${jqlStr(to)}` +
    ` AND reporter in (${reporters})`;
}
/** One cell's JQL: base + the column clause (+ the priority filter for a priority row).
 *  `values` is a priority row's exact Jira priority names (one or more), or null for the
 *  no-priority Total row. */
function cellJql(cfg, col, from, to, values) {
  let jql = `${baseJql(cfg, from, to)} AND ${col.clause}`;
  if (values && values.length) jql += ` AND priority in (${values.map(jqlStr).join(', ')})`;
  return jql;
}

/**
 * @param ranges  computeRanges(now) — the selectable windows.
 * @returns { label, ranges: { <rangeKey> -> { key, label, from, to,
 *          rows: [{ priority, cells: { <colKey>: count } }],  // priority = the row LABEL
 *          totalRow: { <colKey>: count } } } }
 */
async function collectBugByPriority(ranges) {
  const cfg = BUG_BY_PRIORITY;
  const jira = new JiraClient(loadJira());
  const rangeList = Object.values(ranges);

  // One flat task list across every (range × column × priority) plus a per-(range ×
  // column) grand total (pi === 'total', no priority filter), run at the shared 8-way
  // limit.
  const tasks = [];
  rangeList.forEach((range, ri) => {
    cfg.columns.forEach((col, ci) => {
      cfg.priorityRows.forEach((prow, pi) => {
        tasks.push({ ri, ci, pi, jql: cellJql(cfg, col, range.from, range.to, prow.values) });
      });
      tasks.push({ ri, ci, pi: 'total', jql: cellJql(cfg, col, range.from, range.to, null) });
    });
  });
  const results = await mapLimit(tasks, 8, async (t) => ({ ...t, n: await jira.count(t.jql) }));

  const out = {};
  rangeList.forEach((range, ri) => {
    const rows = cfg.priorityRows.map(() => ({}));
    const totalRow = {};
    cfg.columns.forEach((col) => {
      totalRow[col.key] = 0;
      cfg.priorityRows.forEach((_p, pi) => { rows[pi][col.key] = 0; });
    });
    for (const r of results) {
      if (r.ri !== ri) continue;
      const colKey = cfg.columns[r.ci].key;
      if (r.pi === 'total') totalRow[colKey] = r.n;
      else rows[r.pi][colKey] = r.n;
    }
    out[range.key] = {
      key: range.key, label: range.label, from: range.from, to: range.to,
      rows: cfg.priorityRows.map((prow, pi) => ({ priority: prow.label, cells: rows[pi] })),
      totalRow,
    };
  });
  return { label: cfg.label, ranges: out };
}

module.exports = { collectBugByPriority, baseJql, cellJql };
