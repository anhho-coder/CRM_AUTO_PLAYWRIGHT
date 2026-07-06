/**
 * Lead Merging (Rule 7) - matrix C-2: DIFFERENT Sales Team, same Salesperson
 * Test Case ID: CRM-9059_7.3.2
 * Automation-Type: new
 * Automation-Date: 2026-07-06
 *
 * Summary: Two same-email leads; Lead#1 Sales Team = BDEU vs Lead#2 Sales Team = CMR (different),
 *   both Salesperson = Thomas Semerich (same) -> Rule 7 BLOCKS the merge (the Sales Team is
 *   non-empty on both AND different) -> the leads must NOT be merged. Known defect CRM-9059:
 *   currently they still merge (expected to FAIL).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-9059_7\.3\.2 " --project=chromium
 *   npx playwright test --grep "CRM-9059" --project=chromium
 *
 * Source manual TC (matrix C-2):
 *   Pre-condition: login; CRM > Leads.
 *   Lead#1: same email; Company Name Lead 1; Belgium/Flanders; Sales Team = BDEU; Salesperson = Thomas Semerich; Created manually = FALSE; Lead form = License.
 *   Lead#2: SAME email; Company Name Lead 2; Germany/Berlin; Sales Team = CMR; Salesperson = Thomas Semerich; Created manually = FALSE; Lead form = License.
 *   Wait for the async merge window. Expected: BOTH leads remain Active - NO merge.
 */
import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import { createTwoSameEmailLeads, verifyNoMerge, leadMergingAfterEach } from '@helpers/lead-merging-rule7.helper';

test.describe('CRM-9059_7.3.2 [CRM-9059] - Lead Merging Rule 7: DIFFERENT Sales Team, same Salesperson (NO Merging)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await leadMergingAfterEach(page, testInfo);
  });

  // FIXME: Test marked as skip due to known bug CRM-9059 (leads still merge with DIFFERENT Sales Team but same Salesperson)
  test.skip('CRM-9059_7.3.2 [CRM-9059]: Verify leads do NOT merge with DIFFERENT Sales Team but same Salesperson', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    testInfo.annotations.push({ type: 'defect', description: 'CRM-9059' });

    const r = await createTwoSameEmailLeads(page, testInfo, {
      tcId: 'CRM-9059_7.3.2',
      lead1: { salesTeam: 'BDEU', salesperson: 'Thomas Semerich' },
      lead2: { salesTeam: 'CMR', salesperson: 'Thomas Semerich' },
    });

    console.log('Waiting for the async merge window (5 minutes)...');
    await page.waitForTimeout(CommonUtils.waitTimes.leadMergeObservation);

    await verifyNoMerge(page, testInfo, r);
  });
});
