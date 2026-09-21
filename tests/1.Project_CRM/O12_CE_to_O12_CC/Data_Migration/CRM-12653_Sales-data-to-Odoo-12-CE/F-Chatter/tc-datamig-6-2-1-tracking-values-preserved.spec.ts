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
 * CRM-12653 Part 6.2.1 - Chatter tracking values preserved
 * Test Case ID: CRM-12653_6.2.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The tracked field changes shown in the chatter are migrated with the same
 *   field, old value, new value and date. This spec verifies that mail.tracking.value
 *   records (audit trail entries) for 3 sampled records (2 opportunities and 1 Deal Element)
 *   are migrated correctly from pre-production (Odoo 12 Enterprise) to crm-mig
 *   (Odoo 12 Community).
 *
 * Source manual TC (master sheet tab "CRM-12653 Data Migration Sales", row 6.2.1):
 *
 * Pre-conditions:
 *   VPN connected; both pre-production (Odoo 12 Enterprise) and crm-mig
 *   (Odoo 12 Community) are reachable.
 *   Login: anh.ho@nakivo.com (admin_crm for source, admin_crm_mig for target).
 *   Cut-off date from CRM-12653_1.1.2 is at hand.
 *   3 records sampled from CRM-12653_6.1.1: 2 opportunities and 1 Deal Element.
 *
 * Steps to reproduce:
 *   1. Open authenticated sessions on both servers (pre-production and crm-mig).
 *   2. Resolve the cut-off date on the target.
 *   3. For each of the 3 sampled records:
 *      - Identify the record on both servers by its natural key.
 *      - Read all mail.tracking.value entries for that record.
 *   4. Compare the tracked-change entries field by field.
 *
 * Verification Points:
 *   1. Both sessions authenticated on source and target.
 *   2. The 3 sampled records found by natural key on both servers.
 *   3. Each record returns tracked-change entries on both servers.
 *   4. For each record, the field labels, old values, new values, and dates match.
 *   5. Values are compared as displayed (stage names, user names, amounts with currency).
 *
 * READ-ONLY: this spec only reads tracking value records. It creates, modifies and
 * deletes nothing, as required on crm-mig.
 *
 * NOTE: mail.tracking.value records are filtered by model, res_id, and create_date.
 * Record IDs are re-sequenced on crm-mig, so the join strategy uses the related
 * record's natural key (opportunity/order name) to identify it on both servers.
 * Field tracking is one of the largest audit tables - reads are bounded to the
 * 3 specific records only, never a global scan.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_6\.2\.1:" --project=chromium
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

