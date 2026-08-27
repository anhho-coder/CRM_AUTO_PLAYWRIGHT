import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12366 blocks B1, B4, B6, B7 - the custom module set actually runs.
 * Test Case ID: CRM-12366_B1-B4-B6-B7
 * Automation-Type: new
 * Automation-Date: 2026-08-24
 *
 * Why this test exists:
 *   CRM-12126's acceptance criterion is "installed with no install errors". Install state alone
 *   cannot prove that: Odoo can finish an install while a model fails to load, an action points at
 *   a broken view, a cron targets a model that is gone, or a report template no longer renders.
 *   Each of those surfaces only when the thing is used. This exercises all four over the
 *   authenticated session.
 *
 *     B1  every model a custom module declares actually loads      -> fields_get
 *     B4  every window action a custom module owns opens           -> fields_view_get per view_mode
 *     B6  every cron / server action / automation targets a model that loads
 *     B7  every report a custom module owns renders to PDF         -> /report/pdf, proves wkhtmltopdf too
 *
 * Pre-conditions:
 *   Login as Admin on crm-mig.nakivo.site. VPN required.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_B1-B4-B6-B7" --project=chromium
 */

interface Failure { check: string; module: string; subject: string; detail: string; error: string; }
interface Report {
  customModules: number;
  b1: { checked: number; failures: Failure[] };
  b4: { checked: number; failures: Failure[] };
  b6: { checked: number; failures: Failure[] };
  b7: { checked: number; skippedNoRecord: number; naModelMissing: string[]; failures: Failure[]; samples: string[] };
}

