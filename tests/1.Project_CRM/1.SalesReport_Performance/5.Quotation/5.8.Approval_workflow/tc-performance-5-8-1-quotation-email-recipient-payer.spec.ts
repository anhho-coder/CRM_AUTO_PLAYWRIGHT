import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Quotation data verification - the Quotation Payer is proposed as a recipient in the "Send by Email" composer
 * Test Case ID: TC.Performance.5.8.1
 * Automation-Type: new
 * Automation-Date: 2026-09-30
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.5\\.8\\.1:" --project=SalesReport_Performance
 *
 * Objective: Verify that the "Send by Email" composer of a Quotation opens with the Quotation Payer already proposed in the Recipients row, and that Cancel closes it without sending and without moving the Quotation on.
 *
 * Source manual TC: NONE.
 *   This case has no Jira/Xray manual TC yet - it is the PRE-PRODUCTION BASELINE counterpart of the
 *   crm-mig spec CRM-12370_5.8.1 (tc-smoke-5-8-1-quotation-email-recipient-payer.spec.ts).
 *   The steps below mirror that spec's step labels; the EXPECTED RESULTS are what pre-production
 *   (Odoo 12 EE) actually does and were NOT copied from the O12 CE run.
 *   FOLLOW-UP: create the Xray Test Case + the master-file row for TC.Performance.5.8.1.
 *
 * Run as: Salesperson / sales IC Thomas Semerich (thomas.semerich@nakivo.com) - the account that
 *   RAISES the Quotation. The whole point of this sub-section is what the REQUESTER himself may do,
 *   so it must not run as an administrator: an admin sees every button and the check would be vacuous.
 *
 * Pre-condition:
 * 1. Log in as Thomas Semerich and open CRM > Opportunities (list view)
 * 2. Press CREATE and enter:
 *    - Opp name         = TEST + current date time
 *    - Email            = Test@company + current date time + ".com"
 *    - Country          = United States
 *    - State            = Connecticut
 *    - Sales Team       = cleared
 *    - Salesperson      = cleared
 *    - Created manually = FALSE
 *    - Lead form        = License (CRM Developer tab)
 * 3. Press SAVE and wait until Odoo has created the Company/Contact from the e-mail domain
 * 4. Press "DEAL ELEMENT", enter:
 *    - Pricelist    = Public Pricelist_USD
 *    - Payment Term = Immediate Payment
 *    - Product      = NAKIVO Backup
 *    - Ordered Qty  = 1
 *    and press SAVE
 *
 * Steps run:
 * 1. Press "NEW QUOTATION" on the saved Deal Element
 * 2. Read the "Payer" of the Quotation, press "SEND BY EMAIL" and read the Recipients row and the subject
 * 3. Press "Cancel" on the composer
 *
 * Verification:
 * - The Recipients row of the composer is NOT empty
 * - The Quotation Payer is one of the proposed recipients
 * - Pressing Cancel closes the composer
 * - The Quotation is still on the QUOTATION stage afterwards
 *
 * NOTE - overlap: on pre-production this check is also made by TC.Performance.5.2.5 (SEND BY EMAIL
 * button). It is kept here as the structural counterpart of the crm-mig regression guard
 * CRM-12370_5.8.1, which exists because of CRM-12415 (empty Recipients row on the Migration server).
 *
 * The spec creates its own Opportunity (and its own Deal Element and Quotation) on pre-production,
 * named with a run token - a timestamp - so the records can always be found again. Pre-production is
 * the team's test bed and the 1.SalesReport_Performance specs keep what they create, exactly like the
 * other Quotation specs: there is no teardown.
 */

const TC = 'TC.Performance.5.8.1';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal as the Salesperson who raises the Quotation',
  s2: 'Step 2: Opening the Opportunity list in CRM',
  s3: 'Step 3: Creating the Opportunity this test case owns',
  s4: 'Step 4: Creating the Deal Element this test case owns',
  s5: 'Step 5: Pressing NEW QUOTATION to create the Quotation',
  s6: 'Step 6: Reading the Payer, pressing SEND BY EMAIL and reading the Recipients row',
  s7: 'Step 7: Closing the composer with Cancel',
  verify: 'Verification',
};

