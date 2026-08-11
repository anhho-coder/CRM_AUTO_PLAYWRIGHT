import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, QuotationPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-4383_3.1 - Salesperson: saving a quotation NOT started from an Opportunity is blocked
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-4383_3.1
 *  Jira:            CRM-4383 (regression of CRM-2329)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-11
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Hiding the CREATE button is the visible fix; the server-side guard is the backstop. Even if a
 *    Salesperson reaches a blank New Quotation form directly (the old dead-end), saving a quotation
 *    that was not started from an Opportunity is rejected with the warning:
 *       Please create quotation by clicking the "New Quotation" button from an Opportunity !!!
 *    This TC drives that path and asserts the guard fires (no free-standing quotation is created).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-4383_3\.1:" --project=chromium
 *
 *  Pre-conditions:
 *    - Login as a Salesperson (Ex: Thomas Semerich).
 *
 *  Steps:
 *    1. Open a blank New Quotation (sale.order) form directly.
 *    2. Set a Customer (so the client-side required-field check passes and the SAVE reaches the server).
 *    3. Click "SAVE".
 *
 *  Expected Result:
 *    - A warning appears: 'Please create quotation by clicking the "New Quotation" button from an
 *      Opportunity !!!' - the quotation is NOT saved.
 *
 *  Design notes:
 *    - The blank New form is reached via QuotationPage.openNewQuotationForm (hash-route to act_window
 *      344 in form view). Setting a Payer is required so the only remaining blocker is the server-side
 *      Opportunity guard (otherwise the client would stop on the required Customer field first).
 *    - The warning is read via BasePage.getBlockingPopupText (matches the Odoo warning modal).
 */

const SALES = users.sale_ic_thomas; // Salesperson (no CRM-Team right)
// An existing COMPANY customer: selecting a company auto-fills End User / Invoice / Delivery on the
// form, so only Payment Terms remains to satisfy the client before the SAVE reaches the server guard.
const CUSTOMER_SEARCH = 'LocalDisti';

test.describe('CRM-4383_3.1 - Salesperson: non-Opportunity quotation save is blocked by the guard', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('X TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      await CommonUtils.waitForSpinnersToHide(page).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
  });

  test('CRM-4383_3.1: Salesperson cannot save a quotation that is not started from an Opportunity', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const quotationPage = new QuotationPage(page);
    const dealElementPage = new DealElementPage(page);

    await test.step('Pre-condition: Login as a Salesperson (Thomas Semerich)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(SALES.username, SALES.password, 120000);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as Salesperson ${SALES.displayName}`);
    });

    await test.step('Step 1: Open a blank New Quotation form directly', async () => {
      await quotationPage.openNewQuotationForm();
      console.log('✓ Blank New Quotation form opened');
    });

    await test.step('Step 2: Set a Customer (company) + Pricelist + Payment Terms so the SAVE reaches the server guard', async () => {
      const chosen = await quotationPage.selectCustomerOnNewQuotation(CUSTOMER_SEARCH);
      expect(chosen, `A selectable Customer should be found for "${CUSTOMER_SEARCH}"`).toBeTruthy();
      // Fill the remaining client-required fields (Pricelist, Payment Terms, End User) so the
      // client-side validation passes and the SAVE actually reaches the server-side
      // "create from an Opportunity" guard.
      await dealElementPage.selectPricelist('Public Pricelist_USD').catch(() => {});
      await dealElementPage.selectPaymentTerm('Immediate Payment').catch(() => {});
      await quotationPage.setEndUserOnNewQuotation(CUSTOMER_SEARCH).catch(() => {});
    });

    let popupText = '';
    await test.step('Step 3: Click "SAVE" and read the blocking warning', async () => {
      await quotationPage.clickSaveButton();
      popupText = await quotationPage.getBlockingPopupText(CommonUtils.waitTimes.abnormalWait);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Guard warning on saving a non-Opportunity quotation');
    });

    await test.step('Expected: the save is blocked with the "create from an Opportunity" warning', async () => {
      const t = (popupText || '').toLowerCase();
      const guardShown = /new quotation/.test(t) && /from an opportunity/.test(t);

      console.log('==== VERIFY (CRM-4383_3.1) ====');
      console.log('Expected: a warning \'Please create quotation by clicking the "New Quotation" button from an Opportunity !!!\' blocks the save');
      console.log(`Actual  : popup text = "${popupText}"`);
      console.log(`Result  : ${guardShown ? 'PASS' : 'FAIL'}`);

      expect(popupText, 'A blocking warning dialog should appear when saving a non-Opportunity quotation').toBeTruthy();
      expect(guardShown, 'CRM-4383: the warning must tell the Salesperson to create the quotation from an Opportunity').toBeTruthy();
      console.log('✅ CRM-4383_3.1 verified: a free-standing quotation cannot be saved by a Salesperson (server guard fires)');
    });
  });
});
