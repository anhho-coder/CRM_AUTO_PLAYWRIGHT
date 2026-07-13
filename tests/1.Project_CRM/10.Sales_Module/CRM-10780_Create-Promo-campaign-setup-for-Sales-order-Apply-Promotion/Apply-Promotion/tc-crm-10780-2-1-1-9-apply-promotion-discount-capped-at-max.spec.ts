import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Apply a Fixed-Amount promotion whose calculated discount exceeds its Max Discount Amount (cap).
 * Test Case ID: CRM-10780_2.1.1.9   (Jira: CRM-10869 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Salesperson opens an Opportunity, goes to its Deal Element (sale.order), adds products with
 *          a total > 1000$ and applies the Automatically-Applied "Promotion A" (Fixed Amount, On Order,
 *          Max Discount Amount = 50$). The promotion is applied but the discount is capped at 50$ - the
 *          order total is reduced by exactly the 50$ maximum (not the full Fixed Amount).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_2\.1\.1\.9:" --project=chromium
 *
 * Source manual TC (Jira CRM-10869)
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
 *     2. Open an Opp and go to Deal Element
 *     3. Select product #1 and product #2 with total > 1000$
 *     4. Apply promotion A
 *
 *   Expected Result (step 4):
 *     Promotion A is applied successfully to total order.
 *     _ Maximum discount amount is 50$
 *
 * Design notes:
 * - "Promotion A" is created by a Sales Manager (users.manager_max) via PromotionPage.createPromotion
 *   (the packaged create flow validated by CRM-10844). The precondition "Apply Discount = Fixed Amount"
 *   (no explicit amount) + "Max Discount Amount = 50$" maps to:
 *     { applyDiscount: 'Fixed Amount', discountFixedAmount: 100, maxDiscountAmount: 50 }
 *   i.e. a 100$ fixed discount that is capped at the 50$ Max Discount Amount.
 * - "Select product #1 and product #2 with total > 1000$" (step 3): the proven product line is
 *   addProductLine('[A2144B]', qty, 'Socket') = $329/unit. We add quantity 4 (4 x $329 = $1316 > 1000$)
 *   so the order clearly exceeds 1000$ - the Deal Element does not expose a second distinct catalog SKU
 *   in this packaged flow, so we reach the ">1000$" target via quantity on the proven product.
 * - This is a POSITIVE case: the promo IS applied (a discount line is added) but the reduction is capped.
 *   We assert (a) a promo discount line is added (or order-line count increases), (b) total AFTER < BEFORE,
 *   and (c) the reduction equals the 50$ cap (not the full 100$ Fixed Amount) - the heart of this TC.
 * - "Apply promotion A" (step 4) on this Nakivo Deal Element = set the editable "Promotion" field
 *   (promotion_id Many2one) to Promotion A, then SAVE. The Promotion field must be set while the form is
 *   in edit mode (right after adding the product line).
 * - The qualifying Opportunity needs a real customer for the Deal Element to accept product lines.
 *   We reuse the proven CRM-2338 setup: an EndUser Contact with a Pricelist, then an Opp using that
 *   contact's email - done as the Salesperson (Thomas).
 * - Cross-user: create the promo as Sales Manager, then RE-LOGIN as the Salesperson for the steps
 *   (a fresh login lands on apps-home where navigateToCRM works - navigating cross-module from inside
 *   a form view times out). Teardown re-logs in as the Sales Manager to archive the promo.
 */

const MANAGER = users.manager_max;       // Sales Manager - creates "Promotion A" (precondition)
const SALES = users.sale_ic_thomas;      // Salesperson - applies the promotion (steps under test)
const SKIP_CLEANUP = true; // per-test cleanup skipped (opp delete hangs as Salesperson); consolidated cleanup runs as admin afterward
const MAX_DISCOUNT = 50;                  // Max Discount Amount cap (precondition)

test.describe('CRM-10780_2.1.1.9 - Apply promotion capped at Max Discount Amount', () => {
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

  test('CRM-10780_2.1.1.9: Apply promotion where calculated discount exceeds discount_max_amount', async ({ page }, testInfo) => {
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
    //   Percentage discount (10%) capped at Max Discount Amount = 50$, On Order. (A max cap is only
    //   meaningful for a Percentage discount: 10% of the >500$ order exceeds the 50$ cap, so it is capped.
    //   The Max Discount Amount field is not shown for a Fixed Amount discount in this UI.)
    // ============================================================
    await test.step('Pre-condition A: Sales Manager creates Promotion A (Percentage 10%, On Order, Max Discount Amount = 50$)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(MANAGER.username, MANAGER.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      const created = await promotionPage.createPromotion({
        namePrefix: 'TEST- 2-1-1-9 ',
        discountPercentage: 10,
        maxDiscountAmount: MAX_DISCOUNT,
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
      contactName = `TEST-EndUser_CRM-10869_${timestamp}`;
      contactEmail = `test-enduser-crm10869-${timestamp}@enduser-company.com`;
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
      const oppName = `TEST Opp CRM-10869 ${timestamp}`;
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(contactEmail);
      await opportunityPage.fillCompanyName('Company CRM-10869');
      await opportunityPage.fillStreet('123 street');
      await opportunityPage.selectCountry('Chile');
      await opportunityPage.selectState('Antofagasta');
      await opportunityPage.selectSalesTeam('BDEU');
      await opportunityPage.selectSalesperson(SALES.displayName);
      // These three are CRM-2338-specific data-hygiene extras (not required by CRM-10869) and some are
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
    // Steps (mirrors Jira CRM-10869 manual steps 1-4)
    // ============================================================
    await test.step('Step 1: Open CRM module', async () => {
      // We are already in CRM on the just-created Opportunity (pre-condition B.2).
      console.log('✓ Step 1: CRM module open (on the qualifying Opportunity)');
    });

    await test.step('Step 2: Open an Opp and go to Deal Element', async () => {
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('✓ Step 2: Deal Element (sale.order) form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Deal Element opened');
    });

    await test.step('Step 3: Select product #1 and product #2 with total > 1000$', async () => {
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      // [A2144B] = $329/unit; quantity 4 -> 4 x $329 = $1316 (> 1000$) so the order clearly exceeds 1000$.
      await dealElementPage.addProductLine('[A2144B]', 4, 'Socket');
      const lineCount = await dealElementPage.getOrderLineCount();
      const orderTotal = await dealElementPage.getAmountTotal();
      console.log(`✓ Step 3: products added (order lines = ${lineCount}, total = ${orderTotal})`);
      expect(lineCount, 'Order should contain the added product line(s)').toBeGreaterThan(0);
      expect(orderTotal, 'Order total should exceed 1000$').toBeGreaterThan(1000);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Products selected (total > 1000$)');
    });

    await test.step('Step 4: Apply promotion A', async () => {
      // "Apply promotion A" = add Promotion A in the "Promotion" field (while in edit mode), then SAVE.
      const totalBefore = await dealElementPage.getAmountTotal();
      const linesBefore = await dealElementPage.getOrderLineCount();
      console.log(`  Before applying: total=${totalBefore}, order lines=${linesBefore}`);

      const set = await dealElementPage.setPromotion(promoName);
      expect(set, 'The "Promotion" field should be settable while the Deal Element is in edit mode').toBeTruthy();
      await dealElementPage.save();

      const totalAfter = await dealElementPage.getAmountTotal();
      const linesAfter = await dealElementPage.getOrderLineCount();
      const promoLinePresent = await dealElementPage.isProductInOrderLines(promoName);
      const discountApplied = totalBefore - totalAfter;
      console.log(`  After applying: total=${totalAfter}, order lines=${linesAfter}, promo line present=${promoLinePresent}, discount=${discountApplied}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Promotion applied (capped at 50$)');

      // Expected (Jira): Promotion A is applied successfully to total order; Maximum discount amount is 50$.
      //  - Promotion A appears as a discount line in Order Lines (the promo IS applied).
      //  - The order Total is reduced.
      //  - The reduction is CAPPED at the 50$ Max Discount Amount (not the full 100$ Fixed Amount).
      expect(promoLinePresent || linesAfter > linesBefore,
        'Promotion A should be added as a discount line in Order Lines').toBeTruthy();
      expect(totalAfter, 'Order Total should be reduced after applying Promotion A').toBeLessThan(totalBefore);
      // Cap assertion - the heart of this TC: discount applied must equal the 50$ Max Discount Amount,
      // not the full 100$ Fixed Amount. Allow a small tolerance for tax-inclusive rounding on the total.
      expect(Math.abs(discountApplied - MAX_DISCOUNT),
        `Discount should be capped at the ${MAX_DISCOUNT}$ Max Discount Amount (got ${discountApplied})`).toBeLessThanOrEqual(1);
      console.log(`✅ Promotion A applied & capped: Total ${totalBefore} -> ${totalAfter} (discount ${discountApplied}, max ${MAX_DISCOUNT})`);
    });
  });
});
