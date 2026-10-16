import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage, SESupportPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import { createPresalesOpportunityAsThomas, presalesRunId, printVerify, sameSet, verifyCaption, VerifyLine } from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.7.1.3 - Cannot submit the request without the required subject, description and
 *                     assistance need
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.7.1.3
 *  Jira:             CRM-12205
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Salesperson Thomas Semerich (users.sale_ic_thomas) on PRE-PRODUCTION
 *  Source manual TC: CRM-12205 (Xray Manual Steps, 4 steps)
 *  Source version:   updated 2026-09-18T10:22:30+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.7 Raising a request from the CRM
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Thomas opens the "New Ticket" window, leaves Subject / Description / Support type empty and
 *    presses SAVE: the save is refused, the window stays, the 3 fields are flagged, no request exists.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.7\.1\.3:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in to the CRM (pre-production) as a Salesperson - Thomas Semerich.
 *    Open CRM -> My Pipeline, click "New", and create an Opportunity with:
 *      - Opportunity Name  = SE Required Fields <unique>
 *      - Company           = Test Co <unique>
 *      - Country           = United States
 *      - Expected Revenue  = 5000
 *    Click "Save".
 *
 *  Steps to reproduce:
 *    1. Open the Opportunity.        Expected: (EMPTY in Jira) - spec also notes the Tickets count N
 *                                    (hidden smart button = 0) as the baseline for "no request is created"
 *    2. Click "Request SE Support".  Expected: (EMPTY in Jira - window-open check only)
 *    3. Leave Subject, Description and Support type empty.
 *         Input (every field of the window):
 *            Subject      = blank
 *            Meeting Time = left at the window default (pre-production pre-fills a date-time;
 *                           not one of the three required fields this TC empties)
 *            Description  = blank
 *            Meeting link = blank
 *            Support type = blank
 *         Expected: (EMPTY in Jira - the spec confirms the three fields are empty)
 *    4. Press Tab, then click "SAVE".
 *         Expected: The save is REJECTED (assert): no request is created, the dialog stays open, and
 *                   the empty required fields (Subject, Description, Support type) are flagged as
 *                   required.
 *
 *  Pre-production message (verbatim, pinned 2026-10-15 - Jira proposal: quote it in step 4):
 *    "The following fields are invalid: Subject Description Support type"
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to the CRM (pre-production) as the Salesperson Thomas Semerich; open CRM > list view > CREATE an Opportunity (Name, Company, Country = United States, Expected Revenue = 5000) and Save',
  s1: 'Step 1: Open the Opportunity',
  s2: 'Step 2: Click "Request SE Support"',
  s3: 'Step 3: Leave Subject, Description and Support type empty',
  s4: 'Step 4: Press Tab, then click "SAVE"',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.7.1.3';
const EXPECTED_TOAST = 'The following fields are invalid: Subject Description Support type';
const EXPECTED_FLAGGED = ['subject', 'description', 'support_type'];

const SKIP_CLEANUP_OPP = false;

test.describe(`${TC} - Cannot submit the request without the required fields`, () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await deleteCreatedSESupportTicketAndOppAsAdmin(page, { ticketSubject: null, oppUrl: createdOppUrl }, { ticket: true, opp: SKIP_CLEANUP_OPP }, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Cannot submit the request without the required subject, description and assistance need`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const seSupportPage = new SESupportPage(page);
    const unique = presalesRunId();
    const oppName = `SE Required Fields ${unique}`;
    let baselineTickets = 0;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName, companyName: `Test Co ${unique}`, expectedRevenue: '5000' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      const name = await opportunityPage.getOpportunityNameValue();
      baselineTickets = await opportunityPage.getLinkedTicketsCount();
      console.log(`  - Opportunity form open        : ${name}`);
      console.log(`  - Tickets count N (baseline)   : ${baselineTickets}`);
      expect(name, 'Step 1: the Opportunity form should be open').toContain(oppName);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await opportunityPage.clickRequestSESupport();
      await seSupportPage.waitForWindowOpen();
      expect(await seSupportPage.isWindowOpen(), 'Step 2: the "New Ticket" window should open').toBeTruthy();
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const v = await seSupportPage.getFieldValues();
      console.log(`  - Subject      = ${v.subject || 'blank'}`);
      console.log(`  - Meeting Time = ${v.meetingTime || 'blank'}`);
      console.log(`  - Description  = ${v.description || 'blank'}`);
      console.log(`  - Meeting link = ${v.meetingLink || 'blank'}`);
      console.log(`  - Support type = ${v.supportType || 'blank'}`);
      expect([v.subject, v.description, v.supportType], 'Step 3: Subject, Description and Support type are left empty').toEqual(['', '', '']);
    });

    let toast = '';
    let flagged: string[] = [];
    let stillOpen = false;
    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await seSupportPage.clickSaveOnly();
      toast = await seSupportPage.getWarningToastText();
      flagged = await seSupportPage.getInvalidFieldNames();
      stillOpen = await seSupportPage.isWindowOpen();
      console.log(`  - Window still open : ${stillOpen}`);
      console.log(`  - Warning toast     : ${toast}`);
      console.log(`  - Flagged fields    : ${flagged.join(', ')}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - SAVE refused').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      // Evidence first, while the refused window and the toast are still on screen.
      const preLines: VerifyLine[] = [
        { what: 'The dialog stays open', expected: 'open (a closed window would mean the save went through)', actual: `open = ${stillOpen}`, pass: stillOpen },
        { what: 'The product refusal message (verbatim)', expected: EXPECTED_TOAST, actual: toast || '(none)', pass: toast === EXPECTED_TOAST },
        { what: 'The empty required fields are flagged', expected: `exactly ${EXPECTED_FLAGGED.join(', ')}`, actual: flagged.join(', ') || '(none)', pass: sameSet(flagged, EXPECTED_FLAGGED) },
      ];
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - SAVE refused`,
        passed: preLines.every((l) => l.pass),
        highlight: ['div.modal.show .o_field_invalid', '.o_notification'],
        lines: verifyCaption(preLines),
      }).catch(() => {});

      // No request created: close the window and re-read the Opportunity (count + chatter).
      await seSupportPage.closeErrorAndCancel();
      await opportunityPage.openByUrl(createdOppUrl as string);
      const afterTickets = await opportunityPage.getLinkedTicketsCount();
      const chatter = await opportunityPage.getChatterLogText();
      const raiseNote = chatter.includes('A new ticket has been opened by the customer');
      const lines: VerifyLine[] = [
        ...preLines,
        { what: 'No request is created - Tickets count', expected: `N = ${baselineTickets} (unchanged)`, actual: `${afterTickets}`, pass: afterTickets === baselineTickets },
        { what: 'No request is created - Opportunity chatter', expected: 'no "A new ticket has been opened by the customer" note', actual: raiseNote ? 'note FOUND' : 'no note', pass: !raiseNote },
      ];
      printVerify(lines, 'the empty-field save is refused and creates nothing');
      expect(stillOpen, 'the New Ticket dialog should stay open after the refused save').toBeTruthy();
      expect(toast, 'the refusal message').toBe(EXPECTED_TOAST);
      expect(sameSet(flagged, EXPECTED_FLAGGED), `flagged fields = ${EXPECTED_FLAGGED.join(', ')}`).toBeTruthy();
      expect(afterTickets, 'Tickets count must not change (no request created)').toBe(baselineTickets);
      expect(raiseNote, 'no raise log note on the Opportunity').toBeFalsy();
    });
  });
});
