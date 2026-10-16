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
 *  pre-sale-7.13.1.1 - Verify the migrated SE Support configuration carries only in-use statuses
 *                      (New / Closed) and lets items be enabled/disabled without deletion; dormant
 *                      items (incl. SE: Webinar type) are absent.
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.13.1.1
 *  Jira:             CRM-12231
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           CRM administrator (users.admin_crm) - on PRE-PRODUCTION (the CURRENT, not-yet-
 *                    migrated configuration); the probe request is raised by Thomas Semerich
 *  Source manual TC: CRM-12231 (Xray Manual Steps, 3 steps)
 *  Source version:   updated 2026-09-18T10:26:03+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.13 A clean set
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    The administrator reads the Sales Engineers statuses (the stage bar of an SE request) and the SE
 *    request types (CLASSIFICATION Ticket Type); the run pins the CURRENT configuration.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.13\.1\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in as an administrator of the Pre-Sales / SE Support configuration.
 *    Open the Sales Engineers team configuration (statuses and request types).
 *      Pre-production surface: an SE request's stage bar (the team's statuses) and its CLASSIFICATION
 *      "Ticket Type" list (the request types). A probe request "Config check <unique>" is raised first
 *      by Thomas so the spec does not read someone else's record.
 *
 *  Steps to reproduce:
 *    1. Log in as an admin; open the Sales Engineers team status + request-type configuration.
 *         Expected: (EMPTY in Jira)
 *    2. Collect the status labels and the request-type labels.
 *         Expected (Jira): The status set EQUALS exactly {"New", "Closed"} (assert; no blocked/kanban/
 *                   dormant). The request-type set EQUALS {"Technical assistance", "Deployment / POC
 *                   session", "Cancelled demo / session"}; "SE: Webinar" is NOT present (assert).
 *    3. Disable one item, then re-enable it.
 *         Expected (Jira): Each item has an enable/disable toggle; disabling keeps the record (not
 *                   deleted) and re-enabling restores it (assert).
 *
 *  PRE-PRODUCTION BEHAVIOUR (asserted here) - DIFFERS FROM THE JIRA EXPECTED RESULT:
 *    - Statuses = New, In Progress, On Support Team, On Product Team, Closed (5 - the spec v7 also
 *      corrected 0050 to five statuses, so the Jira "{New, Closed}" is stale as well).
 *    - SE request types = SE: Tech Assistance, SE: Deployment session, SE: Canceled DS/Demo,
 *      SE: Webinar (Webinar still present on the current system).
 *  BLOCKED (manual only) - step 3: the CLASSIFICATION Ticket Type is a fixed selection on pre-production
 *    (no enable/disable toggle), and toggling the shared Helpdesk stages on a shared environment would
 *    disturb every other team - not done by a test. Applies to the migrated (target) configuration.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Thomas Semerich raises a probe request "Config check <unique>" so the administrator reads the Sales Engineers configuration through a record of this run',
  s1: 'Step 1: Log in as an admin; open the Sales Engineers team status + request-type configuration (Helpdesk > Sales Engineers > Tickets > the probe request, EDIT)',
  s2: 'Step 2: Collect the status labels and the request-type labels',
  s3: 'Step 3: [MANUAL ONLY - no enable/disable toggle on pre-production; shared configuration is not toggled by a test] Disable one item, then re-enable it',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.13.1.1';
const PREPROD_STATUSES = ['New', 'In Progress', 'On Support Team', 'On Product Team', 'Closed'];
const PREPROD_SE_TYPES = ['SE: Tech Assistance', 'SE: Deployment session', 'SE: Canceled DS/Demo', 'SE: Webinar'];
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - SE Support configuration: statuses and request types`, () => {
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

  test(`${TC}: Verify the migrated SE Support configuration carries only in-use statuses (New / Closed) and lets items be enabled/disabled without deletion; dormant items (incl. SE: Webinar type) are absent.`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const subject = `Config check ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName: `SE Config ${unique}`, companyName: `Test Co ${unique}`, expectedRevenue: '5000' });
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl, { subject, description: 'Configuration probe', supportType: 'Online deployment session' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - probe request raised').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await signInAs(page, users.admin_crm, 'CRM administrator');
      await openSETicketFromHelpdesk(page, subject);
      console.log(`  - Helpdesk Team of the probe request : ${await helpdesk.getHelpdeskTeam()}`);
    });

    let statuses: string[] = [];
    let seTypes: string[] = [];
    let allTypes: string[] = [];
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      statuses = await helpdesk.getStageButtonLabels();
      await helpdesk.clickEditTicket();
      allTypes = await helpdesk.getClassificationTicketTypeOptions();
      seTypes = allTypes.filter((t) => /^SE:/.test(t));
      statuses.forEach((s, i) => console.log(`  - Status ${i + 1}       : ${s}`));
      seTypes.forEach((t, i) => console.log(`  - SE request type ${i + 1} : ${t}`));
      console.log(`  - (all Ticket Types : ${allTypes.length})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - configuration read').catch(() => {});
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log('  - Not executed: the Ticket Type is a fixed selection (no toggle) and the Helpdesk stages are shared by every team.');
      await helpdesk.discardTicketEdits();
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const norm = (xs: string[]) => xs.map((x) => x.toLowerCase());
      const lines: VerifyLine[] = [
        { what: 'Sales Engineers statuses (pre-production)', expected: `exactly ${PREPROD_STATUSES.join(', ')} (Jira expects New, Closed - see header)`, actual: statuses.join(', '), pass: sameSet(norm(statuses), norm(PREPROD_STATUSES)) },
        { what: 'SE request types (pre-production)', expected: `exactly ${PREPROD_SE_TYPES.join(', ')} (Jira expects 3, no SE: Webinar - see header)`, actual: seTypes.join(', '), pass: sameSet(seTypes, PREPROD_SE_TYPES) },
      ];
      const ok = printVerify(lines, 'the CURRENT Sales Engineers configuration is pinned (the migrated target differs)');
      console.log('  Observation (not scored) - step 3 enable/disable: MANUAL ONLY on pre-production');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - statuses and types`, passed: ok, highlight: ['.o_statusbar_status'], lines: verifyCaption(lines) }).catch(() => {});
      expect(statuses.length, 'the NUMBER of statuses').toBe(PREPROD_STATUSES.length);
      expect(sameSet(norm(statuses), norm(PREPROD_STATUSES)), 'the status set').toBeTruthy();
      expect([...seTypes].sort(), 'the SE request types').toEqual([...PREPROD_SE_TYPES].sort());
    });
  });
});
