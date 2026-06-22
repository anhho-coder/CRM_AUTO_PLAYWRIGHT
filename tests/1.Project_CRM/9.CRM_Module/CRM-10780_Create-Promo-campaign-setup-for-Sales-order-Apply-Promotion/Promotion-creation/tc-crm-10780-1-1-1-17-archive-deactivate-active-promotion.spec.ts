import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Archive / deactivate an active Promotion Program from the Sales module.
 * Test Case ID: CRM-10780_1.1.1.17   (Jira: CRM-10860 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Sales Manager creates a Promotion Program (Sales > Products > Promotion Programs) with
 *          an active promotion ("Promotion A") which is then opened and closed (archived/deactivated).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_1\.1\.1\.17:" --project=chromium
 *
 * Source manual TC (Jira CRM-10860)
 *   Test Repository Path: /CRM test/Sales module/CRM-10780_Create Promo-campaign setup for Sales order/Promotion creation
 *
 *   Pre-conditions:
 *     Login as Sales Manager. Ex: Veronika
 *     Promotion A is currently active
 *
 *   Steps:
 *     1. Open Sales module
 *     2. Navigate to Product > Promotion programs
 *     3. Open Promotion A
 *     4. Close Promotion
 *
 *   Expected Result (final step):
 *     Close successfully
 *
 * Design notes:
 * - Sales Manager actor = users.manager_max (a Sales Manager can manage Promotion Programs).
 * - This is an ARCHIVE/DEACTIVATE TC, not a creation TC. The "Promotion A is currently active"
 *   precondition is established in-test by creating an active promotion first (createPromotion),
 *   then the manual steps open the list and archive it.
 * - "Close Promotion" maps to PromotionPage.archivePromotionByName(name) (Action > Archive), the only
 *   deactivate method that exists. Verification baseline = the promotion is no longer active
 *   ("Close successfully").
 * - The supplied creation template does not fit this archive flow; see returned notes for the
 *   field-mapping mismatch (step 3 lists no promotion fields, and there is no PromotionPage method to
 *   open an existing promotion by name or to close it from the form view).
 */

const ACTOR = users.manager_max;
const SKIP_CLEANUP = false;

test.describe('CRM-10780_1.1.1.17 - Archive / Deactivate an active promotion', () => {
  let createdUrl = '';
  let promoName = '';

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }) => {
    if (!SKIP_CLEANUP && promoName) {
      const promotionPage = new PromotionPage(page);
      await promotionPage.archivePromotionByName(promoName).catch((e) => {
        console.log('  archive teardown failed (non-fatal): ' + (e instanceof Error ? e.message : String(e)));
      });
    }
  });

  test('CRM-10780_1.1.1.17: Archive / Deactivate an active promotion', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const promotionPage = new PromotionPage(page);

    await test.step('Pre-condition: Login as Sales Manager. Ex: Veronika', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ACTOR.username, ACTOR.password);
      await loginPage.dismissLocationPermissionDialog();
    });

    await test.step('Pre-condition: Promotion A is currently active', async () => {
      const promo = await promotionPage.createPromotion({ namePrefix: 'TEST- Archive 1.1.1.17 ' });
      promoName = promo.name;
      createdUrl = promo.url;
      console.log('Created active "Promotion A" "' + promoName + '" at ' + createdUrl);
      expect(await promotionPage.isPromotionActive(), 'Precondition: Promotion A should be active').toBeTruthy();
    });

    await test.step('Step 1: Open Sales module', async () => {
      await promotionPage.openSalesModule();
    });

    await test.step('Step 2: Navigate to Product > Promotion programs', async () => {
      await promotionPage.navigateToPromotionPrograms();
    });

    await test.step('Step 3: Open Promotion A', async () => {
      // NOTE: there is no PromotionPage method to open an existing promotion by name from the list yet.
      // The close action below isolates Promotion A by its unique name in the list view.
      console.log('Targeting Promotion A: "' + promoName + '"');
    });

    await test.step('Step 4: Close Promotion', async () => {
      const archived = await promotionPage.archivePromotionByName(promoName);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10860 - Promotion closed');
      expect(archived, 'Promotion A should be closed (archived) successfully').toBeTruthy();
    });
  });
});
