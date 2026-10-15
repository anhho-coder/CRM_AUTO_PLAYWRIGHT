import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, ScheduledActionPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_9.2: The scheduled currency rate update cron is visible and properly configured
 * ===========================================================================
 *  Test Case ID    : CRM-11857_9.2
 *  Jira            : CRM-13419
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13419 updated 2026-10-08T07:01:50+0300, 4 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for an Administrator to
 *                    access Scheduled Actions and verify the currency rate update cron configuration,
 *                    both of which require full access rights.
 *
 *  Summary:
 *    Open the Scheduled Actions screen, locate and open the "Currency Rates Update (OCA) daily"
 *    cron, and verify its state is visible and properly configured (showing name, frequency, next
 *    execution, and active status).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_9\.2:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13419 (verbatim, in OLD generic format)
 * ---------------------------------------------------------------------------
 *
 *  Pre-condition: Login as Admin to O12 CE Migration server
 *
 *  1. 1. Login to O12 CE Migration server
 *     Expected Result: 1. The scheduled action is visible and can be opened (no special
 *                      permissions required)
 *
 *  2. 2. Open Scheduled Actions (menu 11, action 11 / ir.cron)
 *     Expected Result: 2. The cron name matches the OCA currency_rate_update job
 *
 *  3. 3. Locate and open the "Currency Rates Update (OCA) daily" cron job
 *     Expected Result: 3. The state fields are readable (freq, next_call, active status)
 *
 *  4. 4. Read and verify the cron state (name, frequency, next execution time)
 *     Expected Result: 4. The cron is properly configured (visible state proves
 *                      maintainability)
 *
 * ---------------------------------------------------------------------------
 *  OPEN QUESTIONS for the TC author
 * ---------------------------------------------------------------------------
 *
 *  This Jira TC (CRM-13419) was never rewritten from its generated format. Its steps and
 *  expected results are misaligned:
 *
 *  - Step 1's expected result talks about "scheduled action is visible and can be opened"
 *    (a statement about the whole Scheduled Actions screen), not about login.
 *  - Step 2's expected result talks about the "cron name" (a property of one specific cron),
 *    not about the Scheduled Actions list.
 *  - Steps 3 and 4 both talk about cron state fields (freq, next_call, active, configured),
 *    making the split between them unclear.
 *
 *  The spec implements what each step literally says (login, open Scheduled Actions, open the
 *  cron, read state) and asserts only what can be measured from those actions. The mismatched
 *  expectations are printed in the VERIFY block to be visible if the spec passes despite the
 *  misalignment.
 *
 *  This TC needs rewriting by its author to the style of the other 36 TCs in this suite, with
 *  aligned step actions and expected results.
 *
 * ---------------------------------------------------------------------------
 *  SKIPPED - environment limitation, not a product or spec defect
 * ---------------------------------------------------------------------------
 *
 *  Measured on crm-mig 2026-10-14, after the rebuild that re-sequenced the ids:
 *    - `currency_rate_update` 12.0.1.3.1 is INSTALLED
 *    - the ECB provider record EXISTS, with all 6 currencies and interval 1 Day
 *    - but `ir.cron` holds NO record whose name contains "rate" - the scheduled
 *      action "Currency Rates Update (OCA) daily" was not created by the deploy.
 *
 *  This case drives that scheduled action, so it cannot run at all until the cron
 *  is restored on the build. Skipped at DECLARATION level on the tester's ruling
 *  (2026-10-14) so no browser is launched for it.
 *
 *  RE-ENABLE by deleting the `.skip` below once the cron exists again.
 *
 * ===========================================================================
 */

const CRON_NAME = 'Currency Rates Update (OCA) daily';

const STEP = {
  pre: 'Pre-condition: Login as Admin to O12 CE Migration server',
  s1: 'Step 1: Login to O12 CE Migration server',
  s2: 'Step 2: Open Scheduled Actions (menu 11, action 11 / ir.cron)',
  s3: 'Step 3: Locate and open the "Currency Rates Update (OCA) daily" cron job',
  s4: 'Step 4: Read and verify the cron state (name, frequency, next execution time)',
  verify: 'Verification: The scheduled currency rate update cron is visible and properly configured',
} as const;

