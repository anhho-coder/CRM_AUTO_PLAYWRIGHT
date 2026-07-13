import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Try to apply a customer-domain-restricted promotion to an opp from a DIFFERENT (incorrect) domain - it must NOT apply.
 * Test Case ID: CRM-10780_2.1.1.16   (Jira: CRM-10876 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Salesperson opens CRM, creates a new Opportunity whose customer is in domain B, goes to its
 *          Deal Element (sale.order), adds a product, and tries to apply "Promotion A" - a promotion that
 *          is supported only for customer domain A (Fixed Amount, capped at Max Discount Amount = 50$).
 *          Because the deal's customer is in the wrong domain (B, not A), the promotion does NOT qualify -
 *          no discount line is added and the order total is unchanged.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_2\.1\.1\.16:" --project=chromium
 *
 * Source manual TC (Jira CRM-10876)
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
 *       _ Supported to customer domain A
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Create a new opp with customer domain B
 *     3. Go to deal element
 *     4. Try to apply promotion A to the deal
 *
 *   Expected Result (step 4):
 *     4. Can not apply promotion
 *
 * Design notes / COMPLEX case (needsManualWork = true):
 * - "Promotion A" is created by a Sales Manager (users.manager_max) via PromotionPage.createPromotion
 *   (the packaged create flow validated by CRM-10844). Precondition mapping for this TC:
 *     Apply Discount = Fixed Amount (no value) + Max Discount Amount = 50$ + Discount Apply On = On Order
 *       ->  { applyDiscount: 'Fixed Amount', discountFixedAmount: 100, maxDiscountAmount: 50 }.
 * - COMPLEXITY 1 - "Supported to customer domain A" has NO simple setter: the PromotionConfig interface
 *   (pages/PromotionPage.ts) exposes no customer-domain / supported-domain field, so createPromotion
 *   CANNOT restrict the promotion to a customer domain. This draft creates the promotion WITHOUT the
 *   domain restriction; the "domain A" restriction must be added manually on the Promotion Program form.
 *   See the TODO (manual) in Pre-condition A.
 * - COMPLEXITY 2 - "customer domain B" (step 2) is likewise not parameterized: the opp/contact is created
 *   with the standard EndUser data (email domain "@enduser-company.com"). To make this a meaningful
 *   incorrect-domain check, the contact email domain here must differ from the promotion's supported
 *   domain A. See the TODO (manual) in Step 2.
 * - NEGATIVE intent: the promotion is supported only for domain A, but the deal's customer is in domain B,
 *   so the deal does not qualify. Step 4 attempts the apply (sets the "Promotion" field, then SAVE) and we
 *   verify it had no effect: no promotion discount line is added and the order Total is unchanged. We
 *   tolerate either outcome of the field set (Odoo may reject the value, or accept it but compute no
 *   discount for a wrong-domain deal) - the load-bearing assertion is "no discount applied".
 *   NOTE: until the manual domain-A restriction is added to the promotion (TODO above), the promotion is
 *   NOT actually domain-restricted, so the assertions may not exercise the real eligibility rule.
 * - The deal needs a real customer for the Deal Element to accept product lines (a bare Opp's Deal Element
 *   does not). We reuse the proven CRM-2338 setup: an EndUser Contact with a Pricelist, then an Opp using
 *   that contact's email - done as the Salesperson (Thomas).
 * - Cross-user: create the promo as Sales Manager, then RE-LOGIN as the Salesperson for the steps
 *   (a fresh login lands on apps-home where navigateToCRM works - navigating cross-module from inside
 *   a form view times out). Teardown re-logs in as the Sales Manager to archive the promo.
 */

const MANAGER = users.manager_max;       // Sales Manager - creates "Promotion A" (precondition)
const SALES = users.sale_ic_thomas;      // Salesperson - tries to apply the promotion (steps under test)
const SKIP_CLEANUP = true; // per-test cleanup skipped (opp delete hangs as Salesperson); consolidated cleanup runs as admin afterward

test.describe('CRM-10780_2.1.1.16 - Apply promotion to an incorrect supported customer domain', () => {
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

  test('CRM-10780_2.1.1.16: Apply promotion to an incorrect supported customer domain', async ({ page }, testInfo) => {
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
    // Pre-condition A: "Promotion A" exists (Sales Manager creates it) - Fixed Amount, cap 50$, supported to domain A
    // ============================================================
    await test.step('Pre-condition A: Sales Manager creates Promotion A (Fixed Amount on order, Max Discount 50$, supported to customer domain A)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(MANAGER.username, MANAGER.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      const created = await promotionPage.createPromotion({
        namePrefix: 'TEST- 2-1-1-16 ',
        applyDiscount: 'Fixed Amount',
        discountFixedAmount: 100,
        maxDiscountAmount: 50,
      });
      promoName = created.name;
      promoUrl = created.url;
      console.log(`✓ Promotion A created: "${promoName}" @ ${promoUrl}`);
      expect(await promotionPage.isInEditMode(), 'Promotion A should have saved').toBeFalsy();
      expect(await promotionPage.isPromotionActive(), 'Promotion A should be active').toBeTruthy();

      // TODO (manual): restrict this promotion to "customer domain A". PromotionConfig / createPromotion has
      // NO setter for the supported-customer-domain rule, so the promotion is created WITHOUT the domain
      // restriction. Open the just-created Promotion Program (promoUrl), add the "Supported to customer
      // domain A" rule on the form, and save - so the promotion only qualifies for domain-A customers.
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-A - Promotion A created (domain restriction TODO)');
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
    // Pre-condition B.1: a deal with a customer (EndUser Contact + Opp) - customer is in domain B (the wrong domain)
    // ============================================================
    await test.step('Pre-condition B.1: Create EndUser Contact (with Pricelist) - customer in domain B', async () => {
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      contactName = `TEST-EndUser_CRM-10876_${timestamp}`;
      // TODO (manual): this email domain ("@enduser-company.com") represents "customer domain B". It MUST
      // be a DIFFERENT domain from the promotion's supported "customer domain A" (set in Pre-condition A).
      // Adjust the email domain here to match whatever concrete domain B vs A the manual TC intends.
      contactEmail = `test-enduser-crm10876-${timestamp}@enduser-company.com`;
      await contactPage.clickCreate();
      const result = await contactPage.createContact('Company', contactName, contactEmail, 'Chile', 'BDEU', 'Antofagasta', SALES.displayName);
      console.log(`  ✓ EndUser Contact created (id=${result.contactId}) in domain B (${contactEmail})`);
      await contactPage.clickEdit();
      await contactPage.clickSalesPurchasesTab();
      await contactPage.selectPricelist('Public Pricelist_EUR');
      await contactPage.clickSaveIfEditable();
      await contactPage.waitForSaveComplete();
      await page.waitForFunction(() => { const m = window.location.href.match(/[?&#]id=(\d+)/); return m && m[1]; }, { timeout: 30000 }).catch(() => {});
      urlContact = page.url();
      console.log(`  ✓ URL_Contact = ${urlContact}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-B.1 - EndUser Contact created (domain B)');
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
    // Step 2: Create a new opp with customer domain B
    // ============================================================
    await test.step('Step 2: Create a new opp with customer domain B', async () => {
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      const oppName = `TEST Opp CRM-10876 ${timestamp}`;
      await opportunityPage.fillOpportunityName(oppName);
      // The Opp uses the domain-B EndUser email created above (this is the "customer domain B" of the TC).
      // TODO (manual): confirm the email domain here represents domain B (different from the promotion's
      // supported domain A) - see the TODO in Pre-condition B.1.
      await opportunityPage.fillEmail(contactEmail);
      await opportunityPage.fillCompanyName('Company CRM-10876');
      await opportunityPage.fillStreet('123 street');
      await opportunityPage.selectCountry('Chile');
      await opportunityPage.selectState('Antofagasta');
      await opportunityPage.selectSalesTeam('BDEU');
      await opportunityPage.selectSalesperson(SALES.displayName);
      // These are CRM-2338-specific data-hygiene extras (not required by CRM-10876) and some are admin-only
      // fields not rendered for the Salesperson role - best-effort so they never block setup.
      await opportunityPage.uncheckCreatedManually().catch((e) => console.log(`  ⚠ uncheckCreatedManually skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.clickCRMDeveloperTab().catch((e) => console.log(`  ⚠ CRM Developer tab skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.fillLeadForm('Download Free Trial').catch((e) => console.log(`  ⚠ fillLeadForm skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.selectStage('New');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      await opportunityPage.waitForIdInUrlAndExtract();
      urlOpp = page.url();
      console.log(`  ✓ URL_Opp = ${urlOpp} (customer domain B)`);
      await opportunityPage.waitForContactFieldPopulated(contactName, 2, 8000).catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Opportunity created (customer domain B)');
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

      // Attempt to apply the domain-A-only Promotion A to a domain-B deal. Either the field rejects the
      // value, or it accepts it but no discount is computed for this wrong-domain deal - both mean
      // "cannot apply".
      // TODO (manual): this assertion only exercises the real domain-eligibility rule once the
      // "Supported to customer domain A" restriction has been added to the promotion (see Pre-condition A
      // TODO). Without that restriction the promotion is unrestricted and would actually apply.
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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Promotion not applicable (wrong customer domain)');

      // Expected (Jira): Can not apply promotion.
      //  - No promotion discount line was added to Order Lines.
      //  - The order Total is unchanged (no discount taken for a wrong-domain deal).
      expect(promoLinePresent, 'A domain-A-only promotion must NOT add a discount line to a domain-B deal').toBeFalsy();
      expect(linesAfter, 'A domain-A-only promotion must NOT add an extra order line to a domain-B deal').toBe(linesBefore);
      expect(totalAfter, 'Order Total must be unchanged - the domain-A-only promotion cannot apply to a domain-B deal').toBe(totalBefore);
      console.log(`✅ Domain-A-only Promotion A could NOT be applied to the domain-B deal: Total stayed ${totalBefore} -> ${totalAfter}`);
    });
  });
});
