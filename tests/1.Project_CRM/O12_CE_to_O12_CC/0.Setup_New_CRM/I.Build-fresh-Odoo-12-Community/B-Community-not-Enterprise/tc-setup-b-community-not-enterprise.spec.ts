import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 * CRM-12325 Part 2-B - Odoo 12 Community, NOT Enterprise
 * ===========================================================================
 * Test Case ID    : CRM-12325_1.2.1
 * Jira            : CRM-12362
 * Test Repository : /CRM test/Migration - Setup New CRM/CRM-12325_Build fresh Odoo 12 Community/B. Community not Enterprise
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE)
 * Automation-Type : new
 * Automation-Date : 2026-08-19
 * Automation-Updated: 2026-09-15 (steps re-synced with the Jira manual TC)
 *
 * Summary:
 *   Verifies the Migration server runs Odoo 12.0 Community (not Enterprise) - the reported
 *   version/edition is 12.0 Community and no enterprise (web_enterprise / *_enterprise)
 *   module is installed.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_1\.2\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 * Source manual TC - Jira CRM-12362, Xray Manual Steps (verbatim, in order)
 * ---------------------------------------------------------------------------
 * Pre-conditions:
 *   _ Login: anh.ho@nakivo.com (admin_crm_mig) on crm-mig.nakivo.site
 *
 * Steps to reproduce #1:
 *   1. Read the server version and edition.
 *
 * Steps to reproduce #2:
 *   2. Read the installed modules and check for any enterprise (*_enterprise) module,
 *      including web_enterprise.
 *      AUTOMATION: automated - reads version_info + ir.module.module via the authenticated
 *      web-client RPC (the CE "Upgrade to Enterprise" banner is unreliable / debranded).
 *
 * Verification - Expected Result on step 2:
 *   _ Version reads Odoo 12.0 and Community edition
 *   _ No enterprise (*_enterprise) module is installed
 *   _ web_enterprise is not installed
 * ---------------------------------------------------------------------------
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1:   'Pre-condition 1: Login: anh.ho@nakivo.com (admin_crm_mig) on crm-mig.nakivo.site',
  s1:     'Step 1: Read the server version and edition.',
  s2:     'Step 2: Read the installed modules and check for any enterprise (*_enterprise) module, including web_enterprise.',
  verify: 'Verification',
} as const;

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

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      v = await platform.getServerVersionInfo();
      is12 = String(v.server_version).startsWith('12.0');
      isCommunity = !String(v.server_version).includes('+e') && v.server_version_info[5] !== 'e';
      console.log(`  server_version      : ${v.server_version}`);
      console.log(`  server_version_info : ${JSON.stringify(v.server_version_info)}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      mods = await platform.getModules();
      enterpriseInstalled = mods.filter(m => m.state === 'installed' && /enterprise/i.test(m.name)).map(m => m.name);
      webEnt = mods.find(m => m.name === 'web_enterprise');
      webEntInstalled = !!webEnt && webEnt.state === 'installed';
      console.log(`  installed modules      : ${mods.filter(m => m.state === 'installed').length}`);
      console.log(`  enterprise installed   : [${enterpriseInstalled.join(', ')}]`);
      console.log(`  web_enterprise state   : ${webEnt ? webEnt.state : 'absent'}`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
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
