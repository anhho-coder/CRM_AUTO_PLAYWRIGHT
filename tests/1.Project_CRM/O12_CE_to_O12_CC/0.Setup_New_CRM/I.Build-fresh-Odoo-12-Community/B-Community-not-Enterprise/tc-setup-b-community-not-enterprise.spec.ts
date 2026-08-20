import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12325 Part 2-B - Correct Odoo 12 + Community, NOT Enterprise (crm-mig.nakivo.site)
 * Test Case ID: CRM-12325_1.2.1
 * Automation-Type: new
 * Automation-Date: 2026-08-19
 *
 * Summary:
 *   Verifies the Migration server runs Odoo 12.0 Community, not Enterprise - the reported
 *   version/edition is 12.0 Community and no enterprise (web_enterprise / *_enterprise) module is
 *   installed.
 *
 * Source manual TC (mirrors ticket CRM-12325 Part 2):
 * Pre-conditions: Login as Admin (anh.ho) on the O12 Migration server.
 * Steps to reproduce (ticket Part 2-B):
 *   1. Read the server version and edition.
 *   2. Read the installed modules and check for enterprise modules.
 * Verification Points:
 *   1. Version reads Odoo 12.0 and Community edition.
 *   2. No enterprise (*_enterprise) module is installed.
 *   3. web_enterprise is not installed.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_1\.2\.1:" --project=chromium
 */
test.describe('CRM-12325 Part 2-B - Community, not Enterprise', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await page.waitForTimeout(3000);
      await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  });

  test('CRM-12325_1.2.1: [Part2-B] Odoo 12 Community with no Enterprise module present', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    // Declare vars at test level so they are accessible across all steps
    let v: any;
    let is12: boolean;
    let isCommunity: boolean;
    let mods: any;
    let enterpriseInstalled: any[];
    let webEnt: any;
    let webEntInstalled: boolean;

    await test.step('Pre-condition 1: Login as Admin on the O12 Migration server', async () => {
      console.log('\n--- Pre-condition 1: Login as Admin on the O12 Migration server ---');
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step('Step 1: Read the server version and edition', async () => {
      v = await platform.getServerVersionInfo();
      is12 = String(v.server_version).startsWith('12.0');
      isCommunity = !String(v.server_version).includes('+e') && v.server_version_info[5] !== 'e';
      console.log('\n=== STEP 1: VERSION + EDITION ===');
      console.log(`  server_version      : ${v.server_version}`);
      console.log(`  server_version_info : ${JSON.stringify(v.server_version_info)}`);
    });

    await test.step('Step 2: Read the installed modules and check for enterprise modules', async () => {
      mods = await platform.getModules();
      enterpriseInstalled = mods.filter(m => m.state === 'installed' && /enterprise/i.test(m.name)).map(m => m.name);
      webEnt = mods.find(m => m.name === 'web_enterprise');
      webEntInstalled = !!webEnt && webEnt.state === 'installed';
      console.log('\n=== STEP 2: NO ENTERPRISE MODULE ===');
      console.log(`  installed modules      : ${mods.filter(m => m.state === 'installed').length}`);
      console.log(`  enterprise installed   : [${enterpriseInstalled.join(', ')}]`);
      console.log(`  web_enterprise state   : ${webEnt ? webEnt.state : 'absent'}`);
    });

    await test.step('Verification', async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('Verify #1 - Version reads Odoo 12.0 and Community edition:');
      console.log(`   Expected : 12.0 and Community`);
      console.log(`   Actual   : ${v.server_version} and ${isCommunity ? 'Community' : 'Enterprise'}`);
      console.log(`   Result   : ${is12 && isCommunity ? 'PASS' : 'FAIL'}`);

      console.log('Verify #2 - No enterprise (*_enterprise) module is installed:');
      console.log(`   Expected : 0 enterprise modules`);
      console.log(`   Actual   : ${enterpriseInstalled.length}`);
      console.log(`   Result   : ${enterpriseInstalled.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('Verify #3 - web_enterprise is not installed:');
      console.log(`   Expected : false`);
      console.log(`   Actual   : ${webEntInstalled}`);
      console.log(`   Result   : ${!webEntInstalled ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const allPass = is12 && isCommunity && enterpriseInstalled.length === 0 && !webEntInstalled;
      console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'} - Community edition with no enterprise modules`);

      expect(is12, `server version should be 12.0 (got ${v.server_version})`).toBeTruthy();
      expect(isCommunity, `edition should be Community (server_version_info=${JSON.stringify(v.server_version_info)})`).toBeTruthy();
      expect(enterpriseInstalled, `no *_enterprise module should be installed (found: ${enterpriseInstalled.join(', ')})`).toHaveLength(0);
      expect(webEntInstalled, 'web_enterprise must not be installed').toBeFalsy();
    });
  });
});
