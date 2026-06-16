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

// --- CRM QA team members (hr.employee ids on the Nakivo01 database) -----------
// Discovered via hr.employee (department 26 "Quality Assurance Team").
const MEMBERS = [
  { name: 'Anh Ho', employeeId: 1051 },
  { name: 'Thuat Phung', employeeId: 1333 },
];

// --- KPI metrics sourced from nakivo.kpi.database ----------------------------
// `kpiName` must match the KPI Name column exactly. The order here is the order
// they render on the page (Bugs - Valid reported leads, per request).
const KPI_METRICS = [
  { key: 'bugsValidReported', kpiName: 'Bugs - Valid reported', label: 'Bugs reported (valid)' },
  { key: 'bugsFixVerified', kpiName: 'Bugs - Fix verified', label: 'Bugs fix-verified' },
  { key: 'testCasesNewCreated', kpiName: 'Test Cases - New Created', label: 'Test cases created' },
];

const MODEL_KPI = 'nakivo.kpi.database';

// Selectable ranges (last week / this month / quarter / year) are defined in lib/ranges.js.

module.exports = {
  REPO_ROOT, OUT_DIR, DATA_DIR, HISTORY_DIR,
  loadOdoo, MEMBERS, KPI_METRICS, MODEL_KPI,
};
