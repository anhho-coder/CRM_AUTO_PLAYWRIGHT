import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage, SESupportPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import { createPresalesOpportunityAsThomas, presalesRunId, printVerify, verifyCaption, waitForRaiseLogNote, VerifyLine } from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.7.2.1 - Submitting the dialog creates a request linked to the originating
 *                     Opportunity in both directions
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.7.2.1
 *  Jira:             CRM-12207
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Salesperson Thomas Semerich (users.sale_ic_thomas) on PRE-PRODUCTION
 *  Source manual TC: CRM-12207 (Xray Manual Steps, 4 steps)
 *  Source version:   updated 2026-09-18T10:23:45+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.7 Raising a request from the CRM
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Thomas raises "Link check <unique>"; the Opportunity's Tickets button shows N + 1 and opens that
 *    request, and the request's Opportunity Info links back to the SAME Opportunity (and navigates).
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.7\.2\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in to the CRM (pre-production) as a Salesperson - Thomas Semerich.
 *    Open CRM -> My Pipeline, click "New", and create an Opportunity with:
 *      - Opportunity Name  = SE Two-way Link <unique>
 *      - Company           = Test Co <unique>
 *      - Country           = United States
 *      - Expected Revenue  = 5000
 *    Click "Save".
 *
 *  Steps to reproduce:
 *    1. Open the Opportunity.   Expected: (EMPTY in Jira) - spec notes the Tickets count N (hidden = 0)
 *    2. Click "Request SE Support"; fill the window, press Tab and SAVE:
 *            Subject      = Link check <unique>
 *            Meeting Time = left at the window default
 *            Description  = Two-way link check
 *            Meeting link = blank
 *            Support type = Offline technical assistance
 *         Expected: (EMPTY in Jira - the spec confirms the window closed)
 *    3. On the Opportunity, read the "Tickets" smart-button count and open the linked request.
 *         Expected: The Opportunity "Tickets" count = 1 (assert) and it opens the request
 *                   "Link check <unique>".  (spec: N + 1, which is 1 on this fresh Opportunity)
 *    4. On the request, open the "Opportunity Info" tab and read the linked Opportunity name.
 *         Expected: The request's Opportunity Info links back to the SAME Opportunity
 *                   "SE Two-way Link <unique>" (assert equality) - navigable both directions.
 *
 *  Pre-production path: the Tickets button opens "Customer Tickets" (kanban) -> the ticket form.
 *
 *  Email ADDED to the pre-condition (not in Jira). Observed 2026-10-15, cause NOT isolated: in two runs
 *  of an Opportunity with a Reseller and no Email, the "Tickets" smart button stayed hidden although the
 *  raise note was logged; with an Email (customer Company/Contact created) it showed. A run with neither
 *  Reseller nor Email showed it too. Jira proposal: add "Email = test-<unique>@company.com" to the
 *  pre-condition, pending a dev answer on what drives the button.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to the CRM (pre-production) as the Salesperson Thomas Semerich; open CRM > list view > CREATE an Opportunity (Name, Company, Email, Country = United States, Expected Revenue = 5000) and Save',
  s1: 'Step 1: Open the Opportunity',
  s2: 'Step 2: Click "Request SE Support"; fill Subject = "Link check <unique>", Description, Support type = "Offline technical assistance"; press Tab and SAVE',
  s3: 'Step 3: On the Opportunity, read the "Tickets" smart-button count and open the linked request',
  s4: 'Step 4: On the request, open the "Opportunity Info" tab and read the linked Opportunity name',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.7.2.1';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - Request linked to the originating Opportunity in both directions`, () => {
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

  test(`${TC}: Submitting the dialog creates a request linked to the originating Opportunity in both directions`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const seSupportPage = new SESupportPage(page);
    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const oppName = `SE Two-way Link ${unique}`;
    const subject = `Link check ${unique}`;
    let baselineTickets = 0;
    let oppId = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName, companyName: `Test Co ${unique}`, email: `test-${unique}@company.com`, expectedRevenue: '5000' });
      oppId = (createdOppUrl.match(/[#&?]id=(\d+)/) || [])[1] || '';
      console.log(`  - Opportunity id : ${oppId}`);
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

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  - Subject      = ${subject}`);
      console.log('  - Meeting Time = left at the window default');
      console.log('  - Description  = Two-way link check');
      console.log('  - Meeting link = blank');
      console.log('  - Support type = Offline technical assistance');
      await opportunityPage.clickRequestSESupport();
      await seSupportPage.waitForWindowOpen();
      await seSupportPage.fillSubject(subject);
      createdTicketSubject = subject;
      await seSupportPage.fillDescription('Two-way link check');
      await seSupportPage.selectSupportType('Offline technical assistance');
      await seSupportPage.save();
      expect(await seSupportPage.isWindowOpen(), 'Step 2: the window should close after SAVE').toBeFalsy();
    });

    let afterTickets = 0;
    let openedSubject = '';
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      // The ticket is created asynchronously: wait for the Opportunity's raise note before counting.
      const note = await waitForRaiseLogNote(page, createdOppUrl as string, subject);
      afterTickets = await opportunityPage.getLinkedTicketsCount();
      console.log(`  - Raise note on the Opportunity : ${note.found ? 'FOUND' : 'NOT FOUND'}`);
      const opened = await opportunityPage.openLinkedTickets();
      expect(opened, 'Step 3: the "Tickets" smart button should open the linked request').toBeTruthy();
      if (await helpdesk.isTicketVisible(subject)) await helpdesk.openTicket(subject);
      openedSubject = await helpdesk.getTicketSubject();
      console.log(`  - Tickets count after raise : ${afterTickets}`);
      console.log(`  - Request opened            : ${openedSubject}`);
    });

    let linkedOppName = '';
    let navigatedId = '';
    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await helpdesk.openOpportunityInfoTab();
      linkedOppName = await helpdesk.getFieldValueByName('opportunity_id');
      console.log(`  - Opportunity Info > Opportunity : ${linkedOppName}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Opportunity Info read').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const preLines: VerifyLine[] = [
        { what: 'Opportunity "Tickets" count', expected: `N + 1 = ${baselineTickets + 1}`, actual: `${afterTickets}`, pass: afterTickets === baselineTickets + 1 },
        { what: 'The Tickets button opens the raised request', expected: subject, actual: openedSubject || '(nothing opened)', pass: openedSubject === subject },
        { what: 'Opportunity Info links back to the SAME Opportunity', expected: `${oppName} (another name = the request points at a different deal)`, actual: linkedOppName || '(empty)', pass: linkedOppName === oppName },
      ];
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Opportunity Info link`, passed: preLines.every((l) => l.pass), highlight: ["[name='opportunity_id']"], lines: verifyCaption(preLines) }).catch(() => {});
      navigatedId = await helpdesk.followLinkedOpportunity();
      const lines: VerifyLine[] = [
        ...preLines,
        { what: 'Following the link navigates back to the same Opportunity record', expected: `crm.lead id ${oppId}`, actual: navigatedId ? `crm.lead id ${navigatedId}` : '(no link)', pass: navigatedId === oppId },
      ];
      printVerify(lines, 'the request and the Opportunity link to each other');
      expect(afterTickets, 'Tickets count should be N + 1').toBe(baselineTickets + 1);
      expect(openedSubject, 'the Tickets button should open the raised request').toBe(subject);
      expect(linkedOppName, 'Opportunity Info > Opportunity').toBe(oppName);
      expect(navigatedId, 'the Opportunity link should navigate to the originating record').toBe(oppId);
    });
  });
});
