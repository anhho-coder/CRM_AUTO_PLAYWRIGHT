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
 * O12 CE Main-Business Smoke - the REQUESTER rejects his OWN Quotation
 * Test Case ID: CRM-12325_2.5.8
 * Automation-Type: new
 * Automation-Date: 2026-08-26
 *
 * Summary:
 *   Verify that on the O12 CE Migration server the sales IC who raised a high-value Quotation
 *   (Thomas Semerich) can resolve its approval HIMSELF by pressing "REJECT" in his own session - the
 *   Quotation leaves "Pending Approval" and its approval buttons are consumed.
 *
 * Source: the single-actor variant of TC.Performance.1.1.5.5 / CRM-12325_2.5.5 "Reject Quotation".
 * 2.5.5 has the manager (Max) reject from a second browser session; this one has the requester do it
 * alone. Sibling specs 2.5.7 (self APPROVE), 2.5.9 (self Cancel) and 2.5.10 (self Duplicate) cover
 * the other three buttons on the pending-approval header - all four are expected to WORK for the
 * requester.
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-26):
 *   - ONE account only: Thomas Semerich (`users.sale_ic_thomas_crm_mig`) builds the Quotation AND
 *     presses "REJECT". No approver session is opened.
 *   - Why the requester is a legitimate rejecter here, i.e. why this is a POSITIVE test: Thomas is a
 *     member of the "BDEU" sales team (crm.team id 156), so approval rule 64
 *     "All the quotations in BD over 4K" runs
 *         if record.amount_total_company_signed >= 4000: record.create_approvals(64)
 *     and rule 64 has THREE approval types - Anton Shelepchuk, Max Zaprykutenko AND Thomas Semerich
 *     (approval.type ids 49 / 54 / 327). The Quotation gets three `approval.approval` rows all at
 *     priority 0, one of them Thomas's own (SO177985 carried exactly that: rows 3514708/09/10, all
 *     `pending`, all priority 0). That is why the reference screenshot shows APPROVE and REJECT live
 *     in Thomas's own session even though the banner names Max.
 *   - Ordered Qty = 20 x $329 = $6,580 - the same value as 2.5.4 / 2.5.5 and the reference screenshot
 *     (SO177985), inside the $4K-$10K band so exactly ONE approval rule is in play and Thomas's
 *     single REJECT consumes the whole approval.
 *   - REJECT has one more hop than APPROVE: `action_wizard_reject` opens the `approval.wizard.reject`
 *     "Reject Reason" dialog, which `QuotationPage.clickReject()` fills in and submits. The reason
 *     text is not a verification point (pre-prod enters "TEST").
 *   - `button_rejected` is evaluated PER USER, so "REJECT is offered to Thomas" is itself a
 *     verification point, not scaffolding.
 *   - The status is re-read from a RELOADED form (`getQuotationStatusFromServer`): the wizard writes
 *     `state` server-side and an open Odoo 12 form does not re-read it, so a status taken from the
 *     live DOM can report the pre-click value.
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
 *   1. Stay logged in as the SAME account that raised the Quotation (Thomas Semerich) - do NOT open
 *      an approver session.
 *   2. Press the "REJECT" button, enter the reject reason in the dialog and press "REJECT" on the
 *      dialog.
 *   3. Read the Quotation status back.
 *
 * Verification Points:
 *   1. Before the attempt the Quotation status is "Pending Approval" and "REJECT" is offered to the
 *      requester.
 *   2. The requester's own "REJECT" is accepted - the pending-approval buttons (APPROVE and REJECT)
 *      are both consumed.
 *   3. The Quotation has left "Pending Approval".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.5\.8:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)
const APPROVAL_QTY = 20;       // Ordered Qty: 20 x $329 = $6,580 - inside the $4K-$10K single-rule band.

