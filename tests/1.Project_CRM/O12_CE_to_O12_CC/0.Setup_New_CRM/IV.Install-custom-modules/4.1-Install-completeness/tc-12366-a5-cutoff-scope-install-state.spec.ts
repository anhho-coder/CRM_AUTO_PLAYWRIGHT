import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12366 section 4.1 - Install completeness
 * Test Case ID: CRM-12366_4.1.5
 * Jira: CRM-12366
 * Test Repository: CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.1-Install-completeness
 * Target: crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type: new
 * Automation-Date: 2026-09-15
 *
 * Summary:
 *   Verify the install state of the 21 modules in the CRM-12126 cut-off scope boundary:
 *   6 modules must be installed (nakivo_sale, nakivo_assets, nakivo_transfer_exhibition,
 *   jira_connector, ib_subscription_notification, utm_constructor), and 15 modules must
 *   remain uninstalled per the migration agreement.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4.1.5:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN connection required to reach crm-mig.nakivo.site
 *     - Host crm-mig.nakivo.site is reachable and responding normally
 *     - User anh.ho@nakivo.com logged in with admin_crm_mig credentials
 *     - Apps menu is accessible
 *     - Scope list identified: 6 must-install = nakivo_sale, nakivo_assets, nakivo_transfer_exhibition, jira_connector, ib_subscription_notification, utm_constructor; 15 must-stay-uninstalled include helpdesk and support families
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to the Apps menu and remove the default filter.
 *     3. Search for and verify each of the 6 modules that must be installed: nakivo_sale, nakivo_assets, nakivo_transfer_exhibition, jira_connector, ib_subscription_notification, utm_constructor. Record state for each.
 *     4. Search for and verify each of the 15 modules that must remain uninstalled. Record state for each.
 *     5. Compare observed states against the boundary agreement (6 installed, 15 uninstalled).
 *
 *   Expected Results:
 *     - All 6 in-scope modules show state = "Installed": nakivo_sale, nakivo_assets, nakivo_transfer_exhibition, jira_connector, ib_subscription_notification, utm_constructor
 *     - All 15 out-of-scope modules show state = "Uninstalled" (or similar non-Installed state)
 *     - At least 21 modules from the cut-off scope are examined and their states recorded, confirming the boundary check ran
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

const MUST_INSTALL = [
  'nakivo_sale',
  'nakivo_assets',
  'nakivo_transfer_exhibition',
  'jira_connector',
  'ib_subscription_notification',
  'utm_constructor',
];

/**
 * The 15 in-scope modules left out = the agreed 21 minus the 6 installed.
 * AUTHORITATIVE SOURCE: CRM-12125 comment 683452 (the 21 + the declaration map), re-confirmed
 * "Done, 21 of 21" in comment 685775. Do NOT re-derive this list and do not guess technical names -
 * a generated list that looks plausible is how three sibling specs went false-green.
 * 7 of the 21 carry no nakivo_ prefix, so a name-prefix scan misses them.
 *
 * The rebuild PRUNED these rows, so most now have no ir.module.module row at all. "NOT FOUND" is
 * therefore a CORRECT result: the check is "count of these in state installed is 0", which is
 * satisfied by absent as well as by uninstalled.
 */
const MUST_STAY_UNINSTALLED = [
  'nakivo_helpdesk',
  'nakivo_support_tickets',
  'nakivo_support_page',
  'nakivo_helpdesk_followup',
  'nakivo_helpdesk_mail_route',
  'nakivo_email_rating',
  'nakivo_feature_request',
  'nakivo_leaves',
  'nakivo_message_approval',
  'helpdesk_timer',
  'helpdesk_ticket_crm_lead',
  'zoho_connector',
  'nakivo_website_crm_score',
  'nakivo_sign',
  'marketing_automation_file_template',
];

