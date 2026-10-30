import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-UI-043_B - All Tickets landing list and columns - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-UI-043_B   (side B of the A/B row TC-UI-043; side A = tc-ui-043-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; ignoreHTTPSErrors)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; HD Agent Support Level = L1, asserted; users.support_l1_giang_support_mig)
 * Data             : READ ONLY - opening the sidebar All Tickets changes nothing (no filter typed, no cell clicked)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "User interface" = the Spec area (h2)
 *                    of Confluence page 231246777 whose requirement this case verifies - IS-CRM-UI-0014 (automation author's
 *                    mapping; the CSV carries no link)
 * Baseline         : TC-UI-043_A (tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature/User interface/
 *                    tc-ui-043-a-preprod-all-tickets-list-and-columns.spec.ts) - same column list; map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * Sidebar All Tickets must open on 'Open Tickets' with Odoo's columns in Odoo's order, no SLA column, and assignees shown by
 * full name - never the e-mail local part.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-ui-043-b-support --grep "TC-UI-043_B:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 262 = row TC-UI-043 (Ticket screens, lists & search,
 *                   "All Tickets landing list and columns", High, ui, L1 agent, refs E35, UI-048, U44) - 3 steps
 *  Source version : fingerprint 4c87da89ab04d90a of Preconditions + Steps + B expected + Test data; beforeEach
 *                   fails OUT OF SYNC when the row changed.
 *  Pre-conditions (CSV, verbatim: "Agent account in both systems.")
 *    1. Logged in as an agent - L1 agent Giang Le on the Support service
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Odoo: Helpdesk > All Tickets; note the active filter and the list columns in order. - N/A on side B
 *    2. FF: sidebar All Tickets; note the selected view and the column headers in order.
 *    3. FF: read the assignee names in a few rows.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Opens on 'Open Tickets' with the same columns in the same order; no SLA columns (First response, Resolution, SLA);
 *    assignees shown by full name (e.g. 'Drake Le'), never the e-mail local part.
 *
 *  How "the same columns" is compared: Odoo's columns are the A expected list (Subject, Customer, Classification, Created on,
 *  Assigned to, Priority, Stage, Interaction Round, Wrongly escalated to L2 by). Frappe's own words for the same field are
 *  accepted - Created = Created on, Assigned To = Assigned to, Status = Stage - any other difference (a missing, extra or
 *  moved column) is a FAIL. "Opens on 'Open Tickets'": [INTERNAL check, Call API] the view the list opens on (the user's
 *  default HD View) must filter exactly like the 'Open Tickets' preset (NK-VIEW-OPEN-TICKETS); the crumbs are printed.
 *
 * Evidence: Pre-condition 1 end shot; Step 2 verify shots (the view; the header row); Step 3 verify shot (the assignee
 * cells); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-UI-043_B';
const SOURCE_ROW = 'TC-UI-043';
const SOURCE_FINGERPRINT = '4c87da89ab04d90a';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as L1 agent Giang Le; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L1',
  s1: 'Step 1: [N/A on side B - the Odoo list belongs to TC-UI-043_A] Odoo: Helpdesk > All Tickets; note the active filter and the list columns in order.',
  s2: 'Step 2: FF: sidebar All Tickets; note the selected view and the column headers in order. ([INTERNAL check, Call API] the view the list opens on vs the Open Tickets preset)',
  s3: 'Step 3: FF: read the assignee names in a few rows.',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const ODOO_COLUMNS = ['Subject', 'Customer', 'Classification', 'Created on', 'Assigned to', 'Priority', 'Stage', 'Interaction Round', 'Wrongly escalated to L2 by'];
/** Frappe's word for the same Odoo column. */
const SAME_AS: Record<string, string> = { Created: 'Created on', 'Assigned To': 'Assigned to', Status: 'Stage' };
const SLA_WORDS = /first response|resolution|\bsla\b/i;

type Check = { what: string; expected: string; actual: string; passed: boolean };

