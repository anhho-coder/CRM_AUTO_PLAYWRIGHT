import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_5.1 - Clicking Tickets on an Opportunity shows the request to the salesperson without a
 *                 Pre-Sales login
 * ============================================================================================
 * Test Case ID   : CRM-12135_5.1
 * Jira           : CRM-12939
 * Requirements   : FUNC-0063, FUNC-0064, UI-0002
 * Run as         : Salesperson Thomas Semerich (thomas.semerich@nakivo.com) - DEVIATES from the TC,
 *                  whose pre-condition 1 names admin_crm_mig. Kept on the tester's decision 2026-10-16:
 *                  TC-26 (5.2) requires an administrator to be shown the login page, so the same account
 *                  cannot also be the "salesperson without a login" here. To be fixed in the TC.
 * Automation-Type: new
 * Automation-Date: 2026-09-21 (re-synced to the 2026-10-14 TC on 2026-10-16)
 * Source TC      : CRM-12939 (Xray Manual Steps, 2 steps)
 * Source version : updated 2026-10-14T11:35:47.950+0300 - re-check before trusting this spec
 * Evidence       : screenshot at the end of each sub-section, a verify-point capture, afterEach
 *                  start/end, video.
 *
 * Summary
 * -------
 *   A salesperson in a browser with no Pre-Sales session creates an Opportunity, raises a request on
 *   it and clicks Tickets; the request must show inside the CRM page and open with no login page.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_5\.1:" --project=O12
 *
 * Source manual TC (CRM-12939, verbatim)
 * --------------------------------------
 *   Pre-condition(s):
 *      1. In a private browser window, logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig,
 *         not signed in to the Pre-Sales Application.
 *      2. Create a new Opportunity AUTO-CRM-12135-TC-25-<runId>-view with Expected Revenue Deal = $900,
 *         from the list view.
 *      3. From that Opportunity, click "Request SE support" and create one request with:
 *            - Subject      = AUTO-CRM-12135-TC-25-<runId>-view
 *            - Description  = Automated check of CRM-12135 TC-25.
 *            - Support type = Offline technical assistance
 *
 *   Steps to reproduce:
 *      1. Refresh the Opportunity and click the Tickets smart button.
 *         Expected: The Pre-Sales Application opens inside the CRM page with no login page, and the
 *         request AUTO-CRM-12135-TC-25-<runId>-view is listed.
 *      2. Open that request.
 *         Expected: Its form opens inside the CRM page with no login page and no error popup.
 *
 * What the product does that the TC does not say (measured 2026-10-16)
 * ---------------------------------------------------------------------
 *   With exactly ONE request on the Opportunity, Tickets opens that request's FORM directly - there is
 *   no list to see it "listed" in. Step 1 therefore scores "the request is shown in the embed" and
 *   prints what the embed rendered; step 2 opens the row when a list is shown and otherwise finds the
 *   form already open. Reported to the TC author.
 *
 * Data
 * ----
 *   The Opportunity and its request are named AUTO-CRM-12135-TC-25-<runId>-view and removed in
 *   afterEach by an administrator session (Thomas may not delete a crm.lead), on a passing, failing or
 *   timed-out run. SKIP_CLEANUP_PRESALE=true keeps them.
 */

const TC = 'CRM-12135_5.1';

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: In a private browser window, log in to crm-mig.nakivo.site as the salesperson Thomas Semerich, not signed in to the Pre-Sales Application',
  pre2:   'Pre-condition 2: Create a new Opportunity AUTO-CRM-12135-TC-25-<runId>-view with Expected Revenue Deal = $900, from the list view (CRM left sidebar > Pipeline > LIST view - in kanban CREATE opens a quick-create card without Expected Revenue Deal)',
  pre3:   'Pre-condition 3: From that Opportunity, click "Request SE support" (under More when the header row is full) and create one request',
  s1:     'Step 1: Refresh the Opportunity and click the Tickets smart button',
  s2:     'Step 2: Open that request',
  verify: 'Verification',
} as const;

const EXPECTED_REVENUE = 900;
const SUPPORT_TYPE = 'Offline technical assistance';

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The marker this run's records carry - set before the first record exists, swept in afterEach. */
let runMarker = '';

