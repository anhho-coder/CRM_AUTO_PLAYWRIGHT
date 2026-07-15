'use strict';
/**
 * Central configuration for the CRM QA weekly report.
 *
 * Connection secrets come from environment variables (Jenkins credentials in CI).
 * For local dev, if the env vars are not set we fall back to the mcp-odoo
 * credentials file (~/.claude/mcp-odoo/credentials.json) so a tester can run
 * `npm run qa-report` without exporting anything.
 *
 * Everything that depends on the team's Jira/Odoo setup (employee ids, KPI
 * names, window length) is declared here so the source modules stay generic.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// scripts/qa-report -> repo root
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'qa-report-out'); // published by Jenkins (HTML Publisher)
const DATA_DIR = path.join(OUT_DIR, 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'history');

// --- Odoo connection (source of the daily KPI database) ----------------------
// CI: set ODOO_URL / ODOO_DB / ODOO_USER / ODOO_PASSWORD (Jenkins credentials).
// Local dev fallback: read mcp-odoo credentials.json ("default" host = prod).
function loadOdoo() {
  const env = process.env;
  if (env.ODOO_URL && env.ODOO_DB && env.ODOO_USER && env.ODOO_PASSWORD) {
    return {
      url: env.ODOO_URL,
      db: env.ODOO_DB,
      user: env.ODOO_USER,
      password: env.ODOO_PASSWORD,
      verifySsl: env.ODOO_VERIFY_SSL !== 'false',
    };
  }
  const devPath = env.ODOO_CREDENTIALS_JSON ||
    path.join(os.homedir(), '.claude', 'mcp-odoo', 'credentials.json');
  try {
    const hosts = JSON.parse(fs.readFileSync(devPath, 'utf8')).hosts;
    const h = hosts[env.ODOO_ALIAS || 'default'];
    return { url: h.url, db: h.db, user: h.login, password: h.password, verifySsl: h.verify_ssl !== false };
  } catch (_) {
    throw new Error(
      'Odoo credentials not found. Set ODOO_URL / ODOO_DB / ODOO_USER / ODOO_PASSWORD ' +
      '(see scripts/qa-report/README.md).'
    );
  }
}

// --- Jira connection (source of the Worklog allocation page) -----------------
// CI: set JIRA_URL + JIRA_TOKEN (Personal Access Token, preferred) or
// JIRA_URL + JIRA_USER + JIRA_PASSWORD (Basic auth). Local dev fallback: read
// ~/.claude/mcp-jira/credentials.json if present (same idea as the Odoo loader).
function loadJira() {
  const env = process.env;
  const url = env.JIRA_URL || 'http://jira.nakivo.com';
  if (env.JIRA_TOKEN) return { url, token: env.JIRA_TOKEN };
  if (env.JIRA_USER && env.JIRA_PASSWORD) return { url, user: env.JIRA_USER, password: env.JIRA_PASSWORD };
  const devPath = env.JIRA_CREDENTIALS_JSON ||
    path.join(os.homedir(), '.claude', 'mcp-jira', 'credentials.json');
  try {
    const c = JSON.parse(fs.readFileSync(devPath, 'utf8'));
    // Accept a few common shapes: {url, token} | {url, user, password} | {hosts:{default:{...}}}
    const h = (c.hosts && (c.hosts[env.JIRA_ALIAS || 'default'])) || c;
    if (h.token || h.pat || h.personal_access_token)
      return { url: h.url || url, token: h.token || h.pat || h.personal_access_token };
    if ((h.user || h.login || h.username) && h.password)
      return { url: h.url || url, user: h.user || h.login || h.username, password: h.password };
  } catch (_) { /* fall through */ }
  throw new Error(
    'Jira credentials not found. Set JIRA_TOKEN (a Personal Access Token) or ' +
    'JIRA_USER / JIRA_PASSWORD (see scripts/qa-report/README.md).'
  );
}

// The Jira base URL WITHOUT needing credentials — used to build browse links (the
// STUCK issue list) that render.js embeds in the page. Same default as loadJira()
// but never throws, so the links work even in a Jira-less render.
function jiraBaseUrl() {
  return (process.env.JIRA_URL || 'http://jira.nakivo.com').replace(/\/+$/, '');
}

// --- CRM QA team members ------------------------------------------------------
// employeeId -> the Nakivo01 Odoo hr.employee (KPI source); jira -> the Jira
// username (worklog author). Names must match across both so the two pages agree.
// `workload` = the tester's capacity factor, used ONLY by the "Executed test cases
// per day" per-man-day denominator (man-days = worklog hours ÷ 8 × workload — see
// JIRA_DERIVED_METRICS). Anh Ho is the QA Manager (25% on test execution); Thuat
// Phung 50%. It does not affect any other metric.
const MEMBERS = [
  { name: 'Anh Ho', employeeId: 1051, jira: 'anh.ho', workload: 0.25 },
  { name: 'Thuat Phung', employeeId: 1333, jira: 'thuat.phung', workload: 0.5 },
];

// --- KPI metrics sourced from nakivo.kpi.database ----------------------------
// `kpiName` must match the KPI Name column exactly. The order here is the order
// they render on the page (Bugs - Valid reported leads, per request).
const KPI_METRICS = [
  { key: 'bugsValidReported', kpiName: 'Bugs - Valid reported', label: 'Bugs reported (valid)' },
  { key: 'bugsFixVerified', kpiName: 'Bugs - Fix verified', label: 'Bugs fix-verified' },
  { key: 'testCasesNewCreated', kpiName: 'Test Cases - New Created', label: 'Test cases created' },
];