test.describe('CRM-11857_9.2 - Exchange Rates: The scheduled currency rate update cron is visible and properly configured, proving the system is maintainable by the business', () => {
  test.describe.configure({ timeout: config.timeouts.test });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip('CRM-11857_9.2: The scheduled currency rate update cron is visible and properly configured, proving the system is maintainable by the business [SKIPPED - the OCA scheduled action is absent from this crm-mig build]', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const scheduledActionPage = new ScheduledActionPageMig(page);

    let loginSucceeded = false;
    let scheduledActionsOpened = false;
    let cronOpened = false;
    let cronState: any = null;

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      loginSucceeded = true;
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log(`  - Login status: ${loginSucceeded ? 'successful' : 'failed'}`);
      // Jira step 1's Expected Result talks about "The scheduled action is visible and can be opened",
      // which is actually about the Scheduled Actions screen, not login. This is marked in the header
      // as a misalignment between steps and expected results.
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - logged in').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      scheduledActionsOpened = await scheduledActionPage.openScheduledAction(CRON_NAME);
      console.log(`  - Scheduled Actions opened and "${CRON_NAME}" found: ${scheduledActionsOpened}`);
      // Jira step 2's Expected Result talks about "The cron name matches the OCA currency_rate_update job",
      // which is actually a property read (step 4), not about opening the Scheduled Actions list.
      // This is another misalignment noted in the header.
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Scheduled Actions').catch(() => {});
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      // Step 3 is "Locate and open the cron" - we already did this in step 2 with openScheduledAction.
      // The Jira structure conflates "opening Scheduled Actions" with "opening the cron" in different steps.
      cronOpened = scheduledActionsOpened;
      console.log(`  - Currency Rates Update cron opened: ${cronOpened}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - cron opened').catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      if (cronOpened) {
        try {
          cronState = await scheduledActionPage.readState();
          console.log(`  - Cron name          : ${cronState?.name || '(not readable)'}`);
          console.log(`  - Frequency          : ${cronState?.frequency || '(not readable)'}`);
          console.log(`  - Next execution     : ${cronState?.nextCall || '(not readable)'}`);
          console.log(`  - Active status      : ${cronState?.isActive !== undefined ? cronState.isActive : '(not readable)'}`);
        } catch (e: any) {
          console.log(`  - Error reading cron state: ${e.message}`);
          cronState = null;
        }
      } else {
        console.log('  - Cron not opened, cannot read state');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - cron state read').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('==================== VERIFY ====================');
      console.log('');
      console.log('NOTE: The Jira TC (CRM-13419) has misaligned step actions and expected results (see');
      console.log('header). This spec implements what each step literally says and asserts only what');
      console.log('can be measured from those actions. The expected results printed below may not');
      console.log('match the step actions that produced them.');
      console.log('');

      const nameMatches =
        cronState && cronState.name && (cronState.name.toLowerCase().includes('currency') || cronState.name.toLowerCase().includes('rate'));
      const stateReadable =
        cronState &&
        (cronState.frequency !== undefined && cronState.frequency !== '') &&
        (cronState.nextCall !== undefined && cronState.nextCall !== '') &&
        cronState.isActive !== undefined;

      console.log('  Jira Step 1 Expected Result (misaligned):');
      console.log('     "The scheduled action is visible and can be opened" (actually about the Scheduled Actions screen)');
      console.log(`     Actual from Step 2 : ${scheduledActionsOpened ? 'PASS - Scheduled Actions opened' : 'FAIL - not opened'}`);
      console.log('');

      console.log('  Jira Step 2 Expected Result (misaligned):');
      console.log('     "The cron name matches the OCA currency_rate_update job" (actually about cron properties)');
      console.log(`     Actual from Step 4 : ${cronState && cronState.name ? `"${cronState.name}" - ${nameMatches ? 'PASS' : 'FAIL'}` : 'FAIL - name not readable'}`);
      console.log('');

      console.log('  Jira Step 3 Expected Result (misaligned):');
      console.log('     "The state fields are readable (freq, next_call, active status)" (actually about state reading)');
      console.log(`     Actual from Step 4 : ${stateReadable ? 'PASS - state fields readable' : 'FAIL - state not fully readable'}`);
      if (cronState) {
        console.log(`        - frequency = ${cronState.frequency || '(empty)'}`);
        console.log(`        - nextCall  = ${cronState.nextCall || '(empty)'}`);
        console.log(`        - isActive  = ${cronState.isActive}`);
      }
      console.log('');

      console.log('  Jira Step 4 Expected Result (misaligned):');
      console.log('     "The cron is properly configured (visible state proves maintainability)" (actually about cron properties)');
      console.log(`     Actual from Step 4 : ${cronState && stateReadable ? 'PASS - cron state visible and properly configured' : 'FAIL - state not fully visible'}`);
      console.log('');

      console.log('===============================================');
      const overall = loginSucceeded && scheduledActionsOpened && cronOpened && stateReadable;
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - The scheduled cron is visible and its state can be read`);

      let __verifyPassed = false;
      try {
        expect(loginSucceeded, 'Login should succeed').toBe(true);
        expect(scheduledActionsOpened, 'Scheduled Actions should be openable').toBe(true);
        expect(cronOpened, 'The Currency Rates Update cron should be locatable').toBe(true);
        expect(cronState, 'Cron state should be readable').toBeTruthy();
        expect(stateReadable, 'Cron frequency, nextCall, and active status should all be readable').toBe(true);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: 'CRM-11857_9.2 - Scheduled Action visible and configured',
          passed: __verifyPassed,
          highlight: ['form.o_form_view'],
        }).catch(() => {});
      }
    });
  });
});


