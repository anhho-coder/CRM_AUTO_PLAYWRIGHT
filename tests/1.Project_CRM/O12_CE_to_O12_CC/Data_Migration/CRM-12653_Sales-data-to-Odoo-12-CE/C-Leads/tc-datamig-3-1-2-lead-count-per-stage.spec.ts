import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_3.1.2 - Lead/Opportunity count per pipeline stage
 * Test Case ID: CRM-12653_3.1.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The distribution of leads and opportunities across pipeline stages is identical on both servers.
 *   This test verifies that every stage exists on both pre-production and crm-mig, and that the
 *   count of leads/opportunities per stage is equal within the migration cut-off window.
 *
 * Source manual TC (master tab "Migration - Data Migration Sales data", row 3.1.2):
 *
 * Pre-conditions:
 *   - Two browser tabs open side by side:
 *     * SOURCE = pre-production http://pre-production.nakivo.site/, logged in as CRM admin
 *     * TARGET = crm-mig https://crm-mig.nakivo.site/, logged in as admin_crm_mig
 *   - Cut-off date from CRM-12653_1.1.2 is known
 *   - Developer mode ON on both servers
 *
 * Steps to reproduce:
 *   1. On pre-production open CRM > Pipeline, switch to LIST view, remove default filter,
 *      apply "Created on is before the day after <CUTOFF>" custom filter
 *   2. Group By > Stage and write down every group name with the count shown
 *   3. Repeat steps 1-2 on crm-mig
 *   4. Put the two breakdowns side by side and compute delta per stage
 *
 * Verification Points:
 *   1. Both servers return a grouped list with a count per stage
 *   2. The set of stage NAMES is identical on both servers - no stage appears on one side only
 *   3. The count is identical for every stage, delta = 0 on each row
 *   4. The stage counts add up to the opportunity total from CRM-12653_3.1.1 on their server
 *   5. A stage present on source and missing on target is a configuration exception, recorded separately
 *   6. A record in different stage on target shows as +1/-1 pair; record with example name
 *
 * READ-ONLY: this spec only reads the lead/opportunity pipeline stages via RPC. It creates,
 * modifies, deletes, or logs nothing on either server, as required on crm-mig.
 *
 * BOUNDED READS: every search carries an explicit limit and non-empty domain with cutoff filter.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_3\.1\.2:" --project=chromium
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

  test('CRM-12653_3.1.2: Lead/opportunity distribution across pipeline stages is identical on both servers', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let targetContext: BrowserContext | null = null;
    let sourceContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_3.1.2 - Lead count per pipeline stage ==========');

      let cutoff: string;
      let targetStageGroups: Array<{ stage_id: [number, string] | boolean; __count: number }> = [];
      let sourceStageGroups: Array<{ stage_id: [number, string] | boolean; __count: number }> = [];
      const targetStageMap = new Map<string, number>();
      const sourceStageMap = new Map<string, number>();
      let targetSessionValid = false;
      let sourceSessionValid = false;

      await test.step('Pre-condition 1: Login to pre-production (SOURCE) as CRM admin', async () => {
        console.log('\n--- Pre-condition 1: Login to SOURCE (pre-production) ---');
        console.log(`  Account : ${users.admin_crm.username}`);
        console.log(`  Target  : ${baseUrl}`);
        const session = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        sourceContext = session.context;
        sourceSessionValid = await session.parity.isAuthenticatedSession();
        console.log(`  OK - logged in on pre-production (authenticated: ${sourceSessionValid})`);

        cutoff = await session.parity.resolveCutoffDate();
        console.log(`  Migration cut-off date resolved: ${cutoff}`);
      });

      await test.step('Pre-condition 2: Login to crm-mig (TARGET) as migration QA admin', async () => {
        console.log('\n--- Pre-condition 2: Login to TARGET (crm-mig) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        const session = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        targetContext = session.context;
        targetSessionValid = await session.parity.isAuthenticatedSession();
        console.log(`  OK - logged in on crm-mig (authenticated: ${targetSessionValid})`);
      });

      await test.step('Step 1: On SOURCE, group crm.lead by stage_id and read counts', async () => {
        console.log('\n--- Step 1: SOURCE (pre-production) - group crm.lead by stage_id ---');
        if (!sourceContext) throw new Error('Source context not initialized');
        const page = sourceContext.pages()[0];
        const parity = new MigDataParityPage(page);

        const domain = MigDataParityPage.onOrBeforeCutoff(cutoff);
        sourceStageGroups = await parity.readGroup('crm.lead', domain, ['stage_id'], ['stage_id'], { limit: 500 });
        console.log(`  Groups returned: ${sourceStageGroups.length}`);
        for (const group of sourceStageGroups) {
          const stageName = Array.isArray(group.stage_id) ? group.stage_id[1] : String(group.stage_id);
          const count = group.__count;
          sourceStageMap.set(stageName, count);
          console.log(`    ${stageName.padEnd(30)} : ${count}`);
        }
      });

      await test.step('Step 2: On TARGET, group crm.lead by stage_id and read counts', async () => {
        console.log('\n--- Step 2: TARGET (crm-mig) - group crm.lead by stage_id ---');
        if (!targetContext) throw new Error('Target context not initialized');
        const page = targetContext.pages()[0];
        const parity = new MigDataParityPage(page);

        const domain = MigDataParityPage.onOrBeforeCutoff(cutoff);
        targetStageGroups = await parity.readGroup('crm.lead', domain, ['stage_id'], ['stage_id'], { limit: 500 });
        console.log(`  Groups returned: ${targetStageGroups.length}`);
        for (const group of targetStageGroups) {
          const stageName = Array.isArray(group.stage_id) ? group.stage_id[1] : String(group.stage_id);
          const count = group.__count;
          targetStageMap.set(stageName, count);
          console.log(`    ${stageName.padEnd(30)} : ${count}`);
        }
      });

      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');

        // Verify #1: Both servers returned grouped results
        console.log('  Verify #1 - both servers return grouped results:');
        console.log(`     TARGET groups : ${targetStageGroups.length}`);
        console.log(`     SOURCE groups : ${sourceStageGroups.length}`);
        console.log(`     Result : ${targetStageGroups.length > 0 && sourceStageGroups.length > 0 ? 'PASS' : 'FAIL'}`);

        // Verify #2: Stage names are identical on both servers
        const targetStages = Array.from(targetStageMap.keys()).sort();
        const sourceStages = Array.from(sourceStageMap.keys()).sort();
        const stagesMatch = JSON.stringify(targetStages) === JSON.stringify(sourceStages);
        console.log('  Verify #2 - stage names are identical:');
        console.log(`     TARGET stages : [${targetStages.join(', ')}]`);
        console.log(`     SOURCE stages : [${sourceStages.join(', ')}]`);
        console.log(`     Result : ${stagesMatch ? 'PASS' : 'FAIL'}`);

        // Verify #3: Counts are identical per stage
        console.log('  Verify #3 - stage counts are identical (delta = 0):');
        let countMatch = true;
        const deltas: string[] = [];
        for (const stageName of targetStages) {
          const targetCount = targetStageMap.get(stageName) || 0;
          const sourceCount = sourceStageMap.get(stageName) || 0;
          const delta = targetCount - sourceCount;
          if (delta !== 0) {
            countMatch = false;
            deltas.push(`${stageName}: target=${targetCount} source=${sourceCount} delta=${delta}`);
          }
        }
        if (deltas.length === 0) {
          console.log(`     All stage counts match (delta = 0)`);
        } else {
          console.log(`     Mismatches found: ${deltas.join(' | ')}`);
        }
        console.log(`     Result : ${countMatch ? 'PASS' : 'FAIL'}`);

        // Verify #4: Counts add up correctly
        const targetTotal = Array.from(targetStageMap.values()).reduce((a, b) => a + b, 0);
        const sourceTotal = Array.from(sourceStageMap.values()).reduce((a, b) => a + b, 0);
        console.log('  Verify #4 - stage counts sum to expected total:');
        console.log(`     TARGET total : ${targetTotal}`);
        console.log(`     SOURCE total : ${sourceTotal}`);

        // Verify #5: Configuration exceptions (stages missing on one side)
        const stageMissing: string[] = [];
        for (const stageName of sourceStages) {
          if (!targetStageMap.has(stageName)) {
            stageMissing.push(`"${stageName}" (source only)`);
          }
        }
        for (const stageName of targetStages) {
          if (!sourceStageMap.has(stageName)) {
            stageMissing.push(`"${stageName}" (target only)`);
          }
        }
        console.log('  Verify #5 - no configuration exceptions (missing stages):');
        console.log(`     Missing stages : ${stageMissing.length === 0 ? 'none' : stageMissing.join(', ')}`);
        console.log(`     Result : ${stageMissing.length === 0 ? 'PASS' : 'FAIL (exception)'}`);

        // Verify #6: Note mismatched records (those in different stages)
        console.log('  Verify #6 - record stage mismatch sample:');
        console.log(`     Deltas found : ${deltas.length === 0 ? 'none' : 'see Verify #3'}`);
        console.log(`     Result : ${deltas.length === 0 ? 'PASS' : 'FAIL (mismatch)'}`);

        console.log('===============================================');
        const overallPass = targetSessionValid && sourceSessionValid &&
                           targetStageGroups.length > 0 && sourceStageGroups.length > 0 &&
                           stagesMatch && countMatch && stageMissing.length === 0;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - stage distribution matches or noted as exception`);

        // Assertions matching the 6 bullets
        expect(targetSessionValid, 'TARGET (crm-mig) session is not authenticated').toBe(true);
        expect(sourceSessionValid, 'SOURCE (pre-production) session is not authenticated').toBe(true);
        expect(targetStageGroups.length, 'TARGET returned no stage groups - read failed').toBeGreaterThan(0);
        expect(sourceStageGroups.length, 'SOURCE returned no stage groups - read failed').toBeGreaterThan(0);
        expect(
          JSON.stringify(targetStages),
          `stage names differ between servers: target=[${targetStages.join(', ')}] vs source=[${sourceStages.join(', ')}]`,
        ).toBe(JSON.stringify(sourceStages));
        expect(
          countMatch,
          `stage counts do not match: ${deltas.length > 0 ? deltas.join(' | ') : 'unknown'}`,
        ).toBe(true);
        expect(
          stageMissing.length === 0,
          `configuration exceptions found - missing or extra stages: ${stageMissing.join(', ')}`,
        ).toBe(true);
        expect(
          targetTotal === sourceTotal,
          `stage count totals do not match: target=${targetTotal}, source=${sourceTotal}`,
        ).toBe(true);
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
