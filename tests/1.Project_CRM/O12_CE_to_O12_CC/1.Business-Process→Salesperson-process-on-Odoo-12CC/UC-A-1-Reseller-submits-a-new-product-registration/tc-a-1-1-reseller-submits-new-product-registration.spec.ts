import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration
 * Test Case ID: TC.-A.1.1
 * Automation-Type: refactored
 * Automation-Date: 2026-07-17
 *
 * Summary: Verify a Reseller's new product registration is submitted successfully and visible to the
 *          Reseller. Thomas creates the deal-registration Opportunity (Opp Name #1, Assigned Partner =
 *          Reseller); Reseller_1 then sees it on "My Opportunities".
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.1\.1:" --project=chromium
 *
 * beforeEach (pre-test data cleanup - runs in a throwaway browser context):
 *  1. Login as Admin (anh.ho).
 *  2. Go to CRM > All Leads.
 *  3. Search Reseller is equal to the Reseller under test (reseller_bronze, business email /
 *     username = Test-Reseller-Automation-Jun10@Reseller-company2026-05-22-220038.com; its Reseller
 *     partner name shown in the "Reseller" column = "TEST-Reseller#Automation-Jun10").
 *  4. Check the header "select all" checkbox.
 *  5. Action > Delete, then press OK - repeated page-by-page until no leftover lead remains, so the
 *     Reseller's "My Opportunities" starts clean and the freshly-created Opp Name #1 is on page 1.
 *
 * Source manual TC (mirrors the manual steps - same order, same content):
 *
 * Pre-condition #1:
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
 *
 * Steps to reproduce #1 (create the registration as Thomas):
 *  1-9. Login as Thomas; CRM > view list > CREATE; enter the Opportunity details:
 *          - Opp
 *          - Contact
 *          - Company
 *          - Email
 *          - Country
 *          - State
 *          - IP
 *          - Create manually  = FALSE
 *          - Sales Team       = cleared
 *          - Salesperson      = cleared
 *          - Lead form        = CRM Developer Lead form
 *          - Assigned Partner = TEST-Reseller#Automation-Jun10
 *          - Internal Note    = Internal Note #1
 *       SAVE; capture Opp URL #1.
 *
 * Steps to reproduce #2 (view the registration as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *
 * Verification #1:
 *  1. Opp Name #1 is displayed on the Reseller's "My Opportunities" page.
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown
const SKIP_CLEANUP_EXISTING_RESELLER_LEADS = false; // false = delete leftover leads for the Reseller before the test
// Delete leftover leads in batches: between deletes we clear Odoo's "Odoo Client Error" popup and the
// blockUI overlay (both intercept clicks) before selecting the next batch and clicking Action.
const CLEANUP_BATCH_SIZE = 40;  // rows removed per delete operation
const CLEANUP_MAX_DELETES = 40; // runaway backstop on delete operations
// Hard time budget for the whole pre-test cleanup. Pre-prod intermittently throws "Odoo Client Error"
// popups whose overlay can block a click; bounding the cleanup (and the cleanup page's per-action
// timeout) guarantees the cleanup can never consume the 15-min test timeout and fail the test - if it
// runs out of budget it abandons (leaving some leftover leads) and the test proceeds.
const CLEANUP_BUDGET_MS = 6 * 60 * 1000; // 6 minutes; leaves ample time for the test body + afterEach
const CLEANUP_OUTER_ROUNDS = 8; // reload + re-filter recovery rounds when pre-prod wedges the list page

// The Reseller taken into this test = reseller_bronze (portal username / business email =
// users.reseller_bronze.username = "Test-Reseller-Automation-Jun10@Reseller-company2026-05-22-220038.com").
// Its Reseller partner name - the value shown in the leads' "Reseller" column and the "Reseller is equal to"
// search facet - is DEAL_REGISTRATION.partnerCompanyName ("TEST-Reseller#Automation-Jun10"), which is what the
// custom-filter autocomplete option matches on.
const RESELLER_UNDER_TEST = DEAL_REGISTRATION.partnerCompanyName;

