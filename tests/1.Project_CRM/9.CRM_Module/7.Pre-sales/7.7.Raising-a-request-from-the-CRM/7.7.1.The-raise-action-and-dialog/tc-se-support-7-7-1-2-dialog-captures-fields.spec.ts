import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage, SESupportPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import { createPresalesOpportunityAsThomas, presalesRunId, printVerify, sameSet, verifyCaption, VerifyLine } from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.7.1.2 - Request dialog captures subject, description and assistance need, plus
 *                     optional session time and conferencing link
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.7.1.2
 *  Jira:             CRM-12204
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Salesperson Thomas Semerich (users.sale_ic_thomas) on PRE-PRODUCTION
 *  Source manual TC: CRM-12204 (Xray Manual Steps, 3 steps)
 *  Source version:   updated 2026-09-18T10:22:29+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.7 Raising a request from the CRM
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Thomas opens the "New Ticket" window from his own Opportunity and reads its controls: exactly
 *    Subject, Description, Support type, Meeting Time, Meeting link + SAVE, CANCEL - no more, no fewer.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.7\.1\.2:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in to the CRM (pre-production) as a Salesperson - Thomas Semerich.
 *    Open CRM -> My Pipeline, click "New", and create an Opportunity with:
 *      - Opportunity Name  = SE Dialog Fields <unique>
 *      - Company           = Test Co <unique>
 *      - Country           = United States
 *      - Expected Revenue  = 5000
 *    Click "Save".
 *
 *  Steps to reproduce:
 *    1. Open the Opportunity.                        Expected: (EMPTY in Jira - form-open check only)
 *    2. Click "Request SE Support".                  Expected: (EMPTY in Jira - window-open check only)
 *    3. In the "New Ticket" dialog, read the set of input controls.
 *         Expected: The dialog contains EXACTLY these controls (assert each present): Subject (text),
 *                   Description (text), Support type (dropdown), Meeting Time (optional),
 *                   Meeting link (optional), SAVE, CANCEL.
 *
 *  Pre-production reading of "text / dropdown / optional":
 *    Subject = <input>, Description = <textarea>, Support type = <select>; "optional" = the widget is
 *    NOT marked required (no o_required_modifier). Meeting Time renders as a date-time picker.
 *    CAVEAT: the window does not FLAG Meeting Time as required, but the server refuses a SAVE without
 *    it ("Please input meeting time!" - see pre-sale-7.7.1.4). This TC checks the window only.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to the CRM (pre-production) as the Salesperson Thomas Semerich; open CRM > list view > CREATE an Opportunity (Name, Company, Country = United States, Expected Revenue = 5000) and Save',
  s1: 'Step 1: Open the Opportunity',
  s2: 'Step 2: Click "Request SE Support"',
  s3: 'Step 3: In the "New Ticket" dialog, read the set of input controls',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.7.1.2';
const EXPECTED_FIELDS = ['Subject', 'Description', 'Support type', 'Meeting Time', 'Meeting link'];
const EXPECTED_BUTTONS = ['SAVE', 'CANCEL'];
const EXPECTED_KIND: Record<string, string> = { Subject: 'input', Description: 'textarea', 'Support type': 'select' };
const OPTIONAL = ['Meeting Time', 'Meeting link'];

const SKIP_CLEANUP_OPP = false;

test.describe(`${TC} - Request dialog captures subject, description and assistance need`, () => {
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

  test(`${TC}: Request dialog captures subject, description and assistance need, plus optional session time and conferencing link`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const seSupportPage = new SESupportPage(page);
    const unique = presalesRunId();
    const oppName = `SE Dialog Fields ${unique}`;

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
      const open = await seSupportPage.isWindowOpen();
      console.log(`  - New Ticket window open : ${open}`);
      expect(open, 'Step 2: the "New Ticket" window should open').toBeTruthy();
    });

    let controls: Array<{ label: string; field: string; kind: string; required: boolean }> = [];
    let buttons: string[] = [];
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      controls = await seSupportPage.getFieldControls();
      buttons = await seSupportPage.getFooterButtons();
      controls.forEach((c, i) => console.log(`  - Control ${i + 1} : ${c.label.padEnd(13)} field = ${c.field.padEnd(13)} kind = ${c.kind.padEnd(10)} required = ${c.required}`));
      buttons.forEach((b, i) => console.log(`  - Button ${i + 1}  : ${b}`));
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - New Ticket controls read').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const labels = controls.map((c) => c.label);
      const byLabel = (l: string) => controls.find((c) => c.label === l);
      const kindsOk = Object.entries(EXPECTED_KIND).every(([l, k]) => byLabel(l)?.kind === k);
      const optionalOk = OPTIONAL.every((l) => byLabel(l) !== undefined && byLabel(l)?.required === false);
      const lines: VerifyLine[] = [
        {
          what: 'The input controls, no more and no fewer',
          expected: `exactly ${EXPECTED_FIELDS.length}: ${EXPECTED_FIELDS.join(', ')} (an extra or missing control is a FAIL)`,
          actual: `${labels.length}: ${labels.join(', ')}`,
          pass: sameSet(labels, EXPECTED_FIELDS),
        },
        { what: 'The buttons', expected: `exactly ${EXPECTED_BUTTONS.join(', ')}`, actual: buttons.join(', '), pass: sameSet(buttons.map((b) => b.toUpperCase()), EXPECTED_BUTTONS) },
        {
          what: 'Control kinds',
          expected: 'Subject = input (text), Description = textarea (text), Support type = select (dropdown)',
          actual: Object.keys(EXPECTED_KIND).map((l) => `${l} = ${byLabel(l)?.kind ?? 'absent'}`).join(', '),
          pass: kindsOk,
        },
        {
          what: 'Meeting Time and Meeting link are optional',
          expected: 'neither is marked required',
          actual: OPTIONAL.map((l) => `${l} required = ${byLabel(l)?.required ?? 'absent'}`).join(', '),
          pass: optionalOk,
        },
      ];
      const ok = printVerify(lines, 'the New Ticket window carries exactly the agreed controls');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - New Ticket controls`, passed: ok, highlight: ['div.modal.show .modal-content'], lines: verifyCaption(lines) }).catch(() => {});
      expect(labels.length, 'the NUMBER of input controls').toBe(EXPECTED_FIELDS.length);
      expect(sameSet(labels, EXPECTED_FIELDS), `input controls = ${EXPECTED_FIELDS.join(', ')}`).toBeTruthy();
      expect(sameSet(buttons.map((b) => b.toUpperCase()), EXPECTED_BUTTONS), 'buttons = SAVE, CANCEL').toBeTruthy();
      expect(kindsOk, 'Subject/Description/Support type control kinds').toBeTruthy();
      expect(optionalOk, 'Meeting Time and Meeting link must not be required').toBeTruthy();
    });
  });
});
