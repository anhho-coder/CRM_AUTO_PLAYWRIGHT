import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { HomePage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import {
  createPresalesOpportunityAsThomas, openSETicketFromHelpdesk, presalesRunId, printVerify, raiseSERequestFromOpportunity,
  sameSet, signInAs, verifyCaption, VerifyLine,
} from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.7.3.2 - The request carries a request type limited to the three in-use values;
 *                     dormant types are absent
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.7.3.2
 *  Jira:             CRM-12211
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Sales Engineer Nick Luchkov (users.pre_sales_engineer); the pre-condition request
 *                    is raised by the Salesperson Thomas Semerich - on PRE-PRODUCTION
 *  Source manual TC: CRM-12211 (Xray Manual Steps, 3 steps)
 *  Source version:   updated 2026-09-18T10:23:57+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.7 Raising a request from the CRM
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Nick opens the request and reads the CLASSIFICATION "Ticket Type" dropdown; the run pins the
 *    pre-production option list and its SE-specific subset.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.7\.3\.2:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in to the CRM (pre-production) as a Salesperson - Thomas Semerich.
 *    Open CRM -> My Pipeline, click "New", and create an Opportunity with:
 *      - Opportunity Name  = SE Request Type <unique>
 *      - Company           = Test Co <unique>
 *      - Country           = United States
 *      - Expected Revenue  = 5000
 *    Click "Save".
 *  Pre-condition 2:
 *    Raise a request: "Request SE Support" -> Subject = "Type check <unique>", Description = "verify
 *    types", Support type = "Online deployment session" -> Tab -> SAVE.
 *
 *  Steps to reproduce:
 *    1. Log in as Nick Luchkov.                                              Expected: (EMPTY in Jira)
 *    2. Open the request "Type check <unique>" from Helpdesk -> Sales Engineers -> Tickets.
 *                                                                            Expected: (EMPTY in Jira)
 *    3. Open the "Ticket Type" dropdown and collect all option labels.
 *         Expected (Jira): The "Ticket Type" option set EQUALS exactly {"Technical assistance",
 *                   "Deployment / POC session", "Cancelled demo / session"} (count = 3,
 *                   set-equality). Assert "SE: Webinar" is NOT present.
 *
 *  PRE-PRODUCTION BEHAVIOUR (asserted here, measured 2026-10-15) - DIFFERS FROM THE JIRA EXPECTED RESULT:
 *    The Ticket Type (CLASSIFICATION group, read in EDIT mode) is ONE shared list of 16 values for every
 *    Helpdesk team; its SE subset is SE: Tech Assistance / SE: Deployment session / SE: Canceled
 *    DS/Demo / SE: Webinar. "SE: Webinar" IS still offered on the current system - the 3-value set in
 *    Jira is the migration TARGET. Jira proposal: point this TC at the target app, or re-word it to the
 *    pre-production labels above.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in to the CRM (pre-production) as the Salesperson Thomas Semerich; open CRM > list view > CREATE an Opportunity (Name, Company, Country = United States, Expected Revenue = 5000) and Save',
  pre2: 'Pre-condition 2: Raise a request from the Opportunity: Subject = "Type check <unique>", Description = "verify types", Support type = "Online deployment session" -> Tab -> SAVE',
  s1: 'Step 1: Log in as Nick Luchkov',
  s2: 'Step 2: Open the request "Type check <unique>" from Helpdesk > Sales Engineers > Tickets',
  s3: 'Step 3: Open the "Ticket Type" dropdown (EDIT > CLASSIFICATION > Ticket Type) and collect all option labels',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.7.3.2';
const PREPROD_TICKET_TYPES = [
  'Feature request', 'Support Requests', 'Gift card', 'Partner approval', 'Question', 'Other',
  'SE: Tech Assistance', 'SE: Deployment session', 'SE: Canceled DS/Demo', 'SE: Webinar',
  'IT: Incident', 'IT: Request', 'IT Security: Incident', 'Subtask', 'IT security: Task', 'IT security: Vulnerability',
];
const PREPROD_SE_TYPES = ['SE: Tech Assistance', 'SE: Deployment session', 'SE: Canceled DS/Demo', 'SE: Webinar'];
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - Request type values offered on the request`, () => {
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

  test(`${TC}: The request carries a request type limited to the three in-use values; dormant types are absent`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const subject = `Type check ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName: `SE Request Type ${unique}`, companyName: `Test Co ${unique}`, expectedRevenue: '5000' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl as string, { subject, description: 'verify types', supportType: 'Online deployment session' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - request raised').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await openSETicketFromHelpdesk(page, subject);
      const opened = await helpdesk.getTicketSubject();
      console.log(`  - Request open : ${opened}`);
      expect(opened, 'Step 2: the request should be open').toBe(subject);
    });

    let options: string[] = [];
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await helpdesk.clickEditTicket();
      options = await helpdesk.getClassificationTicketTypeOptions();
      options.forEach((o, i) => console.log(`  - Option ${String(i + 1).padStart(2)} : ${o}`));
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Ticket Type options read').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const seOptions = options.filter((o) => /^SE:/.test(o));
      const lines: VerifyLine[] = [
        { what: 'Number of Ticket Type options (pre-production)', expected: `${PREPROD_TICKET_TYPES.length}`, actual: `${options.length}`, pass: options.length === PREPROD_TICKET_TYPES.length },
        { what: 'Ticket Type option set (pre-production)', expected: PREPROD_TICKET_TYPES.join(', '), actual: options.join(', '), pass: sameSet(options, PREPROD_TICKET_TYPES) },
        { what: 'SE-specific Ticket Types', expected: `exactly ${PREPROD_SE_TYPES.join(', ')} (Jira expects 3 values without SE: Webinar - see header)`, actual: seOptions.join(', '), pass: sameSet(seOptions, PREPROD_SE_TYPES) },
      ];
      const ok = printVerify(lines, 'the pre-production Ticket Type list is pinned (differs from the Jira 3-value target)');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Ticket Type options`, passed: ok, highlight: ["select[name='classification_ticket_type']"], lines: verifyCaption(lines) }).catch(() => {});
      await helpdesk.discardTicketEdits();
      expect(options.length, 'the NUMBER of Ticket Type options').toBe(PREPROD_TICKET_TYPES.length);
      expect([...options].sort(), 'the Ticket Type option set').toEqual([...PREPROD_TICKET_TYPES].sort());
      expect([...seOptions].sort(), 'the SE Ticket Types').toEqual([...PREPROD_SE_TYPES].sort());
    });
  });
});
