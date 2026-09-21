import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext, Page } from '@playwright/test';

/**
 * CRM-12653_6.1.1 - Chatter message count per sampled record
 * Test Case ID: CRM-12653_6.1.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The chatter of a migrated record holds the same number of messages as the source,
 *   checked record by record. This spec verifies message counts for a sample of 6 records:
 *   2 partners, 2 opportunities, 1 Deal Element, and 1 invoice, all created on or before
 *   the cut-off date. The sample is built deterministically and reused by CRM-12653_6.1.2,
 *   6.1.3, 6.2.1, 6.2.2, 7.1.1 and 7.2.1.
 *
 * Source manual TC (master tab "Migration - Data Migration/Chatter", row 674):
 *   Preconditions: Cut-off date from CRM-12653_1.1.2. No test data is created.
 *   Steps:
 *     1. Before touching anything, on crm-mig open each of the 6 sampled records and write down
 *        the number of messages currently in its chatter.
 *     2. On pre-production open each of the 6 sampled records, scroll to the chatter and click
 *        "Load more" until no further button appears.
 *     3. Count the messages in the thread and write down the date of the FIRST and of the LAST message.
 *     4. Repeat steps 2-3 on crm-mig for the matching record.
 *     5. Compare the count and the two boundary dates per record.
 *   Expected: (6 bullets)
 *     - The chatter loads on both servers for all 6 records.
 *     - For each of the 6 records the message COUNT is identical on both servers.
 *     - The date of the first message and the date of the last message are identical on both servers.
 *     - A target count LOWER than the source is a chatter loss.
 *     - A target count HIGHER than the source means messages were written on the migration build.
 *     - A record whose chatter is entirely empty on the target is recorded as a total chatter loss.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_6\\.1\\.1:" --project=chromium
 */

/** Inline session helper - opens an authenticated context on the target server. */
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

