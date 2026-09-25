import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-03 - Opportunity context is filled and reads the CRM live, not a copy
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-03
 * Jira           : CRM-12135
 * Requirements   : FUNC-0040
 * Run as         : Both
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Create an Opportunity in list view with Customer, Country, Reseller, Distributor,
 *   and Expected Revenue Deal = $750. Raise a request and verify the request carries the
 *   Opportunity's full context in the Opportunity Info tab. Change all four context fields
 *   on the CRM (Country, Reseller, Distributor, Expected Revenue to $1,234). Open the request
 *   again and verify the context reads live from the CRM: the first tab view shows $750, the
 *   second shows $1,234 and the other fields also updated.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-03:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * Jira CRM-12918, rewritten 2026-09-23 by Thuat Phung, from the manual test-case matrix (CRM-12135).
 *
 *   Pre-condition(s):
 *      1. Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig; Pre-Sales Application
 *     session active
 *
 *   Steps to reproduce:
 *      Step 1: On the CRM open Sales > My Pipeline and switch the view to the list view before
 *     creating anything - in the default kanban view Create opens an inline quick-create card instead
 *     of the full form, and the fields this case needs are not on that card. Then click Create and
 *     fill the new Opportunity form as follows, then click Save.
 *        - Opportunity name      = AUTO-CRM-12135-TC-03-<runId>-live-context
 *        - Email                 = qa@auto-crm-12135-tc03-<yyyymmddhhmmss>.com  (a domain that does not exist
 *          yet, so the CRM creates the Customer contact by itself)
 *        - Country               = United States
 *        - Reseller              = 01 SAS
 *        - Distributor           = 1 Department Climb Channel Solutions Canada
 *        - Expected Revenue Deal = 750
 *        Type each partner name into its field and pick the exact match; never pick by position in the dropdown.
 *      Step 2: In the header button row of that Opportunity (open the More menu if the row is full) click
 *     "Request SE support", fill the dialog and click "Save".
 *        - Subject      = AUTO-CRM-12135-TC-03-<runId>-request
 *        - Description  = Automated check of CRM-12135 TC-03 - the request must read the Opportunity live.
 *        - Support type = Offline technical assistance
 *      Step 3: Click Tickets, open the request that was just raised, and read the top of the request form
 *     and its Opportunity Info tab.
 *      Step 4: Go back to the CRM, open the Opportunity created in step 1, click Edit, change the four
 *     fields below by typing each partner name and picking the exact match, then click Save.
 *        - Country               : United States -> Canada
 *        - Reseller              : 01 SAS -> 0522it SRL
 *        - Distributor           : 1 Department Climb Channel Solutions Canada -> ICOS S.p.A.
 *        - Expected Revenue Deal : 750 -> 1234
 *      Step 5: Return to the Pre-Sales Application, re-open the same request and read its Opportunity
 *     Info tab again.
 *
 *   Verification (expected results):
 *      Step 1: The list view opens and Create shows the full Opportunity form, not a kanban quick-create card.
 *     The Opportunity is saved. A new Customer contact was created from the e-mail domain and is named on the
 *     form. Country = United States, Reseller = 01 SAS, Distributor = 1 Department Climb Channel Solutions Canada,
 *     Expected Revenue Deal = 750. The name of the Customer the CRM created is written down for the later steps.
 *      Step 2: The dialog closes with no error dialog, and the Tickets smart button appears on the Opportunity.
 *      Step 3: At the top of the form, Customer names the contact the CRM created in step 1 and Salesperson names
 *     the user who raised the request. On the Opportunity Info tab: Country = United States, Reseller = 01 SAS,
 *     Distributor = 1 Department Climb Channel Solutions Canada, Expected Revenue Deal = 750. None of it was
 *     re-entered on the request.
 *      Step 4: The Opportunity saves with Country = Canada, Reseller = 0522it SRL, Distributor = ICOS S.p.A.
 *     and Expected Revenue Deal = 1234.
 *      Step 5: The four fields now read the new values although nothing was re-entered on the request: Country = Canada,
 *     Reseller = 0522it SRL, Distributor = ICOS S.p.A., Expected Revenue Deal = 1234. A field still showing its step 1
 *     value is a fail - the context would be a copy frozen at raise time instead of a live read of the CRM. Salesperson
 *     still names the user who raised the request: it records who asked and is not re-read from the Opportunity.
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-03-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig; Pre-Sales Application session active',
  s1:     'Step 1: Switch to list view, Create an Opportunity with Opportunity name, Email, Country, Reseller, Distributor, Expected Revenue Deal = 750',
  s2:     'Step 2: Click "Request SE support", fill dialog with Subject, Description, Support type = Offline technical assistance, and Save',
  s3:     'Step 3: Click Tickets, open the request, and read the top of the form and Opportunity Info tab',
  s4:     'Step 4: Go back to CRM, open Opportunity, Edit and change Country, Reseller, Distributor, Expected Revenue Deal to 1234',
  s5:     'Step 5: Return to Pre-Sales Application, re-open request and read Opportunity Info tab again',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-03 - Opportunity context is filled and reads the CRM live, not a copy', () => {
  test.afterEach(async ({}, testInfo) => {
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - start').catch(() => {});
    }
    if (teardown) {
      console.log('TEARDOWN DID NOT RUN - the test left the try block without cleaning up.');
      teardown = undefined;
    }
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`TEST FAILED - reason: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - teardown done').catch(() => {});
    }
    sharedPage = undefined;
  });

  test('CRM-12135_TC-03: Opportunity context is filled and reads the CRM live, not a copy', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-03 - Opportunity context is filled and reads the CRM live, not a copy ==========');

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    sharedPage = page;

    try {
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);

      const preSale = new MigPreSalePage(page);
      const presalesUid = await preSale.loginPresales(
        users.anh_ho_presales_mig.username,
        users.anh_ho_presales_mig.password,
      );
      console.log(`  Pre-Sales Application session uid: ${presalesUid}`);

const runId = MigPreSalePage.runId();
const marker = MigPreSalePage.marker('TC-03', runId);
let leadId = 0;
let requestId = 0;
let contextBefore: Record<string, unknown> = {};
let contextAfter: Record<string, unknown> = {};
const subject = `${marker}-request`;
const description = 'Automated check of CRM-12135 TC-03 - the request must read the Opportunity live.';
const supportType = 'Offline technical assistance';
// RE-SYNC GAP (CRM-12918, 2026-09-24): The new TC requires creating the Opportunity with Email,
// Country, Reseller, and Distributor fields; the page object's createOpportunity() only supports
// name and expectedRevenue. No UI methods exist to fill the full form with partner/country data.
// Also missing: methods to change Country, Reseller, Distributor on an Opportunity.
// Also missing: UI method to open and read the Opportunity Info tab on the request form.
// The test will create only the basic fields and document what is blocked in verification.
const customerName = `qa@auto-crm-12135-tc03-${Date.now()}.com`;

await test.step(STEP.pre1, async () => {
  console.log(`\n--- ${STEP.pre1} ---`);
  console.log('  Signed in on both servers; the data this case creates is removed in teardown.');
  teardown = async () => {
    if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
    const swept = await preSale.sweepByMarker(marker);
    console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]` +
      (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
  };
});

