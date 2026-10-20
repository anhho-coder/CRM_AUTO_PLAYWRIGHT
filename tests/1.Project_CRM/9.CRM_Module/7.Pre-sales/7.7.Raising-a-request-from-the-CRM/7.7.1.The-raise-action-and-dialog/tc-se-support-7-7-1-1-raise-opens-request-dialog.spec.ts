import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage, SESupportPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import { createPresalesOpportunityAsThomas, presalesRunId, printVerify, verifyCaption, VerifyLine } from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.7.1.1 - Raise a Pre-Sales Request from an Opportunity opens the request dialog
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.7.1.1
 *  Jira:             CRM-12203
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Salesperson Thomas Semerich (users.sale_ic_thomas) on PRE-PRODUCTION
 *  Source manual TC: CRM-12203 (Xray Manual Steps, 2 steps)
 *  Source version:   updated 2026-09-18T10:22:28+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.7 Raising a request from the CRM
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Thomas creates his own Opportunity, opens it and clicks "Request SE support"; the "New Ticket"
 *    window must open with Subject, Description, Support type, Meeting Time, Meeting link, SAVE, CANCEL.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.7\.1\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in to the CRM (pre-production) as a Salesperson - Thomas Semerich.
 *    Open CRM -> My Pipeline, click "New", and create an Opportunity with:
 *      - Opportunity Name  = SE Raise Dialog <unique>
 *      - Company           = Test Co <unique>
 *      - Email             = test-<unique>@company.com
 *      - Country           = United States
 *      - Expected Revenue  = 5000
 *    Click "Save".
 *
 *  Steps to reproduce:
 *    1. Open the Opportunity.
 *         Expected: (EMPTY in Jira - the spec only confirms the Opportunity form is open)
 *    2. Click the "Request SE Support" button.
 *         Expected: A "New Ticket" dialog is displayed (assert visible) with the controls Subject,
 *                   Description, Support type, Meeting Time, Meeting link, SAVE and CANCEL all present.
 *
 *  Pre-production wording (Jira proposal, not yet applied):
 *    - "My Pipeline > New" is "CRM > list view > CREATE" on pre-production; the button reads
 *      "Request SE support" (lower-case s).
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to the CRM (pre-production) as the Salesperson Thomas Semerich; open CRM > list view > CREATE an Opportunity (Name, Company, Email, Country = United States, Expected Revenue = 5000) and Save',
  s1: 'Step 1: Open the Opportunity',
  s2: 'Step 2: Click the "Request SE Support" button',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.7.1.1';
const EXPECTED_CONTROLS = ['Subject', 'Description', 'Support type', 'Meeting Time', 'Meeting link', 'SAVE', 'CANCEL'];

// Cleanup toggles (true = skip). No ticket is saved by this TC - only the Opportunity is created.
const SKIP_CLEANUP_OPP = false;

test.describe(`${TC} - Raise a Pre-Sales Request from an Opportunity opens the request dialog`, () => {
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
    await deleteCreatedSESupportTicketAndOppAsAdmin(
      page,
      { ticketSubject: null, oppUrl: createdOppUrl },
      { ticket: true, opp: SKIP_CLEANUP_OPP },
      testInfo
    );
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Raise a Pre-Sales Request from an Opportunity opens the request dialog`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const seSupportPage = new SESupportPage(page);
    const unique = presalesRunId();
    const oppName = `SE Raise Dialog ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, {
        oppName,
        companyName: `Test Co ${unique}`,
        email: `test-${unique}@company.com`,
        expectedRevenue: '5000',
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      const name = await opportunityPage.getOpportunityNameValue();
      console.log(`  - Opportunity form open : ${name}`);
      expect(name, 'Step 1: the Opportunity form should be open on the record created in Pre-condition 1').toContain(oppName);
    });

    let labels: string[] = [];
    let buttons: string[] = [];
    let title = '';
    let open = false;
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await opportunityPage.clickRequestSESupport();
      await seSupportPage.waitForWindowOpen();
      open = await seSupportPage.isWindowOpen();
      title = await seSupportPage.getWindowTitle();
      labels = await seSupportPage.getFieldLabels();
      buttons = await seSupportPage.getFooterButtons();
      console.log(`  - Window open   : ${open}`);
      console.log(`  - Window title  : ${title}`);
      labels.forEach((l, i) => console.log(`  - Field ${i + 1}       : ${l}`));
      buttons.forEach((b, i) => console.log(`  - Button ${i + 1}      : ${b}`));
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - New Ticket window open').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const present = [...labels, ...buttons];
      const presentUpper = present.map((p) => p.toUpperCase());
      const missing = EXPECTED_CONTROLS.filter((c) => !presentUpper.includes(c.toUpperCase()));
      const lines: VerifyLine[] = [
        { what: 'The "New Ticket" dialog is displayed', expected: 'visible, title = New Ticket', actual: `visible = ${open}, title = ${title}`, pass: open && title === 'New Ticket' },
        {
          what: 'All required controls are present',
          expected: `${EXPECTED_CONTROLS.join(', ')} (a missing control is a FAIL - the Salesperson could not fill or submit the request)`,
          actual: missing.length ? `MISSING: ${missing.join(', ')}` : `all present (${present.join(', ')})`,
          pass: missing.length === 0,
        },
      ];
      const ok = printVerify(lines, 'Request SE support opens the New Ticket dialog with every control');
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - New Ticket dialog`,
        passed: ok,
        highlight: ['div.modal.show .modal-content'],
        lines: verifyCaption(lines),
      }).catch(() => {});
      expect(open, 'the "New Ticket" dialog should be visible').toBeTruthy();
      expect(title, 'the dialog title').toBe('New Ticket');
      expect(missing, 'controls missing from the "New Ticket" dialog').toEqual([]);
    });
  });
});
