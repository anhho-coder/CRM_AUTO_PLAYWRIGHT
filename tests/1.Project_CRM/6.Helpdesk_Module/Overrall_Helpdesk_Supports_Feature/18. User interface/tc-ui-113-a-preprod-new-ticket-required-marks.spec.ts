import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ================================================================================================
 *  TC-UI-113_A - New ticket form: which fields are marked required - side A: Odoo 12 pre-production (baseline "as today")
 * ================================================================================================
 * Test Case ID     : TC-UI-113_A   (side B = tc-ui-113-b-support-new-ticket-required-marks.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-03
 * Jira             : CRM-14107 (Xray Test, created 2026-11-03; feature CRM-11859)
 * Requirement      : IS-CRM-UI-0016 + IS-CRM-FUNC-0383 (Confluence 231246777 v9, answer to CRM-13845); this side records what
 *                    Odoo requires today - by design it differs from B (Odoo requires only the Subject)
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted)
 * Data             : READ ONLY - the create form is opened and DISCARDED, nothing is saved
 * Folder           : "18. User interface" = Confluence 231246777 spec area of IS-CRM-UI-0016
 *
 * Summary: Helpdesk > All Tickets > CREATE; the form marks only Subject as required (Odoo's o_required_modifier) - Customer and
 * Customer Email are optional - then the form is discarded.
 * Command to run: npx playwright test tc-ui-113-a-preprod --grep "TC-UI-113_A:" --project=chromium-headless
 *
 *  Source manual TC : written 2026-11-03 from Confluence 231246777 v9 (no CSV row) - Xray CRM-14107; master tab "Helpdesk module", TC ID
 *                     CRM-11859_TC-UI-113_A; 1 step
 *  Source version   : Confluence 231246777 v9 - re-check the master row and the Xray steps before trusting this spec
 *  Pre-conditions   : Role: L1 agent. Agent account.
 *                     1. Logged in as L1 agent Giang Le on pre-production
 *  Steps to reproduce #1
 *    1. Odoo: Helpdesk > All Tickets > CREATE (the new ticket form, edit mode): read which fields Odoo marks required - then DISCARD
 *  Verification - A expected (today)
 *    1. Exactly one field an agent fills is marked required: Subject (name). Customer (partner_id) and Customer Email
 *       (partner_email) are not required. (Kanban State is required too but is the status dot with a default value - not a
 *       field the agent fills - so it is printed, not scored.)
 *
 * Evidence: Pre-condition 1 end shot; Step 1 verify shot (Subject, Customer, Customer Email outlined); end of Steps to
 *           reproduce #1; afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-113_A';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - pre-production (Odoo 12 EE) as L1 agent Giang Le; [INTERNAL check, Call API] Support Team = l1',
  s1: 'Step 1: Odoo: Helpdesk > All Tickets > CREATE (the new ticket form, edit mode): read which fields Odoo marks required - then DISCARD',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const EXPECTED_REQUIRED = ['name'];
const OPTIONAL = ['partner_id', 'partner_email'];
const NOT_SCORED = ['kanban_state'];

/** `difference` = REQUIREMENT #4c conclusion, printed on a FAIL only. */
type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
function listDifference(expected: string[], actual: string[]): string {
  const parts: string[] = [];
  const extra = actual.filter((e) => !expected.includes(e));
  const missing = expected.filter((e) => !actual.includes(e));
  if (actual.length !== expected.length) parts.push(`count ${actual.length}, expected ${expected.length} (${actual.length > expected.length ? '+' : ''}${actual.length - expected.length})`);
  if (extra.length) parts.push(`required but not expected: ${extra.map((e) => `'${e}'`).join(', ')}`);
  if (missing.length) parts.push(`expected but NOT required: ${missing.map((e) => `'${e}'`).join(', ')}`);
  return parts.join('; ') || 'none';
}
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length); const out: string[] = []; let cur = head;
    for (const word of text.split(' ')) { if (cur.length + word.length > width && cur.trim().length > head.trim().length) { out.push(cur.trimEnd()); cur = pad; } cur += `${word} `; }
    out.push(cur.trimEnd()); return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual),
    ...(!c.passed && c.difference ? wrap('   Difference : ', c.difference) : [])];
}
/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}

test.describe(`${TC} - New ticket form required fields on Odoo 12 pre-production`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version (REQUIREMENT #7) ---\n  - Source: Confluence 231246777 v9, IS-CRM-UI-0016 + IS-CRM-FUNC-0383 (no CSV row - nothing to fingerprint)');
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    await new HelpdeskPage(page).discardCreateForm().catch(() => {});
    console.log('  - Read-only case: the create form was discarded - nothing saved');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: New ticket form required fields - A: Odoo 12 marks only the Subject required`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hd = new HelpdeskPage(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl}`);
      try {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(AGENT.username, AGENT.password, CommonUtils.waitTimes.pageLoad);
        await loginPage.dismissLocationPermissionDialog();
        const me = await hd.getMyEmployeeSupportTeam();
        console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
        expect(me.supportTeam, 'the signed-in account is an L1 agent').toBe('l1');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 1 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre1}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await hd.navigateToHelpdesk();
      await hd.openAllTicketsFromMenu();
      await hd.switchToListView().catch(() => {});
      await hd.openCreateTicketForm();
      const marks = await hd.getFormFieldMarks([...EXPECTED_REQUIRED, ...OPTIONAL]);
      for (const m of marks.filter((x) => x.required || OPTIONAL.includes(x.name))) console.log(`  - ${m.name.padEnd(14)} "${m.label}" : ${m.required ? 'REQUIRED' : 'optional'}`);
      const required = marks.filter((m) => m.required && !NOT_SCORED.includes(m.name)).map((m) => m.name);
      const optionalShown = OPTIONAL.map((n) => marks.find((m) => m.name === n));
      console.log(`  Observation (not scored) - required but not an agent-filled field: ${marks.filter((m) => m.required && NOT_SCORED.includes(m.name)).map((m) => m.name).join(', ') || 'none'}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the fields Odoo marks required (agent-filled)', expected: `exactly ${EXPECTED_REQUIRED.join(', ')} (Subject)`, actual: required.join(', ') || '(none)', passed: JSON.stringify(required) === JSON.stringify(EXPECTED_REQUIRED), difference: listDifference(EXPECTED_REQUIRED, required) },
        { what: 'Step 1 Customer and Customer Email are drawn and optional', expected: 'partner_id optional, partner_email optional', actual: optionalShown.map((m, i) => `${OPTIONAL[i]} ${m ? (m.required ? 'REQUIRED' : 'optional') : 'NOT DRAWN'}`).join(', '), passed: optionalShown.every((m) => !!m && !m.required), difference: optionalShown.map((m, i) => (!m ? `'${OPTIONAL[i]}' not drawn` : m.required ? `'${OPTIONAL[i]}' is required` : '')).filter(Boolean).join('; ') },
      ], `${TC} - Step 1 required fields`, [HelpdeskPage.FORM_FIELD], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - create form read');
      await hd.discardCreateForm();
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - only the Subject is required on the new ticket form');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the required fields match today').toEqual([]);
    });
  });
});