test.describe('CRM-12653_6.1 - Chatter migration verification', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_6.1.1: Chatter message count is identical for each sampled record', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let targetSession: { context: BrowserContext; parity: MigDataParityPage } | null = null;
    let sourceSession: { context: BrowserContext; parity: MigDataParityPage } | null = null;

    try {
      console.log('========== CRM-12653_6.1.1 - Chatter message count verification ==========\n');

      // Step: Open crm-mig (target) session first
      await test.step('Pre-condition: Login to both servers (target first)', async () => {
        console.log('--- Opening crm-mig (target) session ---');
        console.log(`  URL     : ${baseUrl_mig}`);
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        targetSession = await openSession(
          browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password,
        );
        const isAuth = await targetSession.parity.isAuthenticatedSession();
        expect(isAuth, 'failed to authenticate on crm-mig').toBe(true);
        console.log('  OK - authenticated on crm-mig\n');

        console.log('--- Opening pre-production (source) session ---');
        console.log(`  URL     : ${baseUrl}`);
        console.log(`  Account : ${users.admin_crm.username}`);
        sourceSession = await openSession(
          browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password,
        );
        const isAuthSource = await sourceSession.parity.isAuthenticatedSession();
        expect(isAuthSource, 'failed to authenticate on pre-production').toBe(true);
        console.log('  OK - authenticated on pre-production');
      });

      // Step: Resolve cut-off date
      let cutoff = '';
      await test.step('Step 1: Resolve the cut-off date from the target', async () => {
        console.log('\n--- Resolving cut-off date ---');
        cutoff = await targetSession!.parity.resolveCutoffDate();
        console.log(`  Cut-off date: ${cutoff}`);
      });

      // Step 2-3: Build sample on source and count messages
      interface SampleRecord {
        model: string;
        naturalKey: string;
        sourceId?: number;
        sourceMessageCount?: number;
        sourceFirstDate?: string;
        sourceLastDate?: string;
      }

      let sample: SampleRecord[] = [];

      await test.step('Step 2-3: Sample 6 records deterministically from source', async () => {
        console.log('\n--- Building deterministic sample from source (pre-production) ---');

        // All six specs (6.1.1 through 6.2.2 and 7.1.1) use this same helper to ensure
        // they converge on the SAME 6 records without shared state. The rule uses 'id asc'
        // ordering which is stable and total (unlike create_date which can tie).
        const baseSample = await buildChatterSample(sourceSession!.parity, cutoff);
        sample = baseSample as SampleRecord[];

        console.log(`  Sample size: ${sample.length} records`);
        for (let i = 0; i < sample.length; i++) {
          console.log(`    ${i + 1}. ${sample[i].model}: ${sample[i].naturalKey}`);
        }
      });

      // Step 2-3 continued: Count messages for each sample record on source
      await test.step('Step 2-3 continued: Count messages on source', async () => {
        console.log('\n--- Counting messages on source (pre-production) ---');

        for (const rec of sample) {
          // Find the record ID on source by natural key
          const srcRecs = await sourceSession!.parity.searchRead<{ id: number }>(
            rec.model,
            rec.model === 'account.invoice'
              ? [['number', '=', rec.naturalKey], ...MigDataParityPage.onOrBeforeCutoff(cutoff)]
              : [['name', '=', rec.naturalKey], ...MigDataParityPage.onOrBeforeCutoff(cutoff)],
            ['id'],
            { limit: 1 },
          );

          if (srcRecs.length === 0) {
            console.log(`    ${rec.model}: ${rec.naturalKey} - NOT FOUND`);
            rec.sourceMessageCount = -1;
            continue;
          }

          rec.sourceId = srcRecs[0].id;

          // Count messages for this record
          const msgs = await sourceSession!.parity.searchRead<{
            date: string;
          }>(
            'mail.message',
            [
              ['model', '=', rec.model],
              ['res_id', '=', rec.sourceId],
              ['message_type', 'in', ['email', 'comment']],
            ],
            ['date'],
            { limit: 500, order: 'date asc' },
          );

          rec.sourceMessageCount = msgs.length;
          if (msgs.length > 0) {
            rec.sourceFirstDate = msgs[0].date;
            rec.sourceLastDate = msgs[msgs.length - 1].date;
          }

          console.log(
            `    ${rec.model}: ${rec.naturalKey} ` +
            `- count=${rec.sourceMessageCount} ` +
            `first=${rec.sourceFirstDate ?? 'N/A'} ` +
            `last=${rec.sourceLastDate ?? 'N/A'}`,
          );
        }
      });

      // Step 4-5: Count messages on target and compare
      await test.step('Step 4-5: Count messages on target and compare', async () => {
        console.log('\n--- Counting messages on target (crm-mig) and comparing ---');
      });

      const verification: Array<{
        record: string;
        sourceCount: number;
        targetCount: number;
        countMatch: boolean;
        sourceDates: string;
        targetDates: string;
        datesMatch: boolean;
        sourceHasMessages: boolean;
      }> = [];

      for (const rec of sample) {
        if (rec.sourceMessageCount === -1) {
          console.log(`  ${rec.model}: ${rec.naturalKey} - SKIPPED (not found on source)`);
          continue;
        }

        // Find the record on target by natural key
        const tgtRecs = await targetSession!.parity.searchRead<{ id: number }>(
          rec.model,
          rec.model === 'account.invoice'
            ? [['number', '=', rec.naturalKey], ...MigDataParityPage.onOrBeforeCutoff(cutoff)]
            : [['name', '=', rec.naturalKey], ...MigDataParityPage.onOrBeforeCutoff(cutoff)],
          ['id'],
          { limit: 1 },
        );

        if (tgtRecs.length === 0) {
          console.log(`  ${rec.model}: ${rec.naturalKey} - NOT FOUND ON TARGET`);
          verification.push({
            record: `${rec.model}: ${rec.naturalKey}`,
            sourceCount: rec.sourceMessageCount ?? 0,
            targetCount: 0,
            countMatch: false,
            sourceDates: `${rec.sourceFirstDate ?? 'N/A'} to ${rec.sourceLastDate ?? 'N/A'}`,
            targetDates: 'N/A',
            datesMatch: false,
            sourceHasMessages: (rec.sourceMessageCount ?? 0) > 0,
          });
          continue;
        }

        // Count messages for this record on target
        const tgtMsgs = await targetSession!.parity.searchRead<{
          date: string;
        }>(
          'mail.message',
          [
            ['model', '=', rec.model],
            ['res_id', '=', tgtRecs[0].id],
            ['message_type', 'in', ['email', 'comment']],
          ],
          ['date'],
          { limit: 500, order: 'date asc' },
        );

        const targetMessageCount = tgtMsgs.length;
        const targetFirstDate = tgtMsgs.length > 0 ? tgtMsgs[0].date : undefined;
        const targetLastDate = tgtMsgs.length > 0 ? tgtMsgs[tgtMsgs.length - 1].date : undefined;

        const countMatch = (rec.sourceMessageCount ?? 0) === targetMessageCount;
        const datesMatch =
          rec.sourceFirstDate === targetFirstDate && rec.sourceLastDate === targetLastDate;

        console.log(
          `  ${rec.model}: ${rec.naturalKey} ` +
          `source=${rec.sourceMessageCount} target=${targetMessageCount} ` +
          `${countMatch ? 'PASS' : 'FAIL'}`,
        );

        verification.push({
          record: `${rec.model}: ${rec.naturalKey}`,
          sourceCount: rec.sourceMessageCount ?? 0,
          targetCount: targetMessageCount,
          countMatch,
          sourceDates: `${rec.sourceFirstDate ?? 'N/A'} to ${rec.sourceLastDate ?? 'N/A'}`,
          targetDates: `${targetFirstDate ?? 'N/A'} to ${targetLastDate ?? 'N/A'}`,
          datesMatch,
          sourceHasMessages: (rec.sourceMessageCount ?? 0) > 0,
        });
      }

      // Verification block
      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');

        // FALSE-GREEN GUARD: Ensure we actually have data to verify
        const recordsWithSourceMessages = verification.filter((v) => v.sourceHasMessages).length;
        console.log('\n--- FALSE-GREEN GUARD ---');
        console.log(`Source records with messages: ${recordsWithSourceMessages} of ${verification.length}`);
        if (recordsWithSourceMessages === 0) {
          console.log('     WARNING: No source records have messages - cannot verify parity');
        }

        console.log('\nVerify #1 - Chatter loads on both servers for all 6 records:');
        const loadedCount = verification.length;
        console.log(`     Expected : 6 records loaded`);
        console.log(`     Actual   : ${loadedCount}`);
        console.log(`     Result   : ${loadedCount === 6 ? 'PASS' : 'FAIL'}`);

        console.log('\nVerify #2 - Message COUNT is identical on both servers:');
        const countMatches = verification.filter((v) => v.countMatch).length;
        const countMismatches = verification.filter((v) => !v.countMatch);
        console.log(`     Expected : all records match`);
        console.log(`     Actual   : ${countMatches}/${verification.length} match`);
        if (countMismatches.length > 0) {
          countMismatches.forEach((m) => {
            console.log(`       ${m.record}: source=${m.sourceCount}, target=${m.targetCount}`);
          });
        }
        console.log(`     Result   : ${countMatches === verification.length ? 'PASS' : 'FAIL'}`);

        console.log('\nVerify #3 - First and last message dates are identical:');
        const dateMatches = verification.filter((v) => v.datesMatch).length;
        const dateMismatches = verification.filter((v) => !v.datesMatch && v.countMatch);
        console.log(`     Expected : all dates match where counts match`);
        console.log(`     Actual   : ${dateMatches}/${verification.length} match`);
        if (dateMismatches.length > 0) {
          dateMismatches.forEach((m) => {
            console.log(`       ${m.record}: source=[${m.sourceDates}], target=[${m.targetDates}]`);
          });
        }
        console.log(`     Result   : ${dateMatches >= verification.length - 1 ? 'PASS' : 'FAIL'}`);

        console.log('\nVerify #4 - No chatter loss (target count lower than source):');
        const losses = verification.filter((v) => v.targetCount < v.sourceCount);
        console.log(`     Expected : 0 losses`);
        console.log(`     Actual   : ${losses.length}`);
        if (losses.length > 0) {
          losses.forEach((l) => {
            console.log(`       ${l.record}: source=${l.sourceCount}, target=${l.targetCount}`);
          });
        }
        console.log(`     Result   : ${losses.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('\nVerify #5 - No unexpected messages on target (higher count):');
        const extras = verification.filter((v) => v.targetCount > v.sourceCount);
        console.log(`     Expected : 0 extra messages`);
        console.log(`     Actual   : ${extras.length}`);
        if (extras.length > 0) {
          extras.forEach((e) => {
            console.log(`       ${e.record}: source=${e.sourceCount}, target=${e.targetCount}`);
          });
        }
        console.log(`     Result   : ${extras.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('\nVerify #6 - No total chatter loss:');
        const totalLosses = verification.filter((v) => v.sourceCount > 0 && v.targetCount === 0);
        console.log(`     Expected : 0 records with total loss`);
        console.log(`     Actual   : ${totalLosses.length}`);
        if (totalLosses.length > 0) {
          totalLosses.forEach((t) => {
            console.log(`       ${t.record}: had ${t.sourceCount} messages on source`);
          });
        }
        console.log(`     Result   : ${totalLosses.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('\n===============================================');
        console.log(
          `OVERALL: ${countMatches === verification.length && dateMatches === verification.length ? 'PASS' : 'FAIL'} - ` +
          `all sampled records have identical message counts and dates`,
        );
        console.log('===============================================\n');

        // Assertions (6 bullets from expectedBulletCount + FALSE-GREEN GUARDS)
        expect(
          loadedCount,
          'chatter did not load for all 6 records on both servers',
        ).toBe(6);

        // FALSE-GREEN GUARD: Ensure source data exists (empty on both sides is not a pass)
        expect(
          recordsWithSourceMessages,
          `no source records have messages - cannot verify parity (comparison would pass falsely when both are empty)`,
        ).toBeGreaterThan(0);

        expect(
          countMatches,
          `message counts do not match on target: ${countMismatches.length} records differ`,
        ).toBe(verification.length);

        expect(
          dateMatches,
          `boundary dates do not match: ${dateMismatches.length} records have different first/last dates`,
        ).toBe(verification.length);

        expect(
          losses.length,
          `chatter loss detected: ${losses.length} records have lower count on target`,
        ).toBe(0);

        expect(
          extras.length,
          `unexpected messages on target: ${extras.length} records have higher count than source`,
        ).toBe(0);

        expect(
          totalLosses.length,
          `total chatter loss: ${totalLosses.length} records are empty on target but had messages on source`,
        ).toBe(0);
      });
    } finally {
      // Clean up both sessions
      if (targetSession) await targetSession.context.close();
      if (sourceSession) await sourceSession.context.close();
    }
  });
});
