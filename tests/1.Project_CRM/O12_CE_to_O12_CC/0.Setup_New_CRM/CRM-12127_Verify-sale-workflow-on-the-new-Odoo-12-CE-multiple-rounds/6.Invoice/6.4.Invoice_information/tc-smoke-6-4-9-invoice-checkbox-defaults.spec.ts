import { test, expect, Page, TestInfo } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { HomePageMig } from '@pages/mig';
import { InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  confirmQuotationOnO12CE,
  createInvoiceOnO12CE,
  O12ceQuotationResult,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Invoice data verification - Checkbox defaults on new Invoice
 * Test Case ID: CRM-12370_6.4.9
 * Automation-Type: refactored
 * Automation-Date: 2026-09-22
 * Revised:         2026-10-13 - split into two account-matched scenarios (see CRM-13277 below).
 *
 * Objective: Verify checkbox defaults on a newly created Invoice, for an account WITHOUT and an
 * account WITH the Accounting & Finance / Billing Manager right.
 *
 * BASELINE RULE (tester's standing requirement): the assertions below are the PRE-PRODUCTION TC's
 * assertions, copied unchanged. Only the login account, the navigation path, the run marker and the
 * wait/timeout durations are adapted. Where O12 CE behaves differently this TC FAILS - that failure
 * IS the migration finding and must never be softened into a pass.
 *
 * WHY THIS TC NOW HAS TWO SCENARIOS (CRM-13277, resolved "Not a bug" 2026-10-02)
 *   The single-scenario version logged in as Thomas Semerich and asserted "Can Edit Actually
 *   Received" ticked, because the pre-production baseline showed it ticked. It failed on crm-mig.
 *   Khang Nguyen Thai Duy's comment on CRM-13277 established that the baseline invoices of
 *   2026-09-30 (INV/2026/11201..11208) had been created under Anh Ho, not under Thomas - so the old
 *   expectation compared two DIFFERENT accounts, and the red was an artefact of that mismatch, not
 *   of the migration. Expecting "unticked" for Thomas is therefore NOT a softened assertion: it is
 *   the account-matched baseline. The ticked case is still asserted - under the account the
 *   baseline was actually captured with.
 *
 * MEASURED ON crm-mig 2026-10-12 (both scenarios, full chain, paired screenshots):
 *   | account                    | res.groups                       | field rendered | ticked |
 *   | thomas.semerich@nakivo.com | Billing (32)                     | true           | false  |
 *   | anh.ho@nakivo.com          | Billing (32) + Bill. Manager (36) | true           | true   |
 *   BOTH accounts SEE the field - what differs is the value, not the visibility. View 2778 declares
 *   <field name="can_edit_actually_received" readonly="1"/> with NO `groups` attribute, so nothing
 *   hides it by right, and no account can toggle it by hand: it is a computed, read-only indicator
 *   of whether that user may edit "Actually Received". Both facts are asserted below so a later
 *   regression in either direction is caught.
 *   NOT verified by this spec: the equivalent group membership on pre-production. Khang's comment
 *   states Thomas lacks the right there too; that claim was not independently re-checked here.
 *
 * Source manual TC (pre-production): TC.Performance.6.4.9
 * (tests/1.Project_CRM/1.SalesReport_Performance/6.Invoice/6.4.Invoice_information). Section II ports
 * the pre-production Invoice data verification set to the O12 CE Migration server.
 *
 * O12 CE deviations vs the pre-production scenario (MECHANICAL only):
 *   - Scenario A logs in as the sales IC Thomas Semerich (`users.sale_ic_thomas_crm_mig`);
 *     scenario B logs in as Anh Ho (`users.admin_crm_mig`), the account the baseline was captured
 *     with.
 *   - The run marker is "TEST ..." instead of the pre-prod format.
 *   - Test timeout raised to config.timeouts.test (15 min).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and both accounts can log in.
 *
 * Steps (1-14 = the shared chain, run fresh for each scenario):
 *   1-7.  Login, open Opportunities list, CREATE + fill + SAVE Opportunity, wait for Contact.
 *   8-11. Press "DEAL ELEMENT", select Pricelist + Payment Term, add product, press "SAVE".
 *  12. Press "NEW QUOTATION" button and wait.
 *  13. Press "CONFIRM" button and wait for Sales Order.
 *  14. Press "CREATE INVOICE" button and "CREATE AND VIEW INVOICES".
 *
 * Steps run:
 *   1. Read the checkbox states.
 *
 * Verification Points - scenario A (Thomas Semerich, NO Billing Manager right):
 *   1. Certificate Required unticked.
 *   2. Can Edit Actually Received is RENDERED on the sheet.
 *   3. Can Edit Actually Received UNTICKED.
 *   4. Don't send license unticked.
 *   5. License Send unticked.
 *
 * Verification Points - scenario B (Anh Ho, HOLDS Billing Manager right):
 *   1. Certificate Required unticked.
 *   2. Can Edit Actually Received is RENDERED on the sheet.
 *   3. Can Edit Actually Received TICKED.
 *   4. Don't send license unticked.
 *   5. License Send unticked.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_6\.4\.9:" --project=chromium
 */

const SKIP_CLEANUP_OPP = false;

const TC_ID = 'CRM-12370_6.4.9';
const CAN_EDIT_FIELD = 'can_edit_actually_received';

const STEP = {
  s1: 'Steps 1-14: Login, create Opportunity, Deal Element, confirm Quotation, create Invoice',
  s2: 'Step 1: Verifying checkbox defaults',
};

/** The one account-dependent expectation this TC is built around. */
interface CheckboxScenario {
  /** Key in `users` - the account the whole chain runs under. */
  accountKey: 'sale_ic_thomas_crm_mig' | 'admin_crm_mig';
  /** The Accounting & Finance right that account holds on crm-mig, for the VERIFY banner. */
  rightSummary: string;
  /** Expected state of "Can Edit Actually Received" for that account. */
  expectCanEditTicked: boolean;
}

async function runCheckboxDefaultsScenario(
  page: Page,
  testInfo: TestInfo,
  scenario: CheckboxScenario,
): Promise<void> {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });

  const account = users[scenario.accountKey];
  let quotation: O12ceQuotationResult | null = null;

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
    console.log(`  Account  : ${account.username} (${account.displayName})`);
    console.log(`  Rights   : ${scenario.rightSummary}`);
    CHECKS.forEach((c, i) => {
      console.log(`  Verify #${i + 1} - ${c.what}:`);
      console.log(`     Expected : ${c.expected}`);
      console.log(`     Actual   : ${c.actual}`);
      console.log(`     Result   : ${c.pass ? 'PASS' : 'FAIL'}`);
    });
    console.log('===============================================');
    const passed = CHECKS.filter((c) => c.pass).length;
    console.log(`OVERALL: ${passed === CHECKS.length ? 'PASS' : 'FAIL'} - ${passed}/${CHECKS.length} checks matched`);
  };

  await test.step(STEP.s1, async () => {
    console.log(`\n--- ${STEP.s1} ---`);
    await loginToO12CE(page, account);
    await openOpportunitiesListOnO12CE(page);
    await createOpportunityOnO12CE(page, TC_ID);
    await addDealElementOnO12CE(page);
    quotation = await pressNewQuotationOnO12CE(page);
    // Setup gate - NOT this TC's assertion. On O12 CE "NEW QUOTATION" creates the Quotation in
    // place instead of navigating to it; the helper then looks the record up and puts the form on
    // it. This TC's setup only needs the form to BE on the Quotation, so it gates on
    // landedOnQuotation. Whether the button NAVIGATES is the subject of CRM-12370_6.1.1 and is
    // asserted there - gating on it here would make every screen-verification TC duplicate that
    // one finding and never reach its own checks.
    expect(
      quotation.landedOnQuotation,
      `the setup must land on the created Quotation so it can be confirmed (navigated=${quotation.navigated}, quotationId="${quotation.quotationId}", chatter: "${(quotation.chatterText || '').substring(0, 200)}")`
    ).toBeTruthy();
    await confirmQuotationOnO12CE(page);
    await createInvoiceOnO12CE(page);
  });

  await test.step(STEP.s2, async () => {
    console.log(`\n--- ${STEP.s2} ---`);
    const invoicePage = new InvoicePage(page);
    const certificateRequired = await invoicePage.isFieldChecked('require_certificate');
    // Visibility is read separately because isFieldChecked() returns false BOTH when the box is
    // unticked and when it is not rendered at all - without this read, Thomas's "unticked" pass
    // could be hiding a field that had vanished from the form.
    const canEditVisible = await invoicePage.isFieldVisibleOnSheet(CAN_EDIT_FIELD);
    const canEditActuallyReceived = await invoicePage.isFieldChecked(CAN_EDIT_FIELD);
    const dontSendLicense = await invoicePage.isFieldChecked('dont_send_license');
    const licenseSend = await invoicePage.isFieldChecked('license_send');
    console.log(`  - Certificate Required: ${certificateRequired}`);
    console.log(`  - Can Edit Actually Received (rendered): ${canEditVisible}`);
    console.log(`  - Can Edit Actually Received (ticked)  : ${canEditActuallyReceived}`);
    console.log(`  - Don't send license: ${dontSendLicense}`);
    console.log(`  - License Send: ${licenseSend}`);

    record('Certificate Required unticked', 'false', String(certificateRequired));
    record('Can Edit Actually Received rendered on the sheet', 'true', String(canEditVisible));
    record(
      `Can Edit Actually Received ${scenario.expectCanEditTicked ? 'ticked' : 'unticked'} for ${account.displayName}`,
      String(scenario.expectCanEditTicked),
      String(canEditActuallyReceived),
    );
    record('Don\'t send license unticked', 'false', String(dontSendLicense));
    record('License Send unticked', 'false', String(licenseSend));
    printVerify();

    let __verifyPassed = false;
    try {
      expect(certificateRequired, 'Certificate Required must be unticked').toBe(false);
      expect(
        canEditVisible,
        `Can Edit Actually Received must be rendered on the sheet for ${account.displayName} - the field carries no "groups" attribute, so it is visible regardless of the Billing Manager right`
      ).toBe(true);
      expect(
        canEditActuallyReceived,
        scenario.expectCanEditTicked
          ? `Can Edit Actually Received must be ticked for ${account.displayName}, who holds ${scenario.rightSummary}`
          : `Can Edit Actually Received must be unticked for ${account.displayName}, who holds only ${scenario.rightSummary}`
      ).toBe(scenario.expectCanEditTicked);
      expect(dontSendLicense, 'Don\'t send license must be unticked').toBe(false);
      expect(licenseSend, 'License Send must be unticked').toBe(false);
      __verifyPassed = true;
    } finally {
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - Invoice checkbox defaults - ${account.displayName}`,
        passed: __verifyPassed,
      }).catch(() => {});
    }
  });
}

test.describe('CRM-12370_6.4.9 - Checkbox defaults on new Invoice', () => {
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

  test.afterAll(async ({ browser }) => {
    // The sweep deletes by NAME MARKER, so it would wipe the records SKIP_CLEANUP_OPP was set to
    // keep - "keep what this run made" has to hold at both layers or the toggle does nothing.
    if (SKIP_CLEANUP_OPP) {
      console.log('[mig-sweep] SKIPPED by the spec toggle - records are being kept on purpose');
      return;
    }
    await sweepMigLeftoversAfterAll(browser, TC_ID);
  });

  test('CRM-12370_6.4.9: Verify checkbox defaults on new Invoice - WITHOUT the Billing Manager right (Thomas Semerich)', async ({ page }, testInfo) => {
    await runCheckboxDefaultsScenario(page, testInfo, {
      accountKey: 'sale_ic_thomas_crm_mig',
      rightSummary: 'Accounting & Finance / Billing (res.groups 32)',
      expectCanEditTicked: false,
    });
  });

  test('CRM-12370_6.4.9: Verify checkbox defaults on new Invoice - WITH the Billing Manager right (Anh Ho)', async ({ page }, testInfo) => {
    await runCheckboxDefaultsScenario(page, testInfo, {
      accountKey: 'admin_crm_mig',
      rightSummary: 'Accounting & Finance / Billing Manager (res.groups 36)',
      expectCanEditTicked: true,
    });
  });
});
