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

// --- CRM QA team members ------------------------------------------------------
// employeeId -> the Nakivo01 Odoo hr.employee (KPI source); jira -> the Jira
// username (worklog author). Names must match across both so the two pages agree.
const MEMBERS = [
  { name: 'Anh Ho', employeeId: 1051, jira: 'anh.ho' },
  { name: 'Thuat Phung', employeeId: 1333, jira: 'thuat.phung' },
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
// "Automation Test cases created": CRM automation test cases (in the Test
// Repository folder "CRM automation" with Automation scope = yes) counted on the
// day their status changed to Resolved, by the tester who resolved them. `scopeJql`
// is the folder + automation-scope filter; `kpiName` is the metric card subtitle.
const JIRA_TRANSITION_METRICS = [
  {
    key: 'automationTcCreated',
    label: 'Automation Test cases created',
    kpiName: 'Jira · CRM automation tests resolved per day (by tester)',
    scopeJql: 'issue in TestRepositoryFolderTests(CRM, "CRM automation", "true") AND "Automation scope" = yes',
    changedToStatus: 'resolved',
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
  loadOdoo, loadJira, MEMBERS, KPI_METRICS, JIRA_METRICS, JIRA_WORKLOG_METRICS, JIRA_TRANSITION_METRICS,
  MODEL_KPI, MODEL_QUARTERLY, KPI_GROUP,
  WORKLOG_COLUMNS, WORKLOG_REFRESH_DAYS, WORKLOG_EXCLUDE_LABELS, WORKLOG_COMMENT_RULES,
  MODEL_LEAVE, LEAVE_TYPES,
  HOLIDAY_ICS_URL, HOLIDAY_WORKDAY_HOURS, HOLIDAY_INCLUDE, HOLIDAY_EXCLUDE,
};
