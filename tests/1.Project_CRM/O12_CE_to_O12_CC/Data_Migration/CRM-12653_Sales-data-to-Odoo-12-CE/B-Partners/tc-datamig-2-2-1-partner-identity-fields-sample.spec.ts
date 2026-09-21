import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_2.2.1 - Partner identity fields on a 10-partner sample
 * Test Case ID: CRM-12653_2.2.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   The identity fields of a sampled partner are carried over unchanged from pre-production
 *   to crm-mig, with environment e-mail masking accounted for. The sample is built deterministically
 *   (5 earliest + 5 latest by creation date within the cut-off window) and reused across
 *   CRM-12653_2.2.2 and CRM-12653_2.3.1.
 *
 * Source manual TC (master tab "Partners", row 149):
 *   On pre-production: sort Contacts by Created on, take first 5 (ascending) + first 5 (descending)
 *   to form a 10-partner sample. Then read 11 identity fields from each partner on both servers
 *   and compare. Email masking on non-prod environments is handled by stripping any trailing
 *   "00001" suffix before comparison.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_2\.2\.1:" --project=chromium
 */

/** Inline session helper to open both servers. */
async function openSession(
  browser: Browser, url: string, isMig: boolean, username: string, password: string,
): Promise<{ context: BrowserContext; parity: MigDataParityPage }> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true, // crm-mig serves a self-signed chain
  });
  const page = await context.newPage();
  const loginPage = isMig ? new LoginPageMig(page) : new LoginPage(page);
  await loginPage.navigateTo(url);
  await loginPage.login(username, password);
  return { context, parity: new MigDataParityPage(page) };
}

/** Normalize email for comparison: strip trailing "00001" masking suffix if present. */
function normalizeEmail(email: string): string {
  if (!email) return email;
  return email.replace(/00001@/, '@');
}

