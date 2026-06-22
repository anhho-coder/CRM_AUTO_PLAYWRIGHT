import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Try to apply an INACTIVE (archived) promotion to a sale order - it cannot be applied.
 * Test Case ID: CRM-10780_2.1.1.11   (Jira: CRM-10871 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Salesperson opens an Opportunity, goes to its Deal Element (sale.order), adds a product,
 *          and tries to apply "Promotion A" which is INACTIVE (archived). Because the promotion is
 *          inactive, it cannot be applied: no discount line is added and the order total is unchanged.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_2\.1\.1\.11:" --project=chromium
 *
 * Source manual TC (Jira CRM-10871)
 *   Test Repository Path: /CRM test/Sales module/CRM-10780_Create Promo-campaign setup for Sales order/Apply Promotion
 *
 *   Pre-conditions:
 *     Login as Salesperson. Ex: Thomas Semerich
 *     There is INACTIVE promotion A with:
 *       _ Promotion Program Name = TEST- Order - 10%
 *       _ Promo Code Usage = Automation applied
 *       _ Reward = Discount
 *       _ Apply Discount = Fixed Amount
 *       _ Discount Apply On = On Order
 *       _ Max Discount Amount = 50$
 *       _ Active = False (inactive promotion)
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Create new opp and create new deal element for this opp
 *     3. Try to apply promotion A to the deal
 *
 *   Expected Result (step 3):
 *     3. Cannot apply promotion A
 *
 * Design notes:
 * - "Promotion A" is created by a Sales Manager (users.manager_max) via PromotionPage.createPromotion
 *   with { applyDiscount: 'Fixed Amount', discountFixedAmount: 100, maxDiscountAmount: 50 } and the
 *   default "Discount Apply On = On Order". It is then ARCHIVED (Action > Archive) so that, per the
 *   precondition, Promotion A is INACTIVE (Active = False) before the Salesperson tries to apply it.
 * - NEGATIVE/COMPLEX case: an inactive promotion is not selectable in the "Promotion" field (the
 *   promotion_id Many2one only offers active sale.coupon.program records). The expected outcome is
 *   "Cannot apply promotion A": setPromotion(promoName) should NOT find the archived promo in the
 *   dropdown, so no discount line is added and the order total stays equal to the pre-apply total.
 * - The qualifying-customer setup (EndUser Contact with a Pricelist + an Opp by that email) is reused
 *   from the green pilot CRM-10861 so the Deal Element accepts product lines.
 * - Cross-user: create + archive the promo as Sales Manager, then RE-LOGIN as the Salesperson for the
 *   steps (a fresh login lands on apps-home where navigateToCRM works). Teardown re-logs in as the
 *   Sales Manager and runs archivePromotionByName (idempotent: the already-archived promo will not
 *   appear in the active list, so it simply logs "nothing to archive").
 *
 * TODO (manual): COMPLEX (inactive promotion). This draft creates Promotion A then archives it, and
 *   verifies the inactive promo cannot be applied (no discount line + total unchanged). A reviewer
 *   should confirm the intended product behaviour for an archived promotion in the Deal Element
 *   "Promotion" field: (a) the archived promo is absent from the dropdown (expected, asserted here),
 *   vs (b) it is selectable but rejected on save with a validation error. If (b), adapt Step 3 to
 *   assert the validation/error message instead of the "not found in dropdown" path.
 */

const MANAGER = users.manager_max;       // Sales Manager - creates + archives "Promotion A" (precondition)
const SALES = users.sale_ic_thomas;      // Salesperson - tries to apply the inactive promotion (step under test)
const SKIP_CLEANUP = true; // per-test cleanup skipped (opp delete hangs as Salesperson); consolidated cleanup runs as admin afterward

test.describe('CRM-10780_2.1.1.11 - Apply an inactive promotion to an order', () => {
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
    // Idempotent: the promo was already archived in the test, so this typically logs "nothing to archive".
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

  test('CRM-10780_2.1.1.11: Apply an inactive promotion to an order', async ({ page }, testInfo) => {
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
    // Pre-condition A: INACTIVE "Promotion A" exists (Sales Manager creates it, then archives it)
    //   Apply Discount = Fixed Amount, Discount Apply On = On Order, Max Discount Amount = 50$, Active = False
    // ============================================================
    await test.step('Pre-condition A: Sales Manager creates Promotion A (Fixed Amount, On Order, Max 50$) and archives it (INACTIVE)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(MANAGER.username, MANAGER.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      const created = await promotionPage.createPromotion({
        namePrefix: 'TEST- 2-1-1-11 ',
        applyDiscount: 'Fixed Amount',
        discountFixedAmount: 100,
        maxDiscountAmount: 50,
        // discountApplyOn defaults to 'On Order'
      });
      promoName = created.name;
      promoUrl = created.url;
      console.log(`✓ Promotion A created: "${promoName}" @ ${promoUrl}`);
      expect(await promotionPage.isInEditMode(), 'Promotion A should have saved').toBeFalsy();

      // Make it INACTIVE (Active = False) per the precondition.
      const archived = await promotionPage.archivePromotionByName(promoName);
      expect(archived, 'Promotion A should be archived (made inactive) before the apply attempt').toBeTruthy();
      console.log(`✓ Promotion A is now INACTIVE (archived): "${promoName}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-A - Promotion A created and archived (inactive)');
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
      contactName = `TEST-EndUser_CRM-10871_${timestamp}`;
      contactEmail = `test-enduser-crm10871-${timestamp}@enduser-company.com`;
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
      const oppName = `TEST Opp CRM-10871 ${timestamp}`;
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(contactEmail);
      await opportunityPage.fillCompanyName('Company CRM-10871');
      await opportunityPage.fillStreet('123 street');
      await opportunityPage.selectCountry('Chile');
      await opportunityPage.selectState('Antofagasta');
      await opportunityPage.selectSalesTeam('BDEU');
      await opportunityPage.selectSalesperson(SALES.displayName);
      // These three are CRM-2338-specific data-hygiene extras (not required by CRM-10871) and some are
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
    // Steps (mirrors Jira CRM-10871 manual steps 1-3)
    // ============================================================
    await test.step('Step 1: Open CRM module', async () => {
      // We are already in CRM on the just-created Opportunity (pre-condition B.2).
      console.log('✓ Step 1: CRM module open (on the qualifying Opportunity)');
    });

    await test.step('Step 2: Create new opp and create new deal element for this opp', async () => {
      // The qualifying Opp was created in Pre-condition B.2; here we open its Deal Element (sale.order)
      // and add a product so the order is ready for the (inactive) promotion-apply attempt in Step 3.
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      await dealElementPage.addProductLine('[A2144B]', 1, 'Socket');
      const lineCount = await dealElementPage.getOrderLineCount();
      console.log(`✓ Step 2: Deal Element opened, product added (order lines = ${lineCount})`);
      expect(lineCount, 'Order should contain the added product line').toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Deal Element with product');
    });

    await test.step('Step 3: Try to apply promotion A to the deal', async () => {
      // Expected: "Cannot apply promotion A" - the promotion is INACTIVE (archived), so it cannot be
      // applied. setPromotion should not find the archived promo in the dropdown (keyboard fallback
      // sets nothing valid), so after save no discount line is added and the total is unchanged.
      const totalBefore = await dealElementPage.getAmountTotal();
      const linesBefore = await dealElementPage.getOrderLineCount();
      console.log(`  Before attempting apply: total=${totalBefore}, order lines=${linesBefore}`);

      // Attempt to apply the inactive Promotion A (best-effort; archived promo should be unavailable).
      await dealElementPage.setPromotion(promoName).catch((e) => {
        console.log(`  ⚠ setPromotion (inactive promo, expected unavailable): ${e instanceof Error ? e.message : String(e)}`);
        return false;
      });
      await dealElementPage.save().catch((e) => console.log(`  ⚠ save after inactive-apply attempt: ${e instanceof Error ? e.message : String(e)}`));

      const totalAfter = await dealElementPage.getAmountTotal();
      const linesAfter = await dealElementPage.getOrderLineCount();
      const promoLinePresent = await dealElementPage.isProductInOrderLines(promoName);
      console.log(`  After attempt: total=${totalAfter}, order lines=${linesAfter}, promo line present=${promoLinePresent}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Inactive promotion not applied');

      // Expected (Jira): Cannot apply promotion A.
      //  - No promotion discount line is added to Order Lines.
      //  - The order Total is unchanged (no discount applied).
      expect(promoLinePresent, 'Inactive Promotion A must NOT appear as a discount line in Order Lines').toBeFalsy();
      expect(linesAfter, 'No new (discount) order line should be added when the promotion is inactive').toBe(linesBefore);
      expect(totalAfter, 'Order Total must be unchanged - an inactive promotion cannot be applied').toBe(totalBefore);
      console.log(`✅ Inactive Promotion A could not be applied: Total unchanged (${totalBefore} == ${totalAfter}), no discount line added`);
    });
  });
});
