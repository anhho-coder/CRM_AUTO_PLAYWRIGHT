import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig/MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.6.3 ==========
 * Test Case ID    : CRM-12366_4.6.3
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.6 - Side effects of the install
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify that the system Base URL configuration parameter is set by checking that the
 *   ir.config_parameter with key='web.base.url' exists and its value is populated with a URL
 *   pointing to crm-mig.nakivo.site.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.6\\.3:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN access required
 *     - crm-mig.nakivo.site must be reachable
 *     - Logged in as anh.ho@nakivo.com (admin_crm_mig)
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to Settings > Technical > System Parameters (ir.config_parameter).
 *     3. Search for parameter key 'web.base.url'.
 *     4. Verify the parameter exists and its value is populated.
 *
 *   Expected:
 *     - ir.config_parameter with key='web.base.url' exists
 *     - value field is populated and contains a valid URL pointing to crm-mig.nakivo.site
 *     - At least one parameter record is read, confirming the check executed
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366 4.6.3 - Base URL configuration', () => {
  const STEP = {
    pre1:   'Pre-condition: login on the Migration server',
    s1:     'Step 1-4: [INTERNAL check, Call API] Read web.base.url config parameter and verify it is set',
    verify: 'Verification',
  } as const;

  test('CRM-12366_4.6.3: Verify system Base URL configuration parameter is set', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPlatform = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.6.3 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    interface ConfigParameter {
      id: number;
      key: string;
      value: string;
    }

    const result = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      // First, read all config parameters to prove the query executed
      const allParams: Array<{ key: string }> = await migPlatform.callKw(
        'ir.config_parameter',
        'search_read',
        [[]],
        { fields: ['key'], limit: 500 },
      );

      console.log(`  Total config parameters found: ${allParams.length}`);
      expect(allParams.length, 'no config parameters read - the query found nothing').toBeGreaterThan(0);

      // Search for the web.base.url parameter specifically
      const baseUrlParams: ConfigParameter[] = await migPlatform.callKw(
        'ir.config_parameter',
        'search_read',
        [[['key', '=', 'web.base.url']]],
        { fields: ['key', 'value'], limit: 10 },
      );

      console.log(`  web.base.url parameter records found: ${baseUrlParams.length}`);

      if (baseUrlParams.length > 0) {
        const param = baseUrlParams[0];
        console.log(`  Parameter key  : ${param.key}`);
        console.log(`  Parameter value: ${param.value}`);

        // Verify the URL is valid and contains crm-mig
        const isValidUrl = param.value && param.value.length > 0;
        const containsMigHost = param.value && param.value.toLowerCase().includes('crm-mig');

        console.log(`  Value is populated: ${isValidUrl}`);
        console.log(`  Contains crm-mig host: ${containsMigHost}`);

        return {
          parameterExists: true,
          parameter: param,
          isValidUrl,
          containsMigHost,
          parameterCount: baseUrlParams.length,
          totalParamCount: allParams.length,
        };
      } else {
        console.log('  web.base.url parameter NOT FOUND');
        return {
          parameterExists: false,
          parameter: null,
          isValidUrl: false,
          containsMigHost: false,
          parameterCount: 0,
          totalParamCount: allParams.length,
        };
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`\n==================== VERIFY ====================`);

      console.log(`Verify #1 - web.base.url parameter exists:`);
      console.log(`   Expected : 1 record`);
      console.log(`   Actual   : ${result.parameterCount} record(s)`);
      console.log(`   Result   : ${result.parameterExists ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #2 - value is populated:`);
      console.log(`   Expected : populated URL`);
      console.log(`   Actual   : ${result.parameter?.value || '(empty)'}`);
      console.log(`   Result   : ${result.isValidUrl ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #3 - URL points to crm-mig.nakivo.site:`);
      console.log(`   Expected : contains crm-mig`);
      console.log(`   Actual   : ${result.containsMigHost ? 'yes' : 'no'}`);
      console.log(`   Result   : ${result.containsMigHost ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #4 - config parameters were read:`);
      console.log(`   Expected : > 0`);
      console.log(`   Actual   : ${result.totalParamCount}`);
      console.log(`   Result   : ${result.totalParamCount > 0 ? 'PASS' : 'FAIL'}`);

      console.log(`===============================================`);
      console.log(
        `OVERALL: ${result.parameterExists && result.isValidUrl && result.containsMigHost ? 'PASS' : 'FAIL'} - web.base.url is configured`,
      );

      expect(result.parameterExists, 'web.base.url parameter should exist').toBe(true);
      expect(result.isValidUrl, 'web.base.url value should be populated').toBe(true);
      expect(result.containsMigHost, 'web.base.url should contain crm-mig').toBe(true);
    });
  });
});
