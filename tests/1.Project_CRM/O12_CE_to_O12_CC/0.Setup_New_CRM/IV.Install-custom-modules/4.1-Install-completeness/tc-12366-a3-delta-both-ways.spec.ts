import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12366 section 4.1 - Install completeness
 * Test Case ID: CRM-12366_4.1.3
 * Jira: CRM-12366
 * Test Repository: CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.1-Install-completeness
 * Target: crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type: new
 * Automation-Date: 2026-09-15
 *
 * Summary:
 *   Report the delta (difference) between the mandatory module list and currently installed
 *   modules in both directions: (1) mandatory modules not installed, and (2) installed modules
 *   not on the mandatory list. Both deltas are explicitly reported so the completion of the
 *   comparison is visible.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4.1.3:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN connection required to reach crm-mig.nakivo.site
 *     - Host crm-mig.nakivo.site is reachable and responding normally
 *     - User anh.ho@nakivo.com logged in with admin_crm_mig credentials
 *     - File CRM-12126_mandatory_modules_revised.txt is available for reference
 *     - Apps menu is accessible
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to the Apps menu and remove the default filter to expose all modules.
 *     3. Create a list of all modules with state = "Installed".
 *     4. Create a reference list from CRM-12126_mandatory_modules_revised.txt (the 73 mandatory modules).
 *     5. Perform set difference: identify mandatory modules NOT in the installed list.
 *     6. Perform set difference: identify installed modules NOT in the mandatory list.
 *     7. Report both deltas with module names and current states.
 *
 *   Expected Results:
 *     - Delta 1 (Mandatory not installed): a list of modules in CRM-12126_mandatory_modules_revised.txt that do not show state = "Installed" (may be empty if all installed)
 *     - Delta 2 (Installed not mandatory): a list of modules with state = "Installed" that do not appear in CRM-12126_mandatory_modules_revised.txt (may be empty)
 *     - Both deltas are explicitly reported so the delta check's completion is visible
 *     - At least 73 mandatory modules are cross-referenced, confirming the full comparison ran
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
  s1: 'Step 1: [INTERNAL check, Call API] Retrieve all modules and separate installed modules',
  s2: 'Step 2: [INTERNAL check, Call API] Calculate delta 1 - mandatory modules not installed',
  s3: 'Step 3: [INTERNAL check, Call API] Calculate delta 2 - installed modules not mandatory',
  verify: 'Verification: report both deltas',
} as const;

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366_4.1 - Install completeness', () => {
  test('CRM-12366_4.1.3: report delta between mandatory and installed modules', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPage = new MigPlatformPage(page);

    console.log('\n========== CRM-12366_4.1.3 ==========');

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    let installedModuleNames: string[] = [];
    let allModules: Array<{ name: string; state: string }> = [];

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      allModules = await migPage.getModules();
      console.log(`  Total modules on instance: ${allModules.length}`);

      installedModuleNames = allModules.filter((m) => m.state === 'installed').map((m) => m.name);
      console.log(`  Installed modules: ${installedModuleNames.length}`);
    });

    let delta1: string[] = [];

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const installedSet = new Set(installedModuleNames);

      delta1 = MANDATORY_MODULES.filter((m) => !installedSet.has(m));

      console.log(`  Mandatory modules checked: ${MANDATORY_MODULES.length}`);
      console.log(`  Delta 1 (mandatory not installed): ${delta1.length}`);
      if (delta1.length > 0) {
        console.log('\n  List of mandatory modules not installed:');
        for (const m of delta1) {
          const mod = allModules.find((x) => x.name === m);
          const state = mod ? mod.state : 'NOT FOUND';
          console.log(`    - ${m} (state: ${state})`);
        }
      }
    });

    let delta2: string[] = [];

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const mandatorySet = new Set(MANDATORY_MODULES);

      delta2 = installedModuleNames.filter((m) => !mandatorySet.has(m));

      console.log(`  Installed modules checked: ${installedModuleNames.length}`);
      console.log(`  Delta 2 (installed not mandatory): ${delta2.length}`);
      if (delta2.length > 0) {
        console.log('\n  List of installed modules not on mandatory list (sample - first 10):');
        const sample = delta2.slice(0, 10);
        for (const m of sample) {
          console.log(`    - ${m}`);
        }
        if (delta2.length > 10) {
          console.log(`    ... and ${delta2.length - 10} more`);
        }
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('\n==================== VERIFY ====================');
      console.log(`  Delta 1 - Mandatory modules not installed: ${delta1.length}`);
      console.log(`    Result: ${delta1.length === 0 ? 'PASS - all mandatory modules installed' : `FAIL - ${delta1.length} missing`}`);
      console.log(`\n  Delta 2 - Installed modules not mandatory: ${delta2.length}`);
      console.log(`    Result: PASS - list reported (may be non-empty per design)`);
      console.log('\n  Cross-reference count:');
      console.log(`    Mandatory modules in reference: ${MANDATORY_MODULES.length}`);
      console.log(`    Installed modules on instance: ${installedModuleNames.length}`);
      console.log(`    Total modules on instance: ${allModules.length}`);
      console.log(`\n  OVERALL: ${delta1.length === 0 ? 'PASS' : 'FAIL'} - deltas reported`);
      console.log('===============================================');

      expect(MANDATORY_MODULES.length, 'Mandatory list should have 73 modules').toBe(73);
      expect(allModules.length, 'No modules were retrieved - the query may have failed').toBeGreaterThan(0);
    });
  });
});
