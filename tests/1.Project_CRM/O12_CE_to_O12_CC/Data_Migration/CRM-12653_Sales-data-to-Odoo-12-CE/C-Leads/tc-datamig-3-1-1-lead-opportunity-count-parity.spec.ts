import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Part 3.1.1 - Lead and opportunity count parity within cut-off
 * Test Case ID: CRM-12653_3.1.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The number of leads (crm.lead with type='lead') and the number of opportunities
 *   (crm.lead with type='opportunity') created on or before the cut-off date are the
 *   same on both pre-production (source) and crm-mig (target). Adjusts for post-cut-off
 *   local test data on the target before comparing.
 *
 * Source manual TC (master sheet tab "CRM-12653 Data Migration Sales", row 3.1.1):
 *
 * Pre-conditions:
 *   VPN connected; both pre-production (Odoo 12 Enterprise) and crm-mig
 *   (Odoo 12 Community) are reachable.
 *   Login: anh.ho@nakivo.com (admin_crm for source, admin_crm_mig for target).
 *   Cut-off date already agreed; migration completed to the cut-off.
 *   Developer mode ON on both servers for filter visibility.
 *   Post-cut-off target count for crm.lead from CRM-12653_1.1.4 available.
 *
 * Steps to reproduce:
 *   1. On pre-production, count crm.lead with type='lead' on/before cut-off.
 *   2. On pre-production, count crm.lead with type='opportunity' on/before cut-off.
 *   3. On crm-mig, count crm.lead with type='lead' on/before cut-off.
 *   4. On crm-mig, count crm.lead with type='opportunity' on/before cut-off.
 *   5. On crm-mig, count post-cut-off records (local test data) for both types.
 *   6. Subtract post-cut-off counts from target to get parity counts.
 *   7. Compare: TARGET_LEADS_ADJ should equal SOURCE_LEADS, TARGET_OPPS_ADJ should equal SOURCE_OPPS.
 *   8. Verify type split: SOURCE_LEADS + SOURCE_OPPS should equal total source count.
 *
 * Verification Points:
 *   1. All four list view counts (source leads, source opps, target leads, target opps) exist and > 0.
 *   2. TARGET_LEADS_ADJ equals SOURCE_LEADS and TARGET_OPPS_ADJ equals SOURCE_OPPS (both differences = 0).
 *   3. SOURCE_LEADS + SOURCE_OPPS equals the total crm.lead count for the source window,
 *      and the same holds on the target; the split must not move records between the two types.
 *   4. Any non-zero difference is recorded as an exception with absolute value, percentage, and type.
 *
 * READ-ONLY: this spec only reads crm.lead records via RPC. It creates, modifies and deletes
 * nothing, as required on crm-mig.
 *
 * NOTE: Post-cut-off records on crm-mig are local QA test data created after the migration
 * cutoff. These are subtracted from target counts before comparison to isolate the migrated data.
 * crm-mig's data stops months before pre-production's, so every count is filtered by cut-off
 * using MigDataParityPage.onOrBeforeCutoff().
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_3\.1\.1:" --project=chromium
 */

async function openSession(
  browser: Browser, url: string, isMig: boolean, username: string, password: string,
): Promise<{ context: BrowserContext; parity: MigDataParityPage }> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const loginPage = isMig ? new LoginPageMig(page) : new LoginPage(page);
  await loginPage.navigateTo(url);
  await loginPage.login(username, password);
  return { context, parity: new MigDataParityPage(page) };
}