test.describe('CRM-12325_2.5.8 - O12 CE smoke: the requester rejects his own Quotation', () => {

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

  test('CRM-12325_2.5.8: Verify the Quotation requester can REJECT his own Quotation on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    const TC_ID = 'CRM-12325_2.5.8';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let approvalState: O12cePendingApprovalResult | null = null;
    let orderNumber = '';
    let rejectOffered = false;
    let rejectMs = 0;
    let statusAfterReject = '';
    let rejectionCheck = { rejected: false, approveButtonGone: false, rejectButtonGone: false, editButtonVisible: false };

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
      rejectOffered = await quotationPage.isRejectButtonVisible(CommonUtils.waitTimes.abnormalWait);
    });

    await test.step(`Steps run - Step 1 & 2: Stay logged in as ${users.sale_ic_thomas_crm_mig.displayName} (the requester), press "REJECT", enter the reason and press "REJECT" on the dialog`, async () => {
      console.log(`\n--- Steps run - Step 2: Press REJECT as the requester (${users.sale_ic_thomas_crm_mig.displayName}) ---`);
      rejectMs = await quotationPage.clickReject();
      rejectionCheck = await quotationPage.verifyRejectionSuccess(CommonUtils.waitTimes.abnormalWait);
    });

    await test.step('Steps run - Step 3: Read the Quotation status back', async () => {
      console.log('\n--- Steps run - Step 3: Re-read the status from the server ---');
      statusAfterReject = await quotationPage.getQuotationStatusFromServer(CommonUtils.waitTimes.savingPage);
      console.log(`  Status after the requester's own REJECT: "${statusAfterReject}"`);
    });

    await test.step('Verification', async () => {
      const pendingBefore = /pending/i.test(approvalState?.status ?? '');
      const leftPendingApproval = statusAfterReject !== '' && !/pending/i.test(statusAfterReject);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - Before the attempt the Quotation is "Pending Approval" and "REJECT" is offered:');
      console.log('     Expected : status contains "Pending" AND the REJECT button is visible');
      console.log(`     Actual   : "${approvalState?.status ?? ''}" | rejectOffered=${rejectOffered}`);
      console.log(`     Result   : ${pendingBefore && rejectOffered ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The requester\'s own "REJECT" is accepted:');
      console.log('     Expected : APPROVE gone AND REJECT gone');
      console.log(`     Actual   : approveGone=${rejectionCheck.approveButtonGone} | rejectGone=${rejectionCheck.rejectButtonGone} | editVisible=${rejectionCheck.editButtonVisible}`);
      console.log(`     Result   : ${rejectionCheck.rejected ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - The Quotation has left "Pending Approval":');
      console.log('     Expected : the server-read status no longer contains "Pending"');
      console.log(`     Actual   : "${statusAfterReject}"`);
      console.log(`     Result   : ${leftPendingApproval ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - REJECT elapsed: ${(rejectMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Info - Quotation: ${orderNumber || '(number not read)'} | Ordered Qty=${APPROVAL_QTY} (20 x $329 = $6,580)`);
      console.log(`  Info - Requested AND rejected by: ${users.sale_ic_thomas_crm_mig.displayName}`);
      console.log(`  Info - Opportunity: id=${opp?.oppId}`);
      console.log(`  Info - Quotation URL: ${approvalState?.quotationUrl ?? ''}`);
      console.log('===============================================');
      console.log(`OVERALL: ${pendingBefore && rejectOffered && rejectionCheck.rejected && leftPendingApproval ? 'PASS' : 'FAIL'} - the requester can reject his own Quotation on O12 CE`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - requester rejected his own Quotation`);

      expect(
        pendingBefore,
        `the Quotation must be in "Pending Approval" before the requester rejects it (status read back: "${approvalState?.status ?? ''}")`
      ).toBeTruthy();
      expect(
        rejectOffered,
        `the "REJECT" button must be offered to the requester (${users.sale_ic_thomas_crm_mig.displayName}) - he is one of rule 64's approvers, so button_rejected must be True on ${orderNumber}`
      ).toBeTruthy();
      expect(
        rejectionCheck.rejected,
        `the requester's own "REJECT" must consume the pending-approval state on ${orderNumber} (approveGone=${rejectionCheck.approveButtonGone}, rejectGone=${rejectionCheck.rejectButtonGone})`
      ).toBeTruthy();
      expect(
        leftPendingApproval,
        `after the requester's own "REJECT" the Quotation ${orderNumber} must leave "Pending Approval", but the server-read status is "${statusAfterReject}"`
      ).toBeTruthy();
    });
  });
});
