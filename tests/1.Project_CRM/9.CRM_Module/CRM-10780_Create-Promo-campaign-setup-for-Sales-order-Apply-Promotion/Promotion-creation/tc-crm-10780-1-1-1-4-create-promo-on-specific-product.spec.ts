import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Create promotion applied to a specific product.
 * Test Case ID: CRM-10780_1.1.1.4   (Jira: CRM-10847 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Sales Manager creates a Promotion Program (Sales > Products > Promotion Programs) with
 *          Automatically Applied, Reward = Discount, Apply Discount = 10% (Percentage), Discount Apply On = On Specific Product (product 1).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_1\.1\.1\.4:" --project=chromium
 *
 * Source manual TC (Jira CRM-10847)
 *   Test Repository Path: /CRM test/Sales module/CRM-10780_Create Promo-campaign setup for Sales order/Promotion creation
 *
 *   Pre-conditions:
 *     Login as Sales Manager. Ex: Max Zaprykutenko
 *
 *   Steps:
 *     1. Open Sales module
 *     2. Navigate to Product > Promotion programs
 *     3. Create new Promotion with:
 *        - Promo Code Usage = Automation applied
 *        - Reward = discount
 *        - Apply Discount = 10% percentage
 *        - Discount Apply On = On Specific product
 *        - Product = product 1
 *
 *   Expected Result (step 3):
 *     Record created successfully, Promotion only applies to product 1
 *
 * Design notes:
 * - Sales Manager actor = users.manager_max (a Sales Manager can create Promotion Programs).
 * - Verification baseline = record saved (not in edit mode) + active=True ("Record created successfully").
 */

const ACTOR = users.manager_max;
const SKIP_CLEANUP = false;

test.describe('CRM-10780_1.1.1.4 - Create promotion applied to a specific product', () => {
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

  test('CRM-10780_1.1.1.4: Create promotion applied to a specific product', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const promotionPage = new PromotionPage(page);

    await test.step('Pre-condition: Login as Sales Manager. Ex: Max Zaprykutenko', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ACTOR.username, ACTOR.password);
      await loginPage.dismissLocationPermissionDialog();
    });

    await test.step('Step 1: Open Sales module', async () => {
      await promotionPage.openSalesModule();
    });

    await test.step('Step 2: Navigate to Product > Promotion programs', async () => {
      await promotionPage.navigateToPromotionPrograms();
    });

    await test.step('Step 3: Create new Promotion with Automatically Applied, Reward = Discount, Apply Discount = 10% Percentage, Discount Apply On = On Specific Product (product 1)', async () => {
      await promotionPage.clickCreate();
      promoName = promotionPage.generatePromotionName('TEST- Specific 10% ');
      await promotionPage.setName(promoName);
      await promotionPage.selectPromoCodeUsage('Automatically Applied');
      await promotionPage.selectReward('Discount');
      await promotionPage.selectApplyDiscount('Percentage');
      await promotionPage.setDiscountPercentage(10);
      await promotionPage.selectDiscountApplyOn('On Specific Product');
      await promotionPage.setSpecificProduct('[A2144B]');
      createdUrl = await promotionPage.save();
      console.log('Saved Promotion "' + promoName + '" at ' + createdUrl);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10847 - Promotion created');
      expect(await promotionPage.isInEditMode(), 'Promotion should have saved (not stuck in edit mode)').toBeFalsy();
      expect(createdUrl, 'Saved Promotion URL should reference a record id').toMatch(/id=\d+/);
      expect(await promotionPage.isPromotionActive(), 'Created Promotion should be active').toBeTruthy();
    });
  });
});
