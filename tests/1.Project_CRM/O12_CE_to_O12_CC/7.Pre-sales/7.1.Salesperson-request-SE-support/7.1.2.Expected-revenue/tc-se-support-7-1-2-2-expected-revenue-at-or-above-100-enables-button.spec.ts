import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * ============================================================================================
 *  pre-sale-7.1.2.2 - REQUEST SE SUPPORT is enabled when Expected Revenue >= $100
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    pre-sale-7.1.2.2
 *  Jira:            (none - authored from an inline manual TC)
 *  Automation-Type: new
 *  Automation-Date: 2026-07-28
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Positive boundary of pre-sale-7.1.2.1. Verify that when the Opportunity's Expected Revenue is
 *    AT the $100 threshold, the "REQUEST SE SUPPORT" button on the Opp form is present AND ENABLED
 *    (clickable), so the Salesperson can request SE support.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.1\.2\.2:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-condition #1 - the deal-registration Internal Note #1:
 *    Build Internal Note #1 from the deal-registration template, filling the <...> placeholders with
 *    fresh dynamic values each run (key fields, one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<compact date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - IP                         = 128.183.189.157
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - Country                    = United States
 *    (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *
 *  Pre-condition #2 - create the Opp (logged in as the salesperson Thomas):
 *   1-9. Login as Thomas; CRM > view list > CREATE; enter the Opportunity details:
 *          - Opp name                 = TEST Support SE - <Test Case ID> - <current date time>
 *          - Contact name             = Name from Internal Note #1
 *          - CompanyName              = Company Name Lead 1
 *          - Email                    = Email from Internal Note #1
 *          - Country                  = United States
 *          - State                    = Maryland
 *          - IP                       = 128.183.189.157
 *          - Create manually checkbox = FALSE
 *          - Sales Team               = cleared
 *          - Salesperson              = cleared
 *        then CRM Developer Lead form = NAKIVO deal registration*; Assigned Partner = TEST-Reseller#Automation-Jun10;
 *        Internal Notes = Internal Note #1; SAVE; capture Opp URL #1;
 *   9.   Refresh until Company and Contact are populated in Opp #1 (within ~10s).
 *
 *  Steps to reproduce (still logged in as Thomas):
 *   1. Open Opp #1
 *   2. Click "EDIT" on the Opp form
 *   3. Set Expected Revenue = $100 (at the threshold)
 *   4. Press "SAVE" button
 *   5. Verify the "REQUEST SE SUPPORT" button
 *
 *  Verification Point:
 *   5. The "REQUEST SE SUPPORT" button is present AND ENABLED (clickable),
 *      because the Expected Revenue ($100) is at/above the $100 threshold.
 */

// Cleanup toggle: best-effort delete of the created Opportunity on teardown (true = skip).
const SKIP_CLEANUP_OPP = false;

const TC_ID = 'pre-sale-7.1.2.2';
const EXPECTED_REVENUE_AT_THRESHOLD = '100'; // >= $100

test.describe('pre-sale-7.1.2.2 - REQUEST SE SUPPORT enabled when Expected Revenue >= $100', () => {

  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('pre-sale-7.1.2.2: Verify REQUEST SE SUPPORT is enabled when Expected Revenue is at/above $100', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);

    // Fresh, unique deal-registration data each run (REQUIREMENT #2).
    const { companyEmail, leadName, currentDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Support SE - ${TC_ID} - ${currentDateTime}`;

    // ===================== Pre-condition #1: build Internal Note #1 =====================
    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1 (edit the <...> placeholders)', async () => {
      console.log('Pre-condition #1: Internal Note #1 prepared with fresh dynamic values');
      console.log(`  - Opp name      : ${oppName}`);
      console.log(`  - Name          : ${leadName}`);
      console.log(`  - Email         : ${companyEmail}`);
      console.log(`  - Company       : Company Name Lead 1`);
      console.log(`  - IP            : 128.183.189.157`);
      console.log(`  - Partner       : TEST-Reseller#Automation-Jun10`);
      console.log(`  - Country       : United States`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    // ============ Pre-condition #2 - Steps 1-8 (+ capture Opp URL #1): create the Opp as Thomas ============
    // Grouped via the shared helper (the contiguous create block is setup, not what this TC verifies).
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition #2',
    });

    // Pre-condition #2 - Step 9: refresh until Company AND Contact populate (async partner creation).
    await test.step('Pre-condition #2 - Step 9: Refresh until Company and Contact are populated in Opp #1', async () => {
      console.log('Pre-condition #2 - Step 9: Waiting for the async Company and Contact to populate on Opp #1');
      await opportunityPage.openByUrl(createdOppUrl as string);
      const populated = await opportunityPage.waitForCompanyAndContactPopulated();
      console.log(`  - Company: "${populated.companyValue}" | Contact: "${populated.contactValue}"`);
      expect(populated.populated, 'Company and Contact should both be populated on Opp #1 before editing Expected Revenue').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Opp#1 created (Company + Contact populated)').catch(() => {});
    });

    // ===================== Steps to reproduce =====================
    await test.step('Step 1: Open Opp #1', async () => {
      console.log(`Step 1: Opening Opp #1 = ${createdOppUrl}`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      console.log('✓ Opp #1 opened');
    });

    await test.step('Step 2: Click "EDIT" on the Opp form', async () => {
      console.log('Step 2: Entering EDIT mode on Opp #1');
      const editable = await opportunityPage.clickEdit();
      expect(editable, 'The Opp form should switch to EDIT mode').toBeTruthy();
      console.log('✓ Opp #1 in EDIT mode');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Opp in EDIT mode').catch(() => {});
    });

    await test.step(`Step 3: Set Expected Revenue = $${EXPECTED_REVENUE_AT_THRESHOLD} (at the $100 threshold)`, async () => {
      console.log(`Step 3: Setting Expected Revenue to $${EXPECTED_REVENUE_AT_THRESHOLD}`);
      await opportunityPage.fillExpectedRevenueDeal(EXPECTED_REVENUE_AT_THRESHOLD);
      console.log('✓ Expected Revenue entered');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Expected Revenue set at $100').catch(() => {});
    });

    await test.step('Step 4: Press "SAVE" button', async () => {
      console.log('Step 4: Saving Opp #1');
      await opportunityPage.clickSave();
      await opportunityPage.waitForEditButton();
      console.log('✓ Opp #1 saved (back in readonly mode)');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Opp saved').catch(() => {});
    });

    await test.step('Step 5: Verify the "REQUEST SE SUPPORT" button', async () => {
      console.log('Step 5: Reading Expected Revenue + REQUEST SE SUPPORT button state');
      const revenue = await opportunityPage.getExpectedRevenue();
      const seState = await opportunityPage.getRequestSESupportState();
      console.log(`  - Expected Revenue read back : $${revenue}`);
      console.log(`  - REQUEST SE SUPPORT present  : ${seState.present}`);
      console.log(`  - REQUEST SE SUPPORT disabled : ${seState.disabled}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - REQUEST SE SUPPORT button state');

      // ---- VERIFY block ----
      console.log('==================== VERIFY ====================');
      console.log(`Expected: Expected Revenue >= 100 AND REQUEST SE SUPPORT present AND ENABLED`);
      console.log(`Actual  : Expected Revenue = ${revenue}; present = ${seState.present}; disabled = ${seState.disabled}`);
      const pass = revenue >= 100 && seState.present && !seState.disabled;
      console.log(`Result  : ${pass ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      // ===================== Verification Point (5) =====================
      // VP5a: the Expected Revenue we set is at/above the $100 threshold.
      expect(revenue, `VP5a: Expected Revenue should be at/above $100 (was $${revenue})`).toBeGreaterThanOrEqual(100);
      // VP5b: the button is present on the form ...
      expect(seState.present, 'VP5b: the REQUEST SE SUPPORT button should be present on the form').toBeTruthy();
      // VP5c: ... and ENABLED (clickable) because Expected Revenue >= $100.
      expect(seState.disabled, 'VP5c: the REQUEST SE SUPPORT button should be ENABLED when Expected Revenue >= $100').toBeFalsy();
      console.log('✅ REQUEST SE SUPPORT is enabled while Expected Revenue is at/above the $100 threshold');
    });
  });
});
