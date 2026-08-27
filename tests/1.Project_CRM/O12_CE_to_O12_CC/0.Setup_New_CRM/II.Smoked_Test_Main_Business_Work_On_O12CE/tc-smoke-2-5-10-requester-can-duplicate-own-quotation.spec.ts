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
 * O12 CE Main-Business Smoke - the REQUESTER CAN Duplicate his own pending-approval Quotation
 * Test Case ID: CRM-12325_2.5.10
 * Automation-Type: new
 * Automation-Date: 2026-08-26
 *
 * Summary:
 *   The last of the four buttons the requester sees on a pending-approval Quotation header. The
 *   sales IC who raised a high-value Quotation (Thomas Semerich) can duplicate it himself -
 *   "Duplicate" must produce a NEW, separate Quotation while leaving the original waiting for its
 *   approval.
 *
 * Sibling specs (all four buttons work for the requester): 2.5.7 (self APPROVE), 2.5.8 (self
 * REJECT), 2.5.9 (self Cancel).
 *
 * O12 CE notes (grounded on crm-mig, 2026-08-26):
 *   - ONE account only: Thomas Semerich (`users.sale_ic_thomas_crm_mig`) builds the Quotation AND
 *     presses "Duplicate".
 *   - Ordered Qty = 20 x $329 = $6,580 - the same value as 2.5.4 / 2.5.5 and the reference screenshot
 *     (SO177985), so approval rule 64 "All the quotations in BD over 4K" is the only rule in play and
 *     the original really is waiting for approval when Duplicate is pressed.
 *   - "Duplicate" is `action_duplicate`, added by sale.order form view 1398 with NO attrs - i.e. it
 *     is ALWAYS shown, in every state and to every user. The SAME view sets create="false" on the
 *     form, so Duplicate is the sanctioned way to copy a Quotation on O12 CE; that is what makes
 *     this an intentional capability rather than an accident of the approval workflow.
 *   - The copy is detected by the form's RECORD ID changing, never by the URL model: a Quotation, its
 *     Deal Element and its copy are all `sale.order`, so a model-only wait would match instantly and
 *     report a duplication that never happened (the same trap `pressNewQuotationOnO12CE` documents).
 *   - The original is re-opened by URL afterwards and re-read, so "the copy exists" and "the original
 *     is untouched" are two separate, independent assertions.
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
 *   2. Press the "Duplicate" button on the Quotation header.
 *   3. Read the copy back (record id + number + status).
 *   4. Re-open the ORIGINAL Quotation by its URL and read its status back.
 *
 * Verification Points:
 *   1. Before the attempt the Quotation status is "Pending Approval" and "Duplicate" is offered to
 *      the requester.
 *   2. "Duplicate" works for the requester - the form lands on a DIFFERENT sale.order record, which
 *      is a fresh draft "Quotation".
 *   3. The ORIGINAL Quotation is untouched - it is still "Pending Approval".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.5\.10:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)
const APPROVAL_QTY = 20;       // Ordered Qty: 20 x $329 = $6,580 - inside the $4K-$10K single-rule band.