const MODEL_KPI = 'nakivo.kpi.database';            // daily KPI rows (range view)
const MODEL_QUARTERLY = 'nakivo.quarterly.kpi.detail'; // per-quarter Actual/Forecast/Goal
const KPI_GROUP = 'CRM Team';                        // the team's `group` value in both models

// --- Jira-sourced metrics (Metrics Report page) ------------------------------
// Metrics that do NOT live in nakivo.kpi.database are computed from Jira instead.
// Each is counted per DAY by the issue's `created` date and split per tester by
// `reporter`, then aggregated into the same selectable ranges as the KPI metrics
// (see sources/support-ticket.js + collect.js), so the page renders both the same
// way. They appear in the "By range" view; add `quarterly: true` to also show an
// actual-only card in the "Quarterly KPI" view (no Odoo Forecast/Goal exists for
// a Jira metric, so there are no QoQ/QvG/QvQY boxes).
//
// sources/support-ticket.js assembles the JQL from the pieces below:
//   type in (<types>)
//   [AND labels = <each of `labels`>]                       (optional)
//   [AND (resolution is EMPTY OR resolution not in (<excludeResolutions>))] (optional)
//   AND createdDate >= "<range start>" AND reporter in (<team Jira users>)
// `labels` (optional) AND-s a `labels = <label>` clause per entry. The
// resolution clause is added only when `excludeResolutions` is set — it keeps every
// UNRESOLVED ticket (any active status: Open / In Progress / Reopened / …) plus
// resolved ones whose resolution isn't junk, dropping only the "junk" resolutions
// (Duplicate / Not a bug / Won't Do / Won't Fix). `resolution is EMPTY` is used (not
// `status = open`, which would miss In Progress/Reopened) because `resolution not in`
// alone is FALSE for unresolved issues. `kpiName` is just the subtitle on the card.
// `quarterly: true` (optional) ALSO surfaces the metric in the "Quarterly KPI"
// view as an actual-only card (a bar per quarter + current-quarter per-tester
// split, no QoQ/QvG/QvQY boxes). Without it the metric shows in "By range" only.
const JIRA_METRICS = [
  {
    key: 'supportTicketCreated',
    label: 'Support Ticket created',
    kpiName: 'Jira · Post-EA Support Tickets created (by reporter)',
    types: ['Post-EA - Support Ticket - Investigation', 'Post-EA - Support Ticket'],
    excludeResolutions: ['Duplicate', 'Not a bug', "Won't Do", "Won't Fix"],
    quarterly: true, // also show in the Quarterly KPI view (actual-only card)
  },
  {
    // Bugs the team found via automated tests: Bug + Bug [Maintenance] carrying the
    // QA-CRM_Automation label, counted by `created` day + reporter. No resolution
    // filter (every such bug counts, matching the team's JQL).
    key: 'bugsFoundByAutomation',
    label: 'Bugs found by automation test',
    kpiName: 'Jira · Bugs (incl. Maintenance) labelled QA-CRM_Automation (by reporter)',
    types: ['Bug', 'Bug [Maintenance]'],
    labels: ['QA-CRM_Automation'],
    quarterly: true, // also show an actual-only card in the Automation Quarterly view
  },
  {
    // Leaked defects (defect leakage): CRM issues that got a "Leaked defect priority"
    // set (QA marks a ticket as a leak during verification), P1-P3 only. Counted by
    // `created` day + reporter, same card as "Support Ticket created" (big number +
    // By tester bars + stacked Trend). The team's saved filter (verbatim) is:
    //   project = CRM AND "Leaked defect priority" is not EMPTY
    //     AND createdDate >= <from> AND createdDate <= <to>
    //     AND priority in ("Blocker (P1)", "Critical (P2)", "Major (P3)")
    // No `types`/`reporter` clause — the leak field is CRM-QA-specific, so almost every
    // hit is reported by the QA team; the rare non-team reporter (a dev/PM who filed the
    // underlying ticket) is kept (so the headline total matches the saved filter exactly)
    // and grouped into an "Other" By-tester/Trend bar via `splitOtherReporters` — see
    // sources/support-ticket.js. `yearBucket: 'quarter'` makes the This year / Last year
    // Trend show one column PER QUARTER (Q1..Q4) instead of per month (see lib/ranges.js
    // aggregate() + collect.js) — per request 2026-07-15. "By range" only (no Quarterly card).
    key: 'leakedDefects',
    label: 'Leaked defects',
    kpiName: 'Jira · CRM leaked defects — "Leaked defect priority" set, P1-P3 (by reporter)',
    project: 'CRM',
    leakField: 'Leaked defect priority',
    priorities: ['Blocker (P1)', 'Critical (P2)', 'Major (P3)'],
    splitOtherReporters: true, // count ALL reporters; non-team ones grouped into an "Other" bar
    yearBucket: 'quarter',     // This year / Last year Trend uses quarterly columns, not monthly
    quarterly: true,           // also show an actual-only card in the Quarterly KPI view (per-quarter bars + BY TESTER table)
    quarterlyFillEmpty: true,  // keep a contiguous 5-quarter x-axis — quarters with 0 leaks still show (this field only went live Q4-2025)
    quarterlyNote: 'The x-axis keeps 5 consecutive quarters ending at the current one. The "Leaked defect priority" field has only been in use since Q4-2025, so earlier quarters read 0 (0 leaks = good). The highlighted (teal) column is the current quarter; the By tester table follows it. Each new quarter, the axis slides forward.',
  },
];

