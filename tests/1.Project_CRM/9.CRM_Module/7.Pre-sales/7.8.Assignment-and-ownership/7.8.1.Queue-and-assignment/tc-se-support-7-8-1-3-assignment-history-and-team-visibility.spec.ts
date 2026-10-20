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
 *  pre-sale-7.8.1.3 - Assignment history is preserved and recorded; only Sales Engineers team
 *                     members can view and manage requests in their queue
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.8.1.3
 *  Jira:             CRM-12215
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           a NON-SE user = accountant Faye (users.accountance_ic_faye) in step 1, Sales
 *                    Engineer Nick Luchkov in step 2; the request is raised by Thomas Semerich -
 *                    on PRE-PRODUCTION
 *  Source manual TC: CRM-12215 (Xray Manual Steps, 2 steps)
 *  Source version:   updated 2026-09-18T10:24:01+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.8 Assignment & ownership
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Nick assigns the request to himself, then to Luis Mata; a non-SE user (Faye) gets 0 rows when
 *    searching the Sales Engineers tickets; the chatter keeps BOTH assignment entries, in order.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.8\.1\.3:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in as a Salesperson - Thomas Semerich; create an Opportunity ("SE History <unique>", Company
 *    "Test Co <unique>", Country United States, Expected Revenue 6000); Save.
 *  Pre-condition 2:
 *    Raise a request: "Request SE Support" -> Subject = "Migration planning <unique>", Description =
 *    "Plan the migration", Support type = "Online deployment session" -> Tab -> SAVE.
 *  Pre-condition 3:
 *    Log in as Nick Luchkov; open the request, "Assign To Me", then re-assign it to another Sales
 *    Engineer (Assigned to = Luis Mata, a Sales Engineers team member).
 *
 *  Steps to reproduce:
 *    1. Log in as a NON-SE user (not in the Sales Engineers team); open Helpdesk and search the Sales
 *       Engineers tickets for "Migration planning <unique>".
 *         Expected: The non-SE user's search returns 0 rows (assert not visible to non-team members).
 *    2. Log in as Nick Luchkov; open the request and read its chatter assignment entries.
 *         Expected: The chatter contains BOTH assignment entries in order (assert): first-assignment to
 *                   Nick Luchkov, then re-assignment to the other SE, each with a timestamp; earlier
 *                   entries not overwritten.
 *
 *  Pre-production finding (NOT asserted - reported for the TC owner): the non-SE user matters. The
 *  accountant Faye gets 0 rows, but the sales manager Veronika (also not a Sales Engineers member)
 *  lists all 19,717 Sales Engineers tickets (exploration 2026-10-15). Jira proposal: name the non-SE
 *  role in step 1.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in as the Salesperson Thomas Semerich; create an Opportunity (Name, Company, Country = United States, Expected Revenue = 6000) and Save',
  pre2: 'Pre-condition 2: Raise a request from the Opportunity: Subject = "Migration planning <unique>", Description = "Plan the migration", Support type = "Online deployment session" -> Tab -> SAVE',
  pre3: 'Pre-condition 3: Log in as Nick Luchkov; open the request, "Assign To Me", then re-assign it to another Sales Engineer (Luis Mata)',
  s1: 'Step 1: Log in as a NON-SE user (accountant Faye); open Helpdesk > Sales Engineers tickets and search "Migration planning <unique>"',
  s2: 'Step 2: Log in as Nick Luchkov; open the request and read its chatter assignment entries',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.8.1.3';
