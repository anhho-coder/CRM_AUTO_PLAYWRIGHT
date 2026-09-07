'use strict';
/**
 * Source: Jira — "Classified Support ticket" (the Support ticket page).
 *
 * The team's quarterly QA review of every CRM support ticket created in a range,
 * split into the 5 categories the review reports on (A…E). Reproduces the review
 * spreadsheet's JQL column VERBATIM — one query per category, plus one for the
 * grand total:
 *
 *   A  Check data & explain logic
 *      project = CRM AND issuetype = "Post-EA - Support Ticket - Investigation"
 *        AND created >= <from> AND created <= <to>
 *   B–E  (Request / Leaked Defect / New Improvement / New Feature Request)
 *      project = CRM AND issuetype = "Post-EA - Support Ticket"
 *        AND "Support Ticket Type" = "<value>" AND created >= <from> AND created <= <to>
 *   TOTAL
 *      project = CRM AND issuetype in ("Post-EA - Support Ticket",
 *        "Post-EA - Support Ticket - Investigation") AND created >= <from> AND created <= <to>
 *
 * Category A carries NO "Support Ticket Type" value — the Investigation issue TYPE
 * is what identifies it (hence the table's "Expected Support Ticket Type (or the
 * issue type, where the group carries no field value)" column).
 *
 * The two `bucket`s ('ticket' / 'investigation') are NOT extra queries: each
 * category's JQL already pins exactly one issue type, so the table's "Support
 * Ticket" / "Investigation" columns are the same count placed in the bucket the
 * category belongs to (matching the review sheet, where each row has a 0 in the
 * other column).
 *
 * TOTAL is its own query rather than Σ(A…E), so the two can disagree — and when
 * they do, the difference is real: "Post-EA - Support Ticket" issues whose
 * "Support Ticket Type" is empty or holds a value outside the 5 categories. That
 * residual is surfaced as an extra "Not classified" row (only when > 0) so the
 * rows always add up to the TOTAL row. (Q3-2026 residual = 0; Q2-2026 = 11.)
 *
 * Whole-project scope — deliberately NO `reporter in (<team>)` clause: this counts
 * the tickets the CRM team RECEIVED, not the ones a QA opened. That is why the
 * total here (Q3-2026: 136) is larger than the "Support Ticket created" card on the
 * same page (98), which is by-reporter and drops junk resolutions.
 *
 * Cost: ranges × (categories + 1) cheap maxResults=0 counts — 7 × 6 = 42 per build,
 * run 8-way concurrent inside JiraClient's retry/backoff. Same profile as
 * sources/bug-by-priority.js. Plus one FULL search per range for each category
 * flagged `listIssues` (currently C — Bug leakage): 7 more, over sets in the tens,
 * feeding the "Leakage defects list" table at the bottom of the page.
 */
const { JiraClient, mapLimit } = require('../lib/jira');
const { loadJira, SUPPORT_CLASSIFICATION } = require('../config');

// A JQL string literal: wrap in double quotes, escape any embedded quote.
const jqlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

// --- Issue-list support (the categories flagged `listIssues`) -----------------
// Jira's priority NAMES carry the rank ("Blocker (P1)" … ), but sorting on the name
// would order them alphabetically (Blocker < Critical < Major < Minor happens to be
// right, Trivial/Undefined are not). Sort on the numeric id Jira gives each priority
// instead — 1 = P1 … — with unknown/absent priorities pushed to the end.
const priorityRank = (p) => {
  const n = Number(p && p.id);
  return Number.isFinite(n) ? n : 99;
};

/** Flatten one Jira issue to the fields the table renders. */
function shapeIssue(it) {
  const f = (it && it.fields) || {};
  return {
    key: it.key,
    summary: f.summary || '',
    priority: (f.priority && f.priority.name) || '—',
    priorityRank: priorityRank(f.priority),
    reporter: (f.reporter && f.reporter.displayName) || '—',
    assignee: (f.assignee && f.assignee.displayName) || 'Unassigned',
    status: (f.status && f.status.name) || '—',
    resolution: (f.resolution && f.resolution.name) || null, // null => still unresolved
    // Server-tz day, the same slice the created-by-day metrics use, so a ticket shows
    // the date it was counted on rather than a viewer-local shift.
    created: String(f.created || '').slice(0, 10),
  };
}

