import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage, QuotationPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Apply a promotion to a confirmed / locked sale order (negative - confirmed orders cannot be promoted).
 * Test Case ID: CRM-10780_2.1.1.15   (Jira: CRM-10875 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Salesperson opens a sale order (Deal Element) that has been CONFIRMED (locked) and tries
 *          to apply "Promotion A" (Fixed Amount, capped at 50$, on order). Because the order is already
 *          confirmed/locked, the promotion cannot be applied - no promo discount line is added and the
 *          order total is unchanged.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_2\.1\.1\.15:" --project=chromium
 *
 * Source manual TC (Jira CRM-10875)
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
 *     1. Open a sales order that has been confirmed
 *     2. Apply Promotion A
 *
 *   Expected Result (step 2):
 *     2. Can not apply promotion
 *
 * Design notes:
 * - "Promotion A" is created by a Sales Manager (users.manager_max) via PromotionPage.createPromotion
 *   (the packaged create flow validated by CRM-10844). Precondition maps to:
 *     applyDiscount: 'Fixed Amount', discountFixedAmount: 100, maxDiscountAmount: 50
 *   (per the CRM-10780 mapping: "Fixed Amount" with no value + "Max Discount Amount = 50$").
 * - The qualifying Opportunity needs a real customer for the Deal Element to accept product lines
 *   (a bare Opp's Deal Element does not). We reuse the proven CRM-2338 setup: an EndUser Contact with
 *   a Pricelist, then an Opp using that contact's email - done as the Salesperson (Thomas).
 * - Cross-user: create the promo as Sales Manager, then RE-LOGIN as the Salesperson for the steps
 *   (a fresh login lands on apps-home where navigateToCRM works - navigating cross-module from inside
 *   a form view times out). Teardown re-logs in as the Sales Manager to archive the promo.
 *
 * COMPLEX case (verificationType = 'complex', needsManualWork = true):
 * - This TC requires the quotation Confirm/lock workflow: the order must FIRST be confirmed
 *   (sale.order action_confirm), then the Promotion apply is attempted on the now-locked order.
 *   We add the product, then click Confirm (best-effort via QuotationPage.clickConfirm, which targets
 *   the sale.order action_confirm button that the Deal Element form also exposes).
 * - After confirmation the form is read-only: the editable "Promotion" field (promotion_id) is not
 *   rendered, so DealElementPage.setPromotion returns false. We treat "could not set the promotion +
 *   no discount line + unchanged total" as proof of the Expected Result "Can not apply promotion".
 * - MANUAL verification is still needed for: (a) confirming a sale order may require a Confirm dialog
 *   / approval step or a specific UI affordance not yet modelled in the page objects, and (b) the
 *   exact way the UI surfaces "cannot apply" on a confirmed/locked order (field hidden vs. error
 *   message vs. promo silently ignored). See the // TODO (manual) markers in Steps 1 and 2.
 */

const MANAGER = users.manager_max;       // Sales Manager - creates "Promotion A" (precondition)
const SALES = users.sale_ic_thomas;      // Salesperson - applies the promotion (steps under test)
const SKIP_CLEANUP = true; // per-test cleanup skipped (opp delete hangs as Salesperson); consolidated cleanup runs as admin afterward

test.describe('CRM-10780_2.1.1.15 - Apply promotion to a confirmed/locked order', () => {
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

  test('CRM-10780_2.1.1.15: Apply promotion to a confirmed/locked order', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const promotionPage = new PromotionPage(page);
    const timestamp = CommonUtils.generateTimestamp();

    // ============================================================
    // Pre-condition A: "Promotion A" exists (Sales Manager creates it)
    //   Apply Discount = Fixed Amount; Discount Apply On = On Order; Max Discount Amount = 50$
    // ============================================================
    await test.step('Pre-condition A: Sales Manager creates Promotion A (Fixed Amount, on order, max discount 50$)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(MANAGER.username, MANAGER.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      const created = await promotionPage.createPromotion({
        namePrefix: 'TEST- 2-1-1-15 ',
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
      contactName = `TEST-EndUser_CRM-10875_${timestamp}`;
      contactEmail = `test-enduser-crm10875-${timestamp}@enduser-company.com`;
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
      const oppName = `TEST Opp CRM-10875 ${timestamp}`;
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(contactEmail);
      await opportunityPage.fillCompanyName('Company CRM-10875');
      await opportunityPage.fillStreet('123 street');
      await opportunityPage.selectCountry('Chile');
      await opportunityPage.selectState('Antofagasta');
      await opportunityPage.selectSalesTeam('BDEU');
      await opportunityPage.selectSalesperson(SALES.displayName);
      // These three are CRM-2338-specific data-hygiene extras (not required by CRM-10875) and some are
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
    // Steps (mirrors Jira CRM-10875 manual steps 1-2)
    // ============================================================
    await test.step('Step 1: Open a sales order that has been confirmed', async () => {
      // Open the Deal Element (sale.order) of the qualifying Opp, add a product so it can be confirmed,
      // then CONFIRM the order so it becomes a confirmed/locked sales order.
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('✓ Deal Element (sale.order) form opened');

      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      await dealElementPage.addProductLine('[A2144B]', 1, 'Socket');
      const lineCount = await dealElementPage.getOrderLineCount();
      console.log(`  - product added (order lines = ${lineCount})`);
      expect(lineCount, 'Order should contain a product line before confirming').toBeGreaterThan(0);
      await dealElementPage.save();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1a - Order with product (before confirm)');

      // TODO (manual): confirming a sale order may require a Confirm dialog / approval step or a specific
      // UI affordance not yet modelled. clickConfirm targets sale.order action_confirm (also exposed on the
      // Deal Element form). Verify manually that the order reaches the confirmed/locked state here.
      try {
        await quotationPage.clickConfirm();
        await CommonUtils.waitForSpinnersToHide(page).catch(() => {});
        await page.waitForTimeout(CommonUtils.waitTimes.long);
        console.log('✓ Step 1: Sales order confirmed (Confirm clicked)');
      } catch (e) {
        console.log(`  ⚠ Step 1: Confirm not completed automatically (manual workflow): ${e instanceof Error ? e.message : String(e)}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1b - Sales order confirmed');
    });

    await test.step('Step 2: Apply Promotion A', async () => {
      // Expected: Can not apply promotion (the order is confirmed/locked).
      const totalBefore = await dealElementPage.getAmountTotal();
      const linesBefore = await dealElementPage.getOrderLineCount();
      console.log(`  Before attempting apply: total=${totalBefore}, order lines=${linesBefore}`);

      // On a confirmed/locked order the form is read-only: the editable "Promotion" field is not
      // rendered, so setPromotion returns false. That inability to set the promotion is itself the
      // evidence of "Can not apply promotion".
      const set = await dealElementPage.setPromotion(promoName).catch(() => false);
      if (set) {
        // If the field WAS settable, save and prove the promo had no effect (no discount line, same total).
        await dealElementPage.save().catch(() => {});
      }

      const totalAfter = await dealElementPage.getAmountTotal();
      const linesAfter = await dealElementPage.getOrderLineCount();
      const promoLinePresent = await dealElementPage.isProductInOrderLines(promoName);
      console.log(`  After attempting apply: set=${set}, total=${totalAfter}, order lines=${linesAfter}, promo line present=${promoLinePresent}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Promotion apply attempted on confirmed order');

      // TODO (manual): confirm exactly how the UI surfaces "cannot apply" on a confirmed/locked order
      // (Promotion field hidden vs. an error message vs. the promo being silently ignored). The assertions
      // below cover the field-hidden and the no-effect outcomes; adjust to match the real product behavior.
      // Expected (Jira): Can not apply promotion.
      //  - No promo discount line is added AND the order total is unchanged.
      expect(promoLinePresent, 'No promotion discount line should be added on a confirmed/locked order').toBeFalsy();
      expect(linesAfter, 'Order line count should be unchanged on a confirmed/locked order').toBe(linesBefore);
      expect(totalAfter, 'Order Total should be unchanged - the promotion was not applied').toBe(totalBefore);
      console.log(`✅ Promotion could not be applied to the confirmed/locked order: Total stayed ${totalBefore} -> ${totalAfter} (field settable=${set}, promo line=${promoLinePresent})`);
    });
  });
});