test.describe('CRM-12653 Part 3.1.1 - Lead and opportunity count parity', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_3.1.1: Lead and opportunity counts on or before cut-off are equal on source and target', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_3.1.1 - Lead and Opportunity Count Parity ==========');

      // Open target session first to resolve cut-off date
      await test.step('Pre-condition: Open session on crm-mig (target)', async () => {
        console.log('\n--- Pre-condition: Open session on crm-mig (target) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        const session = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        targetContext = session.context;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, { message: 'target session not authenticated on crm-mig' }).toBe(true);
      });

      // Open source session
      await test.step('Pre-condition: Open session on pre-production (source)', async () => {
        console.log('\n--- Pre-condition: Open session on pre-production (source) ---');
        console.log(`  Account : ${users.admin_crm.username}`);
        console.log(`  Source  : ${baseUrl}`);
        const session = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        sourceContext = session.context;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, { message: 'source session not authenticated on pre-production' }).toBe(true);
      });

      // Resolve cut-off from target
      const targetParityPage = new MigDataParityPage((await targetContext!.pages())[0]);
      const cutoff = await targetParityPage.resolveCutoffDate();
      console.log(`\n--- Cut-off date resolved on target: ${cutoff} ---`);

      const sourceParityPage = new MigDataParityPage((await sourceContext!.pages())[0]);

      // Counters
      let sourceLeads = 0;
      let sourceOpps = 0;
      let sourceTotalLeads = 0;
      let targetLeads = 0;
      let targetOpps = 0;
      let targetTotalLeads = 0;
      let targetLeadsPostCutoff = 0;
      let targetOppsPostCutoff = 0;
      let targetTotalLeadsPostCutoff = 0;

      await test.step('Step 1-2: Count leads and opportunities on source (on or before cut-off)', async () => {
        console.log('\n--- Step 1-2: Count leads and opportunities on source (on/before cut-off) ---');

        const sourceDomain = [...MigDataParityPage.onOrBeforeCutoff(cutoff)];

        // Count leads (type = 'lead')
        sourceLeads = await sourceParityPage.searchCount('crm.lead', [
          ...sourceDomain,
          ['type', '=', 'lead'],
        ]);
        console.log(`  Source leads (on/before ${cutoff}): ${sourceLeads}`);

        // Count opportunities (type = 'opportunity')
        sourceOpps = await sourceParityPage.searchCount('crm.lead', [
          ...sourceDomain,
          ['type', '=', 'opportunity'],
        ]);
        console.log(`  Source opportunities (on/before ${cutoff}): ${sourceOpps}`);

        // Total crm.lead (all types)
        sourceTotalLeads = await sourceParityPage.searchCount('crm.lead', sourceDomain);
        console.log(`  Source total crm.lead (on/before ${cutoff}): ${sourceTotalLeads}`);
      });

      await test.step('Step 3-4: Count leads and opportunities on target (on or before cut-off)', async () => {
        console.log('\n--- Step 3-4: Count leads and opportunities on target (on/before cut-off) ---');

        const targetDomain = [...MigDataParityPage.onOrBeforeCutoff(cutoff)];

        // Count leads (type = 'lead')
        targetLeads = await targetParityPage.searchCount('crm.lead', [
          ...targetDomain,
          ['type', '=', 'lead'],
        ]);
        console.log(`  Target leads (on/before ${cutoff}): ${targetLeads}`);

        // Count opportunities (type = 'opportunity')
        targetOpps = await targetParityPage.searchCount('crm.lead', [
          ...targetDomain,
          ['type', '=', 'opportunity'],
        ]);
        console.log(`  Target opportunities (on/before ${cutoff}): ${targetOpps}`);

        // Total crm.lead (all types)
        targetTotalLeads = await targetParityPage.searchCount('crm.lead', targetDomain);
        console.log(`  Target total crm.lead (on/before ${cutoff}): ${targetTotalLeads}`);
      });

      await test.step('Step 5: Count post-cut-off records on target (local test data)', async () => {
        console.log('\n--- Step 5: Count post-cut-off records on target (local test data) ---');

        const targetPostCutoffDomain = [...MigDataParityPage.afterCutoff(cutoff)];

        // Count post-cutoff leads
        targetLeadsPostCutoff = await targetParityPage.searchCount('crm.lead', [
          ...targetPostCutoffDomain,
          ['type', '=', 'lead'],
        ]);
        console.log(`  Target leads (after ${cutoff}): ${targetLeadsPostCutoff}`);

        // Count post-cutoff opportunities
        targetOppsPostCutoff = await targetParityPage.searchCount('crm.lead', [
          ...targetPostCutoffDomain,
          ['type', '=', 'opportunity'],
        ]);
        console.log(`  Target opportunities (after ${cutoff}): ${targetOppsPostCutoff}`);

        // Total post-cutoff crm.lead
        targetTotalLeadsPostCutoff = await targetParityPage.searchCount('crm.lead', targetPostCutoffDomain);
        console.log(`  Target total crm.lead (after ${cutoff}): ${targetTotalLeadsPostCutoff}`);
      });

      // Adjust target counts by subtracting post-cutoff local test data
      const targetLeadsAdjusted = targetLeads - targetLeadsPostCutoff;
      const targetOppsAdjusted = targetOpps - targetOppsPostCutoff;
      const targetTotalAdjusted = targetTotalLeads - targetTotalLeadsPostCutoff;

      const leadDifference = targetLeadsAdjusted - sourceLeads;
      const oppDifference = targetOppsAdjusted - sourceOpps;
      const leadDiffPercent = sourceLeads > 0 ? ((leadDifference / sourceLeads) * 100).toFixed(2) : '0.00';
      const oppDiffPercent = sourceOpps > 0 ? ((oppDifference / sourceOpps) * 100).toFixed(2) : '0.00';

      await test.step('Step 6-8: Verification and comparison', async () => {
        console.log('\n--- Step 6-8: Verification and comparison ---');
        console.log(`\n  Target leads adjusted: ${targetLeads} - ${targetLeadsPostCutoff} = ${targetLeadsAdjusted}`);
        console.log(`  Target opps adjusted: ${targetOpps} - ${targetOppsPostCutoff} = ${targetOppsAdjusted}`);
        console.log(`  Target total adjusted: ${targetTotalLeads} - ${targetTotalLeadsPostCutoff} = ${targetTotalAdjusted}`);

        if (leadDifference !== 0) {
          console.log(`\n  ⚠ Lead difference: ${leadDifference} (${leadDiffPercent}%)`);
        }
        if (oppDifference !== 0) {
          console.log(`\n  ⚠ Opportunity difference: ${oppDifference} (${oppDiffPercent}%)`);
        }
      });

      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - All four counts exist and are > 0:');
        console.log(`     Expected : source leads > 0, source opps > 0, target leads > 0, target opps > 0`);
        console.log(`     Actual   : source_leads=${sourceLeads}, source_opps=${sourceOpps}, target_leads=${targetLeads}, target_opps=${targetOpps}`);
        console.log(`     Result   : ${sourceLeads > 0 && sourceOpps > 0 && targetLeads > 0 && targetOpps > 0 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #2 - TARGET counts (adjusted) equal SOURCE counts:');
        console.log(`     Expected : target_leads_adj = source_leads AND target_opps_adj = source_opps`);
        console.log(`     Actual   : target_leads_adj=${targetLeadsAdjusted} (source=${sourceLeads}), target_opps_adj=${targetOppsAdjusted} (source=${sourceOpps})`);
        console.log(`     Differences : leads=${leadDifference}, opps=${oppDifference}`);
        console.log(`     Result   : ${targetLeadsAdjusted === sourceLeads && targetOppsAdjusted === sourceOpps ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #3 - Type split is consistent (sum equals total):');
        console.log(`     Expected : source_leads + source_opps = source_total AND target_leads_adj + target_opps_adj = target_total_adj`);
        console.log(`     Actual   : source ${sourceLeads} + ${sourceOpps} = ${sourceTotalLeads}, target ${targetLeadsAdjusted} + ${targetOppsAdjusted} = ${targetTotalAdjusted}`);
        console.log(`     Result   : ${sourceLeads + sourceOpps === sourceTotalLeads && targetLeadsAdjusted + targetOppsAdjusted === targetTotalAdjusted ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #4 - Non-zero differences recorded as exceptions:');
        if (leadDifference === 0 && oppDifference === 0) {
          console.log(`     Expected : no non-zero differences`);
          console.log(`     Actual   : no exceptions`);
          console.log(`     Result   : PASS`);
        } else {
          console.log(`     Expected : no non-zero differences`);
          const exceptions: string[] = [];
          if (leadDifference !== 0) {
            exceptions.push(`leads=${leadDifference} (${leadDiffPercent}%)`);
          }
          if (oppDifference !== 0) {
            exceptions.push(`opps=${oppDifference} (${oppDiffPercent}%)`);
          }
          console.log(`     Actual   : ${exceptions.join(', ')}`);
          console.log(`     Result   : FAIL`);
        }

        console.log('===============================================');
        const allPass = sourceLeads > 0 && sourceOpps > 0 && targetLeads > 0 && targetOpps > 0
          && targetLeadsAdjusted === sourceLeads && targetOppsAdjusted === sourceOpps
          && sourceLeads + sourceOpps === sourceTotalLeads && targetLeadsAdjusted + targetOppsAdjusted === targetTotalAdjusted;
        console.log(`OVERALL: ${allPass && leadDifference === 0 && oppDifference === 0 ? 'PASS' : 'FAIL'} - lead and opportunity counts match between source and target (adjusted for post-cutoff)`);

        expect(sourceLeads > 0, { message: 'source leads count is 0 - no leads found on source' }).toBe(true);
        expect(sourceOpps > 0, { message: 'source opportunities count is 0 - no opportunities found on source' }).toBe(true);
        expect(targetLeads > 0, { message: 'target leads count is 0 - no leads found on target' }).toBe(true);
        expect(targetOpps > 0, { message: 'target opportunities count is 0 - no opportunities found on target' }).toBe(true);
        expect(targetLeadsAdjusted, { message: `lead count mismatch: source=${sourceLeads} vs target (adjusted)=${targetLeadsAdjusted}, diff=${leadDifference} (${leadDiffPercent}%)` }).toBe(sourceLeads);
        expect(targetOppsAdjusted, { message: `opportunity count mismatch: source=${sourceOpps} vs target (adjusted)=${targetOppsAdjusted}, diff=${oppDifference} (${oppDiffPercent}%)` }).toBe(sourceOpps);
        expect(sourceLeads + sourceOpps, { message: 'source type split incorrect: leads + opps does not equal total' }).toBe(sourceTotalLeads);
        expect(targetLeadsAdjusted + targetOppsAdjusted, { message: 'target type split incorrect: leads + opps does not equal total (adjusted)' }).toBe(targetTotalAdjusted);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
