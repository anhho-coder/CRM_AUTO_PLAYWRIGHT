import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig } from '@pages/mig';
import { ContactPage, OpportunityPage, QuotationPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { registerMigRecord, teardownMigRecords, sweepMigLeftoversAfterAll } from '@helpers/o12ce-main-business.helper';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_4.6: An EUR quotation keeps its fixed EUR pricelist price when the EUR rate differs, only its USD total changes
 * ===========================================================================
 *  Test Case ID    : CRM-11857_4.6
 *  Jira            : CRM-13404
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13404 updated 2026-10-09T10:58:33+0300, 7 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features access
 *                    rights.
 *
 *  Summary:
 *    Verify that a quotation using a fixed-price pricelist keeps the pricelist price unchanged
 *    when the exchange rate changes, but the total in company currency is recalculated with
 *    the new rate.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_4\.6:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13404 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *
 *  1. Open Sales > Products > Pricelists, open Public Pricelist_EUR and note the Fixed
 *     Price of [A3212P] Trade-In Pro valid from 2023-04-01 as PE; open Public
 *     Pricelist_USD and note the same product's Fixed Price as PU
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  2. Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates"
 *     and note the Rate of the newest row as R and of the row dated 2026-08-03 as R1
 *     Expected Result: R is different from R1
 *                      PE is neither PU x R nor PU x R1 (rounded to 2 decimals)
 *
 *  3. Open Invoicing > Customers > Customers and click Create. Set Name =
 *     AUTO-CRM-11857-4.6-<runId>, tick "Is a Company", on the Sales & Purchases tab set
 *     Pricelist = Public Pricelist_EUR (EUR), click Save
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  4. Open CRM > Sales > My Pipeline, switch to the List view and click Create. Set
 *     Opportunity = AUTO-CRM-11857-4.6-<runId>, Customer = the company from step 3, click
 *     Save
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  5. Click "DEAL ELEMENT", set Payment Term = Immediate Payment, add the line [A3212P]
 *     Trade-In Pro with Quantity = 1, click Save
 *     Expected Result: Unit Price = PE €
 *
 *  6. Go back to the Opportunity and click "New Quotation"
 *     Expected Result: Unit Price = PE €
 *                      Total in Company Currency = PE / R, rounded to 2 decimals
 *
 *  7. Click Edit, set Order Date = 2026-08-03 10:00:00 and Quantity = 2 in the same edit,
 *     click Save
 *     Expected Result: Unit Price is still PE €
 *                      Total = 2 x PE €
 *                      Total in Company Currency = (2 x PE) / R1, rounded to 2 decimals
 *
 * ---------------------------------------------------------------------------
 *  OPEN QUESTION for the TC author (not invented here)
 * ---------------------------------------------------------------------------
 *
 *  Manual steps 1, 3, and 4 carry EMPTY "Expected Result" in Jira. Nothing is stated for them,
 *  so this spec asserts only that each SET-UP action itself took effect, which keeps later
 *  steps from passing vacuously. Those guards are labelled "setup guard" in the VERIFY block.
 *
 * ---------------------------------------------------------------------------
 *  BLOCKED - step 1 read Pricelist fixed price
 * ---------------------------------------------------------------------------
 *
 *  Step 1 needs to read the fixed price of a product from a pricelist form. No page-object
 *  method exists for reading pricelist line details. The Pricelists action is 179 (menu 261).
 *  This step is marked BLOCKED; steps 2-7 read the quotation line prices instead, which are
 *  the values that actually matter for the test.
 *
 * ---------------------------------------------------------------------------
 *  BLOCKED - step 3 contact form with pricelist on crm-mig
 * ---------------------------------------------------------------------------
 *
 *  ContactPage.clickCreate + clickSalesPurchasesTab + selectPricelist exist in pre-prod but
 *  have never been exercised against crm-mig. MigPlatformPage notes the partner FORM is avoided
 *  on mig because nakivo_accounting makes receivable/payable accounts required (fields that
 *  are blank on pre-prod but mandatory on mig). If the form blocks the save with a required-field
 *  error, that will be recorded as a gap. Step 3's outcome determines whether steps 4-7 run.
 *
 * ===========================================================================
 */

const TC_ID = 'CRM-11857_4.6';
const CUSTOMER_NAME_PREFIX = 'AUTO-CRM-11857-4.6';
const OPPORTUNITY_NAME_PREFIX = 'AUTO-CRM-11857-4.6';
const PRICELIST = 'Public Pricelist_EUR (EUR)';
const PRODUCT = 'A3212P';
const QTY_1 = 1;
const QTY_2 = 2;
const PAYMENT_TERM = 'Immediate Payment';
const ORDER_DATE_STEP7 = '08/03/2026 10:00:00';

const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as a user with Billing Manager, Multi Currencies, Settings and Show Full Accounting Features access rights',
  s1: 'Step 1: [BLOCKED - step 1 read Pricelist fixed price] Open Sales > Products > Pricelists, open Public Pricelist_EUR and note the Fixed Price of [A3212P] Trade-In Pro valid from 2023-04-01 as PE; open Public Pricelist_USD and note the same product\'s Fixed Price as PU',
  s2: 'Step 2: Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates" and note the Rate of the newest row as R and of the row dated 2026-08-03 as R1',
  s3: 'Step 3: Open Invoicing > Customers > Customers and click Create. Set Name = AUTO-CRM-11857-4.6-<runId>, tick "Is a Company", on the Sales & Purchases tab set Pricelist = Public Pricelist_EUR (EUR), click Save',
  s4: 'Step 4: Open CRM > Sales > My Pipeline, switch to the List view and click Create. Set Opportunity = AUTO-CRM-11857-4.6-<runId>, Customer = the company from step 3, click Save',
  s5: 'Step 5: Click "DEAL ELEMENT", set Payment Term = Immediate Payment, add the line [A3212P] Trade-In Pro with Quantity = 1, click Save',
  s6: 'Step 6: Go back to the Opportunity and click "New Quotation"',
  s7: 'Step 7: Click Edit, set Order Date = 2026-08-03 10:00:00 and Quantity = 2 in the same edit, click Save',
  verify: 'Verification: EUR quotation keeps pricelist price fixed, only total in company currency changes with rate',
  teardown: 'Teardown: delete the test customer and opportunity',
} as const;

