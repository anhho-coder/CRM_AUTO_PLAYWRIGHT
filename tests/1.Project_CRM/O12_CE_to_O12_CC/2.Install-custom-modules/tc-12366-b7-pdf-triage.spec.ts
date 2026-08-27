import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12366 block B7 triage - why do the 5 custom PDF reports return 500?
 * Test Case ID: CRM-12366_B7-PDF-TRIAGE
 * Automation-Type: new
 * Automation-Date: 2026-08-24
 *
 * Why this test exists:
 *   The B7 pass found 5 custom reports returning HTTP 500 on /report/pdf. That result has two very
 *   different readings and reporting the wrong one blames the wrong team:
 *     (a) wkhtmltopdf is missing or broken on this host  -> ONE environment defect, every PDF fails
 *     (b) the qweb template references something absent   -> a defect per module
 *   The discriminator is /report/html against /report/pdf on the same report. html runs the template
 *   only; pdf runs the template AND hands the result to wkhtmltopdf. So:
 *     html OK  + pdf 500 -> the engine, reading (a)
 *     html 500 + pdf 500 -> the template, reading (b)
 *   A core Odoo report is rendered alongside as the control: if the Sale Order PDF fails too, nothing
 *   about this is custom-module specific.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_B7-PDF-TRIAGE" --project=chromium
 */

interface Probe {
  label: string;
  owner: string;
  reportName: string;
  model: string;
  recId: number | null;
  pdfStatus: number | string;
  pdfBytes: number;
  htmlStatus: number | string;
  htmlBytes: number;
  errorText: string;
}

