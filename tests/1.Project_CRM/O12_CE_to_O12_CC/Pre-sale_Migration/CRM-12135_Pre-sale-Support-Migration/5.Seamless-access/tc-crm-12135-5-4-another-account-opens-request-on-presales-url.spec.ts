import { test, expect, BrowserContext, Page } from '@playwright/test';
import { users, baseUrl_mig, baseUrl_presales_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_5.4 - Another account opens a salesperson's request directly on the Pre-Sales URL
 * ============================================================================================
 * Test Case ID   : CRM-12135_5.4
 * Jira           : none yet (feature CRM-12135)
 * Requirements   : FUNC-0064 (direct access = the account's own sign-in)
 * Run as         : Salesperson Thomas Semerich (thomas.semerich@nakivo.com) for the pre-conditions;
 *                  Ho Quoc Anh (anh.ho@nakivo.com) on the Pre-Sales Application, in a DIFFERENT
 *                  browser, for the steps
 * Automation-Type: new
 * Automation-Date: 2026-10-16
 * Source TC      : NONE in Xray yet - scenario 2 given by the tester (anh.ho) on 2026-10-16:
 *                  "Thomas tao Opp, request pre-sales ticket. Account khac dang nhap pre-sales URL
 *                  va open pre-sales ticket", option (a) "Browser khac" chosen by the tester.
 * Source version : n/a - pin the Xray key and its `updated` stamp here once the manual TC exists
 * Evidence       : screenshot at the end of each sub-section, a verify-point capture, afterEach
 *                  start/end, video of both browsers.
 *
 * NOT COVERED HERE - the CRM-13517 fix
 * ------------------------------------
 *   Each browser holds ONE account, so the CRM never signs a previous Pre-Sales user out - the code
 *   path Nathan Do fixed on CRM-13517 ("two different accounts in the same browser") does not run.
 *
 * Summary
 * -------
 *   Thomas Semerich creates an Opportunity and raises a request on it; another account signs in to
 *   the Pre-Sales Application URL in a separate browser, finds that request and opens it.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_5\.4:" --project=O12
 *
 * Source manual TC (as given by the tester, written out step by step)
 * --------------------------------------------------------------------
 *   Pre-condition(s):
 *      1. On the CRM (crm-mig) sign in as the salesperson Thomas Semerich.
 *      2. On the CRM open CRM (left sidebar) > Pipeline, switch to LIST view (in kanban CREATE opens
 *         a quick-create card without Expected Revenue Deal), click CREATE, enter the Opportunity
 *         and SAVE:
 *            - Opportunity name      = AUTO-CRM-12135-TC-5-4-<runId>
 *            - Expected Revenue Deal = 900   (the raise control needs >= $100)
 *            - Email / Contact       = blank (an e-mail starts an async Company/Contact creation
 *                                      whose partners the marker sweep cannot find)
 *            - Salesperson           = left at its default, the signed-in user
 *      3. On that Opportunity click "Request SE support" (under More when the header row is full),
 *         fill the dialog and SAVE:
 *            - Subject      = AUTO-CRM-12135-TC-5-4-<runId> request
 *            - Meeting Time = blank
 *            - Description  = Automated check of CRM-12135_5.4 - another account opens Thomas's request.
 *            - Meeting link = blank
 *            - Support type = Offline technical assistance
 *
 *   Steps to reproduce:
 *      1. In a different browser open the Pre-Sales Application URL
 *         (https://pre-sales-crm-mig.nakivo.site/web/login) and sign in as Ho Quoc Anh.
 *         Expected: the sign-in succeeds - the browser leaves /web/login for an /odoo page.
 *      2. On the Pre-Sales Application open Pre-sale tickets > Tickets > All Tickets and search the
 *         request Subject.
 *         Expected: exactly 1 row carries the Subject.
 *      3. Open that request.
 *         Expected: the request form opens, its Subject reads "AUTO-CRM-12135-TC-5-4-<runId> request",
 *         and it is the request raised from the Opportunity in pre-condition 3.
 *
 * Browsers
 * --------
 *   Thomas's pre-conditions run in the `page` fixture. Step 1 opens the "different browser" - a context
 *   of its own with its own video - inside that step; afterEach closes it and attaches its video. The
 *   API cross-check in Verification uses an administrator session in a third context, inside that step.
 *
 * Data
 * ----
 *   Every record is named AUTO-CRM-12135-TC-5-4-<runId> and removed in afterEach by an administrator
 *   session (Thomas may not delete a crm.lead), on a passing, failing or timed-out run.
 *   SKIP_CLEANUP_PRESALE=true keeps them.
 */

const TC = 'CRM-12135_5.4';

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: On the CRM (crm-mig) sign in as the salesperson Thomas Semerich',
  pre2:   'Pre-condition 2: On the CRM open CRM (left sidebar) > Pipeline, switch to LIST view (in kanban CREATE opens a quick-create card without Expected Revenue Deal), click CREATE, enter the Opportunity and SAVE',
  pre3:   'Pre-condition 3: On that Opportunity click "Request SE support" (under More when the header row is full), fill the dialog and SAVE',
  s1:     `Step 1: In a different browser open the Pre-Sales Application URL (${baseUrl_presales_mig}web/login) and sign in as Ho Quoc Anh`,
  s2:     'Step 2: On the Pre-Sales Application open Pre-sale tickets > Tickets > All Tickets and search the request Subject',
  s3:     'Step 3: Open that request',
  verify: 'Verification',
} as const;

const EXPECTED_REVENUE = 900;
const SUPPORT_TYPE = 'Offline technical assistance';

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The marker this run's records carry - set before the first record exists, swept in afterEach. */
let runMarker = '';

/** The "different browser" of step 1 - opened inside that step, closed (video attached) in afterEach. */
let otherBrowser: { context: BrowserContext; page: Page } | undefined;

test.describe(`${TC} - Another account opens a salesperson's request directly on the Pre-Sales URL`, () => {
  test.afterEach(async ({ page, browser }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(otherBrowser?.page ?? page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`TEST FAILED - reason: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
    if (!runMarker) {
      console.log('  TEARDOWN: nothing was created');
    } else if (SKIP_CLEANUP) {
      console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${runMarker}`);
    } else {
      // An administrator session of its own: Thomas may not delete a crm.lead.
      const swept = await MigPreSalePage.sweepLeftovers(browser, runMarker);
      console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]`
        + (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
    }
    runMarker = '';
    await CommonUtils.captureAndAttachScreenshot(otherBrowser?.page ?? page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (otherBrowser) {
      // The video file is written on close, so the handle is taken first and attached after.
      const video = otherBrowser.page.video();
      await otherBrowser.context.close().catch(() => {});
      if (video) {
        await testInfo.attach('video', { path: await video.path(), contentType: 'video/webm' })
          .then(() => console.log('\u{1F3A5} Video attached (other-account browser)'))
          .catch((err) => console.log(`Video not attached (other-account browser): ${(err as Error).message.split('\n')[0]}`));
      }
      otherBrowser = undefined;
    }
  });

  test(`${TC}: Another account opens a salesperson's request directly on the Pre-Sales URL`, async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log(`========== ${TC} - Another account opens a salesperson's request directly on the Pre-Sales URL ==========`);

    const runId = MigPreSalePage.runId();
    const marker = MigPreSalePage.marker('TC-5-4', runId);
    const subject = `${marker} request`;
    const description = `Automated check of ${TC} - another account opens Thomas's request.`;
    const thomasUi = new MigPreSalePage(page);
    const opportunityPage = new OpportunityPage(page);

    let leadId = 0;
    let saveErrorDialog = '';
    let landedPath = '';
    let rowCount = 0;
    let opened = { id: 0, subject: '', url: '' };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.sale_ic_thomas_crm_mig.username, users.sale_ic_thomas_crm_mig.password);
      console.log(`  Account : ${users.sale_ic_thomas_crm_mig.username} (${users.sale_ic_thomas_crm_mig.displayName})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Thomas signed in on the CRM');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await thomasUi.openPipelineListFromSidebar();
      console.log(`  Pipeline list : ${page.url()}`);
      await opportunityPage.clickCreate();
      runMarker = marker;
      console.log(`  - Opportunity name      : ${marker}`);
      console.log(`  - Expected Revenue Deal : ${EXPECTED_REVENUE}`);
      console.log('  - Email / Contact       : blank');
      console.log('  - Salesperson           : default (the signed-in user)');
      await opportunityPage.fillOpportunityName(marker);
      await opportunityPage.fillExpectedRevenueDeal(String(EXPECTED_REVENUE));
      await opportunityPage.saveAndWaitForCompletion();
      leadId = Number(await opportunityPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage));
      // Observation, not scored: an "Odoo Server Error - Missing Record" (mail.followers) dialog has
      // stood over the form after this SAVE on every run since 2026-10-16. The scenario gives no expectation.
      saveErrorDialog = await opportunityPage.isServerErrorDialogVisible(CommonUtils.waitTimes.long)
        ? await opportunityPage.waitForServerErrorDialog(CommonUtils.waitTimes.standard) : '';
      console.log(`  Opportunity id  : ${leadId}`);
      console.log(`  Opportunity URL : ${MigPreSalePage.opportunityUrl(leadId)}`);
      console.log(`  Salesperson     : ${await thomasUi.opportunitySalesperson()}`);
      console.log(`  Observation (not scored) - error dialog after SAVE : ${saveErrorDialog.replace(/\s+/g, ' ') || 'none'}`);
      expect(leadId, 'Thomas must be able to save the Opportunity this case builds on').toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Opportunity saved by Thomas');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await thomasUi.openOpportunity(leadId);
      await thomasUi.openRaiseDialog();
      console.log(`  - Subject      : ${subject}`);
      console.log('  - Meeting Time : blank');
      console.log(`  - Description  : ${description}`);
      console.log('  - Meeting link : blank');
      console.log(`  - Support type : ${SUPPORT_TYPE}`);
      await thomasUi.fillRaiseDialog({ subject, description, supportType: SUPPORT_TYPE });
      await thomasUi.saveRaiseDialog();
      await thomasUi.waitForRaiseDialogClosed();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - request raised by Thomas');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      // Option (a): a separate cookie jar. recordVideo must be passed here - a hand-made context does
      // not inherit `video: 'on'` from playwright.config.ts.
      const viewport = { width: 1920, height: 1080 };
      const context = await browser.newContext({
        viewport, ignoreHTTPSErrors: true,
        recordVideo: { dir: testInfo.outputPath('other-browser'), size: viewport },
      });
      otherBrowser = { context, page: await context.newPage() };
      console.log(`  Account : ${users.anh_ho_presales_mig.username} (${users.anh_ho_presales_mig.displayName})`);
      landedPath = await MigPreSalePage.loginPresalesUi(
        otherBrowser.page, users.anh_ho_presales_mig.username, users.anh_ho_presales_mig.password,
      );
      console.log(`  Landed on : ${landedPath}`);
      await CommonUtils.captureAndAttachScreenshot(otherBrowser.page, testInfo, 'Steps to reproduce 1 - other account signed in on the Pre-Sales URL');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const otherUi = new MigPreSalePage(otherBrowser!.page);
      await otherUi.openPresalesAllTickets();
      console.log(`  All Tickets : ${otherBrowser!.page.url()}`);
      rowCount = await otherUi.searchPresalesList(subject);
      console.log(`  Searched    : ${subject}`);
      console.log(`  Rows found  : ${rowCount}`);
      await CommonUtils.captureAndAttachScreenshot(otherBrowser!.page, testInfo, 'Steps to reproduce 2 - request found in All Tickets');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const otherUi = new MigPreSalePage(otherBrowser!.page);
      if (rowCount > 0) await otherUi.openPresalesRow(subject);
      opened = await otherUi.presalesOpenRequest();
      console.log(`  Request URL     : ${opened.url}`);
      console.log(`  Request id      : ${opened.id}`);
      console.log(`  Request Subject : ${opened.subject}`);
      await CommonUtils.captureAndAttachScreenshot(otherBrowser!.page, testInfo, 'Steps to reproduce 3 - request opened on the Pre-Sales Application');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      // [INTERNAL check, Call API] which request the Pre-Sales Application links to Thomas's
      // Opportunity - read by an administrator session in a context of its own.
      const admin = await MigPreSalePage.openAdminSession(browser);
      let raisedIds: number[] = [];
      try {
        raisedIds = (await admin.preSale.requestsForLead(leadId)).map((r) => r.id);
      } finally {
        await admin.context.close().catch(() => {});
      }
      console.log(`  Requests linked to Opportunity ${leadId} (API): [${raisedIds.join(', ')}]`);

      const ok1 = landedPath.startsWith('/odoo');
      const ok2 = rowCount === 1;
      const ok3 = opened.subject === subject;
      const ok4 = raisedIds.length === 1 && opened.id === raisedIds[0];
      const lines = [
        'Verify #1 - The other account signs in on the Pre-Sales URL:',
        '   Expected : lands on an /odoo page (still on /web/login = the sign-in was refused)',
        `   Actual   : ${landedPath || '(no landing path)'}`,
        `   Result   : ${ok1 ? 'PASS' : 'FAIL'}`,
        'Verify #2 - All Tickets lists Thomas\'s request for the other account:',
        `   Expected : exactly 1 row carries "${subject}"`,
        `   Actual   : ${rowCount}`,
        `   Result   : ${ok2 ? 'PASS' : 'FAIL'}`,
        'Verify #3 - The opened request shows its Subject, verbatim:',
        `   Expected : ${subject}`,
        `   Actual   : ${opened.subject || '(no request form)'}`,
        `   Result   : ${ok3 ? 'PASS' : 'FAIL'}`,
        'Verify #4 - The opened request IS the one raised from Thomas\'s Opportunity:',
        `   Expected : request id = linked request id ${raisedIds[0] ?? '(none)'}`,
        `   Actual   : request id = ${opened.id || '(none)'}`,
        `   Result   : ${ok4 ? 'PASS' : 'FAIL'}`,
      ];
      const passed = ok1 && ok2 && ok3 && ok4;
      console.log('==================== VERIFY ====================');
      for (const l of lines) console.log(`  ${l}`);
      console.log(`  Observation (not scored) - error dialog after the Opportunity SAVE : ${saveErrorDialog.replace(/\s+/g, ' ') || 'none'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${passed ? 'PASS' : 'FAIL'} - the other account ${passed ? 'opened Thomas\'s request on the Pre-Sales URL' : 'did NOT reach Thomas\'s request as specified'}`);

      await CommonUtils.captureVerifyEvidence(otherBrowser!.page, testInfo, {
        name: `${TC} - request opened on the Pre-Sales Application`,
        passed,
        highlight: ['.o_form_renderer div[name="name"]'],
        lines,
      }).catch(() => {});

      expect(landedPath, 'the other account must get past the Pre-Sales sign-in form').toMatch(/^\/odoo/);
      expect(rowCount, 'exactly one row in All Tickets must carry the Subject').toBe(1);
      expect(opened.subject, 'the opened request must show its Subject, verbatim').toBe(subject);
      expect(raisedIds.length, 'exactly one request must be linked to Thomas\'s Opportunity').toBe(1);
      expect(opened.id, 'the opened request must be the one raised from Thomas\'s Opportunity').toBe(raisedIds[0]);
    });
  });
});
