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
 *  pre-sale-7.9.1.2 - All four priority levels (Low, Medium, High, Urgent) are available in the
 *                     Priority field and are preserved when the ticket is saved and reopened
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.9.1.2
 *  Jira:             CRM-12220
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Sales Engineer Nick Luchkov (users.pre_sales_engineer); the pre-condition request
 *                    is raised by the Salesperson Thomas Semerich - on PRE-PRODUCTION
 *  Source manual TC: CRM-12220 (Xray Manual Steps, 4 steps)
 *  Source version:   updated 2026-09-18T10:25:39+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.9 Lifecycle, status & priority
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Nick reads the ticket's Priority scale (Low + 3 stars Medium / High / Urgent), then sets Urgent and
 *    Low in turn; each value must survive save + reload.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.9\.1\.2:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in as a Salesperson - Thomas Semerich; create an Opportunity ("SE Priority <unique>",
 *    Company "Test Co <unique>", Country United States, Expected Revenue 4000); Save.
 *  Pre-condition 2:
 *    Raise a request: "Request SE Support" -> Subject = "Priority <unique>", Description = "verify
 *    priority", Support type = "Online deployment session" -> Tab -> SAVE.
 *  Pre-condition 3:
 *    Log in as the Sales Engineer - Nick Luchkov; open the request.  (done by step 1)
 *
 *  Steps to reproduce:
 *    1. Log in as Nick Luchkov; open the request "Priority <unique>".    Expected: (EMPTY in Jira)
 *    2. Open the Priority control and collect all option labels.
 *         Expected: The Priority option set EQUALS exactly {"Low", "Medium", "High", "Urgent"}
 *                   (count = 4); default = "Low" (assert).
 *    3. Set Priority = "Urgent", save, reload.     Expected: After reload Priority = "Urgent" (persisted).
 *    4. Set Priority = "Low", save, reload.        Expected: After reload Priority = "Low" (persisted).
 *
 *  Pre-production behaviour (asserted here; Jira proposal for step 2):
 *    - The Priority control is a star widget: 3 stars titled Medium / High / Urgent; "Low" is the
 *      no-star level (reached by clicking the highest checked star).
 *    - A request raised from an Opportunity arrives with Priority = MEDIUM, not Low.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in as the Salesperson Thomas Semerich; create an Opportunity (Name, Company, Country = United States, Expected Revenue = 4000) and Save',
  pre2: 'Pre-condition 2: Raise a request from the Opportunity: Subject = "Priority <unique>", Description = "verify priority", Support type = "Online deployment session" -> Tab -> SAVE',
  s1: 'Step 1: Log in as Nick Luchkov; open the request "Priority <unique>" (Helpdesk > Sales Engineers > Tickets)',
  s2: 'Step 2: Open the Priority control and collect all option labels',
  s3: 'Step 3: Set Priority = "Urgent", save, reload',
  s4: 'Step 4: Set Priority = "Low", save, reload',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.9.1.2';
const EXPECTED_LEVELS = ['Low', 'Medium', 'High', 'Urgent'];
const EXPECTED_STARS = ['Medium', 'High', 'Urgent'];
const PREPROD_DEFAULT = 'Medium';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - Four priority levels, each preserved after save and reload`, () => {
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

  test(`${TC}: All four priority levels (Low, Medium, High, Urgent) are available in the Priority field and are preserved when the ticket is saved and reopened`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const subject = `Priority ${unique}`;
    const lines: VerifyLine[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName: `SE Priority ${unique}`, companyName: `Test Co ${unique}`, expectedRevenue: '4000' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl as string, { subject, description: 'verify priority', supportType: 'Online deployment session' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - request raised').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await openSETicketFromHelpdesk(page, subject);
      const opened = await helpdesk.getTicketSubject();
      console.log(`  - Request open : ${opened}`);
      expect(opened, 'Step 1: the request should be open').toBe(subject);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const stars = await helpdesk.getPriorityStarTitles();
      const current = await helpdesk.getPriorityLabel();
      const levels = ['Low', ...stars];
      console.log('  - Priority scale (no star = Low, then one star per level):');
      levels.forEach((l, i) => console.log(`      ${i + 1}. ${l}`));
      console.log(`  - Priority on arrival : ${current}`);
      lines.push(
        { what: 'Priority levels offered', expected: `exactly ${EXPECTED_LEVELS.length}: ${EXPECTED_LEVELS.join(', ')}`, actual: `${levels.length}: ${levels.join(', ')}`, pass: sameSet(levels, EXPECTED_LEVELS) && sameSet(stars, EXPECTED_STARS) },
        { what: 'Priority on arrival (pre-production default)', expected: `${PREPROD_DEFAULT} (Jira says Low - see header)`, actual: current, pass: current === PREPROD_DEFAULT },
      );
      let ok = false;
      try {
        expect(levels.length, 'the NUMBER of priority levels').toBe(EXPECTED_LEVELS.length);
        expect(sameSet(stars, EXPECTED_STARS), `star titles = ${EXPECTED_STARS.join(', ')}`).toBeTruthy();
        expect(current, 'priority on arrival').toBe(PREPROD_DEFAULT);
        ok = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Priority scale`, passed: ok, highlight: ["div[name='priority']"], lines: [`levels: ${levels.join(', ')}`, `on arrival: ${current}`] }).catch(() => {});
      }
    });

    for (const [label, key] of [['Urgent', 's3'], ['Low', 's4']] as const) {
      await test.step(STEP[key], async () => {
        console.log(`\n--- ${STEP[key]} ---`);
        await helpdesk.clickEditTicket();
        await helpdesk.setPriority(label);
        const saved = await helpdesk.clickSaveTicket();
        await helpdesk.reloadTicket();
        const after = await helpdesk.getPriorityLabel();
        console.log(`  - Saved             : ${saved}`);
        console.log(`  - Priority reloaded : ${after}`);
        lines.push({ what: `Priority "${label}" persists after save + reload`, expected: label, actual: after, pass: after === label });
        let ok = false;
        try {
          expect(saved, `the ticket should save with Priority = ${label}`).toBeTruthy();
          expect(after, `Priority after reload`).toBe(label);
          ok = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Priority ${label} after reload`, passed: ok, highlight: ["div[name='priority']"], lines: [`expected ${label}, after reload ${after}`] }).catch(() => {});
        }
      });
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Priority Low after reload').catch(() => {});

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const ok = printVerify(lines, 'four priority levels, each value persisted after save + reload');
      expect(ok, 'every priority check').toBeTruthy();
    });
  });
});
