/**
 * Lead Merging (Rule 7) - matrix ST-1: Sales Team empty on BOTH (Salesperson empty)
 * Test Case ID: CRM-9059_7.1.1
 * Automation-Type: new
 * Automation-Date: 2026-07-06
 *
 * Summary: Two same-email leads with Sales Team + Salesperson empty on both -> Rule 7 does NOT
 *   block (positive control) -> the leads MERGE. (Rule 7 blocks only when a field is non-empty
 *   on both leads AND different.)
 *
 * Command to run:
 *   npx playwright test --grep "CRM-9059_7\.1\.1 " --project=chromium
 *
 * Source manual TC (matrix ST-1):
 *   Pre-condition: login; CRM > Leads.
 *   Lead#1: same email; Company Name Lead 1; Belgium/Flanders; Sales Team = (empty); Salesperson = (empty); Created manually = FALSE; Lead form = License.
 *   Lead#2: SAME email; Company Name Lead 2; Germany/Berlin; Sales Team = (empty); Salesperson = (empty); Created manually = FALSE; Lead form = License.
 *   Wait for the async merge window. Expected: leads MERGE (Lead#2 archived, Lead#1 survives).
 */
import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import { createTwoSameEmailLeads, verifyMergeHappened, leadMergingAfterEach } from '@helpers/lead-merging-rule7.helper';

test.describe('CRM-9059_7.1.1 - Lead Merging Rule 7: Sales Team empty on both (MERGE)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await leadMergingAfterEach(page, testInfo);
  });

  test('CRM-9059_7.1.1: Verify leads MERGE when Sales Team + Salesperson are empty on both (baseline)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const r = await createTwoSameEmailLeads(page, testInfo, {
      tcId: 'CRM-9059_7.1.1',
      lead1: { salesTeam: null, salesperson: null },
      lead2: { salesTeam: null, salesperson: null },
    });

    console.log('Waiting for the async merge window (5 minutes)...');
    await page.waitForTimeout(CommonUtils.waitTimes.leadMergeObservation);

    await verifyMergeHappened(page, testInfo, r);
  });
});
