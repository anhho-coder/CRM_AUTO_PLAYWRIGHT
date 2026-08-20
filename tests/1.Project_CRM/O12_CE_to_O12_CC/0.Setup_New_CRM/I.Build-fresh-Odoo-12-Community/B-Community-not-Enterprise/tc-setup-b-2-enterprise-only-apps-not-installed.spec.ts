import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12325 Part 2-B - Enterprise-only apps are not installed (crm-mig.nakivo.site)
 * Test Case ID: CRM-12325_1.2.2
 * Automation-Type: new
 * Automation-Date: 2026-08-19
 *
 * Summary:
 *   Verifies the enterprise-only apps (Studio, Documents, Sign, Helpdesk, Field Service, Marketing
 *   Automation, Approvals, VoIP, IoT) are NOT installed on the Migration server - on Community they are absent
 *   or 'uninstallable', never installed.
 *
 * Source manual TC (mirrors ticket CRM-12325 Part 2-B):
 *
 * Pre-conditions:
 *   Login as Admin (anh.ho) on the O12 Migration server.
 *
 * Steps to reproduce:
 *   1. Read the module registry and look up each enterprise-only app by its technical name.
 *
 * Verification Points:
 *   1. None of the enterprise-only apps is installed (each is absent or 'uninstallable', never 'installed').
 *
 * Ground truth (crm-mig MCP, 2026-08-19): web_studio / helpdesk / marketing_automation / sign / voip
 * are 'uninstallable'; documents / industry_fsm / iot are absent - none is 'installed'.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_1\.2\.2:" --project=chromium
 */
const ENTERPRISE_APPS: Array<[string, string]> = [
  ['Studio',               'web_studio'],
  ['Documents',            'documents'],
  ['Sign',                 'sign'],
  ['Helpdesk',             'helpdesk'],
  ['Field Service',        'industry_fsm'],
  ['Marketing Automation', 'marketing_automation'],
  ['Approvals',            'approvals'],
  ['VoIP',                 'voip'],
  ['IoT',                  'iot'],
];

test.describe('CRM-12325 Part 2-B - Enterprise-only apps are not installed', () => {

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

  test('CRM-12325_1.2.2: [Part2-B] Enterprise-only apps (Studio, Documents, Sign, Helpdesk, Field Service, Marketing Automation, Approvals, VoIP, IoT) are not installed', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    let states: Array<{ label: string; tech: string; state: string; installed: boolean }> = [];

    console.log('========== CRM-12325_1.2.2 - Enterprise-only apps are not installed ==========');

    await test.step('Pre-condition 1: Login as Admin on the O12 Migration server', async () => {
      console.log('\n--- Pre-condition 1: Login as Admin on the O12 Migration server ---');
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step('Step 1: Read the module registry and look up each enterprise-only app', async () => {
      console.log('\n--- Step 1: Look up each enterprise-only app in the module registry ---');
      const mods = await platform.getModules();
      const byName = new Map(mods.map(m => [m.name, m.state]));
      states = ENTERPRISE_APPS.map(([label, tech]) => {
        const state = byName.get(tech) || 'absent';
        return { label, tech, state, installed: state === 'installed' };
      });
      states.forEach(s => console.log(`  ${s.label.padEnd(22)} (${s.tech}): ${s.state}`));
    });

    await test.step('Verification', async () => {
      const installedEnt = states.filter(s => s.installed).map(s => `${s.label} (${s.tech})`);
      console.log('\n==================== VERIFY ====================');
      console.log('Verify #1 - No enterprise-only app is installed:');
      console.log(`  Expected : none installed (each absent or 'uninstallable')`);
      console.log(`  Actual   : installed = [${installedEnt.join(', ')}]`);
      console.log(`  Result   : ${installedEnt.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${installedEnt.length === 0 ? 'PASS' : 'FAIL'} - enterprise-only apps are not installed`);

      expect(installedEnt, `no enterprise-only app should be installed (found installed: ${installedEnt.join(', ')})`).toHaveLength(0);
    });
  });
});
