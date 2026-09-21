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
 * O12 CE Main-Business Smoke - Reseller and Distributor taken from the Opportunity
 * Test Case ID: CRM-12370_1.4.11
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Summary:
 *   Verify that an Opportunity carrying a Reseller and a Distributor produces a Deal Element whose
 *   Reseller and Distributor are those same two companies, and whose contact fields stay empty
 *   because neither company was given a contact.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.4.11 "Deal Element Reseller and Distributor from the Opportunity".
 *
 * O12 CE notes (grounded on crm-mig over XML-RPC, 2026-09-17):
 *   - The Deal Element form on O12 CE is the dedicated view `sale.order.deal.element.view.form`
 *     (id 2140, `create="false" delete="false"`) - the same view pre-production renders.
 *   - Reseller / Distributor use MIGRATED companies (the pre-production `TEST-*_Automation*` partners
 *     do not exist here): Reseller "Palomar SRL" (30142, Bronze) and Distributor
 *     "COMPUTER GROSS S.p.A." (143294, Distributor grade) - a pair already carried together by
 *     migrated lead 879560, so both pass the form's `is_company` domains. The spec only POINTS
 *     at them from a new Opportunity; it never edits a migrated record.
 *   - EXPECTED RED / VACUOUS GREEN - O12 CE does not render the label of an OPTIONAL field that is
 *     empty on the READONLY form: a saved Deal Element with no partners shows 12 labels, not 19
 *     (Distributor, Distributor contact, Reseller, Reseller contact, Confirmation Date and PO
 *     all drop out); EDIT mode renders them all. The spec keeps the pre-production read on the
 *     readonly form. NOTE the consequence: a check that an optional field IS EMPTY passes here
 *     because the widget is ABSENT, not because the value is empty - a VACUOUS green that this
 *     baseline deliberately accepts rather than adapt the read (run 2026-09-18-100823).
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
 *   8. Press "EDIT" on the saved Opportunity, set Reseller = Palomar SRL and
 *      Distributor = COMPUTER GROSS S.p.A., then press "SAVE".
 *   9. Create "DEAL ELEMENT" - press the "DEAL ELEMENT" button.
 *  10. On the "Deal Element" screen select Pricelist = Public Pricelist_USD and
 *      Payment Term = Immediate Payment.
 *  11. At "Order Lines" section - press "Add a product" and select the NAKIVO Backup product.
 *  12. Press "SAVE" button on the top page and wait for the saved (readonly) form.
 *  13. Read Reseller, Distributor and both contact fields back from the saved Deal Element.
 *
 * Verification Points:
 *   1. Reseller = the Reseller of the Opportunity.
 *   2. Distributor = the Distributor of the Opportunity.
 *   3. Reseller contact is empty.
 *   4. Distributor contact is empty.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.4\.11:" --project=MigSmoke
 */

const TC = 'CRM-12370_1.4.11';

// Migrated companies used as the Reseller / Distributor pair - see the docblock.
const PARTNERS = {
  reseller: 'Palomar SRL',
  distributor: 'COMPUTER GROSS S.p.A.',
};

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Reseller and Distributor from the Opportunity`, () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_1.4.11');
  });

  test('CRM-12370_1.4.11: Verify the Reseller and the Distributor are filled and match the Opportunity', async ({ page }, testInfo) => {
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

    await test.step('Step 8: Set the Reseller and the Distributor on the Opportunity', async () => {
      console.log('\n--- Step 8: Reseller + Distributor on the Opportunity ---');
      await opportunityPage.clickEdit();
      await opportunityPage.fillReseller(PARTNERS.reseller);
      await opportunityPage.fillDistributor(PARTNERS.distributor);
      await opportunityPage.saveAndWaitForCompletion();
      console.log(`  Reseller    : ${PARTNERS.reseller}`);
      console.log(`  Distributor : ${PARTNERS.distributor}`);
    });

    await addDealElementOnO12CE(page);
    dealElementUrl = page.url();
    registerMigRecordFromUrl(dealElementUrl, `Deal Element ${TC}`, 'sale.order');
    console.log(`  Deal Element saved: ${dealElementUrl}`);

    await test.step('Verification', async () => {
      const reseller = await dealElementPage.getFieldPartnerName('reseller_id');
      const distributor = await dealElementPage.getFieldPartnerName('distributor_id');
      const resellerContact = await dealElementPage.getFieldDisplayValue('reseller_contact_id');
      const distributorContact = await dealElementPage.getFieldDisplayValue('distributor_contact_id');

      record('Reseller = Opportunity Reseller', PARTNERS.reseller, reseller);
      record('Distributor = Opportunity Distributor', PARTNERS.distributor, distributor);
      record('Reseller contact', '(empty)', resellerContact === '' ? '(empty)' : resellerContact);
      record('Distributor contact', '(empty)', distributorContact === '' ? '(empty)' : distributorContact);
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Reseller and Distributor read back`);

      expect(reseller, 'the Reseller must come from the Opportunity').toBe(PARTNERS.reseller);
      expect(distributor, 'the Distributor must come from the Opportunity').toBe(PARTNERS.distributor);
      expect(resellerContact, 'the Reseller company carries no contact').toBe('');
      expect(distributorContact, 'the Distributor company carries no contact').toBe('');
    });
  });
});
