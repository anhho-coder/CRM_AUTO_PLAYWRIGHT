import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12326 Part 2 browser pass - the four matrix rows that need a real browser session.
 * Test Case ID: CRM-12326_BROWSER-PASS
 * Automation-Type: new
 * Automation-Date: 2026-08-20
 *
 * Summary:
 *   One login on the O12 Migration server (crm-mig.nakivo.site) covering the rows of the CRM-12326
 *   Part 2 test matrices that cannot be answered over RPC:
 *
 *     C9  - Browser console clean: no failed script/stylesheet request and no JavaScript error while
 *           opening every app in the sidebar.
 *     D5  - No leftover entry point of the Enterprise visual editor (Studio) remains, and no
 *           web_studio asset is loaded.
 *     E10 - No orphaned entry point: no menu whose action targets a model that does not exist on this
 *           base, and no app opens with a server error / traceback.
 *     E11 - No new user-facing screen: record the app list a user actually sees, as evidence.
 *
 * Pre-conditions:
 *   Login as Admin (anh.ho) on the O12 Migration server (crm-mig.nakivo.site). VPN required.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_BROWSER-PASS" --project=chromium
 */

interface AppResult {
  app: string;
  ms: number;
  errorDialog: boolean;
  consoleErrors: string[];
  failedRequests: string[];
}

