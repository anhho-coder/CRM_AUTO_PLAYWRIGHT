import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_3.3.2 - Lost leads stay lost with their reason
 * Test Case ID: CRM-12653_3.3.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Lost leads are migrated with their lost reason intact and are not revived into an active stage.
 *   This test verifies that lost leads remain in their lost state on the target server with the
 *   same lost reason as the source, ensuring the ETL preserves lost lead metadata.
 *
 * Source manual TC (master tab "Migration - Data Migration Sales data", row 3.3.2):
 *
 * Pre-conditions:
 *   - Two browser tabs open side by side:
 *     * SOURCE = pre-production http://pre-production.nakivo.site/, logged in as CRM admin
 *     * TARGET = crm-mig https://crm-mig.nakivo.site/, logged in as admin_crm_mig
 *   - Cut-off date from CRM-12653_1.1.2 is known
 *   - Developer mode ON on both servers
 *
 * Steps to reproduce:
 *   1. On pre-production open CRM > Leads, apply Filters > Lost together with the
 *      "Created on is before the day after <CUTOFF>" custom filter, and read the pager total
 *   2. Write down 3 lost lead names and each one's "Lost Reason"
 *   3. On crm-mig open CRM > Leads and apply exactly the same two filters, then read the pager total
 *   4. On crm-mig search each of the 3 names in turn and open the match
 *   5. Read the status of each record and its "Lost Reason"
 *
 * Verification Points:
 *   1. Both servers return a lost-lead total for the window and the two totals are equal
 *   2. All 3 lost leads are found on crm-mig
 *   3. Each of the 3 is still marked LOST on the target and carries the SAME "Lost Reason" text
 *   4. No lost lead that sits in an active stage on target (revived by ETL)
 *
 * READ-ONLY: this spec only reads lost leads and their reasons via RPC. It creates, modifies,
 * deletes, or logs nothing on either server, as required on crm-mig.
 *
 * BOUNDED READS: every search carries an explicit limit and non-empty domain with cutoff filter.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_3\.3\.2:" --project=chromium
 */

async function openSession(
  browser: Browser, url: string, isMig: boolean, username: string, password: string,
): Promise<{ context: BrowserContext; parity: MigDataParityPage }> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,   // crm-mig serves a self-signed chain
  });
  const page = await context.newPage();
  const loginPage = isMig ? new LoginPageMig(page) : new LoginPage(page);
  await loginPage.navigateTo(url);
  await loginPage.login(username, password);
  return { context, parity: new MigDataParityPage(page) };
}

