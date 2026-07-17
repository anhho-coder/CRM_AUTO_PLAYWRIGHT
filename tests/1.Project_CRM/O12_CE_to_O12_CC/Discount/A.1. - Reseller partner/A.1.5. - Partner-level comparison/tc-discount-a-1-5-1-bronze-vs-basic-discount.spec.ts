import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  Discount / A.1. - Reseller partner / A.1.5. - Partner-level comparison
 * ===========================================================================
 *  Test Case ID    : Discount-A.1.5.1
 *  Jira            : N/A
 *  Automation-Type : new
 *  Automation-Date : 2026-07-13
 *
 *  Summary:
 *    Verify the partner discount is LEVEL-scoped, not hardcoded: the SAME product invoiced for a
 *    BRONZE-assigned deal is discounted 15%, while for a BASIC-assigned deal it is discounted 10%.
 *    (This spans two partner levels, so it lives at A.1 - Reseller partner, not inside A.1.2 - Bronze.)
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-A\.1\.5\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition A (Bronze): as Thomas, create + validate a single-product invoice with Assigned
 *    Partner = the BRONZE reseller (TEST-Reseller#Automation-Jun10). Capture gross Subtotal + NET Total.
 *  Pre-condition B (Basic):  as Thomas, create + validate a single-product invoice for the BASIC reseller
 *    (TEST-Reseller#1_Automation_Basic). NOTE: the discount level is driven by the Internal Note's
 *    "Partner Business Email" (the Basic reseller's), not the Assigned-Partner field. Capture gross + NET.
 *  Verification Point (back-office invoices):
 *    - Effective discount % = (1 - NET/gross) x 100.
 *    1. Bronze invoice discount % = 15.
 *    2. Basic invoice discount %  = 10.
 *    3. The two discounts DIFFER (Bronze > Basic) -> discount % is determined by the partner Level.
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const BRONZE_PARTNER = DEAL_REGISTRATION.partnerCompanyName;      // 'TEST-Reseller#Automation-Jun10' (Level Bronze -> 15%)
const BASIC_PARTNER = users.reseller_basic.displayName;          // 'TEST-Reseller#1_Automation_Basic' (Level Basic -> 10%)
const BRONZE_PERCENT = 15;
const BASIC_PERCENT = 10;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const effectivePct = (gross: number, net: number): number => (gross > 0 ? (1 - net / gross) * 100 : NaN);

test.describe('Discount-A.1.5.1 - Partner-level comparison: Bronze 15% vs Basic 10%', () => {
  let oppUrlBronze: string | null = null;
  let oppUrlBasic: string | null = null;

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
    await deleteCreatedOpportunityAsAdmin(page, oppUrlBronze, SKIP_CLEANUP_OPP, testInfo);
    await deleteCreatedOpportunityAsAdmin(page, oppUrlBasic, SKIP_CLEANUP_OPP, testInfo);
  });

  test('Discount-A.1.5.1: The same product is discounted 15% for a Bronze partner and 10% for a Basic partner', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2); // two invoices
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    let grossBronze = 0, netBronze = 0, grossBasic = 0, netBasic = 0;

    // Pre-condition A (Bronze): assign the Bronze reseller.
    const noteA = generateDealRegistrationNote();
    const invBronze = await createValidatedInvoiceAsThomas(page, {
      oppName: `TEST Discount-A.1.5.1-Bronze ${noteA.compactDateTime}`,
      contactName: noteA.leadName, companyEmail: noteA.companyEmail, internalNote: noteA.note,
      assignedPartner: BRONZE_PARTNER, stepPrefix: 'Pre-condition A (Bronze)',
    });
    oppUrlBronze = invBronze.oppUrl;

    await test.step('Pre-condition A: capture the Bronze invoice gross Subtotal + NET Total', async () => {
      grossBronze = money(await invoicePage.getFirstInvoiceLineSubtotal());
      netBronze = money(invBronze.invoiceTotal) || money(await invoicePage.getInvoiceTotal());
      console.log(`  - Bronze invoice "${invBronze.invoiceNumber}" gross=${grossBronze} net=${netBronze} -> ${effectivePct(grossBronze, netBronze).toFixed(2)}%`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition A - Bronze invoice validated');
      expect(grossBronze, 'Bronze gross should be > 0').toBeGreaterThan(0);
    });

    // Switch Thomas session cleanly, then Pre-condition B (Basic). The deal-registration discount is
    // derived from the NOTE's "Partner Business Email" (not the Assigned-Partner field), so the note
    // MUST carry the Basic reseller's company + business email to invoice at the Basic (10%) level.
    await loginPage.logout(baseUrl);
    await page.context().clearCookies();
    const noteB = generateDealRegistrationNote({
      partnerCompanyName: BASIC_PARTNER,
      partnerContactName: BASIC_PARTNER,
      partnerBusinessEmail: users.reseller_basic.username, // Test-Reseller@Reseller-company-automation-basic.com
    });
    const invBasic = await createValidatedInvoiceAsThomas(page, {
      oppName: `TEST Discount-A.1.5.1-Basic ${noteB.compactDateTime}`,
      contactName: noteB.leadName, companyEmail: noteB.companyEmail, internalNote: noteB.note,
      assignedPartner: BASIC_PARTNER, stepPrefix: 'Pre-condition B (Basic)',
    });
    oppUrlBasic = invBasic.oppUrl;

    await test.step('Pre-condition B: capture the Basic invoice gross Subtotal + NET Total', async () => {
      grossBasic = money(await invoicePage.getFirstInvoiceLineSubtotal());
      netBasic = money(invBasic.invoiceTotal) || money(await invoicePage.getInvoiceTotal());
      console.log(`  - Basic invoice "${invBasic.invoiceNumber}" gross=${grossBasic} net=${netBasic} -> ${effectivePct(grossBasic, netBasic).toFixed(2)}%`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition B - Basic invoice validated');
      expect(grossBasic, 'Basic gross should be > 0').toBeGreaterThan(0);
    });

    await test.step('Verification Point: Bronze = 15%, Basic = 10%, and the discounts differ (level-scoped)', async () => {
      const pctBronze = effectivePct(grossBronze, netBronze);
      const pctBasic = effectivePct(grossBasic, netBasic);
      console.log(`  - Bronze effective discount = ${pctBronze.toFixed(2)}% | Basic effective discount = ${pctBasic.toFixed(2)}% | same product gross: Bronze=${grossBronze} Basic=${grossBasic}`);

      // 1. Bronze invoice discount % = 15
      expect(pctBronze, 'Bronze invoice effective discount should be 15%').toBeCloseTo(BRONZE_PERCENT, 0);
      // 2. Basic invoice discount % = 10
      expect(pctBasic, 'Basic invoice effective discount should be 10%').toBeCloseTo(BASIC_PERCENT, 0);
      // 3. The discounts differ -> % is determined by the partner Level, not hardcoded
      expect(pctBronze, 'Bronze discount should be greater than Basic discount').toBeGreaterThan(pctBasic + 2);
      // Same product invoiced both times -> gross should match (sanity: it is the discount % that differs)
      expect(grossBasic, 'Both invoices used the same product, so the gross Subtotals should match').toBeCloseTo(grossBronze, 1);
      console.log('✅ Partner discount is level-scoped: Bronze 15% vs Basic 10% on the same product');
    });
  });
});