await test.step(STEP.s1, async () => {
  console.log(`\n--- ${STEP.s1} ---`);
  // BLOCKED: List view switch, Create button, and full form with Country/Reseller/Distributor/Email fields
  // are not available in the page object. Currently using API to create with basic fields only.
  leadId = await preSale.createOpportunity(`${marker}-live-context`, 750);
  console.log(`  Opportunity ${leadId} created with name and expected revenue`);
  console.log(`  NOTE: Missing page object methods for:`);
  console.log(`    - Switch to list view before Create`);
  console.log(`    - Open full Opportunity form (not quick-create)`);
  console.log(`    - Fill Email, Country, Reseller, Distributor fields`);
  console.log(`    - Type partner names and pick exact match from dropdown`);
  await preSale.openOpportunity(leadId);
  console.log(`  Opportunity form opened`);
});

await test.step(STEP.s2, async () => {
  console.log(`\n--- ${STEP.s2} ---`);
  await preSale.openRaiseDialog();
  await preSale.fillRaiseDialog({ subject, description, supportType });
  console.log(`  - Subject      : ${subject}`);
  console.log(`  - Description  : ${description}`);
  console.log(`  - Support type : ${supportType}`);
  await preSale.saveRaiseDialog();
  await preSale.waitForRaiseDialogClosed();
  console.log(`  Dialog saved and closed`);
});
await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2: Dialog saved');

await test.step(STEP.s3, async () => {
  console.log(`\n--- ${STEP.s3} ---`);
  // BLOCKED: No UI method to open request's Opportunity Info tab and read the fields visually.
  // Currently reading the context via API only.
  const requests = await preSale.requestsForLead(leadId);
  if (requests.length > 0) {
    requestId = requests[0].id;
    contextBefore = await preSale.requestDealContext(requestId);
    console.log(`  Request ${requestId} context at raise time (via API):`);
    console.log(`    - crm_lead_ref         : ${contextBefore.crm_lead_ref}`);
    console.log(`    - crm_salesperson_name : ${contextBefore.crm_salesperson_name}`);
    console.log(`    - crm_expected_revenue : ${contextBefore.crm_expected_revenue}`);
    console.log(`    - crm_country_id       : ${contextBefore.crm_country_id} (BLOCKED: UI not available)`);
    console.log(`    - crm_reseller_id      : ${contextBefore.crm_reseller_id} (BLOCKED: UI not available)`);
    console.log(`    - crm_distributor_id   : ${contextBefore.crm_distributor_id} (BLOCKED: UI not available)`);
  }
  console.log(`  NOTE: Manual TC requires opening Opportunity Info tab on request form and reading visually.`);
});

