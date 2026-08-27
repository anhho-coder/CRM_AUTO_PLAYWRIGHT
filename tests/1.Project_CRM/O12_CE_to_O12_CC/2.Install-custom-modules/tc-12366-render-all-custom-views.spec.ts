import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12366 block B3 - every view owned by a custom module renders.
 * Test Case ID: CRM-12366_B3-RENDER-ALL
 * Automation-Type: new
 * Automation-Date: 2026-08-24
 *
 * Why this test exists:
 *   Installing a module does not prove its views work. A view that references a field which no
 *   longer exists loads fine at install time and fails only when Odoo builds the view - so the
 *   install log stays clean while the screen is broken. That is the gap in CRM-12126's acceptance
 *   criterion "installed with no install errors".
 *
 * Method:
 *   One authenticated session. Over the web-client RPC, resolve every ir.ui.view owned by an
 *   installed custom module, then call fields_view_get on each one. fields_view_get is what the
 *   client calls to render a view: it resolves the inheritance chain and validates every field
 *   against the model, so a missing field raises here exactly as it would on screen.
 *
 * Pre-conditions:
 *   Login as Admin on crm-mig.nakivo.site. VPN required.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_B3-RENDER-ALL" --project=chromium
 */

interface ViewFailure {
  module: string;
  viewId: number;
  viewName: string;
  model: string;
  viewType: string;
  error: string;
}

interface RenderReport {
  customModules: number;
  viewsOwned: number;
  viewsChecked: number;
  skippedQweb: number;
  skippedNoModel: number;
  failures: ViewFailure[];
}

test.describe('CRM-12366 B3 - all custom-module views render', () => {

  test('CRM-12366_B3-RENDER-ALL: every view owned by an installed custom module builds without error', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);

    console.log('========== CRM-12366_B3-RENDER-ALL ==========');

    await test.step('Pre-condition: log in on the Migration server', async () => {
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    const report: RenderReport = await test.step('Resolve every custom-module view and render it', async () => {
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

        // 1. the installed custom-module set: nakivo_* by name, plus anything not authored by Odoo or the OCA
        const customDomain: any[] = [
          '&', ['state', '=', 'installed'],
          '|', ['name', '=like', 'nakivo\\_%'],
          '&', ['author', 'not in', ['Odoo S.A.', 'Odoo SA', 'Camptocamp / Odoo']],
          ['author', 'not ilike', 'Odoo Community Association'],
        ];
        const modules: any[] = await callKw('ir.module.module', 'search_read', [customDomain, ['name']], { limit: 500 });
        const moduleNames: string[] = modules.map((m) => m.name);

        // 2. every ir.ui.view those modules own, via the ownership table
        const imd: any[] = await callKw(
          'ir.model.data', 'search_read',
          [[['model', '=', 'ir.ui.view'], ['module', 'in', moduleNames]], ['module', 'res_id']],
          { limit: 5000 },
        );
        const ownerByViewId = new Map<number, string>();
        for (const row of imd) ownerByViewId.set(row.res_id, row.module);
        const viewIds: number[] = [...ownerByViewId.keys()];

        // 3. read them in one go
        const views: any[] = await callKw(
          'ir.ui.view', 'read',
          [viewIds, ['name', 'model', 'type', 'active']], {},
        );

        const failures: ViewFailure[] = [];
        let checked = 0, skippedQweb = 0, skippedNoModel = 0;

        // 4. render each one the way the client does
        for (const v of views) {
          if (v.type === 'qweb') { skippedQweb++; continue; }        // qweb is a template, not a model view
          if (!v.model) { skippedNoModel++; continue; }
          try {
            await callKw(v.model, 'fields_view_get', [], { view_id: v.id, view_type: v.type, toolbar: false });
            checked++;
          } catch (e) {
            checked++;
            failures.push({
              module: ownerByViewId.get(v.id) || '(unknown)',
              viewId: v.id,
              viewName: v.name,
              model: v.model,
              viewType: v.type,
              error: String((e as Error).message).slice(0, 300),
            });
          }
        }

        return {
          customModules: moduleNames.length,
          viewsOwned: viewIds.length,
          viewsChecked: checked,
          skippedQweb,
          skippedNoModel,
          failures,
        };
      });
    });

    await test.step('Verification', async () => {
      console.log('\n==================== VERIFY ====================');
      console.log(`Custom modules installed        : ${report.customModules}`);
      console.log(`Views owned by those modules    : ${report.viewsOwned}`);
      console.log(`Views rendered (fields_view_get): ${report.viewsChecked}`);
      console.log(`Skipped, qweb templates         : ${report.skippedQweb}`);
      console.log(`Skipped, no model on the view   : ${report.skippedNoModel}`);
      console.log(`\nVerify - every custom view builds without error:`);
      console.log(`  Expected : 0 failures`);
      console.log(`  Actual   : ${report.failures.length} failures`);

      const byModule = new Map<string, number>();
      for (const f of report.failures) byModule.set(f.module, (byModule.get(f.module) || 0) + 1);
      if (byModule.size) {
        console.log('\n  Failures per module:');
        for (const [m, n] of [...byModule.entries()].sort((a, b) => b[1] - a[1])) {
          console.log(`    ${String(n).padStart(3)}  ${m}`);
        }
        console.log('\n  Detail:');
        for (const f of report.failures) {
          console.log(`    [${f.module}] view ${f.viewId} "${f.viewName}" (${f.model}/${f.viewType})`);
          console.log(`        ${f.error}`);
        }
      }
      console.log(`  Result   : ${report.failures.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      expect(report.viewsChecked, 'no views were rendered - the resolve step found nothing').toBeGreaterThan(0);
      expect(
        report.failures.length,
        `${report.failures.length} custom-module views fail to build: ${[...byModule.keys()].join(', ')}`,
      ).toBe(0);
    });
  });
});
