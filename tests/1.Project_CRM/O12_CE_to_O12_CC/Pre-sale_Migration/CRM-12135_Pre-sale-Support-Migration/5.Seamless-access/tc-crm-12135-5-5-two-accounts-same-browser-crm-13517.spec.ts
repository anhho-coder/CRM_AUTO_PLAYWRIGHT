import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_5.5 - Two accounts in one browser: the Tickets embed still opens (CRM-13517 re-test)
 * ============================================================================================
 * Test Case ID   : CRM-12135_5.5
 * Jira           : none yet (re-test of bug CRM-13517, feature CRM-12135)
 * Requirements   : FUNC-0063, FUNC-0064 (IS-CRM-FUNC-0064)
 * Run as         : ONE browser holding two accounts - Ho Quoc Anh (anh.ho@nakivo.com) on the Pre-Sales
 *                  Application, salesperson Thomas Semerich (thomas.semerich@nakivo.com) on the CRM
 * Automation-Type: new
 * Automation-Date: 2026-10-16
 * Source TC      : NONE in Xray yet - option (b) chosen by the tester on 2026-10-16, built from Nathan
 *                  Do's fix comment on CRM-13517 (2026-10-15 07:44 +03, comment 708558).
 * Source version : n/a - pin the Xray key and its `updated` stamp here once the manual TC exists
 * Evidence       : screenshot at the end of each sub-section, a verify-point capture, afterEach
 *                  start/end, video; the embed's document responses and their framing headers on stdout.
 *
 * What Nathan wrote (CRM-13517, verbatim extracts - the expected results below come from these)
 * ----------------------------------------------------------------------------------------------
 *   - "The error happens when the browser is signed in to the two systems with two different accounts
 *     (for example, thomas.semerich on the CRM and anh.ho on the Pre-Sales Application)."
 *   - "Clicking Tickets: the frame is blocked, and the last response carries X-Frame-Options: DENY.
 *     Pressing F5, or clicking Tickets again: the page shows normally."
 *   - "redeem (pre-sales): signs X in ... If the browser is already signed in to pre-sales as someone
 *     else, that person is signed out."
 *   - "It is fixed." / "please re-test with the CRM and the Pre-Sales Application signed in with two
 *     different accounts in the same browser."
 *
 * Summary
 * -------
 *   One browser is signed in to the Pre-Sales Application as Ho Quoc Anh and to the CRM as Thomas; Thomas
 *   clicks Tickets ONCE. The request must open in the embed (not blocked), and Thomas must now own the
 *   browser's Pre-Sales session.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_5\.5:" --project=O12
 *
 * Steps (written for this re-test)
 * --------------------------------
 *   Pre-condition(s):
 *      1. In one browser sign in to the Pre-Sales Application as Ho Quoc Anh.
 *         Expected: the browser's Pre-Sales session belongs to Ho Quoc Anh.
 *      2. In the SAME browser sign in to the CRM (crm-mig) as the salesperson Thomas Semerich.
 *      3. Create an Opportunity from the list view (CRM left sidebar > Pipeline > LIST view):
 *            - Opportunity name      = AUTO-CRM-12135-TC-5-5-<runId>
 *            - Expected Revenue Deal = 900
 *      4. From that Opportunity click "Request SE support" and create one request:
 *            - Subject      = AUTO-CRM-12135-TC-5-5-<runId> request
 *            - Description  = Automated re-test of CRM-13517 - two accounts in one browser.
 *            - Support type = Offline technical assistance
 *
 *   Steps to reproduce:
 *      1. Refresh the Opportunity and click the Tickets smart button ONCE.
 *         Expected: the request opens inside the CRM page - its form shows the Subject verbatim, the
 *         frame is not the browser's "refused to connect" page, no Pre-Sales document in the frame
 *         carries X-Frame-Options: DENY, and no login form is shown.
 *      2. [INTERNAL check, Call API] Ask the Pre-Sales Application, with this browser's own cookies,
 *         which account its session belongs to.
 *         Expected: Thomas Semerich - Ho Quoc Anh was signed out.
 *
 * Data
 * ----
 *   The Opportunity and its request are named AUTO-CRM-12135-TC-5-5-<runId> and removed in afterEach by
 *   an administrator session (Thomas may not delete a crm.lead). SKIP_CLEANUP_PRESALE=true keeps them.
 */

