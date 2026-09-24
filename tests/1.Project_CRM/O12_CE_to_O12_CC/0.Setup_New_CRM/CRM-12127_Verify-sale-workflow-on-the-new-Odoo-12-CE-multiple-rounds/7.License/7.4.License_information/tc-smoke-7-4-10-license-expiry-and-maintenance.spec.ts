import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePageMig } from '@pages/mig';
import { LicensePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  confirmQuotationOnO12CE,
  createInvoiceOnO12CE,
  validateInvoiceOnO12CE,
  openLicenseFromInvoiceOnO12CE,
  O12CE_DATA,
  O12ceOpportunity,
  O12ceQuotationResult,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * =============================================================================================
 *  =============================================================================================
 * =============================================================================================
 *  Test Case ID    : CRM-12370_7.4.10
 *  Jira            : -   (ported from pre-production TC.Performance.7.4.10; no Xray manual TC)
 *  Automation-Type : ported
 *  Automation-Date : 2026-09-23
 *  Environment     : O12 CE MIGRATION - https://crm-mig.nakivo.site (VPN required)
 * ---------------------------------------------------------------------------------------------
 *  BASELINE RULE (tester's standing requirement)
 *    The assertions below are the PRE-PRODUCTION TC's assertions, copied unchanged. Only the
 *    login account, the navigation path, the run marker and the wait/timeout durations are
 *    adapted. Where O12 CE behaves differently this TC FAILS - that failure IS the migration
 *    finding and must never be softened into a pass.
 * ---------------------------------------------------------------------------------------------
 *  Summary
 *    Creates its own licence from a perpetual product and verifies the right column of the Limits
 *    group: the licence never expires, its maintenance is available, and it runs from today for the
 *    365 days the product carries.
 * ---------------------------------------------------------------------------------------------
 *  Command to run
 *    npx playwright test --grep "CRM-12370_7\.4\.10:" --project=MigSmoke
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (pre-production): TC.Performance.7.4.10
 *    tests/1.Project_CRM/1.SalesReport_Performance/7.License/7.4.License_information
 *
 *  Pre-condition(s) - one contiguous setup block, run as six labelled steps on the Migration server
 *   1-11. Use the account of Admin to login on crm-mig, open CRM > Opportunities (list view),
 *         press "CREATE" and enter the Opportunity this run owns:
 *           - Opp name          = TEST + <TC id> + current date time
 *           - Email             = Test@company + current date time + ".com"
 *           - Country           = United States
 *           - State             = Connecticut
 *           - Lead form         = License                    (on the "CRM Developer" tab)
 *         Press "SAVE", wait for the Company/Contact Odoo creates from the e-mail domain,
 *         then press "DEAL ELEMENT" and enter:
 *           - Pricelist         = Public Pricelist_USD
 *           - Payment Term      = Immediate Payment
 *           - Order Lines       = the first "NAKIVO Backup" product
 *         Press "SAVE"
 *   12.   Press "NEW QUOTATION" and wait for the created Quotation
 *   13.   Press "CONFIRM" to turn the Quotation into a Sales Order
 *   14-15. Press "CREATE INVOICE", then "CREATE AND VIEW INVOICES"
 *   16.   Press "VALIDATE" and wait
 *   17.   Press "CREATE LICENSE", select "sockets" at the "for monitoring" dropdown and press "SAVE"
 *
 *  Steps to reproduce
 *   1. Read the "Expire Mode" and "Expires" fields of the Limits group
 *   2. Read the "Maintenance Mode", "Start Date", "End Date" and "Maintenance Days" fields
 *
 *  Verification
 *   - "Expires" reads never
 *   - "Expire Mode" is empty (the licence does not expire per licence)
 *   - "Maintenance Mode" reads available
 *   - "Start Date" is today
 *   - "End Date" is one year after the Start Date
 *   - "Maintenance Days" reads 365
 * ---------------------------------------------------------------------------------------------
 *  Grounding
 *    The expected values are grounded on PRE-PRODUCTION (2026-09-21) against the
 *    license_management.license form view and a licence created through the chain above - not on a
 *    Production screenshot. Odoo keeps a field hidden by attrs in the DOM, so every reader used
 *    here filters on real visibility and reports what a tester actually sees.
 * ---------------------------------------------------------------------------------------------
 *  Test data and cleanup (crm-mig house rule)
 *    Every run creates its OWN Opportunity, Deal Element, Quotation, Sales Order, Invoice and
 *    License, named with a fresh timestamp and the marker "TEST CRM-12370_7.4.10", so two
 *    back-to-back runs never collide. Unlike the pre-production original, this spec DELETES what
 *    it created: `teardownMigRecords` in afterEach removes the chain newest-first, and the
 *    afterAll sweep catches anything an aborted run left behind. crm-mig is a shared migration
 *    base - a leftover record skews the very counts it exists to verify.
 * =============================================================================================
 */

const TC = 'CRM-12370_7.4.10';

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  pre1: 'Pre-condition 1-11: Use the account of Admin to login, open the Opportunities list, create the Opportunity and its Deal Element',
  pre2: 'Pre-condition 12: Press "NEW QUOTATION" and wait for the created Quotation',
  pre3: 'Pre-condition 13: Press "CONFIRM" to turn the Quotation into a Sales Order',
  pre4: 'Pre-condition 14-15: Press "CREATE INVOICE", then "CREATE AND VIEW INVOICES"',
  pre5: 'Pre-condition 16: Press "VALIDATE" and wait',
  pre6: 'Pre-condition 17: Press "CREATE LICENSE", select "sockets" for monitoring and press "SAVE"',
  s1: 'Step 1: Read the "Expire Mode" and "Expires" fields of the Limits group',
  s2: 'Step 2: Read the "Maintenance Mode", "Start Date", "End Date" and "Maintenance Days" fields',
  verify: 'Verification',
} as const;

test.describe(`${TC} - Limits - the expiry and maintenance values of a perpetual License with one year of maintenance`, () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
      const homePageForWait = new HomePageMig(page);
      await homePageForWait.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await teardownMigRecords(page, SKIP_CLEANUP_OPP);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  // CLAUDE.md crm-mig rule: the afterAll sweep also removes what a dying test created but never got
  // to register. Opens its own session, so it costs one extra login per spec file.
  test.afterAll(async ({ browser }) => {
    await sweepMigLeftoversAfterAll(browser, TC);
  });

  test(`${TC}: Limits - the expiry and maintenance values of a perpetual License with one year of maintenance`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const homePage = new HomePageMig(page);
    const licensePage = new LicensePage(page);

    const DATA = {
      forMonitoring: O12CE_DATA.forMonitoring,
      // The reason the cancel window is confirmed with, where a test case cancels the licence.
      cancelReason: 'Expired',
    };

    // What the chain produced - every "matches the Opportunity / the Invoice" check below is made
    // against these values, never against a hard-coded record.
    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let oppName = '';
    let oppEmail = '';
    let oppCompany = '';
    let invoiceNumber = '';
    let licenseTitle = '';
    let licenseUrl = '';

    // What this test case reads on the licence.
    let expireMode = 'x';
    let expires = '';
    let maintenanceMode = '';
    let startDate = '';
    let endDate = '';
    let maintenanceDays = '';

    // The VERIFY block printed in the last step - filled by record(), printed before the expect()s
    // so it also reaches stdout when a check fails.
    const CHECKS: Array<{ what: string; expected: string; actual: string; pass: boolean }> = [];
    // pass is derived from string equality unless the check is relational (a range, a "greater
    // than", a presence test) - those pass their own verdict as the 4th argument.
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

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      await loginToO12CE(page);
      await openOpportunitiesListOnO12CE(page);
      opp = await createOpportunityOnO12CE(page, TC);
      oppName = opp.oppName;
      oppEmail = opp.email;
      oppCompany = opp.companyValue;
      await addDealElementOnO12CE(page);
      console.log(`  - Opp name          : ${oppName}`);
      console.log(`  - Email             : ${oppEmail}`);
      console.log(`  - Company created   : ${oppCompany}`);
      console.log(`  - Opportunity URL   : ${opp.oppUrl}`);
      expect(oppCompany, 'Odoo must have created the Company for the Opportunity').not.toBe('');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      quotation = await pressNewQuotationOnO12CE(page);
      // Setup gate - NOT this TC's assertion. On O12 CE "NEW QUOTATION" creates the Quotation in
      // place instead of navigating to it; the helper then looks the record up and puts the form on
      // it. This TC's setup only needs the form to BE on the Quotation. Whether the button
      // NAVIGATES is the subject of CRM-12370_5.1.1 and is asserted there - gating on it here would
      // make every License screen TC duplicate that one finding and never reach its own checks.
      expect(
        quotation.landedOnQuotation,
        `the setup must land on the created Quotation so it can be confirmed (navigated=${quotation.navigated}, quotationId="${quotation.quotationId}", chatter: "${(quotation.chatterText || '').substring(0, 200)}")`
      ).toBeTruthy();
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await confirmQuotationOnO12CE(page);
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createInvoiceOnO12CE(page);
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      const validated = await validateInvoiceOnO12CE(page);
      invoiceNumber = validated.invoiceNumber;
      console.log(`  - Invoice number    : ${invoiceNumber}`);
      console.log(`  - Invoice status    : ${validated.status}`);
    });

    await test.step(STEP.pre6, async () => {
      console.log(`\n--- ${STEP.pre6} ---`);
      const license = await openLicenseFromInvoiceOnO12CE(page);
      const saveMs = await licensePage.clickSaveAndWaitForCompletion(CommonUtils.waitTimes.savingPage);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      licenseUrl = license.licenseUrl;
      licenseTitle = await licensePage.getRecordTitle();
      console.log(`  - for monitoring    : ${DATA.forMonitoring}`);
      console.log(`  - SAVE took         : ${(saveMs / 1000).toFixed(2)}s`);
      console.log(`  - License title     : ${licenseTitle}`);
      console.log(`  - License URL       : ${licenseUrl}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - License created and saved');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      expireMode = await licensePage.getFieldDisplayText('expire_mode');
      expires = await licensePage.getExpiresValue();
      console.log(`  - Expire Mode        : "${expireMode}"`);
      console.log(`  - Expires            : "${expires}"`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      maintenanceMode = await licensePage.getFieldDisplayText('maintenance_mode');
      startDate = await licensePage.getFieldDisplayText('start_date');
      endDate = await licensePage.getFieldDisplayText('end_date');
      maintenanceDays = await licensePage.getFieldDisplayText('maintenance_days');
      console.log(`  - Maintenance Mode   : "${maintenanceMode}"`);
      console.log(`  - Start Date         : "${startDate}"`);
      console.log(`  - End Date           : "${endDate}"`);
      console.log(`  - Maintenance Days   : "${maintenanceDays}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - expiry and maintenance read');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      // The licence is generated today, so "Start Date" is today in the MM/DD/YYYY the form prints,
      // and "End Date" is the same day one year later - the 365 maintenance days the product carries.
      const pad = (n: number) => String(n).padStart(2, '0');
      const today = new Date();
      const expectedStart = `${pad(today.getMonth() + 1)}/${pad(today.getDate())}/${today.getFullYear()}`;
      const expectedEnd = `${pad(today.getMonth() + 1)}/${pad(today.getDate())}/${today.getFullYear() + 1}`;

      record('"Expires"', 'never', expires);
      record('"Expire Mode" is empty on a licence that never expires', '(empty)', expireMode || '(empty)', expireMode === '');
      record('"Maintenance Mode"', 'available', maintenanceMode);
      record('"Start Date" is today', expectedStart, startDate);
      record('"End Date" is one year after the Start Date', expectedEnd, endDate);
      record('"Maintenance Days"', '365', maintenanceDays);
      printVerify();

      expect(expires, 'a perpetual licence must never expire').toBe('never');
      expect(expireMode, '"Expire Mode" must stay empty on a licence that never expires').toBe('');
      expect(maintenanceMode, '"Maintenance Mode" must read available').toBe('available');
      expect(startDate, '"Start Date" must be the day the licence was generated').toBe(expectedStart);
      expect(endDate, '"End Date" must be one year after the Start Date').toBe(expectedEnd);
      expect(maintenanceDays, '"Maintenance Days" must read 365').toBe('365');
    });
  });
});