// --- Jira worklog-based metrics (Metrics Report page, BOTH views) ------------
// Counted from WORKLOGS, not `created`: for each day × tester, the count of
// DISTINCT issues of `issueType` that tester logged work on that day (the team's
// JQL — see sources/testexec.js). The per-day counts are summed into the same
// selectable ranges as the KPI metrics AND summed per quarter for an actual-only
// Quarterly chart (Jira has no Forecast/Goal, so no QoQ/QvG/QvQY boxes). Kept in
// a separate list from JIRA_METRICS because the counting (worklog per day) and
// the source module (testexec.js) differ from the `created`-by-reporter metrics.
const JIRA_WORKLOG_METRICS = [
  {
    key: 'manualTcExecuted',
    label: 'Manual Test cases executed',
    issueType: 'Post-EA - Test Case',
    kpiName: 'Jira · Post-EA - Test Case worklogs (per day)',
  },
];

// --- Jira UNIQUE (single-window) worklog metrics (Metrics Report, By range) ---
// The DEDUPLICATED counterpart to JIRA_WORKLOG_METRICS. Where "Manual Test cases
// executed" counts per DAY and SUMS (a test case worked on N days counts N times),
// these count the DISTINCT test cases a tester logged work on across the WHOLE
// range with ONE window query per (range × tester) — so a test case counts ONCE no
// matter how many days it was touched. Because a distinct-over-range count is NOT
// additive, they are collected directly per range (sources/unique-testexec.js), not
// through the generic daily-sum aggregate() path, and they appear in the "By range"
// view only (no additive Quarterly card). The single-window JQL per tester T is:
//   [project = <project> AND] issuetype = "<issueType>"
//     AND worklogAuthor in (T) AND worklogDate > "<from − 1 day>" AND worklogDate <= "<to>"
// `project` (optional) adds a `project = <project>` clause — the team's sample JQL
// scopes it to CRM (the issue type is effectively CRM-only regardless). `issueType`
// is the test-case type; `kpiName` is just the card subtitle.
const JIRA_UNIQUE_METRICS = [
  {
    key: 'uniqueTcExecuted',
    label: 'Unique Executed Test Cases',
    issueType: 'Post-EA - Test Case',
    project: 'CRM',
    kpiName: 'Jira · Distinct Post-EA - Test Cases with a worklog in the range (per tester)',
    // Card-level ℹ️ hover (render.js's rangeSection shows it when `note` is set)
    // explaining why the headline total (SUM of per-tester distinct counts) can exceed
    // a single combined `worklogAuthor in (team)` query — added per request 2026-07-03.
    noteTitle: 'How this total is counted',
    note: [
      "The big number is the SUM of each tester's DISTINCT executed test cases (one per-tester window query, by worklogAuthor).",
      'A test case executed by BOTH testers is counted once for each tester, so this team total can be higher than a single combined query (worklogAuthor in (all testers)), which lists each test case only once.',
      'The gap therefore equals the test cases executed by more than one tester — counted once per tester here, but once overall in a single combined query.',
    ],
  },
];

// --- Jira DERIVED metrics (computed from another metric, no direct fetch) -----
// "Executed test cases per day": a RATE built from the DISTINCT executed count
// (its `numeratorKey` metric in JIRA_UNIQUE_METRICS) divided by two denominators,
// following Slide #9 ("PRODUCTIVITY — Executed test cases per day") of the QA
// Quarterly Review deck:
//   • Per calendar-day = executed ÷ working days. Working days = Mon–Fri dates in
//     the range MINUS Vietnamese public holidays that fall on a working day (the
//     dashboard already tracks these — sources/holidays.js; e.g. Q2 = 65 − 3 = 62).
//   • Per man-day = executed ÷ test-case-execution man-days ("pure execution
//     speed"), where per tester T:
//         man-days(T) = (test-case worklog hours by T ÷ WORK_HOURS_PER_DAY) × workload(T)
//     `workload` is T's capacity factor on MEMBERS (Thuat 0.5, Anh 0.25). The
//     effort source is worklog HOURS on `issueType` issues (the same issues the
//     numerator counts) — so the denominator mirrors the numerator's scope.
// The numerator is REUSED from the already-collected `numeratorKey` metric (no
// extra distinct-count queries); only the man-day denominator needs a new fetch
// (test-case worklog hours per day × tester — sources/executed-per-day.js). A rate
// is not additive, so it is collected per range ("By range" view only). The
// canonical total/byEmployee/series carry the PER-CALENDAR-DAY rate (so generic
// code degrades gracefully); the PER-MAN-DAY rate rides alongside in `manDay` and a
// per-tester `byTester` breakdown, both surfaced by render.js's custom per-day card.
const WORK_HOURS_PER_DAY = 8;
const JIRA_DERIVED_METRICS = [
  {
    key: 'executedTcPerDay',
    label: 'Executed test cases per day',
    numeratorKey: 'uniqueTcExecuted', // distinct executed count from JIRA_UNIQUE_METRICS
    issueType: 'Post-EA - Test Case', // execution-effort worklog source (man-day denominator)
    project: 'CRM',
    perDay: true,                     // render.js uses the two-column per-day card
    kpiName: 'Jira · distinct executed ÷ working days (per calendar-day) and ÷ execution man-days (per man-day)',
  },
];

