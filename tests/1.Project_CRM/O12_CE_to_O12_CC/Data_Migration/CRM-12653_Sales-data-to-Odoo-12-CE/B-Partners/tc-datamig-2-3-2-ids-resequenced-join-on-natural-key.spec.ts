import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Part 2.3.2 - Primary keys resequenced; join on natural keys only
 * Test Case ID: CRM-12653_2.3.2
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Primary keys (res.partner.id) are re-sequenced by the migration, so the same
 *   record carries a different id on the two servers. This spec verifies that
 *   accessing a partner via a pre-production id on crm-mig opens a different record
 *   or an empty form, proving that id-based joins would silently compare unrelated
 *   records. This is why every parity check must join on natural keys: partner name
 *   + email, Deal Element / Order Reference, invoice Number, product internal code.
 *
 * Source manual TC (master sheet tab "CRM-12653 Data Migration Sales", row 2.3.2):
 *
 * Pre-conditions:
 *   VPN connected; both pre-production (Odoo 12 Enterprise) and crm-mig
 *   (Odoo 12 Community) are reachable.
 *   Login: anh.ho@nakivo.com (admin_crm for source, admin_crm_mig for target).
 *   One partner name from the CRM-12653_2.2.1 sample is at hand.
 *
 * Steps to reproduce:
 *   1. On pre-production open the sampled partner and read the id= value in
 *      the browser address bar.
 *   2. On crm-mig find the SAME partner by name, open it and read its id= value.
 *   3. On crm-mig edit the address bar to the pre-production id:
 *      /web#id=<the id read in step 1>&model=res.partner&view_type=form ,
 *      and press Enter.
 *   4. Read the name shown on the form that opens.
 *
 * Verification Points:
 *   1. The two id values are DIFFERENT for the same partner.
 *   2. crm-mig opens a DIFFERENT partner, or an empty form - it does NOT
 *      raise an error and it does NOT open the sampled partner.
 *
 * READ-ONLY: this spec only reads partner records via the RPC and form views.
 * It creates, modifies and deletes nothing, as required on crm-mig.
 *
 * NOTE: This test case exists to demonstrate the primary key resequencing trap
 * before trusting the parity numbers in the rest of CRM-12653. A verification
 * that joined on the record id would silently compare two unrelated records
 * and report a false difference.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_2\.3\.2:" --project=chromium
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

