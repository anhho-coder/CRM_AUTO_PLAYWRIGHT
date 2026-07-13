import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Create auto-applied promotion with % discount on entire order.
 * Test Case ID: CRM-10780_1.1.1.1   (Jira: CRM-10844 - Post-EA Test Case)
 * Automation-Type: refactored
 * Automation-Date: 2026-06-22
 *
 * Summary: A Sales Manager creates a Promotion Program (Sales > Products > Promotion Programs) that is
 *          Automatically Applied, Reward = Discount, Apply Discount = 10% (Percentage), Discount Apply On
 *          = On Order; the record is created and active.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_1\.1\.1\.1:" --project=chromium
 *
 * Source manual TC (Jira CRM-10844)
 *   Test Repository Path: /CRM test/Sales module/CRM-10780_Create Promo-campaign setup for Sales order/Promotion creation
 *
 *   Pre-conditions:
 *     Login as Sales Manager. Ex: Max Zaprykutenko
 *
 *   Steps:
 *     1. Open Sales module
 *     2. Navigate to Products > Promotion programs
 *     3. Create new Promotion with:
 *        - Promotion Program Name = TEST- Order - 10%
 *        - Promo Code Usage = Automation applied
 *        - Reward = Discount
 *        - Apply Discount = Percentage - 10%
 *        - Discount Apply On = On Order
 *
 *   Expected Result (step 3):
 *     Record created successfully, active=True
 *
 * Design notes:
 * - Sales Manager = users.manager_max (Max Zaprykutenko); a Sales Manager can reach Sales >
 *   Products > Promotion Programs (model sale.coupon.program) and create a program. (The Jira TC
 *   pre-condition lists "Ex: Veronika" as an example; actor switched to Max Zaprykutenko per request.)
 * - Promotion Program Name format (per the updated TC) = "TEST- Order - 10%"; a unique timestamp suffix
 *   is appended so the record stays isolatable/cleanable across runs.
 */

const ACTOR = users.manager_max;
const SKIP_CLEANUP = false;

test.describe('CRM-10780_1.1.1.1 - Create auto-applied promotion with % discount on entire order', () => {
  let createdUrl = '';
  let promoName = '';

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
    // Tear Down: go back to the Promotion Program list, select the just-created promotion by name,
    // then Action > Archive (soft-delete instead of hard delete).
    if (!SKIP_CLEANUP && promoName) {
      const promotionPage = new PromotionPage(page);
      await promotionPage.archivePromotionByName(promoName).catch((e) => {
        console.log(`  ⚠ Archive teardown failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      });
    }
  });

  test('CRM-10780_1.1.1.1: Create auto-applied promotion with % discount on entire order', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const promotionPage = new PromotionPage(page);

    // Pre-condition: Login as Sales Manager (Max Zaprykutenko)
    await test.step('Pre-condition: Login as Sales Manager. Ex: Max Zaprykutenko', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ACTOR.username, ACTOR.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Logged in as Sales Manager ${ACTOR.displayName}`);
    });

    // Step 1: Open Sales module
    await test.step('Step 1: Open Sales module', async () => {
      await promotionPage.openSalesModule();
    });

    // Step 2: Navigate to Product > Promotion programs
    await test.step('Step 2: Navigate to Product > Promotion programs', async () => {
      await promotionPage.navigateToPromotionPrograms();
    });

    // Step 3: Create new Promotion (Name "TEST- Order - 10%", Automatically Applied, Reward=Discount, Apply Discount=10% Percentage, On Order)
    await test.step('Step 3: Create new Promotion with Promotion Program Name = TEST- Order - 10%, Promo Code Usage = Automatically Applied, Reward = Discount, Apply Discount = Percentage - 10%, Discount Apply On = On Order', async () => {
      await promotionPage.clickCreate();
      promoName = promotionPage.generatePromotionName('TEST- Order - 10% ');
      await promotionPage.setName(promoName);
      await promotionPage.selectPromoCodeUsage('Automatically Applied');
      await promotionPage.selectReward('Discount');
      await promotionPage.selectApplyDiscount('Percentage');
      await promotionPage.setDiscountPercentage(10);
      await promotionPage.selectDiscountApplyOn('On Order');
      createdUrl = await promotionPage.save();
      console.log(`✓ Saved Promotion "${promoName}" at ${createdUrl}`);

      // Expected: record created successfully, active = True
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10844 - Promotion created');
      const stillEditing = await promotionPage.isInEditMode();
      expect(stillEditing, 'The Promotion should have saved (not stuck in edit mode)').toBeFalsy();
      expect(createdUrl, 'The saved Promotion URL should reference a record id').toMatch(/id=\d+/);
      const active = await promotionPage.isPromotionActive();
      console.log(`  - Promotion active = ${active}`);
      expect(active, 'The created Promotion should be active (active=True)').toBeTruthy();
      console.log('✅ Auto-applied % promotion created successfully and is active');
    });
  });
});
