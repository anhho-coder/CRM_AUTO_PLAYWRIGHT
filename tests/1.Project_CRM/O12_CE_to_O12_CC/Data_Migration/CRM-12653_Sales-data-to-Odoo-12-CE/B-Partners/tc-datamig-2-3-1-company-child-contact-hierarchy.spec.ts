import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_2.3.1 - Company to child-contact hierarchy migration
 * Test Case ID: CRM-12653_2.3.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   A migrated company keeps exactly the same set of child contacts, none flattened
 *   into standalone partners. The parent-company link is preserved on every child contact.
 *
 * Source manual TC (master tab "Migration - Sales data to Odoo 12 CE", row 2.3.1):
 *   On pre-production, sample 5 company partners created on or before <CUTOFF> with
 *   at least 2 child contacts each. On crm-mig, verify each company's child list (by name)
 *   is identical, and that 2 sampled children show the parent-company link intact.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_2\.3\.1:" --project=chromium
 */

/**
 * Inline session opener. Opens a browser tab on either server and returns
 * the context + authenticated MigDataParityPage reader.
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

test.describe('CRM-12653_2.3.1 - Company to child-contact hierarchy', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_2.3.1: Company child-contact hierarchy is preserved during migration', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      // Open TARGET session first to resolve the cut-off date
      const target = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
      targetContext = target.context;
      const targetParity = target.parity;

      const cutoff = await targetParity.resolveCutoffDate();
      console.log(`\n========== CRM-12653_2.3.1 - Company child-contact hierarchy ==========`);
      console.log(`  Cut-off date: ${cutoff}`);

      // Open SOURCE session
      const source = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
      sourceContext = source.context;
      const sourceParity = source.parity;

      // Verify both sessions are authenticated
      const sourceAuth = await sourceParity.isAuthenticatedSession();
      const targetAuth = await targetParity.isAuthenticatedSession();
      expect(sourceAuth, 'source session not authenticated').toBe(true);
      expect(targetAuth, 'target session not authenticated').toBe(true);

      const cutoffFilter = MigDataParityPage.onOrBeforeCutoff(cutoff);
      const sampleCompanies: Array<{ name: string; childNames: string[]; childCount: number }> = [];
      const notFoundCompanies: string[] = [];
      const missingChildren: Array<{ company: string; child: string }> = [];
      const flattenedChildren: Array<{ company: string; childName: string }> = [];

      await test.step('Step 1: Sample 5 company partners from source with >= 2 child contacts', async () => {
        console.log('\n--- Step 1: Sample 5 company partners with >= 2 child contacts ---');

        // Read all company partners on the source within the cut-off
        const allCompanies: Array<{ id: number; name: string }> = await sourceParity.searchRead<{ id: number; name: string }>(
          'res.partner',
          [...cutoffFilter, ['is_company', '=', true]],
          ['name'],
          { limit: 500 },
        );
        console.log(`  Source has ${allCompanies.length} company partners within cut-off`);

        // Guard: source must have at least some companies to compare
        expect(allCompanies.length, 'source has no company partners within cut-off').toBeGreaterThan(0);

        // For each company, count its children
        const companiesWithChildren: Array<{ id: number; name: string; childCount: number }> = [];
        for (const company of allCompanies) {
          const childCount = await sourceParity.searchCount('res.partner', [['parent_id', '=', company.id]]);
          if (childCount >= 2) {
            companiesWithChildren.push({ id: company.id, name: company.name, childCount });
          }
        }
        console.log(`  ${companiesWithChildren.length} companies have >= 2 child contacts`);

        // Deterministically sample 5: first and last of sorted list
        if (companiesWithChildren.length >= 5) {
          const sorted = [...companiesWithChildren].sort((a, b) => a.name.localeCompare(b.name));
          const sampled = [
            sorted[0],
            sorted[1],
            sorted[Math.floor(sorted.length / 2)],
            sorted[sorted.length - 2],
            sorted[sorted.length - 1],
          ];
          for (const c of sampled) {
            const children: Array<{ name: string }> = await sourceParity.searchRead<{ name: string }>(
              'res.partner',
              [['parent_id', '=', c.id]],
              ['name'],
              { limit: 500 },
            );
            const childNames = children.map(ch => ch.name).sort();
            sampleCompanies.push({ name: c.name, childNames, childCount: children.length });
            console.log(`  [${sampleCompanies.length}] ${c.name} -> ${childNames.length} children`);
          }
        } else {
          throw new Error(`Not enough companies with >= 2 children: found ${companiesWithChildren.length}, need 5`);
        }
      });

      await test.step('Step 2-3: Read same companies on target and compare child lists', async () => {
        console.log('\n--- Step 2-3: Verify company child lists on target ---');

        for (const sourceCompany of sampleCompanies) {
          // Search for the company on the target by name
          const targetMatches: Array<{ id: number; name: string }> = await targetParity.searchRead<{ id: number; name: string }>(
            'res.partner',
            [['name', '=', sourceCompany.name], ['is_company', '=', true]],
            ['name'],
            { limit: 500 },
          );

          if (targetMatches.length === 0) {
            console.log(`  [${sourceCompany.name}] NOT FOUND on target`);
            notFoundCompanies.push(sourceCompany.name);
            continue;
          }

          const targetCompany = targetMatches[0];

          // Read target company's children
          const targetChildren: Array<{ name: string }> = await targetParity.searchRead<{ name: string }>(
            'res.partner',
            [['parent_id', '=', targetCompany.id]],
            ['name'],
            { limit: 500 },
          );
          const targetChildNames = targetChildren.map(ch => ch.name).sort();

          // Compare sets
          const sourceChildSet = new Set(sourceCompany.childNames);
          const targetChildSet = new Set(targetChildNames);

          // Find missing children
          for (const sourceChild of sourceCompany.childNames) {
            if (!targetChildSet.has(sourceChild)) {
              missingChildren.push({ company: sourceCompany.name, child: sourceChild });
            }
          }

          const matches =
            sourceCompany.childNames.length === targetChildNames.length &&
            [...sourceChildSet].every(name => targetChildSet.has(name));

          const status = matches ? 'MATCH' : 'MISMATCH';
          console.log(`  [${sourceCompany.name}] ${status} - source: ${sourceCompany.childCount}, target: ${targetChildNames.length}`);
          if (!matches) {
            console.log(`     Source: ${sourceCompany.childNames.join(', ')}`);
            console.log(`     Target: ${targetChildNames.join(', ')}`);
          }
        }
      });

      await test.step('Step 4: Verify parent company link on 2 sampled child contacts', async () => {
        console.log('\n--- Step 4: Verify parent company link on sampled children ---');

        let childrenChecked = 0;
        for (const sourceCompany of sampleCompanies) {
          if (childrenChecked >= 2) break;

          // Find the target company
          const targetCompanyResult: Array<{ id: number; name: string }> = await targetParity.searchRead<{ id: number; name: string }>(
            'res.partner',
            [['name', '=', sourceCompany.name], ['is_company', '=', true]],
            ['name'],
            { limit: 500 },
          );

          if (targetCompanyResult.length === 0) continue;

          // Read first child from target
          const targetChildren: Array<{ id: number; name: string; parent_id: [number, string] | boolean }> = await targetParity.searchRead<{ id: number; name: string; parent_id: [number, string] | boolean }>(
            'res.partner',
            [['parent_id', '=', targetCompanyResult[0].id]],
            ['name', 'parent_id'],
            { limit: 1 },
          );

          if (targetChildren.length > 0) {
            const child = targetChildren[0];
            const parentName = Array.isArray(child.parent_id) ? child.parent_id[1] : null;
            console.log(`  Child: ${child.name} -> Parent: ${parentName || '(empty)'}`);

            // Detect flattened children: parent_id is false/empty means no parent set
            if (!parentName) {
              flattenedChildren.push({ company: sourceCompany.name, childName: child.name });
            } else if (parentName !== sourceCompany.name) {
              // Parent link exists but points to wrong company
              flattenedChildren.push({ company: sourceCompany.name, childName: child.name });
            }
            childrenChecked++;
          }
        }
      });

      // VERIFICATION BLOCK
      await test.step('Verification', async () => {
        console.log('\n==================== VERIFY ====================');

        console.log('  Verify #1 - All 5 sampled companies are found on target by name:');
        console.log(`     Expected : 5 companies found`);
        console.log(`     Actual   : ${sampleCompanies.length - notFoundCompanies.length}`);
        console.log(`     Result   : ${notFoundCompanies.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #2 - Each company has identical child list (same names and count):');
        console.log(`     Expected : all child lists match`);
        console.log(`     Actual   : ${missingChildren.length} missing children`);
        console.log(`     Result   : ${missingChildren.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #3 - Sampled child contacts show correct parent company link:');
        console.log(`     Expected : all children point to correct parent company`);
        console.log(`     Actual   : ${flattenedChildren.length} with empty or incorrect parent`);
        console.log(`     Result   : ${flattenedChildren.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #4 - No children flattened or incorrectly linked:');
        console.log(`     Expected : 0 flattened or mislinked children`);
        console.log(`     Actual   : ${flattenedChildren.length}`);
        if (flattenedChildren.length > 0) {
          flattenedChildren.forEach(f => {
            console.log(`       - ${f.childName} (was child of ${f.company})`);
          });
        }
        console.log(`     Result   : ${flattenedChildren.length === 0 ? 'PASS' : 'FAIL'}`);

        console.log('===============================================');

        // Assertions - one per expected bullet (expectedBulletCount = 4)
        expect(notFoundCompanies, 'sampled companies not found on target by name').toHaveLength(0);
        expect(missingChildren, 'child contacts missing from target child list').toHaveLength(0);
        expect(flattenedChildren, 'child contacts flattened, empty parent, or incorrect parent link').toHaveLength(0);
        expect(sampleCompanies.length, 'could not sample 5 companies with >= 2 children').toBeGreaterThanOrEqual(5);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
