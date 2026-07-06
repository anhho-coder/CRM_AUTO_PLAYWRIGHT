/**
 * Lead Merging (Rule 7) - matrix ST-3: same non-empty Sales Team on both (Salesperson empty)
 * Test Case ID: CRM-9059_7.1.3
 * Automation-Type: new
 * Automation-Date: 2026-07-06
 *
 * Summary: Two same-email leads; both Sales Team = BDEU (same), Salesperson empty on both
 *   -> Rule 7 does NOT block (Sales Team is non-empty on both but NOT different) -> the leads MERGE.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-9059_7\.1\.3 " --project=chromium
 *
 * Source manual TC (matrix ST-3):
 *   Pre-condition: login; CRM > Leads.
 *   Lead#1: same email; Company Name Lead 1; Belgium/Flanders; Sales Team = BDEU; Salesperson = (empty); Created manually = FALSE; Lead form = License.
 *   Lead#2: SAME email; Company Name Lead 2; Germany/Berlin; Sales Team = BDEU; Salesperson = (empty); Created manually = FALSE; Lead form = License.
 *   Wait for the async merge window. Expected: leads MERGE (Lead#2 archived, Lead#1 survives).
 */
import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import { createTwoSameEmailLeads, verifyMergeHappened, leadMergingAfterEach } from '@helpers/lead-merging-rule7.helper';

test.describe('CRM-9059_7.1.3 - Lead Merging Rule 7: same Sales Team on both (MERGE)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await leadMergingAfterEach(page, testInfo);
  });

  test('CRM-9059_7.1.3: Verify leads MERGE when both leads have the SAME Sales Team (BDEU)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const r = await createTwoSameEmailLeads(page, testInfo, {
      tcId: 'CRM-9059_7.1.3',
      lead1: { salesTeam: 'BDEU', salesperson: null },
      lead2: { salesTeam: 'BDEU', salesperson: null },
    });

    console.log('Waiting for the async merge window (5 minutes)...');
    await page.waitForTimeout(CommonUtils.waitTimes.leadMergeObservation);

    await verifyMergeHappened(page, testInfo, r);
  });
});
