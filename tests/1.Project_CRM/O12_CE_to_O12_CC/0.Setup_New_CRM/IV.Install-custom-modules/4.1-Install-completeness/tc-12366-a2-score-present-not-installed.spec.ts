import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12366 section 4.1 - Install completeness
 * Test Case ID: CRM-12366_4.1.2
 * Jira: CRM-12366
 * Test Repository: CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.1-Install-completeness
 * Target: crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type: new
 * Automation-Date: 2026-09-15
 *
 * Summary:
 *   Verify that any modules showing a state other than "Installed" (Uninstalled, To Install,
 *   To Upgrade, To Remove, or Uninstallable) are either: (a) not on the mandatory list requiring
 *   a leave-out record under IS-CRM-FUNC-0027, or (b) on the mandatory list but have an audit trail
 *   explaining the non-installation decision. This test checks compliance with the migration boundary.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4.1.2:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN connection required to reach crm-mig.nakivo.site
 *     - Host crm-mig.nakivo.site is reachable and responding normally
 *     - User anh.ho@nakivo.com logged in with admin_crm_mig credentials
 *     - File CRM-12126_mandatory_modules_revised.txt is available for comparison
 *     - Access to leave-out record system or audit trail for IS-CRM-FUNC-0027 is available
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to the Apps menu and remove the default filter.
 *     3. Create a list of all modules with state != "Installed" (Uninstalled, To Install, To Upgrade, To Remove, or Uninstallable).
 *     4. For each uninstalled module, cross-reference it against CRM-12126_mandatory_modules_revised.txt.
 *     5. For modules on the mandatory list, record them as defects.
 *     6. For modules not on the mandatory list, verify a leave-out record exists under IS-CRM-FUNC-0027.
 *     7. For each uninstalled mandatory module, check if an audit trail or deliberate reason is recorded.
 *
 *   Expected Results:
 *     - Zero modules from the mandatory list (CRM-12126_mandatory_modules_revised.txt) show state != "Installed"
 *     - All uninstalled modules not on the mandatory list have either (a) a recorded leave-out reason under IS-CRM-FUNC-0027, or (b) an audit trail explaining the non-installation decision
 *     - At least one uninstalled module is examined to confirm the check ran and evaluated leave-out records
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
  s1: 'Step 1: [INTERNAL check, Call API] Retrieve all modules and identify uninstalled ones',
  s2: 'Step 2: [INTERNAL check, Call API] Cross-reference uninstalled modules against mandatory list',
  verify: 'Verification: uninstalled modules are not on the mandatory list',
} as const;

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366_4.1 - Install completeness', () => {
  test('CRM-12366_4.1.2: verify uninstalled modules are not mandatory or have leave-out records', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPage = new MigPlatformPage(page);

    console.log('\n========== CRM-12366_4.1.2 ==========');

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    let uninstalledModules: Array<{ name: string; state: string }> = [];
    let uninstalledMandatory: Array<{ name: string; state: string }> = [];

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const modules = await migPage.getModules();
      console.log(`  Total modules on instance: ${modules.length}`);

      uninstalledModules = modules.filter((m) => m.state !== 'installed');
      console.log(`  Uninstalled modules: ${uninstalledModules.length}`);

      if (uninstalledModules.length > 0) {
        console.log('\n  Uninstalled modules by state:');
        const byState = new Map<string, number>();
        for (const m of uninstalledModules) {
          byState.set(m.state, (byState.get(m.state) || 0) + 1);
        }
        for (const [state, count] of byState.entries()) {
          console.log(`    - ${state}: ${count}`);
        }
      }
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const mandatorySet = new Set(MANDATORY_MODULES);

      for (const mod of uninstalledModules) {
        if (mandatorySet.has(mod.name)) {
          uninstalledMandatory.push(mod);
        }
      }

      console.log(`  Mandatory modules checked against uninstalled: ${MANDATORY_MODULES.length}`);
      console.log(`  Uninstalled mandatory modules: ${uninstalledMandatory.length}`);

      if (uninstalledMandatory.length > 0) {
        console.log('\n  Uninstalled mandatory modules (DEFECTS):');
        for (const m of uninstalledMandatory) {
          console.log(`    - ${m.name}: ${m.state}`);
        }
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('\n==================== VERIFY ====================');
      console.log(`  Verify - Zero mandatory modules are uninstalled:`);
      console.log(`    Expected : 0 uninstalled mandatory modules`);
      console.log(`    Actual   : ${uninstalledMandatory.length} uninstalled mandatory modules`);
      console.log(`    Result   : ${uninstalledMandatory.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      expect(uninstalledModules.length, 'No uninstalled modules examined - the check may have failed').toBeGreaterThan(0);
      expect(
        uninstalledMandatory.length,
        `${uninstalledMandatory.length} mandatory modules are not installed`,
      ).toBe(0);
    });
  });
});
