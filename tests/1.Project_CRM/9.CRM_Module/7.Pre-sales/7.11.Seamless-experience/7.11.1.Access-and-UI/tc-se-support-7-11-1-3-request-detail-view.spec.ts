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
 *  pre-sale-7.11.1.3 - Verify the request detail view shows Opportunity context, correspondence,
 *                      Owner, status, priority and timestamps.
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.11.1.3
 *  Jira:             CRM-12228
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Sales Engineer Nick Luchkov (users.pre_sales_engineer); the request is raised by
 *                    the Salesperson Thomas Semerich - on PRE-PRODUCTION
 *  Source manual TC: CRM-12228 (Xray Manual Steps, 2 steps)
 *  Source version:   updated 2026-09-18T10:25:55+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.11 Seamless experience
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Nick opens his High-priority request and the form shows the Opportunity context (name + 25000),
 *    a correspondence thread, Owner = Nick, a Stage, Priority = High and a creation timestamp.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.11\.1\.3:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in as a Salesperson - Thomas Semerich; create an Opportunity ("SE Detail View <unique>",
 *    Company "Test Co <unique>", Country United States, Expected Revenue 25000); Save.
 *  Pre-condition 2:
 *    Raise a request: Subject = "Detail view <unique>", Support type = "Online deployment session",
 *    set Priority = High.  (the New Ticket window has no Priority - Nick sets it on the request)
 *  Pre-condition 3:
 *    Log in as the Sales Engineer - Nick Luchkov; open the request and "Assign To Me".
 *
 *  Steps to reproduce:
 *    1. Log in as Nick Luchkov; open the request "Detail view <unique>" (assigned to Nick).
 *         Expected: (EMPTY in Jira - the spec confirms the request is open)
 *    2. Read the fields shown on the detail view.
 *         Expected: The detail view shows ALL of (assert each present): Opportunity context (name
 *                   "SE Detail View <unique>", Expected Revenue 25000 / Opportunity Info), a
 *                   Correspondence section, Owner = "Nick Luchkov", Status, Priority = "High", a
 *                   creation timestamp.
 *
 *  Pre-production mapping: Correspondence = the chatter thread; Status = the Stage; creation
 *  timestamp = "Created on" (create_date).
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in as the Salesperson Thomas Semerich; create an Opportunity (Name, Company, Country = United States, Expected Revenue = 25000) and Save',
  pre2: 'Pre-condition 2: Raise a request: Subject = "Detail view <unique>", Support type = "Online deployment session"',
  pre3: 'Pre-condition 3: Log in as the Sales Engineer Nick Luchkov; open the request, "Assign To Me" and set Priority = High',
  s1: 'Step 1: Log in as Nick Luchkov; open the request "Detail view <unique>" (assigned to Nick)',
  s2: 'Step 2: Read the fields shown on the detail view',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.11.1.3';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;
const toNumber = (s: string) => Number((s.match(/[\d.,]+/) || ['0'])[0].replace(/,/g, ''));

test.describe(`${TC} - Request detail view content`, () => {
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

  test(`${TC}: Verify the request detail view shows Opportunity context, correspondence, Owner, status, priority and timestamps.`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const oppName = `SE Detail View ${unique}`;
    const subject = `Detail view ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName, companyName: `Test Co ${unique}`, expectedRevenue: '25000' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl as string, { subject, description: 'Detail view check', supportType: 'Online deployment session' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - request raised').catch(() => {});
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await openSETicketFromHelpdesk(page, subject);
      await helpdesk.clickAssignToMe();
      await helpdesk.reloadTicket();
      await helpdesk.clickEditTicket();
      await helpdesk.setPriority('High');
      const saved = await helpdesk.clickSaveTicket();
      expect(saved, 'Pre-condition 3: Priority High should save').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - assigned, Priority High').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdesk.reloadTicket();
      const opened = await helpdesk.getTicketSubject();
      console.log(`  - Request open : ${opened}`);
      expect(opened, 'Step 1: the request should be open').toBe(subject);
    });

    const v = { owner: '', stage: '', priority: '', created: '', thread: 0, opp: '', revenue: '' };
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      v.owner = await helpdesk.getAssignedTo();
      v.stage = await helpdesk.getStageName();
      v.priority = await helpdesk.getPriorityLabel();
      v.created = await helpdesk.getFieldValueByName('create_date');
      v.thread = (await helpdesk.getChatterThread()).length;
      await helpdesk.openOpportunityInfoTab();
      v.opp = await helpdesk.getFieldValueByName('opportunity_id');
      v.revenue = await helpdesk.getFieldValueByName('lead_planed_revenue');
      console.log(`  - Owner (Assigned to)     = ${v.owner}`);
      console.log(`  - Status (Stage)          = ${v.stage}`);
      console.log(`  - Priority                = ${v.priority}`);
      console.log(`  - Created on              = ${v.created}`);
      console.log(`  - Correspondence messages = ${v.thread}`);
      console.log(`  - Opportunity             = ${v.opp}`);
      console.log(`  - Expected Revenue Deal   = ${v.revenue}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - detail view read').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        { what: 'Opportunity context - name', expected: oppName, actual: v.opp || '(empty)', pass: v.opp === oppName },
        { what: 'Opportunity context - Expected Revenue', expected: '25000', actual: v.revenue || '(empty)', pass: toNumber(v.revenue) === 25000 },
        { what: 'Correspondence section', expected: '>= 1 message in the thread', actual: `${v.thread}`, pass: v.thread >= 1 },
        { what: 'Owner', expected: 'Nick Luchkov', actual: v.owner, pass: v.owner === 'Nick Luchkov' },
        { what: 'Status (Stage)', expected: 'a stage is shown (New for this fresh request)', actual: v.stage || '(empty)', pass: v.stage === 'New' },
        { what: 'Priority', expected: 'High', actual: v.priority, pass: v.priority === 'High' },
        { what: 'Creation timestamp (Created on)', expected: 'a date-time', actual: v.created || '(empty)', pass: /\d{1,2}\/\d{1,2}\/\d{4}/.test(v.created) },
      ];
      const ok = printVerify(lines, 'the detail view carries context, correspondence, owner, status, priority and a timestamp');
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - detail view`,
        passed: ok,
        highlight: ["[name='opportunity_id']", "[name='lead_planed_revenue']", "[name='user_id']", "div[name='priority']", '.o_statusbar_status'],
        lines: verifyCaption(lines),
      }).catch(() => {});
      expect(ok, 'every detail-view check').toBeTruthy();
    });
  });
});
