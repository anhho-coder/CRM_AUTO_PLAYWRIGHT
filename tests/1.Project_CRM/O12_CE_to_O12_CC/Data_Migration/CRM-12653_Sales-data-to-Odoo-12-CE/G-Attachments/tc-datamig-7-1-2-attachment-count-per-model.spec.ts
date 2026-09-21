import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_7.1.2: Attachment count per model within the cut-off is the same on both servers
 * Test Case ID: CRM-12653_7.1.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The number of attachments per sales model (res.partner, crm.lead, sale.order, account.invoice)
 *   within the cut-off window is the same on both servers (pre-production and crm-mig). The
 *   comparison is read-only and bounded by resource model and cut-off date to avoid overwhelming
 *   the largest tables.
 *
 * Source manual TC (CRM-12653 master tab, row 7.1.2):
 *   Read ir.attachment counts filtered by Resource Model and Created on <= cut-off on both
 *   pre-production (source) and crm-mig (target). Compare the four per-model counts.
 *
 * READ-ONLY: This spec only reads ir.attachment records. It creates, modifies and deletes
 * nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_7\.1\.2:" --project=chromium
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

const MODELS = ['res.partner', 'crm.lead', 'sale.order', 'account.invoice'];

test.describe('CRM-12653_7.1.2 - Attachment count per model', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_7.1.2: Attachment count per model within the cut-off is the same on both servers', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let srcContext: BrowserContext | null = null;
    let tgtContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_7.1.2 - Attachment count per model ==========');

      // Open TARGET session first to resolve cut-off
      const { context: tContext, parity: tParity } = await openSession(
        browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password,
      );
      tgtContext = tContext;

      // Resolve cut-off on target
      let cutoff = '';
      await test.step('Pre-condition: Resolve migration cut-off date on target', async () => {
        cutoff = await tParity.resolveCutoffDate();
        console.log('\n--- Pre-condition: Resolve migration cut-off date ---');
        console.log(`  Cut-off date: ${cutoff}`);
      });

      // Open SOURCE session
      const { context: sContext, parity: sParity } = await openSession(
        browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password,
      );
      srcContext = sContext;

      // Verify both sessions are authenticated
      await test.step('Pre-condition: Verify authenticated sessions on both servers', async () => {
        console.log('\n--- Pre-condition: Verify authenticated sessions ---');
        const srcAuth = await sParity.isAuthenticatedSession();
        const tgtAuth = await tParity.isAuthenticatedSession();
        console.log(`  Source authenticated: ${srcAuth}`);
        console.log(`  Target authenticated: ${tgtAuth}`);
        expect(srcAuth, 'source session is not authenticated').toBe(true);
        expect(tgtAuth, 'target session is not authenticated').toBe(true);
      });

      // Read attachment counts per model on both servers
      const srcCounts = new Map<string, number>();
      const tgtCounts = new Map<string, number>();

      await test.step('Step 1-3: Read attachment counts for each model on pre-production', async () => {
        console.log('\n--- Step 1-3: Read attachment counts on pre-production (source) ---');
        for (const model of MODELS) {
          const domain = [
            ['res_model', '=', model],
            ['create_date', '<=', cutoff + ' 23:59:59'],  // Include entire cut-off day
          ];
          const count = await sParity.searchCount('ir.attachment', domain);
          srcCounts.set(model, count);
          console.log(`  ${model.padEnd(20)}: ${count} attachments`);
        }
        // Guard against empty source: if all counts are 0, the test would silently pass if comparing with empty target
        const srcTotal = Array.from(srcCounts.values()).reduce((sum, c) => sum + c, 0);
        expect(srcTotal, 'source has no attachments within cut-off window - cannot verify migration parity with zero source data').toBeGreaterThan(0);
      });

      await test.step('Step 4: Read attachment counts for each model on crm-mig', async () => {
        console.log('\n--- Step 4: Read attachment counts on crm-mig (target) ---');
        for (const model of MODELS) {
          const domain = [
            ['res_model', '=', model],
            ['create_date', '<=', cutoff + ' 23:59:59'],
          ];
          const count = await tParity.searchCount('ir.attachment', domain);
          tgtCounts.set(model, count);
          console.log(`  ${model.padEnd(20)}: ${count} attachments`);
        }
      });

      // Analyze deltas
      const deltas = new Map<string, { src: number; tgt: number; delta: number }>();
      const results = {
        allCountsReturned: true,
        allDeltasZero: true,
        blockingExceptions: [] as string[],
        partialLosses: [] as string[],
        postSnapshotData: [] as string[],
        timedOut: false,
      };

      await test.step('Step 5: Compute and analyze deltas per model', async () => {
        console.log('\n--- Step 5: Compute deltas per model ---');
        for (const model of MODELS) {
          const src = srcCounts.get(model);
          const tgt = tgtCounts.get(model);

          // Check if both servers answered
          if (src === undefined || tgt === undefined) {
            results.timedOut = true;
            results.allCountsReturned = false;
            console.log(`  ${model.padEnd(20)}: SKIPPED - query did not return a count`);
            continue;
          }

          const delta = tgt - src;
          deltas.set(model, { src, tgt, delta });

          if (delta !== 0) {
            results.allDeltasZero = false;
          }

          // Classify the delta
          let status = '';
          if (delta === 0) {
            status = 'OK';
          } else if (tgt === 0 && src > 1000) {
            status = 'BLOCKING: target near-zero but source has thousands';
            results.blockingExceptions.push(`${model} (src=${src}, tgt=${tgt}, ratio=${(tgt / src).toFixed(3)})`);
          } else if (delta < 0) {
            status = 'PARTIAL LOSS: target lower than source - needs CRM-12653_7.1.3 sampling';
            results.partialLosses.push(`${model} (src=${src}, tgt=${tgt}, delta=${delta})`);
          } else {
            status = 'POST-SNAPSHOT: target higher - identify and exclude by create_date > cutoff';
            results.postSnapshotData.push(`${model} (src=${src}, tgt=${tgt}, delta=+${delta})`);
          }

          console.log(`  ${model.padEnd(20)}: source=${src}, target=${tgt}, delta=${delta >= 0 ? '+' : ''}${delta} (${status})`);
        }
      });

      // Verification
      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');

        console.log('  Verify #1 - Each of the four filtered lists answers on both servers:');
        console.log(`     Expected : 4 models with counts`);
        console.log(`     Actual   : ${deltas.size} models returned counts`);
        console.log(`     Result   : ${results.allCountsReturned ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #2 - For every model the target count equals the source count (delta = 0):');
        console.log(`     Expected : 4 models with delta = 0`);
        console.log(`     Actual   : ${Array.from(deltas.values()).filter((d) => d.delta === 0).length} models match`);
        console.log(`     Result   : ${results.allDeltasZero ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #3 - No model with near-zero target but thousands in source (BLOCKING):');
        console.log(`     Expected : 0 blocking exceptions`);
        console.log(`     Actual   : ${results.blockingExceptions.length}`);
        if (results.blockingExceptions.length > 0) {
          console.log(`     Details  : ${results.blockingExceptions.join(' | ')}`);
        }
        console.log(`     Result   : ${results.blockingExceptions.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #4 - Partial losses documented (delta < 0):');
        console.log(`     Expected : 0 (or proceed to CRM-12653_7.1.3 for sampling)`);
        console.log(`     Actual   : ${results.partialLosses.length}`);
        if (results.partialLosses.length > 0) {
          console.log(`     Details  : ${results.partialLosses.join(' | ')}`);
        }
        console.log(`     Result   : ${results.partialLosses.length === 0 ? 'PASS' : 'NOTED'}`);

        console.log('  Verify #5 - Post-snapshot files identified (delta > 0):');
        console.log(`     Expected : 0 (files uploaded after snapshot should be filtered out)`);
        console.log(`     Actual   : ${results.postSnapshotData.length}`);
        if (results.postSnapshotData.length > 0) {
          console.log(`     Details  : ${results.postSnapshotData.join(' | ')}`);
        }
        console.log(`     Result   : ${results.postSnapshotData.length === 0 ? 'PASS' : 'NOTED'}`);

        console.log('  Verify #6 - No query timeouts or skips (all models answered):');
        console.log(`     Expected : all 4 models answered`);
        console.log(`     Actual   : ${deltas.size} models answered${results.timedOut ? ' (TIMEOUT OCCURRED)' : ''}`);
        console.log(`     Result   : ${!results.timedOut && deltas.size === 4 ? 'PASS' : 'FAIL'}`);

        console.log('===============================================');

        // Main assertions
        expect(results.allCountsReturned, 'not all models returned counts - a query may have timed out').toBe(true);
        expect(deltas.size, 'fewer than 4 models returned data').toBe(4);
        expect(!results.timedOut, 'one or more queries timed out when reading attachment counts').toBe(true);
        expect(results.blockingExceptions, `blocking exception found (near-zero target vs thousands in source): ${results.blockingExceptions.join(', ')}`).toHaveLength(0);
        expect(results.allDeltasZero, `attachment counts do not match - deltas are not zero for all models: ${Array.from(deltas.entries()).filter(([, d]) => d.delta !== 0).map(([m, d]) => `${m}=${d.delta}`).join(', ')}`).toBe(true);
      });

    } finally {
      if (srcContext) await srcContext.close();
      if (tgtContext) await tgtContext.close();
    }
  });
});
