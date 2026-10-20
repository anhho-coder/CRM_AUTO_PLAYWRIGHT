import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { HomePage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import {
  createPresalesOpportunityAsThomas, openSETicketFromHelpdesk, presalesRunId, printVerify, raiseSERequestFromOpportunity,
  signInAs, verifyCaption, VerifyLine,
} from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.10.1.2 - Verify the assigned Sales Engineer is notified when a request is assigned
 *                      to them
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.10.1.2
 *  Jira:             CRM-12224
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Sales Engineer Nick Luchkov (users.pre_sales_engineer); the pre-condition request
 *                    is raised by the Salesperson Thomas Semerich - on PRE-PRODUCTION
 *  Source manual TC: CRM-12224 (Xray Manual Steps, 1 step)
 *  Source version:   updated 2026-09-18T10:25:44+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.10 Notifications
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Nick clicks "Assign To Me" on a New request: Owner = Nick Luchkov after save; the assignment is
 *    logged on the request. Mailbox delivery of the assignment mail stays manual.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.10\.1\.2:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    A request exists in stage New (raise one from an Opportunity as Thomas Semerich: Subject =
 *    "Assign notify <unique>", Support type = "Online technical assistance").
 *      Opportunity: SE Assign Notify <unique> / Test Co <unique> / United States / 5000
 *  Pre-condition 2:
 *    Log in as the Sales Engineer / SE lead - Nick Luchkov.  (done by step 1)
 *
 *  Steps to reproduce:
 *    1. Log in as Nick Luchkov; open the request "Assign notify <unique>" and set Owner = Nick Luchkov
 *       (Assign To Me); save.
 *         Expected: [Automatable] The request Owner = "Nick Luchkov" (assert).
 *                   [Manual] Delivery of the assignment-notification email to the assigned SE is
 *                   verified in the mailbox - not observable via the CRM UI.
 *
 *  BLOCKED (manual only): mailbox delivery - pre-production sends no outbound e-mail. The chatter
 *    tracking line "Assigned to: Nick Luchkov" is printed as an observation (not scored).
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: As the Salesperson Thomas Semerich create an Opportunity and raise a request in stage New: Subject = "Assign notify <unique>", Support type = "Online technical assistance"',
  s1: 'Step 1: Log in as Nick Luchkov; open the request "Assign notify <unique>" and set Owner = Nick Luchkov (Assign To Me); save [MANUAL ONLY part - mailbox delivery: pre-production sends no e-mail]',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.10.1.2';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - Notification when a request is assigned`, () => {
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

  test(`${TC}: Verify the assigned Sales Engineer is notified when a request is assigned to them`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const subject = `Assign notify ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName: `SE Assign Notify ${unique}`, companyName: `Test Co ${unique}`, expectedRevenue: '5000' });
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl, { subject, description: 'Assign notification check', supportType: 'Online technical assistance' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - request raised').catch(() => {});
    });

    let stageBefore = '';
    let owner = '';
    let tracking = '';
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await openSETicketFromHelpdesk(page, subject);
      stageBefore = await helpdesk.getStageName();
      console.log(`  - Stage before assign : ${stageBefore}`);
      await helpdesk.clickAssignToMe();
      await helpdesk.reloadTicket();
      owner = await helpdesk.getAssignedTo();
      const thread = await helpdesk.getChatterThread();
      tracking = (thread.find((m) => m.body.includes('Assigned to:')) || { body: '' }).body;
      console.log(`  - Owner (Assigned to) : ${owner}`);
      console.log(`  - Chatter tracking    : ${tracking || '(none)'}`);
      console.log('  - [MANUAL ONLY] mailbox delivery of the assignment mail: not checked (pre-production sends no e-mail)');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - assigned to Nick').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        { what: 'Pre-condition: the request starts in stage New', expected: 'New', actual: stageBefore, pass: stageBefore === 'New' },
        { what: 'The request Owner', expected: 'Nick Luchkov', actual: owner || '(empty)', pass: owner === 'Nick Luchkov' },
      ];
      const ok = printVerify(lines, 'the request is assigned to Nick Luchkov');
      console.log(`  Observation (not scored) - assignment tracking on the request : ${tracking || '(none)'}`);
      console.log('  Observation (not scored) - assignment mail DELIVERY: MANUAL ONLY (no outbound e-mail on pre-production)');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Owner`, passed: ok, highlight: ["[name='user_id']"], lines: verifyCaption(lines) }).catch(() => {});
      expect(stageBefore, 'the request should start in stage New').toBe('New');
      expect(owner, 'Owner (Assigned to)').toBe('Nick Luchkov');
    });
  });
});