test.describe(`${TC} - Clicking Tickets on an Opportunity shows the request to the salesperson without a Pre-Sales login`, () => {
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

  test(`${TC}: Clicking Tickets on an Opportunity shows the request to the salesperson without a Pre-Sales login`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log(`========== ${TC} - Clicking Tickets on an Opportunity shows the request to the salesperson without a Pre-Sales login ==========`);

    const runId = MigPreSalePage.runId();
    const name = `${MigPreSalePage.marker('TC-25', runId)}-view`;
    const description = 'Automated check of CRM-12135 TC-25.';
    const ui = new MigPreSalePage(page);
    const opportunityPage = new OpportunityPage(page);

    let leadId = 0;
    let saveErrorDialog = '';
    let shownInEmbed = false;
    let loginAtStep1 = true;
    let listRowsAtStep1 = 0;
    let embedView = '';
    let opened = { id: 0, subject: '', url: '' };
    let loginAtStep2 = true;
    let popupsAtStep2: string[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      // The `page` fixture is a fresh context: no cookie for the Pre-Sales host, as the TC requires.
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.sale_ic_thomas_crm_mig.username, users.sale_ic_thomas_crm_mig.password);
      console.log(`  Account : ${users.sale_ic_thomas_crm_mig.username} (${users.sale_ic_thomas_crm_mig.displayName})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Thomas signed in on the CRM');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await ui.openPipelineListFromSidebar();
      await opportunityPage.clickCreate();
      runMarker = name;
      console.log(`  - Opportunity name      : ${name}`);
      console.log(`  - Expected Revenue Deal : ${EXPECTED_REVENUE}`);
      await opportunityPage.fillOpportunityName(name);
      await opportunityPage.fillExpectedRevenueDeal(String(EXPECTED_REVENUE));
      await opportunityPage.saveAndWaitForCompletion();
      leadId = Number(await opportunityPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage));
      // CRM-13563 guard: every SAVE on crm-mig used to leave "Odoo Server Error - Missing Record"
      // (mail.followers) over the form. Fixed 2026-10-16, so the dialog now fails the case.
      saveErrorDialog = await opportunityPage.isServerErrorDialogVisible(CommonUtils.waitTimes.long)
        ? await opportunityPage.waitForServerErrorDialog(CommonUtils.waitTimes.standard) : '';
      console.log(`  Opportunity id  : ${leadId}`);
      console.log(`  Opportunity URL : ${MigPreSalePage.opportunityUrl(leadId)}`);
      console.log(`  Salesperson     : ${await ui.opportunitySalesperson()}`);
      console.log(`  Error dialog after SAVE (CRM-13563, must be none) : ${saveErrorDialog.replace(/\s+/g, ' ') || 'none'}`);
      expect(leadId, 'the Opportunity this case builds on must be saved').toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Opportunity saved');
      expect(saveErrorDialog.replace(/\s+/g, ' '),
        'CRM-13563: no "Odoo Server Error - Missing Record" dialog may stand over the form after SAVE').toBe('');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await ui.openOpportunity(leadId);
      await ui.openRaiseDialog();
      console.log(`  - Subject      : ${name}`);
      console.log(`  - Description  : ${description}`);
      console.log(`  - Support type : ${SUPPORT_TYPE}`);
      await ui.fillRaiseDialog({ subject: name, description, supportType: SUPPORT_TYPE });
      await ui.saveRaiseDialog();
      await ui.waitForRaiseDialogClosed();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - request raised');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await ui.openOpportunity(leadId);
      await ui.openTicketsPanel();
      console.log('  Clicked Tickets button');
      // 90 s: the embed is a second web client booting inside an iframe.
      shownInEmbed = await ui.waitForTextInEmbed(name, 90000);
      loginAtStep1 = await ui.embeddedLoginFormVisible(5000);
      listRowsAtStep1 = await ui.embeddedListRowCount(name);
      embedView = listRowsAtStep1 > 0 ? `a list with ${listRowsAtStep1} row(s) carrying the Subject`
        : shownInEmbed ? 'the request form directly (no list)' : 'nothing carrying the Subject';
      console.log(`  Request shown in the embed : ${shownInEmbed}`);
      console.log(`  Sign-in form visible       : ${loginAtStep1}`);
      console.log(`  The embed rendered         : ${embedView}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - Tickets clicked');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      if (listRowsAtStep1 > 0) {
        await ui.openEmbeddedListRow(name);
        console.log('  Opened the row in the embedded list');
      } else {
        console.log('  No list in the embed - the request form is already open');
      }
      opened = await ui.waitForEmbeddedRequestForm(60000);
      loginAtStep2 = await ui.embeddedLoginFormVisible(5000);
      popupsAtStep2 = await ui.visibleDialogTexts();
      console.log(`  Embedded form URL     : ${opened.url}`);
      console.log(`  Embedded request id   : ${opened.id}`);
      console.log(`  Embedded Subject      : ${opened.subject || '(no form)'}`);
      console.log(`  Sign-in form visible  : ${loginAtStep2}`);
      console.log(`  Popups on screen      : ${popupsAtStep2.length ? popupsAtStep2.join(' | ') : 'none'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 2 - request form inside the CRM');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const ok1 = shownInEmbed && !loginAtStep1;
      const ok2 = opened.subject === name && !loginAtStep2 && popupsAtStep2.length === 0;
      const lines = [
        'Verify #1 - Step 1: the Pre-Sales Application opens inside the CRM page with no login page, showing the request:',
        `   Expected : no login form, "${name}" shown in the embed (with one request the embed opens its form - see header)`,
        `   Actual   : ${loginAtStep1 ? 'login form VISIBLE' : 'no login form'}, request ${shownInEmbed ? 'shown' : 'NOT shown'} - the embed rendered ${embedView}`,
        `   Result   : ${ok1 ? 'PASS' : 'FAIL'}`,
        'Verify #2 - Step 2: its form opens inside the CRM page with no login page and no error popup:',
        `   Expected : form Subject "${name}", no login form, no popup`,
        `   Actual   : form Subject "${opened.subject || '(no form)'}", ${loginAtStep2 ? 'login form VISIBLE' : 'no login form'}, popups: ${popupsAtStep2.length ? popupsAtStep2.join(' | ') : 'none'}`,
        `   Result   : ${ok2 ? 'PASS' : 'FAIL'}`,
      ];
      const passed = ok1 && ok2;
      console.log('==================== VERIFY ====================');
      for (const l of lines) console.log(`  ${l}`);
      console.log('===============================================');
      console.log(`OVERALL: ${passed ? 'PASS' : 'FAIL'} - the salesperson ${passed ? 'reached the request inside the CRM with no Pre-Sales login' : 'did NOT reach the request as specified'}`);

      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - request inside the CRM`,
        passed,
        highlight: ['iframe'],
        lines,
      }).catch(() => {});

      expect(loginAtStep1, 'step 1: the embed must not ask the salesperson to sign in').toBe(false);
      expect(shownInEmbed, 'step 1: the request must be shown inside the CRM page').toBe(true);
      expect(opened.subject, 'step 2: the request form must open inside the CRM page').toBe(name);
      expect(loginAtStep2, 'step 2: no login page on the request form').toBe(false);
      expect(popupsAtStep2, 'step 2: no error popup').toEqual([]);
    });
  });
});