// --- Jira FRD / I2L delivery metric (FRD/Spec Review/I2L page, slide-style) ---
// A DISTINCT-over-range count of the spec-review / I2L issues the team logged work
// on, split into "done" vs "in progress" — the whole-team version of the QA
// Quarterly Review deck's "FRD / I2L — Q2 done & in progress" slide (Slide #15).
// Rendered as slide-style stat cards (Worked / Done / In progress), NOT the standard
// by-tester+trend card. Per (range × metric) the collector runs ONE window count
// (like JIRA_UNIQUE_METRICS — a distinct-over-range count is not additive) for each
// of two JQLs, then derives the third:
//   worked     = [labels = <each label> AND] worklogAuthor in (<team>)
//                  AND worklogDate > "<from − 1 day>" AND worklogDate <= "<to>"
//   done       = worked issues whose statusCategory = <doneStatusCategory>  (Resolved / Closed)
//   inProgress = worked − done                                       (Open / In Progress / Reopened)
//   estimates  = worked AND (assignee NOT in <team> OR a comment matches an estimateMarker)
//   breakdown  = the worked issues classified by the QA activity in their summary
//                (FRD / Spec review / I2L) — the slide's "N FRD · N Spec review · N I2L" line
// (worklogDate > "from − 1 day" == worklogDate >= "from", written as the team's
// sample JQL: `... worklogDate > 2026-03-31 AND worklogDate <= 2026-06-30`.)
// `labels` (one or more) scopes the issue set; the team's sample uses the single
// label QA-FRD/I2L/Spec and NO project filter (the label spans NJM + CRM), so none
// is applied. `estimateMarkers` are comment substrings that mark a QA estimate table
// ("estimation" alone misses tables that don't spell the word — e.g. CRM-8285's
// "Manday (hour)"/"TOTAL TIME" table — so both are matched). `kpiName` is just the
// card subtitle. Whole-team only (a spec worked on by both testers counts once) — no
// per-tester split, since the per-tester distinct counts don't sum to the team union.
// See sources/frd.js for the worked-set fetch + activity classification.
const JIRA_FRD_METRICS = [
  {
    key: 'frdI2lProgress',
    label: 'FRD / I2L — done & in progress (whole team)',
    kpiName: 'Jira · Distinct QA-FRD/I2L/Spec issues with a worklog in the range (worked / done / in progress / estimates)',
    labels: ['QA-FRD/I2L/Spec'],
    doneStatusCategory: 'Done',            // statusCategory counted as "done"; everything else = "in progress"
    estimateMarkers: ['estimation', 'Manday'], // comment substrings that mark a QA estimate table
  },
];

// --- Jira STATUS-TRANSITION metrics (Metrics Report page, BOTH views) ---------
// Counted by a status TRANSITION, per day × tester, by running the team's exact
// per-day JQL once per (day, tester) as a cheap maxResults=0 count — the same
// approach as JIRA_WORKLOG_METRICS, but the JQL is a status change rather than a
// worklog (see sources/automation-tc.js). For one day D and one tester the JQL is:
//   <scopeJql> AND status changed to (<changedToStatus>)
//     during ("<D> 00:00", "<D> 23:59") BY <tester>
// Running the team's own JQL per day guarantees the page matches what they see in
// Jira exactly (no changelog re-derivation needed). The per-day counts are summed
// into the selectable ranges AND per quarter for the Quarterly view, exactly like
// JIRA_WORKLOG_METRICS. Kept in a separate list because the JQL shape and source
// module differ.
//
// "Automation Test cases created": test cases with `"Automation scope" = yes`
// counted on the day their status changed to Resolved, by the tester who resolved
// them. `scopeJql` is just the automation-scope filter — the earlier
// `issue in TestRepositoryFolderTests(CRM, "CRM automation", "true")` test-repository
// clause was dropped per request 2026-06-18 (it under-counted: automation-scoped
// test cases resolved but not yet filed in that folder were missed). The field is
// effectively CRM-only — verified all matches are project CRM, issuetype "Post-EA -
// Test Case" — so no project filter is needed. `kpiName` is the metric card subtitle.
const JIRA_TRANSITION_METRICS = [
  {
    key: 'automationTcCreated',
    label: 'Automation Test cases created',
    kpiName: 'Jira · Automation-scope test cases resolved per day (by tester)',
    scopeJql: '"Automation scope" = yes',
    changedToStatus: 'resolved',
    quarterly: true, // also show an actual-only card in the Automation Quarterly view
  },
];

// --- Jira SPLIT metrics (Metrics Report · Automation test page, "By range") ---
// A metric that PARTITIONS an already-collected status-transition daily series at a
// cutoff date into two halves, rendered as slide-style stat cards. It performs NO
// extra Jira queries: it reuses the daily series of `sourceKey` (a
// JIRA_TRANSITION_METRICS entry that collect.js already fetched) and, for each range,
// sums the days BEFORE the cutoff (legacy) vs ON/AFTER it (the split half). Because
// the split is range-relative (the cutoff may fall inside, before, or after a range),
// it is computed directly per range from the daily series — see
// sources/automation-split.js. "By range" view only (no Quarterly card).
//
// "Test cases automated — with vs without Claude" = Slide #16 of the QA Quarterly
// Review deck. `claudeCutoff` is the team's Claude-adoption date — the first Claude
// co-authored commit in CRM_AUTO_PLAYWRIGHT (2026-06-05) — so an automation-scope test
// case whose status changed to Resolved ON/AFTER that day counts as automated WITH
// Claude, and one resolved before it as legacy (without Claude). `sourceKey` points at
// the transition metric whose daily series is partitioned, so "Total" always equals
// that card ("Automation Test cases created") for the same range.
const JIRA_SPLIT_METRICS = [
  {
    key: 'automationTcClaudeSplit',
    label: 'Test cases automated — with vs without Claude',
    kpiName: 'Jira · Automation-scope TCs resolved, split at Claude adoption (2026-06-05)',
    split: true,                       // render.js → slide-style stat cards (splitRangeSection)
    sourceKey: 'automationTcCreated',  // the JIRA_TRANSITION_METRICS daily series to partition
    claudeCutoff: '2026-06-05',        // resolved >= cutoff → WITH Claude; < cutoff → legacy (without)
  },
];