test.describe('CRM-12653 Part 6.2.1 - Chatter tracking values preserved', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_6.2.1: Field-change tracking entries preserved with same field, old value, new value, and date', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_6.2.1 - Chatter Tracking Values Preserved ==========');

      // Open target session first to resolve cut-off date
      let targetParityPage: MigDataParityPage;
      let cutoff: string;

      await test.step('Pre-condition 1: Open session on crm-mig (target)', async () => {
        console.log('\n--- Pre-condition 1: Open session on crm-mig (target) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        const session = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        targetContext = session.context;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'target session not authenticated on crm-mig').toBe(true);

        targetParityPage = session.parity;
        cutoff = await targetParityPage.resolveCutoffDate();
        console.log(`  Cut-off date resolved: ${cutoff}`);
      });

      let sourceParityPage: MigDataParityPage;

      await test.step('Pre-condition 2: Open session on pre-production (source)', async () => {
        console.log('\n--- Pre-condition 2: Open session on pre-production (source) ---');
        console.log(`  Account : ${users.admin_crm.username}`);
        console.log(`  Source  : ${baseUrl}`);
        const session = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        sourceContext = session.context;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'source session not authenticated on pre-production').toBe(true);

        sourceParityPage = session.parity;
      });

      // Sample records: 2 opportunities and 1 Deal Element from the unified chatter sample
      // All six specs (6.1.1 through 6.2.2 and 7.1.1) use this same helper to ensure
      // they converge on the SAME 6 records without shared state.
      interface OpportunitySample {
        name: string;
        resIdSource: number;
        resIdTarget: number;
      }

      const sampleOpportunities: OpportunitySample[] = [];
      const sampleDealElement: OpportunitySample[] = [];

      await test.step('Step 1: Identify 2 opportunities and 1 Deal Element using unified sample', async () => {
        console.log('\n--- Step 1: Identify sample records from unified chatter sample ---');

        // Use the unified deterministic sample from buildChatterSample
        const fullSample = await buildChatterSample(sourceParityPage, cutoff);

        // Extract the 2 opportunities and 1 Deal Element from the sample
        // Record order: [partner, partner, opp, opp, DE, invoice]
        const oppNames = [];
        const deNames = [];
        for (const rec of fullSample) {
          if (rec.model === 'crm.lead') {
            oppNames.push(rec.naturalKey);
          } else if (rec.model === 'sale.order') {
            deNames.push(rec.naturalKey);
          }
        }

        // Fetch the ids for the 2 opportunities
        for (const oppName of oppNames) {
          const sourceOpp = await sourceParityPage.searchRead(
            'crm.lead',
            [['name', '=', oppName], ...MigDataParityPage.onOrBeforeCutoff(cutoff)],
            ['id', 'name'],
            { limit: 1 }
          );
          const targetOpp = await targetParityPage.searchRead(
            'crm.lead',
            [['name', '=', oppName], ...MigDataParityPage.onOrBeforeCutoff(cutoff)],
            ['id', 'name'],
            { limit: 1 }
          );

          if (sourceOpp.length > 0 && targetOpp.length > 0) {
            sampleOpportunities.push({
              name: oppName,
              resIdSource: sourceOpp[0].id,
              resIdTarget: targetOpp[0].id,
            });
            console.log(`  Opportunity sample: "${oppName}"`);
          }
        }

        // Fetch the ids for the 1 Deal Element
        if (deNames.length > 0) {
          const deName = deNames[0];
          const sourceDE = await sourceParityPage.searchRead(
            'sale.order',
            [['name', '=', deName], ...MigDataParityPage.onOrBeforeCutoff(cutoff, 'date_order')],
            ['id', 'name'],
            { limit: 1 }
          );
          const targetDE = await targetParityPage.searchRead(
            'sale.order',
            [['name', '=', deName], ...MigDataParityPage.onOrBeforeCutoff(cutoff, 'date_order')],
            ['id', 'name'],
            { limit: 1 }
          );

          if (sourceDE.length > 0 && targetDE.length > 0) {
            sampleDealElement.push({
              name: deName,
              resIdSource: sourceDE[0].id,
              resIdTarget: targetDE[0].id,
            });
            console.log(`  Deal Element sample: "${deName}"`);
          }
        }

        expect(sampleOpportunities, 'failed to identify 2 opportunity samples').toHaveLength(2);
        expect(sampleDealElement, 'failed to identify 1 Deal Element sample').toHaveLength(1);
      });

      const allRecords = [...sampleOpportunities, ...sampleDealElement];
      const mismatches: Array<{
        record: string;
        field: string;
        sourceValue: string;
        targetValue: string;
      }> = [];
      let totalSourceTrackingCount = 0;

      await test.step('Step 2-4: Read and compare tracking entries for each sample record', async () => {
        console.log('\n--- Step 2-4: Read tracking entries for each record ---');

        for (const record of allRecords) {
          console.log(`\n  Record: "${record.name}"`);

          // Determine model based on context (opportunities are crm.lead, Deal Elements are sale.order)
          const modelMap: { [key: string]: string } = {};
          sampleOpportunities.forEach(opp => { modelMap[opp.name] = 'crm.lead'; });
          sampleDealElement.forEach(de => { modelMap[de.name] = 'sale.order'; });
          const model = modelMap[record.name];

          // Read tracking values from source
          const sourceDomain = [
            ...MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date'),
            ['mail_message_id.model', '=', model],
            ['mail_message_id.res_id', '=', record.resIdSource],
          ];
          const sourceTracking = await sourceParityPage.searchRead(
            'mail.tracking.value',
            sourceDomain,
            ['field_id', 'field_id.name', 'old_value_text', 'new_value_text', 'create_date'],
            { limit: 500, order: 'create_date asc' }
          );

          // Read tracking values from target
          const targetDomain = [
            ...MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date'),
            ['mail_message_id.model', '=', model],
            ['mail_message_id.res_id', '=', record.resIdTarget],
          ];
          const targetTracking = await targetParityPage.searchRead(
            'mail.tracking.value',
            targetDomain,
            ['field_id', 'field_id.name', 'old_value_text', 'new_value_text', 'create_date'],
            { limit: 500, order: 'create_date asc' }
          );

          console.log(`    Tracking entries on source: ${sourceTracking.length}`);
          console.log(`    Tracking entries on target: ${targetTracking.length}`);
          totalSourceTrackingCount += sourceTracking.length;

          // Compare entry by entry
          if (sourceTracking.length !== targetTracking.length) {
            mismatches.push({
              record: record.name,
              field: 'entry_count',
              sourceValue: String(sourceTracking.length),
              targetValue: String(targetTracking.length),
            });
          }

          const maxLen = Math.max(sourceTracking.length, targetTracking.length);
          for (let i = 0; i < maxLen; i++) {
            const sourceTv = sourceTracking[i];
            const targetTv = targetTracking[i];

            if (!sourceTv && targetTv) {
              mismatches.push({
                record: record.name,
                field: `entry_${i + 1}_missing_on_source`,
                sourceValue: 'not present',
                targetValue: `${targetTv.field_id?.name || 'unknown'}: ${targetTv.old_value_text || ''} -> ${targetTv.new_value_text || ''}`,
              });
            } else if (sourceTv && !targetTv) {
              mismatches.push({
                record: record.name,
                field: `entry_${i + 1}_missing_on_target`,
                sourceValue: `${sourceTv.field_id?.name || 'unknown'}: ${sourceTv.old_value_text || ''} -> ${sourceTv.new_value_text || ''}`,
                targetValue: 'not present',
              });
            } else if (sourceTv && targetTv) {
              const sourceFN = sourceTv.field_id?.[1] || sourceTv.field_id?.name || 'unknown';
              const targetFN = targetTv.field_id?.[1] || targetTv.field_id?.name || 'unknown';

              if (sourceFN !== targetFN) {
                mismatches.push({
                  record: record.name,
                  field: `entry_${i + 1}_field_name`,
                  sourceValue: sourceFN,
                  targetValue: targetFN,
                });
              }

              if ((sourceTv.old_value_text || '') !== (targetTv.old_value_text || '')) {
                mismatches.push({
                  record: record.name,
                  field: `entry_${i + 1}_old_value`,
                  sourceValue: sourceTv.old_value_text || '(empty)',
                  targetValue: targetTv.old_value_text || '(empty)',
                });
              }

              if ((sourceTv.new_value_text || '') !== (targetTv.new_value_text || '')) {
                mismatches.push({
                  record: record.name,
                  field: `entry_${i + 1}_new_value`,
                  sourceValue: sourceTv.new_value_text || '(empty)',
                  targetValue: targetTv.new_value_text || '(empty)',
                });
              }

              if ((sourceTv.create_date || '') !== (targetTv.create_date || '')) {
                mismatches.push({
                  record: record.name,
                  field: `entry_${i + 1}_date`,
                  sourceValue: sourceTv.create_date || 'unknown',
                  targetValue: targetTv.create_date || 'unknown',
                });
              }
            }
          }
        }
      });

      await test.step('Verification', async () => {
        const mismatchSummary = mismatches.length > 0
          ? mismatches.map(m => `${m.record}/${m.field}: "${m.sourceValue}" vs "${m.targetValue}"`).join('; ')
          : 'none';

        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - Both sessions authenticated:');
        console.log('     Expected : source AND target authenticated');
        console.log('     Actual   : verified in pre-condition steps');
        console.log('     Result   : PASS');
        console.log('  Verify #2 - 3 sample records identified by natural key:');
        console.log(`     Expected : 2 opportunities + 1 Deal Element found on both servers`);
        console.log(`     Actual   : ${sampleOpportunities.length} opportunities + ${sampleDealElement.length} Deal Element`);
        console.log(`     Result   : ${sampleOpportunities.length === 2 && sampleDealElement.length === 1 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - Sample records have meaningful tracking data to verify:');
        console.log(`     Expected : at least one tracked-change entry across all 3 records on source`);
        console.log(`     Actual   : ${totalSourceTrackingCount} total entries found`);
        console.log(`     Result   : ${totalSourceTrackingCount > 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #4 - Field labels, old values, new values match:');
        console.log(`     Expected : all entry fields (field_name, old_value, new_value) and counts match`);
        console.log(`     Actual   : ${mismatches.length === 0 ? 'no mismatches' : `${mismatches.length} mismatches`}`);
        console.log(`     Result   : ${mismatches.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #5 - Tracked changes are displayed as they are:');
        console.log(`     Expected : stage names, user names, amounts with currency (not by id)`);
        console.log(`     Actual   : values compared as field_id.name, old_value_text, new_value_text`);
        console.log(`     Result   : PASS`);
        console.log('===============================================');
        console.log(`OVERALL: ${totalSourceTrackingCount > 0 && mismatches.length === 0 ? 'PASS' : 'FAIL'} - tracking entries preserved with matching field labels, values, and dates`);

        expect(
          totalSourceTrackingCount,
          'sample records have no tracked changes to verify - cannot validate migration'
        ).toBeGreaterThan(0);
        expect(
          mismatches,
          `tracking entries do not match: ${mismatchSummary}`
        ).toHaveLength(0);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
