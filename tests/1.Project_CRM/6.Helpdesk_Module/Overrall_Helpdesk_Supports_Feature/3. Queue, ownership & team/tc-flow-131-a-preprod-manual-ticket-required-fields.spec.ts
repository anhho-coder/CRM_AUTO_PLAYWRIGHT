import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ================================================================================================
 *  TC-FLOW-131_A - What a ticket created by hand needs - side A: Odoo 12 pre-production (baseline "as today")
 * ================================================================================================
 * Test Case ID     : TC-FLOW-131_A   (side B = tc-flow-131-b-support-manual-ticket-required-fields.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-03
 * Jira             : CRM-14111 (Xray Test, created 2026-11-03; feature CRM-11859)
 * Requirement      : IS-CRM-FUNC-0383 (Confluence 231246777 v9, answer to CRM-13845); this side records "today": Odoo requires
 *                    only the Subject - by design B differs on Step 1 (B must refuse a ticket with no e-mail and no contact)
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted)
 * Data             : per run: three probe tickets (one per step), each ARCHIVED in afterEach (the agent has no delete right on
 *                    helpdesk.ticket); the Customer of Step 3 is an existing company, read only; toggle SKIP_CLEANUP_FLOW131A
 * Folder           : "3. Queue, ownership & team" = Confluence 231246777 spec area of IS-CRM-FUNC-0383
 *
 * Summary: three CREATE + SAVE in the ticket list - Subject only, Subject + Customer Email, Subject + Customer - each is saved;
 * nothing is typed in the description in any of them.
 * Command to run: npx playwright test tc-flow-131-a-preprod --grep "TC-FLOW-131_A:" --project=chromium-headless
 *
 *  Source manual TC : written 2026-11-03 from Confluence 231246777 v9 (no CSV row) - Xray CRM-14111; master tab "Helpdesk module", TC ID
 *                     CRM-11859_TC-FLOW-131_A; 3 steps
 *  Source version   : Confluence 231246777 v9 - re-check the master row and the Xray steps before trusting this spec
 *  Pre-conditions   : Role: L1 agent. Agent account; an existing customer company.
 *                     1. Logged in as L1 agent Giang Le on pre-production
 *                     2. [INTERNAL check, Call API] the company = the newest company with an e-mail behind the newest CS tickets
 *  Steps to reproduce #1 (Helpdesk > All Tickets, list view, CREATE each time)
 *    1. Subject = AUTO-CRM-11859-TC-FLOW-131_A-<runId>-no-requester, Customer = blank, Customer Email = blank; SAVE
 *    2. Subject = AUTO-CRM-11859-TC-FLOW-131_A-<runId>-email-only, Customer Email = customer.<runId>@example.com,
 *       Customer = blank; SAVE
 *    3. Subject = AUTO-CRM-11859-TC-FLOW-131_A-<runId>-customer-only, Customer = the company, Customer Email = not typed; SAVE
 *  Verification - A expected (today)
 *    1. Saved - Odoo requires only the Subject (B must refuse this one: IS-CRM-FUNC-0383).
 *    2. Saved without a description.
 *    3. Saved with the chosen Customer.
 *
 * Evidence: Pre-condition end shot; verify shots Steps 1-3 (the saved form's title); end of Steps to reproduce #1;
 *           afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-FLOW-131_A';
const SKIP_CLEANUP_FLOW131A = false;

const STEP = {
  pre1: 'Pre-condition 1: Agent account - pre-production (Odoo 12 EE) as L1 agent Giang Le; [INTERNAL check, Call API] Support Team = l1',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] the company = the newest company with an e-mail behind the newest Customer Support tickets',
  s1: 'Step 1: Odoo: Helpdesk > All Tickets > CREATE: Subject only (Customer = blank, Customer Email = blank); SAVE',
  s2: 'Step 2: Odoo: Helpdesk > All Tickets > CREATE: Subject and Customer Email (Customer = blank, no description); SAVE',
  s3: 'Step 3: Odoo: Helpdesk > All Tickets > CREATE: Subject and Customer = the company (no e-mail typed, no description); SAVE',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const runId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const DATA = {
  raisedBy: `customer.${runId}@example.com`,
  s1Subject: `AUTO-CRM-11859-TC-FLOW-131_A-${runId}-no-requester`,
  s2Subject: `AUTO-CRM-11859-TC-FLOW-131_A-${runId}-email-only`,
  s3Subject: `AUTO-CRM-11859-TC-FLOW-131_A-${runId}-customer-only`,
};
const created: Array<{ id: string; subject: string }> = [];

/** `difference` = REQUIREMENT #4c conclusion, printed on a FAIL only. */
type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
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

test.describe(`${TC} - Manual ticket required fields on Odoo 12 pre-production`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version (REQUIREMENT #7) ---\n  - Source: Confluence 231246777 v9, IS-CRM-FUNC-0383 (no CSV row - nothing to fingerprint)');
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    const hd = new HelpdeskPage(page);
    await hd.discardCreateForm().catch(() => {});
    if (SKIP_CLEANUP_FLOW131A) {
      console.log(`  - SKIP_CLEANUP_FLOW131A = true: left ${JSON.stringify(created)}`);
    } else {
      for (const t of created) {
        const ok = await hd.archiveTicketByIdOverRpc(t.id, t.subject).catch((e) => { console.log(`  ! archive #${t.id}: ${e instanceof Error ? e.message : String(e)}`); return false; });
        console.log(`  - Ticket #${t.id} "${t.subject}": ${ok ? 'archived' : 'NOT archived'}`);
      }
      if (!created.length) console.log('  - No ticket was created by this run');
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: What a ticket created by hand needs - A: Odoo 12 saves it with the Subject only, the description is optional`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hd = new HelpdeskPage(page);
    const checks: Check[] = [];
    let company = { id: 0, name: '', email: '' };

    const createIn = async (data: { subject: string; customerEmail?: string; customer?: string }) => {
      await hd.navigateToHelpdesk();
      await hd.openAllTicketsFromMenu();
      await hd.switchToListView().catch(() => {});
      const r = await hd.createTicketExpectingOutcome(data);
      if (r.id) created.push({ id: r.id, subject: data.subject });
      return r;
    };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl}`);
      try {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(AGENT.username, AGENT.password, CommonUtils.waitTimes.pageLoad);
        await loginPage.dismissLocationPermissionDialog();
        const me = await hd.getMyEmployeeSupportTeam();
        console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}`);
        expect(me.supportTeam, 'the signed-in account is an L1 agent').toBe('l1');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 1 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre1}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      company = await hd.findCompanyPartnerOverRpc();
      console.log(`  - Company : ${company.name} (#${company.id})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-conditions - signed in, company read');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const r = await createIn({ subject: DATA.s1Subject });
      await hd.readFormFieldsByName(['name']).catch(() => ({}));
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the ticket with the Subject only is saved', expected: 'saved (Odoo requires only the Subject)', actual: r.id ? `saved #${r.id}` : `refused: ${r.refusal}`, passed: !!r.id, difference: `refused: ${r.refusal}` },
      ], `${TC} - Step 1 Subject only`, r.id ? [HelpdeskPage.FORM_FIELD] : ['.modal.show .modal-content'], 'bottom-right');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const r = await createIn({ subject: DATA.s2Subject, customerEmail: DATA.raisedBy });
      const shown = r.id ? await hd.readFormFieldsByName(['name', 'partner_email']) : { partner_email: '' };
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the ticket with an e-mail and no description is saved', expected: `saved, Customer Email = ${DATA.raisedBy}`, actual: r.id ? `saved #${r.id}, Customer Email = ${shown.partner_email || '(empty)'}` : `refused: ${r.refusal}`, passed: !!r.id && shown.partner_email === DATA.raisedBy, difference: r.id ? `Customer Email '${shown.partner_email}'` : `refused: ${r.refusal}` },
      ], `${TC} - Step 2 e-mail only`, r.id ? [HelpdeskPage.FORM_FIELD] : ['.modal.show .modal-content'], 'bottom-right');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const r = await createIn({ subject: DATA.s3Subject, customer: company.name });
      const shown = r.id ? await hd.readFormFieldsByName(['name', 'partner_id']) : { partner_id: '' };
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 the ticket with a Customer and no e-mail typed is saved', expected: `saved, Customer = ${company.name}`, actual: r.id ? `saved #${r.id}, Customer = ${shown.partner_id || '(empty)'}` : `refused: ${r.refusal}`, passed: !!r.id && shown.partner_id.includes(company.name), difference: r.id ? `Customer '${shown.partner_id}'` : `refused: ${r.refusal}` },
      ], `${TC} - Step 3 customer only`, r.id ? [HelpdeskPage.FORM_FIELD] : ['.modal.show .modal-content'], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - three tickets saved');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - Odoo saves a hand-made ticket with the Subject only; the description is optional');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the hand-made tickets are saved as today').toEqual([]);
    });
  });
});
