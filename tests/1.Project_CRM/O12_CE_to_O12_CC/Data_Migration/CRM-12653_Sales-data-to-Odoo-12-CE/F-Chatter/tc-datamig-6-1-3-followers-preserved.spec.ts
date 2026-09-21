import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/** The CRM-12653_6.1.1 chatter sample, rebuilt deterministically so every spec in the
 *  chatter/attachment blocks converges on the SAME 6 records without shared state.
 *
 * Rule: Applied on the SOURCE server, every query bounded by MigDataParityPage.onOrBeforeCutoff(cutoff):
 *   - res.partner: order 'id asc', limit 2 -> 2 partners
 *   - crm.lead (type='opportunity'): order 'id asc', limit 2 -> 2 opportunities
 *   - sale.order (name like 'DE%'): order 'id asc', limit 1 -> 1 Deal Element
 *   - account.invoice: order 'id asc', limit 1 -> 1 invoice
 *
 * 'id asc' is chosen because it is STABLE and TOTAL. create_date can tie across many rows and then
 * the order is undefined, which is what let the six specs drift apart in the past. Natural keys (name
 * and number) are returned for target-side lookups, since crm-mig re-sequences every primary key.
 */
async function buildChatterSample(
  parity: MigDataParityPage,
  cutoff: string,
): Promise<Array<{ model: string; naturalKey: string }>> {
  const sample: Array<{ model: string; naturalKey: string }> = [];

  // Sample 2 partners (first 2 by id asc)
  const partners = await parity.searchRead<{ id: number; name: string }>(
    'res.partner',
    MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date'),
    ['id', 'name'],
    { limit: 2, order: 'id asc' },
  );
  for (const p of partners) {
    sample.push({ model: 'res.partner', naturalKey: p.name });
  }

  // Sample 2 opportunities (first 2 by id asc)
  const opps = await parity.searchRead<{ id: number; name: string }>(
    'crm.lead',
    [...MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date'), ['type', '=', 'opportunity']],
    ['id', 'name'],
    { limit: 2, order: 'id asc' },
  );
  for (const o of opps) {
    sample.push({ model: 'crm.lead', naturalKey: o.name });
  }

  // Sample 1 Deal Element (first 1 by id asc)
  const des = await parity.searchRead<{ id: number; name: string }>(
    'sale.order',
    [...MigDataParityPage.onOrBeforeCutoff(cutoff, 'date_order'), ['name', 'like', 'DE%']],
    ['id', 'name'],
    { limit: 1, order: 'id asc' },
  );
  for (const d of des) {
    sample.push({ model: 'sale.order', naturalKey: d.name });
  }

  // Sample 1 invoice (first 1 by id asc)
  const invoices = await parity.searchRead<{ id: number; number: string }>(
    'account.invoice',
    MigDataParityPage.onOrBeforeCutoff(cutoff, 'date_invoice'),
    ['id', 'number'],
    { limit: 1, order: 'id asc' },
  );
  for (const inv of invoices) {
    sample.push({ model: 'account.invoice', naturalKey: inv.number });
  }

  return sample;
}

/**
 * CRM-12653 Section 6.1 - Chatter migration: Followers preserved per record
 * Test Case ID: CRM-12653_6.1.3
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The followers of a migrated record are the same people as on the source.
 *   This case verifies that the chatter followers are preserved for 6 sampled records
 *   (2 partners, 2 opportunities, 1 Deal Element, 1 invoice) across the migration.
 *
 * Source manual TC:
 *   Master tab "CRM-12653_Data Migration", row "6.1.3"
 *   Followers are compared by NAME (not by id, because crm-mig re-sequences ids).
 *   Followers MUST NOT be written during this check - the check is read-only.
 *
 * Pre-conditions:
 *   - SOURCE = pre-production (Odoo 12 Enterprise, db nakivo)
 *   - TARGET = crm-mig (Odoo 12 Community, db nakivoCE)
 *   - <CUTOFF> established in CRM-12653_1.1.2
 *   - Reuses the 6 records from CRM-12653_6.1.1 chatter sample
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_6\.1\.3:" --project=chromium
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

test.describe('CRM-12653_6.1 - Chatter migration: Followers', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_6.1.3: Followers are preserved per record across the migration', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_6.1.3 - Followers preserved per record ==========');

      let targetSession: { context: BrowserContext; parity: MigDataParityPage };
      let sourceSession: { context: BrowserContext; parity: MigDataParityPage };

      await test.step('Pre-condition: Open TARGET session (crm-mig) and establish cut-off', async () => {
        console.log('\n--- Pre-condition: Open TARGET session and resolve cut-off ---');
        console.log(`  Target URL : ${baseUrl_mig}`);
        console.log(`  Account    : ${users.admin_crm_mig.username}`);
        targetSession = await openSession(
          browser, baseUrl_mig, true,
          users.admin_crm_mig.username, users.admin_crm_mig.password,
        );
        targetContext = targetSession.context;

        const isAuth = await targetSession.parity.isAuthenticatedSession();
        expect(isAuth, 'target session must be authenticated').toBe(true);
        console.log('  OK - authenticated on crm-mig');
      });

      let cutoff: string;
      await test.step('Resolve migration cut-off date from target', async () => {
        console.log('\n--- Resolve migration cut-off from target data ---');
        cutoff = await targetSession.parity.resolveCutoffDate();
        console.log(`  Cut-off date: ${cutoff}`);
      });

      await test.step('Pre-condition: Open SOURCE session (pre-production)', async () => {
        console.log('\n--- Pre-condition: Open SOURCE session ---');
        console.log(`  Source URL : ${baseUrl}`);
        console.log(`  Account    : ${users.admin_crm.username}`);
        sourceSession = await openSession(
          browser, baseUrl, false,
          users.admin_crm.username, users.admin_crm.password,
        );
        sourceContext = sourceSession.context;

        const isAuth = await sourceSession.parity.isAuthenticatedSession();
        expect(isAuth, 'source session must be authenticated').toBe(true);
        console.log('  OK - authenticated on pre-production');
      });

      const sampleRecords: Array<{
        model: string;
        naturalKey: { name?: string; number?: string; reference?: string };
        sourceId?: number;
        targetId?: number;
      }> = [];

      await test.step('Build chatter sample: deterministically using unified rule (6 records)', async () => {
        console.log('\n--- Build deterministic chatter sample (6 records) ---');

        // All six specs (6.1.1 through 6.2.2 and 7.1.1) use this same helper to ensure
        // they converge on the SAME 6 records without shared state.
        const baseSample = await buildChatterSample(sourceSession.parity, cutoff);

        // Now fetch the ids for each record so we can read their followers
        for (const rec of baseSample) {
          const domain = rec.model === 'account.invoice'
            ? [['number', '=', rec.naturalKey], ...MigDataParityPage.onOrBeforeCutoff(cutoff)]
            : [['name', '=', rec.naturalKey], ...MigDataParityPage.onOrBeforeCutoff(cutoff)];
          const recs = await sourceSession.parity.searchRead<any>(
            rec.model,
            domain,
            ['id', rec.model === 'account.invoice' ? 'number' : 'name'],
            { limit: 1 },
          );
          if (recs.length > 0) {
            const r = recs[0];
            const naturalKey = rec.model === 'account.invoice'
              ? { number: r.number }
              : rec.model === 'sale.order'
                ? { reference: r.name }
                : { name: r.name };
            sampleRecords.push({
              model: rec.model,
              naturalKey,
              sourceId: r.id,
            });
            console.log(`  ${rec.model}: ${rec.naturalKey}`);
          }
        }

        expect(sampleRecords.length, 'must have exactly 6 sampled records per manual TC').toBe(6);
      });

      const followerComparisons: Array<{
        model: string;
        key: string;
        sourceFollowers: { name: string }[];
        sourceCount: number;
        targetFollowers: { name: string }[];
        targetCount: number;
        match: boolean;
      }> = [];

      await test.step('Step 1: Read followers from SOURCE records', async () => {
        console.log('\n--- Step 1: Read followers from SOURCE records ---');

        for (const record of sampleRecords) {
          const keyStr = record.naturalKey.name || record.naturalKey.reference || record.naturalKey.number || '?';
          console.log(`  Reading followers for ${record.model}:${keyStr}...`);

          const followers = await sourceSession.parity.searchRead<{
            id: number;
            partner_id: [number, string];
            user_id: [number, string];
          }>(
            'mail.followers',
            [['res_model', '=', record.model], ['res_id', '=', record.sourceId || -1]],
            ['partner_id', 'user_id'],
            { limit: 500 },
          );

          const followerNames = followers
            .map((f) => f.partner_id?.[1] || f.user_id?.[1] || '')
            .filter((name) => name.length > 0)
            .sort();

          followerComparisons.push({
            model: record.model,
            key: keyStr,
            sourceFollowers: followerNames.map((n) => ({ name: n })),
            sourceCount: followerNames.length,
            targetFollowers: [],
            targetCount: 0,
            match: false,
          });

          console.log(`    Followers (${followerNames.length}): ${followerNames.join(', ') || '(none)'}`);
        }

        const totalSourceFollowers = followerComparisons.reduce((sum, c) => sum + c.sourceCount, 0);
        expect(totalSourceFollowers, 'source must have at least 1 follower across 6 records to validate migration (prevent false green on both sides = 0)').toBeGreaterThan(0);
      });

      await test.step('Step 2-3: Read followers from TARGET records (by natural key)', async () => {
        console.log('\n--- Step 2-3: Read followers from TARGET records (by natural key) ---');

        for (const comparison of followerComparisons) {
          let targetId: number | null = null;

          if (comparison.model === 'res.partner') {
            const found = await targetSession.parity.searchRead<{ id: number }>(
              'res.partner',
              [['name', '=', comparison.key]],
              ['id'],
              { limit: 1 },
            );
            targetId = found.length > 0 ? found[0].id : null;
          } else if (comparison.model === 'crm.lead') {
            const found = await targetSession.parity.searchRead<{ id: number }>(
              'crm.lead',
              [['name', '=', comparison.key]],
              ['id'],
              { limit: 1 },
            );
            targetId = found.length > 0 ? found[0].id : null;
          } else if (comparison.model === 'sale.order') {
            const found = await targetSession.parity.searchRead<{ id: number }>(
              'sale.order',
              [['name', '=', comparison.key]],
              ['id'],
              { limit: 1 },
            );
            targetId = found.length > 0 ? found[0].id : null;
          } else if (comparison.model === 'account.invoice') {
            const found = await targetSession.parity.searchRead<{ id: number }>(
              'account.invoice',
              [['number', '=', comparison.key]],
              ['id'],
              { limit: 1 },
            );
            targetId = found.length > 0 ? found[0].id : null;
          }

          if (targetId === null) {
            console.log(`  ${comparison.key}: NOT FOUND on target`);
            continue;
          }

          const followers = await targetSession.parity.searchRead<{
            id: number;
            partner_id: [number, string];
            user_id: [number, string];
          }>(
            'mail.followers',
            [['res_model', '=', comparison.model], ['res_id', '=', targetId]],
            ['partner_id', 'user_id'],
            { limit: 500 },
          );

          const followerNames = followers
            .map((f) => f.partner_id?.[1] || f.user_id?.[1] || '')
            .filter((name) => name.length > 0)
            .sort();

          comparison.targetFollowers = followerNames.map((n) => ({ name: n }));
          comparison.targetCount = followerNames.length;
          comparison.match = JSON.stringify(comparison.sourceFollowers) === JSON.stringify(comparison.targetFollowers);

          console.log(`  ${comparison.key}: ${followerNames.length} followers`);
          console.log(`    Followers: ${followerNames.join(', ') || '(none)'}`);
        }
      });

      await test.step('Step 4-5: Verification - Compare follower counts and sets', async () => {
        console.log('\n==================== VERIFY ====================');
        console.log('Follower comparison for 6 sampled records:');
        console.log('');

        let countMatches = 0;
        let setMatches = 0;
        const mismatches: string[] = [];

        for (const comp of followerComparisons) {
          const countMatch = comp.sourceCount === comp.targetCount;
          const setMatch = comp.match;

          if (countMatch) countMatches++;
          if (setMatch) setMatches++;

          const status = setMatch ? 'PASS' : 'FAIL';
          console.log(`  ${comp.key.padEnd(40)} : source=${comp.sourceCount} target=${comp.targetCount} [${status}]`);

          if (!setMatch) {
            const sourceFolNames = comp.sourceFollowers.map((f) => f.name).join(', ') || '(none)';
            const targetFolNames = comp.targetFollowers.map((f) => f.name).join(', ') || '(none)';
            mismatches.push(
              `${comp.key}: source=[${sourceFolNames}] vs target=[${targetFolNames}]`,
            );
          }
        }

        console.log('');
        console.log(`Expected : All 6 records have identical follower count and identical follower names`);
        console.log(`Actual   : ${countMatches}/6 count matches, ${setMatches}/6 set matches`);
        console.log(`Result   : ${setMatches === 6 ? 'PASS' : 'FAIL'}`);
        if (mismatches.length > 0) {
          console.log('');
          console.log('Mismatches:');
          mismatches.forEach((m) => console.log(`  - ${m}`));
        }
        console.log('===============================================');

        expect(followerComparisons.length, 'must have sampled records with followers read').toBe(6);
        expect(countMatches, 'all sampled records must have identical follower counts').toBe(6);
        expect(setMatches, 'all sampled records must have identical follower sets (compared by name)').toBe(6);
        expect(mismatches.length, 'no follower mismatches allowed').toBe(0);
        expect(
          followerComparisons.every((c) => c.match),
          'every record must preserve its exact set of followers (by name, not by id)',
        ).toBe(true);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
