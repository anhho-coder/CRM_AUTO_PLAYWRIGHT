/**
 * Lead Merging (Rule 7) - matrix C-1: same Sales Team, DIFFERENT Salesperson
 * Test Case ID: CRM-9059_7.3.1
 * Automation-Type: new
 * Automation-Date: 2026-07-06
 *
 * Summary: Two same-email leads; both Sales Team = BDEU (same), Lead#1 Salesperson = Thomas
 *   Semerich vs Lead#2 Salesperson = Mark Jawad (different) -> Rule 7 BLOCKS the merge (the
 *   Salesperson is non-empty on both AND different) -> the leads must NOT be merged. Known defect
 *   CRM-9059: currently they still merge (expected to FAIL). (Same scenario as CRM-2178_2.2.2.2.)
 *
 * Command to run:
 *   npx playwright test --grep "CRM-9059_7\.3\.1 " --project=chromium
 *   npx playwright test --grep "CRM-9059" --project=chromium
 *
 * Source manual TC (matrix C-1):
 *   Pre-condition: login; CRM > Leads.
 *   Lead#1: same email; Company Name Lead 1; Belgium/Flanders; Sales Team = BDEU; Salesperson = Thomas Semerich; Created manually = FALSE; Lead form = License.
 *   Lead#2: SAME email; Company Name Lead 2; Germany/Berlin; Sales Team = BDEU; Salesperson = Mark Jawad; Created manually = FALSE; Lead form = License.
 *   Wait for the async merge window. Expected: BOTH leads remain Active - NO merge.
 */
import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import { createTwoSameEmailLeads, verifyNoMerge, leadMergingAfterEach } from '@helpers/lead-merging-rule7.helper';

test.describe('CRM-9059_7.3.1 [CRM-9059] - Lead Merging Rule 7: same Sales Team, DIFFERENT Salesperson (NO Merging)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await leadMergingAfterEach(page, testInfo);
  });

  // FIXME: Test marked as skip due to known bug CRM-9059 (leads still merge with same Sales Team but DIFFERENT Salesperson)
  test.skip('CRM-9059_7.3.1 [CRM-9059]: Verify leads do NOT merge with same Sales Team but DIFFERENT Salesperson', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    testInfo.annotations.push({ type: 'defect', description: 'CRM-9059' });

    const r = await createTwoSameEmailLeads(page, testInfo, {
      tcId: 'CRM-9059_7.3.1',
      lead1: { salesTeam: 'BDEU', salesperson: 'Thomas Semerich' },
      lead2: { salesTeam: 'BDEU', salesperson: 'Mark Jawad' },
    });

    console.log('Waiting for the async merge window (5 minutes)...');
    await page.waitForTimeout(CommonUtils.waitTimes.leadMergeObservation);

    await verifyNoMerge(page, testInfo, r);
  });
});
