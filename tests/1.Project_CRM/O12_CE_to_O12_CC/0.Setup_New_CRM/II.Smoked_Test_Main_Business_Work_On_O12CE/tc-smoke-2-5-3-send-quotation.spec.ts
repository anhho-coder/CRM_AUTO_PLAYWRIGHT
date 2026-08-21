import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { QuotationPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  O12ceOpportunity,
  O12ceQuotationResult,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Send a Quotation by email
 * Test Case ID: CRM-12325_2.5.3
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify a created Quotation can be sent by email on the O12 CE Migration server - the "Send" mail
 *   composer completes and the Quotation moves to the "Quotation Sent" state.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.5.3 "Send Quotation". Section II ports it as a
 * FUNCTIONAL smoke (elapsed time printed for reference; the gate is the business outcome).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-21):
 *   - Login as Admin (`users.admin_crm_mig`); CRM > Pipeline opened in list view by URL hash.
 *   - sale.order on the Migration server carries the "sent" state ("Quotation Sent"), so the state
 *     transition is the assertable signal (an on-screen success toast is not reliable in Odoo 12).
 *   - This TC needs the created Quotation to be OPEN on screen, so it asserts that "NEW QUOTATION"
 *     navigated to the new Quotation form (see CRM-12325_2.5.1 for the two observed variants).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps (1-11 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product, press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *
 * Steps run:
 *   1. Press "SEND BY EMAIL" button.
 *   2. Once the email form window appears completely, press "SEND" button.
 *
 * Verification Points:
 *   1. The email composer closes after "SEND" (the send completed without a blocking dialog).
 *   2. The Quotation status becomes "Quotation Sent".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.5\.3:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.5.3 - O12 CE smoke: send a Quotation by email', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    console.log(`Teardown: SKIP_CLEANUP_OPP=${SKIP_CLEANUP_OPP} - the created records are kept on O12 CE`);
  });

  test('CRM-12325_2.5.3: Verify a Quotation can be sent by email on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    const TC_ID = 'CRM-12325_2.5.3';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let sendMs = 0;
    let dialogClosed = false;
    let statusAfterSend = '';
    let notification = { success: false, message: '' };

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);
    await addDealElementOnO12CE(page);

    await test.step('Step 12: Press "NEW QUOTATION" button and wait', async () => {
      console.log('\n--- Step 12: Press NEW QUOTATION ---');
      quotation = await pressNewQuotationOnO12CE(page);
      expect(
        quotation.navigated,
        `the "NEW QUOTATION" action must open the created Quotation form so it can be sent (O12 CE created it in place instead - chatter: "${(quotation.chatterText || '').substring(0, 200)}")`
      ).toBeTruthy();
    });

    await test.step('Steps run - Step 1: Press "SEND BY EMAIL" button', async () => {
      console.log('\n--- Steps run - Step 1: Press SEND BY EMAIL ---');
      await quotationPage.clickSendByEmail(CommonUtils.waitTimes.abnormalWait);
      await quotationPage.waitForEmailDialog(CommonUtils.waitTimes.abnormalWait);
      console.log('  OK - the email composer is open');
    });

    await test.step('Steps run - Step 2: Once the email form window appears completely, press "SEND" button', async () => {
      console.log('\n--- Steps run - Step 2: Press SEND ---');
      sendMs = await quotationPage.sendEmail();
      dialogClosed = await quotationPage.waitForEmailDialogClose(CommonUtils.waitTimes.savingPage);
      notification = await quotationPage.verifyEmailSent();
      statusAfterSend = await quotationPage.getQuotationStatus().catch(() => '');
      console.log(`  SEND elapsed          : ${(sendMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Composer closed       : ${dialogClosed}`);
      console.log(`  Status after SEND     : "${statusAfterSend}"`);
      console.log(`  On-screen notification: "${notification.message}"`);
    });

    await test.step('Verification', async () => {
      const statusOk = /sent/i.test(statusAfterSend);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The email composer closes after "SEND":');
      console.log('     Expected : composer dialog hidden');
      console.log(`     Actual   : closed=${dialogClosed}`);
      console.log(`     Result   : ${dialogClosed ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The Quotation status becomes "Quotation Sent":');
      console.log('     Expected : status contains "Sent"');
      console.log(`     Actual   : "${statusAfterSend}"`);
      console.log(`     Result   : ${statusOk ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Opportunity: id=${opp?.oppId}`);
      console.log(`  Info - SEND elapsed: ${(sendMs / 1000).toFixed(2)}s`);
      console.log(`  Info - Success notification seen: ${notification.success} ("${notification.message}")`);
      console.log('===============================================');
      console.log(`OVERALL: ${dialogClosed && statusOk ? 'PASS' : 'FAIL'} - Quotation send-by-email on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Quotation sent on O12 CE`);

      expect(dialogClosed, 'the email composer must close after pressing SEND on O12 CE (a still-open composer means the send did not complete)').toBeTruthy();
      expect(statusOk, `the sent Quotation must move to the "Quotation Sent" state on O12 CE (status read back: "${statusAfterSend}")`).toBeTruthy();
    });
  });
});
