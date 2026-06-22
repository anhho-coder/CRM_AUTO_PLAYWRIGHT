import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Apply a promotion that has a minimum-quantity rule (Quantity = 3) to a sale order whose
 * product quantity is BELOW that rule (quantity 2 < 3) - the order does NOT qualify, so the
 * promotion can not be applied (no discount line is added, the order total is unchanged).
 *
 * Test Case ID: CRM-10780_2.1.1.4   (Jira: CRM-10864 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Salesperson opens an Opportunity, goes to its Deal Element (sale.order), adds a product
 *          at a quantity below the promotion's minimum-quantity rule (qty 2, rule = 3), and applies
 *          "Promotion A" (10% on order, Quantity = 3). Because the order does not satisfy the rule,
 *          the promotion can not be applied - no discount line appears and the total is unchanged.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_2\.1\.1\.4:" --project=chromium
 *
 * Source manual TC (Jira CRM-10864)
 *   Test Repository Path: /CRM test/Sales module/CRM-10780_Create Promo-campaign setup for Sales order/Apply Promotion
 *
 *   Pre-conditions:
 *     Login as Salesperson. Ex: Thomas Semerich
 *     There is promotion A with:
 *       _ Promotion Program Name = TEST- Order - 10%
 *       _ Promo Code Usage = Automation applied
 *       _ Reward = Discount
 *       _ Apply Discount = Percentage - 10%
 *       _ Discount Apply On = On Order
 *       _ Quantity = 3
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Open an Opp and go to Deal Element
 *     3. Select product to quantity < 3
 *     4. Apply promotion A
 *
 *   Expected Result (step 4):
 *     4. Can not apply promotion
 *
 * Design notes:
 * - "Promotion A" is created by a Sales Manager (users.manager_max) via PromotionPage.createPromotion
 *   with the minimum-quantity rule: { minQuantity: 3 } (Apply Discount = Percentage 10%, On Order).
 * - NEGATIVE case: step 3 adds the product at quantity 2 (below the rule's min quantity of 3), so the
 *   order does NOT qualify. Step 4 attempts to apply Promotion A by setting the "Promotion" field then
 *   saving; because the rule is not met, no "X% discount on total amount" line is added to Order Lines
 *   and the order total is unchanged. We assert exactly that (no promo line + total AFTER == BEFORE).
 * - The qualifying-shape Opportunity needs a real customer for the Deal Element to accept product lines
 *   (a bare Opp's Deal Element does not). We reuse the proven CRM-2338 setup: an EndUser Contact with
 *   a Pricelist, then an Opp using that contact's email - done as the Salesperson (Thomas).
 * - Cross-user: create the promo as Sales Manager, then RE-LOGIN as the Salesperson for the steps
 *   (a fresh login lands on apps-home where navigateToCRM works - navigating cross-module from inside
 *   a form view times out). Teardown re-logs in as the Sales Manager to archive the promo.
 */

const MANAGER = users.manager_max;       // Sales Manager - creates "Promotion A" (precondition)
const SALES = users.sale_ic_thomas;      // Salesperson - applies the promotion (steps under test)
const SKIP_CLEANUP = true; // per-test cleanup skipped (opp delete hangs as Salesperson); consolidated cleanup runs as admin afterward

test.describe('CRM-10780_2.1.1.4 - Apply promotion when product quantity is below rule_min_quantity', () => {
  let promoName = '';
  let promoUrl = '';
  let urlContact = '';
  let urlOpp = '';
  let contactName = '';
  let contactEmail = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      await CommonUtils.waitForSpinnersToHide(page).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    if (SKIP_CLEANUP) return;

    // Delete the Opp (also removes its Deal Element) + the Contact (generic Action > Delete by URL).
    if (urlOpp) await CommonUtils.deleteRecordByUrl(page, urlOpp, testInfo).catch((e) => console.log(`  ⚠ Opp cleanup: ${e instanceof Error ? e.message : String(e)}`));
    if (urlContact) await CommonUtils.deleteRecordByUrl(page, urlContact, testInfo).catch((e) => console.log(`  ⚠ Contact cleanup: ${e instanceof Error ? e.message : String(e)}`));

    // Archive "Promotion A" - re-login as the Sales Manager (owner / has rights), then Action > Archive.
    if (promoName) {
      const loginPage = new LoginPage(page);
      const promotionPage = new PromotionPage(page);
      try {
        await page.context().clearCookies();
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(MANAGER.username, MANAGER.password, 120000);
        await loginPage.dismissLocationPermissionDialog();
        await promotionPage.archivePromotionByName(promoName);
      } catch (e) {
        console.log(`  ⚠ Promotion archive teardown failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    urlContact = ''; urlOpp = ''; promoName = ''; promoUrl = '';
  });

  test('CRM-10780_2.1.1.4: Apply promotion when product quantity is below rule_min_quantity', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const promotionPage = new PromotionPage(page);
    const timestamp = CommonUtils.generateTimestamp();

    // ============================================================
    // Pre-condition A: "Promotion A" exists (Sales Manager creates it)
    //   10% on order, with minimum-quantity rule Quantity = 3
    // ============================================================
    await test.step('Pre-condition A: Sales Manager creates Promotion A (10% on order, Quantity = 3)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(MANAGER.username, MANAGER.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      const created = await promotionPage.createPromotion({ namePrefix: 'TEST- 2-1-1-4 ', discountPercentage: 10, minQuantity: 3 });
      promoName = created.name;
      promoUrl = created.url;
      console.log(`✓ Promotion A created: "${promoName}" @ ${promoUrl}`);
      expect(await promotionPage.isInEditMode(), 'Promotion A should have saved').toBeFalsy();
      expect(await promotionPage.isPromotionActive(), 'Promotion A should be active').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-A - Promotion A created (Quantity = 3)');
    });

    // ============================================================
    // Pre-condition: Login as Salesperson (Thomas Semerich)
    // ============================================================
    await test.step('Pre-condition: Login as Salesperson. Ex: Thomas Semerich', async () => {
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(SALES.username, SALES.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Logged in as Salesperson ${SALES.displayName}`);
    });

    // ============================================================
    // Pre-condition B: an Opportunity with a customer (EndUser Contact + Opp)
    // ============================================================
    await test.step('Pre-condition B.1: Create EndUser Contact (with Pricelist)', async () => {
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      contactName = `TEST-EndUser_CRM-10864_${timestamp}`;
      contactEmail = `test-enduser-crm10864-${timestamp}@enduser-company.com`;
      await contactPage.clickCreate();
      const result = await contactPage.createContact('Company', contactName, contactEmail, 'Chile', 'BDEU', 'Antofagasta', SALES.displayName);
      console.log(`  ✓ EndUser Contact created (id=${result.contactId})`);
      await contactPage.clickEdit();
      await contactPage.clickSalesPurchasesTab();
      await contactPage.selectPricelist('Public Pricelist_EUR');
      await contactPage.clickSaveIfEditable();
      await contactPage.waitForSaveComplete();
      await page.waitForFunction(() => { const m = window.location.href.match(/[?&#]id=(\d+)/); return m && m[1]; }, { timeout: 30000 }).catch(() => {});
      urlContact = page.url();
      console.log(`  ✓ URL_Contact = ${urlContact}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-B.1 - EndUser Contact created');
    });

    await test.step('Pre-condition B.2: Create an Opportunity (using the EndUser email)', async () => {
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      const oppName = `TEST Opp CRM-10864 ${timestamp}`;
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(contactEmail);
      await opportunityPage.fillCompanyName('Company CRM-10864');
      await opportunityPage.fillStreet('123 street');
      await opportunityPage.selectCountry('Chile');
      await opportunityPage.selectState('Antofagasta');
      await opportunityPage.selectSalesTeam('BDEU');
      await opportunityPage.selectSalesperson(SALES.displayName);
      // These three are CRM-2338-specific data-hygiene extras (not required by CRM-10864) and some are
      // admin-only fields not rendered for the Salesperson role - best-effort so they never block setup.
      await opportunityPage.uncheckCreatedManually().catch((e) => console.log(`  ⚠ uncheckCreatedManually skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.clickCRMDeveloperTab().catch((e) => console.log(`  ⚠ CRM Developer tab skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.fillLeadForm('Download Free Trial').catch((e) => console.log(`  ⚠ fillLeadForm skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.selectStage('New');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      await opportunityPage.waitForIdInUrlAndExtract();
      urlOpp = page.url();
      console.log(`  ✓ URL_Opp = ${urlOpp}`);
      await opportunityPage.waitForContactFieldPopulated(contactName, 2, 8000).catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-B.2 - Opportunity created');
    });

    // ============================================================
    // Steps (mirrors Jira CRM-10864 manual steps 1-4)
    // ============================================================
    await test.step('Step 1: Open CRM module', async () => {
      // We are already in CRM on the just-created Opportunity (pre-condition B.2).
      console.log('✓ Step 1: CRM module open (on the Opportunity)');
    });

    await test.step('Step 2: Open an Opp and go to Deal Element', async () => {
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('✓ Step 2: Deal Element (sale.order) form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Deal Element opened');
    });

    await test.step('Step 3: Select product to quantity < 3', async () => {
      // Add the product at quantity 2 - BELOW the promotion's minimum-quantity rule (Quantity = 3),
      // so the order does NOT qualify for Promotion A.
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      await dealElementPage.addProductLine('[A2144B]', 2, 'Socket');
      const lineCount = await dealElementPage.getOrderLineCount();
      console.log(`✓ Step 3: product added at quantity 2 (< 3) (order lines = ${lineCount})`);
      expect(lineCount, 'Order should contain the added product line').toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Product selected (qty 2 < 3)');
    });

    await test.step('Step 4: Apply promotion A', async () => {
      // NEGATIVE: attempt to apply Promotion A (Quantity = 3 rule) to an order with quantity 2.
      // The order does not qualify, so no discount line should be added and the total must be unchanged.
      const totalBefore = await dealElementPage.getAmountTotal();
      const linesBefore = await dealElementPage.getOrderLineCount();
      console.log(`  Before applying: total=${totalBefore}, order lines=${linesBefore}`);

      const set = await dealElementPage.setPromotion(promoName);
      expect(set, 'The "Promotion" field should be settable while the Deal Element is in edit mode').toBeTruthy();
      await dealElementPage.save();

      const totalAfter = await dealElementPage.getAmountTotal();
      const linesAfter = await dealElementPage.getOrderLineCount();
      const promoLinePresent = await dealElementPage.isProductInOrderLines(promoName);
      console.log(`  After applying: total=${totalAfter}, order lines=${linesAfter}, promo line present=${promoLinePresent}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Promotion not applied (qty below min)');

      // Expected (Jira CRM-10864, step 4): "Can not apply promotion".
      //  - No "X% discount on total amount" line is added to Order Lines.
      //  - The order Total is unchanged (no discount applied).
      expect(promoLinePresent, 'Promotion A discount line should NOT be added (order qty 2 < rule min 3)').toBeFalsy();
      expect(linesAfter, 'Order line count should not increase (no promo line added)').toBe(linesBefore);
      expect(totalAfter, 'Order Total should be unchanged (promotion not applied)').toBe(totalBefore);
      console.log(`✅ Promotion A could not be applied (qty 2 < min 3): Total stayed ${totalBefore} -> ${totalAfter} (promo line=${promoLinePresent})`);
    });
  });
});