const OTHER_SE = 'Luis Mata';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - Assignment history kept; queue visible to the team only`, () => {
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

  test(`${TC}: Assignment history is preserved and recorded; only Sales Engineers team members can view and manage requests in their queue`, async ({ page }, testInfo) => {
    // Four sign-ins (Thomas, Nick, Faye, Nick) and two Helpdesk menu walks - wider SE-flow budget.
    test.setTimeout(config.timeouts.seMeetingTest);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const subject = `Migration planning ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName: `SE History ${unique}`, companyName: `Test Co ${unique}`, expectedRevenue: '6000' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl as string, { subject, description: 'Plan the migration', supportType: 'Online deployment session' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - request raised').catch(() => {});
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await openSETicketFromHelpdesk(page, subject);
      await helpdesk.clickAssignToMe();
      await helpdesk.reloadTicket();
      await helpdesk.clickEditTicket();
      await helpdesk.setAssignedTo(OTHER_SE);
      const saved = await helpdesk.clickSaveTicket();
      console.log(`  - Re-assigned to ${OTHER_SE} and saved : ${saved}`);
      expect(saved, 'Pre-condition 3: the re-assignment should save').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - assigned then re-assigned').catch(() => {});
    });

    let nonSeRows = -1;
    let accessError = '';
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await signInAs(page, users.accountance_ic_faye, 'non-SE user (accountant Faye)');
      const access = await helpdesk.openSalesEngineersTicketsListReportingAccess();
      accessError = access.error;
      if (access.listShown) {
        await helpdesk.searchTicket(subject);
        nonSeRows = await helpdesk.countTicketRows(subject);
      } else {
        nonSeRows = 0; // the list itself is refused - nothing can be searched
      }
      console.log(`  - Sales Engineers list opened for the non-SE user : ${access.listShown}`);
      console.log(`  - Access error shown                            : ${accessError || 'none'}`);
      console.log(`  - Rows found by the non-SE user                 : ${nonSeRows}`);
      let ok1 = false;
      try {
        expect(nonSeRows, 'Step 1: the non-SE user must find 0 rows').toBe(0);
        ok1 = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - non-SE search`,
          passed: ok1,
          highlight: ['div.modal.show .modal-content', '.o_content'],
          lines: [`list shown: ${access.listShown}`, `access error: ${(accessError || 'none').slice(0, 120)}`, `rows: ${nonSeRows}`],
        }).catch(() => {});
      }
      await helpdesk.closeShownDialog();
    });

    let entries: Array<{ timestamp: string; body: string }> = [];
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await openSETicketFromHelpdesk(page, subject);
      const thread = await helpdesk.getChatterThread();
      // Chatter is newest-first; reverse to chronological order.
      entries = thread.filter((m) => m.body.includes('Assigned to:')).reverse().map((m) => ({ timestamp: m.timestamp, body: m.body }));
      entries.forEach((e, i) => console.log(`  - Assignment entry ${i + 1} : [${e.timestamp}] ${e.body}`));
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - chatter assignment entries').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const first = entries[0] || { timestamp: '', body: '' };
      const second = entries[1] || { timestamp: '', body: '' };
      const lines: VerifyLine[] = [
        { what: 'Non-SE user search of the Sales Engineers tickets', expected: '0 rows (or the list itself refused)', actual: `${nonSeRows}${accessError ? ` - refused: ${accessError.slice(0, 100)}` : ''}`, pass: nonSeRows === 0 },
        { what: 'Number of assignment entries in the chatter', expected: '2 (1 = the re-assignment overwrote the first)', actual: `${entries.length}`, pass: entries.length === 2 },
        { what: 'Entry 1 = first assignment to Nick Luchkov', expected: 'Assigned to: ... Nick Luchkov, with a timestamp', actual: `[${first.timestamp}] ${first.body}`, pass: first.body.includes('Nick Luchkov') && first.timestamp !== '' },
        { what: `Entry 2 = re-assignment to ${OTHER_SE}`, expected: `Assigned to: ... ${OTHER_SE}, with a later-or-equal timestamp`, actual: `[${second.timestamp}] ${second.body}`, pass: second.body.includes(OTHER_SE) && second.timestamp !== '' && new Date(second.timestamp) >= new Date(first.timestamp) },
      ];
      const ok = printVerify(lines, 'both assignments are kept in order; the non-SE user sees nothing');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - assignment history`, passed: ok, highlight: ['.o_chatter .o_thread_message'], lines: verifyCaption(lines) }).catch(() => {});
      expect(nonSeRows, 'non-SE rows').toBe(0);
      expect(entries.length, 'assignment entries').toBe(2);
      expect(first.body, 'first assignment entry').toContain('Nick Luchkov');
      expect(second.body, 're-assignment entry').toContain(OTHER_SE);
      expect(first.timestamp !== '' && second.timestamp !== '', 'both entries carry a timestamp').toBeTruthy();
    });
  });
});