const TC = 'CRM-12135_5.5';

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: In one browser sign in to the Pre-Sales Application (pre-sales-crm-mig.nakivo.site) as Ho Quoc Anh',
  pre2:   'Pre-condition 2: In the SAME browser sign in to the CRM (crm-mig) as the salesperson Thomas Semerich',
  pre3:   'Pre-condition 3: Create an Opportunity from the list view (CRM left sidebar > Pipeline > LIST view - in kanban CREATE opens a quick-create card without Expected Revenue Deal) with Expected Revenue Deal = 900',
  pre4:   'Pre-condition 4: From that Opportunity click "Request SE support" (under More when the header row is full) and create one request',
  s1:     'Step 1: Refresh the Opportunity and click the Tickets smart button ONCE (CRM-13517 failed on the first click; F5 or a second click hid it)',
  s2:     'Step 2: [INTERNAL check, Call API] Ask the Pre-Sales Application, with this browser\'s own cookies, which account its session belongs to',
  verify: 'Verification',
} as const;

const EXPECTED_REVENUE = 900;
const SUPPORT_TYPE = 'Offline technical assistance';

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The marker this run's records carry - set before the first record exists, swept in afterEach. */
let runMarker = '';

test.describe(`${TC} - Two accounts in one browser: the Tickets embed still opens (CRM-13517 re-test)`, () => {
  test.afterEach(async ({ page, browser }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
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
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Two accounts in one browser: the Tickets embed still opens (CRM-13517 re-test)`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log(`========== ${TC} - Two accounts in one browser: the Tickets embed still opens (CRM-13517 re-test) ==========`);

    const runId = MigPreSalePage.runId();
    const marker = MigPreSalePage.marker('TC-5-5', runId);
    const subject = `${marker} request`;
    const description = 'Automated re-test of CRM-13517 - two accounts in one browser.';
    const ui = new MigPreSalePage(page);
    const opportunityPage = new OpportunityPage(page);

    let sessionBefore = { uid: false as number | false, name: '', username: '' };
    let leadId = 0;
    let saveErrorDialog = '';
    let documents: { path: string; status: number; xFrameOptions: string; frameAncestors: string }[] = [];
    let embedded = { id: 0, subject: '', url: '' };
    let browserError = true;
    let loginFormVisible = true;
    let sessionAfter = { uid: false as number | false, name: '', username: '' };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      const landed = await MigPreSalePage.loginPresalesUi(
        page, users.anh_ho_presales_mig.username, users.anh_ho_presales_mig.password,
      );
      sessionBefore = await ui.presalesBrowserSession();
      console.log(`  Pre-Sales account        : ${users.anh_ho_presales_mig.username} (landed on ${landed})`);
      console.log(`  Browser Pre-Sales session: uid ${sessionBefore.uid}, ${sessionBefore.name} <${sessionBefore.username}>`);
      expect(sessionBefore.username, 'the browser must hold a Pre-Sales session for Ho Quoc Anh before the CRM sign-in')
        .toBe(users.anh_ho_presales_mig.username);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Pre-Sales signed in as Ho Quoc Anh');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.sale_ic_thomas_crm_mig.username, users.sale_ic_thomas_crm_mig.password);
      console.log(`  CRM account : ${users.sale_ic_thomas_crm_mig.username} (${users.sale_ic_thomas_crm_mig.displayName})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - CRM signed in as Thomas in the same browser');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await ui.openPipelineListFromSidebar();
      await opportunityPage.clickCreate();
      runMarker = marker;
      console.log(`  - Opportunity name      : ${marker}`);
      console.log(`  - Expected Revenue Deal : ${EXPECTED_REVENUE}`);
      await opportunityPage.fillOpportunityName(marker);
      await opportunityPage.fillExpectedRevenueDeal(String(EXPECTED_REVENUE));
      await opportunityPage.saveAndWaitForCompletion();
      leadId = Number(await opportunityPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage));
      // Observation, not scored: an "Odoo Server Error - Missing Record" (mail.followers) dialog has
      // stood over the form after this SAVE on every run since 2026-10-16.
      saveErrorDialog = await opportunityPage.isServerErrorDialogVisible(CommonUtils.waitTimes.long)
        ? await opportunityPage.waitForServerErrorDialog(CommonUtils.waitTimes.standard) : '';
      console.log(`  Opportunity id  : ${leadId}`);
      console.log(`  Opportunity URL : ${MigPreSalePage.opportunityUrl(leadId)}`);
      console.log(`  Observation (not scored) - error dialog after SAVE : ${saveErrorDialog.replace(/\s+/g, ' ') || 'none'}`);
      expect(leadId, 'the Opportunity this case builds on must be saved').toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - Opportunity saved');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await ui.openOpportunity(leadId);
      await ui.openRaiseDialog();
      console.log(`  - Subject      : ${subject}`);
      console.log(`  - Description  : ${description}`);
      console.log(`  - Support type : ${SUPPORT_TYPE}`);
      await ui.fillRaiseDialog({ subject, description, supportType: SUPPORT_TYPE });
      await ui.saveRaiseDialog();
      await ui.waitForRaiseDialogClosed();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - request raised');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await ui.openOpportunity(leadId);
      documents = ui.recordEmbedDocuments();
      await ui.openTicketsPanel();
      console.log('  Clicked Tickets button - once');
      // Polled for up to 90 s without clicking again: a second click is exactly what hid the defect.
      embedded = await ui.waitForEmbeddedRequestForm(90000);
      browserError = ui.embedShowsBrowserError();
      loginFormVisible = await ui.embeddedLoginFormVisible(5000);
      console.log('  Pre-Sales documents served into the frame:');
      for (const d of documents) {
        console.log(`    ${d.status} ${d.path}  X-Frame-Options=${d.xFrameOptions || '(none)'}  ${d.frameAncestors || '(no frame-ancestors)'}`);
      }
      console.log(`  Frame shows the browser error page : ${browserError}`);
      console.log(`  Embedded frame URL                 : ${embedded.url}`);
      console.log(`  Embedded request Subject           : ${embedded.subject || '(no request form)'}`);
      console.log(`  Sign-in form visible               : ${loginFormVisible}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - Tickets clicked once');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      sessionAfter = await ui.presalesBrowserSession();
      console.log(`  Browser Pre-Sales session before : uid ${sessionBefore.uid}, ${sessionBefore.name} <${sessionBefore.username}>`);
      console.log(`  Browser Pre-Sales session after  : uid ${sessionAfter.uid}, ${sessionAfter.name} <${sessionAfter.username}>`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const denied = documents.filter((d) => /deny/i.test(d.xFrameOptions));
      const ok1 = embedded.subject === subject && !browserError;
      const ok2 = denied.length === 0;
      const ok3 = !loginFormVisible;
      const ok4 = sessionAfter.username === users.sale_ic_thomas_crm_mig.username;
      const lines = [
        'Verify #1 - The first Tickets click opens the request inside the CRM page (not blocked):',
        `   Expected : request form "${subject}", no "refused to connect" page (blocked = the CRM-13517 defect)`,
        `   Actual   : ${embedded.subject ? `request form "${embedded.subject}"` : 'NO request form'}, browser error page ${browserError ? 'SHOWN' : 'not shown'}`,
        `   Result   : ${ok1 ? 'PASS' : 'FAIL'}`,
        'Verify #2 - No Pre-Sales document in the frame carries X-Frame-Options: DENY:',
        '   Expected : 0 (Nathan: the blocked click\'s "last response carries X-Frame-Options: DENY")',
        `   Actual   : ${denied.length} of ${documents.length}${denied.length ? ` - ${denied.map((d) => d.path).join(', ')}` : ''}`,
        `   Result   : ${ok2 ? 'PASS' : 'FAIL'}`,
        'Verify #3 - No login form inside the CRM page:',
        '   Expected : no login form (Thomas is an eligible salesperson)',
        `   Actual   : ${loginFormVisible ? 'login form VISIBLE' : 'no login form'}`,
        `   Result   : ${ok3 ? 'PASS' : 'FAIL'}`,
        'Verify #4 - The browser\'s Pre-Sales session now belongs to Thomas; Ho Quoc Anh was signed out:',
        `   Expected : ${users.sale_ic_thomas_crm_mig.username} (was ${sessionBefore.username || '(none)'})`,
        `   Actual   : ${sessionAfter.username || '(no Pre-Sales session)'}`,
        `   Result   : ${ok4 ? 'PASS' : 'FAIL'}`,
      ];
      const passed = ok1 && ok2 && ok3 && ok4;
      console.log('==================== VERIFY ====================');
      for (const l of lines) console.log(`  ${l}`);
      console.log(`  Observation (not scored) - error dialog after the Opportunity SAVE : ${saveErrorDialog.replace(/\s+/g, ' ') || 'none'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${passed ? 'PASS' : 'FAIL'} - with two accounts in one browser the Tickets embed ${passed ? 'opened on the first click (CRM-13517 fix holds)' : 'did NOT behave as the CRM-13517 fix describes'}`);

      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - first Tickets click with two accounts in one browser`,
        passed,
        highlight: ['iframe'],
        lines,
      }).catch(() => {});

      expect(browserError, 'the first Tickets click must not show "refused to connect" (CRM-13517)').toBe(false);
      expect(embedded.subject, 'the first Tickets click must open the request inside the CRM page').toBe(subject);
      expect(denied.map((d) => d.path), 'no Pre-Sales document in the frame may carry X-Frame-Options: DENY').toEqual([]);
      expect(loginFormVisible, 'no login form for an eligible salesperson').toBe(false);
      expect(sessionAfter.username, 'the browser\'s Pre-Sales session must now belong to Thomas').toBe(users.sale_ic_thomas_crm_mig.username);
    });
  });
});