test.describe('CRM-12366 B7 triage - template or engine', () => {

  test('CRM-12366_B7-PDF-TRIAGE: separate a broken PDF engine from a broken report template', async ({ page }) => {
    test.setTimeout(12 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    console.log('========== CRM-12366_B7-PDF-TRIAGE ==========');

    await test.step('Pre-condition: log in on the Migration server', async () => {
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log(`  OK - logged in as ${users.admin_crm_mig.username}`);
    });

    const probes: Probe[] = await test.step('Probe each report as html and as pdf', async () => {
      return await page.evaluate(async () => {
        async function callKw(model: string, method: string, args: any[], kwargs: any = {}) {
          const r = await fetch('/web/dataset/call_kw', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
          });
          const j = await r.json();
          if (j.error) {
            const d = j.error.data || {};
            throw new Error(String(d.message || j.error.message || 'rpc error').slice(0, 400));
          }
          return j.result;
        }

        // The 5 failing custom reports, plus core controls.
        const targets = [
          { label: 'custom  License Certificate', owner: 'license_management', reportName: 'license_management.report_license_certificate', model: 'license.management' },
          { label: 'custom  License', owner: 'license_management', reportName: 'license_management.report_license', model: 'license.management' },
          { label: 'custom  Partner level Certificate', owner: 'nakivo_partner_level_management', reportName: 'nakivo_partner_level_management.partner_level_certificate', model: 'res.partner' },
          { label: 'custom  Partner MSP Certificate', owner: 'nakivo_partner_level_management', reportName: 'nakivo_partner_level_management.partner_msp_certificate', model: 'res.partner' },
          { label: 'CONTROL Sale Order (core)', owner: 'sale', reportName: 'sale.report_saleorder', model: 'sale.order' },
          { label: 'CONTROL Invoice (core)', owner: 'account', reportName: 'account.report_invoice', model: 'account.invoice' },
        ];

        // resolve the real model behind each report from ir.actions.report, so a wrong guess above
        // does not become the finding
        const repRows: any[] = await callKw(
          'ir.actions.report', 'search_read',
          [[['report_name', 'in', targets.map((t) => t.reportName)]], ['report_name', 'model', 'name']],
          { limit: 50 },
        );
        const modelByName = new Map<string, string>();
        for (const r of repRows) modelByName.set(r.report_name, r.model);

        const out: Probe[] = [];
        for (const t of targets) {
          const model = modelByName.get(t.reportName) || t.model;
          let recId: number | null = null;
          try {
            const ids: number[] = await callKw(model, 'search', [[]], { limit: 1 });
            recId = ids && ids.length ? ids[0] : null;
          } catch { recId = null; }

          const probe: Probe = {
            label: t.label, owner: t.owner, reportName: t.reportName, model, recId,
            pdfStatus: 'not run', pdfBytes: 0, htmlStatus: 'not run', htmlBytes: 0, errorText: '',
          };

          if (recId) {
            for (const kind of ['html', 'pdf'] as const) {
              try {
                const res = await fetch(`/report/${kind}/${t.reportName}/${recId}`);
                const body = await res.text();
                if (kind === 'pdf') { probe.pdfStatus = res.status; probe.pdfBytes = body.length; }
                else { probe.htmlStatus = res.status; probe.htmlBytes = body.length; }
                if (!res.ok && !probe.errorText) {
                  // pull the useful line out of Odoo's 500 page
                  const plain = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                  const m = plain.match(/(QWebException|ValueError|AttributeError|KeyError|MissingError|AccessError|Error)[^]{0,320}/);
                  probe.errorText = `[${kind}] ${(m ? m[0] : plain).slice(0, 340)}`;
                }
              } catch (e) {
                if (kind === 'pdf') probe.pdfStatus = 'threw'; else probe.htmlStatus = 'threw';
                if (!probe.errorText) probe.errorText = `[${kind}] ${String((e as Error).message).slice(0, 200)}`;
              }
            }
          }
          out.push(probe);
        }

        // the sixth failure was a report whose model cannot be searched - name it precisely
        try {
          const orphan: any[] = await callKw(
            'ir.actions.report', 'search_read',
            [[['report_name', 'ilike', 'partner_balance_report']], ['name', 'model', 'report_name', 'report_type']],
            { limit: 10 },
          );
          const models: string[] = await callKw('ir.model', 'search_read', [[['model', 'ilike', 'partner_balance']], ['model']], { limit: 10 });
          out.push({
            label: 'ORPHAN partner_balance_report', owner: 'partner_balance_report',
            reportName: JSON.stringify(orphan).slice(0, 300), model: JSON.stringify(models).slice(0, 200),
            recId: null, pdfStatus: 'n/a', pdfBytes: 0, htmlStatus: 'n/a', htmlBytes: 0,
            errorText: 'see reportName/model columns - does the target model exist at all',
          });
        } catch (e) { /* nothing to add */ }

        return out;
      });
    });

    await test.step('Verification', async () => {
      console.log('\n==================== VERIFY ====================');
      for (const p of probes) {
        console.log(`\n${p.label}`);
        console.log(`  owner   : ${p.owner}`);
        console.log(`  report  : ${p.reportName}`);
        console.log(`  model   : ${p.model}   record: ${p.recId ?? 'NONE'}`);
        console.log(`  html    : status ${p.htmlStatus}, ${p.htmlBytes} bytes`);
        console.log(`  pdf     : status ${p.pdfStatus}, ${p.pdfBytes} bytes`);
        if (p.errorText) console.log(`  error   : ${p.errorText}`);
      }

      const core = probes.filter((p) => p.label.startsWith('CONTROL'));
      const coreOk = core.filter((p) => p.pdfStatus === 200).length;
      console.log(`\nVerify - is the PDF engine alive on this host:`);
      console.log(`  Expected : core Odoo reports render to PDF (proves wkhtmltopdf works)`);
      console.log(`  Actual   : ${coreOk} of ${core.length} core reports returned 200`);
      console.log(`  Reading  : ${coreOk === core.length
        ? 'engine is fine -> each 500 is that report template, a per-module defect'
        : 'core reports fail too -> the PDF engine on this host, ONE environment defect'}`);
      console.log('===============================================');

      expect(probes.length, 'no probe ran').toBeGreaterThan(0);
    });
  });
});
