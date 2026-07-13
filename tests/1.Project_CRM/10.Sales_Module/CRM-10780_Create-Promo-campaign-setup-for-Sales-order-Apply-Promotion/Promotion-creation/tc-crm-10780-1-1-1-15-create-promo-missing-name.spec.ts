import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Create promotion with the required Name field left blank (negative case).
 * Test Case ID: CRM-10780_1.1.1.15   (Jira: CRM-10858 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Sales Manager creates a Promotion Program (Sales > Products > Promotion Programs) with
 *          Automatically Applied, Reward = Discount, Apply Discount = 10% (Percentage), Discount Apply On
 *          = On Order, but the required Program Name is left blank; the save must be rejected (error shown).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_1\.1\.1\.15:" --project=chromium
 *
 * Source manual TC (Jira CRM-10858)
 *   Test Repository Path: /CRM test/Sales module/CRM-10780_Create Promo-campaign setup for Sales order/Promotion creation
 *
 *   Pre-conditions:
 *     Login as Sales Manager. Ex: Veronika
 *
 *   Steps:
 *     1. Open Sales module
 *     2. Navigate to Product > Promotion programs
 *     3. Create new Promotion with:
 *        - Promo Code Usage = Automation applied
 *        - Reward = discount
 *        - Apply Discount = 10% percentage
 *        - Discount Apply On = On Order
 *        - Name = blank
 *
 *   Expected Result (step 3):
 *     Show error
 *
 * Design notes:
 * - Sales Manager actor = users.manager_max (a Sales Manager can create Promotion Programs).
 * - This is a NEGATIVE test: the required Name is left blank, so Odoo must block the save and show a
 *   required-field error. Verification baseline is therefore INVERTED vs. the positive specs - the form
 *   must stay in edit mode (save blocked) rather than persist a record.
 */

const ACTOR = users.manager_max;
const SKIP_CLEANUP = false;

test.describe('CRM-10780_1.1.1.15 - Create promotion with missing required name field', () => {
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

  test('CRM-10780_1.1.1.15: Create promotion with missing required name field', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const promotionPage = new PromotionPage(page);

    await test.step('Pre-condition: Login as Sales Manager. Ex: Veronika', async () => {
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

    await test.step('Step 3: Create new Promotion with Automatically Applied, Reward = Discount, Apply Discount = Percentage 10%, Discount Apply On = On Order, Name = blank', async () => {
      await promotionPage.clickCreate();
      // Name = blank: the required Program Name field is intentionally left empty (no setName call).
      await promotionPage.selectPromoCodeUsage('Automatically Applied');
      await promotionPage.selectReward('Discount');
      await promotionPage.selectApplyDiscount('Percentage');
      await promotionPage.setDiscountPercentage(10);
      await promotionPage.selectDiscountApplyOn('On Order');
      createdUrl = await promotionPage.save();
      console.log('Attempted save with blank Name; resulting URL: ' + createdUrl);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10858 - Blank name error');
      // Expected: Show error -> save is blocked, form stays in edit mode and/or a validation error appears.
      const errorText = await promotionPage.getErrorText();
      const stillEditing = await promotionPage.isInEditMode();
      console.log('  - error text: "' + errorText + '"');
      console.log('  - still in edit mode (save blocked): ' + stillEditing);
      expect(stillEditing || errorText.length > 0, 'Saving with a blank required Name should be blocked / show an error').toBeTruthy();
      expect(createdUrl, 'A record must NOT have been created (no record id in URL)').not.toMatch(/[#?&]id=\d+/);
    });
  });
});
