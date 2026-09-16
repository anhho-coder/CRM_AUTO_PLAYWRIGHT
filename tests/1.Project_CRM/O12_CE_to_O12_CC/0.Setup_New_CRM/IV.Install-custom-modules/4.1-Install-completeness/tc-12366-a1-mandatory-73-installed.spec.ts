import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12366 section 4.1 - Install completeness
 * Test Case ID: CRM-12366_4.1.1
 * Jira: CRM-12366
 * Test Repository: CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.1-Install-completeness
 * Target: crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type: new
 * Automation-Date: 2026-09-15
 *
 * Summary:
 *   Verify that all 73 mandatory modules from CRM-12126_mandatory_modules_revised.txt are
 *   installed (state = "installed") on the crm-mig instance. These modules are required for
 *   the CRM functionality to operate as specified.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4.1.1:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN connection required to reach crm-mig.nakivo.site
 *     - Host crm-mig.nakivo.site is reachable and responding normally
 *     - User anh.ho@nakivo.com logged in with admin_crm_mig credentials
 *     - File CRM-12126_mandatory_modules_revised.txt is available for module name reference
 *     - Apps menu is accessible without permission errors
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to the Apps menu.
 *     3. Remove the default "Apps" filter to view the full module list.
 *     4. For each technical name in CRM-12126_mandatory_modules_revised.txt, search it individually in the Apps list.
 *     5. For each search result, verify the module shows state = "Installed".
 *     6. Record any mandatory module that shows a state other than "Installed".
 *
 *   Expected Results:
 *     - All 73 modules from CRM-12126_mandatory_modules_revised.txt are found in the Apps list
 *     - Each of the 73 mandatory modules displays state = "Installed"
 *     - Zero mandatory modules are found in any other state (Uninstalled, To Install, To Upgrade, To Remove, or Uninstallable)
 *     - At least 73 module rows were examined during the search process, confirming the check actually ran
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

const MANDATORY_MODULES = [
  'activecampaign_connector',
  'approval',
  'approve_quotations',
  'automatic_renewal_quote_generation',
  'bigmarker_connector',
  'contacts_maps',
  'crm_lead_chain',
  'crm_maps',
  'demo_from_contact',
  'email_template_manager',
  'google_gmail_groups',
  'ib_subscription_notification',
  'ip_provider',
  'ip_provider_ipapi',
  'ip_provider_ipstack',
  'ip_provider_myip',
  'ks_dashboard_ninja',
  'lead_ip_country',
  'leads_automation_followup',
  'license_management',
  'nakivo_accounting',
  'nakivo_actually_received',
  'nakivo_assets',
  'nakivo_calculator',
  'nakivo_crm_approval',
  'nakivo_dashboard',
  'nakivo_dashboard_bruce',
  'nakivo_dashboard_sale_pipeline',
  'nakivo_deal_registration',
  'nakivo_environment_tracking_in_leads',
  'nakivo_hot_site',
  'nakivo_hotsite_concept',
  'nakivo_ib_survey',
  'nakivo_kpi_sales',
  'nakivo_last_touch_date',
  'nakivo_lead_deduplicate',
  'nakivo_lead_source',
  'nakivo_lead_stage_history',
  'nakivo_link_tracker',
  'nakivo_link_tracker_report',
  'nakivo_marketing',
  'nakivo_marketing_funnel_automation',
  'nakivo_merging_leads',
  'nakivo_partner_follow',
  'nakivo_partner_level_management',
  'nakivo_partners_followup',
  'nakivo_payments_import',
  'nakivo_portal',
  'nakivo_product',
  'nakivo_re_assignation',
  'nakivo_redirect',
  'nakivo_renewals_and_upsells_forecasting',
  'nakivo_rest_api',
  'nakivo_sale',
  'nakivo_sale_baas',
  'nakivo_sale_discount',
  'nakivo_sale_expected_revenue_calculation',
  'nakivo_sale_reports',
  'nakivo_sales_chart_improvement',
  'nakivo_shop',
  'nakivo_tracking_website_customers',
  'nakivo_transactions',
  'nakivo_transfer_exhibition',
  'nakivo_update_pricelist_item',
  'partner_balance_report',
  'partner_surveys',
  'partners_relegate',
  'portal_and_shop_access',
  'sale_maps',
  'sendinblue_connector',
  'signature_template',
  'utm_constructor',
  'website_security',
];

const STEP = {
  pre: 'Pre-condition: log in to the Migration server',
  s1: 'Step 1: [INTERNAL check, Call API] Retrieve all installed modules via RPC',
  s2: 'Step 2: [INTERNAL check, Call API] Cross-reference mandatory modules against installed list',
  verify: 'Verification: all 73 mandatory modules are installed',
} as const;

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366_4.1 - Install completeness', () => {
  test('CRM-12366_4.1.1: verify all 73 mandatory modules are installed', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPage = new MigPlatformPage(page);

    console.log('\n========== CRM-12366_4.1.1 ==========');

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    let installedModules: string[] = [];
    let notInstalledModules: Array<{ name: string; state: string }> = [];

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const modules = await migPage.getModules();
      console.log(`  Total modules on instance: ${modules.length}`);
      installedModules = modules.filter((m) => m.state === 'installed').map((m) => m.name);
      console.log(`  Installed modules: ${installedModules.length}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const installedSet = new Set(installedModules);

      for (const mod of MANDATORY_MODULES) {
        if (!installedSet.has(mod)) {
          const allModules = await migPage.getModules();
          const found = allModules.find((m) => m.name === mod);
          notInstalledModules.push({
            name: mod,
            state: found ? found.state : 'NOT FOUND',
          });
        }
      }

      console.log(`  Mandatory modules checked: ${MANDATORY_MODULES.length}`);
      console.log(`  Not installed (failures): ${notInstalledModules.length}`);
      if (notInstalledModules.length > 0) {
        console.log('\n  Failed mandatory modules:');
        for (const m of notInstalledModules) {
          console.log(`    - ${m.name}: ${m.state}`);
        }
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('\n==================== VERIFY ====================');
      console.log(`  Verify - All 73 mandatory modules are installed:`);
      console.log(`    Expected : 0 not installed`);
      console.log(`    Actual   : ${notInstalledModules.length} not installed`);
      console.log(`    Result   : ${notInstalledModules.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      expect(installedModules.length, 'No modules were retrieved - the query may have failed').toBeGreaterThan(0);
      expect(
        notInstalledModules.length,
        `${notInstalledModules.length} mandatory modules are not installed`,
      ).toBe(0);
    });
  });
});