test.describe('CRM-12325_2.5.10 - O12 CE smoke: the requester can duplicate his own pending-approval Quotation', () => {

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

  test('CRM-12325_2.5.10: Verify the Quotation requester can Duplicate his own pending-approval Quotation on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    const TC_ID = 'CRM-12325_2.5.10';
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let approvalState: O12cePendingApprovalResult | null = null;
    let originalNumber = '';
    let duplicateOffered = false;
    let copy = { sourceRecordId: '', newRecordId: '', navigated: false, elapsedMs: 0, popupText: '' };
    let copyNumber = '';
    let copyStatus = '';
    let originalStatusAfter = '';

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
      originalNumber = await quotationPage.getSalesOrderNumber(CommonUtils.waitTimes.abnormalWait).catch(() => '');
      duplicateOffered = await quotationPage.isDuplicateButtonVisible(CommonUtils.waitTimes.abnormalWait);
    });

    await test.step(`Steps run - Step 1 & 2: Stay logged in as ${users.sale_ic_thomas_crm_mig.displayName} (the requester) and press "Duplicate"`, async () => {
      console.log(`\n--- Steps run - Step 2: Press Duplicate as the requester (${users.sale_ic_thomas_crm_mig.displayName}) ---`);
      copy = await quotationPage.clickDuplicateQuotation(CommonUtils.waitTimes.abnormalWait);
    });

    await test.step('Steps run - Step 3: Read the copy back', async () => {
      console.log('\n--- Steps run - Step 3: Read the copy ---');
      if (copy.navigated) {
        copyNumber = await quotationPage.getSalesOrderNumber(CommonUtils.waitTimes.abnormalWait).catch(() => '');
        copyStatus = await quotationPage.getQuotationStatus().catch(() => '');
      }
      console.log(`  Copy record id : ${copy.newRecordId || '(none)'}`);
      console.log(`  Copy number    : ${copyNumber || '(not read)'}`);
      console.log(`  Copy status    : "${copyStatus}"`);
    });

    await test.step('Steps run - Step 4: Re-open the ORIGINAL Quotation and read its status back', async () => {
      console.log('\n--- Steps run - Step 4: Re-open the original ---');
      await page.goto(approvalState?.quotationUrl ?? '');
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.savingPage).catch(() => {});
      originalStatusAfter = await quotationPage.getQuotationStatus().catch(() => '');
      console.log(`  Original status after the Duplicate: "${originalStatusAfter}"`);
    });

    await test.step('Verification', async () => {
      const pendingBefore = /pending/i.test(approvalState?.status ?? '');
      const copyIsDifferentRecord = copy.navigated && copy.newRecordId !== copy.sourceRecordId;
      const copyIsDraftQuotation = /^quotation$/i.test(copyStatus.trim());
      const duplicateWorked = copyIsDifferentRecord && copyIsDraftQuotation;
      const originalUntouched = /pending/i.test(originalStatusAfter);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - Before the attempt the Quotation is "Pending Approval" and "Duplicate" is offered:');
      console.log('     Expected : status contains "Pending" AND the Duplicate button is visible');
      console.log(`     Actual   : "${approvalState?.status ?? ''}" | duplicateOffered=${duplicateOffered}`);
      console.log(`     Result   : ${pendingBefore && duplicateOffered ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The requester\'s own "Duplicate" produces a NEW draft Quotation:');
      console.log('     Expected : the form lands on a different sale.order id whose status is "Quotation"');
      console.log(`     Actual   : sourceId=${copy.sourceRecordId || '(none)'} | copyId=${copy.newRecordId || '(unchanged)'} | copyNumber=${copyNumber || '(not read)'} | copyStatus="${copyStatus}"`);
      console.log(`     Result   : ${duplicateWorked ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - The ORIGINAL Quotation is untouched:');
      console.log('     Expected : the original is STILL "Pending Approval"');
      console.log(`     Actual   : "${originalStatusAfter}"`);
      console.log(`     Result   : ${originalUntouched ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Duplicate elapsed: ${(copy.elapsedMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Info - Popup raised by Duplicate: "${copy.popupText || '(none)'}"`);
      console.log(`  Info - Original Quotation: ${originalNumber || '(number not read)'} | Ordered Qty=${APPROVAL_QTY} (20 x $329 = $6,580)`);
      console.log(`  Info - Requested AND duplicated by: ${users.sale_ic_thomas_crm_mig.displayName}`);
      console.log(`  Info - Opportunity: id=${opp?.oppId}`);
      console.log(`  Info - Original Quotation URL: ${approvalState?.quotationUrl ?? ''}`);
      console.log('===============================================');
      console.log(`OVERALL: ${pendingBefore && duplicateOffered && duplicateWorked && originalUntouched ? 'PASS' : 'FAIL'} - the requester can duplicate his own pending-approval Quotation on O12 CE`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - requester duplicated his own Quotation`);

      expect(
        pendingBefore,
        `the Quotation must be in "Pending Approval" before the duplicate is attempted (status read back: "${approvalState?.status ?? ''}")`
      ).toBeTruthy();
      expect(
        duplicateOffered,
        `the "Duplicate" button must be offered to the requester (view 1398 adds action_duplicate with no attrs, so it is always shown) - Quotation ${originalNumber}`
      ).toBeTruthy();
      expect(
        duplicateWorked,
        `"Duplicate" must open a NEW draft Quotation for the requester (${users.sale_ic_thomas_crm_mig.displayName}) - source id ${copy.sourceRecordId || '(none)'}, id after the click ${copy.newRecordId || '(unchanged)'}, copy status "${copyStatus}" (popup="${copy.popupText || '(none)'}")`
      ).toBeTruthy();
      expect(
        originalUntouched,
        `duplicating must NOT touch the original Quotation ${originalNumber} - it must still be "Pending Approval", but it reads "${originalStatusAfter}"`
      ).toBeTruthy();
    });
  });
});