// --- Jira LIST metrics (QA CRM · Jira · Dashboard page) -----------------------
// A metric whose value is a LIST of issues, not a count aggregated per day. The
// "QA CRM - Jira - Dashboard" page (the leftmost tab / default landing) renders
// each entry as a headline total + per-assignee split + a table of the matching
// issues. Collected directly per range in sources/stuck.js (only for the two
// quarter ranges the page offers) because the value is a point-in-time snapshot,
// not an additive daily series.
//
// "STUCK — Dev done, QA not tested": issues Dev has finished (currently in the
// `currentStatus` = Resolved) that QA has not yet verified/advanced — assigned to
// the team, EXCLUDING the team's own test/support issue types. The team's exact
// JQL (assembled per range in sources/stuck.js) is:
//   assignee in (<team Jira users>) AND status = <currentStatus>
//     AND issuetype not in (<excludeIssueTypes>)
//     AND status changed to (<changedToStatus>) during ("<from> 00:00","<to> 23:59")
// The `status = Resolved` clause is point-in-time (the issue must STILL be Resolved
// now, i.e. still waiting on QA); the `during` window bounds WHEN it became resolved
// to the selected quarter. "Days stuck" (computed in the source) = today minus the
// issue's resolution date. `kpiName` is the card subtitle.
const JIRA_LIST_METRICS = [
  {
    key: 'stuckDevDoneQaNotTested',
    label: 'STUCK — Dev done, QA not tested',
    kpiName: 'Jira · Resolved issues still awaiting QA verification (by assignee)',
    currentStatus: 'Resolved',
    excludeIssueTypes: ['Post-EA - Test Case', 'Post-EA - Support Ticket', 'Post-EA - Support Ticket - Investigation'],
    changedToStatus: 'resolved',
  },
];

// --- Jira DEFECT-QUALITY metric (QA CRM · Jira · Dashboard page, slide-style) --
// Slide #10 of the QA Quarterly Review deck ("QUALITY — Defect quality — created in
// Q2 / Leaked defects list"), the CRM-team version. Rendered on the Jira Dashboard
// landing page (its OWN full 6-range selector, independent of the STUCK metric's
// quarter-only one) as slide-style stat cards — Bugs created / Leaked defects /
// Leakage rate — plus a "Leaked defects list" table. Two of the team's saved JQLs
// per range, assembled in sources/defect-quality.js:
//   Bugs created (per tester, by reporter):
//     type in (<bugTypes>) AND created > "<from − 1 day>" AND created <= "<to>"
//       AND reporter = T
//       AND (status in (<bugStatuses>) OR resolution changed to (<bugResolvedTransitions>))
//   Leaked defects (whole team):
//     labels in (<leakLabel>) AND "<leakField>" is not EMPTY
//       AND createdDate >= "<from>" AND createdDate <= "<to>" AND priority in (<leakPriorities>)
// Both JQLs are reproduced VERBATIM from the team's samples (Anh's decision
// 2026-07-02: match the saved filters literally, INCLUDING their date-boundary
// behaviour — `created > from−1day` lets in the day before `from` and, as a datetime
// vs bare-date comparison, drops `to`'s daytime — rather than "correcting" them).
// Verified live for Last quarter (Q2 2026): bugs created 170 (Anh Ho 30 / Thuat Phung
// 140), leaked 4 (all P1) → 2.4% leakage. Whole-team (bugs split by reporter; leaked
// is a whole-team classification, not per-reporter). `kpiName` is the card subtitle.
const JIRA_DEFECT_METRICS = [
  {
    key: 'defectQualityCreated',
    label: 'Defect quality — created',
    kpiName: 'Jira · Bugs created (by reporter) vs leaked defects (QA-Ticket_verification, P1–P3)',
    // "Bugs created" definition (the team's saved filter):
    bugTypes: ['Bug [uncategorised]', 'Bug [Maintenance]', 'Bug', 'Sub-Bug', 'Post-EA - Support Ticket'],
    bugStatuses: ['Open', 'Reopened', 'In Progress'],
    bugResolvedTransitions: ['Fixed', 'Done', "Won't fix", 'Unresolved', "Won't Do"],
    // "Defect leakage" definition (the team's saved filter):
    leakLabel: 'QA-Ticket_verification',
    leakField: 'Leaked defect priority', // custom field; `is not EMPTY` marks a classified leak
    leakPriorities: ['Blocker (P1)', 'Critical (P2)', 'Major (P3)'],
  },
];

