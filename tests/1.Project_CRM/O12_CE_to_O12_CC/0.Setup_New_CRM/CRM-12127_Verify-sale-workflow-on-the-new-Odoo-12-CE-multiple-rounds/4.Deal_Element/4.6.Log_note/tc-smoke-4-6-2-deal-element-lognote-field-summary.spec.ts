import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { DealElementPage, OpportunityPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  registerMigRecordFromUrl,
  O12CE_DATA,
  O12ceOpportunity,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Log note - the creation summary
 * Test Case ID: CRM-12370_4.6.2
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Summary:
 *   Verify the creation note that summarises the Deal Element reports the same Payer, End User,
 *   Salesperson, Status and Total as the record itself.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.4.25 "Deal Element log note field summary".
 *
 * O12 CE notes (grounded on crm-mig over XML-RPC, 2026-09-17):
 *   - The Deal Element form on O12 CE is the dedicated view `sale.order.deal.element.view.form`
 *     (id 2140, `create="false" delete="false"`) - the same view pre-production renders.
 *   - EXPECTED RED - O12 CE renders the Order Lines column headers in UPPERCASE ("PRODUCT",
 *     "SUBTOTAL") where pre-production renders title case ("Product", "Subtotal"), and it
 *     renders Ordered Qty as "1.000" where pre-production renders "1". Because
 *     getOrderLineRowCells() keys each cell on its header, the casing difference also makes
 *     every cell read come back undefined. The pre-production captions and formats are kept,
 *     so this spec is EXPECTED TO FAIL on O12 CE (run 2026-09-18-100823).
 *   - EXPECTED RED - the second creation note has an EMPTY body on O12 CE and carries the five
 *     values as TRACKED values (Payer / End User / Salesperson / Total / Status), where
 *     pre-production writes them into the note body as "<key>: <value>" lines. This spec keeps
 *     the pre-production read (match /^Payer:/m, then parseLogNoteFields) and is EXPECTED TO
 *     FAIL on O12 CE until the note is written the same way.
 *   - Salesperson in the note is `users.admin_crm_mig.createdByName` ("Ho Quoc Anh"), not `displayName`;
 *     Status reads "Quotation" and Total the order line amount (329.00 for one line).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Open "CRM" and switch to the Opportunities list view.
 *   3. On the "Opp" page, click at "CREATE" button.
 *   4. Enter the opportunity information (Country = United States, State = Connecticut, Sales Team and
 *      Salesperson cleared, "Create manually" FALSE).
 *   5. Click at "CRM Developer" tab at the bottom of page (Lead form = License).
 *   6. Press "SAVE" button.
 *   7. Refresh page to see the "Contact" field is entered.
 *   8. Create "DEAL ELEMENT" - press the "DEAL ELEMENT" button.
 *   9. On the "Deal Element" screen select Pricelist = Public Pricelist_USD and
 *      Payment Term = Immediate Payment.
 *  10. At "Order Lines" section - press "Add a product" and select the NAKIVO Backup product.
 *  11. Press "SAVE" button on the top page and wait for the saved (readonly) form.
 *  12. Read the creation summary note of the saved Deal Element and compare it with the record.
 *
 * Verification Points:
 *   1. Payer in the note = the Company of the Opportunity.
 *   2. End User in the note = the Company of the Opportunity.
 *   3. Salesperson in the note = the account that created the Deal Element.
 *   4. Status in the note = Quotation.
 *   5. Total in the note = the Subtotal of the order line.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_1\.4\.25:" --project=MigSmoke
 */

const TC = 'CRM-12370_4.6.2';

const SKIP_CLEANUP_OPP = process.env.SKIP_CLEANUP_OPP === 'true'; // default false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Log note - creation summary`, () => {

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
    await teardownMigRecords(page, SKIP_CLEANUP_OPP);
  });

  // CLAUDE.md crm-mig rule: the afterAll sweep also removes what a dying test created but never
  // got to register. Opens its own session, so it costs one extra login per spec file.
  test.afterAll(async ({ browser }) => {
    if (SKIP_CLEANUP_OPP) {
      console.log('[mig-sweep] SKIPPED by SKIP_CLEANUP_OPP=true - records KEPT on O12 CE for hand-inspection.');
      return;
    }
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_4.6.2');
  });

  test('CRM-12370_4.6.2: Verify the creation summary note reports the same values as the Deal Element', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const dealElementPage = new DealElementPage(page);
    const opportunityPage = new OpportunityPage(page);

    let opp: O12ceOpportunity | null = null;
    let dealElementUrl = '';

    // The VERIFY block printed before the expect()s, so a failing check still reaches stdout.
    const CHECKS: Array<{ what: string; expected: string; actual: string; pass: boolean }> = [];
    const record = (what: string, expected: unknown, actual: unknown, pass?: boolean) => {
      const expectedText = String(expected);
      const actualText = String(actual);
      CHECKS.push({
        what,
        expected: expectedText,
        actual: actualText,
        pass: pass === undefined ? expectedText === actualText : pass,
      });
    };
    const printVerify = () => {
      console.log('==================== VERIFY ====================');
      CHECKS.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.pass ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      const passed = CHECKS.filter((c) => c.pass).length;
      console.log(
        `OVERALL: ${passed === CHECKS.length ? 'PASS' : 'FAIL'} - ${passed}/${CHECKS.length} checks matched`
      );
    };

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC);
    const oppCompany = opp.companyValue;

    await addDealElementOnO12CE(page);
    dealElementUrl = page.url();
    registerMigRecordFromUrl(dealElementUrl, `Deal Element ${TC}`, 'sale.order');
    console.log(`  Deal Element saved: ${dealElementUrl}`);

    await test.step('Verification', async () => {
      let __verifyPassed = false;
      try {
        const raw = await dealElementPage.waitForChatterMessage(/^Payer:/m);
        expect(raw, 'the chatter must carry the field summary note').not.toBeNull();
        const fields = dealElementPage.parseLogNoteFields(raw as string);
        console.log('Log note read:');
        (raw as string).split('\n').forEach((l) => console.log(`   | ${l}`));

        await dealElementPage.clickOrderLinesTab();
        const line = await dealElementPage.getOrderLineRowCells(0);
        const lineSubtotal = parseFloat((line['Subtotal'] || '').replace(/[^0-9.]/g, ''));
        const notedTotal = parseFloat((fields['Total'] || '').replace(/[^0-9.]/g, ''));
        const salesperson = users.admin_crm_mig.createdByName;

        record('Payer in the note', oppCompany, fields['Payer'] || '(missing)');
        record('End User in the note', oppCompany, fields['End User'] || '(missing)');
        record('Salesperson in the note', salesperson, fields['Salesperson'] || '(missing)');
        record('Status in the note', 'Quotation', fields['Status'] || '(missing)');
        record('Total in the note', String(lineSubtotal), String(notedTotal));
        printVerify();

        expect(fields['Payer'], 'Payer in the note').toBe(oppCompany);
        expect(fields['End User'], 'End User in the note').toBe(oppCompany);
        expect(fields['Salesperson'], 'Salesperson in the note').toBe(salesperson);
        expect(fields['Status'], 'Status in the note').toBe('Quotation');
        expect(notedTotal, 'Total in the note must match the Order Lines').toBeCloseTo(lineSubtotal, 0);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Creation summary note`, passed: __verifyPassed }).catch(() => {});
      }
    });
  });
});