/** One check as banner lines - what / Expected / Actual, wrapped at word boundaries so no value runs off the image. */
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length);
    const out: string[] = [];
    let cur = head;
    for (const word of text.split(' ')) {
      if (cur.length + word.length > width && cur.trim().length > head.trim().length) {
        out.push(cur.trimEnd());
        cur = pad;
      }
      cur += `${word} `;
    }
    out.push(cur.trimEnd());
    return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual)];
}

/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[] = [], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}

test.describe(`${TC} - All Tickets landing list on the Support service`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - Read-only case: nothing was created or changed - nothing to clean up');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: All Tickets landing list and columns - B: Frappe Helpdesk opens on Open Tickets with Odoo's columns and full-name assignees`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Support service (${baseUrl_support_mig})`);
      console.log(`  - Login : ${AGENT.username} (${AGENT.displayName})`);
      await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
      const agent = await desk.getMyAgentLevel(AGENT.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(agent.level, 'the signed-in agent is an L1 agent').toBe('L1');
    });

    await test.step(STEP.s1, async () => { console.log(`\n--- ${STEP.s1} ---\n  - N/A on side B (TC-UI-043_A)`); });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await desk.openAllTicketsFromSidebar();
      const crumbs = await desk.getHeaderCrumbs();
      const mine = await desk.readMyDefaultTicketView(AGENT.username);
      const preset = await desk.readHdViewFilters('NK-VIEW-OPEN-TICKETS');
      const headers = await desk.getListColumnHeaders();
      const mapped = headers.map((h) => SAME_AS[h] || h);
      const sla = headers.filter((h) => SLA_WORDS.test(h));
      const norm = (f: string) => JSON.stringify(JSON.parse(f || '[]'));
      console.log(`  - Crumbs                 : ${crumbs}`);
      console.log(`  [INTERNAL check, Call API] the list's view ${mine ? mine.name : '(none)'} filters ${mine ? mine.filters : '-'} | Open Tickets preset filters ${preset}`);
      console.log(`  - Column headers in order: ${JSON.stringify(headers)}`);
      await recordChecks(page, testInfo, checks, [
        { what: "Step 2 the list opens on 'Open Tickets'", expected: `the opened view filters like the Open Tickets preset (${preset})`, actual: mine ? `${mine.name}: ${mine.filters} (crumbs "${crumbs}")` : 'no default view', passed: !!mine && norm(mine.filters) === norm(preset) },
      ], `${TC} - Step 2 selected view`, ['header']);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the same columns in the same order as Odoo', expected: `${ODOO_COLUMNS.join(' | ')} (Frappe's Created / Assigned To / Status accepted for Created on / Assigned to / Stage)`, actual: headers.join(' | ') || '(none)', passed: JSON.stringify(mapped) === JSON.stringify(ODOO_COLUMNS) },
        { what: 'Step 2 no SLA columns', expected: 'no First response, Resolution or SLA column', actual: sla.length ? sla.join(', ') : 'none', passed: sla.length === 0 },
      ], `${TC} - Step 2 column headers`, [SupportDeskPageMig.LIST_HEAD]);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const cells = await desk.getListColumnCellTexts('Assigned To', 10);
      const names = cells.map((c) => c.replace(/^[A-Z]\s+/, '').trim()).filter(Boolean);
      const localParts = names.filter((n) => /@|^[a-z0-9]+([._-][a-z0-9]+)+$/.test(n));
      console.log(`  - Assignee cells (first 10 rows): ${JSON.stringify(cells)}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 assignees are shown by full name', expected: 'at least one assignee read; none written as an e-mail or its local part (e.g. "drake.le")', actual: `${names.length} read: ${JSON.stringify(names.slice(0, 6))}${localParts.length ? `; local parts: ${localParts.join(', ')}` : ''}`, passed: names.length > 0 && localParts.length === 0 },
      ], `${TC} - Step 3 assignee names`, ['body']);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('==================== VERIFY ====================');
      checks.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.passed ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.length} of ${checks.length} checks failed: ${failed.map((c) => c.what).join('; ')}` : "OVERALL: PASS - Open Tickets, Odoo's columns in order, no SLA column, full-name assignees");
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(failed.map((c) => c.what), 'the landing list matches').toEqual([]);
    });
  });
});
