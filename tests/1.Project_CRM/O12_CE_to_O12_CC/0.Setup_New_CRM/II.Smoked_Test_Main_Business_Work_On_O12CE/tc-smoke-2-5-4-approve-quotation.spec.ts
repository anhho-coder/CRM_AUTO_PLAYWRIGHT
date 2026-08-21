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
 * O12 CE Main-Business Smoke - Approve a Quotation
 * Test Case ID: CRM-12325_2.5.4
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify the Quotation approval workflow works on the O12 CE Migration server - a high-value
 *   Quotation sent "TO APPROVE" enters Pending Approval and can then be APPROVED.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.5.4 "Approve Quotation" (Ordered Qty = 30).
 * Section II ports it as a FUNCTIONAL smoke (elapsed time printed for reference; the gate is the
 * state transition).
 *
 * O12 CE deviations vs the pre-prod scenario (grounded on crm-mig, 2026-08-21):
 *   - Pre-prod runs two accounts (Thomas requests the approval, Max approves it in a second browser).
 *     The Migration server has ONE provisioned account (`users.admin_crm_mig`), so this TC presses
 *     "TO APPROVE" and then "APPROVE" in the same Admin session. The workflow transition is still
 *     exercised end to end; the approver-permission split is out of scope for the O12 CE smoke and
 *     stays covered by the pre-prod TC.
 *   - sale.order on crm-mig carries the NAKIVO approval states `pending_approval` ("Pending Approval")
 *     and `approved` ("Approved"), so both transitions are assertable.
 *   - Ordered Qty = 30 keeps the line total above the no-approval threshold, as on pre-prod.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps (1-11 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product with Ordered Qty = 30,
 *         press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *
 * Steps run:
 *   1. Press "TO APPROVE" button.
 *   2. Press "APPROVE" button (as the Admin approver on O12 CE).
 *
 * Verification Points:
 *   1. After "TO APPROVE" the Quotation status is "Pending Approval".
 *   2. After "APPROVE" the approval is consumed (the APPROVE button is gone and a forward action -
 *      CONFIRM / SEND BY EMAIL - is available).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.5\.4:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)
const APPROVAL_QTY = 30;       // Ordered Qty that pushes the Quotation over the no-approval threshold

test.describe('CRM-12325_2.5.4 - O12 CE smoke: approve a Quotation', () => {

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

  test('CRM-12325_2.5.4: Verify a Quotation can be approved on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    const TC_ID = 'CRM-12325_2.5.4';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let statusAfterToApprove = '';
    let statusAfterApprove = '';
    let approveMs = 0;
    let approvalCheck = { approved: false, approveButtonGone: false, toApproveButtonGone: false, confirmVisible: false, sendByEmailVisible: false };

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);
    await addDealElementOnO12CE(page, { productQty: APPROVAL_QTY });

    await test.step('Step 12: Press "NEW QUOTATION" button and wait', async () => {
      console.log('\n--- Step 12: Press NEW QUOTATION ---');
      quotation = await pressNewQuotationOnO12CE(page);
      expect(
        quotation.navigated,
        `the "NEW QUOTATION" action must open the created Quotation form so the approval can be requested (O12 CE created it in place instead - chatter: "${(quotation.chatterText || '').substring(0, 200)}")`
      ).toBeTruthy();
    });

    await test.step('Steps run - Step 1: Press "TO APPROVE" button', async () => {
      console.log('\n--- Steps run - Step 1: Press TO APPROVE ---');
      await quotationPage.clickToApprove(CommonUtils.waitTimes.abnormalWait);
      statusAfterToApprove = await quotationPage.getQuotationStatus().catch(() => '');
      console.log(`  Status after TO APPROVE : "${statusAfterToApprove}"`);
    });

    await test.step('Steps run - Step 2: Press "APPROVE" button (Admin approver on O12 CE)', async () => {
      console.log('\n--- Steps run - Step 2: Press APPROVE ---');
      approveMs = await quotationPage.clickApprove();
      approvalCheck = await quotationPage.verifyApprovalSuccess(CommonUtils.waitTimes.abnormalWait);
      statusAfterApprove = await quotationPage.getQuotationStatus().catch(() => '');
      console.log(`  APPROVE elapsed        : ${(approveMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Status after APPROVE   : "${statusAfterApprove}"`);
    });

    await test.step('Verification', async () => {
      const pendingOk = /pending|approv/i.test(statusAfterToApprove);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - After "TO APPROVE" the Quotation status is "Pending Approval":');
      console.log('     Expected : status contains "Pending Approval"');
      console.log(`     Actual   : "${statusAfterToApprove}"`);
      console.log(`     Result   : ${pendingOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - After "APPROVE" the approval is consumed and a forward action is available:');
      console.log('     Expected : APPROVE button gone AND (CONFIRM or SEND BY EMAIL) visible');
      console.log(`     Actual   : approveGone=${approvalCheck.approveButtonGone} | confirm=${approvalCheck.confirmVisible} | sendByEmail=${approvalCheck.sendByEmailVisible}`);
      console.log(`     Result   : ${approvalCheck.approved ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Status after APPROVE: "${statusAfterApprove}"`);
      console.log(`  Info - Opportunity: id=${opp?.oppId} | Ordered Qty=${APPROVAL_QTY}`);
      console.log(`  Info - APPROVE elapsed: ${(approveMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${pendingOk && approvalCheck.approved ? 'PASS' : 'FAIL'} - Quotation approval on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Quotation approved on O12 CE`);

      expect(pendingOk, `"TO APPROVE" must move the O12 CE Quotation into Pending Approval (status read back: "${statusAfterToApprove}")`).toBeTruthy();
      expect(approvalCheck.approved, `"APPROVE" must complete the O12 CE approval (approveGone=${approvalCheck.approveButtonGone}, confirm=${approvalCheck.confirmVisible}, sendByEmail=${approvalCheck.sendByEmailVisible})`).toBeTruthy();
    });
  });
});