test.describe('CRM-12653_2.2.1 - Partner identity fields on a sample', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_2.2.1: Partner identity fields of a 10-partner sample match between pre-production and crm-mig', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let migContext: BrowserContext | null = null;

    try {
      // Open both servers
      const targetSession = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
      migContext = targetSession.context;
      const targetParity = targetSession.parity;

      const sourceSession = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
      sourceContext = sourceSession.context;
      const sourceParity = sourceSession.parity;

      // Verify both sessions are authenticated
      const isSourceAuthenticated = await sourceParity.isAuthenticatedSession();
      const isTargetAuthenticated = await targetParity.isAuthenticatedSession();
      expect(isSourceAuthenticated, 'source session must be authenticated').toBe(true);
      expect(isTargetAuthenticated, 'target session (crm-mig) must be authenticated').toBe(true);

      // Get the cut-off date from the target session
      const cutoff = await targetParity.resolveCutoffDate();
      console.log(`\n========== CRM-12653_2.2.1 - Partner identity fields on a 10-partner sample ==========`);
      console.log(`Cut-off date from target: ${cutoff}`);

      // Step 1: Build a deterministic sample of 10 partners on the source (5 earliest + 5 latest)
      await test.step('Step 1: Build a 10-partner sample on pre-production (5 earliest + 5 latest by Created on)', async () => {
        const domain = MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date');
        const earliestPartners = await sourceParity.searchRead<{ id: number; name: string }>(
          'res.partner',
          domain,
          ['name'],
          { limit: 5, order: 'create_date asc' },
        );
        const latestPartners = await sourceParity.searchRead<{ id: number; name: string }>(
          'res.partner',
          domain,
          ['name'],
          { limit: 5, order: 'create_date desc' },
        );
        console.log(`\n--- Partner Sample ---`);
        console.log('5 earliest (ascending):');
        earliestPartners.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
        console.log('5 latest (descending):');
        latestPartners.forEach((p, i) => console.log(`  ${i + 6}. ${p.name}`));
      });

      // Step 2: Read identity fields from the 10 sampled partners on source
      const sourcePartners = await test.step('Step 2: Read 11 identity fields from the 10 sampled partners on pre-production', async () => {
        const domain = MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date');
        const earliest = await sourceParity.searchRead<any>(
          'res.partner',
          domain,
          ['name', 'company_type', 'parent_id', 'function', 'phone', 'mobile', 'email', 'website', 'lang', 'category_id', 'ref'],
          { limit: 5, order: 'create_date asc' },
        );
        const latest = await sourceParity.searchRead<any>(
          'res.partner',
          domain,
          ['name', 'company_type', 'parent_id', 'function', 'phone', 'mobile', 'email', 'website', 'lang', 'category_id', 'ref'],
          { limit: 5, order: 'create_date desc' },
        );
        const sample = [...earliest, ...latest];
        console.log(`\n--- Source fields (pre-production) ---`);
        sample.forEach((p) => {
          console.log(`\n  Partner: ${p.name}`);
          console.log(`    Company Type: ${p.company_type || '(empty)'}`);
          console.log(`    Parent company: ${p.parent_id?.[1] || '(empty)'}`);
          console.log(`    Job Position: ${p.function || '(empty)'}`);
          console.log(`    Phone: ${p.phone || '(empty)'}`);
          console.log(`    Mobile: ${p.mobile || '(empty)'}`);
          console.log(`    Email: ${p.email || '(empty)'}`);
          console.log(`    Website: ${p.website || '(empty)'}`);
          console.log(`    Language: ${p.lang || '(empty)'}`);
          console.log(`    Tags: ${p.category_id?.length > 0 ? p.category_id.map((c: any) => c[1]).join(', ') : '(empty)'}`);
          console.log(`    Internal Reference: ${p.ref || '(empty)'}`);
        });
        return sample;
      });

      // Step 3: Search and read the same fields from the 10 partners on target by name
      const targetPartners = await test.step('Step 3: Search and open the 10 sampled partners on crm-mig, read the same fields', async () => {
        const domain = MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date');
        const results = [];
        for (const sp of sourcePartners) {
          const matches = await targetParity.searchRead<any>(
            'res.partner',
            [['name', '=', sp.name], ...domain],
            ['name', 'company_type', 'parent_id', 'function', 'phone', 'mobile', 'email', 'website', 'lang', 'category_id', 'ref'],
            { limit: 1 },
          );
          if (matches.length > 0) {
            results.push(matches[0]);
          } else {
            results.push(null); // Mark as not found
          }
        }
        console.log(`\n--- Target fields (crm-mig) ---`);
        results.forEach((p, idx) => {
          const spName = sourcePartners[idx]?.name || 'Unknown';
          if (!p) {
            console.log(`\n  Partner: ${spName} - NOT FOUND on target`);
          } else {
            console.log(`\n  Partner: ${p.name}`);
            console.log(`    Company Type: ${p.company_type || '(empty)'}`);
            console.log(`    Parent company: ${p.parent_id?.[1] || '(empty)'}`);
            console.log(`    Job Position: ${p.function || '(empty)'}`);
            console.log(`    Phone: ${p.phone || '(empty)'}`);
            console.log(`    Mobile: ${p.mobile || '(empty)'}`);
            console.log(`    Email: ${p.email || '(empty)'}`);
            console.log(`    Website: ${p.website || '(empty)'}`);
            console.log(`    Language: ${p.lang || '(empty)'}`);
            console.log(`    Tags: ${p.category_id?.length > 0 ? p.category_id.map((c: any) => c[1]).join(', ') : '(empty)'}`);
            console.log(`    Internal Reference: ${p.ref || '(empty)'}`);
          }
        });
        return results;
      });

      // Step 4: Compare field by field and record differences
      const differences: Array<{ partner: string; field: string; source: string; target: string }> = [];
      let foundCount = 0;

      await test.step('Step 4: Compare fields and record differences', async () => {
        console.log(`\n--- Comparison Results ---`);
        for (let i = 0; i < sourcePartners.length; i++) {
          const sp = sourcePartners[i];
          const tp = targetPartners[i];

          if (!tp) {
            console.log(`\n  ${sp.name}: NOT FOUND on target`);
            continue;
          }

          foundCount++;
          console.log(`\n  ${sp.name}:`);

          // Map source and target fields for comparison
          const fields = [
            { name: 'Company Type', key: 'company_type', sval: sp.company_type, tval: tp.company_type },
            { name: 'Parent company', key: 'parent_id', sval: sp.parent_id?.[1], tval: tp.parent_id?.[1] },
            { name: 'Job Position', key: 'function', sval: sp.function, tval: tp.function },
            { name: 'Phone', key: 'phone', sval: sp.phone, tval: tp.phone },
            { name: 'Mobile', key: 'mobile', sval: sp.mobile, tval: tp.mobile },
            { name: 'Email', key: 'email', sval: normalizeEmail(sp.email || ''), tval: normalizeEmail(tp.email || '') },
            { name: 'Website', key: 'website', sval: sp.website, tval: tp.website },
            { name: 'Language', key: 'lang', sval: sp.lang, tval: tp.lang },
            { name: 'Tags', key: 'category_id', sval: sp.category_id?.map((c: any) => c[1]).sort().join(', ') || '', tval: tp.category_id?.map((c: any) => c[1]).sort().join(', ') || '' },
            { name: 'Internal Reference', key: 'ref', sval: sp.ref, tval: tp.ref },
          ];

          for (const field of fields) {
            const sourceVal = field.sval || '';
            const targetVal = field.tval || '';
            if (sourceVal !== targetVal) {
              differences.push({
                partner: sp.name,
                field: field.name,
                source: sourceVal || '(empty)',
                target: targetVal || '(empty)',
              });
              console.log(`    ${field.name}: MISMATCH`);
              console.log(`      Source: ${sourceVal || '(empty)'}`);
              console.log(`      Target: ${targetVal || '(empty)'}`);
            } else {
              console.log(`    ${field.name}: OK`);
            }
          }
        }
      });

      // Verification block
      console.log('\n==================== VERIFY ====================');
      console.log('Expected #1: All 10 sampled partners are found on crm-mig by name (10 of 10)');
      console.log(`  Actual: ${foundCount} of 10 partners found`);
      console.log(`  Result: ${foundCount === 10 ? 'PASS' : 'FAIL'}`);

      console.log('\nExpected #2: All 11 fields hold the same value on both servers for each partner');
      console.log(`  Actual: ${differences.length} field mismatches found`);
      if (differences.length > 0) {
        differences.forEach((d) => {
          console.log(`    - ${d.partner} / ${d.field}: "${d.source}" vs "${d.target}"`);
        });
      }
      console.log(`  Result: ${differences.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('\nExpected #3: Empty on source must remain empty on target; filled must remain filled');
      const emptyFieldMismatches = differences.filter((d) => (d.source === '(empty)') !== (d.target === '(empty)'));
      console.log(`  Actual: ${emptyFieldMismatches.length} empty/filled mismatches found`);
      if (emptyFieldMismatches.length > 0) {
        emptyFieldMismatches.forEach((d) => {
          console.log(`    - ${d.partner} / ${d.field}: was "${d.source}" now "${d.target}"`);
        });
      }
      console.log(`  Result: ${emptyFieldMismatches.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================\n');

      // Assertions
      expect(foundCount, 'all 10 sampled partners must be found on crm-mig by name').toBe(10);
      expect(differences, 'all identity fields must match between source and target (after email normalization)').toHaveLength(0);
      expect(emptyFieldMismatches, 'empty fields on source must stay empty on target, and vice versa').toHaveLength(0);

    } finally {
      // Close both browser contexts
      if (sourceContext) {
        await sourceContext.close();
      }
      if (migContext) {
        await migContext.close();
      }
    }
  });
});