test.describe('CRM-12653 Part 2.3.2 - Partner IDs resequenced; join on natural keys', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_2.3.2: Record ids are re-sequenced; join on natural keys only', async ({ browser, page }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;
    let sourceParityPage: MigDataParityPage | null = null;
    let targetParityPage: MigDataParityPage | null = null;

    try {
      console.log('========== CRM-12653_2.3.2 - Primary Keys Resequenced by Migration ==========');

      // Open target session first to resolve cut-off date
      await test.step('Pre-condition: Open session on crm-mig (target)', async () => {
        console.log('\n--- Pre-condition: Open session on crm-mig (target) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        const session = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        targetContext = session.context;
        targetParityPage = session.parity;

        const isAuth = await targetParityPage.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'target session not authenticated on crm-mig').toBe(true);
      });

      // Open source session
      await test.step('Pre-condition: Open session on pre-production (source)', async () => {
        console.log('\n--- Pre-condition: Open session on pre-production (source) ---');
        console.log(`  Account : ${users.admin_crm.username}`);
        console.log(`  Source  : ${baseUrl}`);
        const session = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        sourceContext = session.context;
        sourceParityPage = session.parity;

        const isAuth = await sourceParityPage.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'source session not authenticated on pre-production').toBe(true);
      });

      // Resolve cut-off from target
      const cutoff = await targetParityPage!.resolveCutoffDate();
      console.log(`\n--- Cut-off date resolved on target: ${cutoff} ---`);

      // Pick a deterministic partner from source: first by create_date asc
      let sampledPartnerName = '';
      let sourcePartnerId = 0;

      await test.step('Step 1: Sample one partner from source (created on/before cut-off)', async () => {
        console.log('\n--- Step 1: Sample one partner from source ---');

        const sourceDomain = [...MigDataParityPage.onOrBeforeCutoff(cutoff)];
        const sample = await sourceParityPage!.searchRead(
          'res.partner',
          sourceDomain,
          ['name', 'email'],
          { limit: 1, order: 'create_date asc' }
        );

        expect(sample.length, 'no partners found on source within cut-off window').toBeGreaterThan(0);

        sampledPartnerName = sample[0].name;
        const sampledEmail = sample[0].email || '(no email)';
        console.log(`  Sampled partner: "${sampledPartnerName}" (${sampledEmail})`);

        // Now read the ID of this partner directly
        const partnersByName = await sourceParityPage!.searchRead(
          'res.partner',
          [['name', '=', sampledPartnerName], ...MigDataParityPage.onOrBeforeCutoff(cutoff)],
          [],
          { limit: 1 }
        );

        if (partnersByName.length > 0) {
          sourcePartnerId = partnersByName[0].id;
          console.log(`  Source id: ${sourcePartnerId}`);
        }
      });

      // Find the same partner on crm-mig by name and read its ID
      let targetPartnerId = 0;
      let targetPartnerName = '';

      await test.step('Step 2: Find sampled partner on crm-mig by name and read its id', async () => {
        console.log('\n--- Step 2: Find sampled partner on crm-mig by name ---');

        const targetDomain = [
          ['name', '=', sampledPartnerName],
          ...MigDataParityPage.onOrBeforeCutoff(cutoff),
        ];

        const matches = await targetParityPage!.searchRead(
          'res.partner',
          targetDomain,
          ['name'],
          { limit: 1 }
        );

        expect(matches.length, `sampled partner "${sampledPartnerName}" not found on target by name`).toBe(1);

        targetPartnerId = matches[0].id;
        targetPartnerName = matches[0].name;
        console.log(`  Target id: ${targetPartnerId}`);
        console.log(`  Found partner: "${targetPartnerName}"`);
      });

      // Verify IDs are different
      console.log(`\n--- Step 2-3: Verify IDs differ ---`);
      console.log(`  Source id: ${sourcePartnerId}`);
      console.log(`  Target id: ${targetPartnerId}`);
      console.log(`  Are different: ${sourcePartnerId !== targetPartnerId}`);

      // Step 3-4: Navigate to pre-production ID on crm-mig target page
      let openedPartnerId = 0;

      await test.step('Step 3-4: On crm-mig, navigate to pre-production id and read what opens', async () => {
        console.log('\n--- Step 3-4: Open pre-production id on crm-mig and read the record that opens ---');

        const targetPage = (await targetContext!.pages())[0];
        const targetUrl = `${baseUrl_mig}/web#id=${sourcePartnerId}&model=res.partner&view_type=form`;
        console.log(`  Navigating to: /web#id=${sourcePartnerId}&model=res.partner&view_type=form`);

        await targetPage.goto(targetUrl);
        await targetPage.waitForLoadState('networkidle');
        await targetPage.waitForTimeout(CommonUtils.waitTimes.short);

        // Extract id from URL after navigation
        const currentUrl = targetPage.url();
        console.log(`  Current URL after navigation: ${currentUrl}`);
        const idMatch = currentUrl.match(/id=(\d+)/);
        if (idMatch) {
          openedPartnerId = parseInt(idMatch[1], 10);
          console.log(`  URL shows id: ${openedPartnerId}`);
        }
      });

      await test.step('Verification', async () => {
        const idsAreDifferent = sourcePartnerId !== targetPartnerId;
        const openedDifferentRecord = openedPartnerId !== targetPartnerId && openedPartnerId !== sourcePartnerId;
        const queriesRan = sourcePartnerId > 0 && targetPartnerId > 0 && sampledPartnerName.length > 0;

        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - Queries ran and partner found:');
        console.log(`     Expected : source id > 0 AND target id > 0`);
        console.log(`     Actual   : source_id=${sourcePartnerId}, target_id=${targetPartnerId}, partner="${sampledPartnerName}"`);
        console.log(`     Result   : ${queriesRan ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #2 - The two id values are DIFFERENT for the same partner:');
        console.log(`     Expected : source id (${sourcePartnerId}) != target id (${targetPartnerId})`);
        console.log(`     Actual   : ${idsAreDifferent}`);
        console.log(`     Result   : ${idsAreDifferent ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #3 - Pre-production id on crm-mig opens a different record (not the sampled partner):');
        console.log(`     Expected : opened id != target id (${targetPartnerId})`);
        console.log(`     Actual   : opened id = ${openedPartnerId === 0 ? 'empty form' : openedPartnerId}`);
        console.log(`     Result   : ${openedDifferentRecord || openedPartnerId === 0 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #4 - Demonstrates why every comparison must join on natural key:');
        console.log(`     Expected : id-based join would silently compare two unrelated records`);
        console.log(`     Actual   : pre-prod id ${sourcePartnerId} opens ${openedPartnerId === sourcePartnerId ? 'target' : openedPartnerId === 0 ? 'empty' : `different (${openedPartnerId})`} record`);
        console.log(`     Result   : ${!idsAreDifferent || !openedDifferentRecord ? 'FAIL - trap would exist' : 'PASS'}`);

        console.log('===============================================');
        console.log(`OVERALL: ${queriesRan && idsAreDifferent && (openedDifferentRecord || openedPartnerId === 0) ? 'PASS' : 'FAIL'} - primary keys resequenced, must join on natural keys`);

        expect(queriesRan, `queries failed to run: source_id=${sourcePartnerId}, target_id=${targetPartnerId}, partner="${sampledPartnerName}"`).toBe(true);
        expect(idsAreDifferent, `same partner carries same id on both servers: ${sourcePartnerId}`).toBe(true);
        expect(
          openedDifferentRecord || openedPartnerId === 0,
          `pre-production id ${sourcePartnerId} opened target record ${targetPartnerId} - ids are not resequenced`
        ).toBe(true);
        expect(
          idsAreDifferent && (openedDifferentRecord || openedPartnerId === 0),
          `the trap is not demonstrated: ids must differ AND pre-prod id must not open same record on target`
        ).toBe(true);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