/** Highest priority first, then newest first. */
const byPriorityThenNewest = (a, b) =>
  a.priorityRank - b.priorityRank || String(b.created).localeCompare(String(a.created));

/**
 * The date window every query shares. The lower bound is a bare date (= 00:00, already
 * inclusive); the upper bound is pinned to `23:59` because a BARE upper date means
 * 00:00 of that day in JQL — so `created <= <today>` silently drops everything created
 * during today. The review sheet never hit this (its window ends on the quarter's LAST
 * day, a future date), but this page's This-week/month/quarter/year windows all end
 * TODAY. Verified on live Jira 2026-08-27: bare bound = 135, day-inclusive = 136 (the
 * missing one is CRM-12425, created 05:47 that morning).
 */
const window = (from, to) => `created >= ${from} AND created <= "${to} 23:59"`;

/** One category's JQL: the issue type it lives in (+ its "Support Ticket Type" value). */
function categoryJql(cfg, cat, from, to) {
  const type = cat.bucket === 'investigation' ? cfg.investigationType : cfg.ticketType;
  const clauses = [`project = ${jqlStr(cfg.project)}`, `issuetype = ${jqlStr(type)}`];
  if (cat.typeValue) clauses.push(`${jqlStr(cfg.typeField)} = ${jqlStr(cat.typeValue)}`);
  clauses.push(window(from, to));
  return clauses.join(' AND ');
}

/** The grand-total JQL: every support ticket of either type created in the window. */
function totalJql(cfg, from, to) {
  const types = [cfg.ticketType, cfg.investigationType].map(jqlStr).join(', ');
  return `project = ${jqlStr(cfg.project)} AND issuetype in (${types}) AND ${window(from, to)}`;
}

/** The residual JQL (the "Not classified" row): a support ticket outside A…E. */
function residualJql(cfg, from, to) {
  const values = cfg.categories.filter((c) => c.typeValue).map((c) => jqlStr(c.typeValue)).join(', ');
  return `project = ${jqlStr(cfg.project)} AND issuetype = ${jqlStr(cfg.ticketType)}` +
    ` AND (${jqlStr(cfg.typeField)} is EMPTY OR ${jqlStr(cfg.typeField)} not in (${values}))` +
    ` AND ${window(from, to)}`;
}

/**
 * @param ranges  computeRanges(now) — the selectable windows.
 * @returns { label, project, typeField, ticketType, investigationType,
 *            leakageList,
 *            ranges: { <rangeKey> -> { key, label, from, to,
 *              rows: [{ code, label, expected, bucket, tint, color, note, tickets, jql }],
 *              residual: { code, label, expected, bucket, tickets, jql } | null,
 *              leakageCode, leakageJql,
 *              leakageIssues: [{ key, summary, priority, priorityRank, reporter,
 *                                assignee, status, resolution, created }] | null,
 *              total: { tickets, ticketCount, investigationCount, jql } } } }
 */
