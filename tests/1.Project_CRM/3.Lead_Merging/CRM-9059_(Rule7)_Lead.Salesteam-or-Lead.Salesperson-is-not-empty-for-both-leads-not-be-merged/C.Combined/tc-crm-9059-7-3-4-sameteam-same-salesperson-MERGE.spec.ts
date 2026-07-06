/**
 * Lead Merging (Rule 7) - matrix C-4: same Sales Team AND same Salesperson
 * Test Case ID: CRM-9059_7.3.4
 * Automation-Type: new
 * Automation-Date: 2026-07-06
 *
 * Summary: Two same-email leads; both Sales Team = BDEU (same) and both Salesperson = Thomas
 *   Semerich (same) -> Rule 7 does NOT block (neither field differs) -> the leads MERGE
 *   (positive control).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-9059_7\.3\.4 " --project=chromium
 *
 * Source manual TC (matrix C-4):
 *   Pre-condition: login; CRM > Leads.
 *   Lead#1: same email; Company Name Lead 1; Belgium/Flanders; Sales Team = BDEU; Salesperson = Thomas Semerich; Created manually = FALSE; Lead form = License.
 *   Lead#2: SAME email; Company Name Lead 2; Germany/Berlin; Sales Team = BDEU; Salesperson = Thomas Semerich; Created manually = FALSE; Lead form = License.
 *   Wait for the async merge window. Expected: leads MERGE (Lead#2 archived, Lead#1 survives).
 */
import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import { createTwoSameEmailLeads, verifyMergeHappened, leadMergingAfterEach } from '@helpers/lead-merging-rule7.helper';

test.describe('CRM-9059_7.3.4 - Lead Merging Rule 7: same Sales Team AND same Salesperson (MERGE)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await leadMergingAfterEach(page, testInfo);
  });

  test('CRM-9059_7.3.4: Verify leads MERGE when both Sales Team and Salesperson are the SAME', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const r = await createTwoSameEmailLeads(page, testInfo, {
      tcId: 'CRM-9059_7.3.4',
      lead1: { salesTeam: 'BDEU', salesperson: 'Thomas Semerich' },
      lead2: { salesTeam: 'BDEU', salesperson: 'Thomas Semerich' },
    });

    console.log('Waiting for the async merge window (5 minutes)...');
    await page.waitForTimeout(CommonUtils.waitTimes.leadMergeObservation);

    await verifyMergeHappened(page, testInfo, r);
  });
});