test.describe('CRM-12326 Part 2 - browser pass (C9, D5, E10, E11)', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test('CRM-12326_BROWSER-PASS: [Part2] console clean, no Studio entry point, no orphaned menu, app list recorded', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    // ---- collectors, reset per app -------------------------------------------------------------
    let consoleErrors: string[] = [];
    let failedRequests: string[] = [];
    const assetUrls: string[] = [];

    const IGNORE_CONSOLE = [
      'favicon',                       // browsers request it unconditionally
      'ResizeObserver loop',           // benign layout warning
    ];

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text().slice(0, 300);
      if (IGNORE_CONSOLE.some((p) => text.toLowerCase().includes(p.toLowerCase()))) return;
      consoleErrors.push(text);
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(`pageerror: ${String(err.message).slice(0, 300)}`);
    });
    page.on('response', (res) => {
      const url = res.url();
      if (!url.includes('crm-mig.nakivo.site')) return;
      if (/\.(js|css|png|svg|woff2?|ttf|jpg|gif)(\?|$)/i.test(url)) assetUrls.push(url);
      if (res.status() >= 400 && !url.includes('favicon')) {
        failedRequests.push(`${res.status()} ${url.slice(0, 200)}`);
      }
    });

    const results: AppResult[] = [];
    let orphanMenus: Array<{ menu: string; action: string; model: string }> = [];
    let visibleApps: string[] = [];
    let studioHits: string[] = [];
    let studioAssets: string[] = [];

    console.log('========== CRM-12326_BROWSER-PASS - Part 2 browser pass ==========');

    await test.step('Pre-condition: Login as Admin on the O12 Migration server', async () => {
      console.log('\n--- Pre-condition: Login as Admin on the O12 Migration server ---');
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step('C9 + E10 step: open every sidebar app and collect console / request / error-dialog state', async () => {
      console.log('\n--- C9 + E10: open every sidebar app ---');
      const apps = Object.entries(MigPlatformPage.HASH);
      for (const [name, hash] of apps) {
        consoleErrors = [];
        failedRequests = [];
        let ms = -1;
        try {
          ms = await platform.openAppAndMeasureMs(hash);
        } catch (e) {
          consoleErrors.push(`navigation failed: ${String(e).slice(0, 200)}`);
        }
        const errorDialog = await platform.isErrorDialogVisible();
        // An Odoo client-error dialog is MODAL and survives a hash navigation, so it would be
        // re-detected on every later app and inflate the count. Dismiss it before the next app.
        if (errorDialog) {
          await page.keyboard.press('Escape').catch(() => {});
          await page.locator('.modal-footer button, .modal-header .close').first().click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(500);
        }
        results.push({ app: name, ms, errorDialog, consoleErrors: [...consoleErrors], failedRequests: [...failedRequests] });
        console.log(`  ${name.padEnd(20)} ms=${String(ms).padStart(6)}  errorDialog=${errorDialog}  consoleErr=${consoleErrors.length}  failedReq=${failedRequests.length}`);
        for (const c of consoleErrors.slice(0, 3)) console.log(`      console: ${c}`);
        for (const f of failedRequests.slice(0, 3)) console.log(`      request: ${f}`);
      }
    });

    await test.step('D5 step: look for any leftover visual-editor (Studio) entry point', async () => {
      console.log('\n--- D5: leftover Studio entry point ---');
      await platform.openAppAndMeasureMs(MigPlatformPage.HASH.crm);
      const candidates: Array<[string, string]> = [
        ['navbar studio button', '.o_web_studio_navbar_item'],
        ['studio systray',       '[data-menu="studio"]'],
        ['studio container',     '.o_web_studio_client_action, .o_in_studio'],
        ['menu text Studio',     'a:has-text("Studio"), button:has-text("Studio"), span:has-text("Studio")'],
      ];
      for (const [label, sel] of candidates) {
        const n = await page.locator(sel).count().catch(() => 0);
        if (n > 0) {
          const visible = await page.locator(sel).first().isVisible().catch(() => false);
          if (visible) studioHits.push(`${label} (${sel}) x${n}`);
        }
      }
      // Only a real Studio BUNDLE counts. The Apps kanban legitimately serves
      // /base/static/img/icons/web_studio.png as the icon of the (uninstallable) module row, which is
      // a picture in a list, not an editor entry point.
      studioAssets = [...new Set(assetUrls.filter((u) => /\/web_studio\/static\//.test(u)))];
      console.log(`  studio UI hits   : ${studioHits.length ? studioHits.join(' | ') : 'none'}`);
      console.log(`  web_studio assets: ${studioAssets.length ? studioAssets.slice(0, 3).join(' | ') : 'none'}`);
    });

    await test.step('E10 step: find any menu whose action targets a model that does not exist', async () => {
      console.log('\n--- E10: menus pointing at a missing model ---');
      orphanMenus = await page.evaluate(async () => {
        async function callKw(model: string, method: string, args: any[], kwargs: any = {}) {
          const r = await fetch('/web/dataset/call_kw', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
          });
          const j = await r.json();
          if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
          return j.result;
        }
        const menus: any[]   = await callKw('ir.ui.menu', 'search_read', [[['action', '!=', false]], ['complete_name', 'action']], { limit: 2000 });
        const windows: any[] = await callKw('ir.actions.act_window', 'search_read', [[], ['res_model']], { limit: 3000 });
        const models: any[]  = await callKw('ir.model', 'search_read', [[], ['model']], { limit: 3000 });
        const modelSet = new Set(models.map((m) => m.model));
        const winById  = new Map<number, string>(windows.map((w) => [w.id, w.res_model]));
        const out: Array<{ menu: string; action: string; model: string }> = [];
        for (const m of menus) {
          const act = String(m.action || '');
          if (!act.startsWith('ir.actions.act_window,')) continue;
          const id = Number(act.split(',')[1]);
          const resModel = winById.get(id);
          if (resModel === undefined) { out.push({ menu: m.complete_name, action: act, model: '(action missing)' }); continue; }
          if (!modelSet.has(resModel)) out.push({ menu: m.complete_name, action: act, model: resModel });
        }
        return out;
      });
      console.log(`  orphaned menus: ${orphanMenus.length}`);
      for (const o of orphanMenus.slice(0, 15)) console.log(`      ${o.menu} -> ${o.action} -> model ${o.model}`);
    });

    await test.step('E11 step: record the app list a user actually sees', async () => {
      console.log('\n--- E11: visible app list ---');
      visibleApps = await page.evaluate(async () => {
        async function callKw(model: string, method: string, args: any[], kwargs: any = {}) {
          const r = await fetch('/web/dataset/call_kw', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
          });
          const j = await r.json();
          return j.result;
        }
        const roots: any[] = await callKw('ir.ui.menu', 'search_read', [[['parent_id', '=', false]], ['name', 'sequence']], { limit: 200, order: 'sequence asc' });
        return roots.map((r) => r.name);
      });
      console.log(`  root menus (${visibleApps.length}): ${visibleApps.join(', ')}`);
    });

    await test.step('Verification', async () => {
      const appsWithConsole = results.filter((r) => r.consoleErrors.length > 0);
      const appsWithFailed  = results.filter((r) => r.failedRequests.length > 0);
      const appsWithDialog  = results.filter((r) => r.errorDialog);
      const appsFailedNav   = results.filter((r) => r.ms < 0);

      console.log('\n==================== VERIFY ====================');
      console.log(`Apps opened: ${results.length}`);

      console.log('\nVerify C9 - no JavaScript error and no failed script/stylesheet request:');
      console.log(`  Expected : 0 apps with console errors, 0 apps with failed requests`);
      console.log(`  Actual   : ${appsWithConsole.length} with console errors, ${appsWithFailed.length} with failed requests`);
      for (const r of appsWithConsole) console.log(`      ${r.app}: ${r.consoleErrors.slice(0, 2).join(' | ')}`);
      for (const r of appsWithFailed)  console.log(`      ${r.app}: ${r.failedRequests.slice(0, 2).join(' | ')}`);
      console.log(`  Result   : ${appsWithConsole.length === 0 && appsWithFailed.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('\nVerify D5 - no leftover visual-editor entry point:');
      console.log(`  Expected : 0 Studio UI hits, 0 web_studio assets loaded`);
      console.log(`  Actual   : ${studioHits.length} UI hits, ${studioAssets.length} assets`);
      console.log(`  Result   : ${studioHits.length === 0 && studioAssets.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('\nVerify E10 - no orphaned entry point:');
      console.log(`  Expected : 0 menus pointing at a missing model, 0 apps with an error dialog`);
      console.log(`  Actual   : ${orphanMenus.length} orphaned menus, ${appsWithDialog.length} apps with error dialog, ${appsFailedNav.length} apps that failed to open`);
      for (const r of appsWithDialog) console.log(`      error dialog on: ${r.app}`);
      for (const r of appsFailedNav) console.log(`      failed to open: ${r.app}`);
      console.log(`  Result   : ${orphanMenus.length === 0 && appsWithDialog.length === 0 && appsFailedNav.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('\nVerify E11 - app list recorded (evidence, not a pass/fail on its own):');
      console.log(`  Root menus (${visibleApps.length}): ${visibleApps.join(', ')}`);
      console.log(`  Result   : ${visibleApps.length > 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      expect.soft(appsWithConsole.length, `C9: apps with JavaScript errors -> ${appsWithConsole.map((r) => r.app).join(', ')}`).toBe(0);
      expect.soft(appsWithFailed.length, `C9: apps with failed asset requests -> ${appsWithFailed.map((r) => r.app).join(', ')}`).toBe(0);
      expect.soft(studioHits.length, `D5: leftover Studio entry points -> ${studioHits.join(' | ')}`).toBe(0);
      expect.soft(studioAssets.length, `D5: web_studio assets loaded -> ${studioAssets.join(' | ')}`).toBe(0);
      expect.soft(orphanMenus.length, `E10: menus pointing at a missing model -> ${orphanMenus.map((o) => o.menu).join(', ')}`).toBe(0);
      expect.soft(appsWithDialog.length, `E10: apps opening with an error dialog -> ${appsWithDialog.map((r) => r.app).join(', ')}`).toBe(0);
      expect(visibleApps.length, 'E11: could not read the root menu list').toBeGreaterThan(0);
    });
  });
});