// --- "Executed Test Cases per main feature" (Manual test page, "By range") ----
// A grouped bar chart (Executed vs Passed) per Xray Test Repository module. Like
// JIRA_UNIQUE_METRICS it counts DISTINCT test cases PER TESTER and SUMS across the team
// (a test case executed by two testers counts once per tester, i.e. twice — NOT the
// per-day sum used by "Manual Test cases executed"), so the totals match the per-person
// figures and the "Unique Executed Test Cases" card (Σ per-tester distinct = 802 in Q2),
// NOT the whole-team distinct union (782). For each range × module × tester it runs cheap
// maxResults=0 counts (see sources/feature-exec.js):
//   EXECUTED: project = <project> AND issuetype = "<issueType>"
//             AND worklogAuthor in (<one tester>) AND worklogDate > "<from − 1 day>" AND worklogDate <= "<to>"
//             AND issue in testRepositoryFolderTests("<project>", "<repoRoot>/<module>", "true")
//   PASSED / FAILED / ABORTED:  EXECUTED  +  " AND " + passedJql / failedJql / abortedJql
//   (each of the above is run once per tester and the resulting counts summed)
// The "Other" bar = the range grand total (same window, no folder clause) minus Σ of the
// feature bars, computed per outcome — the test cases executed but in no configured bar.
// Rendered ONLY on the Manual test page, in the "By range" view, reacting to the
// same range buttons as the other metrics. Stored under data.featureExec (its grouped
// bar chart doesn't fit the standard by-tester/trend metric card).
const FEATURE_EXEC = {
  key: 'featureExec',
  label: 'Executed Test Cases per main feature',
  project: 'CRM',
  issueType: 'Post-EA - Test Case',
  // Passed / Failed / Aborted come from the Xray test-run outcome field TestRunStatus
  // (the real execution result), NOT the Jira workflow status — confirmed with the team
  // 2026-07-03. These three partition the executed set (a TC with a worklog but no run
  // yet — TestRunStatus TODO/EXECUTING — counts in Executed but in none of the three, so
  // Passed+Failed+Aborted can be ≤ Executed). The Q2 whole-team DISTINCT partition was
  // PASS 736 + FAIL 33 + ABORTED 13 = 782 = Executed; with per-tester summing the Executed
  // total is 802 (the 20 test cases both testers ran are counted twice) and the outcome
  // bars grow likewise. Each outcome is AND-ed onto the per-bar EXECUTED query.
  passedJql: 'TestRunStatus = PASS',
  failedJql: 'TestRunStatus = FAIL',
  abortedJql: 'TestRunStatus in (aborted)',
  repoRoot: 'CRM test',   // top Test Repository folder that holds the module folders
  otherLabel: 'Other',    // catch-all bar: TCs executed but outside `repoRoot`
  // The bars (Xray Test Repository features). A plain STRING is shorthand for the
  // single folder "<repoRoot>/<name>". An OBJECT { name, paths:[…] } lets a bar span
  // several FULL repository paths — e.g. "CRM module" counts both its manual folder
  // and its automation folder, and "Migration Odoo 12CE to 12CC" is its own top-level
  // folder (not under repoRoot). "Other" = grand total − Σ bars, so a test case in no
  // configured bar still shows up. A bar with 0 executed in the range is not drawn.
  // Edit this list if the repository folders change.
  modules: [
    'Leave module', 'Sales Report + Performance', 'Lead Merging', 'Contact module',
    'Leads Assigment', 'Investments module', 'Report module',
    // "CRM module" spans its manual folder AND its automation folder, so automation
    // test cases executed for the CRM module count in the SAME bar (per request 2026-07-03).
    { name: 'CRM module', paths: ['CRM test/CRM module', 'CRM automation/CRM module'] },
    'R&E module',
    'License module', 'Helpdesk module', 'Exhibition module', 'KPI module', 'Sales module',
    'Payroll module', 'Approval Module', 'Webshop', 'Replica DB VM', 'Security',
    // Own top-level Test Repository folder (not under repoRoot) → its own bar, pulled
    // out of "Other" (per request 2026-07-03).
    { name: 'Migration Odoo 12CE to 12CC', paths: ['Migration Odoo 12CE to 12CC'] },
  ],
};

// --- "Valid bug reported - by Priority of bug" (Manual test page, "By range") -
// A table of the VALID bugs the QA team REPORTED (created within the selected
// range), broken down BY PRIORITY (rows) across three columns (the team's saved
// filters). Whole-team, by `reporter` ∈ MEMBERS. Rendered ONLY on the Manual test
// page, "By range" view, reacting to the SAME range buttons as the other metrics.
// Stored under data.bugByPriority (its priority-table shape doesn't fit the standard
// by-tester/trend metric card, so — like FEATURE_EXEC — it is its own data blob).
//
// Base window (shared by every cell): the team's "valid bug reported" scope —
//   issuetype in (<types>) AND createdDate >= "<from>" AND createdDate <= "<to>"
//     AND reporter in (<MEMBERS.jira>)
// Each COLUMN AND-s its own status/resolution clause onto the base; each PRIORITY
// row additionally AND-s `AND priority = "<priority>"`. The bottom "Total" row is
// the column query with NO priority filter (so the priority rows sum to it).
// Verified live 2026-07-14 for Last quarter (Q2 2026): Total column 161 =
// 62 P1 + 23 P2 + 74 P3 + 2 (P4+P5). Edit `priorityRows`/`columns` if the team's
// filter changes.
const BUG_BY_PRIORITY = {
  key: 'bugByPriority',
  label: 'Valid bug reported - by Priority of bug',
  // The bug issue types (the team's saved "Create Valid bugs" set — same as the QA
  // Ranking metric and JIRA_DEFECT_METRICS.bugTypes).
  types: ['Bug [uncategorised]', 'Bug [Maintenance]', 'Bug', 'Sub-Bug', 'Post-EA - Support Ticket'],
  // Priority rows, highest first. Each row maps a display `label` to one OR MORE exact
  // Jira priority names (`values`) — a cell counts `priority in (<values>)`, so several
  // priorities can share one row (P4 + P5 grouped per request 2026-07-14). A row with 0
  // in every column is still shown, so the table shape is stable across ranges.
  priorityRows: [
    { label: 'Blocker (P1)', values: ['Blocker (P1)'] },
    { label: 'Critical (P2)', values: ['Critical (P2)'] },
    { label: 'Major (P3)', values: ['Major (P3)'] },
    { label: 'Minor (P4) & Trivial (P5)', values: ['Minor (P4)', 'Trivial (P5)'] },
  ],
  // The table columns. `clause` is a JQL status/resolution predicate AND-ed onto the
  // base window (backticks so both " and ' pass through verbatim). Reproduced from the
  // team's saved filters. "Total" is every valid reported bug (still-open OR resolved);
  // "Backlog" the still-open subset; "Resolved - waiting for verification" those in the
  // Resolved status awaiting QA verification.
  columns: [
    { key: 'total', label: 'Total',
      clause: `(status in (Open, Reopened, "In Progress") OR resolution changed to (Fixed, Done, "Won't fix", Unresolved, "Won't Do"))` },
    { key: 'backlog', label: 'Backlog',
      clause: `status in (Open, Reopened, "In Progress")` },
    { key: 'resolved', label: 'Resolved - waiting for verification',
      clause: `status in ("resolved")` },
  ],
};

