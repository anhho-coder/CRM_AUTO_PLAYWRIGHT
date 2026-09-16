import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.3.2 ==========
 * Test Case ID    : CRM-12366_4.3.2
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.3-Install-hygiene
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify browser assets regenerate and console errors are not present on any major app screen.
 *   Navigate through major app screens (Contacts, Sales, Leads, Opportunities, Invoices, CRM Reports)
 *   and verify browser console shows no JavaScript errors, 404s, net::ERR_* codes, or Server Errors.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\.3\.2:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN connected and crm-mig.nakivo.site reachable
 *     - Login as anh.ho@nakivo.com (admin_crm_mig)
 *     - Open browser Developer Console (F12) before accessing each screen
 *     - Test against the module set deployed on 2026-08-24 (after memcached installation on 2026-08-25)
 *     - Note: Pre-deploy reading from 2026-08-20 found 4 of 24 apps with console errors; re-test now to confirm fixes
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Open browser Developer Console and set filter to 'Errors' and 'Warnings' only.
 *     3. Navigate to each major app screen: Contacts, Sales Report, Leads, Opportunities, Invoices, CRM Reports.
 *     4. For each screen, reload the page (Ctrl+R) and observe browser console for 10 seconds.
 *     5. Document any error messages including: errno messages, 404s, net::ERR_* codes, or Server Errors.
 *     6. For Sales Report specifically, verify it renders successfully or confirm if errno 111 connection error persists.
 *     7. Check if any 404s exist for web_export_list_xls or web_dynamic_list description icons.
 *     8. Check if net::ERR_INVALID_URL appears for Maps loader (compare behavior to Production).
 *
 *   Expected Results:
 *     - No JavaScript errors, no net::ERR_* codes, no 404s, and no Server Error messages in browser console on any screen
 *     - Sales Report screen renders successfully without errno 111 (connection refused) error
 *     - No 404s for web_export_list_xls or web_dynamic_list description icons
 *     - Contacts list and Reports screens do not log net::ERR_INVALID_URL
 *     - Each app screen loads within 3-5 seconds (baseline from pre-deploy was 1-3s; measure actual time)
 *     - At least 5 different app screens were tested and their console was checked, proving the verification actually ran
 */

interface ConsoleError {
  app: string;
  type: string;
  message: string;
  url?: string;
}

interface ConsoleReport {
  screensChecked: number;
  errors: ConsoleError[];
  loadTimes: Map<string, number>;
}

const STEP = {
  pre1: 'Pre-condition 1: Login as Admin on the Migration server',
  s1:   'Step 1: Navigate to major app screens and monitor console',
  s2:   'Step 2: Check console for errors, warnings, and 404s',
  verify: 'Verification',
} as const;

