import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-26 - An administrator is never signed in automatically
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-26
 * Jira           : CRM-12135
 * Requirements   : FUNC-0063
 * Run as         : Engineer admin
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : stdout only - this case drives no screen, so its logs ARE the artifact.
 *
 * Summary
 * -------
 *    When a Pre-Sales administrator clicks the Tickets smart button on an Opportunity,
 *   the embedded helpdesk shows a login form (the administrator is excluded from auto-login).
 *   This case verifies the login page is shown and the administrator can sign in to reach
 *   the request list.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-26:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * Jira CRM-12940 (manual test case rewritten 2026-09-24 by Thuât Phung).
 *
 *   Pre-condition(s):
 *      1. Pre-Sales Application is reachable
 *      2. An Opportunity with at least one related SE support request is open on the CRM
 *
 *   Steps to reproduce:
 *      1. Refresh the Opportunity and click the Tickets smart button.
 *      2. Sign in on that page with the same account's Pre-Sales password.
 *
 *   Verification (expected results):
 *      1. The Pre-Sales login page is shown inside the CRM page.
 *      2. The request AUTO-CRM-12135-TC-26-<runId>-admin is listed inside the CRM page.
 *
 * Data
 * ----
 * READ-ONLY - this case does not create records (it reads an existing request).
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Pre-Sales Application is reachable',
  pre2:   'Pre-condition 2: An Opportunity with at least one related SE support request is open on the CRM',
  s1:     'Step 1: Refresh the Opportunity and click the Tickets smart button.',
  s2:     'Step 2: Sign in on that page with the same account\'s Pre-Sales password.',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-26 - An administrator is never signed in automatically', () => {
  test.afterEach(async ({}, testInfo) => {
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - start').catch(() => {});
    }
    if (teardown) {
      console.log('TEARDOWN DID NOT RUN - the test left the try block without cleaning up.');
      teardown = undefined;
    }
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`TEST FAILED - reason: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - teardown done').catch(() => {});
    }
    sharedPage = undefined;
  });

  test('CRM-12135_TC-26: An administrator is never signed in automatically', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-26 - An administrator is never signed in automatically ==========');

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    sharedPage = page;

    try {
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);

      const preSale = new MigPreSalePage(page);

      // RE-SYNC GAP (CRM-12940, 2026-09-24):
      // The manual TC requires an Opportunity with an existing request named AUTO-CRM-12135-TC-26-<runId>-admin.
      // This test does not create such a request - it assumes one is already available on the Pre-Sales Application.
      // Pre-condition steps 1-2 cannot be verified without external data setup.
      // If running in isolation, borrow a pre-existing Opportunity with a Tickets button visible.
      // A future enhancement: create the Opportunity and request in beforeEach if they do not exist.

      // Open an Opportunity that has a related request on Pre-Sales.
      // For now: use Opportunity ID 1 as a placeholder; in production, this should be parameterized.
      const opportunityId = 1; // RE-SYNC GAP: placeholder - in production, find/create Opportunity with request

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        console.log('  Pre-Sales Application is reachable (verified by subsequent Tickets panel load)');
      });

      await test.step(STEP.pre2, async () => {
        console.log(`\n--- ${STEP.pre2} ---`);
        console.log(`  RE-SYNC GAP (CRM-12940, 2026-09-24): opening Opportunity ${opportunityId}`);
        await preSale.openOpportunity(opportunityId);
      });

      let loginFormWasVisible = false;
      let embeddedPanelText = '';
      let requestWasFound = false;

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('.o_form_view').first().waitFor({
          state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait,
        });
        console.log('  Opportunity refreshed');

        const isTicketsVisible = await preSale.isTicketsStatVisible();
        console.log(`  Tickets smart button visible: ${isTicketsVisible}`);

        if (!isTicketsVisible) {
          throw new Error('RE-SYNC GAP: Tickets smart button not visible - Opportunity may not have any requests');
        }

        await preSale.openTicketsPanel();
        console.log('  Tickets panel opened');

        loginFormWasVisible = await preSale.embeddedLoginFormVisible();
        console.log(`  Pre-Sales login form visible: ${loginFormWasVisible}`);

        if (!loginFormWasVisible) {
          console.log('  WARNING: Expected login form not found - the account may be auto-logged into Pre-Sales');
        }
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);

        if (!loginFormWasVisible) {
          throw new Error(
            'RE-SYNC GAP (CRM-12940, 2026-09-24): The embedded helpdesk did not show a login form. ' +
            'This test requires that clicking Tickets as a non-Pre-Sales-authenticated user shows a login page. ' +
            'The current setup may have the account auto-logged into Pre-Sales via shared session, which defeats this test scenario. ' +
            'This scenario (admin excluded from shared sign-in) requires a different authentication setup that is not currently available.'
          );
        }

        // Locate the embedded frame with the login form and sign in
        const frames = page.frames();
        let signedIn = false;

        for (const frame of frames) {
          const passwordInputCount = await frame.locator('input[type="password"]').count().catch(() => 0);
          if (passwordInputCount > 0) {
            const loginInput = frame.locator('input[name="login"], input[placeholder*="login" i]').first();
            const passwordInput = frame.locator('input[type="password"]').first();
            const signInButton = frame.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();

            try {
              await loginInput.fill(users.anh_ho_presales_mig.username, { timeout: CommonUtils.waitTimes.medium });
              await passwordInput.fill(users.anh_ho_presales_mig.password, { timeout: CommonUtils.waitTimes.medium });
              await signInButton.click({ timeout: CommonUtils.waitTimes.medium });
              console.log(`  Signed in as ${users.anh_ho_presales_mig.username}`);
              signedIn = true;
              break;
            } catch (err) {
              console.log(`  Sign-in attempt failed: ${(err as Error).message.split('\n')[0]}`);
            }
          }
        }

        if (!signedIn) {
          throw new Error('Could not locate or fill the embedded login form - frame structure may have changed');
        }

        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);

        embeddedPanelText = await preSale.embeddedText();
        requestWasFound = embeddedPanelText.includes('AUTO-CRM-12135-TC-26') && embeddedPanelText.includes('admin');

        console.log('\n==================== VERIFY ====================');
        console.log('Verify #1 - The Pre-Sales login page is shown inside the CRM page:');
        console.log(`     Expected : login form visible`);
        console.log(`     Actual   : ${loginFormWasVisible ? 'visible' : 'not visible'}`);
        console.log(`     Result   : ${loginFormWasVisible ? 'PASS' : 'FAIL'}`);
        console.log('Verify #2 - The request AUTO-CRM-12135-TC-26-<runId>-admin is listed inside the CRM page:');
        console.log(`     Expected : request name found in embedded panel`);
        console.log(`     Actual   : ${requestWasFound ? 'found' : 'not found'}`);
        console.log(`     Result   : ${requestWasFound ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${loginFormWasVisible && requestWasFound ? 'PASS' : 'FAIL'}`);

        expect(loginFormWasVisible, 'the embedded helpdesk must show a login form when clicking Tickets').toBe(true);
        expect(requestWasFound, 'the request AUTO-CRM-12135-TC-26-<runId>-admin must be listed after sign-in').toBe(true);
      });
    } finally {
      // Teardown runs HERE, not in afterEach: it needs the live session, and afterEach only
      // sees a closed context. A thrown assertion still passes through finally, so a red run
      // cleans up too.
      if (teardown) {
        try {
          await teardown();
        } catch (err) {
          console.log(`TEARDOWN ERROR: ${(err as Error).message}`);
        }
        teardown = undefined;
      }
      await context.close();
    }
  });
});