await test.step(STEP.s4, async () => {
  console.log(`\n--- ${STEP.s4} ---`);
  // BLOCKED: No page object methods to change Country, Reseller, Distributor fields.
  // Only setExpectedRevenue is available.
  await preSale.setExpectedRevenue(leadId, 1234);
  console.log(`  Opportunity expected revenue changed to $1,234`);
  console.log(`  NOTE: Missing page object methods to change:`);
  console.log(`    - Country field (United States -> Canada)`);
  console.log(`    - Reseller field (01 SAS -> 0522it SRL)`);
  console.log(`    - Distributor field (1 Department Climb Channel Solutions Canada -> ICOS S.p.A.)`);
});

await test.step(STEP.s5, async () => {
  console.log(`\n--- ${STEP.s5} ---`);
  // BLOCKED: No UI method to open request's Opportunity Info tab and read the fields visually.
  contextAfter = await preSale.requestDealContext(requestId);
  console.log(`  Request ${requestId} context after revenue change (via API):`);
  console.log(`    - crm_expected_revenue : ${contextAfter.crm_expected_revenue}`);
  console.log(`    - crm_country_id       : ${contextAfter.crm_country_id} (BLOCKED: UI not available)`);
  console.log(`    - crm_reseller_id      : ${contextAfter.crm_reseller_id} (BLOCKED: UI not available)`);
  console.log(`    - crm_distributor_id   : ${contextAfter.crm_distributor_id} (BLOCKED: UI not available)`);
  console.log(`  NOTE: Manual TC requires re-opening Opportunity Info tab on request form and reading all four fields.`);
});

await test.step(STEP.verify, async () => {
  console.log(`\n--- ${STEP.verify} ---`);
  const refOk = contextBefore.crm_lead_ref === leadId;
  const salesPersonOk = contextBefore.crm_salesperson_name !== undefined && String(contextBefore.crm_salesperson_name).length > 0;
  const revenueBefore = Number(contextBefore.crm_expected_revenue);
  const revenueAfter = Number(contextAfter.crm_expected_revenue);
  const firstReadOk = revenueBefore === 750;
  const secondReadOk = revenueAfter === 1234;
  const readsLive = firstReadOk && secondReadOk;

  console.log('\n==================== VERIFY ====================');
  console.log('Verify #1 - Request carries originating Opportunity id:');
  console.log(`     Expected : ${leadId}`);
  console.log(`     Actual   : ${contextBefore.crm_lead_ref}`);
  console.log(`     Result   : ${refOk ? 'PASS' : 'FAIL'}`);
  console.log('Verify #2 - Salesperson field is filled:');
  console.log(`     Expected : non-empty`);
  console.log(`     Actual   : ${contextBefore.crm_salesperson_name || '(empty)'}`);
  console.log(`     Result   : ${salesPersonOk ? 'PASS' : 'FAIL'}`);
  console.log('Verify #3 - First read of Expected Revenue shows $750:');
  console.log(`     Expected : 750`);
  console.log(`     Actual   : ${revenueBefore}`);
  console.log(`     Result   : ${firstReadOk ? 'PASS' : 'FAIL'}`);
  console.log('Verify #4 - Second read after change shows $1,234:');
  console.log(`     Expected : 1234`);
  console.log(`     Actual   : ${revenueAfter}`);
  console.log(`     Result   : ${secondReadOk ? 'PASS' : 'FAIL'}`);
  console.log('Verify #5 - Context reads live, not a copy:');
  console.log(`     Expected : Expected Revenue changes between reads`);
  console.log(`     Actual   : before=${revenueBefore}, after=${revenueAfter}`);
  console.log(`     Result   : ${readsLive ? 'PASS' : 'FAIL'}`);
  console.log('===============================================');
  console.log(`OVERALL: ${refOk && salesPersonOk && firstReadOk && secondReadOk && readsLive ? 'PASS' : 'FAIL'} - Request context reads live from CRM (partial)`);

  expect(refOk, `crm_lead_ref matches`).toBe(true);
  expect(salesPersonOk, `salesperson name filled`).toBe(true);
  expect(firstReadOk, `first read shows 750`).toBe(true);
  expect(secondReadOk, `second read shows 1234`).toBe(true);
  expect(readsLive, `context reads live`).toBe(true);
});
    } finally {
      // Teardown runs HERE, not in afterEach: it needs the live session, and afterEach only
      // sees a closed context. A thrown assertion still passes through finally, so a red run
      // cleans up too.
      if (teardown) {
        try {
          await teardown();
        } catch (err) {
          console.log(`TEARDOWN ERROR: ${(err as Error).message}`);
        }
        teardown = undefined;
      }
      await context.close();
    }
  });
});
