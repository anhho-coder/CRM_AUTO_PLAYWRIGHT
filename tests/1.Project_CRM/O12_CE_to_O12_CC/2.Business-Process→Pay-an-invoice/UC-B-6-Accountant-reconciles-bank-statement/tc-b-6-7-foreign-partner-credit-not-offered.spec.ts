import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { OpportunityPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceForPartialPayment, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-b-3-partial-payment.helper';
import { createStandalonePaymentAsFaye } from '@helpers/uc-b-6-reconcile.helper';

/**
 * ===========================================================================
 *  UC-B-6  -  Accountant reconciles bank statement
 * ===========================================================================
 *  Test Case ID    : TC.-B.6.7
 *  Manual TC ID    : UC-B.6.7
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    Negative / partner-scoping check. Invoice#1 is billed to the Reseller. Faye pre-creates two
 *    standalone payments: one for the Reseller (JournalItem#R) and one for a DIFFERENT customer
 *    ("Company Name Lead 1", JournalItem#F). On Invoice#1 the Outstanding-credits section must list
 *    the Reseller credit (JournalItem#R) but must NOT offer the foreign-partner credit (JournalItem#F).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.6\.7:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 from the template, filling the <...> placeholders
 *    with fresh dynamic values each run (key fields, one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<compact date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - IP                         = 128.183.189.157
 *      - Country                    = United States
 *    (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *  Pre-condition #2 (as Thomas): validated single-product Invoice#1 (Payer = Reseller); note Invoice#1 + InvoiceTotal#1.
 *  Pre-condition #3 (as Faye): create JournalItem#R for the Reseller and JournalItem#F for a different customer.
 *  Steps to reproduce (as Faye):
 *    1. Open Invoice#1
 *    2. Inspect the "Outstanding credits" section
 *  Verification Point:
 *    1. JournalItem#R (Reseller credit) IS listed with an "Add" button
 *    2. JournalItem#F (foreign-partner credit) is NOT listed
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const FOREIGN_PARTNER = DEAL_REGISTRATION.companyName; // "Company Name Lead 1" - a customer distinct from the Reseller
const round2 = (n: number): number => Math.round(n * 100) / 100;

test.describe('TC.-B.6.7 - A foreign-partner credit is not offered on the invoice', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }, testInfo) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'beforeEach - cookies cleared').catch(() => {});
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const op = new OpportunityPage(page);
      await op.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('TC.-B.6.7: A credit for a different customer is not listed in the invoice Outstanding credits', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.6.7 ${compactDateTime}`;
    let invoiceUrl = '', invoiceNumber1 = '', journalItemR = '', journalItemF = '';
    let invoiceTotal1 = 0, amt = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`PC#1: Opp="${oppName}" Reseller="${DEAL_REGISTRATION.partnerCompanyName}" foreign="${FOREIGN_PARTNER}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    await test.step('Pre-condition #2: As Thomas, create the Opportunity and a validated single-product Invoice#1 (Payer = Reseller)', async () => {
      const setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl; invoiceUrl = setup.invoiceUrl; invoiceNumber1 = setup.invoiceNumber; invoiceTotal1 = setup.invoiceTotal;
      amt = round2(invoiceTotal1 * 0.5);
      console.log(`  - Invoice#1="${invoiceNumber1}" Total=${invoiceTotal1} credit amount=${amt}`);
      expect(invoiceTotal1).toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 validated');
    });

    await test.step('Pre-condition #3 (Reseller credit): As Faye, pre-create JournalItem#R for the Reseller', async () => {
      const r = await createStandalonePaymentAsFaye(page, { amount: amt.toFixed(2), partner: DEAL_REGISTRATION.partnerCompanyName, stepPrefix: 'Pre-condition #3 (Reseller credit)', paymentLabel: 'Payment#R' });
      journalItemR = r.journalItem;
    });

    await test.step(`Pre-condition #3 (foreign credit): Reusing Faye session, pre-create JournalItem#F for a different customer (${FOREIGN_PARTNER})`, async () => {
      const f = await createStandalonePaymentAsFaye(page, { amount: amt.toFixed(2), partner: FOREIGN_PARTNER, loginFirst: false, stepPrefix: 'Pre-condition #3 (foreign credit)', paymentLabel: 'Payment#F' });
      journalItemF = f.journalItem;
      console.log(`  - JournalItem#R="${journalItemR}" JournalItem#F="${journalItemF}"`);
      expect(journalItemR).not.toBe(journalItemF);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - Reseller + foreign credits created');
    });

    await test.step("Steps to reproduce - Step 1: Still in Faye's session, open Invoice#1", async () => {
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      expect(await invoicePage.getInvoiceNumber()).toBe(invoiceNumber1);
    });

    await test.step('Steps to reproduce - Step 2: Inspect the "Outstanding credits" section', async () => {
      const text = await invoicePage.getOutstandingCreditsText();
      console.log(`  - Outstanding credits: "${text}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Outstanding credits (partner-scoped)');
    });

    await test.step('Verification Point 1: JournalItem#R (Reseller credit) IS listed with an "Add" button', async () => {
      const present = await invoicePage.isOutstandingCreditPresent(journalItemR);
      expect(present, `The Reseller credit JournalItem#R ("${journalItemR}") should be offered`).toBeTruthy();
    });

    await test.step('Verification Point 2: JournalItem#F (foreign-partner credit) is NOT listed', async () => {
      const text = await invoicePage.getOutstandingCreditsText();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Foreign credit not offered');
      expect(text.includes(journalItemF), `The foreign-partner credit JournalItem#F ("${journalItemF}") must NOT be offered on the Reseller's invoice`).toBeFalsy();
      console.log('✅ Partner-scoping verified: Reseller credit offered, foreign-partner credit not offered');
    });
  });
});
