import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.7 - App list and UI parity
 * Test Case ID: CRM-12326_3.7.1
 * Jira: CRM-12590
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2, 3 and 4 split back to one test.step each
 *                (they were collapsed into a single "Step 2-4", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify that no app belonging to a removed Enterprise capability appears in the app list
 *   on the new base. The user must not see an entry point to a capability that is no longer
 *   there after migration from O12 CE to O12 CC.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 112):
 *   CRM-12326_3.7.1 - No app from a removed capability
 *
 * Pre-conditions:
 *   - VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   - Login: anh.ho@nakivo.com (admin_crm_mig)
 *   - Root menu counts at the 2026-08-24 reading: Production 37, Migration server 24
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Read every root ir.ui.menu on the new base.
 *   3. Resolve the owning module of each root menu.
 *   4. Confirm no root menu is owned by one of the 9 Enterprise modules or by any of the 15 left-out modules.
 *
 * Verification Points:
 *   1. 0 root menus are owned by an Enterprise module or by a left-out module.
 *   2. The full root-menu list is reported, so a new app appearing on the base is visible for the parity decision.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * NOTE: "Nakivo API" app is present here and absent on Production - this deviation is tracked on
 * CRM-12366 D3 and is NOT failed here. Do not add an assertion about it.
 *
 * READ-ONLY: this spec only reads the root menus and resolves their module ownership via ir.model.data.
 * It creates, modifies and deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.7\.1:" --project=chromium
 */

/** The 9 Odoo Enterprise modules that are removed on the O12 CC migration (CRM-12125 comment 683452). */
const ENTERPRISE_MODULES = [
  'helpdesk', 'sale_subscription', 'sale_coupon', 'website_sale_coupon', 'website_crm_score',
  'account_asset', 'sign', 'marketing_automation', 'web_studio',
];

/** The 15 in-scope modules that are not installed on the new base (CRM-12125 comment 685775). */
const CUT_MODULES_UNINSTALLED = [
  'nakivo_helpdesk', 'nakivo_support_tickets', 'nakivo_support_page', 'nakivo_helpdesk_followup',
  'nakivo_helpdesk_mail_route', 'nakivo_email_rating', 'nakivo_feature_request', 'nakivo_leaves',
  'nakivo_message_approval', 'helpdesk_timer', 'helpdesk_ticket_crm_lead', 'zoho_connector',
  'nakivo_website_crm_score', 'nakivo_sign', 'marketing_automation_file_template',
];

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: [INTERNAL check, Call API] Read every root ir.ui.menu on the new base',
  s3:      'Step 3: [INTERNAL check, Call API] Resolve the owning module of each root menu',
  s4:      'Step 4: [INTERNAL check, Call API] Confirm no root menu is owned by one of the 9 Enterprise modules or by any of the 15 left-out modules',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.7 - App list and UI parity', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.7.1: [Part2-3.7] No app from a removed capability', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    let rootMenus: Array<{ id: number; name: string; sequence: number }> = [];
    let ownershipMap: Map<number, string> = new Map();
    let removedCapabilityMenus: Array<{ id: number; name: string; module: string }> = [];

    console.log('========== CRM-12326_3.7.1 - No app from a removed capability ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);

      const menus = await platform.callKw<Array<{ id: number; name: string; sequence: number }>>(
        'ir.ui.menu', 'search_read',
        [[['parent_id', '=', false]], ['name', 'sequence']],
        { limit: 200 },
      );
      rootMenus = menus;
      console.log(`  Root menus found: ${rootMenus.length}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      const menuIds = rootMenus.map(m => m.id);
      const modelData = await platform.callKw<Array<{ module: string; res_id: number }>>(
        'ir.model.data', 'search_read',
        [[['model', '=', 'ir.ui.menu'], ['res_id', 'in', menuIds]], ['module', 'res_id']],
        { limit: 200 },
      );

      // Build ownership map: res_id -> module name
      for (const entry of modelData) {
        ownershipMap.set(entry.res_id, entry.module);
      }
      console.log(`  Owning modules resolved: ${ownershipMap.size} menus have module ownership records`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      // Print every root menu: name then owning module
      console.log('  Root menu list:');
      const forbiddenModules = new Set(ENTERPRISE_MODULES.concat(CUT_MODULES_UNINSTALLED));

      for (const menu of rootMenus) {
        const ownerModule = ownershipMap.get(menu.id) || 'built-in';
        console.log(`    [${menu.id}] ${menu.name} <- ${ownerModule}`);

        if (forbiddenModules.has(ownerModule)) {
          removedCapabilityMenus.push({
            id: menu.id,
            name: menu.name,
            module: ownerModule,
          });
        }
      }
      console.log(`\n  Menus owned by removed modules: ${removedCapabilityMenus.length}`);
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - No root menus owned by removed capabilities:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${removedCapabilityMenus.length}`);
      console.log(`     Result   : ${removedCapabilityMenus.length === 0 ? 'PASS' : 'FAIL'}`);
      if (removedCapabilityMenus.length > 0) {
        console.log('     Violating menus:');
        removedCapabilityMenus.forEach(m => {
          console.log(`       - [${m.id}] ${m.name} (owned by ${m.module})`);
        });
      }
      console.log('  Verify #2 - Full root-menu list reported:');
      console.log(`     Expected : reported length > 0`);
      console.log(`     Actual   : ${rootMenus.length}`);
      console.log(`     Result   : ${rootMenus.length > 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${removedCapabilityMenus.length === 0 && rootMenus.length > 0 ? 'PASS' : 'FAIL'} - no removed-capability apps visible`);

      expect(removedCapabilityMenus.length, 'no root menus should be owned by removed modules').toBe(0);
      expect(rootMenus.length, 'root menu list should not be empty').toBeGreaterThan(0);
    });
  });
});
