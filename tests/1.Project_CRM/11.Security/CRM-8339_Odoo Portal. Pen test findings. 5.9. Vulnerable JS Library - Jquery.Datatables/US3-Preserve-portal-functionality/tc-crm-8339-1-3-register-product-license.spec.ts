import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, PortalFunctionalityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-8339 - Pen test findings 5.9 (Vulnerable JS Library - jQuery DataTables)
 *  US3 - Preserve portal functionality
 * =============================================================================================
 *  Test Case ID     : CRM-8339_1.3
 *  Jira             : CRM-11493 (Xray Manual Steps, 4 steps)
 *  Source version   : CRM-11493 updated 2026-07-09T10:37+0300 - re-check before trusting this spec
 *  Test Repository  : /CRM test/Security/CRM-8339_Pen test findings 5.9/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : partner portal user (reseller_gold)
 *  Automation-Type  : new
 *  Automation-Date  : 2026-10-13
 *  Status           : SKIPPED - NO TARGET (see BLOCKED below)
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  The case asks a partner to register a product / licence from the portal. No registration area
 *  exists on this portal, so the case has no screen to drive and is skipped rather than silently
 *  dropped or quietly repointed at a different scenario.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8339_1\\.3:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  BLOCKED - NO TARGET on pre-production (measured 2026-10-13)
 *  ---------------------------------------------------------------------------------------------
 *  Signed in as a partner, every candidate address was walked:
 *      /my/licenses          -> HTTP 404
 *      /my/license/register  -> HTTP 404
 *  and the full navigation of the signed-in portal offers no registration entry. What it does
 *  offer, under Resources, is "Request NFR License" (/nfr-download), whose form posts to
 *  /request-nfr-license/ with the fields full_name, email, phone and description.
 *
 *  That screen REQUESTS an NFR licence from NAKIVO. The case asks the partner to REGISTER a
 *  licence key they already hold and then see it listed. Those are different scenarios with
 *  different expected results, so repointing this case at the NFR form would be testing something
 *  the case never asked for and reporting it as covered.
 *
 *  This is a PORTAL finding, not a consequence of the DataTables upgrade - that upgrade touched
 *  only the internal back-office dashboard bundle and no customer-facing page. It was reported as
 *  "NO TARGET" on CRM-12630 on 2026-09-30.
 *
 *  TO UN-SKIP: when a licence-registration area exists, change `test.skip` to `test`, point
 *  REGISTER_PATH at it, and fill in the two steps that currently have no screen to drive.
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-11493 (verbatim, in order)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-conditions:
 *    A remediated build of the Odoo Portal is deployed
 *    Log in as an active partner and have a valid, unused registration value:
 *      _ Login = an active partner
 *      _ License / registration value = a fresh valid key not yet registered
 *
 *  Steps to reproduce #1:
 *    1. Log in to the portal
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS)
 *    2. Open the License / Product Registration area
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS)
 *    3. Enter the license / registration value and submit
 *       Expected: 3. Registration is accepted with a success confirmation
 *    4. Open the licenses / registrations list
 *       Expected: 4. The newly registered license / product appears in the list with the values
 *       entered
 *
 *  ---------------------------------------------------------------------------------------------
 *  OPEN POINTS raised by this spec (for the case author, not invented answers)
 *  ---------------------------------------------------------------------------------------------
 *  1. Manual steps 1 and 2 have EMPTY Expected Results in Xray.
 *  2. The product offers no licence-registration area. Either the portal is missing it or the case
 *     describes a scenario this portal never had - the case author / PM has to say which.
 * =============================================================================================
 */

const TC = 'CRM-8339_1.3';

/** The addresses walked on 2026-10-13; both answer 404. Point this at the real one to un-skip. */
const REGISTER_PATH = 'my/license/register';
const LICENSES_LIST_PATH = 'my/licenses';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Have a valid, unused registration value ready',
  pre2: 'Pre-condition 2: Log in to the portal (source step 1)',
  s2: 'Step 2: Open the License / Product Registration area',
  s3: 'Step 3: Enter the license / registration value and submit',
  s4: 'Step 4: Open the licenses / registrations list',
  verify: 'Verification',
} as const;

test.describe('CRM-8339 Security - preserve portal functionality (US3)', () => {
  test.skip(
    `${TC}: Partner can register a product / license from the portal after remediation @BLOCKED-NO-TARGET`,
    async ({ page }, testInfo) => {
      test.setTimeout(config.timeouts.test);
      await page.setViewportSize({ width: 1920, height: 1080 });

      const loginPage = new LoginPage(page);
      const portalPage = new PortalFunctionalityPage(page);
      const partner = users.reseller_gold;

      let registerStatus = 0;
      let listStatus = 0;

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        console.log(`  - Registration value : TEST-LIC-${Date.now()}`);
      });

      await test.step(STEP.pre2, async () => {
        console.log(`\n--- ${STEP.pre2} ---`);
        await loginPage.navigateTo(baseUrl);
        await loginPage.loginPortalUser(partner.username, partner.password);
        await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
        console.log(`  - Landed on : ${page.url()}`);
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        registerStatus = await portalPage.openPortalPath(baseUrl, REGISTER_PATH);
        console.log(`  - ${REGISTER_PATH} : HTTP ${registerStatus}`);
        await CommonUtils.captureAndAttachScreenshot(
          page,
          testInfo,
          `${TC} - Steps to reproduce I - the registration area`
        );
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        console.log('  - No registration form exists to fill in on this portal.');
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        listStatus = await portalPage.openPortalPath(baseUrl, LICENSES_LIST_PATH);
        console.log(`  - ${LICENSES_LIST_PATH} : HTTP ${listStatus}`);
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - The License / Product Registration area exists:');
        console.log(`     Expected : HTTP 200 for the registration area`);
        console.log(`     Actual   : HTTP ${registerStatus}`);
        console.log(`     Result   : ${registerStatus === 200 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - The licenses / registrations list exists:');
        console.log(`     Expected : HTTP 200 for the licences list`);
        console.log(`     Actual   : HTTP ${listStatus}`);
        console.log(`     Result   : ${listStatus === 200 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log('OVERALL: this case is SKIPPED - the portal has no registration area.');

        expect(registerStatus, 'the registration area should exist').toBe(200);
        expect(listStatus, 'the licences list should exist').toBe(200);
      });
    }
  );
});