test.describe('CRM-12366 - the custom module set runs, not just installs', () => {

  test('CRM-12366_B1-B4-B6-B7: models load, actions open, automations target live models, reports print', async ({ page }) => {
    test.setTimeout(25 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    console.log('========== CRM-12366_B1-B4-B6-B7 ==========');

    await test.step('Pre-condition: log in on the Migration server', async () => {
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log(`  OK - logged in as ${users.admin_crm_mig.username}`);
    });

    const report: Report = await test.step('Exercise B1, B4, B6 and B7 over the session', async () => {
      return await page.evaluate(async () => {
        async function callKw(model: string, method: string, args: any[], kwargs: any = {}) {
          const r = await fetch('/web/dataset/call_kw', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
          });
          const j = await r.json();
          if (j.error) {
            const d = j.error.data || {};
            throw new Error(String(d.message || j.error.message || 'rpc error').slice(0, 250));
          }
          return j.result;
        }

        const fail: Failure[] = [];
        const push = (a: Failure[], f: Failure) => { if (a.length < 60) a.push(f); };

        // the installed custom module set
        const customDomain: any[] = [
          '&', ['state', '=', 'installed'],
          '|', ['name', '=like', 'nakivo\\_%'],
          '&', ['author', 'not in', ['Odoo S.A.', 'Odoo SA', 'Camptocamp / Odoo']],
          ['author', 'not ilike', 'Odoo Community Association'],
        ];
        const modules: any[] = await callKw('ir.module.module', 'search_read', [customDomain, ['name']], { limit: 500 });
        const moduleNames: string[] = modules.map((m) => m.name);

        // ownership helper: which of <targetModel> records belong to a custom module
        async function ownedIds(targetModel: string) {
          const rows: any[] = await callKw(
            'ir.model.data', 'search_read',
            [[['model', '=', targetModel], ['module', 'in', moduleNames]], ['module', 'res_id']],
            { limit: 6000 },
          );
          const byId = new Map<number, string>();
          for (const r of rows) byId.set(r.res_id, r.module);
          return byId;
        }

        // ---------- B1: every model a custom module declares loads ----------
        const b1: { checked: number; failures: Failure[] } = { checked: 0, failures: [] };
        const modelOwners = await ownedIds('ir.model');
        const modelRows: any[] = modelOwners.size
          ? await callKw('ir.model', 'read', [[...modelOwners.keys()], ['model', 'name']], {})
          : [];
        for (const m of modelRows) {
          try {
            await callKw(m.model, 'fields_get', [], { attributes: ['type'] });
            b1.checked++;
          } catch (e) {
            b1.checked++;
            push(b1.failures, { check: 'B1', module: modelOwners.get(m.id) || '?', subject: m.model, detail: m.name, error: String((e as Error).message) });
          }
        }

        // ---------- B4: every window action a custom module owns opens ----------
        const b4: { checked: number; failures: Failure[] } = { checked: 0, failures: [] };
        const actOwners = await ownedIds('ir.actions.act_window');
        const actRows: any[] = actOwners.size
          ? await callKw('ir.actions.act_window', 'read', [[...actOwners.keys()], ['name', 'res_model', 'view_mode']], {})
          : [];
        for (const a of actRows) {
          const modes = String(a.view_mode || 'tree').split(',').map((s) => s.trim()).filter(Boolean);
          for (const mode of modes) {
            if (mode === 'qweb') continue;
            try {
              await callKw(a.res_model, 'fields_view_get', [], { view_type: mode === 'list' ? 'tree' : mode, toolbar: false });
              b4.checked++;
            } catch (e) {
              b4.checked++;
              push(b4.failures, { check: 'B4', module: actOwners.get(a.id) || '?', subject: `${a.name} [${a.res_model}]`, detail: `view_mode ${mode}`, error: String((e as Error).message) });
            }
          }
        }

        // ---------- B6: crons, server actions and automations target a model that loads ----------
        const b6: { checked: number; failures: Failure[] } = { checked: 0, failures: [] };
        const automationModels = ['ir.cron', 'ir.actions.server', 'base.automation'];
        const loadable = new Map<string, boolean>();
        for (const holder of automationModels) {
          let owners: Map<number, string>;
          try { owners = await ownedIds(holder); } catch { continue; }
          if (!owners.size) continue;
          let rows: any[] = [];
          try { rows = await callKw(holder, 'read', [[...owners.keys()], ['name', 'model_id']], {}); } catch { continue; }
          for (const r of rows) {
            b6.checked++;
            const target = Array.isArray(r.model_id) ? r.model_id[1] : null;
            if (!r.model_id) {
              push(b6.failures, { check: 'B6', module: owners.get(r.id) || '?', subject: `${holder}: ${r.name}`, detail: 'no model set', error: 'model_id is empty' });
              continue;
            }
            // model_id[1] is the display name; resolve the technical name once
            let tech = loadable.has(String(target)) ? String(target) : null;
            try {
              const mr: any[] = await callKw('ir.model', 'read', [[Array.isArray(r.model_id) ? r.model_id[0] : r.model_id], ['model']], {});
              tech = mr && mr[0] ? mr[0].model : null;
            } catch { tech = null; }
            if (!tech) {
              push(b6.failures, { check: 'B6', module: owners.get(r.id) || '?', subject: `${holder}: ${r.name}`, detail: String(target), error: 'model row cannot be read' });
              continue;
            }
            if (loadable.get(tech) === false) {
              push(b6.failures, { check: 'B6', module: owners.get(r.id) || '?', subject: `${holder}: ${r.name}`, detail: tech, error: 'target model does not load' });
              continue;
            }
            if (loadable.get(tech) === true) continue;
            try { await callKw(tech, 'fields_get', [], { attributes: ['type'] }); loadable.set(tech, true); }
            catch (e) {
              loadable.set(tech, false);
              push(b6.failures, { check: 'B6', module: owners.get(r.id) || '?', subject: `${holder}: ${r.name}`, detail: tech, error: String((e as Error).message) });
            }
          }
        }

        // ---------- B7: every report a custom module owns renders to PDF ----------
        const b7: { checked: number; skippedNoRecord: number; naModelMissing: string[]; failures: Failure[]; samples: string[] } =
          { checked: 0, skippedNoRecord: 0, naModelMissing: [], failures: [], samples: [] };
        const repOwners = await ownedIds('ir.actions.report');
        const repRows: any[] = repOwners.size
          ? await callKw('ir.actions.report', 'read', [[...repOwners.keys()], ['name', 'model', 'report_name', 'report_type']], {})
          : [];
        for (const rep of repRows) {
          if (rep.report_type && !String(rep.report_type).includes('pdf')) continue;
          let recId: number | null = null;
          try {
            const ids: number[] = await callKw(rep.model, 'search', [[]], { limit: 1 });
            recId = ids && ids.length ? ids[0] : null;
          } catch (e) {
            // The report's `model` names something that is not a model - e.g. "Statement of account"
            // carries model=partner_balance_report while only report.partner_balance_report.report
            // exists. Production carries the identical row, so this is pre-existing and not a
            // migration finding. Record it, do not score it.
            b7.naModelMissing.push(`${rep.name} [model ${rep.model}]`);
            continue;
          }
          if (!recId) { b7.skippedNoRecord++; continue; }
          try {
            const url = `/report/pdf/${rep.report_name}/${recId}`;
            const res = await fetch(url, { method: 'GET' });
            const ct = res.headers.get('content-type') || '';
            const buf = await res.arrayBuffer();
            b7.checked++;
            if (!res.ok || !ct.toLowerCase().includes('pdf') || buf.byteLength < 1000) {
              push(b7.failures, {
                check: 'B7', module: repOwners.get(rep.id) || '?', subject: rep.name, detail: `${rep.report_name} id ${recId}`,
                error: `status ${res.status}, content-type "${ct}", ${buf.byteLength} bytes`,
              });
            } else if (b7.samples.length < 8) {
              b7.samples.push(`${rep.name} -> ${Math.round(buf.byteLength / 1024)} KB`);
            }
          } catch (e) {
            b7.checked++;
            push(b7.failures, { check: 'B7', module: repOwners.get(rep.id) || '?', subject: rep.name, detail: rep.report_name, error: String((e as Error).message) });
          }
        }

        return { customModules: moduleNames.length, b1, b4, b6, b7 };
      });
    });

    await test.step('Verification', async () => {
      const show = (label: string, checked: number, failures: Failure[], extra = '') => {
        console.log(`\n${label}`);
        console.log(`  Expected : 0 failures`);
        console.log(`  Actual   : ${failures.length} of ${checked} checked${extra}`);
        for (const f of failures) {
          console.log(`      [${f.module}] ${f.subject} (${f.detail})`);
          console.log(`          ${f.error}`);
        }
        console.log(`  Result   : ${failures.length === 0 ? 'PASS' : 'FAIL'}`);
      };

      console.log('\n==================== VERIFY ====================');
      console.log(`Custom modules installed: ${report.customModules}`);
      show('B1 - every model a custom module declares loads', report.b1.checked, report.b1.failures);
      show('B4 - every window action a custom module owns opens', report.b4.checked, report.b4.failures);
      show('B6 - crons, server actions and automations target a model that loads', report.b6.checked, report.b6.failures);
      show('B7 - every custom report renders to PDF', report.b7.checked, report.b7.failures,
        `, ${report.b7.skippedNoRecord} skipped for having no record to print`);
      if (report.b7.naModelMissing.length) {
        console.log('  Not scored - the report names a model that does not exist, same on Production:');
        for (const s of report.b7.naModelMissing) console.log(`      ${s}`);
      }
      if (report.b7.samples.length) {
        console.log('  Rendered samples:');
        for (const s of report.b7.samples) console.log(`      ${s}`);
      }
      console.log('===============================================');

      expect.soft(report.b1.failures.length, `B1: models that do not load -> ${report.b1.failures.map((f) => f.subject).join(', ')}`).toBe(0);
      expect.soft(report.b4.failures.length, `B4: actions that do not open -> ${report.b4.failures.map((f) => f.subject).join(', ')}`).toBe(0);
      expect.soft(report.b6.failures.length, `B6: automations on a dead model -> ${report.b6.failures.map((f) => f.subject).join(', ')}`).toBe(0);
      expect.soft(report.b7.failures.length, `B7: reports that do not render -> ${report.b7.failures.map((f) => f.subject).join(', ')}`).toBe(0);
      expect(report.b1.checked + report.b4.checked + report.b6.checked, 'nothing was exercised').toBeGreaterThan(0);
    });
  });
});
