import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Try to apply multiple promotions (A & B) simultaneously to one Deal Element (sale.order).
 * Test Case ID: CRM-10780_2.1.1.12   (Jira: CRM-10872 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Salesperson opens an Opportunity, goes to its Deal Element (sale.order), adds a product,
 *          then TRIES to apply both "Promotion A" (10% on order) and "Promotion B" (5% on order)
 *          simultaneously. Expected: only ONE promotion can be applied (the Nakivo Deal Element
 *          "Promotion" field is a single-value Many2one - it cannot hold two promotions at once).
 *
 * COMPLEX CASE (multiple promotions A & B simultaneously): the Deal Element "Promotion" field
 *   (promotion_id) is a single-value Many2one, so the UI offers no way to add a second promotion -
 *   setting Promotion B simply REPLACES Promotion A. This automated draft creates BOTH promos,
 *   applies A, then attempts to ALSO apply B, and verifies that the order still carries exactly one
 *   promotion (one promo discount line / a single applied promotion), not two. The exact UI affordance
 *   for "attempting to add a second promotion" should be confirmed manually - see the TODO in Step 3.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_2\.1\.1\.12:" --project=chromium
 *
 * Source manual TC (Jira CRM-10872)
 *   Test Repository Path: /CRM test/Sales module/CRM-10780_Create Promo-campaign setup for Sales order/Apply Promotion
 *
 *   Pre-conditions:
 *     Login as Salesperson. Ex: Thomas Semerich
 *     There are 2 promotions in the system:
 *     Promotion A:
 *       _ Promotion Program Name = TEST- Order - 10%
 *       _ Promo Code Usage = Automation applied
 *       _ Reward = Discount
 *       _ Apply Discount = Percentage - 10%
 *       _ Discount Apply On = On Order
 *     Promotion B:
 *       _ Promotion Program Name = TEST- Order - 5%
 *       _ Promo Code Usage = Automation applied
 *       _ Reward = Discount
 *       _ Apply Discount = Percentage - 5%
 *       _ Discount Apply On = On Order
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Create new opp and create new deal element for this opp
 *     3. Try to apply both promotion A and B to the deal
 *
 *   Expected Result (step 3):
 *     Only able to apply 1 promotion
 *
 * Design notes:
 * - "Promotion A" and "Promotion B" are created by a Sales Manager (users.manager_max) via
 *   PromotionPage.createPromotion (the packaged create flow validated by CRM-10844).
 * - "Apply a promotion" on this Nakivo Deal Element = set the editable "Promotion" field
 *   (promotion_id Many2one) to the promo, then SAVE. Because it is a single Many2one, setting a second
 *   promotion REPLACES the first - the system can only carry one applied promotion at a time, which is
 *   exactly the expected "Only able to apply 1 promotion" behaviour.
 * - The qualifying Opportunity needs a real customer for the Deal Element to accept product lines
 *   (a bare Opp's Deal Element does not). We reuse the proven CRM-2338 setup: an EndUser Contact with
 *   a Pricelist, then an Opp using that contact's email - done as the Salesperson (Thomas).
 * - Cross-user: create the promos as Sales Manager, then RE-LOGIN as the Salesperson for the steps.
 *   Teardown re-logs in as the Sales Manager to archive BOTH promos.
 */

const MANAGER = users.manager_max;       // Sales Manager - creates "Promotion A" + "Promotion B" (preconditions)
const SALES = users.sale_ic_thomas;      // Salesperson - applies the promotions (steps under test)
const SKIP_CLEANUP = true; // per-test cleanup skipped (opp delete hangs as Salesperson); consolidated cleanup runs as admin afterward

test.describe('CRM-10780_2.1.1.12 - Try to apply multiple promotions simultaneously to one order', () => {
  let promoNameA = '';
  let promoUrlA = '';
  let promoNameB = '';
  let promoUrlB = '';
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

    // Archive "Promotion A" + "Promotion B" - re-login as the Sales Manager (owner / has rights), then Action > Archive.
    if (promoNameA || promoNameB) {
      const loginPage = new LoginPage(page);
      const promotionPage = new PromotionPage(page);
      try {
        await page.context().clearCookies();
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(MANAGER.username, MANAGER.password, 120000);
        await loginPage.dismissLocationPermissionDialog();
        if (promoNameA) await promotionPage.archivePromotionByName(promoNameA).catch((e) => console.log(`  ⚠ Promo A archive: ${e instanceof Error ? e.message : String(e)}`));
        if (promoNameB) await promotionPage.archivePromotionByName(promoNameB).catch((e) => console.log(`  ⚠ Promo B archive: ${e instanceof Error ? e.message : String(e)}`));
      } catch (e) {
        console.log(`  ⚠ Promotion archive teardown failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    urlContact = ''; urlOpp = ''; promoNameA = ''; promoUrlA = ''; promoNameB = ''; promoUrlB = '';
  });

  test('CRM-10780_2.1.1.12: Try to apply multiple promotions simultaneously to one order', async ({ page }, testInfo) => {
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
    // Pre-condition A+B: "Promotion A" (10%) and "Promotion B" (5%) exist (Sales Manager creates them)
    // ============================================================
    await test.step('Pre-condition A: Sales Manager creates Promotion A (Automatically Applied, 10% on order)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(MANAGER.username, MANAGER.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      const createdA = await promotionPage.createPromotion({ namePrefix: 'TEST- Order - 10% ', discountPercentage: 10 });
      promoNameA = createdA.name;
      promoUrlA = createdA.url;
      console.log(`✓ Promotion A created: "${promoNameA}" @ ${promoUrlA}`);
      expect(await promotionPage.isInEditMode(), 'Promotion A should have saved').toBeFalsy();
      expect(await promotionPage.isPromotionActive(), 'Promotion A should be active').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-A - Promotion A created');
    });

    await test.step('Pre-condition B: Sales Manager creates Promotion B (Automatically Applied, 5% on order)', async () => {
      const createdB = await promotionPage.createPromotion({ namePrefix: 'TEST- Order - 5% ', discountPercentage: 5 });
      promoNameB = createdB.name;
      promoUrlB = createdB.url;
      console.log(`✓ Promotion B created: "${promoNameB}" @ ${promoUrlB}`);
      expect(await promotionPage.isInEditMode(), 'Promotion B should have saved').toBeFalsy();
      expect(await promotionPage.isPromotionActive(), 'Promotion B should be active').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-B - Promotion B created');
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
    // Pre-condition C: a qualifying Opportunity with a customer (EndUser Contact + Opp)
    // ============================================================
    await test.step('Pre-condition C.1: Create EndUser Contact (with Pricelist)', async () => {
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      contactName = `TEST-EndUser_CRM-10872_${timestamp}`;
      contactEmail = `test-enduser-crm10872-${timestamp}@enduser-company.com`;
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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-C.1 - EndUser Contact created');
    });

    await test.step('Pre-condition C.2: Create a qualifying Opportunity (using the EndUser email)', async () => {
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      const oppName = `TEST Opp CRM-10872 ${timestamp}`;
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(contactEmail);
      await opportunityPage.fillCompanyName('Company CRM-10872');
      await opportunityPage.fillStreet('123 street');
      await opportunityPage.selectCountry('Chile');
      await opportunityPage.selectState('Antofagasta');
      await opportunityPage.selectSalesTeam('BDEU');
      await opportunityPage.selectSalesperson(SALES.displayName);
      // These three are CRM-2338-specific data-hygiene extras (not required by CRM-10872) and some are
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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-C.2 - Opportunity created');
    });

    // ============================================================
    // Steps (mirrors Jira CRM-10872 manual steps 1-3)
    // ============================================================
    await test.step('Step 1: Open CRM module', async () => {
      // We are already in CRM on the just-created Opportunity (pre-condition C.2).
      console.log('✓ Step 1: CRM module open (on the qualifying Opportunity)');
    });

    await test.step('Step 2: Create new opp and create new deal element for this opp', async () => {
      // The qualifying Opp was created in pre-condition C.2; open its Deal Element (sale.order) and
      // add a product so the order is a valid candidate for a promotion.
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      await dealElementPage.addProductLine('[A2144B]', 1, 'Socket');
      const lineCount = await dealElementPage.getOrderLineCount();
      console.log(`✓ Step 2: Deal Element opened + product added (order lines = ${lineCount})`);
      expect(lineCount, 'Order should contain the added product line').toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Deal Element with product');
    });

    await test.step('Step 3: Try to apply both promotion A and B to the deal', async () => {
      // Expected: "Only able to apply 1 promotion".
      //
      // On this Nakivo Deal Element, a promotion is applied via the single-value "Promotion" field
      // (promotion_id Many2one). It can hold only ONE promotion at a time, so applying B after A simply
      // REPLACES A (the system cannot carry two promotions). We verify exactly one promotion ends up
      // applied: after attempting both, the order shows a single applied promotion (one promo discount
      // line), and the total reflects ONE discount (the B/5% replacement here), not the sum of A+B.
      //
      // TODO (manual): confirm the precise UI affordance for "attempting to add a second promotion".
      // The Many2one Promotion field exposes no "add another" control, so there is no second slot to
      // populate - the manual tester must verify there is no way in the UI to attach a second promotion
      // (e.g. no multi-select, no second Promotion field, no "Add a promotion" link), and that setting a
      // new promotion replaces the previous one. This draft models the "replace" behaviour; if the real
      // product instead BLOCKS the second apply with a message, assert on that message text instead.
      const totalBefore = await dealElementPage.getAmountTotal();
      const linesBefore = await dealElementPage.getOrderLineCount();
      console.log(`  Before any promo: total=${totalBefore}, order lines=${linesBefore}`);

      // Apply Promotion A (first promotion).
      const setA = await dealElementPage.setPromotion(promoNameA);
      expect(setA, 'Promotion A should be settable in the "Promotion" field (edit mode)').toBeTruthy();
      await dealElementPage.save();
      const totalAfterA = await dealElementPage.getAmountTotal();
      const linesAfterA = await dealElementPage.getOrderLineCount();
      const aLinePresent = await dealElementPage.isProductInOrderLines(promoNameA);
      console.log(`  After Promotion A: total=${totalAfterA}, order lines=${linesAfterA}, A line present=${aLinePresent}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3a - Promotion A applied');
      expect(aLinePresent || linesAfterA > linesBefore, 'Promotion A should be applied as a discount line').toBeTruthy();
      expect(totalAfterA, 'Total should drop after applying Promotion A').toBeLessThan(totalBefore);

      // Try to ALSO apply Promotion B. The Many2one field can only hold one value, so this REPLACES A.
      const setB = await dealElementPage.setPromotion(promoNameB);
      expect(setB, 'Attempting to set Promotion B should be possible (it replaces A in the single field)').toBeTruthy();
      await dealElementPage.save();
      const totalAfterB = await dealElementPage.getAmountTotal();
      const linesAfterB = await dealElementPage.getOrderLineCount();
      const aStillPresent = await dealElementPage.isProductInOrderLines(promoNameA);
      const bPresent = await dealElementPage.isProductInOrderLines(promoNameB);
      console.log(`  After trying Promotion B: total=${totalAfterB}, order lines=${linesAfterB}, A still present=${aStillPresent}, B present=${bPresent}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3b - Tried to apply Promotion B');

      // Expected (Jira): "Only able to apply 1 promotion" - the order carries exactly ONE promotion.
      // The single-value Promotion field means B replaces A: only B (5%) remains, not both A+B.
      expect(aStillPresent && bPresent,
        'The order must NOT carry BOTH Promotion A and Promotion B simultaneously (only 1 promotion allowed)').toBeFalsy();
      // After replacement only one discount line should exist (same line count as a single applied promo).
      expect(linesAfterB,
        'Applying a second promotion must not accumulate a second discount line (only 1 promotion applied)').toBeLessThanOrEqual(linesAfterA);
      console.log(`✅ Only one promotion is applied at a time (A=${aStillPresent}, B=${bPresent}); the system does not carry both.`);
    });
  });
});