test.describe(`${TC} - the Quotation Payer is proposed as a recipient in the "Send by Email" composer`, () => {
  let oppUrl = '';
  let dealElementUrl = '';
  let quotationUrl = '';

  test.beforeEach(async ({ context }) => {
    oppUrl = '';
    dealElementUrl = '';
    quotationUrl = '';
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    }
    if (oppUrl) console.log(`Opportunity created by this run : ${oppUrl}`);
    if (dealElementUrl) console.log(`Deal Element created by this run: ${dealElementUrl}`);
    if (quotationUrl) console.log(`Quotation created by this run   : ${quotationUrl}`);
  });

  test(`${TC}: Verify the Quotation Payer is auto-filled as a recipient in the "Send by Email" composer`, async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);

    const DATA = {
      country: 'United States',
      state: 'Connecticut',
      leadForm: 'License',
      pricelist: 'Public Pricelist_USD',
      paymentTerm: 'Immediate Payment',
      product: 'NAKIVO Backup',
      orderedQty: 1,
    };

    let oppCompany = '';
    let orderNumber = '';
    let payer = '';
    let recipients: string[] = [];
    let subject = '';
    let composerClosed = false;
    let stageAfter = '';
    const EXPECTED_STAGE = 'QUOTATION';

    // The VERIFY block printed in the last step - filled by record(), printed before the
    // expect()s so it also reaches stdout when a check fails.
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

    await test.step(STEP.s1, async () => {
      console.log(STEP.s1);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`  - Signed in as : ${users.sale_ic_thomas.displayName} (${users.sale_ic_thomas.username})`);
    });

    await test.step(STEP.s2, async () => {
      console.log(STEP.s2);
      await homePage.navigateToCRM();
      await opportunityPage.switchToListView();
    });

    await test.step(STEP.s3, async () => {
      console.log(STEP.s3);
      await opportunityPage.clickCreate();

      const oppName = opportunityPage.generateOpportunityName('TEST');
      const email = opportunityPage.generateEmail('Test@company');
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(email);
      await opportunityPage.selectCountry(DATA.country);
      await opportunityPage.selectState(DATA.state);
      await opportunityPage.clearSalesTeam();
      await opportunityPage.clearSalesperson();
      await opportunityPage.uncheckCreatedManually();
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm(DATA.leadForm);
      await opportunityPage.verifyCreatedManuallyBeforeSave();
      await opportunityPage.saveAndWaitForCompletion();
      await opportunityPage.waitForContactFieldPopulated('company', 5, 20000);

      oppUrl = page.url();
      oppCompany = (await opportunityPage.getCompanyFieldValue()) || '';

      console.log(`  - Opportunity : ${oppName}`);
      console.log(`  - Email       : ${email}`);
      console.log(`  - Country     : ${DATA.country}`);
      console.log(`  - State       : ${DATA.state}`);
      console.log(`  - Lead form   : ${DATA.leadForm}`);
      console.log(`  - Company     : ${oppCompany}`);
      console.log(`  Opportunity saved: ${oppUrl}`);

      expect(oppCompany, 'Odoo must have created the Company for the Opportunity').not.toBe('');
    });

    await test.step(STEP.s4, async () => {
      console.log(STEP.s4);
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.waitForAutoPopulate();
      await dealElementPage.selectPricelist(DATA.pricelist);
      await dealElementPage.selectPaymentTerm(DATA.paymentTerm);
      await dealElementPage.addProduct(DATA.product);
      await dealElementPage.setProductQuantity(DATA.orderedQty);
      await dealElementPage.save(CommonUtils.waitTimes.savingDealElement);
      dealElementUrl = page.url();
      console.log(`  - Pricelist    : ${DATA.pricelist}`);
      console.log(`  - Payment Term : ${DATA.paymentTerm}`);
      console.log(`  - Product      : ${DATA.product}`);
      console.log(`  - Ordered Qty  : ${DATA.orderedQty}`);
      console.log(`  Deal Element saved: ${dealElementUrl}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(STEP.s5);
      await quotationPage.clickNewQuotation();
      await quotationPage.waitForFormView();
      await quotationPage.waitForEditButton();
      quotationUrl = page.url();
      orderNumber = await quotationPage.getSalesOrderNumber().catch(() => '');
      console.log(`  Quotation created: ${quotationUrl}`);
      console.log(`  Quotation number : ${orderNumber || '(not read)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Pre-condition - Quotation created`);
    });

    await test.step(STEP.s6, async () => {
      console.log(STEP.s6);
      payer = await quotationPage.getPayerName();
      expect(payer, 'the created Quotation must carry a Payer - without it there is no expected recipient').not.toBe('');
      console.log(`  - Payer on the Quotation : ${payer}`);

      await quotationPage.clickSendByEmail();
      await quotationPage.waitForEmailDialog();
      recipients = await quotationPage.getEmailRecipients();
      subject = await quotationPage.getEmailSubject();
      console.log(`  - Recipients proposed    : ${recipients.length ? recipients.join(' | ') : '(none)'}`);
      console.log(`  - Composer subject       : ${subject}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Steps run - composer Recipients row`);
    });

    await test.step(STEP.s7, async () => {
      console.log(STEP.s7);
      composerClosed = await quotationPage.cancelEmailDialog();
      stageAfter = await quotationPage.getActiveStatusBarStage();
      console.log(`  - Composer closed : ${composerClosed}`);
      console.log(`  - Stage after     : ${stageAfter}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Steps run - composer cancelled`);
    });

    await test.step(STEP.verify, async () => {
      const payerProposed = recipients.some((r) => r.includes(payer) || payer.includes(r));
      let verifyPassed = false;
      try {
        record('The composer Recipients row is NOT empty', 'at least 1 recipient',
          `${recipients.length} recipient(s) - ${recipients.length ? recipients.join(' | ') : 'EMPTY'}`,
          recipients.length > 0);
        record('The Quotation Payer is one of the proposed recipients', payer,
          recipients.join(' | ') || '(none)', payerProposed);
        record('Cancel closes the composer', 'true', String(composerClosed));
        record('The Quotation stays on the QUOTATION stage after Cancel', EXPECTED_STAGE, stageAfter);
        printVerify();

        expect(recipients.length, 'the composer must propose at least one recipient').toBeGreaterThan(0);
        expect(payerProposed,
          `the composer must propose the Payer "${payer}" - proposed: ${recipients.join(' | ') || '(none)'}`).toBe(true);
        expect(composerClosed, 'Cancel must close the composer').toBe(true);
        expect(stageAfter, 'cancelling the composer must not move the Quotation on').toBe(EXPECTED_STAGE);
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Recipients row`,
          passed: verifyPassed,
        }).catch(() => {});
      }
    });
  });
});
