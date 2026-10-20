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
 *  pre-sale-7.8.1.2 - A request can be re-assigned from its current Owner to a different Sales
 *                     Engineer
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.8.1.2
 *  Jira:             CRM-12214
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Sales Engineer Nick Luchkov (users.pre_sales_engineer); the pre-condition request
 *                    is raised by the Salesperson Thomas Semerich - on PRE-PRODUCTION
 *  Source manual TC: CRM-12214 (Xray Manual Steps, 3 steps)
 *  Source version:   updated 2026-09-18T10:23:59+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.8 Assignment & ownership
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Nick owns the request (Assign To Me), then sets Assigned to = Luis Mata (another Sales Engineers
 *    team member) and saves: the Owner is Luis Mata, no longer Nick, and the Stage is unchanged.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.8\.1\.2:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in as a Salesperson - Thomas Semerich; create an Opportunity ("SE Reassign <unique>", Company
 *    "Test Co <unique>", Country United States, Expected Revenue 10000); Save.
 *  Pre-condition 2:
 *    Raise a request: "Request SE Support" -> Subject = "Architecture review <unique>", Description =
 *    "Design consultation", Support type = "Offline technical assistance" -> Tab -> SAVE.
 *  Pre-condition 3:
 *    Log in as the Sales Engineer - Nick Luchkov; open the request from Helpdesk -> Sales Engineers ->
 *    Tickets and click "Assign To Me" (Owner = Nick Luchkov).
 *
 *  Steps to reproduce:
 *    1. Log in as Nick Luchkov (current Owner); open the request "Architecture review <unique>".
 *         Expected: (EMPTY in Jira - the spec confirms Owner = Nick Luchkov)
 *    2. Set the Owner field to a DIFFERENT Sales Engineer account.
 *            Assigned to = Luis Mata   (a member of the Sales Engineers team on pre-production)
 *         Expected: (EMPTY in Jira)
 *    3. Save.
 *         Expected: The request Owner EQUALS the newly selected Sales Engineer (assert); Nick Luchkov is
 *                   no longer Owner; Stage unchanged.
 *
 *  Pre-production wording: "Owner" = the "Assigned to" field.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in as the Salesperson Thomas Semerich; create an Opportunity (Name, Company, Country = United States, Expected Revenue = 10000) and Save',
  pre2: 'Pre-condition 2: Raise a request from the Opportunity: Subject = "Architecture review <unique>", Description = "Design consultation", Support type = "Offline technical assistance" -> Tab -> SAVE',
  pre3: 'Pre-condition 3: Log in as the Sales Engineer Nick Luchkov; open the request from Helpdesk > Sales Engineers > Tickets and click "Assign To Me"',
  s1: 'Step 1: Log in as Nick Luchkov (current Owner); open the request "Architecture review <unique>"',
  s2: 'Step 2: Set the Owner (Assigned to) field to a DIFFERENT Sales Engineer account (Luis Mata)',
  s3: 'Step 3: Save',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.8.1.2';
const OTHER_SE = 'Luis Mata';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - Re-assign a request to a different Sales Engineer`, () => {
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

  test(`${TC}: A request can be re-assigned from its current Owner to a different Sales Engineer`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const subject = `Architecture review ${unique}`;
    let stageBefore = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName: `SE Reassign ${unique}`, companyName: `Test Co ${unique}`, expectedRevenue: '10000' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl as string, { subject, description: 'Design consultation', supportType: 'Offline technical assistance' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - request raised').catch(() => {});
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await openSETicketFromHelpdesk(page, subject);
      await helpdesk.clickAssignToMe();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - assigned to Nick').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdesk.reloadTicket();
      const opened = await helpdesk.getTicketSubject();
      const owner = await helpdesk.getAssignedTo();
      stageBefore = await helpdesk.getStageName();
      console.log(`  - Request open      : ${opened}`);
      console.log(`  - Owner (Assigned to): ${owner}`);
      console.log(`  - Stage             : ${stageBefore}`);
      expect(opened, 'Step 1: the request should be open').toBe(subject);
      expect(owner, 'Step 1: the current Owner is Nick Luchkov').toBe('Nick Luchkov');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await helpdesk.clickEditTicket();
      await helpdesk.setAssignedTo(OTHER_SE);
    });

    let saved = false;
    let ownerAfter = '';
    let stageAfter = '';
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      saved = await helpdesk.clickSaveTicket();
      await helpdesk.reloadTicket();
      ownerAfter = await helpdesk.getAssignedTo();
      stageAfter = await helpdesk.getStageName();
      console.log(`  - Saved               : ${saved}`);
      console.log(`  - Owner after reload  : ${ownerAfter}`);
      console.log(`  - Stage after reload  : ${stageAfter}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - re-assigned and saved').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        { what: 'The re-assignment saves', expected: 'saved (form back in read mode)', actual: saved ? 'saved' : 'NOT saved', pass: saved },
        { what: 'Owner equals the newly selected Sales Engineer', expected: OTHER_SE, actual: ownerAfter, pass: ownerAfter === OTHER_SE },
        { what: 'Nick Luchkov is no longer Owner', expected: 'Owner != Nick Luchkov', actual: ownerAfter, pass: ownerAfter !== 'Nick Luchkov' },
        { what: 'Stage unchanged by the re-assignment', expected: stageBefore, actual: stageAfter, pass: stageAfter === stageBefore },
      ];
      const ok = printVerify(lines, 'the request is re-assigned to another Sales Engineer');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - re-assigned`, passed: ok, highlight: ["[name='user_id']", '.o_statusbar_status'], lines: verifyCaption(lines) }).catch(() => {});
      expect(saved, 'the re-assignment should save').toBeTruthy();
      expect(ownerAfter, 'Owner (Assigned to)').toBe(OTHER_SE);
      expect(stageAfter, 'Stage must be unchanged').toBe(stageBefore);
    });
  });
});
