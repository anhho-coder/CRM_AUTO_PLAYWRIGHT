import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { HomePage, OpportunityPage, SESupportPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import {
  createPresalesOpportunityAsThomas, openSETicketFromHelpdesk, presalesRunId, printVerify, raiseSERequestFromOpportunity,
  signInAs, verifyCaption, VerifyLine,
} from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.7.2.2 - Raising from an Opportunity with some context blank carries the blanks
 *                     over without error
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.7.2.2
 *  Jira:             CRM-12209
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Salesperson Thomas Semerich (raise), then Sales Engineer Nick Luchkov
 *                    (users.pre_sales_engineer) reads the request - on PRE-PRODUCTION
 *  Source manual TC: CRM-12209 (Xray Manual Steps, 3 steps)
 *  Source version:   updated 2026-09-18T10:23:46+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.7 Raising a request from the CRM
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Thomas raises a request from an Opportunity with NO Reseller; Nick opens it and the Opportunity
 *    Info tab carries the blanks (Reseller, Distributor empty) next to Country / Expected Revenue.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.7\.2\.2:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in to the CRM (pre-production) as a Salesperson - Thomas Semerich.
 *    Open CRM -> My Pipeline, click "New", and create an Opportunity with SOME context left blank:
 *      - Opportunity Name       = SE Blank Context <unique>
 *      - Company                = Test Co <unique>
 *      - Country                = United States
 *      - Expected Revenue       = 3000
 *      - Reseller / Distributor = BLANK (leave empty)
 *      - Products of interest   = BLANK (leave empty)
 *    Click "Save".
 *
 *  Steps to reproduce:
 *    1. Open the Opportunity (Reseller and Products empty).   Expected: (EMPTY in Jira - form-open check)
 *    2. Click "Request SE Support"; fill the window, press Tab and SAVE:
 *            Subject      = Blank context <unique>
 *            Meeting Time = left at the window default
 *            Description  = Blank context check
 *            Meeting link = blank
 *            Support type = Online technical assistance
 *         Expected: (EMPTY in Jira - the spec confirms the window closed with no error)
 *    3. Log in as Nick Luchkov; open the request (Helpdesk > Sales Engineers > Tickets) and its
 *       "Opportunity Info" tab.
 *         Expected: The request is created with NO error, and Opportunity Info shows (assert):
 *                   _ Reseller = empty
 *                   _ Products = empty
 *                   _ Customer/Contact, Country = United States, Expected Revenue = 3000,
 *                     Salesperson = Thomas Semerich (equal source).
 *
 *  What pre-production's Opportunity Info tab actually carries (Jira proposal for step 3):
 *    Opportunity, Expected Revenue Deal, Country, Reseller, Distributor. It has NO Products,
 *    Salesperson or Customer/Contact field - those are printed as observations, not scored.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to the CRM (pre-production) as the Salesperson Thomas Semerich; open CRM > list view > CREATE an Opportunity (Name, Company, Country = United States, Expected Revenue = 3000, Reseller / Distributor and Products left BLANK) and Save',
  s1: 'Step 1: Open the Opportunity (Reseller and Products empty)',
  s2: 'Step 2: Click "Request SE Support"; fill Subject = "Blank context <unique>", Description, Support type = "Online technical assistance"; press Tab and SAVE',
  s3: 'Step 3: Log in as Nick Luchkov; open the request (Helpdesk > Sales Engineers > Tickets) and its "Opportunity Info" tab',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.7.2.2';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;
const toNumber = (s: string) => Number((s.match(/[\d.,]+/) || ['0'])[0].replace(/,/g, ''));

test.describe(`${TC} - Blank Opportunity context is carried over without error`, () => {
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

  test(`${TC}: Raising from an Opportunity with some context blank carries the blanks over without error`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const seSupportPage = new SESupportPage(page);
    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const oppName = `SE Blank Context ${unique}`;
    const subject = `Blank context ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName, companyName: `Test Co ${unique}`, expectedRevenue: '3000', reseller: null });
      console.log('    - Products of interest = blank');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const opportunityPage = new OpportunityPage(page);
      await opportunityPage.openByUrl(createdOppUrl as string);
      const name = await opportunityPage.getOpportunityNameValue();
      console.log(`  - Opportunity form open : ${name}`);
      expect(name, 'Step 1: the Opportunity form should be open').toContain(oppName);
    });

    let errorText = '';
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl as string, { subject, description: 'Blank context check', supportType: 'Online technical assistance' });
      errorText = await seSupportPage.getErrorDialogText();
      console.log(`  - Window still open : ${await seSupportPage.isWindowOpen()}`);
      console.log(`  - Error dialog      : ${errorText || 'none'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - request raised').catch(() => {});
    });

    const info = { opportunity: '', reseller: '', distributor: '', country: '', revenue: '' };
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await openSETicketFromHelpdesk(page, subject);
      await helpdesk.openOpportunityInfoTab();
      info.opportunity = await helpdesk.getFieldValueByName('opportunity_id');
      info.reseller = await helpdesk.getFieldValueByName('lead_reseller_id');
      info.distributor = await helpdesk.getFieldValueByName('lead_distributor_id');
      info.country = await helpdesk.getFieldValueByName('lead_country_id');
      info.revenue = await helpdesk.getFieldValueByName('lead_planed_revenue');
      console.log(`  - Opportunity           = ${info.opportunity}`);
      console.log(`  - Expected Revenue Deal = ${info.revenue}`);
      console.log(`  - Country               = ${info.country}`);
      console.log(`  - Reseller              = ${info.reseller || 'empty'}`);
      console.log(`  - Distributor           = ${info.distributor || 'empty'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #2 - Opportunity Info read as Nick').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        { what: 'The request is created with NO error', expected: 'no error dialog; the request opens for the SE', actual: errorText ? `ERROR: ${errorText}` : 'no error, request opened', pass: !errorText && info.opportunity !== '' },
        { what: 'Opportunity carried', expected: oppName, actual: info.opportunity || '(empty)', pass: info.opportunity === oppName },
        { what: 'Reseller carried as BLANK', expected: 'empty (a value here = context invented on the way)', actual: info.reseller || 'empty', pass: info.reseller === '' },
        { what: 'Distributor carried as BLANK', expected: 'empty', actual: info.distributor || 'empty', pass: info.distributor === '' },
        { what: 'Country carried', expected: 'United States', actual: info.country || '(empty)', pass: info.country === 'United States' },
        { what: 'Expected Revenue carried', expected: '3000', actual: info.revenue || '(empty)', pass: toNumber(info.revenue) === 3000 },
      ];
      const ok = printVerify(lines, 'blank Opportunity context is carried to the request without error');
      console.log('  Observation (not scored) - Products / Salesperson / Customer-Contact: not fields of the pre-production Opportunity Info tab');
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Opportunity Info`,
        passed: ok,
        highlight: ["[name='opportunity_id']", "[name='lead_reseller_id']", "[name='lead_distributor_id']", "[name='lead_country_id']", "[name='lead_planed_revenue']"],
        lines: verifyCaption(lines),
      }).catch(() => {});
      expect(errorText, 'no error dialog on raise').toBe('');
      expect(info.opportunity, 'Opportunity Info > Opportunity').toBe(oppName);
      expect(info.reseller, 'Opportunity Info > Reseller must stay empty').toBe('');
      expect(info.distributor, 'Opportunity Info > Distributor must stay empty').toBe('');
      expect(info.country, 'Opportunity Info > Country').toBe('United States');
      expect(toNumber(info.revenue), 'Opportunity Info > Expected Revenue Deal').toBe(3000);
    });
  });
});
