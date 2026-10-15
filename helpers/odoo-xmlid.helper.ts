import { Page } from '@playwright/test';

/**
 * Resolve Odoo screens by XML ID instead of by the numeric menu/action ids in the URL hash.
 *
 * WHY THIS EXISTS
 * ---------------
 * The crm-mig page objects navigate by action hash (`/web#menu_id=<n>&action=<n>`) because the
 * sidebar theme does not render the Configuration sub-menus in an automated session - a menu walk
 * reads zero entries there. That part is sound. What was NOT sound was pinning those numbers:
 * `menu_id` and `action` are DATABASE PRIMARY KEYS (`ir.ui.menu.id`, `ir.actions.act_window.id`),
 * and every crm-mig rebuild reloads those tables from scratch, so the numbers move.
 *
 * Measured across two rebuilds:
 * | screen                                   | 2026-10-05 | 2026-10-13 | 2026-10-14 |
 * |------------------------------------------|-----------|-----------|-----------|
 * | Invoicing > Customers > Invoices          | -         | 201 / 307 | 164 / 262 |
 * | Invoicing > Config > Currencies           | 163 / 64  | 184 / 64  | 147 / 64  |
 * | Invoicing > Config > Currency Rates Prov. | 295 / 436 | 295 / 436 | 300 / 443 |
 *
 * On 2026-10-14 the stale numbers alone accounted for most of a 26-failure run: the client either
 * opened the wrong screen or raised an "Odoo Client Error", and the specs reported missing buttons
 * on a base that was entirely healthy.
 *
 * An XML ID (`module.name` in `ir.model.data`) is the identifier Odoo itself keeps stable across
 * installs, upgrades and rebuilds, and unlike a menu's display name it does not move with
 * translations or re-labelling. So: resolve the XML ID at run time, and keep the last measured
 * numbers only as a fallback for when the lookup itself fails.
 */

/** The XML IDs of the screens this suite drives, with their last measured numeric ids. */
export const SCREEN_XMLIDS = {
  customerInvoices: {
    menu: 'account.menu_action_invoice_tree1',
    action: 'account.action_invoice_tree1',
    fallbackMenuId: 164,
    fallbackActionId: 262,
  },
  invoicesAnalysis: {
    menu: 'account.menu_action_account_invoice_report_all',
    action: 'account.action_account_invoice_report_all',
    fallbackMenuId: 173,
    fallbackActionId: 271,
  },
  currencies: {
    menu: 'account.menu_action_currency_form',
    action: 'base.action_currency_form',
    fallbackMenuId: 147,
    fallbackActionId: 64,
  },
  currencyRateProviders: {
    menu: 'currency_rate_update.menu_res_currency_rate_provider',
    action: 'currency_rate_update.action_res_currency_rate_provider',
    fallbackMenuId: 300,
    fallbackActionId: 443,
  },
  scheduledActions: {
    menu: 'base.menu_ir_cron_act',
    action: 'base.ir_cron_act',
    fallbackMenuId: 26,
    fallbackActionId: 11,
  },
} as const;

export interface ScreenIds {
  menuId: number;
  actionId: number;
  /** false when the lookup failed and the last-measured fallback is in use. */
  resolved: boolean;
}

/**
 * Translate XML IDs into the numeric ids the URL hash needs, over the session's own JSON-RPC.
 *
 * Uses a plain `search_read` on `ir.model.data` rather than `xmlid_to_res_id`, so it needs no model
 * method to be exposed and fails soft: a lookup that cannot run returns the fallback instead of
 * throwing, and says so in the log.
 *
 * @param page - a page already logged in to the target instance
 * @param screen - one of `SCREEN_XMLIDS`
 */
export async function resolveScreenIds(
  page: Page,
  screen: { menu: string; action: string; fallbackMenuId: number; fallbackActionId: number },
): Promise<ScreenIds> {
  const wanted = [screen.menu, screen.action];
  const found = await page
    .evaluate(async (xmlIds: string[]) => {
      const pairs = xmlIds.map((x) => x.split('.'));
      const domain: any[] = ['|'];
      // ['|', [m1,n1-and], [m2,n2-and]] is awkward to build generically; read both modules at once
      // and filter client-side instead - the table is small for these two names.
      const modules = Array.from(new Set(pairs.map((p) => p[0])));
      const names = pairs.map((p) => p[1]);
      void domain;
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'ir.model.data',
            method: 'search_read',
            args: [[['module', 'in', modules], ['name', 'in', names]], ['module', 'name', 'res_id']],
            kwargs: { limit: 20 },
          },
        }),
      });
      const j = await r.json();
      if (j.error || !j.result) return {} as Record<string, number>;
      const out: Record<string, number> = {};
      for (const row of j.result) out[`${row.module}.${row.name}`] = row.res_id;
      return out;
    }, wanted)
    .catch(() => ({} as Record<string, number>));

  const menuId = found[screen.menu] || screen.fallbackMenuId;
  const actionId = found[screen.action] || screen.fallbackActionId;
  const resolved = Boolean(found[screen.action]);
  console.log(
    `  - ${screen.action} -> menu ${menuId} / action ${actionId}` +
    (resolved ? '' : '  (XML ID lookup failed - using the last measured ids)'),
  );
  return { menuId, actionId, resolved };
}