test.describe('CRM-12366 4.3.2 - No console errors on major app screens', () => {
  test('CRM-12366_4.3.2: Verify browser assets regenerate and console errors are not present on any major app screen', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const platformPage = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.3.2 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  OK - logged in');
    });

    const report: ConsoleReport = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      const errors: ConsoleError[] = [];
      const loadTimes = new Map<string, number>();
      const screensToCheck = [
        { name: 'Contacts', hash: MigPlatformPage.HASH.contacts },
        { name: 'Leads', hash: MigPlatformPage.HASH.leads },
        { name: 'Opportunities', hash: MigPlatformPage.HASH.opportunitiesList },
        { name: 'Sales', hash: MigPlatformPage.HASH.sales },
        { name: 'Invoicing', hash: MigPlatformPage.HASH.invoicing },
        { name: 'Sales Report', hash: MigPlatformPage.HASH.salesReport },
      ];

      // ONE console listener for the whole walk, registered before any navigation.
      // page.once() would capture only the FIRST message per screen and would leak a new listener
      // per iteration - it under-reports console errors, which reads as a clean screen.
      // currentScreen is what attributes a message to the screen that produced it.
      let currentScreen = '(before navigation)';
      page.on('console', (msg) => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
          errors.push({
            app: currentScreen,
            type,
            message: msg.text(),
            url: msg.location().url || undefined,
          });
        }
      });

      for (const screen of screensToCheck) {
        currentScreen = screen.name;

        // Odoo keeps a longpolling request open, so waitUntil:'networkidle' NEVER settles - it
        // burns the whole page-load budget on every screen. openAppAndMeasureMs navigates and
        // waits for the ACTION to finish rendering, which is the real readiness signal, and
        // returns the elapsed ms this block already wants.
        const loadTime = await platformPage.openAppAndMeasureMs(screen.hash);
        loadTimes.set(screen.name, loadTime);

        // let any late console output land before moving to the next screen
        await page.waitForTimeout(CommonUtils.waitTimes.long);

        const screenErrorCount = errors.filter((e) => e.app === screen.name).length;
        console.log(`  Screen "${screen.name}" : ${screenErrorCount} errors (load: ${loadTime}ms)`);
      }

      return {
        screensChecked: screensToCheck.length,
        errors,
        loadTimes,
      };
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);

      const errorsByType = new Map<string, ConsoleError[]>();
      for (const err of report.errors) {
        if (!errorsByType.has(err.type)) errorsByType.set(err.type, []);
        errorsByType.get(err.type)!.push(err);
      }

      console.log(`  Total errors collected : ${report.errors.length}`);
      if (errorsByType.size > 0) {
        console.log('\n  Errors by type:');
        for (const [type, errs] of errorsByType) {
          console.log(`    ${type}: ${errs.length} errors`);
        }
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      // The TC asks for console ERRORS - "no JavaScript errors, no net::ERR_* codes, no 404s,
      // no Server Error messages". A console WARNING is not one of those, so warnings are
      // REPORTED but do not fail this TC. They are still printed in full: the Google Maps
      // "NoApiKeys" warning is a real open item on board row C2 (Dev says Production shows the
      // same, which is a claim that still has to be checked on Production) - it is just not an
      // install defect of the custom-module set, which is what CRM-12126 is accepted on.
      const hardErrors = report.errors.filter((e) => e.type === 'error');
      const warnings = report.errors.filter((e) => e.type !== 'error');

      console.log(`\n==================== VERIFY ====================`);
      console.log(`Verify #1 - the app walk actually ran:`);
      console.log(`  Expected : >= 5 screens opened`);
      console.log(`  Actual   : ${report.screensChecked} screens opened`);
      console.log(`  Result   : ${report.screensChecked >= 5 ? 'PASS' : 'FAIL'}`);
      console.log();
      console.log(`Verify #2 - no console ERROR on any major app screen:`);
      console.log(`  Expected : 0 errors`);
      console.log(`  Actual   : ${hardErrors.length} errors`);
      console.log(`  Result   : ${hardErrors.length === 0 ? 'PASS' : 'FAIL'}`);
      if (hardErrors.length > 0) {
        console.log('\n  Errors:');
        for (const err of hardErrors) {
          console.log(`    [${err.app}] ${err.message.slice(0, 140)}`);
          if (err.url) console.log(`      URL: ${err.url}`);
        }
      }

      console.log(`\n  Warnings (reported, not scored): ${warnings.length}`);
      for (const w of warnings) {
        console.log(`    [${w.app}] ${w.message.slice(0, 140)}`);
        if (w.url) console.log(`      URL: ${w.url}`);
      }

      console.log(`\n  Load times (ms) - board row C2 recorded 13.8s for Reports before memcached:`);
      for (const [screen, time] of [...report.loadTimes.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${screen.padEnd(20)} : ${time}ms`);
      }
      console.log(`===============================================`);
      console.log(
        `OVERALL: ${report.screensChecked >= 5 && hardErrors.length === 0 ? 'PASS' : 'FAIL'}` +
        ` - ${hardErrors.length} console errors, ${warnings.length} warnings over ${report.screensChecked} screens`,
      );

      expect(report.screensChecked, 'at least 5 screens should have been checked').toBeGreaterThanOrEqual(5);
      expect(
        hardErrors.length,
        `${hardErrors.length} console errors found on app screens: ` +
        hardErrors.map((e) => `[${e.app}] ${e.message.slice(0, 80)}`).join(' | '),
      ).toBe(0);
    });
  });
});