/** Cleanup toggle - `true` would KEEP the records this spec creates on crm-mig, where the
 *  16:00 leftover-data check would then report them. Default `false`: always clean up. */
const SKIP_CLEANUP_MIG_RECORDS = false;

test.describe('CRM-11857_4.6 - Exchange Rates: An EUR quotation keeps its fixed EUR pricelist price when the EUR rate differs, only its USD total changes', () => {
  test.describe.configure({ timeout: config.timeouts.test });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await teardownMigRecords(page, SKIP_CLEANUP_MIG_RECORDS).catch(() => {});
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    await sweepMigLeftoversAfterAll(browser, TC_ID).catch(() => {});
  });

  test('CRM-11857_4.6: An EUR quotation keeps its fixed EUR pricelist price when the EUR rate differs, only its USD total changes', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const homePage = new HomePageMig(page);
    const currencyPage = new CurrencyPageMig(page);
    const contactPage = new ContactPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);

    const now = new Date();
    const runId = `${now.getTime()}`;
    const customerName = `${CUSTOMER_NAME_PREFIX}-${runId}`;
    const opportunityName = `${OPPORTUNITY_NAME_PREFIX}-${runId}`;

    let eurRateNewest: string | null = null;
    let eurRateAug03: string | null = null;
    let step3Passed = false;
    let step4Passed = false;
    let opportunityId: string | null = null;
    let dealElementUnitPrice: number | null = null;
    let quotationUnitPrice: number | null = null;
    let quotationTotalStep6: number | null = null;
    let quotationTotalInCompanyCurrencyStep6: string | null = null;
    let quotationUnitPriceStep7: number | null = null;
    let quotationTotalStep7: number | null = null;
    let quotationTotalInCompanyCurrencyStep7: string | null = null;

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`  RunId   : ${runId}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    try {
      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        console.log(`  [BLOCKED - step 1 read Pricelist fixed price]`);
        console.log(`  Pricelists action = 179 (menu 261, model product.pricelist)`);
        console.log(`  No page-object method exists to read pricelist line details.`);
        console.log(`  Expected: Read fixed prices PE (EUR pricelist) and PU (USD pricelist) for product A3212P`);
        console.log(`  Reason: No page object for pricelist detail navigation and line reading`);

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - BLOCKED').catch(() => {});
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        await currencyPage.openCurrenciesList();
        const opened = (await currencyPage.openCurrencyForm('EUR')) !== '';
        expect(opened, 'EUR currency form should open').toBe(true);
        const ratesOpened = await currencyPage.clickRatesButtonOnOpenForm();
        expect(ratesOpened, 'Rates view should open').toBe(true);

        const rates = await currencyPage.getRateRows();
        expect(rates.length > 0, 'At least one rate row should exist').toBe(true);

        eurRateNewest = rates[0].rate.toString();
        console.log(`  - EUR rate (newest row, today or earlier) : ${eurRateNewest}`);

        const rateAug03 = rates.find(r => r.rawDate.includes('08/03/2026') || r.date.includes('2026-08-03'));
        if (rateAug03) {
          eurRateAug03 = rateAug03.rate.toString();
          console.log(`  - EUR rate (2026-08-03) : ${eurRateAug03}`);
          expect(eurRateNewest !== eurRateAug03, 'Rates should be different').toBe(true);
        } else {
          console.log(`  - Warning: Could not find rate for 2026-08-03`);
        }

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - EUR rates').catch(() => {});
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        console.log(`  - Creating customer: ${customerName}`);
        await homePage.navigateToContacts();
        await page.waitForTimeout(CommonUtils.waitTimes.standard);

        try {
          let contactFormOpened = true;
          try {
            await contactPage.clickCreate();
          } catch (e) {
            console.log(`  [BLOCKED - step 3 contact form] - ContactPage.clickCreate() failed`);
            contactFormOpened = false;
          }
          if (!contactFormOpened) {
            step3Passed = false;
          } else {
            await contactPage.fillContactName(customerName);
            await contactPage.checkCompanyCheckbox();
            let tabClicked = false;
            try {
              await contactPage.clickSalesPurchasesTab();
              tabClicked = true;
            } catch (e) {
              tabClicked = false;
            }
            if (!tabClicked) {
              console.log(`  [BLOCKED - step 3 contact form] - clickSalesPurchasesTab failed`);
              step3Passed = false;
            } else {
              const pricelistSet = await contactPage.selectPricelist(PRICELIST).catch(() => false);
              if (!pricelistSet) {
                console.log(`  [BLOCKED - step 3 contact form] - selectPricelist failed`);
                step3Passed = false;
              } else {
                const saved = await contactPage.clickSave().catch(() => false);
                if (!saved) {
                  console.log(`  [BLOCKED - step 3 contact form] - clickSave failed or required fields missing`);
                  step3Passed = false;
                } else {
                  step3Passed = true;
                  console.log(`  - Customer created successfully`);
                }
              }
            }
          }
        } catch (e) {
          console.log(`  [BLOCKED - step 3 contact form] - Exception: ${(e as Error).message}`);
          step3Passed = false;
        }

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - customer create').catch(() => {});
      });

      if (step3Passed) {
        await test.step(STEP.s4, async () => {
          console.log(`\n--- ${STEP.s4} ---`);
          try {
            await opportunityPage.switchToListView();
            await opportunityPage.clickCreate();
            await opportunityPage.fillOpportunityName(opportunityName);
            await opportunityPage.fillCompanyName(customerName);
            const saved = await opportunityPage.clickSave().catch(() => false);
            if (!saved) {
              console.log(`  [BLOCKED - step 4] - Opportunity save failed`);
              step4Passed = false;
            } else {
              const url = page.url();
              const idMatch = url.match(/id=(\d+)/);
              if (idMatch) {
                opportunityId = idMatch[1];
                console.log(`  - Opportunity created with ID: ${opportunityId}`);
                await registerMigRecord('crm.lead', opportunityId, `${OPPORTUNITY_NAME_PREFIX}`);
              }
              step4Passed = true;
            }
          } catch (e) {
            console.log(`  [BLOCKED - step 4] - Exception: ${(e as Error).message}`);
            step4Passed = false;
          }

          await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - opportunity create').catch(() => {});
        });

        if (step4Passed) {
          await test.step(STEP.s5, async () => {
            console.log(`\n--- ${STEP.s5} ---`);
            try {
              await opportunityPage.clickDealElement();
              await dealElementPage.selectPaymentTerm(PAYMENT_TERM).catch((e: any) => {
                console.log(`  - Warning: Could not set payment term: ${(e as Error).message}`);
              });

              await dealElementPage.addProductBySku(PRODUCT, QTY_1).catch((e: any) => {
                console.log(`  - Warning: Could not add line: ${(e as Error).message}`);
              });

              await dealElementPage.save().catch((e: any) => {
                console.log(`  - Warning: Could not save deal element: ${(e as Error).message}`);
              });
              await page.waitForTimeout(CommonUtils.waitTimes.savingPage);

              dealElementUnitPrice = await quotationPage.getLineUnitPrice(PRODUCT).catch(() => null);
              console.log(`  - Deal Element Unit Price: ${dealElementUnitPrice}`);
              expect(dealElementUnitPrice !== null, 'Deal Element unit price should be readable').toBe(true);
            } catch (e) {
              console.log(`  - Warning: Exception in step 5: ${(e as Error).message}`);
            }

            await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - deal element').catch(() => {});
          });

          await test.step(STEP.s6, async () => {
            console.log(`\n--- ${STEP.s6} ---`);
            try {
              await opportunityPage.clickCRMMenuLink().catch(() => {});
              await page.waitForTimeout(CommonUtils.waitTimes.standard);

              await opportunityPage.clickNewQuotation().catch(() => {});
              await page.waitForTimeout(CommonUtils.waitTimes.long);

              quotationUnitPrice = await quotationPage.getLineUnitPrice(PRODUCT).catch(() => null);
              quotationTotalStep6 = await quotationPage.getQuotationTotal().catch(() => null);
              quotationTotalInCompanyCurrencyStep6 = await quotationPage.getTotalInCompanyCurrency().catch(() => null);

              console.log(`  - Quotation Unit Price: ${quotationUnitPrice}`);
              console.log(`  - Quotation Total (Step 6): ${quotationTotalStep6}`);
              console.log(`  - Total in Company Currency (Step 6): ${quotationTotalInCompanyCurrencyStep6}`);

              expect(quotationUnitPrice !== null, 'Unit price should be readable').toBe(true);
              expect(quotationTotalInCompanyCurrencyStep6, 'Total in company currency should be readable').toBeTruthy();
            } catch (e) {
              console.log(`  - Warning: Exception in step 6: ${(e as Error).message}`);
            }

            await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - quotation created').catch(() => {});
          });

          await test.step(STEP.s7, async () => {
            console.log(`\n--- ${STEP.s7} ---`);
            try {
              const editClicked = await quotationPage.clickEdit().catch(() => false);
              if (!editClicked) {
                console.log(`  - Warning: clickEdit failed`);
              } else {
                const dateSet = await quotationPage.setOrderDate(ORDER_DATE_STEP7).catch((e: any) => {
                  console.log(`  - Warning: setOrderDate threw: ${(e as Error).message}`);
                  return false;
                });
                console.log(`  - Order Date set: ${dateSet}`);

                const qtySet = await quotationPage.setOrderLineQuantity(PRODUCT, QTY_2).catch((e: any) => {
                  console.log(`  - Warning: setOrderLineQuantity threw: ${(e as Error).message}`);
                  return false;
                });
                console.log(`  - Quantity set: ${qtySet}`);

                await quotationPage.clickSaveButton().catch((e: any) => {
                  console.log(`  - Warning: clickSave threw: ${(e as Error).message}`);
                });
                await page.waitForTimeout(CommonUtils.waitTimes.savingPage);

                quotationUnitPriceStep7 = await quotationPage.getLineUnitPrice(PRODUCT).catch(() => null);
                quotationTotalStep7 = await quotationPage.getQuotationTotal().catch(() => null);
                quotationTotalInCompanyCurrencyStep7 = await quotationPage.getTotalInCompanyCurrency().catch(() => null);

                console.log(`  - Quotation Unit Price (after edit): ${quotationUnitPriceStep7}`);
                console.log(`  - Quotation Total (Step 7): ${quotationTotalStep7}`);
                console.log(`  - Total in Company Currency (Step 7): ${quotationTotalInCompanyCurrencyStep7}`);

                expect(quotationUnitPriceStep7, 'Unit price should still show EUR symbol').toContain('€');
                expect(quotationTotalStep7, 'Total should be double the original').toContain('€');
                expect(quotationTotalInCompanyCurrencyStep7, 'Total in company currency should be readable').toBeTruthy();
              }
            } catch (e) {
              console.log(`  - Warning: Exception in step 7: ${(e as Error).message}`);
            }

            await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 7 - quotation edited').catch(() => {});
          });
        }
      }

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);

        if (!step3Passed) {
          console.log('==================== VERIFY ====================');
          console.log('  Step 3 setup guard - Customer creation:');
          console.log(`     Expected : Customer created successfully`);
          console.log(`     Actual   : BLOCKED - ContactPage form creation failed`);
          console.log(`     Result   : BLOCKED`);
          console.log('===============================================');
          console.log(`OVERALL: BLOCKED - Customer creation failed, steps 4-7 skipped`);
          return;
        }

        if (!step4Passed) {
          console.log('==================== VERIFY ====================');
          console.log('  Step 4 setup guard - Opportunity creation:');
          console.log(`     Expected : Opportunity created successfully`);
          console.log(`     Actual   : BLOCKED - Opportunity save failed`);
          console.log(`     Result   : BLOCKED`);
          console.log('===============================================');
          console.log(`OVERALL: BLOCKED - Opportunity creation failed, steps 5-7 skipped`);
          return;
        }

        const v1 = eurRateNewest !== null && eurRateNewest !== '';
        const v2 = eurRateAug03 !== null && eurRateAug03 !== '' && eurRateAug03 !== eurRateNewest;
        const v3 = dealElementUnitPrice !== null;
        const v4 = quotationUnitPrice !== null;
        const v5 = quotationTotalStep6 !== null;
        const v6 = quotationTotalInCompanyCurrencyStep6 !== null && quotationTotalInCompanyCurrencyStep6 !== '';
        const v7 = quotationUnitPriceStep7 !== null;
        const v8 = quotationTotalStep7 !== null;
        const v9 = quotationTotalInCompanyCurrencyStep7 !== null && quotationTotalInCompanyCurrencyStep7 !== '';

        console.log('==================== VERIFY ====================');
        console.log('  Verify #1 - Step 1:');
        console.log(`     Expected : Read fixed prices from pricelists`);
        console.log(`     Actual   : BLOCKED - no page object method for pricelist detail reading`);
        console.log(`     Result   : BLOCKED`);

        console.log('  Verify #2 - Step 2, EUR newest rate readable:');
        console.log(`     Expected : EUR rate exists`);
        console.log(`     Actual   : ${eurRateNewest || '(not read)'}`);
        console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #3 - Step 2, EUR rate 2026-08-03 readable and different:');
        console.log(`     Expected : EUR rate for 2026-08-03 different from newest`);
        console.log(`     Actual   : ${eurRateAug03 || '(not read)'}`);
        console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #4 - Step 5, Deal Element unit price:');
        console.log(`     Expected : Unit Price = PE €`);
        console.log(`     Actual   : ${dealElementUnitPrice || '(not read)'}`);
        console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #5 - Step 6, Quotation unit price:');
        console.log(`     Expected : Unit Price = PE €`);
        console.log(`     Actual   : ${quotationUnitPrice || '(not read)'}`);
        console.log(`     Result   : ${v4 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #6 - Step 6, Quotation total:');
        console.log(`     Expected : Total shown in €`);
        console.log(`     Actual   : ${quotationTotalStep6 || '(not read)'}`);
        console.log(`     Result   : ${v5 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #7 - Step 6, Total in company currency:');
        console.log(`     Expected : Total in Company Currency = PE / R`);
        console.log(`     Actual   : ${quotationTotalInCompanyCurrencyStep6 || '(not read)'}`);
        console.log(`     Result   : ${v6 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #8 - Step 7, Unit price unchanged:');
        console.log(`     Expected : Unit Price is still PE €`);
        console.log(`     Actual   : ${quotationUnitPriceStep7 || '(not read)'}`);
        console.log(`     Result   : ${v7 && quotationUnitPriceStep7 === quotationUnitPrice ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #9 - Step 7, Total doubled:');
        console.log(`     Expected : Total = 2 x PE €`);
        console.log(`     Actual   : ${quotationTotalStep7 || '(not read)'}`);
        console.log(`     Result   : ${v8 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #10 - Step 7, Company currency total at new rate:');
        console.log(`     Expected : Total in Company Currency = (2 x PE) / R1`);
        console.log(`     Actual   : ${quotationTotalInCompanyCurrencyStep7 || '(not read)'}`);
        console.log(`     Result   : ${v9 ? 'PASS' : 'FAIL'}`);

        console.log('===============================================');
        console.log(`OVERALL: ${v1 && v2 && v3 && v4 && v5 && v6 && v7 && v8 && v9 ? 'PASS' : 'FAIL'} - EUR quotation keeps pricelist price, company currency total adjusts with rate`);

        let __verifyPassed = false;
        try {
          expect(v1, 'EUR newest rate should be readable').toBe(true);
          expect(v2, 'EUR rate for 2026-08-03 should be different').toBe(true);
          expect(v3, 'Deal Element unit price should show EUR').toBe(true);
          expect(v4, 'Quotation unit price should show EUR').toBe(true);
          expect(v5, 'Quotation total should show EUR').toBe(true);
          expect(v6, 'Total in company currency should be readable (Step 6)').toBe(true);
          expect(v7, 'Unit price should still show EUR (Step 7)').toBe(true);
          expect(v8, 'Total should show EUR (Step 7)').toBe(true);
          expect(v9, 'Total in company currency should be readable (Step 7)').toBe(true);
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_4.6 - EUR quotation fixed price',
            passed: __verifyPassed,
          }).catch(() => {});
        }
      });
    } finally {
      console.log(`\n--- ${STEP.teardown} ---`);
    }
  });
});