// --- Report sections (the "Manual test" / "Automation test" tabs) ------------
// The 3rd tab, "Worklog allocation", is the separate worklog page. Each section
// lists its metric keys IN DISPLAY ORDER; render.js builds one page per section
// (with the Quarterly KPI + By range sub-views) showing ONLY these metrics.
// Metrics with no calc yet — support tickets verified, automation TCs executed,
// automation run frequency — are simply not listed, so they don't render until
// added here (and wired in collect.js).
// The "QA CRM - Jira - Dashboard" section (kind: 'list') is the LEFTMOST tab and
// the default landing page (index.html); render.js gives it its own list-style
// layout (headline + issue table) rather than the count-card layout the other
// sections use, and offers only the This/Last quarter ranges.
const SECTIONS = [
  {
    key: 'jiraDashboard',
    label: 'QA CRM - Jira - Dashboard',
    kind: 'list',
    metricKeys: ['stuckDevDoneQaNotTested'],
  },
  {
    // Slide #15 of the QA Quarterly Review deck — "FRD / I2L — Q2 done & in progress",
    // whole-team. Sits to the LEFT of "Manual test" (right of the dashboard landing).
    // kind: 'frd' → render.js gives it the slide-style stat-card layout (Worked /
    // Done / In progress), range-selectable, defaulting to the previous complete
    // quarter (the "Q2" snapshot). Not a landing page. See JIRA_FRD_METRICS.
    key: 'frd',
    label: 'FRD/Spec Review/I2L',
    kind: 'frd',
    defaultRange: 'lastQuarter',
    metricKeys: ['frdI2lProgress'],
  },
  {
    key: 'manual',
    label: 'Manual test',
    metricKeys: ['testCasesNewCreated', 'manualTcExecuted', 'uniqueTcExecuted', 'executedTcPerDay', 'bugsValidReported', 'bugsFixVerified', 'supportTicketCreated', 'leakedDefects'],
  },
  {
    key: 'automation',
    label: 'Automation test',
    metricKeys: ['automationTcCreated', 'automationTcClaudeSplit', 'bugsFoundByAutomation'],
  },
];

// --- Worklog allocation page (Jira worklogs) ---------------------------------
// Each column is one of:
//   - a Jira-label bucket: `match` is the exact Jira issue label that routes a
//     worklog into it. Matching is FIRST-WINS in this order, so an issue
//     carrying several labels lands in the earliest matching column.
//   - `kind: 'other'` — the catch-all ("Non-CRM Project"): any worklog whose
//     issue carries none of the matched labels above is summed here.
//   - `kind: 'leave'` — NOT from Jira. Hours come from Odoo `hr.leave` (FTO +
//     Sick Leaves), bucketed by the leave's start date. See sources/leave.js
//     and LEAVE_* below.
//   - `kind: 'total'` ("All Jira logged time") — the per-tester grand total of
//     the Jira buckets only (the 'leave' column is NOT counted in it).
//
// To re-categorise, edit this list. Labels currently NOT mapped (e.g.
// QA-FRD/I2L/Spec, QA-Odoo12-Migration, QA-Claude, QA-CRM-Support-NBR,
// QA-CRM-BaaS) fall into "Non-CRM Project" until a column is added for them.
// Incremental fetch: each build re-reads only the last WORKLOG_REFRESH_DAYS days
// of Jira worklogs and merges them with the cached older days (qa-report-out/
// data/worklog-cache.json), so "This quarter"/"This year" stay complete without
// re-fetching the whole year every build. A full-year fetch is used to seed the
// cache (first build / new node / new year / missing cache). The window also
// catches back-dated worklogs; edits/deletions OLDER than the window aren't
// re-synced until the next full seed.
const WORKLOG_REFRESH_DAYS = 35;

const WORKLOG_COLUMNS = [
  { key: 'featureVerif', label: 'QA-Feature_verification', match: 'QA-Feature_verification' },
  { key: 'ticketVerif', label: 'QA-Ticket_verification', match: 'QA-Ticket_verification' },
  { key: 'admin', label: 'QA-Admin', match: 'QA-Admin' },
  { key: 'regression', label: 'QA-Regression_test', match: 'QA-Regression_test' },
  { key: 'smoke', label: 'QA-Smoke_Test', match: 'QA-Smoke_Test' },
  { key: 'featureMaint', label: 'QA-Feature_maintenance', match: 'QA-Feature_maintenance' },
  { key: 'automation', label: 'QA-CRM_Automation', match: 'QA-CRM_Automation' },
  { key: 'frdSpec', label: 'QA-FRD/I2L/Spec', match: 'QA-FRD/I2L/Spec' },
  { key: 'supportNbr', label: 'QA-CRM-Support-NBR', match: 'QA-CRM-Support-NBR' },
  { key: 'odoo12Migration', label: 'QA-Odoo12-Migration', match: 'QA-Odoo12-Migration' },
  { key: 'crmBaas', label: 'QA-CRM-BaaS', match: 'QA-CRM-BaaS' },
  { key: 'claude', label: 'QA-Claude', match: 'QA-Claude' },
  { key: 'ftoSlHoliday', label: 'QA-FTO/SL/Holiday', kind: 'leave' },
  { key: 'nonCrm', label: 'Non-CRM Project', kind: 'other' },
  { key: 'allLogged', label: 'All Jira logged time', kind: 'total' },
];

