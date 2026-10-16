import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { HomePage, OpportunityPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import {
  createPresalesOpportunityAsThomas, presalesRunId, printVerify, raiseSERequestFromOpportunity, signInAs, verifyCaption,
  waitForRaiseLogNote, PRESALES_RESELLER, VerifyLine,
} from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.8.1.1 - A new SE support request created from an Opportunity enters the Sales
 *                     Engineers Helpdesk queue as open and unassigned
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.8.1.1
 *  Jira:             CRM-12212
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Salesperson Thomas Semerich (raise), then Sales Engineer Nick Luchkov
 *                    (users.pre_sales_engineer) reads the queue - on PRE-PRODUCTION
 *  Source manual TC: CRM-12212 (Xray Manual Steps, 3 steps)
 *  Source version:   updated 2026-09-18T10:23:58+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.8 Assignment & ownership
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Thomas raises "Deployment assistance <unique>" (chatter note + Tickets N + 1); Nick finds exactly
 *    one matching row in Helpdesk > Sales Engineers > Tickets with Stage = New and no Assigned to.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.8\.1\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in to the CRM (pre-production) as a Salesperson - Thomas Semerich.
 *    Open CRM -> My Pipeline, click "New", and create an Opportunity with:
 *      - Opportunity Name       = SE Queue Entry <unique>
 *      - Company                = Test Co <unique>
 *      - Country                = United States
 *      - Reseller / Distributor = an existing active Reseller (TEST-Reseller#Automation-Jun10)
 *      - Expected Revenue       = 5000
 *    Click "Save".
 *
 *  Steps to reproduce:
 *    1. Open the Opportunity.   Expected: (EMPTY in Jira) - spec notes the Tickets count N (hidden = 0)
 *    2. Click "Request SE Support"; fill the window, press Tab and SAVE:
 *            Subject      = Deployment assistance <unique>
 *            Meeting Time = left at the window default
 *            Description  = Queue entry check
 *            Meeting link = blank
 *            Support type = Online deployment session
 *         Expected: The Opportunity chatter shows the log note "A new ticket has been opened by the
 *                   customer: Deployment assistance <unique>" and Tickets count = 1 (assert).
 *                   (spec: N + 1, which is 1 on this fresh Opportunity)
 *    3. Log in as Nick Luchkov; open Helpdesk -> Sales Engineers -> Tickets (list view); search
 *       "Deployment assistance <unique>".
 *         Expected: Exactly 1 request row is returned (assert count = 1) with Stage = "New" and
 *                   Owner = empty (unassigned).
 *
 *  Pre-production wording: the "Owner" column is "Assigned to".
 *
 *  Email ADDED to the pre-condition (not in Jira). Observed 2026-10-15, cause NOT isolated: in two runs
 *  of an Opportunity with a Reseller and no Email, the "Tickets" smart button stayed hidden although the
 *  raise note was logged; with an Email (customer Company/Contact created) it showed. A run with neither
 *  Reseller nor Email showed it too. Jira proposal: add "Email = test-<unique>@company.com" to the
 *  pre-condition, pending a dev answer on what drives the button.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to the CRM (pre-production) as the Salesperson Thomas Semerich; open CRM > list view > CREATE an Opportunity (Name, Company, Email, Country = United States, Reseller = an existing active Reseller, Expected Revenue = 5000) and Save',
  s1: 'Step 1: Open the Opportunity',
  s2: 'Step 2: Click "Request SE Support"; fill Subject = "Deployment assistance <unique>", Description, Support type = "Online deployment session"; press Tab and SAVE',
  s3: 'Step 3: Log in as Nick Luchkov; open Helpdesk > Sales Engineers > Tickets (list view); search "Deployment assistance <unique>"',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.8.1.1';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - A new request enters the Sales Engineers queue as open and unassigned`, () => {
  let createdOppUrl: string | null = null;
  let createdTicketSubject: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await deleteCreatedSESupportTicketAndOppAsAdmin(page, { ticketSubject: createdTicketSubject, oppUrl: createdOppUrl }, { ticket: SKIP_CLEANUP_TICKET, opp: SKIP_CLEANUP_OPP }, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: A new SE support request created from an Opportunity enters the Sales Engineers Helpdesk queue as open and unassigned`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const homePage = new HomePage(page);
    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const oppName = `SE Queue Entry ${unique}`;
    const subject = `Deployment assistance ${unique}`;
    let baselineTickets = 0;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName, companyName: `Test Co ${unique}`, email: `test-${unique}@company.com`, expectedRevenue: '5000', reseller: PRESALES_RESELLER });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      const name = await opportunityPage.getOpportunityNameValue();
      baselineTickets = await opportunityPage.getLinkedTicketsCount();
      console.log(`  - Opportunity form open      : ${name}`);
      console.log(`  - Tickets count N (baseline) : ${baselineTickets}`);
      expect(name, 'Step 1: the Opportunity form should be open').toContain(oppName);
    });

    let note = { found: false, expected: '' };
    let afterTickets = 0;
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl as string, { subject, description: 'Queue entry check', supportType: 'Online deployment session' });
      note = await waitForRaiseLogNote(page, createdOppUrl as string, subject);
      afterTickets = await opportunityPage.getLinkedTicketsCount();
      console.log(`  - Tickets count after raise : ${afterTickets}`);
      let ok2 = false;
      try {
        expect(note.found, `Step 2: the Opportunity chatter should show "${note.expected}"`).toBeTruthy();
        expect(afterTickets, 'Step 2: Tickets count should be N + 1').toBe(baselineTickets + 1);
        ok2 = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Step 2 chatter + Tickets`,
          passed: ok2,
          highlight: ["button[name='open_customer_tickets']", '.o_chatter .o_thread_message:first-child'],
          lines: [`chatter note: ${note.found ? 'FOUND' : 'NOT FOUND'}`, `Tickets: ${afterTickets} (N + 1 = ${baselineTickets + 1})`],
        }).catch(() => {});
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - request raised').catch(() => {});
    });

    let rows = 0;
    let stage = '';
    let assignedTo = '';
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.pageLoad);
      await helpdesk.navigateToHelpdesk();
      await helpdesk.openSalesEngineersTickets();
      await helpdesk.switchToListView();
      await helpdesk.searchTicket(subject);
      rows = await helpdesk.countTicketRows(subject);
      stage = rows ? await helpdesk.getTicketListColumnValue(subject, 'Stage') : '';
      assignedTo = rows ? await helpdesk.getTicketListColumnValue(subject, 'Assigned to') : '';
      console.log(`  - Matching rows : ${rows}`);
      console.log(`  - Stage         : ${stage}`);
      console.log(`  - Assigned to   : ${assignedTo || 'empty'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #2 - Sales Engineers queue searched').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        { what: 'Opportunity chatter log note', expected: note.expected, actual: note.found ? 'FOUND' : 'NOT FOUND', pass: note.found },
        { what: 'Opportunity Tickets count', expected: `N + 1 = ${baselineTickets + 1}`, actual: `${afterTickets}`, pass: afterTickets === baselineTickets + 1 },
        { what: 'Rows in Sales Engineers > Tickets for the Subject', expected: '1 (0 = not in the queue, 2+ = duplicated)', actual: `${rows}`, pass: rows === 1 },
        { what: 'Stage of the request', expected: 'New', actual: stage || '(none)', pass: stage === 'New' },
        { what: 'Owner (Assigned to) of the request', expected: 'empty (unassigned)', actual: assignedTo || 'empty', pass: assignedTo === '' },
      ];
      const ok = printVerify(lines, 'the request enters the Sales Engineers queue as New and unassigned');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - queue row`, passed: ok, highlight: ['tr.o_data_row'], lines: verifyCaption(lines) }).catch(() => {});
      expect(rows, 'exactly one queue row for the Subject').toBe(1);
      expect(stage, 'Stage').toBe('New');
      expect(assignedTo, 'Assigned to must be empty').toBe('');
    });
  });
});
