'use strict';
/**
 * Source: Jira — "Automation coverage" (Automation test page · Quarterly KPI · donut).
 *
 * A POINT-IN-TIME snapshot (NOT ranged, NOT per-quarter): what share of the whole CRM
 * Post-EA Test Case repository is in automation scope, as of each build. Two cheap
 * whole-repo count() queries (maxResults=0), run concurrently:
 *
 *   totalTcs      = project = CRM AND issuetype = "Post-EA - Test Case"
 *   automationTcs = totalTcs AND status != "closed" AND "Automation scope" = Yes
 *
 * Derived: remaining = totalTcs − automationTcs (the non-automation test cases), and
 * coverage = automationTcs ÷ totalTcs (one decimal). Rendered as a donut (Automation
 * vs Remaining) with the coverage % in the centre. Stored under data.automationCoverage.
 *
 * Verified vs live Jira 2026-07-27: total 3972, automation 784 → 19.7% coverage.
 */
const { JiraClient } = require('../lib/jira');
const { loadJira, AUTOMATION_COVERAGE } = require('../config');

async function collectAutomationCoverage() {
  const jira = new JiraClient(loadJira());
  const c = AUTOMATION_COVERAGE;
  const [totalTcs, automationTcs] = await Promise.all([
    jira.count(c.totalJql),
    jira.count(c.automationJql),
  ]);
  const remaining = Math.max(0, totalTcs - automationTcs);
  const coverage = totalTcs > 0 ? Math.round((automationTcs / totalTcs) * 1000) / 10 : 0;
  return {
    label: c.label,
    kpiName: c.kpiName,
    totalTcs,
    automationTcs,
    remaining,
    coverage,           // %, one decimal (automationTcs ÷ totalTcs)
    totalJql: c.totalJql,
    automationJql: c.automationJql,
  };
}

module.exports = { collectAutomationCoverage };
