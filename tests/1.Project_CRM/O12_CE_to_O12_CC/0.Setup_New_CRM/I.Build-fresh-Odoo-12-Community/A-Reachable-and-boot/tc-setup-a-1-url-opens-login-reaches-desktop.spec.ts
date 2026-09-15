import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 * CRM-12325 Part 2-A.1 - URL opens and login reaches the Odoo desktop
 * ===========================================================================
 * Test Case ID    : CRM-12325_1.1.1
 * Jira            : CRM-12336
 * Test Repository : /CRM test/Migration - Setup New CRM/CRM-12325_Build fresh Odoo 12 Community/A. Reachable & boot
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE)
 * Automation-Type : new
 * Automation-Date : 2026-08-19
 * Automation-Updated: 2026-09-15 (steps re-synced with the Jira manual TC)
 *
 * Summary:
 *   Verifies the Migration server is reachable and boots - the base URL responds over HTTPS with
 *   no 502/504, and logging in as the Admin reaches the Odoo desktop (/web).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_1\.1\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 * Source manual TC - Jira CRM-12336, Xray Manual Steps (verbatim, in order)
 * ---------------------------------------------------------------------------
 * Pre-conditions:
 *   _ Login: anh.ho@nakivo.com (admin_crm_mig) on crm-mig.nakivo.site
 *     (the login itself is step 2 of this TC, so it is not run as a separate pre-condition step)
 *
 * Steps to reproduce #1:
 *   1. Open the base URL over HTTPS and confirm the server responds with no 502/504.
 *
 * Steps to reproduce #2:
 *   2. Log in as anh.ho@nakivo.com and confirm it reaches the Odoo desktop (/web).
 *      AUTOMATION: automated (Playwright, @pages/mig LoginPageMig).
 *
 * Verification - Expected Result on step 2:
 *   _ The base URL is HTTPS
 *   _ The base URL responds with no 5xx (no 502/504)
 *   _ After login the URL is the Migration server backend (crm-mig.nakivo.site, /web)
 * ---------------------------------------------------------------------------
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s1:     'Step 1: Open the base URL over HTTPS and confirm the server responds with no 502/504.',
  s2:     'Step 2: Log in as anh.ho@nakivo.com and confirm it reaches the Odoo desktop (/web).',
  verify: 'Verification',
} as const;

test.describe('CRM-12325 Part 2-A.1 - URL opens and login reaches the desktop', () => {

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

  test('CRM-12325_1.1.1: [Part2-A] URL opens (HTTPS, no 502/504) and login reaches the Odoo desktop', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);

    let isHttps: boolean;
    let statusCode: number;
    let finalUrl: string;

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      isHttps = baseUrl_mig.startsWith('https://');
      const resp = await page.request.get(baseUrl_mig);
      statusCode = resp.status();
      console.log(`  URL         : ${baseUrl_mig}`);
      console.log(`  HTTPS       : ${isHttps}`);
      console.log(`  HTTP status : ${statusCode}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      finalUrl = page.url();
      console.log(`  Account     : ${users.admin_crm_mig.username}`);
      console.log(`  Actual URL  : ${finalUrl}`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('\n==================== VERIFY ====================');
      console.log('Verify #1 - The base URL is HTTPS:');
      console.log(`   Expected : true`);
      console.log(`   Actual   : ${isHttps}`);
      console.log(`   Result   : ${isHttps ? 'PASS' : 'FAIL'}`);

      console.log('Verify #2 - The base URL responds with no 5xx (no 502/504):');
      console.log(`   Expected : status < 500`);
      console.log(`   Actual   : status = ${statusCode}`);
      console.log(`   Result   : ${statusCode < 500 ? 'PASS' : 'FAIL'}`);

      const onDesktop = finalUrl.includes('crm-mig.nakivo.site') && finalUrl.includes('/web');
      console.log('Verify #3 - After login the URL is the Migration server backend (crm-mig.nakivo.site, /web):');
      console.log(`   Expected : contains crm-mig.nakivo.site AND /web`);
      console.log(`   Actual   : ${finalUrl}`);
      console.log(`   Result   : ${onDesktop ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${isHttps && statusCode < 500 && onDesktop ? 'PASS' : 'FAIL'} - URL opens on HTTPS with no 5xx and login reaches Odoo desktop`);

      expect(isHttps, 'base URL should be served over HTTPS').toBeTruthy();
      expect(statusCode, `base URL should respond with no 5xx (no 502/504), got ${statusCode}`).toBeLessThan(500);
      expect(finalUrl, 'login should reach the Migration server').toContain('crm-mig.nakivo.site');
      expect(finalUrl, 'login should reach the Odoo backend (/web)').toContain('/web');
    });
  });
});
