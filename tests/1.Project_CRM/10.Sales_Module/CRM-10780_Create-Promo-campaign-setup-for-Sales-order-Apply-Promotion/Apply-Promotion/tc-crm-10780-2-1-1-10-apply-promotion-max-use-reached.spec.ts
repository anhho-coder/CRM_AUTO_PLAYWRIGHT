import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Apply a promotion that has reached its maximum use number ("Apply on first = 3").
 * Test Case ID: CRM-10780_2.1.1.10   (Jira: CRM-10870 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Salesperson creates 4 Opportunities, each with its own Deal Element (sale.order).
 *          "Promotion A" is a Fixed-Amount / On-Order discount limited to the first 3 uses
 *          (maximum_use_number = 3, "Apply on first = 3"). Applying it to the first 3 deals
 *          succeeds; applying it to the 4th deal must FAIL because the promo has reached its
 *          maximum use number.
 *
 * COMPLEX CASE (best-effort draft - needsManualWork=true):
 *   This TC verifies the "Apply on first = N / maximum_use_number" cap, which is a usage-count
 *   gate enforced by the Promotion Program after N successful applications. There is no simple
 *   page-object setter for "the promo is now exhausted"; we exercise it organically by applying
 *   to 4 real deals in order. Whether the 4th apply is blocked at the UI (field rejected / no
 *   discount line added / total unchanged) versus needing the Promotion Program "order count"
 *   to be re-read is environment-dependent - see the TODO (manual) notes in Steps 3 and 4.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_2\.1\.1\.10:" --project=chromium
 *
 * Source manual TC (Jira CRM-10870)
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
 *       _ Apply on first = 3
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Create 4 opp and create 4 deal elements for these opp
 *     3. Try to apply promotion A to first 3 deals
 *     4. Try to apply promotion A to the 4th deal
 *
 *   Expected Result:
 *     Step 3: Promotion A is applied successfully.
 *     Step 4: Cannot apply promotion A
 *
 * Design notes:
 * - "Promotion A" is created by a Sales Manager (users.manager_max) via PromotionPage.createPromotion
 *   (the packaged create flow validated by CRM-10844). Precondition maps to:
 *     { applyDiscount: 'Fixed Amount', discountFixedAmount: 100, maxDiscountAmount: 50, maximumUseNumber: 3 }.
 * - "Apply promotion A" on this Nakivo Deal Element = set the editable "Promotion" field
 *   (promotion_id Many2one) to Promotion A, then SAVE. On a qualifying order the promo is added as
 *   a discount line and the order total is reduced; when the promo is exhausted (4th use) the apply
 *   must have NO effect (no discount line, total unchanged).
 * - Each qualifying Opportunity needs a real customer for the Deal Element to accept product lines
 *   (a bare Opp's Deal Element does not). We reuse the proven CRM-2338 setup: an EndUser Contact with
 *   a Pricelist, then an Opp using that contact's email - done as the Salesperson (Thomas). For this
 *   max-use TC we build FOUR such Opp/Deal pairs.
 * - Cross-user: create the promo as Sales Manager, then RE-LOGIN as the Salesperson for the steps
 *   (a fresh login lands on apps-home where navigateToCRM works - navigating cross-module from inside
 *   a form view times out). Teardown re-logs in as the Sales Manager to archive the promo and deletes
 *   the 4 Opps + 4 Contacts via CommonUtils.deleteRecordByUrl.
 */

const MANAGER = users.manager_max;       // Sales Manager - creates "Promotion A" (precondition)
const SALES = users.sale_ic_thomas;      // Salesperson - applies the promotion (steps under test)
const SKIP_CLEANUP = true; // per-test cleanup skipped (opp delete hangs as Salesperson); consolidated cleanup runs as admin afterward
const DEAL_COUNT = 4;                    // 3 successful applies + 1 that must fail (max use = 3)

test.describe('CRM-10780_2.1.1.10 - Apply promotion that has reached its maximum use number', () => {
  let promoName = '';
  let promoUrl = '';
  // One entry per Opportunity/Contact created (for teardown).
  const contactUrls: string[] = [];
  const oppUrls: string[] = [];

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

    // Delete the 4 Opps (also removes their Deal Elements) + the 4 Contacts (Action > Delete by URL).
    for (const url of oppUrls) {
      if (url) await CommonUtils.deleteRecordByUrl(page, url, testInfo).catch((e) => console.log(`  ⚠ Opp cleanup: ${e instanceof Error ? e.message : String(e)}`));
    }
    for (const url of contactUrls) {
      if (url) await CommonUtils.deleteRecordByUrl(page, url, testInfo).catch((e) => console.log(`  ⚠ Contact cleanup: ${e instanceof Error ? e.message : String(e)}`));
    }

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
    contactUrls.length = 0; oppUrls.length = 0; promoName = ''; promoUrl = '';
  });

  test('CRM-10780_2.1.1.10: Apply promotion that has reached its maximum use number', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const promotionPage = new PromotionPage(page);
    const timestamp = CommonUtils.generateTimestamp();

    // Per-deal apply result, recorded in Steps 3 and 4 for the final assertions.
    type ApplyResult = { index: number; totalBefore: number; totalAfter: number; linesBefore: number; linesAfter: number; promoLinePresent: boolean };
    const applyResults: ApplyResult[] = [];

    // ------------------------------------------------------------
    // Helper: create one EndUser Contact (with Pricelist) + one qualifying Opportunity + open its
    // Deal Element and add the qualifying product line. Returns the Opp URL (left on the Deal form).
    // ------------------------------------------------------------
    const buildOppWithDeal = async (i: number): Promise<void> => {
      const contactName = `TEST-EndUser_CRM-10870_${i}_${timestamp}`;
      const contactEmail = `test-enduser-crm10870-${i}-${timestamp}@enduser-company.com`;

      // Contact (with Pricelist)
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      await contactPage.clickCreate();
      const result = await contactPage.createContact('Company', contactName, contactEmail, 'Chile', 'BDEU', 'Antofagasta', SALES.displayName);
      console.log(`  ✓ EndUser Contact #${i} created (id=${result.contactId})`);
      await contactPage.clickEdit();
      await contactPage.clickSalesPurchasesTab();
      await contactPage.selectPricelist('Public Pricelist_EUR');
      await contactPage.clickSaveIfEditable();
      await contactPage.waitForSaveComplete();
      await page.waitForFunction(() => { const m = window.location.href.match(/[?&#]id=(\d+)/); return m && m[1]; }, { timeout: 30000 }).catch(() => {});
      contactUrls.push(page.url());
      console.log(`  ✓ URL_Contact #${i} = ${page.url()}`);

      // Opportunity (using the EndUser email)
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      const oppName = `TEST Opp CRM-10870 #${i} ${timestamp}`;
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(contactEmail);
      await opportunityPage.fillCompanyName(`Company CRM-10870 #${i}`);
      await opportunityPage.fillStreet('123 street');
      await opportunityPage.selectCountry('Chile');
      await opportunityPage.selectState('Antofagasta');
      await opportunityPage.selectSalesTeam('BDEU');
      await opportunityPage.selectSalesperson(SALES.displayName);
      // CRM-2338-specific data-hygiene extras (not required by CRM-10870); some are admin-only fields
      // not rendered for the Salesperson role - best-effort so they never block setup.
      await opportunityPage.uncheckCreatedManually().catch((e) => console.log(`  ⚠ uncheckCreatedManually skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.clickCRMDeveloperTab().catch((e) => console.log(`  ⚠ CRM Developer tab skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.fillLeadForm('Download Free Trial').catch((e) => console.log(`  ⚠ fillLeadForm skipped: ${e instanceof Error ? e.message : String(e)}`));
      await opportunityPage.selectStage('New');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      await opportunityPage.waitForIdInUrlAndExtract();
      oppUrls.push(page.url());
      console.log(`  ✓ URL_Opp #${i} = ${page.url()}`);
      await opportunityPage.waitForContactFieldPopulated(contactName, 2, 8000).catch(() => {});

      // Open the Deal Element and add the qualifying product line.
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      await dealElementPage.addProductLine('[A2144B]', 1, 'Socket');
      const lineCount = await dealElementPage.getOrderLineCount();
      console.log(`  ✓ Deal Element #${i} ready (order lines = ${lineCount})`);
      expect(lineCount, `Deal #${i} should contain the added product line`).toBeGreaterThan(0);
    };

    // ------------------------------------------------------------
    // Helper: attempt to apply Promotion A to the Deal Element currently open, capture before/after.
    // ------------------------------------------------------------
    const applyPromoToCurrentDeal = async (i: number): Promise<ApplyResult> => {
      const totalBefore = await dealElementPage.getAmountTotal();
      const linesBefore = await dealElementPage.getOrderLineCount();
      console.log(`  [Deal #${i}] Before applying: total=${totalBefore}, order lines=${linesBefore}`);

      // "Apply promotion A" = set Promotion A in the "Promotion" field (edit mode), then SAVE.
      await dealElementPage.setPromotion(promoName).catch((e) => console.log(`  ⚠ [Deal #${i}] setPromotion: ${e instanceof Error ? e.message : String(e)}`));
      await dealElementPage.save().catch((e) => console.log(`  ⚠ [Deal #${i}] save: ${e instanceof Error ? e.message : String(e)}`));

      const totalAfter = await dealElementPage.getAmountTotal();
      const linesAfter = await dealElementPage.getOrderLineCount();
      const promoLinePresent = await dealElementPage.isProductInOrderLines(promoName);
      console.log(`  [Deal #${i}] After applying: total=${totalAfter}, order lines=${linesAfter}, promo line present=${promoLinePresent}`);
      return { index: i, totalBefore, totalAfter, linesBefore, linesAfter, promoLinePresent };
    };

    // ============================================================
    // Pre-condition A: "Promotion A" exists (Sales Manager creates it)
    //   Fixed Amount, On Order, Max Discount Amount = 50$, Apply on first = 3
    // ============================================================
    await test.step('Pre-condition A: Sales Manager creates Promotion A (Fixed Amount, On Order, Max 50$, Apply on first = 3)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(MANAGER.username, MANAGER.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      const created = await promotionPage.createPromotion({
        namePrefix: 'TEST- 2-1-1-10 ',
        applyDiscount: 'Fixed Amount',
        discountFixedAmount: 100,
        maxDiscountAmount: 50,
        maximumUseNumber: 3,            // "Apply on first = 3"
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
    // Steps (mirrors Jira CRM-10870 manual steps 1-4)
    // ============================================================
    await test.step('Step 1: Open CRM module', async () => {
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Step 1: CRM module open');
    });

    await test.step('Step 2: Create 4 opp and create 4 deal elements for these opp', async () => {
      // Build deals 1..3 here (each left on its Deal Element form, qualifying product line added).
      // Deal #4 is built lazily inside Step 4 so we are positioned on the right form for each apply.
      // NOTE: this helper navigates Contacts -> CRM per deal; after each build we are on that deal's form.
      for (let i = 1; i <= 3; i++) {
        console.log(`--- Building Opp/Deal #${i} ---`);
        await buildOppWithDeal(i);
        // Apply immediately to deal #1..3 in Step 3; but we cannot stay on 3 forms at once, so we
        // apply right away here and record the result for Step 3 to assert.
        applyResults.push(await applyPromoToCurrentDeal(i));
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 2/3 - Deal #${i} promo applied`);
      }
      console.log(`✓ Step 2: built and applied to ${applyResults.length} of ${DEAL_COUNT} deals (4th built in Step 4)`);
    });

    await test.step('Step 3: Try to apply promotion A to first 3 deals', async () => {
      // The first 3 applies were performed in Step 2 (recorded in applyResults). Assert each succeeded.
      // Expected (Jira): Promotion A is applied successfully (discount line added + total reduced).
      // TODO (manual): if the 3rd apply is silently capped at maximum_use_number=3 BEFORE this deal
      //   (e.g. another tester consumed uses), re-read the Promotion Program's order count to confirm.
      expect(applyResults.length, 'Three apply attempts should be recorded from Step 2').toBe(3);
      for (const r of applyResults) {
        const applied = r.promoLinePresent || r.linesAfter > r.linesBefore || r.totalAfter < r.totalBefore;
        console.log(`  [Deal #${r.index}] applied=${applied} (total ${r.totalBefore} -> ${r.totalAfter}, lines ${r.linesBefore} -> ${r.linesAfter}, promoLine=${r.promoLinePresent})`);
        expect(applied, `Promotion A should be applied successfully to deal #${r.index} (within the first 3 uses)`).toBeTruthy();
      }
      console.log('✅ Step 3: Promotion A applied successfully to the first 3 deals');
    });

    await test.step('Step 4: Try to apply promotion A to the 4th deal', async () => {
      // Build the 4th Opp/Deal, then attempt to apply Promotion A - it must FAIL (max use reached).
      console.log('--- Building Opp/Deal #4 ---');
      await buildOppWithDeal(4);
      const r = await applyPromoToCurrentDeal(4);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - 4th deal promo NOT applied');

      // Expected (Jira): Cannot apply promotion A (promo exhausted - maximum_use_number = 3 / "Apply on first = 3").
      //  - No promo discount line is added AND the order Total is unchanged.
      const noPromoLine = !r.promoLinePresent && r.linesAfter <= r.linesBefore;
      const totalUnchanged = r.totalAfter === r.totalBefore;
      console.log(`  [Deal #4] noPromoLine=${noPromoLine}, totalUnchanged=${totalUnchanged}`);
      // TODO (manual): confirm HOW the cap surfaces in this build - the UI may (a) reject the Promotion
      //   field with a validation/warning, (b) accept the field but add no discount line, or (c) require
      //   reading the Promotion Program's "order count" (= 3) to prove the 4th was not counted. The
      //   assertion below covers (b); if the build raises a blocking dialog instead, capture/assert that
      //   dialog text here and treat a rejected field as the pass condition.
      expect(noPromoLine, 'Promotion A should NOT be added as a discount line on the 4th deal (max use reached)').toBeTruthy();
      expect(totalUnchanged, 'Order Total on the 4th deal should be unchanged (Promotion A cannot be applied)').toBeTruthy();
      console.log('✅ Step 4: Promotion A cannot be applied to the 4th deal (maximum use number reached)');
    });
  });
});
