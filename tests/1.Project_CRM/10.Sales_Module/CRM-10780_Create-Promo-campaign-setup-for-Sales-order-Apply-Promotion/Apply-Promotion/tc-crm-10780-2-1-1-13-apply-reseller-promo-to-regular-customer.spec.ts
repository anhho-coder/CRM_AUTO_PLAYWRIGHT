import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Try to apply a reseller-only promotion to a regular (non-reseller) customer deal - it must NOT apply.
 * Test Case ID: CRM-10780_2.1.1.13   (Jira: CRM-10873 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Salesperson opens a new Opportunity without a reseller, goes to its Deal Element
 *          (sale.order), adds a product, and tries to apply the reseller-only "Promotion A"
 *          (Fixed Amount, capped at Max Discount Amount = 50$, To Reseller = TRUE). Because the deal
 *          has no reseller, the promotion does NOT qualify - no discount line is added and the order
 *          total is unchanged.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_2\.1\.1\.13:" --project=chromium
 *
 * Source manual TC (Jira CRM-10873)
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
 *       _ To Reseller = TRUE
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Create a new opp without reseller
 *     3. Go to deal element
 *     4. Try to apply promotion A to the deal
 *
 *   Expected Result (step 4):
 *     4. Can not apply promotion
 *
 * Design notes:
 * - "Promotion A" is created by a Sales Manager (users.manager_max) via PromotionPage.createPromotion
 *   (the packaged create flow validated by CRM-10844). Precondition mapping for this TC:
 *     Apply Discount = Fixed Amount (no value) + Max Discount Amount = 50$ + Discount Apply On = On Order
 *     + To Reseller = TRUE   ->   { applyDiscount: 'Fixed Amount', discountFixedAmount: 100,
 *                                   maxDiscountAmount: 50, forReseller: true }.
 * - NEGATIVE case: the promotion targets resellers only (To Reseller = TRUE). The opportunity here is a
 *   regular EndUser customer with NO reseller, so the deal does not qualify. Step 4 attempts the apply
 *   (sets the "Promotion" field, then SAVE) and we verify it had no effect:
 *     - no promotion discount line is added to Order Lines, and
 *     - the order Total is unchanged (== total before the attempt, no discount).
 *   We tolerate either outcome of the field set (Odoo may reject the value or accept it but compute no
 *   discount for a non-reseller deal) - the load-bearing assertion is "no discount applied".
 * - The deal needs a real customer for the Deal Element to accept product lines (a bare Opp's Deal
 *   Element does not). We reuse the proven CRM-2338 setup: an EndUser Contact with a Pricelist, then an
 *   Opp using that contact's email - done as the Salesperson (Thomas). This contact is NOT a reseller,
 *   which is exactly the "new opp without reseller" the TC asks for.
 * - Cross-user: create the promo as Sales Manager, then RE-LOGIN as the Salesperson for the steps
 *   (a fresh login lands on apps-home where navigateToCRM works - navigating cross-module from inside
 *   a form view times out). Teardown re-logs in as the Sales Manager to archive the promo.
 */

const MANAGER = users.manager_max;       // Sales Manager - creates "Promotion A" (precondition)
const SALES = users.sale_ic_thomas;      // Salesperson - tries to apply the promotion (steps under test)
const SKIP_CLEANUP = true; // per-test cleanup skipped (opp delete hangs as Salesperson); consolidated cleanup runs as admin afterward

test.describe('CRM-10780_2.1.1.13 - Apply reseller promotion to a regular customer deal', () => {
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

  test('CRM-10780_2.1.1.13: Apply reseller promotion to a regular customer deal', async ({ page }, testInfo) => {
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
    // Pre-condition A: "Promotion A" exists (Sales Manager creates it) - reseller-only, Fixed Amount, cap 50$
    // ============================================================
    await test.step('Pre-condition A: Sales Manager creates Promotion A (Fixed Amount on order, Max Discount 50$, To Reseller = TRUE)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(MANAGER.username, MANAGER.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      const created = await promotionPage.createPromotion({
        namePrefix: 'TEST- 2-1-1-13 ',
        applyDiscount: 'Fixed Amount',
        discountFixedAmount: 100,
        maxDiscountAmount: 50,
        forReseller: true,
      });
      promoName = created.name;
      promoUrl = created.url;
      console.log(`✓ Promotion A created (reseller-only): "${promoName}" @ ${promoUrl}`);
      expect(await promotionPage.isInEditMode(), 'Promotion A should have saved').toBeFalsy();
      expect(await promotionPage.isPromotionActive(), 'Promotion A should be active').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-A - Promotion A created (reseller-only)');
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
    // Pre-condition B: a deal with a customer (EndUser Contact + Opp) - the customer is NOT a reseller
    // ============================================================
    await test.step('Pre-condition B.1: Create EndUser Contact (with Pricelist) - regular customer, no reseller', async () => {
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      contactName = `TEST-EndUser_CRM-10873_${timestamp}`;
      contactEmail = `test-enduser-crm10873-${timestamp}@enduser-company.com`;
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

    // ============================================================
    // Step 1: Open CRM module
    // ============================================================
    await test.step('Step 1: Open CRM module', async () => {
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Step 1: CRM module open');
    });

    // ============================================================
    // Step 2: Create a new opp without reseller
    // ============================================================
    await test.step('Step 2: Create a new opp without reseller', async () => {
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      const oppName = `TEST Opp CRM-10873 ${timestamp}`;
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(contactEmail);
      await opportunityPage.fillCompanyName('Company CRM-10873');
      await opportunityPage.fillStreet('123 street');
      await opportunityPage.selectCountry('Chile');
      await opportunityPage.selectState('Antofagasta');
      await opportunityPage.selectSalesTeam('BDEU');
      await opportunityPage.selectSalesperson(SALES.displayName);
      // NOTE: no reseller is set on this Opportunity (this is the "new opp without reseller" the TC requires).
      // These are CRM-2338-specific data-hygiene extras (not required by CRM-10873) and some are admin-only
      // fields not rendered for the Salesperson role - best-effort so they never block setup.
      await opportunityPage.uncheckCreatedManually().catch((e) => console.log(`  ⚠ uncheckCreatedManually skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.clickCRMDeveloperTab().catch((e) => console.log(`  ⚠ CRM Developer tab skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.fillLeadForm('Download Free Trial').catch((e) => console.log(`  ⚠ fillLeadForm skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.selectStage('New');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      await opportunityPage.waitForIdInUrlAndExtract();
      urlOpp = page.url();
      console.log(`  ✓ URL_Opp = ${urlOpp} (no reseller)`);
      await opportunityPage.waitForContactFieldPopulated(contactName, 2, 8000).catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Opportunity created (no reseller)');
    });

    // ============================================================
    // Step 3: Go to deal element
    // ============================================================
    await test.step('Step 3: Go to deal element', async () => {
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('✓ Step 3: Deal Element (sale.order) form opened');
      // Add a product so the order has a base amount the promotion could (but must not) discount.
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      await dealElementPage.addProductLine('[A2144B]', 1, 'Socket');
      const lineCount = await dealElementPage.getOrderLineCount();
      console.log(`  ✓ Product added to deal (order lines = ${lineCount})`);
      expect(lineCount, 'Order should contain the added product line').toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Deal Element with product');
    });

    // ============================================================
    // Step 4: Try to apply promotion A to the deal   ->   Expected: Can not apply promotion
    // ============================================================
    await test.step('Step 4: Try to apply promotion A to the deal', async () => {
      const totalBefore = await dealElementPage.getAmountTotal();
      const linesBefore = await dealElementPage.getOrderLineCount();
      console.log(`  Before applying: total=${totalBefore}, order lines=${linesBefore}`);

      // Attempt to apply the reseller-only Promotion A. Either the field rejects the value, or it accepts
      // it but no discount is computed for this non-reseller deal - both mean "cannot apply".
      const set = await dealElementPage.setPromotion(promoName).catch((e) => {
        console.log(`  ⚠ setPromotion threw (treated as "could not apply"): ${e instanceof Error ? e.message : String(e)}`);
        return false;
      });
      console.log(`  Promotion field set attempt returned: ${set}`);
      await dealElementPage.save().catch((e) => console.log(`  ⚠ save after promo attempt (non-fatal): ${e instanceof Error ? e.message : String(e)}`));

      const totalAfter = await dealElementPage.getAmountTotal();
      const linesAfter = await dealElementPage.getOrderLineCount();
      const promoLinePresent = await dealElementPage.isProductInOrderLines(promoName);
      console.log(`  After applying: total=${totalAfter}, order lines=${linesAfter}, promo line present=${promoLinePresent}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Promotion not applicable (reseller-only)');

      // Expected (Jira): Can not apply promotion.
      //  - No promotion discount line was added to Order Lines.
      //  - The order Total is unchanged (no discount taken for a non-reseller deal).
      expect(promoLinePresent, 'A reseller-only promotion must NOT add a discount line to a non-reseller deal').toBeFalsy();
      expect(linesAfter, 'A reseller-only promotion must NOT add an extra order line to a non-reseller deal').toBe(linesBefore);
      expect(totalAfter, 'Order Total must be unchanged - the reseller-only promotion cannot apply').toBe(totalBefore);
      console.log(`✅ Reseller-only Promotion A could NOT be applied to the non-reseller deal: Total stayed ${totalBefore} -> ${totalAfter}`);
    });
  });
});
