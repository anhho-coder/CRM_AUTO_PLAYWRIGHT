import { test, expect } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * ============================================================================================
 *  CRM-4383_1.3 - Salesperson: the "CREATE" button is hidden on an Opportunity's Quotations view
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-4383_1.3
 *  Jira:            CRM-4383 (regression of CRM-2329)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-11
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    The third Quotations screen named in the fix is the one scoped to an Opportunity (its linked
 *    quotations). This TC creates an Opportunity as the Salesperson, opens that Opportunity's
 *    Quotations view, and verifies the list opens with NO "CREATE" button (a Salesperson must create
 *    quotations only via the Opportunity's "New Quotation" button - see CRM-4383_2.1).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-4383_1\.3:" --project=chromium
 *
 *  Pre-conditions:
 *    - Login as a Salesperson (Ex: Thomas Semerich).
 *    - An Opportunity owned by that Salesperson (created in-test).
 *
 *  Steps:
 *    1. Create an Opportunity (as the Salesperson).
 *    2. Open that Opportunity's "Quotations" view; observe the list toolbar.
 *
 *  Expected Result:
 *    - The Opportunity's Quotations list opens, but there is NO "CREATE" button for the Salesperson.
 *
 *  Design notes:
 *    - "An Opportunity's Quotations" = act_window 364 (sale.order, domain
 *      [is_deal_element=False, opportunity_id=active_id]); reached by the hash-route deep link with the
 *      Opportunity id as active_id. The list is empty for a brand-new Opportunity - the assertion is on
 *      the CREATE button, which is hidden at the (shared) sale.order tree-view level.
 *    - The Opportunity is created with the proven deal-registration helper (createDealRegistration
 *      OpportunityAsThomas) and removed on teardown (deleteCreatedOpportunityAsAdmin, best-effort).
 */

const SKIP_CLEANUP_OPP = false;

test.describe('CRM-4383_1.3 - Salesperson: CREATE hidden on an Opportunity Quotations view', () => {

  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('X TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      await CommonUtils.waitForSpinnersToHide(page).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-4383_1.3: Salesperson sees no CREATE button on an Opportunity Quotations view', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);
    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST CRM-4383_1.3 ${compactDateTime}`;

    // Pre-condition: create the Opportunity as the Salesperson (Thomas). Grouped via the proven helper.
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition',
    });

    let oppId = '';
    await test.step('Step 1: Resolve the created Opportunity id', async () => {
      oppId = (createdOppUrl?.match(/[#?&]id=(\d+)/) || [])[1] || '';
      console.log(`  - Opportunity URL = ${createdOppUrl} | id = ${oppId}`);
      expect(oppId, 'The created Opportunity should have a numeric record id').toBeTruthy();
    });

    let listLoaded = false;
    let rowCount = 0;
    await test.step("Step 2: Open the Opportunity's Quotations view and observe the list", async () => {
      listLoaded = await quotationPage.openQuotationsList({ action: 364, menuId: 202, activeId: oppId });
      rowCount = await quotationPage.getQuotationsListRowCount();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, "Opportunity's Quotations view - Salesperson");
    });

    await test.step('Expected: the Opportunity Quotations list opens but there is NO "CREATE" button', async () => {
      const createVisible = await quotationPage.isListCreateButtonVisible();

      console.log('==== VERIFY (CRM-4383_1.3) ====');
      console.log("Expected: the Opportunity's Quotations view opens for the Salesperson AND the CREATE button is hidden");
      console.log(`Actual  : listLoaded=${listLoaded}, rows=${rowCount}, CREATE visible=${createVisible}`);
      console.log(`Result  : ${listLoaded && !createVisible ? 'PASS' : 'FAIL'}`);

      expect(listLoaded, "The Opportunity's Quotations view should open for the Salesperson").toBeTruthy();
      expect(createVisible, "CRM-4383: the \"CREATE\" button must be HIDDEN on an Opportunity's Quotations view for a Salesperson").toBeFalsy();
      console.log("✅ CRM-4383_1.3 verified: no CREATE button on the Opportunity's Quotations view for the Salesperson");
    });
  });
});