test.describe('TC.-A.1.1 - Reseller submits a new product registration', () => {

  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ browser, context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);

    if (SKIP_CLEANUP_EXISTING_RESELLER_LEADS) {
      console.log('beforeEach: SKIP_CLEANUP_EXISTING_RESELLER_LEADS = true - skipping pre-test Reseller-lead cleanup');
      return;
    }

    // Pre-test data cleanup: hard-delete every leftover Lead whose Reseller is the reseller under test, so
    // previous runs' registrations do not clutter the Reseller's "My Opportunities" (and push the freshly-
    // created Opp Name #1 off page 1). Runs in a THROWAWAY browser context so the main test `page` still
    // starts a clean, logged-out session for the Thomas login in Steps to reproduce #1.
    test.setTimeout(config.timeouts.test);
    const cleanupContext = await browser.newContext();
    const cleanupPage = await cleanupContext.newPage();
    const loginPage = new LoginPage(cleanupPage);
    const homePage = new HomePage(cleanupPage);
    const opportunityPage = new OpportunityPage(cleanupPage);

    // The cleanup body. Wrapped so it can be raced against a hard time budget (below): pre-prod can
    // throw "Odoo Client Error" popups whose overlay intercepts clicks, so this must never be able to
    // consume the whole test timeout.
    const doCleanup = (async () => {
      await test.step('beforeEach Step 1: Login as Admin (anh.ho) and navigate to CRM', async () => {
        console.log(`beforeEach Step 1: Logging in as Admin (${users.admin_crm.displayName})`);
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(users.admin_crm.username, users.admin_crm.password);
        await loginPage.dismissLocationPermissionDialog().catch(() => {});
        await homePage.navigateToCRM();
        await homePage.waitForPageReady();
        console.log('  ✓ Logged in as Admin and CRM opened');
      });

      // From here on, cap every per-action timeout on the cleanup page so a click that lands on a
      // pre-prod error/overlay fails fast (and is retried) instead of hanging until the test timeout.
      cleanupPage.setDefaultTimeout(CommonUtils.waitTimes.savingPage);

      // Guarded navigate + filter (used for the initial pass and re-used by the reload recovery below).
      // Each retries a few times, clearing any "Odoo Client Error" popup / blockUI overlay first.
      const navigateToAllLeadsGuarded = async (): Promise<void> => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await opportunityPage.dismissErrorDialog(CommonUtils.waitTimes.standard).catch(() => {});
          await opportunityPage.waitForBlockOverlayGone();
          try {
            await opportunityPage.navigateToAllLeads();
            return;
          } catch (e) {
            console.log(`  ⚠ Navigate to All Leads attempt ${attempt} failed (${e instanceof Error ? e.message.split('\n')[0] : String(e)}) - clearing error and retrying`);
            await opportunityPage.dismissErrorDialogWithRetry(3, CommonUtils.waitTimes.standard).catch(() => {});
          }
        }
      };
      const applyResellerFilterGuarded = async (): Promise<void> => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await opportunityPage.dismissErrorDialog(CommonUtils.waitTimes.standard).catch(() => {});
          await opportunityPage.waitForBlockOverlayGone();
          try {
            await opportunityPage.clickFilterButton();
            await opportunityPage.clickAddCustomFilter();
            await opportunityPage.selectCustomFilterField('Reseller');
            await opportunityPage.selectCustomFilterOperator('is equal to');
            await opportunityPage.selectCustomFilterValue(RESELLER_UNDER_TEST);
            await opportunityPage.clickApplyFilter();
            return;
          } catch (e) {
            console.log(`  ⚠ Apply Reseller filter attempt ${attempt} failed (${e instanceof Error ? e.message.split('\n')[0] : String(e)}) - clearing error and retrying`);
            await opportunityPage.dismissErrorDialogWithRetry(3, CommonUtils.waitTimes.standard).catch(() => {});
          }
        }
      };

      await test.step('beforeEach Step 2: Go to CRM > All Leads', async () => {
        console.log('beforeEach Step 2: Opening the All Leads list');
        await navigateToAllLeadsGuarded();
        console.log('  ✓ All Leads list opened');
      });

      await test.step(`beforeEach Step 3: Search Reseller is equal to "${RESELLER_UNDER_TEST}" (Reseller under test = ${users.reseller_bronze.username})`, async () => {
        console.log(`beforeEach Step 3: Filtering leads by Reseller = "${RESELLER_UNDER_TEST}"`);
        await applyResellerFilterGuarded();
        console.log('  ✓ "Reseller is equal to" filter applied');
      });

      await test.step('beforeEach Step 4-5: Check "all" then Action > Delete > OK (batches; reload + re-filter to clear a wedged page)', async () => {
        // Delete leftover leads in small batches. If pre-prod wedges the list page (a stuck blockUI
        // overlay that intercepts clicks), deleteFilteredRecordsInBatches returns early; we then hard-
        // reload the page (which clears the overlay), re-apply the filter, and continue - all inside the
        // cleanup budget.
        let total = 0;
        for (let round = 1; round <= CLEANUP_OUTER_ROUNDS; round++) {
          // requiredFacetText = RESELLER_UNDER_TEST: SAFETY - only delete while the Reseller facet is
          // applied, so a failed re-filter after a reload can never delete unrelated leads.
          total += await opportunityPage.deleteFilteredRecordsInBatches(CLEANUP_BATCH_SIZE, CLEANUP_MAX_DELETES, 2, RESELLER_UNDER_TEST);
          if (await opportunityPage.isRecordListEmpty()) {
            console.log(total === 0
              ? '  ✓ No leftover leads for this Reseller - nothing to delete'
              : `  ✓ Leftover Reseller leads deleted (${total} delete operation(s) of up to ${CLEANUP_BATCH_SIZE})`);
            return;
          }
          if (round < CLEANUP_OUTER_ROUNDS) {
            console.log(`  ⟳ Round ${round}: leads still remain (deleted ${total} so far) - reloading + re-filtering to clear a wedged page`);
            await cleanupPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await opportunityPage.waitForBlockOverlayGone();
            await navigateToAllLeadsGuarded();
            await applyResellerFilterGuarded();
          }
        }
        console.log(`  ⚠ Stopped after ${CLEANUP_OUTER_ROUNDS} reload rounds (deleted ${total}) - some leftover leads may remain (best-effort)`);
      });
    })().catch((e) => {
      // Cleanup is best-effort: never fail the test because leftover-data removal hit a snag.
      console.log(`  ⚠ beforeEach cleanup encountered an issue (continuing): ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    });

    // Hard budget: whatever happens, stop waiting on the cleanup after CLEANUP_BUDGET_MS so the test
    // body always gets to run within the 15-min test timeout.
    let budgetTimer: ReturnType<typeof setTimeout> | undefined;
    const budget = new Promise<void>((resolve) => {
      budgetTimer = setTimeout(() => {
        console.log(`  ⚠ beforeEach cleanup exceeded its ${CLEANUP_BUDGET_MS / 1000}s budget - abandoning (some leftover leads may remain)`);
        resolve();
      }, CLEANUP_BUDGET_MS);
    });
    await Promise.race([doCleanup, budget]);
    if (budgetTimer) clearTimeout(budgetTimer);
    await cleanupContext.close().catch(() => {});
    console.log('  ✓ beforeEach cleanup context closed - test will start a fresh session');
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-A.1.1: Verify Reseller submits a new product registration successful', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.1.1 ${compactDateTime}`;

    await test.step('Pre-condition 1: Prepare Internal Note #1 (deal-registration template)', async () => {
      console.log(`Pre-condition 1: Opp Name #1 = ${oppName} | Email = ${companyEmail}`);
    });

    // ===== Steps to reproduce #1: create the registration as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
    });

    // ===== Steps to reproduce #2: view the registration as the Reseller =====
    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_bronze.displayName})`);
    });

    await test.step('Steps to reproduce #2 - Step 2: After login successful, click "My Opportunities" button', async () => {
      await resellerPortalPage.clickMyOpportunities();
      console.log('✓ My Opportunities page opened');
    });

    await test.step('Verification #1: Opp Name #1 is displayed on the Reseller\'s My Opportunities page', async () => {
      const isListed = await resellerPortalPage.isOpportunityListed(oppName);
      const listedNames = await resellerPortalPage.getListedOpportunityNames();
      console.log(`  - Listed names (first page): ${JSON.stringify(listedNames)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.1 - Reseller My Opportunities (Opp Name #1 displayed)');
      expect(isListed, `Opp Name #1 "${oppName}" should be displayed on the Reseller's My Opportunities page`).toBeTruthy();
      console.log('✅ Reseller can see the submitted product registration in My Opportunities');
    });
  });
});
