import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_5.2 - Clicking Tickets as a Pre-Sales administrator shows the login page, and signing in
 *                 opens the request
 * ============================================================================================
 * Test Case ID   : CRM-12135_5.2
 * Jira           : CRM-12940
 * Requirements   : FUNC-0063
 * Run as         : admin_crm_mig on the CRM, whose same login (anh.ho@nakivo.com) is an Administrator
 *                  (base.group_system) on the Pre-Sales Application
 * Automation-Type: new
 * Automation-Date: 2026-09-21 (pre-conditions re-built from the TC on 2026-10-16)
 * Source TC      : CRM-12940 (Xray Manual Steps, 2 steps)
 * Source version : updated 2026-10-06T12:37:14.200+0300 - re-check before trusting this spec
 * Evidence       : screenshot at the end of each sub-section, a verify-point capture, afterEach
 *                  start/end, video.
 *
 * Summary
 * -------
 *   A Pre-Sales administrator raises a request on a fresh Opportunity and clicks Tickets; the embed must
 *   show the Pre-Sales login page, and signing in there must bring the request up inside the CRM page.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_5\.2:" --project=O12
 *
 * Source manual TC (CRM-12940, verbatim)
 * --------------------------------------
 *   Pre-condition(s):
 *      1. In a private browser window, logged in to crm-mig.nakivo.site with an account whose same login
 *         is an Administrator on the Pre-Sales Application, not signed in to the Pre-Sales Application.
 *      2. Create a new Opportunity AUTO-CRM-12135-TC-26-<runId>-admin with Expected Revenue Deal = $900,
 *         from the list view.
 *      3. From that Opportunity, click "Request SE support" and create one request with:
 *            - Subject      = AUTO-CRM-12135-TC-26-<runId>-admin
 *            - Description  = Automated check of CRM-12135 TC-26.
 *            - Support type = Offline technical assistance
 *
 *   Steps to reproduce:
 *      1. Refresh the Opportunity and click the Tickets smart button.
 *         Expected: The Pre-Sales login page is shown inside the CRM page.
 *      2. Sign in on that page with the same account's Pre-Sales password.
 *         Expected: The request AUTO-CRM-12135-TC-26-<runId>-admin is listed inside the CRM page.
 *
 * Why the browser must never have touched the Pre-Sales host
 * ----------------------------------------------------------
 *   A Pre-Sales session already in the browser answers the question before the click: no form is ever
 *   demanded and the case reports "the administrator was auto-signed-in" about itself (measured
 *   2026-10-13). So everything here runs in the `page` fixture's fresh context through the CRM UI only -
 *   no Pre-Sales RPC - and the teardown runs in an administrator session of its own.
 *
 * Data
 * ----
 *   The Opportunity and its request are named AUTO-CRM-12135-TC-26-<runId>-admin and removed in
 *   afterEach, on a passing, failing or timed-out run. SKIP_CLEANUP_PRESALE=true keeps them.
 */

const TC = 'CRM-12135_5.2';

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: In a private browser window, log in to crm-mig.nakivo.site as admin_crm_mig - whose same login is an Administrator on the Pre-Sales Application - not signed in to the Pre-Sales Application',
  pre2:   'Pre-condition 2: Create a new Opportunity AUTO-CRM-12135-TC-26-<runId>-admin with Expected Revenue Deal = $900, from the list view (CRM left sidebar > Pipeline > LIST view - in kanban CREATE opens a quick-create card without Expected Revenue Deal)',
  pre3:   'Pre-condition 3: From that Opportunity, click "Request SE support" (under More when the header row is full) and create one request',
  s1:     'Step 1: Refresh the Opportunity and click the Tickets smart button',
  s2:     'Step 2: Sign in on that page with the same account\'s Pre-Sales password',
  verify: 'Verification',
} as const;

const EXPECTED_REVENUE = 900;
const SUPPORT_TYPE = 'Offline technical assistance';

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The marker this run's records carry - set before the first record exists, swept in afterEach. */
let runMarker = '';

