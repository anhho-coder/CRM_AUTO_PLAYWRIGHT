import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { QuotationPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  bringQuotationToPendingApprovalOnO12CE,
  O12ceOpportunity,
  O12ceQuotationResult,
  O12cePendingApprovalResult,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - the REQUESTER Cancels his own pending-approval Quotation
 * Test Case ID: CRM-12325_2.5.9
 * Automation-Type: new
 * Automation-Date: 2026-08-26
 *
 * Summary:
 *   The third of the four buttons the requester sees on a pending-approval Quotation header on the
 *   O12 CE Migration server. The sales IC who raised a high-value Quotation (Thomas Semerich) can
 *   withdraw it himself - pressing "Cancel" on a Quotation that is waiting for approval must work
 *   and must take the Quotation out of "Pending Approval".
 *
 * Sibling specs (all four buttons work for the requester): 2.5.7 (self APPROVE), 2.5.8 (self
 * REJECT), 2.5.10 (self Duplicate).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-26):
 *   - ONE account only: Thomas Semerich (`users.sale_ic_thomas_crm_mig`) builds the Quotation AND
 *     presses "Cancel".
 *   - Thomas is a member of the "BDEU" sales team (crm.team id 156), so approval rule 64
 *     "All the quotations in BD over 4K" fires at Ordered Qty = 20 x $329 = $6,580 - the same value
 *     as 2.5.4 / 2.5.5 and the reference screenshot (SO177985), inside the $4K-$10K band so exactly
 *     ONE approval rule is in play.
 *   - "Cancel" is `action_cancel`. The base sale.order form (view 787) offers it with
 *     states="draft,sent,sale"; the Mig/approval view (1365) ADDS a second copy with
 *     states="approved,pending_approval". That second copy is the button under test - it is exactly
 *     why a Quotation stuck in approval is still withdrawable by its owner.
 *   - The verdict is NOT taken from the statusbar: base view 787 declares
 *     `statusbar_visible="draft,sent,sale"`, so the `cancel` state highlights no statusbar button.
 *     The reliable marker is `action_draft` "Set to Quotation" (states="cancel"), which only ever
 *     renders on a cancelled order - `QuotationPage.verifyQuotationCancelled()` reads that, plus the
 *     pending-approval buttons being consumed. The statusbar ("Cancelled") is read as a second,
 *     independent signal and either one is accepted.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in
 *   (CRM-12325_1.1.1).
 *
 * Steps (1-11 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login as Thomas, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait
 *         for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product with Ordered Qty = 20,
 *         press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *  13. Bring the Quotation to "Pending Approval".
 *
 * Steps run:
 *   1. Stay logged in as the SAME account that raised the Quotation (Thomas Semerich).
 *   2. Press the "Cancel" button on the Quotation header.
 *   3. Read the Quotation state back.
 *
 * Verification Points:
 *   1. Before the attempt the Quotation status is "Pending Approval" and "Cancel" is offered to the
 *      requester.
 *   2. "Cancel" works for the requester - the Quotation leaves "Pending Approval" and reads as
 *      cancelled ("Set to Quotation" is offered / the status reads "Cancelled"), with the APPROVE
 *      and REJECT buttons consumed.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.5\.9:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)
const APPROVAL_QTY = 20;       // Ordered Qty: 20 x $329 = $6,580 - inside the $4K-$10K single-rule band.

