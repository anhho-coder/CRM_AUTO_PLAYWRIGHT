import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  Discount / A.1. - Reseller partner / A.1.2. - Bronze level / A.1.2.2. - Discount through the sales pipeline
 * ===========================================================================
 *  Test Case ID    : Discount-A.1.2.2.3
 *  Jira            : N/A
 *  Automation-Type : new
 *  Automation-Date : 2026-07-13
 *
 *  Summary:
 *    For a Bronze (15%) reseller, verify the invoice's 15% Partner Discount survives the back-office
 *    invoice state transitions: Open (posted) -> Cancel -> Reset to Draft. At every state the NET Total
 *    stays = line gross Subtotal x 0.85 (the discount is neither dropped nor re-applied).
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-A\.1\.2\.2\.3:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED (Open) single-product Bronze invoice as Thomas. Capture the line
 *    gross Subtotal#1 and the NET Total#1 (= Subtotal#1 x 0.85).
 *  Steps to reproduce (as Thomas, on the back-office invoice):
 *    1. Confirm the Open invoice shows the discount (Total = Subtotal x 0.85).
 *    2. Cancel -> status Cancelled; the discounted Total is unchanged.
 *    3. Reset to Draft -> status Draft; the discounted Total is unchanged.
 *  Verification Point:
 *    - Status transitions Open -> Cancel -> Draft as expected, and the NET Total stays
 *      = Subtotal#1 x 0.85 at every readable state (Bronze 15% discount persists).
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const BRONZE_PERCENT = 15;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('Discount-A.1.2.2.3 - Bronze discount survives the invoice state lifecycle', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const inv = new InvoicePage(page);
      await inv.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('Discount-A.1.2.2.3: The 15% Partner Discount persists across Open -> Cancel -> Draft', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Discount - Discount-A.1.2.2.3 - ${compactDateTime}`;

    let subtotal1 = 0;
    const expectNet = () => subtotal1 * (1 - BRONZE_PERCENT / 100);

    // Pre-condition: create + validate the invoice as Thomas (page stays on the Open invoice form).
    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Pre-condition',
    });
    createdOppUrl = invoice.oppUrl;

    await test.step('Steps to reproduce - Step 1: Open invoice shows the discount (Total = Subtotal x 0.85)', async () => {
      subtotal1 = money(await invoicePage.getFirstInvoiceLineSubtotal());
      const total = money(await invoicePage.getInvoiceTotal());
      const status = await invoicePage.getInvoiceStatus();
      console.log(`  - [Open] Subtotal#1=${subtotal1} Total=${total} (expect ${expectNet().toFixed(2)}) status="${status}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Open invoice (discounted)');
      expect(subtotal1, 'Subtotal#1 should be > 0').toBeGreaterThan(0);
      expect(status, 'Invoice should be Open/Posted').toMatch(/Open|Posted/i);
      expect(total, '[Open] Total should be Subtotal x 0.85').toBeCloseTo(expectNet(), 1);
    });

    await test.step('Steps to reproduce - Step 2: Cancel -> status Cancelled; discounted Total unchanged', async () => {
      await invoicePage.clickCancelInvoice();
      await invoicePage.dismissErrorDialog().catch(() => {});
      const status = await invoicePage.waitForInvoiceStatus('Cancel'); // poll+reload (status updates async)
      const total = money(await invoicePage.getInvoiceTotal());
      console.log(`  - [After Cancel] status="${status}" Total=${total}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - After Cancel');
      expect(status, 'Invoice should be Cancelled').toMatch(/Cancel/i);
      expect(total, '[After Cancel] Total should still be Subtotal x 0.85').toBeCloseTo(expectNet(), 1);
    });

    await test.step('Steps to reproduce - Step 3: Reset to Draft -> status Draft; discounted Total unchanged', async () => {
      await invoicePage.clickSetToDraft();
      await invoicePage.dismissErrorDialog().catch(() => {});
      const status = await invoicePage.waitForInvoiceStatus('Draft'); // poll+reload
      const total = money(await invoicePage.getInvoiceTotal());
      console.log(`  - [After Reset to Draft] status="${status}" Total=${total}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - After Reset to Draft');
      expect(status, 'Invoice should be Draft').toMatch(/Draft/i);
      expect(total, '[After Draft] Total should still be Subtotal x 0.85').toBeCloseTo(expectNet(), 1);
      console.log('✅ The Bronze 15% discount persisted across Open -> Cancel -> Draft');
    });
  });
});
