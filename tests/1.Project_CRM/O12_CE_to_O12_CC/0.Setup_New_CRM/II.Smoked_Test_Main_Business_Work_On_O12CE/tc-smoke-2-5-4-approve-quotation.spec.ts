import { test, expect, BrowserContext, Page } from '@playwright/test';
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
  openApproverSessionOnO12CE,
  O12ceOpportunity,
  O12ceQuotationResult,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Approve a Quotation
 * Test Case ID: CRM-12325_2.5.4
 * Automation-Type: refactored
 * Automation-Date: 2026-08-26
 *
 * Summary:
 *   Verify the Quotation approval workflow works on the O12 CE Migration server - a high-value
 *   Quotation sent "TO APPROVE" enters Pending Approval and can then be APPROVED.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.5.4 "Approve Quotation" (Ordered Qty = 30).
 * Section II ports it as a FUNCTIONAL smoke (elapsed time printed for reference; the gate is the
 * state transition).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-26):
 *   - TWO accounts, exactly as on pre-prod: the sales IC Thomas Semerich
 *     (`users.sale_ic_thomas_crm_mig`) builds the Quotation and presses "TO APPROVE", then the
 *     manager Max Zaprykutenko (`users.manager_max_crm_mig`) opens the SAME Quotation URL in a
 *     second browser context and presses "APPROVE". (Both accounts were provisioned on the
 *     Migration server on 2026-08-25; the earlier single-Admin workaround is gone.)
 *   - The routing is deterministic, not incidental: Thomas is a member of the "BDEU" sales team
 *     (crm.team id 156), so the Quotation carries team_id = BDEU and approval rule 64
 *     "All the quotations in BD over 4K" runs
 *         if record.amount_total_company_signed >= 4000: record.create_approvals(64)
 *     whose approvers are Anton Shelepchuk, MAX ZAPRYKUTENKO and Thomas Semerich.
 *   - sale.order on crm-mig carries the NAKIVO approval states `pending_approval` ("Pending Approval")
 *     and `approved` ("Approved"), so both transitions are assertable.
 *   - Ordered Qty = 30 (as on pre-prod) x $329 = $9,870 lands inside the $4K-$10K band on purpose:
 *     above rule 64's $4K trigger, below rule 105/141 ("BD team over 10K" -> Anton) and below
 *     rule 38 ("Quote amount >= $20K" -> Bruce Talley). MAX IS THEN THE ONLY APPROVER NEEDED, so a
 *     single APPROVE click clears the whole approval.
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the sales IC account Thomas Semerich can log in
 *   (CRM-12325_1.1.1).
 *
 * Steps (1-11 = the shared Opportunity + Deal Element chain):
 *   1-7.  Login, open the Opportunities list, CREATE + fill + SAVE the Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add a product with Ordered Qty = 30,
 *         press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *
 * Steps run:
 *   1. Press "TO APPROVE" button.
 *   2. Copy the URL.
 *   3. Open another browser and login as the Max account.
 *   4. Paste the URL at step#2 to open the Quotation.
 *   5. Play as the Max account and press "APPROVE" button.
 *
 * Verification Points:
 *   1. After "TO APPROVE" the Quotation status is "Pending Approval".
 *   2. After Max presses "APPROVE" the approval is consumed (the APPROVE button is gone and a
 *      forward action - CONFIRM / SEND BY EMAIL - is available).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.5\.4:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)