async function collectSupportClassification(ranges) {
  const cfg = SUPPORT_CLASSIFICATION;
  const jira = new JiraClient(loadJira());
  const rangeList = Object.values(ranges);

  // One flat task list across every (range × category) plus a per-range grand total,
  // run at the shared 8-way limit. mapLimit preserves order.
  const tasks = [];
  rangeList.forEach((range, ri) => {
    cfg.categories.forEach((cat, ci) => {
      tasks.push({ ri, ci, jql: categoryJql(cfg, cat, range.from, range.to) });
    });
    tasks.push({ ri, ci: 'total', jql: totalJql(cfg, range.from, range.to) });
  });
  const results = await mapLimit(tasks, 8, async (t) => ({ ...t, n: await jira.count(t.jql) }));

  // The categories flagged `listIssues` (currently C — Bug leakage) ALSO need the
  // matching issues, not just the count: that number feeds the team KPI, so the page
  // lists the tickets behind it. One searchAll per (range × flagged category) — the
  // sets are small (single/low-double digits), so this stays far cheaper than the
  // count sweep above. A failure here must NOT lose the counts, so each fetch is
  // wrapped: on error the range simply carries no list and the table renders empty.
  const listCats = cfg.categories.filter((c) => c.listIssues);
  const listTasks = [];
  rangeList.forEach((range, ri) => listCats.forEach((cat) => {
    listTasks.push({ ri, code: cat.code, jql: categoryJql(cfg, cat, range.from, range.to) });
  }));
  const listResults = await mapLimit(listTasks, 8, async (t) => {
    try {
      const issues = await jira.searchAll(t.jql, ['summary', 'priority', 'reporter', 'assignee', 'created', 'status', 'resolution']);
      return { ...t, issues: issues.map(shapeIssue).sort(byPriorityThenNewest) };
    } catch (err) {
      console.error(`[support-classification] issue list for ${t.code} failed: ${err.message || err}`);
      return { ...t, issues: null };
    }
  });

  const out = {};
  rangeList.forEach((range, ri) => {
    const counts = cfg.categories.map(() => 0);
    let total = 0;
    for (const r of results) {
      if (r.ri !== ri) continue;
      if (r.ci === 'total') total = r.n;
      else counts[r.ci] = r.n;
    }
    const rows = cfg.categories.map((cat, ci) => ({
      code: cat.code,
      label: cat.label,
      expected: cat.expected,
      bucket: cat.bucket,
      tint: cat.tint,
      color: cat.color,               // pie slice colour (saturated twin of `tint`)
      note: cat.note,                 // the team's definition of the group (shown in the Note column)
      tickets: counts[ci],
      jql: categoryJql(cfg, cat, range.from, range.to),
    }));
    // Anything the 5 categories miss (empty / out-of-list "Support Ticket Type"), so
    // the rows always reconcile with the independently-counted TOTAL row.
    const gap = Math.max(0, total - counts.reduce((a, b) => a + b, 0));
    const residual = gap > 0 ? {
      code: '—',
      label: cfg.residualLabel,
      expected: cfg.residualExpected,
      bucket: 'ticket',
      tint: cfg.residualTint,
      color: cfg.residualColor,
      note: cfg.residualNote,
      tickets: gap,
      jql: residualJql(cfg, range.from, range.to),
    } : null;
    const all = residual ? [...rows, residual] : rows;
    // The per-ticket list behind the flagged category (C — Bug leakage). `null` means
    // the fetch failed for this range; `[]` means the range genuinely has no leaks.
    const listed = listResults.find((r) => r.ri === ri);
    out[range.key] = {
      key: range.key, label: range.label, from: range.from, to: range.to,
      rows,
      residual,
      leakageCode: listCats.length ? listCats[0].code : null,
      leakageJql: listed ? listed.jql : null,
      leakageIssues: listed ? listed.issues : null,
      total: {
        tickets: total,
        ticketCount: all.filter((r) => r.bucket === 'ticket').reduce((a, r) => a + r.tickets, 0),
        investigationCount: all.filter((r) => r.bucket === 'investigation').reduce((a, r) => a + r.tickets, 0),
        jql: totalJql(cfg, range.from, range.to),
        note: cfg.totalNote,
      },
    };
  });

  return {
    label: cfg.label,
    project: cfg.project,
    typeField: cfg.typeField,
    ticketType: cfg.ticketType,
    investigationType: cfg.investigationType,
    rulesSource: cfg.rulesSource,
    leakageList: cfg.leakageList || null, // labels/notes for the bottom-of-page table
    ranges: out,
  };
}

module.exports = { collectSupportClassification, categoryJql, totalJql, residualJql };