const STEP = {
  pre: 'Pre-condition: log in to the Migration server',
  s1: 'Step 1: [INTERNAL check, Call API] Retrieve all modules and check must-install modules',
  s2: 'Step 2: [INTERNAL check, Call API] Verify must-stay-uninstalled modules',
  verify: 'Verification: cut-off scope boundary compliance',
} as const;

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366_4.1 - Install completeness', () => {
  test('CRM-12366_4.1.5: verify cut-off scope boundary install states', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPage = new MigPlatformPage(page);

    console.log('\n========== CRM-12366_4.1.5 ==========');

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    let allModules: Array<{ name: string; state: string }> = [];
    let mustInstallResults: Array<{ name: string; state: string; ok: boolean }> = [];
    let mustStayUninstalledResults: Array<{ name: string; state: string; ok: boolean }> = [];

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      allModules = await migPage.getModules();
      console.log(`  Total modules on instance: ${allModules.length}`);

      const moduleMap = new Map(allModules.map((m) => [m.name, m.state]));

      console.log(`\n  Checking 6 must-install modules:`);
      for (const mod of MUST_INSTALL) {
        const state = moduleMap.get(mod) || 'NOT FOUND';
        const ok = state === 'installed';
        mustInstallResults.push({ name: mod, state, ok });
        console.log(`    - ${mod}: ${state} ${ok ? 'OK' : 'FAIL'}`);
      }
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const moduleMap = new Map(allModules.map((m) => [m.name, m.state]));

      console.log(`  Checking 15 must-stay-uninstalled modules:`);
      for (const mod of MUST_STAY_UNINSTALLED) {
        const state = moduleMap.get(mod) || 'NOT FOUND';
        const ok = state !== 'installed';
        mustStayUninstalledResults.push({ name: mod, state, ok });
        console.log(`    - ${mod}: ${state} ${ok ? 'OK' : 'FAIL'}`);
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const mustInstallFailed = mustInstallResults.filter((r) => !r.ok);
      const mustStayUninstalledFailed = mustStayUninstalledResults.filter((r) => !r.ok);
      const totalFailed = mustInstallFailed.length + mustStayUninstalledFailed.length;

      console.log('\n==================== VERIFY ====================');
      console.log(`  Verify #1 - 6 modules must be installed:`);
      console.log(`    Expected : 6 installed`);
      console.log(`    Actual   : ${mustInstallResults.filter((r) => r.ok).length} installed`);
      console.log(`    Result   : ${mustInstallFailed.length === 0 ? 'PASS' : 'FAIL'}`);
      if (mustInstallFailed.length > 0) {
        console.log(`    Failed:`);
        for (const r of mustInstallFailed) {
          console.log(`      - ${r.name}: ${r.state}`);
        }
      }

      console.log(`\n  Verify #2 - 15 modules must remain uninstalled:`);
      console.log(`    Expected : 15 uninstalled`);
      console.log(`    Actual   : ${mustStayUninstalledResults.filter((r) => r.ok).length} uninstalled`);
      console.log(`    Result   : ${mustStayUninstalledFailed.length === 0 ? 'PASS' : 'FAIL'}`);
      if (mustStayUninstalledFailed.length > 0) {
        console.log(`    Failed:`);
        for (const r of mustStayUninstalledFailed) {
          console.log(`      - ${r.name}: ${r.state}`);
        }
      }

      console.log(`\n  Verify #3 - Scope boundary examined:`);
      console.log(`    Expected : 21 modules checked`);
      console.log(`    Actual   : ${mustInstallResults.length + mustStayUninstalledResults.length} modules checked`);
      console.log(`    Result   : PASS`);

      console.log(`\n  OVERALL: ${totalFailed === 0 ? 'PASS' : 'FAIL'} - cut-off scope boundary verified`);
      console.log('===============================================');

      expect(
        mustInstallResults.filter((r) => r.ok).length,
        `Only ${mustInstallResults.filter((r) => r.ok).length} of 6 must-install modules are installed`,
      ).toBe(6);
      expect(
        mustStayUninstalledResults.filter((r) => r.ok).length,
        `Only ${mustStayUninstalledResults.filter((r) => r.ok).length} of 15 must-stay-uninstalled modules are actually uninstalled`,
      ).toBe(15);
    });
  });
});