test.describe(`${TC} - Clicking Tickets as a Pre-Sales administrator shows the login page, and signing in opens the request`, () => {
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
      // An administrator session of its own, on a pass, a fail and a timeout alike.
      const swept = await MigPreSalePage.sweepLeftovers(browser, runMarker);
      console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]`
        + (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
    }
    runMarker = '';
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Clicking Tickets as a Pre-Sales administrator shows the login page, and signing in opens the request`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log(`========== ${TC} - Clicking Tickets as a Pre-Sales administrator shows the login page, and signing in opens the request ==========`);

    const runId = MigPreSalePage.runId();
    const name = `${MigPreSalePage.marker('TC-26', runId)}-admin`;
    const description = 'Automated check of CRM-12135 TC-26.';
    const ui = new MigPreSalePage(page);
    const opportunityPage = new OpportunityPage(page);

    let leadId = 0;
    let saveErrorDialog = '';
    // 'empty' is NOT "no login form" - it is "the panel rendered nothing", and a blank panel proves
    // nothing about the product (on 2026-10-13 that reading was filed as a defect while the run's
    // video showed the panel blank from the click onwards).
    let panelState: 'form' | 'content' | 'empty' = 'empty';
    let loginFormWasVisible = false;
    let requestFoundInEmbed = false;
    let panelAfterSignIn: 'form' | 'content' | 'empty' = 'empty';
    let secondClick: 'form' | 'content' | 'empty' | 'not tried' = 'not tried';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      // The `page` fixture is a fresh context: it has never touched the Pre-Sales host.
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log(`  CRM account                  : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      console.log(`  Same login on the Pre-Sales  : ${users.anh_ho_presales_mig.username} (Administrator there)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on the CRM only');
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
      console.log(`  Tickets smart button visible: ${await ui.isTicketsStatVisible()}`);
      await ui.openTicketsPanel();
      console.log('  Clicked Tickets button');
      panelState = await ui.waitForEmbeddedPanel();
      loginFormWasVisible = panelState === 'form';
      console.log(`  Embedded panel rendered      : ${panelState}`);
      console.log(`  Pre-Sales login form visible : ${loginFormWasVisible}`);
      if (panelState === 'empty') {
        console.log('  The panel stayed blank - this run can say NOTHING about the sign-in behaviour.');
      } else if (panelState === 'content') {
        console.log('  The helpdesk rendered with no sign-in step - that IS the behaviour TC-26 forbids.');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - Tickets clicked');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      if (!loginFormWasVisible) {
        // Not an error here: no form means the administrator got through without one, which is what
        // Verify #1 scores. Throwing would hide that finding behind a broken-harness message.
        console.log('  No login form to fill - the administrator reached the helpdesk without one.');
        return;
      }
      const signedIn = await ui.signInEmbeddedLoginForm(
        users.anh_ho_presales_mig.username, users.anh_ho_presales_mig.password,
      );
      expect(signedIn, 'the login form seen in step 1 must still accept the sign-in').toBe(true);
      console.log(`  Signed in inside the frame as ${users.anh_ho_presales_mig.username}`);
      // The sign-in bounces through /nakivo/embed/open, reloads the CRM and rebuilds the embed - a whole
      // CRM client boots in the middle, so the request is waited for, for up to 60 s.
      requestFoundInEmbed = await ui.waitForTextInEmbed(name, 60000);
      panelAfterSignIn = requestFoundInEmbed ? 'content' : await ui.waitForEmbeddedPanel(5000);
      console.log(`  After sign-in the panel reads        : ${panelAfterSignIn}`);
      console.log(`  The request itself is in the embed   : ${requestFoundInEmbed}`);
      if (panelAfterSignIn !== 'content') {
        // Separates "signed in, but the redirect did not come back" from "the sign-in never happened".
        await ui.openOpportunity(leadId).catch(() => {});
        await ui.openTicketsPanel().catch(() => {});
        secondClick = await ui.waitForEmbeddedPanel();
        console.log(`  Clicking Tickets a SECOND time reads : ${secondClick}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 2 - after signing in inside the CRM');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const ok0 = panelState !== 'empty';
      const lines = [
        'Control - the embedded panel rendered at all (a blank panel proves nothing either way):',
        '   Expected : form | content',
        `   Actual   : ${panelState}`,
        `   Result   : ${ok0 ? 'PASS' : 'FAIL'}`,
        'Verify #1 - The Pre-Sales login page is shown inside the CRM page:',
        '   Expected : login form visible (the helpdesk WITHOUT a form = the administrator was auto-signed-in, which TC-26 forbids)',
        `   Actual   : ${loginFormWasVisible ? 'visible' : 'not visible'}`,
        `   Result   : ${loginFormWasVisible ? 'PASS' : 'FAIL'}`,
        `Verify #2 - The request ${name} is listed inside the CRM page after signing in:`,
        '   Expected : the request name found in the embedded FRAME (not the CRM page around it)',
        `   Actual   : ${requestFoundInEmbed ? 'found' : 'not found'}`,
        `   Result   : ${requestFoundInEmbed ? 'PASS' : 'FAIL'}`,
      ];
      const passed = ok0 && loginFormWasVisible && requestFoundInEmbed;
      console.log('==================== VERIFY ====================');
      for (const l of lines) console.log(`  ${l}`);
      console.log(`  Observation (not scored) - the panel after the sign-in : ${panelAfterSignIn}`);
      console.log(`  Observation (not scored) - a SECOND Tickets click     : ${secondClick}`);
      console.log('===============================================');
      console.log(`OVERALL: ${passed ? 'PASS' : 'FAIL'} - the administrator ${passed ? 'was shown the login page and reached the request after signing in' : 'did NOT go through the login page as specified'}`);

      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - request after signing in inside the CRM`,
        passed,
        highlight: ['iframe'],
        lines,
      }).catch(() => {});

      expect(panelState, 'the embedded panel must render something before this case can judge the sign-in').not.toBe('empty');
      expect(loginFormWasVisible, 'the embedded helpdesk must show a login form to a Pre-Sales administrator').toBe(true);
      expect(requestFoundInEmbed, `the request ${name} must appear INSIDE the embedded frame after signing in there`).toBe(true);
    });
  });
});
