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
 *  pre-sale-7.11.1.2 - Verify the SE Queue view shows subject, Owner, status and priority, and
 *                      higher-priority requests are visually distinguishable.
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.11.1.2
 *  Jira:             CRM-12227
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Sales Engineer Nick Luchkov (users.pre_sales_engineer); the two requests are raised
 *                    by the Salesperson Thomas Semerich - on PRE-PRODUCTION
 *  Source manual TC: CRM-12227 (Xray Manual Steps, 3 steps)
 *  Source version:   updated 2026-09-18T10:25:52+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.11 Seamless experience
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Two requests are prepared at Priority Low and High; in Helpdesk > Sales Engineers > Tickets (list)
 *    Nick sees the Subject / Owner / Status / Priority columns and the two rows read Low and High.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.11\.1\.2:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Two requests exist for the Sales Engineers team: one with Priority = Low (Subject = "Queue Low
 *    <unique>") and one with Priority = High (Subject = "Queue High <unique>").
 *      Built here: Thomas raises both from one Opportunity (SE Queue View <unique> / 5000); Nick opens
 *      each and sets its Priority (requests arrive at Medium on pre-production).
 *  Pre-condition 2:
 *    Log in as the Sales Engineer - Nick Luchkov.  (already signed in)
 *
 *  Steps to reproduce:
 *    1. Log in as Nick Luchkov; open the Sales Engineers queue (list view).  Expected: (EMPTY in Jira)
 *    2. Read the visible columns.
 *         Expected: [Automatable] The queue shows the columns Subject, Owner, Status, Priority (assert
 *                   each present).
 *    3. Read the Priority of "Queue Low <unique>" and "Queue High <unique>".
 *         Expected: The two requests show Priority = "Low" and "High" respectively (assert values).
 *                   [Manual] The visual highlight that makes higher priority stand out is a visual
 *                   check done manually.
 *
 *  Pre-production column labels (Jira proposal): Subject = "Display Name", Owner = "Assigned to",
 *  Status = "Stage", Priority = "Priority".
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Two requests exist for the Sales Engineers team - Thomas raises "Queue Low <unique>" and "Queue High <unique>"; Nick sets their Priority to Low and High',
  s1: 'Step 1: Log in as Nick Luchkov; open the Sales Engineers queue (Helpdesk > Sales Engineers > Tickets, list view)',
  s2: 'Step 2: Read the visible columns',
  s3: 'Step 3: Read the Priority of "Queue Low <unique>" and "Queue High <unique>" [MANUAL ONLY part - the visual highlight of higher priority]',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.11.1.2';
// Jira name -> pre-production list column label.
const COLUMNS: Array<[string, string]> = [['Subject', 'Display Name'], ['Owner', 'Assigned to'], ['Status', 'Stage'], ['Priority', 'Priority']];
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - SE Queue columns and priority`, () => {
  let createdOppUrl: string | null = null;
  const createdSubjects: string[] = [];

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // Two tickets: archive the first alone, then the second together with the Opportunity.
    if (createdSubjects[0]) {
      await deleteCreatedSESupportTicketAndOppAsAdmin(page, { ticketSubject: createdSubjects[0], oppUrl: null }, { ticket: SKIP_CLEANUP_TICKET, opp: true }, testInfo);
    }
    await deleteCreatedSESupportTicketAndOppAsAdmin(page, { ticketSubject: createdSubjects[1] || null, oppUrl: createdOppUrl }, { ticket: SKIP_CLEANUP_TICKET, opp: SKIP_CLEANUP_OPP }, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Verify the SE Queue view shows subject, Owner, status and priority, and higher-priority requests are visually distinguishable.`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.seMeetingTest);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdesk = new HelpdeskPage(page);
    const homePage = new HomePage(page);
    const unique = presalesRunId();
    const low = `Queue Low ${unique}`;
    const high = `Queue High ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName: `SE Queue View ${unique}`, companyName: `Test Co ${unique}`, expectedRevenue: '5000' });
      for (const subject of [low, high]) {
        createdSubjects.push(subject);
        await raiseSERequestFromOpportunity(page, createdOppUrl, { subject, description: 'Queue view check', supportType: 'Online deployment session' });
      }
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      for (const [subject, priority] of [[low, 'Low'], [high, 'High']] as const) {
        if (subject === low) await openSETicketFromHelpdesk(page, subject);
        else { await helpdesk.openSalesEngineersTicketsListDirect(); await helpdesk.searchTicket(subject); await helpdesk.openTicket(subject); }
        await helpdesk.clickEditTicket();
        await helpdesk.setPriority(priority);
        const saved = await helpdesk.clickSaveTicket();
        console.log(`    - ${subject.padEnd(40)} Priority = ${priority} (saved: ${saved})`);
        expect(saved, `Pre-condition 1: Priority ${priority} should save on "${subject}"`).toBeTruthy();
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Low and High requests ready').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.pageLoad);
      await helpdesk.navigateToHelpdesk();
      await helpdesk.openSalesEngineersTickets();
      await helpdesk.switchToListView();
      await helpdesk.searchTicket(unique);
    });

    let headers: string[] = [];
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      headers = await helpdesk.getListHeaders();
      headers.forEach((h, i) => console.log(`  - Column ${String(i + 1).padStart(2)} : ${h}`));
      const missing = COLUMNS.filter(([, label]) => !headers.includes(label)).map(([j, l]) => `${j} (${l})`);
      let ok2 = false;
      try {
        expect(missing, 'Step 2: queue columns missing').toEqual([]);
        ok2 = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - queue columns`, passed: ok2, highlight: ['.o_list_view thead'], lines: [`missing: ${missing.join(', ') || 'none'}`] }).catch(() => {});
      }
    });

    const read = { low: '', high: '' };
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      read.low = await helpdesk.getListRowPriority(low);
      read.high = await helpdesk.getListRowPriority(high);
      console.log(`  - "${low}"  Priority = ${read.low}`);
      console.log(`  - "${high}" Priority = ${read.high}`);
      console.log('  - [MANUAL ONLY] visual highlight of the higher priority: not scored');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - queue rows read').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        ...COLUMNS.map(([jira, label]) => ({ what: `Queue column ${jira}`, expected: `present as "${label}"`, actual: headers.includes(label) ? 'present' : 'ABSENT', pass: headers.includes(label) })),
        { what: `Priority of "${low}"`, expected: 'Low', actual: read.low, pass: read.low === 'Low' },
        { what: `Priority of "${high}"`, expected: 'High', actual: read.high, pass: read.high === 'High' },
      ];
      const ok = printVerify(lines, 'the queue shows Subject / Owner / Status / Priority and the two priorities read back');
      console.log('  Observation (not scored) - higher-priority visual highlight: MANUAL ONLY');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - queue rows`, passed: ok, highlight: ['.o_list_view thead', 'tr.o_data_row'], lines: verifyCaption(lines) }).catch(() => {});
      expect(ok, 'every queue check').toBeTruthy();
    });
  });
});
