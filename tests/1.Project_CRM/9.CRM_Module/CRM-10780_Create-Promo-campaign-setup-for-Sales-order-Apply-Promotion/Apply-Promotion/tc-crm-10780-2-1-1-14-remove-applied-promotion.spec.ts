import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Apply, then REMOVE a Fixed-Amount (capped at $50) "On Order" promotion from a sale order.
 * Test Case ID: CRM-10780_2.1.1.14   (Jira: CRM-10874 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Salesperson opens an Opportunity (no reseller), goes to its Deal Element (sale.order),
 *          adds a product, applies the Automatically-Applied "Promotion A" (Fixed Amount, capped at
 *          $50, on the whole order) - order total drops - then REMOVES the promotion (clears the
 *          "Promotion" field + SAVE) and the order total is restored to its pre-promotion value.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_2\.1\.1\.14:" --project=chromium
 *
 * Source manual TC (Jira CRM-10874)
 *   Test Repository Path: /CRM test/Sales module/CRM-10780_Create Promo-campaign setup for Sales order/Apply Promotion
 *
 *   Pre-conditions:
 *     Login as Salesperson. Ex: Thomas Semerich
 *     There is promotion A with:
 *       _ Promotion Program Name = TEST- Order - 10%
 *       _ Promo Code Usage = Automation applied
 *       _ Reward = Discount
 *       _ Apply Discount = Fixed Amount
 *       _ Discount Apply On = On Order
 *       _ Max Discount Amount = 50$
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Create a new opp without reseller
 *     3. Go to deal element
 *     4. Try to apply promotion A to the deal      -> Expected: Applied promotion successfully
 *     5. Try to remove the promotion from the deal  -> Expected: Removed promotion successfully
 *
 * Verification type: COMPLEX - "remove an applied promotion". Step 4 is a POSITIVE apply (promo discount
 *   line added, total reduced); Step 5 is the removal (clear the Promotion field + SAVE, total restored).
 *
 * Design notes:
 * - "Promotion A" is created by a Sales Manager (users.manager_max) via PromotionPage.createPromotion.
 *   Precondition maps to: { applyDiscount: 'Fixed Amount', discountFixedAmount: 100, maxDiscountAmount: 50 }
 *   (Apply Discount = Fixed Amount with no explicit value -> use 100; Max Discount Amount = 50$ caps it;
 *   Discount Apply On = On Order is the createPromotion default, so no discountApplyOn key is needed).
 * - "Create a new opp without reseller" (step 2): the Opportunity is created exactly as the green pilot,
 *   and the To Reseller flag is never set, so the order carries no reseller.
 * - "Apply promotion A" (step 4) on this Nakivo Deal Element = set the editable "Promotion" field
 *   (promotion_id Many2one) to Promotion A, then SAVE. The promo is then added as a discount line in
 *   Order Lines and the order total is reduced. The Promotion field must be set while the form is in
 *   edit mode (right after adding the product line).
 * - "Remove the promotion" (step 5): re-enter edit mode, CLEAR the "Promotion" field input, SAVE, and
 *   verify the promo discount line is gone and the order total is restored to its pre-promotion value.
 *   There is no validated removePromotion()/clearPromotion() page-object helper yet, so the removal is a
 *   best-effort inline flow (see the // TODO (manual) below) - hence verificationType=complex / needsManualWork.
 * - The qualifying Opportunity needs a real customer for the Deal Element to accept product lines
 *   (a bare Opp's Deal Element does not). We reuse the proven CRM-2338 setup: an EndUser Contact with
 *   a Pricelist, then an Opp using that contact's email - done as the Salesperson (Thomas).
 * - Cross-user: create the promo as Sales Manager, then RE-LOGIN as the Salesperson for the steps
 *   (a fresh login lands on apps-home where navigateToCRM works - navigating cross-module from inside
 *   a form view times out). Teardown re-logs in as the Sales Manager to archive the promo.
 */

const MANAGER = users.manager_max;       // Sales Manager - creates "Promotion A" (precondition)
const SALES = users.sale_ic_thomas;      // Salesperson - applies/removes the promotion (steps under test)
const SKIP_CLEANUP = true; // per-test cleanup skipped (opp delete hangs as Salesperson); consolidated cleanup runs as admin afterward

test.describe('CRM-10780_2.1.1.14 - Remove an applied promotion from an order', () => {
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

  test('CRM-10780_2.1.1.14: Remove an applied promotion from an order', async ({ page }, testInfo) => {
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
    //   Apply Discount = Fixed Amount, Discount Apply On = On Order (default), Max Discount Amount = 50$
    // ============================================================
    await test.step('Pre-condition A: Sales Manager creates Promotion A (Automatically Applied, Fixed Amount on order, capped at $50)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(MANAGER.username, MANAGER.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      const created = await promotionPage.createPromotion({
        namePrefix: 'TEST- 2-1-1-14 ',
        applyDiscount: 'Fixed Amount',
        discountFixedAmount: 100,
        maxDiscountAmount: 50,
      });
      promoName = created.name;
      promoUrl = created.url;
      console.log(`✓ Promotion A created: "${promoName}" @ ${promoUrl}`);
      expect(await promotionPage.isInEditMode(), 'Promotion A should have saved').toBeFalsy();
      expect(await promotionPage.isPromotionActive(), 'Promotion A should be active').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-A - Promotion A created');
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
    // Pre-condition B: a qualifying Opportunity with a customer (EndUser Contact + Opp)
    // ============================================================
    await test.step('Pre-condition B.1: Create EndUser Contact (with Pricelist)', async () => {
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      contactName = `TEST-EndUser_CRM-10874_${timestamp}`;
      contactEmail = `test-enduser-crm10874-${timestamp}@enduser-company.com`;
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

    await test.step('Pre-condition B.2: Create a qualifying Opportunity (using the EndUser email)', async () => {
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      const oppName = `TEST Opp CRM-10874 ${timestamp}`;
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(contactEmail);
      await opportunityPage.fillCompanyName('Company CRM-10874');
      await opportunityPage.fillStreet('123 street');
      await opportunityPage.selectCountry('Chile');
      await opportunityPage.selectState('Antofagasta');
      await opportunityPage.selectSalesTeam('BDEU');
      await opportunityPage.selectSalesperson(SALES.displayName);
      // No reseller is set on this Opportunity (step 2: "without reseller").
      // These three are CRM-2338-specific data-hygiene extras (not required by CRM-10874) and some are
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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-B.2 - Opportunity created (no reseller)');
    });

    // ============================================================
    // Steps (mirrors Jira CRM-10874 manual steps 1-5)
    // ============================================================
    let totalBeforePromo = 0;
    let linesBeforePromo = 0;

    await test.step('Step 1: Open CRM module', async () => {
      // We are already in CRM on the just-created Opportunity (pre-condition B.2).
      console.log('✓ Step 1: CRM module open (on the qualifying Opportunity)');
    });

    await test.step('Step 2: Create a new opp without reseller', async () => {
      // The qualifying Opportunity was created (no reseller set) in pre-condition B.2.
      console.log('✓ Step 2: a new Opportunity (without reseller) is created and open');
    });

    await test.step('Step 3: Go to deal element', async () => {
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      // Add a product so the order qualifies and the form is in edit mode for applying the promotion.
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      await dealElementPage.addProductLine('[A2144B]', 1, 'Socket');
      const lineCount = await dealElementPage.getOrderLineCount();
      console.log(`✓ Step 3: Deal Element opened and product added (order lines = ${lineCount})`);
      expect(lineCount, 'Order should contain the added product line').toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Deal Element with product');
    });

    await test.step('Step 4: Try to apply promotion A to the deal', async () => {
      // "Apply promotion A" = set Promotion A in the "Promotion" field (while in edit mode), then SAVE.
      totalBeforePromo = await dealElementPage.getAmountTotal();
      linesBeforePromo = await dealElementPage.getOrderLineCount();
      console.log(`  Before applying: total=${totalBeforePromo}, order lines=${linesBeforePromo}`);

      const set = await dealElementPage.setPromotion(promoName);
      expect(set, 'The "Promotion" field should be settable while the Deal Element is in edit mode').toBeTruthy();
      await dealElementPage.save();

      const totalAfter = await dealElementPage.getAmountTotal();
      const linesAfter = await dealElementPage.getOrderLineCount();
      const promoLinePresent = await dealElementPage.isProductInOrderLines(promoName);
      console.log(`  After applying: total=${totalAfter}, order lines=${linesAfter}, promo line present=${promoLinePresent}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Promotion applied');

      // Expected (Jira step 4): Applied promotion successfully.
      //  - Promotion A appears as a fixed-amount (capped at $50) discount line in Order Lines.
      //  - The order Total is reduced.
      expect(promoLinePresent || linesAfter > linesBeforePromo,
        'Promotion A should be added as a discount line in Order Lines').toBeTruthy();
      expect(totalAfter, 'Order Total should be reduced after applying Promotion A').toBeLessThan(totalBeforePromo);
      console.log(`✅ Step 4: Promotion A applied successfully: Total ${totalBeforePromo} -> ${totalAfter} (line added=${promoLinePresent})`);
    });

    await test.step('Step 5: Try to remove the promotion from the deal', async () => {
      // TODO (manual): there is no validated removePromotion()/clearPromotion() page-object helper yet.
      // The removal below is a best-effort inline flow: re-enter edit mode, clear the "Promotion" field
      // input, SAVE, and verify the discount line is gone + the total is restored. A reviewer should run
      // this manually to confirm the exact clear gesture (backspace vs. the field's x/clear control) and,
      // if it proves stable, promote it to a DealElementPage.removePromotion() method.
      const totalWithPromo = await dealElementPage.getAmountTotal();
      console.log(`  Before removing: total (with promo) = ${totalWithPromo}`);

      // Re-enter edit mode so the Promotion field (promotion_id) becomes an editable input again.
      await dealElementPage.clickEdit().catch((e) => console.log(`  ⚠ clickEdit (re-enter edit) skipped: ${e instanceof Error ? e.message : String(e)}`));
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      // Clear the "Promotion" field: select-all + delete the current value, then commit with Enter.
      const promoInput = page.locator("xpath=//div[@name='promotion_id']//input").first();
      const inputPresent = (await promoInput.count().catch(() => 0)) > 0;
      if (inputPresent) {
        await promoInput.scrollIntoViewIfNeeded().catch(() => {});
        await promoInput.click();
        await promoInput.fill('');
        await page.keyboard.press('Control+A').catch(() => {});
        await page.keyboard.press('Delete').catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        await page.waitForTimeout(CommonUtils.waitTimes.long); // let the discount line + totals recompute
        console.log('  ✓ Promotion field cleared');
      } else {
        console.log('  ⚠ Promotion field input not found while trying to remove the promotion (form not in edit mode?)');
      }

      await dealElementPage.save();

      const appliedAfterRemove = await dealElementPage.getAppliedPromotionName();
      const promoLineAfterRemove = await dealElementPage.isProductInOrderLines(promoName);
      const totalAfterRemove = await dealElementPage.getAmountTotal();
      console.log(`  After removing: promotion="${appliedAfterRemove}", promo line present=${promoLineAfterRemove}, total=${totalAfterRemove}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Promotion removed');

      // Expected (Jira step 5): Removed promotion successfully.
      //  - The promotion is no longer applied (Promotion field empty / no promo discount line).
      //  - The order Total is restored to its pre-promotion value.
      expect(promoLineAfterRemove, 'The Promotion A discount line should be gone after removal').toBeFalsy();
      expect(appliedAfterRemove, 'The "Promotion" field should be empty after removal').not.toContain(promoName);
      expect(totalAfterRemove, 'Order Total should be restored to its pre-promotion value after removal').toBe(totalBeforePromo);
      console.log(`✅ Step 5: Promotion removed successfully: Total restored ${totalWithPromo} -> ${totalAfterRemove} (== pre-promo ${totalBeforePromo})`);
    });
  });
});