test.describe('CRM-12325_2.5.9 - O12 CE smoke: the requester can cancel his own pending-approval Quotation', () => {

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

  test('CRM-12325_2.5.9: Verify the Quotation requester can Cancel his own pending-approval Quotation on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    const TC_ID = 'CRM-12325_2.5.9';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let approvalState: O12cePendingApprovalResult | null = null;
    let orderNumber = '';
    let cancelOffered = false;
    let cancelMs = 0;
    let cancelPopup = '';
    let statusAfterCancel = '';
    let cancelCheck = {
      cancelled: false, setToQuotationVisible: false,
      approveButtonGone: false, rejectButtonGone: false, cancelButtonGone: false,
    };

    await loginToO12CE(page, users.sale_ic_thomas_crm_mig);
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

    await test.step('Step 13: Bring the Quotation to "Pending Approval"', async () => {
      console.log('\n--- Step 13: Reach Pending Approval ---');
      approvalState = await bringQuotationToPendingApprovalOnO12CE(page);
      orderNumber = await quotationPage.getSalesOrderNumber(CommonUtils.waitTimes.abnormalWait).catch(() => '');
      cancelOffered = await quotationPage.isCancelButtonVisible(CommonUtils.waitTimes.abnormalWait);
    });

    await test.step(`Steps run - Step 1 & 2: Stay logged in as ${users.sale_ic_thomas_crm_mig.displayName} (the requester) and press "Cancel"`, async () => {
      console.log(`\n--- Steps run - Step 2: Press Cancel as the requester (${users.sale_ic_thomas_crm_mig.displayName}) ---`);
      const result = await quotationPage.clickCancelQuotation(CommonUtils.waitTimes.abnormalWait);
      cancelMs = result.elapsedMs;
      cancelPopup = result.popupText;
      cancelCheck = await quotationPage.verifyQuotationCancelled(CommonUtils.waitTimes.abnormalWait);
    });

    await test.step('Steps run - Step 3: Read the Quotation state back', async () => {
      console.log('\n--- Steps run - Step 3: Re-read the state ---');
      // Server-fresh read, same reasoning as 2.5.7/2.5.8. The statusbar CAN show "Cancelled" (Odoo
      // always renders the current value even when it is outside statusbar_visible), so it is worth
      // reading - but it is treated as a second opinion next to the "Set to Quotation" marker.
      statusAfterCancel = await quotationPage.getQuotationStatusFromServer(CommonUtils.waitTimes.savingPage);
      cancelCheck = await quotationPage.verifyQuotationCancelled(CommonUtils.waitTimes.abnormalWait);
      console.log(`  Status after the requester's own Cancel: "${statusAfterCancel}"`);
    });

    await test.step('Verification', async () => {
      const pendingBefore = /pending/i.test(approvalState?.status ?? '');
      const statusSaysCancelled = /cancel/i.test(statusAfterCancel);
      // Two independent signals for the same state; either is enough, and the order must in any case
      // no longer read "Pending Approval".
      const leftPendingApproval = !/pending/i.test(statusAfterCancel);
      const cancelWorked = (cancelCheck.cancelled || statusSaysCancelled) && leftPendingApproval;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - Before the attempt the Quotation is "Pending Approval" and "Cancel" is offered:');
      console.log('     Expected : status contains "Pending" AND the Cancel button is visible');
      console.log(`     Actual   : "${approvalState?.status ?? ''}" | cancelOffered=${cancelOffered}`);
      console.log(`     Result   : ${pendingBefore && cancelOffered ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The requester\'s own "Cancel" works:');
      console.log('     Expected : the Quotation leaves "Pending Approval" and reads as cancelled');
      console.log(`     Actual   : status="${statusAfterCancel}" | setToQuotationVisible=${cancelCheck.setToQuotationVisible} | approveGone=${cancelCheck.approveButtonGone} | rejectGone=${cancelCheck.rejectButtonGone}`);
      console.log(`     Result   : ${cancelWorked ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Cancel elapsed: ${(cancelMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Info - Dialog raised by Cancel: "${cancelPopup || '(none)'}"`);
      console.log(`  Info - Quotation: ${orderNumber || '(number not read)'} | Ordered Qty=${APPROVAL_QTY} (20 x $329 = $6,580)`);
      console.log(`  Info - Requested AND cancelled by: ${users.sale_ic_thomas_crm_mig.displayName}`);
      console.log(`  Info - Opportunity: id=${opp?.oppId}`);
      console.log(`  Info - Quotation URL: ${approvalState?.quotationUrl ?? ''}`);
      console.log('===============================================');
      console.log(`OVERALL: ${pendingBefore && cancelOffered && cancelWorked ? 'PASS' : 'FAIL'} - the requester can cancel his own pending-approval Quotation on O12 CE`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - requester cancelled his own Quotation`);

      expect(
        pendingBefore,
        `the Quotation must be in "Pending Approval" before the cancel is attempted (status read back: "${approvalState?.status ?? ''}")`
      ).toBeTruthy();
      expect(
        cancelOffered,
        `the "Cancel" button must be offered to the requester on a pending-approval Quotation (${orderNumber}) - view 1365 declares it with states="approved,pending_approval"`
      ).toBeTruthy();
      expect(
        cancelWorked,
        `the requester (${users.sale_ic_thomas_crm_mig.displayName}) must be able to Cancel his own Quotation ${orderNumber} - it must leave "Pending Approval" and read as cancelled, but the status read back is "${statusAfterCancel}" (setToQuotationVisible=${cancelCheck.setToQuotationVisible}, approveGone=${cancelCheck.approveButtonGone}, rejectGone=${cancelCheck.rejectButtonGone}, dialog="${cancelPopup || '(none)'}")`
      ).toBeTruthy();
    });
  });
});
