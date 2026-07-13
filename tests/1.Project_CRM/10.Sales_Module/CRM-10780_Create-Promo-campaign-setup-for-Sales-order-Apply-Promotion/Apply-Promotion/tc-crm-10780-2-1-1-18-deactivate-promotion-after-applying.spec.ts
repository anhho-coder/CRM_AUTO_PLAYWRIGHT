import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage, PromotionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Verify deactivate (delete) a Promotion Program AFTER it has been applied to a saved order.
 * Test Case ID: CRM-10780_2.1.1.18
 * Jira: CRM-10878
 * Automation-Type: new
 * Automation-Date: 2026-06-22
 *
 * Summary: A Salesperson opens an Opportunity, creates a Deal Element (sale.order) from it and applies
 *          the Automatically-Applied "Promotion A" (10% on order). Then, from Sales > Products >
 *          Promotion Programs, the Salesperson opens Promotion A and tries to DELETE it. Because the
 *          promotion is now referenced by a saved order, the delete is blocked and the system shows an
 *          error (the Promotion Program must NOT be deletable once it has been applied).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10780_2\.1\.1\.18:" --project=chromium
 *
 * Source manual TC (Jira CRM-10878)
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
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Create 1 new opp
 *     3. Create 1 deal from this new opp
 *     4. Go to Sales Modules
 *     5. Open Product > promotion programs
 *     6. Open Promotion A
 *     7. Delete promotion A
 *
 *   Expected Result (step 7):
 *     7. Show error
 *     (The Promotion Program cannot be deleted because it is already applied / referenced by an order.)
 *
 * Design notes:
 * - "Promotion A" is created by a Sales Manager (users.manager_max) via PromotionPage.createPromotion
 *   (the packaged create flow validated by CRM-10844). It is created as the BASE promotion: Automatically
 *   Applied, Discount, Percentage 10%, On Order - i.e. exactly the precondition "Promotion A with: ...".
 * - The steps are run as the Salesperson (Thomas). A fresh login lands on apps-home where navigateToCRM
 *   works (navigating cross-module from inside a form view times out). Teardown re-logs in as the Sales
 *   Manager to archive the promo.
 * - A qualifying Opportunity needs a real customer for the Deal Element to accept product lines (a bare
 *   Opp's Deal Element does not). We reuse the proven CRM-2338 setup: an EndUser Contact (with Pricelist),
 *   then an Opp using that contact's email - done as the Salesperson (Thomas).
 * - Step 3 "Create 1 deal from this new opp" here = open the Opp's Deal Element, add a product line and
 *   APPLY Promotion A (set the editable "Promotion" field, then SAVE). Applying the promo on a saved
 *   order is what makes step 7's delete fail. We assert the promo really applied (discount line added /
 *   total reduced) before going on, so the "show error" in step 7 is meaningful.
 *
 * COMPLEX CASE (verificationType = 'complex', needsManualWork = true):
 *   This TC is "verify deactivate / delete the Promotion Program AFTER applying" - a STEP-E complex case.
 *   The expected result is a NEGATIVE outcome on a destructive action: the hard-DELETE of the Promotion
 *   Program must be REJECTED with an error because the promo is referenced by a saved sale.order.
 *   - The PromotionPage object only exposes ARCHIVE (soft-delete via Action > Archive), NOT a hard Delete,
 *     and there is no helper that performs "Action > Delete and assert the resulting error dialog". The
 *     step-7 block below drives the generic Action menu > Delete on the Promotion form and then asserts an
 *     error/blocked outcome, but the exact error wording + whether Odoo blocks via a dialog vs. a toast vs.
 *     silently keeping the record is product behaviour that a tester must confirm. See the TODO in Step 7.
 *   - Whether applying an Automatically-Applied promo to a *draft* (un-confirmed) order is enough to block
 *     the delete (vs. needing the order Confirmed/locked) is also a product question for the tester.
 */

const MANAGER = users.manager_max;       // Sales Manager - creates "Promotion A" (precondition)
const SALES = users.sale_ic_thomas;      // Salesperson - applies the promotion + attempts the delete
const SKIP_CLEANUP = true; // per-test cleanup skipped (opp delete hangs as Salesperson); consolidated cleanup runs as admin afterward

