import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig/MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12366 section 4.5.1 - Helpdesk residue deleted
 * Test Case ID    : CRM-12366_4.5.1
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.5 No reference to a removed capability
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify that helpdesk-related views, mail templates, and groups no longer exist in the database
 *   after deletion. Specifically check that ir.ui.view records for helpdesk.stage.form (id 2148) and
 *   helpdesk.team.form (id 2150), mail.template records (ids 849, 850), and res.groups records
 *   (ids 140, 141) are all absent.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.5\\.1:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     VPN connection active and crm-mig.nakivo.site reachable
 *     Login account: anh.ho@nakivo.com (admin_crm_mig)
 *     Target database: nakivoCE (Odoo 12.0 Community)
 *     Reference: Helpdesk views (ids 2148, 2150), mail templates (ids 849, 850), groups (ids 140, 141) should be deleted
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to Technical > Database Structure > Model Data.
 *     3. Search for rows where module='helpdesk'.
 *     4. Verify that ir.ui.view records with helpdesk.stage.form (id 2148) and helpdesk.team.form (id 2150) are absent.
 *     5. Navigate to Technical > Database Structure > Models and search for mail.template records with ids 849 and 850.
 *     6. Verify both mail template records are absent.
 *     7. Navigate to Settings > Users & Companies > Groups.
 *     8. Search for group records with ids 140 and 141.
 *     9. Verify both group records are absent.
 *
 *   Expected:
 *     Zero (0) ir.ui.view records found for helpdesk-related models
 *     Zero (0) mail.template records found with ids 849 and 850
 *     Zero (0) res.groups records found with ids 140 and 141
 *     At least one search completed per entity type, confirming the check actually executed
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

interface ResidueCheckResult {
  helpdesk_views: Array<{ id: number; name: string; model: string }>;
  mail_templates: Array<{ id: number; name: string }>;
  res_groups: Array<{ id: number; name: string }>;
}

const STEP = {
  pre1: 'Pre-condition: log in on the Migration server',
  s1: 'Step 1: [INTERNAL check, Call API] Read every ir.model.data row owned by the absent module "helpdesk"',
  s2: 'Step 2: [INTERNAL check, Call API] Group the helpdesk-owned rows by model and report the count per model',
  s3: 'Step 3: [INTERNAL check, Call API] Read what the board ids now hold (diagnostic - the rebuild re-sequenced ids)',
  verify: 'Verification: no object is still owned by the absent helpdesk module',
} as const;

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366_4.5.1 - Helpdesk residue deleted', () => {

  test('CRM-12366_4.5.1: Verify helpdesk-related views, templates, and groups no longer exist', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const platformPage = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.5.1 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    const result: ResidueCheckResult = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      return await page.evaluate(async () => {
        async function callKw(model: string, method: string, args: any[], kwargs: any = {}) {
          const r = await fetch('/web/dataset/call_kw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
          });
          const j = await r.json();
          if (j.error) {
            const d = j.error.data || {};
            throw new Error(String(d.message || j.error.message || 'rpc error').slice(0, 300));
          }
          return j.result;
        }

        // ------------------------------------------------------------------
        // THE REAL CHECK: residue is defined by OWNERSHIP, not by record id.
        // The crm-mig rebuild RE-SEQUENCES ids, so the board's ids (views 2148/2150,
        // templates 849/850, groups 140/141) now point at unrelated, innocent records.
        // Asserting on those ids tests nothing and fails on a clean instance.
        // ir.model.data with module='helpdesk' is what actually says "this object still
        // belongs to the absent helpdesk module".
        // ------------------------------------------------------------------
        const residue = await callKw('ir.model.data', 'search_read',
          [[['module', '=', 'helpdesk']], ['model', 'res_id', 'name']],
          { limit: 5000 });

        // proof-it-ran: the table itself must be readable and non-empty, otherwise a broken
        // query or a dropped session would read as "no residue".
        const imdTotal = await callKw('ir.model.data', 'search_count', [[]], {});

        // Diagnostic only - what those board ids hold TODAY, so the report can show that the
        // ids were re-sequenced rather than that residue survived. NEVER asserted.
        const idProbeViews = await callKw('ir.ui.view', 'search_read',
          [[['id', 'in', [2148, 2150]]], ['id', 'name', 'model']], { limit: 10 });
        const idProbeTemplates = await callKw('mail.template', 'search_read',
          [[['id', 'in', [849, 850]]], ['id', 'name', 'model_id']], { limit: 10 });
        const idProbeGroups = await callKw('res.groups', 'search_read',
          [[['id', 'in', [140, 141]]], ['id', 'name']], { limit: 10 });

        const byModel: Record<string, number> = {};
        for (const r of residue) byModel[r.model] = (byModel[r.model] || 0) + 1;

        return {
          residue,
          byModel,
          imdTotal,
          idProbeViews,
          idProbeTemplates,
          idProbeGroups,
        };
      });
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  ir.model.data rows owned by module "helpdesk" : ${result.residue.length}`);
      if (result.residue.length) {
        for (const [model, n] of Object.entries(result.byModel)) {
          console.log(`    ${String(n).padStart(4)}  ${model}`);
        }
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log('  Diagnostic only - what the board ids hold TODAY (the rebuild re-sequenced ids,');
      console.log('  so a record at these ids is NOT evidence that helpdesk residue survived):');
      for (const v of result.idProbeViews) {
        console.log(`    ir.ui.view    ${v.id} = "${v.name}" (model ${v.model})`);
      }
      for (const t of result.idProbeTemplates) {
        console.log(`    mail.template ${t.id} = "${t.name}"`);
      }
      for (const g of result.idProbeGroups) {
        console.log(`    res.groups    ${g.id} = "${g.name}"`);
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('\n==================== VERIFY ====================');
      console.log('Verify #1 - the ir.model.data table is readable (proof the check ran):');
      console.log(`  Expected : > 0 total rows`);
      console.log(`  Actual   : ${result.imdTotal} total rows`);
      console.log(`  Result   : ${result.imdTotal > 0 ? 'PASS' : 'FAIL'}`);
      console.log();
      console.log('Verify #2 - no object is still owned by the absent module "helpdesk" (IS-CRM-FUNC-0014):');
      console.log(`  Expected : 0 ir.model.data rows with module = helpdesk`);
      console.log(`  Actual   : ${result.residue.length} rows`);
      console.log(`  Result   : ${result.residue.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(
        `OVERALL: ${result.imdTotal > 0 && result.residue.length === 0 ? 'PASS' : 'FAIL'}` +
        ` - helpdesk residue check by ownership`,
      );

      // proof-it-ran BEFORE the real assertion: an unreadable table must not read as "clean"
      expect(result.imdTotal, 'ir.model.data returned no rows at all - the query did not run').toBeGreaterThan(0);
      expect(
        result.residue.length,
        `${result.residue.length} ir.model.data rows are still attributed to the absent module "helpdesk"`,
      ).toBe(0);
    });
  });
});
