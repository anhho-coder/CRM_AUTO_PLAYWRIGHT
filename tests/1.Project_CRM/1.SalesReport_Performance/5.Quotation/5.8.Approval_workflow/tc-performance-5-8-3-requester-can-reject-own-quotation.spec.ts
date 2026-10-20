import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Quotation data verification - the requester rejecting his own Quotation
 * Test Case ID: TC.Performance.5.8.3
 * Automation-Type: new
 * Automation-Date: 2026-09-30
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.5\\.8\\.3:" --project=SalesReport_Performance
 *
 * Objective: Establish the pre-production baseline for what happens when the account that RAISED a Quotation presses REJECT on it himself, with no approver session opened.
 *
 * Source manual TC: NONE.
 *   This case has no Jira/Xray manual TC yet - it is the PRE-PRODUCTION BASELINE counterpart of the
 *   crm-mig spec CRM-12370_5.8.3 (tc-smoke-5-8-3-requester-can-reject-own-quotation.spec.ts).
 *   The steps below mirror that spec's step labels; the EXPECTED RESULTS are what pre-production
 *   (Odoo 12 EE) actually does and were NOT copied from the O12 CE run.
 *   FOLLOW-UP: create the Xray Test Case + the master-file row for TC.Performance.5.8.3.
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
 *    - Ordered Qty  = 30
 *    and press SAVE
 *
 * Steps run:
 * 1. Press "NEW QUOTATION" on the saved Deal Element
 * 2. Press "TO APPROVE" to bring the Quotation to Pending Approval and read which header buttons the requester is offered
 * 3. Stay logged in as the SAME account that raised the Quotation and press "REJECT"
 * 4. Read the Quotation status back from the server
 *
 * Verification:
 * - Before the attempt the Quotation status contains "Pending" and REJECT is offered
 * - The requester own REJECT is accepted - APPROVE and REJECT are both consumed
 * - The Quotation has left "Pending Approval"
 *
 * The spec creates its own Opportunity (and its own Deal Element and Quotation) on pre-production,
 * named with a run token - a timestamp - so the records can always be found again. Pre-production is
 * the team's test bed and the 1.SalesReport_Performance specs keep what they create, exactly like the
 * other Quotation specs: there is no teardown.
 */

const TC = 'TC.Performance.5.8.3';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal as the Salesperson who raises the Quotation',
  s2: 'Step 2: Opening the Opportunity list in CRM',
  s3: 'Step 3: Creating the Opportunity this test case owns',
  s4: 'Step 4: Creating the Deal Element this test case owns',
  s5: 'Step 5: Pressing NEW QUOTATION to create the Quotation',
  s6: 'Step 6: Pressing TO APPROVE to bring the Quotation to Pending Approval',
  s7: 'Step 7: Staying logged in as the requester and pressing REJECT',
  s8: 'Step 8: Reading the Quotation status back from the server',
  verify: 'Verification',
};

test.describe(`${TC} - the requester rejecting his own Quotation`, () => {
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

  test(`${TC}: Verify whether the Quotation requester can REJECT his own Quotation`, async ({ page }, testInfo) => {
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
      orderedQty: 30,
    };

    let oppCompany = '';
    let orderNumber = '';
    let statusBefore = '';
    let statusAfter = '';
    let approveOffered = false;
    let rejectOffered = false;
    let cancelOffered = false;
    let duplicateOffered = false;
    let rejectMs = 0;
    let rejectionCheck = {
      rejected: false,
      approveButtonGone: false,
      rejectButtonGone: false,
      editButtonVisible: false,
    };

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
      await quotationPage.clickToApprove();
      statusBefore = await quotationPage.getQuotationStatusFromServer();
      approveOffered = await quotationPage.isApproveButtonVisible();
      rejectOffered = await quotationPage.isRejectButtonVisible();
      cancelOffered = await quotationPage.isCancelButtonVisible();
      duplicateOffered = await quotationPage.isDuplicateButtonVisible();
      console.log(`  - Status after TO APPROVE : ${statusBefore}`);
      console.log(`  - APPROVE offered         : ${approveOffered}`);
      console.log(`  - REJECT offered          : ${rejectOffered}`);
      console.log(`  - CANCEL offered          : ${cancelOffered}`);
      console.log(`  - Duplicate offered       : ${duplicateOffered}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Pre-condition - Pending Approval reached`);
    });

    await test.step(STEP.s7, async () => {
      console.log(STEP.s7);
      console.log(`  - Requester is    : ${users.sale_ic_thomas.displayName}`);
      expect(rejectOffered,
        `the "REJECT" button must be offered to the requester on ${orderNumber || 'the Quotation'} before this case can press it - if it is not offered, pre-production does NOT let the requester reject his own Quotation and that is the baseline finding`).toBe(true);
      rejectMs = await quotationPage.clickReject();
      rejectionCheck = await quotationPage.verifyRejectionSuccess();
      console.log(`  - REJECT elapsed  : ${(rejectMs / 1000).toFixed(2)}s`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Steps run - after the requester pressed REJECT`);
    });

    await test.step(STEP.s8, async () => {
      console.log(STEP.s8);
      statusAfter = await quotationPage.getQuotationStatusFromServer();
      console.log(`  - Status after the requester's own REJECT : ${statusAfter}`);
    });

    await test.step(STEP.verify, async () => {
      const pendingBefore = /pending/i.test(statusBefore);
      const leftPending = statusAfter !== '' && !/pending/i.test(statusAfter);
      let verifyPassed = false;
      try {
        record('The Quotation is Pending Approval before the attempt', 'status contains "Pending"',
          statusBefore || '(empty)', pendingBefore);
        record('REJECT is offered to the requester himself', 'true', String(rejectOffered));
        record('The requester own REJECT is accepted', 'APPROVE and REJECT both consumed',
          `approveGone=${rejectionCheck.approveButtonGone} | rejectGone=${rejectionCheck.rejectButtonGone} | editVisible=${rejectionCheck.editButtonVisible}`,
          rejectionCheck.rejected);
        record('The Quotation has left Pending Approval', 'the status no longer contains "Pending"',
          statusAfter || '(empty)', leftPending);
        console.log(`  Observation (not scored) - buttons offered to the requester while Pending: APPROVE=${approveOffered}, REJECT=${rejectOffered}, CANCEL=${cancelOffered}, Duplicate=${duplicateOffered}`);
        printVerify();

        expect(pendingBefore, `the Quotation must be Pending Approval first (status: "${statusBefore}")`).toBe(true);
        expect(rejectionCheck.rejected,
          `the requester own REJECT must be accepted on ${orderNumber} (approveGone=${rejectionCheck.approveButtonGone}, rejectGone=${rejectionCheck.rejectButtonGone})`).toBe(true);
        expect(leftPending,
          `after the requester own REJECT the Quotation ${orderNumber} must leave Pending Approval, but the server status is "${statusAfter}"`).toBe(true);
        verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - requester rejected his own Quotation`,
          passed: verifyPassed,
        }).catch(() => {});
      }
    });
  });
});
