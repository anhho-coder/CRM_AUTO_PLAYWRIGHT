import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, LicensePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =================================================================================================
 *  CRM-12501 - Perpetual licences stamped with a 365-day expiry
 *  TC 7.1.1 - the reported perpetual licence no longer carries an expiry
 * =================================================================================================
 *  Test Case ID    : CRM-12501_7.1.1
 *  Jira            : CRM-12501
 *  Automation-Type : refactored
 *  Automation-Date : 2026-09-10
 *
 *  Summary:
 *    Opens the perpetual licence that triggered the ActiveCampaign "subscription expires in 3
 *    months" reminder and asserts the corrected state - Perpetual, Expires = never, Expire Mode =
 *    none, no expiry field on screen - with the SKU's maintenance window left untouched.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12501_7\.1\.1:" --project=chromium
 *
 * -------------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-12501, dev comment of 2026-09-07 17:56 (+03:00),
 *                     Test case 5 "the reported licence is now clean"
 *                     -> VERIFIED PASS by the reporter on 2026-09-08 09:57 (+03:00).
 *
 *  Supersedes the same check as "Test case 1" in the earlier 2026-09-07 10:38 comment. The wording
 *  moved on: the reporter's confirmation states Perpetual + Expire Mode = none + Expires = never
 *  with the maintenance window (20 Nov 2025 -> 20 Nov 2026) unchanged - all already asserted below.
 * -------------------------------------------------------------------------------------------------
 *  Pre-condition(s)
 *    1. Login to Pre-production as admin CRM (a License Manager account).
 *
 *  Steps to reproduce #1
 *    1. Open licence #146359, the one that triggered the reminder.
 *
 *  Verification
 *    - It now shows Perpetual, Expires = never, expiration days = 0
 *      (before: Expires = in, 365 days, which was an exact copy of the maintenance window).
 *
 *  Expected field values (from the ticket's "Root cause" table - actual vs expected):
 *    - Licensing            = Perpetual
 *    - Expires              = never          (was: in)
 *    - Expire Mode          = none           (was: available)
 *    - Expiration Days      = 0 / not shown  (was: 365)
 *    - Expire Start Date    = empty          (was: 2025-11-20)
 *    - Expiration End Date  = empty          (was: 2026-11-20)
 *    - Maintenance Days     = 365            (correct - must stay)
 *    - Maintenance End Date = 11/20/2026     (correct - must stay)
 *
 * -------------------------------------------------------------------------------------------------
 *  UI grounding - where the real screen differs from the manual TC's wording
 * -------------------------------------------------------------------------------------------------
 *  | Point                | Manual TC says            | What the UI actually does                 |
 *  |----------------------|---------------------------|--------------------------------------------|
 *  | "expiration days = 0"| a value of 0 on screen    | the field is NOT rendered at all. Form     |
 *  |                      |                           | view 2441 hides `expiration_days` with     |
 *  |                      |                           | attrs invisible: expires != 'in', and hides|
 *  |                      |                           | `expire_start_date` / `expiration_end_date`|
 *  |                      |                           | with expire_mode != 'PER_LICENSE'.         |
 *  Resolution (keeps the check intact): assert BOTH that the field is not displayed AND that the
 *  value reads as empty-or-zero, so a re-appearing 365 fails the test either way.
 *
 * -------------------------------------------------------------------------------------------------
 *  Deviation from skill REQUIREMENT #2 (fresh self-created data) - deliberate
 * -------------------------------------------------------------------------------------------------
 *  This TC verifies the DATA CORRECTION applied to the one licence the customer complained about,
 *  so the record under test is by definition pre-existing and named by id. The test is read-only
 *  and idempotent, so back-to-back runs both pass with no setup or cleanup. The code fix itself is
 *  covered by TC 7.1.2 / 7.1.3, which do build their own fresh data.
 */

// The licence that triggered the ActiveCampaign reminder (reseller ICD / Skellefteaa Rostfria AB).
const REPORTED_LICENSE_ID = 146359;
const LICENSE_MODEL = 'license_management.license';

// Expected corrected state - straight from the ticket's root-cause table.
const EXPECTED_LICENSING = 'Perpetual';
const EXPECTED_EXPIRES = 'never';
const EXPECTED_EXPIRE_MODE = 'none';
const EXPECTED_MAINTENANCE_MODE = 'available';
const EXPECTED_MAINTENANCE_DAYS = '365';
const EXPECTED_MAINTENANCE_START = '11/20/2025'; // en_US display of 2025-11-20
const EXPECTED_MAINTENANCE_END = '11/20/2026';   // en_US display of 2026-11-20

test.describe('CRM-12501_7.1 - Perpetual licence must not carry an expiry', () => {
  test.beforeEach(async ({ context }) => {
    // Clear cookies to ensure a fresh session. No screenshot here: the page is still about:blank.
    await context.clearCookies();
    await CommonUtils.wait(CommonUtils.waitTimes.medium);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});

    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      await CommonUtils.waitForSpinnersToHide(
        page,
        CommonUtils.waitTimes.extraLong,
        CommonUtils.waitTimes.abnormalWait
      ).catch(() => {});
    }

    // Nothing to delete: this TC is read-only (see the "Deviation from REQUIREMENT #2" note).
    console.log('Teardown: nothing to delete - this TC creates no records');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-12501_7.1.1: Verify the reported perpetual licence no longer carries an expiry', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const licensePage = new LicensePage(page);

    let licenseName = '';
    let licensing = '';
    let expires = '';
    let expireMode = '';
    let expirationDaysShown = true;
    let expirationDays = '';
    let expireStartDateShown = true;
    let expirationEndDateShown = true;
    let maintenanceMode = '';
    let maintenanceDays = '';
    let maintenanceStartDate = '';
    let maintenanceEndDate = '';

    // -------------------------------------------------------------------------------------------
    // Pre-condition #1
    // -------------------------------------------------------------------------------------------
    await test.step('Pre-condition 1: Login to Pre-production as admin CRM (a License Manager account)', async () => {
      console.log(`Pre-condition 1: Logging in as ${users.admin_crm.username}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('  - Login successful');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as admin CRM');
    });

    // -------------------------------------------------------------------------------------------
    // Steps to reproduce #1
    // -------------------------------------------------------------------------------------------
    await test.step(`Step 1: Open licence #${REPORTED_LICENSE_ID}, the one that triggered the reminder`, async () => {
      await licensePage.openRecordFormById(baseUrl, LICENSE_MODEL, REPORTED_LICENSE_ID);
      await licensePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);

      licenseName = await licensePage.getLicenseNameValue();
      licensing = await licensePage.getLicensingValue();
      expires = await licensePage.getExpiresValue();
      expireMode = await licensePage.getExpireModeValue();
      expirationDaysShown = await licensePage.isFieldDisplayed('expiration_days');
      expirationDays = await licensePage.getExpirationDaysValue();
      expireStartDateShown = await licensePage.isFieldDisplayed('expire_start_date');
      expirationEndDateShown = await licensePage.isFieldDisplayed('expiration_end_date');
      maintenanceMode = await licensePage.getMaintenanceModeValue();
      maintenanceDays = await licensePage.getMaintenanceDaysValue();
      maintenanceStartDate = await licensePage.getMaintenanceStartDateValue();
      maintenanceEndDate = await licensePage.getMaintenanceEndDateValue();

      console.log(`  - Licence read: #${REPORTED_LICENSE_ID}`);
      console.log(`  - Name                 : ${licenseName}`);
      console.log(`  - Licensing            : ${licensing}`);
      console.log(`  - Expires              : ${expires}`);
      console.log(`  - Expire Mode          : ${expireMode}`);
      console.log(`  - Expiration Days shown: ${expirationDaysShown}`);
      console.log(`  - Expiration Days      : ${expirationDays === '' ? '(not rendered)' : expirationDays}`);
      console.log(`  - Expire Start shown   : ${expireStartDateShown}`);
      console.log(`  - Expiration End shown : ${expirationEndDateShown}`);
      console.log(`  - Maintenance Mode     : ${maintenanceMode}`);
      console.log(`  - Maintenance Days     : ${maintenanceDays}`);
      console.log(`  - Maintenance Start    : ${maintenanceStartDate}`);
      console.log(`  - Maintenance End      : ${maintenanceEndDate}`);

      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `Steps to reproduce I - licence ${REPORTED_LICENSE_ID} open`
      );
    });

    // -------------------------------------------------------------------------------------------
    // Verification
    // -------------------------------------------------------------------------------------------
    await test.step('Verification: Perpetual, Expires = never, expiration days = 0, maintenance window untouched', async () => {
      const expirationDaysNumeric = parseInt((expirationDays || '0').replace(/[^\d-]/g, '') || '0', 10);
      const expirationDaysIsZero = expirationDays === '' || expirationDaysNumeric === 0;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Licensing on the licence form:');
      console.log(`     Expected : ${EXPECTED_LICENSING}`);
      console.log(`     Actual   : ${licensing}`);
      console.log(`     Result   : ${licensing === EXPECTED_LICENSING ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Expires:');
      console.log(`     Expected : ${EXPECTED_EXPIRES}`);
      console.log(`     Actual   : ${expires}`);
      console.log(`     Result   : ${expires === EXPECTED_EXPIRES ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - Expire Mode:');
      console.log(`     Expected : ${EXPECTED_EXPIRE_MODE}`);
      console.log(`     Actual   : ${expireMode}`);
      console.log(`     Result   : ${expireMode === EXPECTED_EXPIRE_MODE ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - "Expiration Days" field displayed (Odoo hides it when Expires != in):');
      console.log('     Expected : NOT DISPLAYED');
      console.log(`     Actual   : ${expirationDaysShown ? 'DISPLAYED' : 'NOT DISPLAYED'}`);
      console.log(`     Result   : ${expirationDaysShown === false ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - Expiration Days value (the 365 that caused the wrong reminder):');
      console.log('     Expected : empty or 0');
      console.log(`     Actual   : ${expirationDays === '' ? '(not rendered)' : expirationDays}`);
      console.log(`     Result   : ${expirationDaysIsZero ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #6 - "Expire Start Date" field displayed:');
      console.log('     Expected : NOT DISPLAYED');
      console.log(`     Actual   : ${expireStartDateShown ? 'DISPLAYED' : 'NOT DISPLAYED'}`);
      console.log(`     Result   : ${expireStartDateShown === false ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #7 - "Expiration End Date" field displayed:');
      console.log('     Expected : NOT DISPLAYED');
      console.log(`     Actual   : ${expirationEndDateShown ? 'DISPLAYED' : 'NOT DISPLAYED'}`);
      console.log(`     Result   : ${expirationEndDateShown === false ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #8 - Maintenance Mode (the SKU support window must survive the fix):');
      console.log(`     Expected : ${EXPECTED_MAINTENANCE_MODE}`);
      console.log(`     Actual   : ${maintenanceMode}`);
      console.log(`     Result   : ${maintenanceMode === EXPECTED_MAINTENANCE_MODE ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #9 - Maintenance Days:');
      console.log(`     Expected : ${EXPECTED_MAINTENANCE_DAYS}`);
      console.log(`     Actual   : ${maintenanceDays}`);
      console.log(`     Result   : ${maintenanceDays === EXPECTED_MAINTENANCE_DAYS ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #10 - Maintenance Start Date:');
      console.log(`     Expected : ${EXPECTED_MAINTENANCE_START}`);
      console.log(`     Actual   : ${maintenanceStartDate}`);
      console.log(`     Result   : ${maintenanceStartDate === EXPECTED_MAINTENANCE_START ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #11 - Maintenance End Date:');
      console.log(`     Expected : ${EXPECTED_MAINTENANCE_END}`);
      console.log(`     Actual   : ${maintenanceEndDate}`);
      console.log(`     Result   : ${maintenanceEndDate === EXPECTED_MAINTENANCE_END ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: licence #${REPORTED_LICENSE_ID} - perpetual with no expiry, maintenance window intact`);

      expect(licensing, `Licensing on licence #${REPORTED_LICENSE_ID} must be "${EXPECTED_LICENSING}"`)
        .toBe(EXPECTED_LICENSING);
      expect(expires, `Expires must be "${EXPECTED_EXPIRES}" - a perpetual licence never expires`)
        .toBe(EXPECTED_EXPIRES);
      expect(expireMode, `Expire Mode must be "${EXPECTED_EXPIRE_MODE}" - nothing expires on a perpetual licence`)
        .toBe(EXPECTED_EXPIRE_MODE);
      expect(expirationDaysShown, 'The "Expiration Days" field must NOT be displayed while Expires = never')
        .toBe(false);
      expect(expirationDaysIsZero, `Expiration Days must be empty or 0, read "${expirationDays}" (365 = the reported defect)`)
        .toBe(true);
      expect(expireStartDateShown, 'The "Expire Start Date" field must NOT be displayed while Expire Mode = none')
        .toBe(false);
      expect(expirationEndDateShown, 'The "Expiration End Date" field must NOT be displayed while Expire Mode = none')
        .toBe(false);
      expect(maintenanceMode, `Maintenance Mode must stay "${EXPECTED_MAINTENANCE_MODE}" - the fix must not touch maintenance`)
        .toBe(EXPECTED_MAINTENANCE_MODE);
      expect(maintenanceDays, `Maintenance Days must stay "${EXPECTED_MAINTENANCE_DAYS}"`)
        .toBe(EXPECTED_MAINTENANCE_DAYS);
      expect(maintenanceStartDate, `Maintenance Start Date must stay "${EXPECTED_MAINTENANCE_START}"`)
        .toBe(EXPECTED_MAINTENANCE_START);
      expect(maintenanceEndDate, `Maintenance End Date must stay "${EXPECTED_MAINTENANCE_END}"`)
        .toBe(EXPECTED_MAINTENANCE_END);
    });
  });
});