const APPROVAL_QTY = 30;       // Ordered Qty, as on pre-prod: 30 x $329 = $9,870.
// Why 30 and not more: the Quotation must need approval from MAX ALONE.
//   rule  64 "All the quotations in BD over 4K"  -> >= $4,000  -> Anton / MAX / Thomas   (want it)
//   rule 105/141 "BD team over 10K"              -> >= $10,000 -> Anton                  (avoid)
//   rule  38 "Quote amount >= $20K"              -> >= $20,000 -> Bruce / Anton / Rita   (avoid)
// $9,870 sits inside [$4,000, $10,000), so exactly one approval line is created and Max's single
// APPROVE clears it. Raising the qty re-introduces approvers Max cannot act for.
// (The previous qty 100 = $32,900 fired rule 38 instead - Max is not on that rule, so the APPROVE
// button kept its o_invisible_modifier and 2.5.4 timed out waiting for it.)

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

  test('CRM-12325_2.5.4: Verify a Quotation can be approved on the O12 CE Migration server', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    const TC_ID = 'CRM-12325_2.5.4';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let statusAfterToApprove = '';
    let statusAfterApprove = '';
    let approveMs = 0;
    let quotationUrl = '';
    // `test.step` returns its callback value, so the approver session is a plain const - no closure
    // assignment, which keeps TypeScript's control-flow narrowing honest in the finally block.
    let session: { approverPage: Page; approverContext: BrowserContext } | undefined;
    let approvalCheck = { approved: false, approveButtonGone: false, toApproveButtonGone: false, confirmVisible: false, sendByEmailVisible: false };

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

    await test.step('Steps run - Step 1 & 2: Press "TO APPROVE" button and copy the URL', async () => {
      console.log('\n--- Steps run - Step 1: Press TO APPROVE (as Thomas) ---');
      await quotationPage.clickToApprove(CommonUtils.waitTimes.abnormalWait);

      // clickToApprove() returns as soon as the click lands, so the statusbar can still read
      // "Quotation" while the server is writing state=pending_approval. Poll until it flips instead
      // of reading once - a single read came back "Quotation" while SO177974 was already
      // pending_approval server-side and the whole TC failed on a stale read. Bounded, so a
      // quotation that genuinely never enters approval still fails.
      const approvalDeadline = Date.now() + CommonUtils.waitTimes.reAssignationWait;
      do {
        statusAfterToApprove = await quotationPage.getQuotationStatus().catch(() => '');
        if (/pending|approv/i.test(statusAfterToApprove)) break;
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      } while (Date.now() < approvalDeadline);

      quotationUrl = page.url();
      console.log(`  Status after TO APPROVE : "${statusAfterToApprove}"`);
      console.log(`  Quotation URL (step#2)  : ${quotationUrl}`);
      expect(
        /[?#&]id=\d+/.test(quotationUrl),
        `the Quotation URL must carry a record id so the approver session can open it (read back: ${quotationUrl})`
      ).toBeTruthy();
    });

    await test.step(`Steps run - Step 3 & 4: Open another browser, login as ${users.manager_max_crm_mig.displayName} and open the Quotation`, async () => {
      session = await openApproverSessionOnO12CE(browser, quotationUrl, users.manager_max_crm_mig);
      return session;
    });

    await test.step(`Steps run - Step 5: Play as the ${users.manager_max_crm_mig.displayName} account and press "APPROVE" button`, async () => {
      console.log('\n--- Steps run - Step 5: Press APPROVE (as Max) ---');
      const approverQuotationPage = new QuotationPage(session!.approverPage);
      approveMs = await approverQuotationPage.clickApprove();
      approvalCheck = await approverQuotationPage.verifyApprovalSuccess(CommonUtils.waitTimes.abnormalWait);
      statusAfterApprove = await approverQuotationPage.getQuotationStatus().catch(() => '');
      console.log(`  APPROVE elapsed        : ${(approveMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Status after APPROVE   : "${statusAfterApprove}"`);
    });

    try {
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
      console.log(`  Info - Requested by: ${users.sale_ic_thomas_crm_mig.displayName} | Approved by: ${users.manager_max_crm_mig.displayName}`);
      console.log(`  Info - Quotation URL: ${quotationUrl}`);
      console.log(`  Info - APPROVE elapsed: ${(approveMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${pendingOk && approvalCheck.approved ? 'PASS' : 'FAIL'} - Quotation approval on the O12 CE Migration server`);

      // The approval happened in the Max session, so the evidence screenshot comes from that page.
      await CommonUtils.captureAndAttachScreenshot(session?.approverPage ?? page, testInfo, `${TC_ID} - Quotation approved on O12 CE`);

      expect(pendingOk, `"TO APPROVE" must move the O12 CE Quotation into Pending Approval (status read back: "${statusAfterToApprove}")`).toBeTruthy();
      expect(approvalCheck.approved, `"APPROVE" must complete the O12 CE approval (approveGone=${approvalCheck.approveButtonGone}, confirm=${approvalCheck.confirmVisible}, sendByEmail=${approvalCheck.sendByEmailVisible})`).toBeTruthy();
      });
    } finally {
      // Always close the approver browser context, including when the verification failed.
      await session?.approverContext.close().catch(() => {});
    }
  });
});
