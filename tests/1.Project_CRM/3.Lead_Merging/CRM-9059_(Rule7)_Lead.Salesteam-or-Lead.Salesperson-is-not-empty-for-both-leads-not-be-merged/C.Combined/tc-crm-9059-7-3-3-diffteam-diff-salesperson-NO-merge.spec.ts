/**
 * Lead Merging (Rule 7) - matrix C-3: DIFFERENT Sales Team AND DIFFERENT Salesperson
 * Test Case ID: CRM-9059_7.3.3
 * Automation-Type: new
 * Automation-Date: 2026-07-06
 *
 * Summary: Two same-email leads; Lead#1 = BDEU / Thomas Semerich, Lead#2 = CMR / Mark Jawad
 *   (both fields non-empty AND different) -> Rule 7 BLOCKS the merge -> the leads must NOT be
 *   merged. Known defect CRM-9059: currently they still merge (expected to FAIL).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-9059_7\.3\.3 " --project=chromium
 *   npx playwright test --grep "CRM-9059" --project=chromium
 *
 * Source manual TC (matrix C-3):
 *   Pre-condition: login; CRM > Leads.
 *   Lead#1: same email; Company Name Lead 1; Belgium/Flanders; Sales Team = BDEU; Salesperson = Thomas Semerich; Created manually = FALSE; Lead form = License.
 *   Lead#2: SAME email; Company Name Lead 2; Germany/Berlin; Sales Team = CMR; Salesperson = Mark Jawad; Created manually = FALSE; Lead form = License.
 *   Wait for the async merge window. Expected: BOTH leads remain Active - NO merge.
 */
import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import { createTwoSameEmailLeads, verifyNoMerge, leadMergingAfterEach } from '@helpers/lead-merging-rule7.helper';

test.describe('CRM-9059_7.3.3 [CRM-9059] - Lead Merging Rule 7: DIFFERENT Sales Team AND Salesperson (NO Merging)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await leadMergingAfterEach(page, testInfo);
  });

  // FIXME: Test marked as skip due to known bug CRM-9059 (leads still merge with DIFFERENT Sales Team AND Salesperson)
  test.skip('CRM-9059_7.3.3 [CRM-9059]: Verify leads do NOT merge with DIFFERENT Sales Team AND DIFFERENT Salesperson', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    testInfo.annotations.push({ type: 'defect', description: 'CRM-9059' });

    const r = await createTwoSameEmailLeads(page, testInfo, {
      tcId: 'CRM-9059_7.3.3',
      lead1: { salesTeam: 'BDEU', salesperson: 'Thomas Semerich' },
      lead2: { salesTeam: 'CMR', salesperson: 'Mark Jawad' },
    });

    console.log('Waiting for the async merge window (5 minutes)...');
    await page.waitForTimeout(CommonUtils.waitTimes.leadMergeObservation);

    await verifyNoMerge(page, testInfo, r);
  });
});
