import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage, SESupportPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import { createPresalesOpportunityAsThomas, presalesRunId, printVerify, sameSet, verifyCaption, VerifyLine } from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.7.3.1 - Assistance need dropdown offers exactly the three in-use values and no
 *                     dormant ones
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.7.3.1
 *  Jira:             CRM-12210
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Salesperson Thomas Semerich (users.sale_ic_thomas) on PRE-PRODUCTION
 *  Source manual TC: CRM-12210 (Xray Manual Steps, 3 steps)
 *  Source version:   updated 2026-09-18T10:23:56+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.7 Raising a request from the CRM
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Thomas opens the "New Ticket" window and reads the Support type dropdown: exactly Online
 *    deployment session, Online technical assistance, Offline technical assistance; "SE: Webinar" absent.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.7\.3\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in to the CRM (pre-production) as a Salesperson - Thomas Semerich.
 *    Open CRM -> My Pipeline, click "New", and create an Opportunity with:
 *      - Opportunity Name  = SE Assistance List <unique>
 *      - Company           = Test Co <unique>
 *      - Country           = United States
 *      - Expected Revenue  = 5000
 *    Click "Save".
 *
 *  Steps to reproduce:
 *    1. Open the Opportunity.                Expected: (EMPTY in Jira - form-open check only)
 *    2. Click "Request SE Support".          Expected: (EMPTY in Jira - window-open check only)
 *    3. Open the "Support type" dropdown and collect all option labels.
 *         Expected: The "Support type" option set EQUALS exactly {"Online deployment session",
 *                   "Online technical assistance", "Offline technical assistance"} (count = 3,
 *                   set-equality). Assert NO other option is present (e.g. "SE: Webinar" absent).
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to the CRM (pre-production) as the Salesperson Thomas Semerich; open CRM > list view > CREATE an Opportunity (Name, Company, Country = United States, Expected Revenue = 5000) and Save',
  s1: 'Step 1: Open the Opportunity',
  s2: 'Step 2: Click "Request SE Support"',
  s3: 'Step 3: Open the "Support type" dropdown and collect all option labels',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.7.3.1';
const EXPECTED_OPTIONS = ['Online deployment session', 'Online technical assistance', 'Offline technical assistance'];
const DORMANT = 'SE: Webinar';

const SKIP_CLEANUP_OPP = false;

test.describe(`${TC} - Support type offers exactly the three in-use values`, () => {
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

  test(`${TC}: Assistance need dropdown offers exactly the three in-use values and no dormant ones`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const seSupportPage = new SESupportPage(page);
    const unique = presalesRunId();
    const oppName = `SE Assistance List ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName, companyName: `Test Co ${unique}`, expectedRevenue: '5000' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      const name = await opportunityPage.getOpportunityNameValue();
      console.log(`  - Opportunity form open : ${name}`);
      expect(name, 'Step 1: the Opportunity form should be open').toContain(oppName);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await opportunityPage.clickRequestSESupport();
      await seSupportPage.waitForWindowOpen();
      expect(await seSupportPage.isWindowOpen(), 'Step 2: the "New Ticket" window should open').toBeTruthy();
    });

    let options: string[] = [];
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      options = await seSupportPage.getSupportTypeOptions();
      options.forEach((o, i) => console.log(`  - Option ${i + 1} : ${o}`));
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Support type options read').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        { what: 'Number of Support type options', expected: `${EXPECTED_OPTIONS.length}`, actual: `${options.length}`, pass: options.length === EXPECTED_OPTIONS.length },
        { what: 'Support type option set', expected: `exactly {${EXPECTED_OPTIONS.join(', ')}}`, actual: `{${options.join(', ')}}`, pass: sameSet(options, EXPECTED_OPTIONS) },
        { what: `Dormant "${DORMANT}" absent`, expected: 'absent (present = a dormant type is still offered)', actual: options.includes(DORMANT) ? 'PRESENT' : 'absent', pass: !options.includes(DORMANT) },
      ];
      const ok = printVerify(lines, 'Support type offers exactly the three in-use values');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Support type options`, passed: ok, highlight: ["div.modal.show select[name='support_type']"], lines: verifyCaption(lines) }).catch(() => {});
      expect(options.length, 'the NUMBER of Support type options').toBe(EXPECTED_OPTIONS.length);
      expect([...options].sort(), 'the Support type option set').toEqual([...EXPECTED_OPTIONS].sort());
      expect(options, `"${DORMANT}" must not be offered`).not.toContain(DORMANT);
    });
  });
});
