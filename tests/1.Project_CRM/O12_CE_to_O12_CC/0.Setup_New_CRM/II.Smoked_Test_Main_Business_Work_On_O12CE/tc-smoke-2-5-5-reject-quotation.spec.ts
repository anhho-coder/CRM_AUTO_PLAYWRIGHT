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
 * O12 CE Main-Business Smoke - Reject a Quotation
 * Test Case ID: CRM-12325_2.5.5
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify the Quotation rejection workflow works on the O12 CE Migration server - a Quotation in
 *   Pending Approval can be REJECTED (with a reason) and leaves the pending-approval state.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.5.5 "Reject Quotation" (Ordered Qty = 20).
 * Section II ports it as a FUNCTIONAL smoke (elapsed time printed for reference; the gate is the
 * state transition).
 *
 * O12 CE deviations vs the pre-prod scenario (grounded on crm-mig, 2026-08-21):
 *   - Pre-prod runs two accounts (Thomas requests the approval, Max rejects it in a second browser).
 *     The Migration server has ONE provisioned account (`users.admin_crm_mig`), so this TC presses
 *     "TO APPROVE" and then "REJECT" in the same Admin session.
 *   - The "Reject Reason" dialog text is filled by `QuotationPage.clickReject()`; the reason text
 *     itself is not a verification point (pre-prod enters "TEST").
 *   - Ordered Qty = 20 keeps the line total above the no-approval threshold, as on pre-prod.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps (1-11 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product with Ordered Qty = 20,
 *         press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *
 * Steps run:
 *   1. Press "TO APPROVE" button.
 *   2. Press "REJECT" button, enter the reject reason in the dialog and press "REJECT" on the dialog.
 *
 * Verification Points:
 *   1. After "TO APPROVE" the Quotation status is "Pending Approval".
 *   2. After "REJECT" the pending-approval buttons are consumed (APPROVE and REJECT are both gone).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.5\.5:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)
const APPROVAL_QTY = 100;      // Ordered Qty that pushes the Quotation over the approval threshold.
// Approval rule 38 "Quote amount >= $20K" is the only team-agnostic rule on crm-mig:
//   if record.amount_total_company_signed >= 20000: record.create_approvals(38)
// "NAKIVO Backup" lists at $329 on the Migration server, so the Quotation needs qty >= 61 for
// need_approve to become True and the "TO APPROVE" button to lose its invisible modifier.
// 100 x $329 = $32,900 leaves margin. (Verified on crm-mig 2026-08-25 - qty 30 gave $9,870,
// need_approve=false, so TO APPROVE stayed hidden and CRM-12325_2.5.4/2.5.5 could not run.)

test.describe('CRM-12325_2.5.5 - O12 CE smoke: reject a Quotation', () => {

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

  test('CRM-12325_2.5.5: Verify a Quotation can be rejected on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    const TC_ID = 'CRM-12325_2.5.5';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let statusAfterToApprove = '';
    let statusAfterReject = '';
    let rejectMs = 0;
    let rejectionCheck = { rejected: false, approveButtonGone: false, rejectButtonGone: false, editButtonVisible: false };

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

    await test.step('Steps run - Step 2: Press "REJECT", enter the reason and press "REJECT" on the dialog', async () => {
      console.log('\n--- Steps run - Step 2: Press REJECT ---');
      rejectMs = await quotationPage.clickReject();
      rejectionCheck = await quotationPage.verifyRejectionSuccess(CommonUtils.waitTimes.abnormalWait);
      statusAfterReject = await quotationPage.getQuotationStatus().catch(() => '');
      console.log(`  REJECT elapsed        : ${(rejectMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Status after REJECT   : "${statusAfterReject}"`);
    });

    await test.step('Verification', async () => {
      const pendingOk = /pending|approv/i.test(statusAfterToApprove);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - After "TO APPROVE" the Quotation status is "Pending Approval":');
      console.log('     Expected : status contains "Pending Approval"');
      console.log(`     Actual   : "${statusAfterToApprove}"`);
      console.log(`     Result   : ${pendingOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - After "REJECT" the pending-approval buttons are consumed:');
      console.log('     Expected : APPROVE gone AND REJECT gone');
      console.log(`     Actual   : approveGone=${rejectionCheck.approveButtonGone} | rejectGone=${rejectionCheck.rejectButtonGone} | editVisible=${rejectionCheck.editButtonVisible}`);
      console.log(`     Result   : ${rejectionCheck.rejected ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Status after REJECT: "${statusAfterReject}"`);
      console.log(`  Info - Opportunity: id=${opp?.oppId} | Ordered Qty=${APPROVAL_QTY}`);
      console.log(`  Info - REJECT elapsed: ${(rejectMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${pendingOk && rejectionCheck.rejected ? 'PASS' : 'FAIL'} - Quotation rejection on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Quotation rejected on O12 CE`);

      expect(pendingOk, `"TO APPROVE" must move the O12 CE Quotation into Pending Approval (status read back: "${statusAfterToApprove}")`).toBeTruthy();
      expect(rejectionCheck.rejected, `"REJECT" must consume the O12 CE pending-approval state (approveGone=${rejectionCheck.approveButtonGone}, rejectGone=${rejectionCheck.rejectButtonGone})`).toBeTruthy();
    });
  });
});