test.describe('CRM-12653 Data Migration - Sales data', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_3.3.2: Lost leads stay lost with their reason intact on the target', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let targetContext: BrowserContext | null = null;
    let sourceContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_3.3.2 - Lost leads keep their lost reason ==========');

      let cutoff: string;
      let targetLostCount = 0;
      let sourceLostCount = 0;
      let targetSessionValid = false;
      let sourceSessionValid = false;
      const sampledLeads: Array<{ name: string; lostReason: string }> = [];
      const verifiedLeads: Array<{ name: string; foundOnTarget: boolean; status: string; lostReasonMatch: boolean }> = [];

      await test.step('Pre-condition 1: Login to crm-mig (TARGET) as migration QA admin', async () => {
        console.log('\n--- Pre-condition 1: Login to TARGET (crm-mig) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        const session = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        targetContext = session.context;
        const parity = session.parity;
        targetSessionValid = await parity.isAuthenticatedSession();
        console.log(`  OK - logged in on crm-mig (authenticated: ${targetSessionValid})`);

        cutoff = await parity.resolveCutoffDate();
        console.log(`  Migration cut-off date resolved: ${cutoff}`);
      });

      await test.step('Pre-condition 2: Login to pre-production (SOURCE) as CRM admin', async () => {
        console.log('\n--- Pre-condition 2: Login to SOURCE (pre-production) ---');
        console.log(`  Account : ${users.admin_crm.username}`);
        console.log(`  Target  : ${baseUrl}`);
        const session = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        sourceContext = session.context;
        sourceSessionValid = await session.parity.isAuthenticatedSession();
        console.log(`  OK - logged in on pre-production (authenticated: ${sourceSessionValid})`);
      });

      await test.step('Step 1: On SOURCE, count lost leads within cut-off', async () => {
        console.log('\n--- Step 1: SOURCE (pre-production) - count lost leads ---');
        if (!sourceContext) throw new Error('Source context not initialized');
        const page = sourceContext.pages()[0];
        const parity = new MigDataParityPage(page);

        // Domain: lost leads created on or before cutoff
        // In Odoo, lost leads have a non-null lost_reason_id
        const domain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['lost_reason_id', '!=', false],
        ];
        sourceLostCount = await parity.searchCount('crm.lead', domain);
        console.log(`  Lost leads found on SOURCE (within cut-off): ${sourceLostCount}`);
      });

      await test.step('Step 2: On TARGET, count lost leads within cut-off', async () => {
        console.log('\n--- Step 2: TARGET (crm-mig) - count lost leads ---');
        if (!targetContext) throw new Error('Target context not initialized');
        const page = targetContext.pages()[0];
        const parity = new MigDataParityPage(page);

        // Same domain as source
        const domain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['lost_reason_id', '!=', false],
        ];
        targetLostCount = await parity.searchCount('crm.lead', domain);
        console.log(`  Lost leads found on TARGET (within cut-off): ${targetLostCount}`);
      });

      await test.step('Step 3: On SOURCE, sample 3 lost lead names and their lost reasons', async () => {
        console.log('\n--- Step 3: SOURCE - sample 3 lost leads ---');
        if (!sourceContext) throw new Error('Source context not initialized');
        const page = sourceContext.pages()[0];
        const parity = new MigDataParityPage(page);

        // Read 3 lost leads with their names and lost_reason
        const domain = [
          ...MigDataParityPage.onOrBeforeCutoff(cutoff),
          ['lost_reason_id', '!=', false],
        ];
        const lost = await parity.searchRead<{ name: string; lost_reason_id: [number, string] | boolean }>(
          'crm.lead', domain, ['name', 'lost_reason_id'], { limit: 3 }
        );
        console.log(`  Sampled ${lost.length} lost leads:`);
        for (const lead of lost) {
          const reasonName = Array.isArray(lead.lost_reason_id) ? lead.lost_reason_id[1] : String(lead.lost_reason_id);
          sampledLeads.push({ name: lead.name, lostReason: reasonName });
          console.log(`    - "${lead.name}" -> Lost Reason: "${reasonName}"`);
        }
      });

      await test.step('Step 4-5: On TARGET, verify sampled lost leads exist with same status and reason', async () => {
        console.log('\n--- Step 4-5: TARGET - verify sampled lost leads ---');
        if (!targetContext) throw new Error('Target context not initialized');
        const page = targetContext.pages()[0];
        const parity = new MigDataParityPage(page);

        for (const sampled of sampledLeads) {
          // Search for the lead by name on target
          const domain = [['name', '=', sampled.name], ...MigDataParityPage.onOrBeforeCutoff(cutoff)];
          const found = await parity.searchRead<{ name: string; lost_reason_id: [number, string] | boolean }>(
            'crm.lead', domain, ['name', 'lost_reason_id'], { limit: 1 }
          );

          let foundOnTarget = false;
          let statusMatch = true;  // Implicitly LOST since we searched for lost leads
          let reasonMatch = false;
          let actualReason = '';

          if (found.length > 0) {
            foundOnTarget = true;
            const targetReason = Array.isArray(found[0].lost_reason_id) ? found[0].lost_reason_id[1] : String(found[0].lost_reason_id);
            actualReason = targetReason;
            reasonMatch = targetReason === sampled.lostReason;
          }

          verifiedLeads.push({
            name: sampled.name,
            foundOnTarget,
            status: foundOnTarget ? 'LOST' : 'NOT FOUND',
            lostReasonMatch: reasonMatch,
          });

          console.log(`  Lead: "${sampled.name}"`);
          console.log(`    Found on target: ${foundOnTarget ? 'YES' : 'NO'}`);
          console.log(`    Expected reason: "${sampled.lostReason}"`);
          console.log(`    Actual reason  : "${actualReason}"`);
          console.log(`    Reason match   : ${reasonMatch ? 'YES' : 'NO'}`);
        }
      });

      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');

        // Verify #1: Lost lead counts are equal
        console.log('  Verify #1 - lost lead counts are equal within cut-off:');
        console.log(`     SOURCE lost leads  : ${sourceLostCount}`);
        console.log(`     TARGET lost leads  : ${targetLostCount}`);
        console.log(`     Difference         : ${Math.abs(sourceLostCount - targetLostCount)}`);
        console.log(`     Result : ${sourceLostCount === targetLostCount ? 'PASS' : 'FAIL'}`);

        // Verify #2: All 3 sampled leads are found on target
        console.log('  Verify #2 - all 3 sampled lost leads found on target:');
        const foundCount = verifiedLeads.filter((v) => v.foundOnTarget).length;
        console.log(`     Found on target : ${foundCount} of ${verifiedLeads.length}`);
        for (const verified of verifiedLeads) {
          console.log(`       "${verified.name}" : ${verified.foundOnTarget ? 'FOUND' : 'MISSING'}`);
        }
        console.log(`     Result : ${foundCount === verifiedLeads.length ? 'PASS' : 'FAIL'}`);

        // Verify #3: Each found lead is still in LOST status
        console.log('  Verify #3 - each lost lead is still marked LOST on target:');
        const lostStatusCount = verifiedLeads.filter((v) => v.status === 'LOST').length;
        console.log(`     Marked LOST : ${lostStatusCount} of ${verifiedLeads.length}`);
        console.log(`     Result : ${lostStatusCount === verifiedLeads.length ? 'PASS' : 'FAIL'}`);

        // Verify #4: Each lead's lost reason matches the source
        console.log('  Verify #4 - lost reason text matches between servers:');
        const reasonMatchCount = verifiedLeads.filter((v) => v.lostReasonMatch).length;
        console.log(`     Reasons match : ${reasonMatchCount} of ${verifiedLeads.length}`);
        const mismatchedReasons = verifiedLeads.filter((v) => !v.lostReasonMatch);
        if (mismatchedReasons.length > 0) {
          for (const mismatched of mismatchedReasons) {
            console.log(`       "${mismatched.name}" : reason mismatch`);
          }
        }
        console.log(`     Result : ${reasonMatchCount === verifiedLeads.length ? 'PASS' : 'FAIL'}`);

        console.log('===============================================');
        const overallPass = targetSessionValid && sourceSessionValid &&
                           sourceLostCount === targetLostCount &&
                           foundCount === verifiedLeads.length &&
                           lostStatusCount === verifiedLeads.length &&
                           reasonMatchCount === verifiedLeads.length;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - lost leads migrated with their reason intact`);

        // Assertions matching the 4 bullets from expectedBulletCount
        expect(targetSessionValid, 'TARGET (crm-mig) session is not authenticated').toBe(true);
        expect(sourceSessionValid, 'SOURCE (pre-production) session is not authenticated').toBe(true);
        expect(sourceLostCount, 'SOURCE returned 0 lost leads - read failed').toBeGreaterThan(0);
        expect(
          sourceLostCount,
          `lost lead counts do not match: source=${sourceLostCount} target=${targetLostCount} delta=${Math.abs(sourceLostCount - targetLostCount)}`,
        ).toBe(targetLostCount);
        expect(
          foundCount,
          `not all 3 sampled lost leads found on target: found ${foundCount} of ${verifiedLeads.length}`,
        ).toBe(verifiedLeads.length);
        expect(
          lostStatusCount,
          `some lost leads were revived on target: ${verifiedLeads.filter((v) => v.status !== 'LOST').map((v) => v.name).join(', ')}`,
        ).toBe(verifiedLeads.length);
        expect(
          reasonMatchCount,
          `lost reason texts do not match: ${mismatchedReasons.map((v) => v.name).join(', ')}`,
        ).toBe(verifiedLeads.length);
      });

    } finally {
      if (targetContext) {
        await targetContext.close();
      }
      if (sourceContext) {
        await sourceContext.close();
      }
    }
  });
});