// Jira worklogs on issues carrying ANY of these labels are dropped entirely — not
// bucketed into a column, not counted in "All Jira logged time". QA-FTO/SL leave
// time is sourced from Odoo hr.leave, so counting its Jira worklogs too would
// double-count leave.
const WORKLOG_EXCLUDE_LABELS = ['QA-FTO/SL'];

// Comment-based reclassification (matches the team's spreadsheet "2. Worklog"):
// a worklog whose COMMENT contains one of these substrings (case-insensitive) is
// counted in the given column INSTEAD of its label column. Checked in order
// (first match wins) BEFORE the label rule below. Rationale: Smoke/Regression
// testing is logged under the QA-Feature_verification label and told apart by the
// worklog comment — so QA-Feature_verification effectively = its label total minus
// the Smoke/Regression comments carved out here (the spreadsheet's "B - E - F").
const WORKLOG_COMMENT_RULES = [
  { contains: 'Smoke', column: 'smoke' },
  { contains: 'Regression', column: 'regression' },
];

// Bucketing rule: a worklog's column is decided by (1) WORKLOG_COMMENT_RULES on its
// comment, else (2) the issue's labels. For labels, only those that match a column
// above ("in the report") are considered; any other label on the issue is ignored.
// If the issue matches:
//   0 columns -> "Non-CRM Project";  1 column -> that column;
//   2+ columns -> the EARLIER column in this list wins (first-match priority).
// Confirmed multi-label resolutions (2026-06-17): Feature_verification+Ticket
// _verification -> Feature; Feature_verification+Regression_test -> Feature. Both
// already fall out of the column order, so no extra priority table is needed;
// reorder a column to change its priority.

// --- Leave hours (Odoo hr.leave) for the 'leave' column ----------------------
// FTO + Sick Leave hours are read from hr.leave (NOT Jira) and bucketed by the
// leave's start date. Exact field names are verified against the live model in
// sources/leave.js; values below are the business filter.
const MODEL_LEAVE = 'hr.leave';
const LEAVE_TYPES = ['FTO', 'Sick Leaves']; // hr.leave leave-type (holiday_status_id) names to include

// --- Public holidays (the "Holiday" part of the FTO/SL/Holiday column) -------
// Vietnam has no "Holiday" leave type in Odoo and Nager.Date (the no-key API)
// omits Tet/Hung Kings, so we read the public Google "Vietnamese Holidays" ICS
// (no key) and bucket each public-holiday WORKING day (Mon-Fri) as
// HOLIDAY_WORKDAY_HOURS per tester. The Google feed is noisy, so we keep only
// events that match HOLIDAY_INCLUDE and don't match HOLIDAY_EXCLUDE; sources/
// holidays.js also drops "...New Year's Eve" (an int'l observance, not a day off)
// while keeping the Vietnamese (Tet) eve. See sources/holidays.js.
const HOLIDAY_ICS_URL =
  'https://calendar.google.com/calendar/ical/en.vietnamese%23holiday%40group.v.calendar.google.com/public/basic.ics';
const HOLIDAY_WORKDAY_HOURS = 8; // hours credited per public holiday that lands on a working day
const HOLIDAY_INCLUDE = [        // an event counts as a day off only if its name matches one of these
  'New Year', 'Tet', 'Tết', 'Lunar New Year', 'Hung Kings', 'Giỗ Tổ',
  'Reunification', 'Liberation', 'Labor', 'Labour', 'Independence', 'National Day', 'Quốc khánh',
];
const HOLIDAY_EXCLUDE = ['Working day', 'Easter', 'Christmas', 'Culture']; // never count these (make-up workdays / non-days-off)

// Selectable ranges (last week / this month / quarter / year) are defined in lib/ranges.js.

module.exports = {
  REPO_ROOT, OUT_DIR, DATA_DIR, HISTORY_DIR,
  loadOdoo, loadJira, jiraBaseUrl, MEMBERS, KPI_METRICS, JIRA_METRICS, JIRA_WORKLOG_METRICS, JIRA_UNIQUE_METRICS, JIRA_FRD_METRICS, JIRA_TRANSITION_METRICS, JIRA_SPLIT_METRICS, JIRA_DERIVED_METRICS, JIRA_LIST_METRICS, JIRA_DEFECT_METRICS, FEATURE_EXEC, BUG_BY_PRIORITY, WORK_HOURS_PER_DAY, SECTIONS,
  MODEL_KPI, MODEL_QUARTERLY, KPI_GROUP,
  WORKLOG_COLUMNS, WORKLOG_REFRESH_DAYS, WORKLOG_EXCLUDE_LABELS, WORKLOG_COMMENT_RULES,
  MODEL_LEAVE, LEAVE_TYPES,
  HOLIDAY_ICS_URL, HOLIDAY_WORKDAY_HOURS, HOLIDAY_INCLUDE, HOLIDAY_EXCLUDE,
};