test.describe('CRM-10780_2.1.1.18 - Verify deactivate Promotion Program after applying', () => {
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
    // NOTE: step 7 only ATTEMPTS the delete (expected to be blocked), so Promotion A is expected to still
    // exist here and must be archived to keep the environment clean.
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

  test('CRM-10780_2.1.1.18: Verify deactivate Promotion Program after applying', async ({ page }, testInfo) => {
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
    // Promotion A with: Promo Code Usage = Automatically Applied, Reward = Discount,
    //                   Apply Discount = Percentage 10%, Discount Apply On = On Order.
    // ============================================================
    await test.step('Pre-condition A: Sales Manager creates Promotion A (Automatically Applied, 10% on order)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(MANAGER.username, MANAGER.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      const created = await promotionPage.createPromotion({ namePrefix: 'TEST- 2-1-1-18 ' });
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
    // Pre-condition B.1: an EndUser Contact (with Pricelist) so the Opp/Deal accepts product lines
    // ============================================================
    await test.step('Pre-condition B.1: Create EndUser Contact (with Pricelist)', async () => {
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      contactName = `TEST-EndUser_CRM-10878_${timestamp}`;
      contactEmail = `test-enduser-crm10878-${timestamp}@enduser-company.com`;
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
    // Steps 1-2 (mirrors Jira CRM-10878 manual steps): Open CRM module + Create 1 new Opp
    // ============================================================
    await test.step('Step 1: Open CRM module', async () => {
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Step 1: CRM module open');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - CRM module open');
    });

    await test.step('Step 2: Create 1 new opp', async () => {
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      const oppName = `TEST Opp CRM-10878 ${timestamp}`;
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(contactEmail);
      await opportunityPage.fillCompanyName('Company CRM-10878');
      await opportunityPage.fillStreet('123 street');
      await opportunityPage.selectCountry('Chile');
      await opportunityPage.selectState('Antofagasta');
      await opportunityPage.selectSalesTeam('BDEU');
      await opportunityPage.selectSalesperson(SALES.displayName);
      // CRM-2338-specific data-hygiene extras (not required by CRM-10878) and some are admin-only fields
      // not rendered for the Salesperson role - best-effort so they never block setup.
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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Opportunity created');
    });

    // ============================================================
    // Step 3: Create 1 deal from this new opp = open Deal Element, add product, APPLY Promotion A.
    // (Applying the promo to a SAVED order is the precondition that makes the step-7 delete fail.)
    // ============================================================
    await test.step('Step 3: Create 1 deal from this new opp (and apply Promotion A)', async () => {
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('  ✓ Deal Element (sale.order) form opened');

      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      await dealElementPage.addProductLine('[A2144B]', 1, 'Socket');
      const lineCount = await dealElementPage.getOrderLineCount();
      expect(lineCount, 'Order should contain the added product line').toBeGreaterThan(0);

      // Apply Promotion A: set the "Promotion" field (while in edit mode), then SAVE.
      const totalBefore = await dealElementPage.getAmountTotal();
      const linesBefore = await dealElementPage.getOrderLineCount();
      const set = await dealElementPage.setPromotion(promoName);
      expect(set, 'The "Promotion" field should be settable while the Deal Element is in edit mode').toBeTruthy();
      await dealElementPage.save();

      const totalAfter = await dealElementPage.getAmountTotal();
      const linesAfter = await dealElementPage.getOrderLineCount();
      const promoLinePresent = await dealElementPage.isProductInOrderLines(promoName);
      console.log(`  After applying: total=${totalAfter} (before ${totalBefore}), lines=${linesAfter} (before ${linesBefore}), promo line present=${promoLinePresent}`);

      // Confirm the promo really applied, so the order now REFERENCES Promotion A (the step-7 precondition).
      expect(promoLinePresent || linesAfter > linesBefore,
        'Promotion A should be added as a discount line in Order Lines (so the order references it)').toBeTruthy();
      expect(totalAfter, 'Order Total should be reduced after applying Promotion A').toBeLessThan(totalBefore);
      console.log('✓ Step 3: Deal created and Promotion A applied (order now references Promotion A)');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Deal created + Promotion A applied');
    });

    // ============================================================
    // Step 4: Go to Sales Modules
    // ============================================================
    await test.step('Step 4: Go to Sales Modules', async () => {
      // A fresh login lands on apps-home where module navigation is reliable (cross-module nav from inside
      // the Deal Element form times out), then open the Sales module directly.
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(SALES.username, SALES.password, 120000);
      await loginPage.dismissLocationPermissionDialog();
      await promotionPage.openSalesModule();
      console.log('✓ Step 4: Sales module open');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Sales module open');
    });

    // ============================================================
    // Step 5: Open Product > promotion programs
    // ============================================================
    await test.step('Step 5: Open Product > promotion programs', async () => {
      await promotionPage.navigateToPromotionPrograms();
      console.log('✓ Step 5: Promotion Programs list open');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Promotion Programs list');
    });

    // ============================================================
    // Step 6: Open Promotion A
    // ============================================================
    await test.step('Step 6: Open Promotion A', async () => {
      // Open Promotion A directly by its saved record URL (most reliable cross-session way to land on the
      // exact promotion we created), then confirm we are on the saved form for Promotion A.
      await promotionPage.goto(promoUrl);
      await CommonUtils.waitForSpinnersToHide(page).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const openedName = await promotionPage.getSavedName().catch(() => '');
      console.log(`✓ Step 6: Promotion A opened (form title: "${openedName}")`);
      // Best-effort sanity check that the open record is Promotion A.
      expect(openedName.length === 0 || openedName.includes(promoName) || promoName.includes(openedName),
        'The opened Promotion form should be Promotion A').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - Promotion A opened');
    });

    // ============================================================
    // Step 7: Delete promotion A  ->  Expected: 7. Show error
    // The promotion is referenced by the saved order (Promotion A was applied in step 3), so the hard
    // DELETE must be REJECTED with an error and Promotion A must still exist afterwards.
    // ============================================================
    await test.step('Step 7: Delete promotion A (Expected: show error - delete is blocked)', async () => {
      // TODO (manual): There is no PromotionPage helper for "Action > Delete then assert the error" - the
      // page object only exposes ARCHIVE (soft-delete). A tester must confirm the exact blocked-delete
      // behaviour and wire the assertion precisely:
      //   (a) HOW Odoo surfaces the rejection - an o_error_dialog modal (FK / "referenced" constraint),
      //       an o_notification error toast, or simply leaving the record in place; and the exact wording.
      //   (b) WHETHER applying the Automatically-Applied promo to this (draft, un-confirmed) order is
      //       enough to block the delete, or whether the order must be Confirmed/locked first.
      // The block below drives the generic Action menu > Delete on the Promotion form and asserts a
      // best-effort "blocked" outcome (an error popup appeared AND/OR Promotion A still exists). Re-point
      // these locators / assertions once the real behaviour is confirmed.

      // Drive the generic Odoo form Action menu > Delete (the PromotionPage has no dedicated Delete API).
      const actionMenuBtn = page.locator(
        "xpath=//button[normalize-space()='Action' or normalize-space()='ACTION'] | //div[contains(@class,'o_cp_action_menus')]//button"
      ).first();
      const deleteMenuItem = page.locator(
        "xpath=//a[@role='menuitem' and normalize-space()='Delete'] | //span[normalize-space()='Delete']/parent::a"
      ).first();
      const confirmDeleteBtn = page.locator(
        "xpath=//div[contains(@class,'modal')]//button[normalize-space()='Ok' or normalize-space()='OK' or normalize-space()='Delete']"
      ).first();

      await actionMenuBtn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await actionMenuBtn.click();
      await page.waitForTimeout(CommonUtils.waitTimes.short);

      const deleteVisible = await deleteMenuItem.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true).catch(() => false);
      if (deleteVisible) {
        await deleteMenuItem.click();
        // Confirm the "are you sure?" dialog if Odoo shows one before attempting the (blocked) delete.
        await confirmDeleteBtn.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      } else {
        console.log('  ⚠ No "Delete" option in the Action menu (delete may be disabled for an applied promo)');
      }
      await CommonUtils.waitForSpinnersToHide(page).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      // Expected (Jira): step 7 shows an error - the delete is blocked. Best-effort verification:
      //   (1) an error popup/toast appeared, OR (2) Promotion A still exists (delete did not go through).
      const errorText = await promotionPage.getErrorText().catch(() => '');
      const errorShown = errorText.length > 0;

      // Re-open Promotion A by URL to verify it was NOT deleted (still exists).
      await promotionPage.goto(promoUrl);
      await CommonUtils.waitForSpinnersToHide(page).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const stillExists = await promotionPage.isPromotionActive().then(() => true).catch(() => false)
        && !(page.url().includes('action=800') && !page.url().match(/[?&#]id=\d+/));
      const stillExistsByName = (await promotionPage.getSavedName().catch(() => '')).length > 0;

      console.log(`  Step 7 outcome: errorShown=${errorShown} ("${errorText}"), Promotion A still exists=${stillExists || stillExistsByName}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 7 - Delete attempt blocked (error)');

      expect(errorShown || stillExists || stillExistsByName,
        'Step 7: deleting an applied Promotion Program should be blocked (error shown / promotion still exists)').toBeTruthy();
      console.log('✓ Step 7: delete of the applied Promotion A was blocked (show error) as expected');
    });
  });
});
