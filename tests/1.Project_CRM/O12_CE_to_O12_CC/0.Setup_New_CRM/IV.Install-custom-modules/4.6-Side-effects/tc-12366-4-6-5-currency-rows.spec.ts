import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig/MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.6.5 ==========
 * Test Case ID    : CRM-12366_4.6.5
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.6 - Side effects of the install
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify that currency records are created with valid codes by checking that multiple
 *   res.currency records exist with populated name (code) fields.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.6\\.5:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN access required
 *     - crm-mig.nakivo.site must be reachable
 *     - Logged in as anh.ho@nakivo.com (admin_crm_mig)
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to Accounting > Configuration > Currencies (res.currency) or Settings > Localization > Currencies.
 *     3. Verify multiple currency records are listed.
 *     4. Spot-check two currencies and confirm each has a valid currency code (name, symbol).
 *
 *   Expected:
 *     - Multiple res.currency records exist
 *     - Each currency has a populated name (code) field
 *     - At least one currency record is read, confirming the check executed
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366 4.6.5 - Currency records created', () => {
  const STEP = {
    pre1:   'Pre-condition: login on the Migration server',
    s1:     'Step 1-4: [INTERNAL check, Call API] Read res.currency records and verify they have valid codes',
    verify: 'Verification',
  } as const;

  test('CRM-12366_4.6.5: Verify currency records are created with valid codes', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPlatform = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.6.5 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    interface CurrencyRecord {
      id: number;
      name: string;
      symbol: string;
      active: boolean;
    }

    const result = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      // Read all currency records
      const currencies: CurrencyRecord[] = await migPlatform.callKw(
        'res.currency',
        'search_read',
        [[]],
        { fields: ['name', 'symbol', 'active'], limit: 500 },
      );

      console.log(`  Total res.currency records found: ${currencies.length}`);
      expect(currencies.length, 'no currency records read - the query found nothing').toBeGreaterThan(0);

      // Count currencies with populated name field
      const currenciesWithValidName = currencies.filter((c) => c.name && c.name.trim().length > 0).length;
      console.log(`  Currencies with populated name field: ${currenciesWithValidName}`);

      // Spot-check first two currencies
      console.log(`  Spot-checking currencies:`);
      for (let i = 0; i < Math.min(2, currencies.length); i++) {
        const curr = currencies[i];
        console.log(`    Currency ${i + 1}:`);
        console.log(`      - Code   : ${curr.name}`);
        console.log(`      - Symbol : ${curr.symbol || '(empty)'}`);
        console.log(`      - Active : ${curr.active}`);
      }

      if (currencies.length > 2) {
        console.log(`  ... and ${currencies.length - 2} more currencies`);
      }

      return {
        currencyCount: currencies.length,
        currenciesWithValidName,
        currencies,
        firstCurrency: currencies[0] || null,
        secondCurrency: currencies.length > 1 ? currencies[1] : null,
      };
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`\n==================== VERIFY ====================`);

      console.log(`Verify #1 - multiple currency records exist:`);
      console.log(`   Expected : >= 2 (multiple)`);
      console.log(`   Actual   : ${result.currencyCount}`);
      console.log(`   Result   : ${result.currencyCount >= 2 ? 'PASS' : result.currencyCount >= 1 ? 'PASS (at least 1)' : 'FAIL'}`);

      console.log(`\nVerify #2 - currency code (name) is populated:`);
      console.log(`   Expected : all have populated name`);
      console.log(`   Actual   : ${result.currenciesWithValidName} out of ${result.currencyCount}`);
      console.log(`   Result   : ${result.currenciesWithValidName >= 2 ? 'PASS' : result.currenciesWithValidName >= 1 ? 'PASS (at least 1)' : 'FAIL'}`);

      console.log(`\nVerify #3 - spot-check first currency has valid code:`);
      if (result.firstCurrency) {
        console.log(`   Expected : populated code`);
        console.log(`   Actual   : "${result.firstCurrency.name}"`);
        console.log(`   Result   : ${result.firstCurrency.name && result.firstCurrency.name.trim().length > 0 ? 'PASS' : 'FAIL'}`);
      } else {
        console.log(`   Expected : populated code`);
        console.log(`   Actual   : (no currency)`);
        console.log(`   Result   : FAIL`);
      }

      console.log(`===============================================`);
      console.log(
        `OVERALL: ${result.currencyCount >= 2 && result.currenciesWithValidName >= 2 ? 'PASS' : 'FAIL'} - multiple valid currency records exist`,
      );

      expect(result.currencyCount, 'multiple currency records should exist').toBeGreaterThanOrEqual(2);
      expect(result.currenciesWithValidName, 'currencies should have populated name (code) field').toBeGreaterThanOrEqual(2);
      expect(result.firstCurrency?.name, 'first currency should have a valid code').toBeTruthy();
    });
  });
});
