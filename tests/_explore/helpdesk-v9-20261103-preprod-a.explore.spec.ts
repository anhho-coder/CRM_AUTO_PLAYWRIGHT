import { test, Page } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HelpdeskPage, LoginPage } from '@pages';

/**
 * EXPLORE (read-only, kept per the never-delete-explore rule) - 2026-11-03. Side-A baseline (pre-production Odoo 12) for the
 * TCs written from Confluence 231246777 v9: Filters combined, New ticket form required fields + Customer dropdown / Search
 * More, the activity filters, and the meeting report (gtm.info) on a ticket. Nothing is saved: the Create form is discarded.
 */
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-v9';
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {}); }
async function kw(page: Page, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  return page.evaluate(async (p) => {
    const r = await fetch('/web/dataset/call_kw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: p }) });
    const j = await r.json(); return j.error ? { error: String((j.error.data && j.error.data.message) || j.error.message) } : { result: j.result };
  }, { model, method, args, kwargs });
}

test('EXPLORE-V9-A1: Filters, Create form, Customer dropdown, meeting report (Giang, pre-prod)', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const login = new LoginPage(page);
  const hd = new HelpdeskPage(page);
  const A = users.support_l1_giang_preprod;
  await login.navigateTo(baseUrl);
  await login.login(A.username, A.password, 60_000);
  await login.dismissLocationPermissionDialog();
  await hd.navigateToHelpdesk();
  await hd.openAllTicketsFromMenu();
  console.log('FACETS0', JSON.stringify(await hd.getSearchFacets()));
  // search-view filter definitions (domains) of the ticket search view
  const sv = await kw(page, 'helpdesk.ticket', 'fields_view_get', [], { view_type: 'search' });
  const arch = String((sv as { result?: { arch?: string } }).result?.arch || '');
  for (const m of arch.matchAll(/<filter [^>]*>/g)) if (/string="(Open Tickets|Unassigned Tickets|Review needed|My Tickets|My Activities|Late Activities|Today Activities|Future Activities)"/.test(m[0])) console.log('FILTERDEF', m[0].slice(0, 400));
  await hd.clearSearchFacets();
  await hd.chooseSearchFilter('Open Tickets');
  await hd.chooseSearchFilter('Unassigned Tickets');
  console.log('FACETS after Open + Unassigned', JSON.stringify(await hd.getSearchFacets()), 'pager', await hd.getPagerText().catch(() => '?'));
  await hd.openFiltersMenu();
  await shot(page, 'a1-filters-open-unassigned');
  await page.keyboard.press('Escape');
  await hd.clearSearchFacets();
  await hd.chooseSearchFilter('Open Tickets');
  await hd.chooseSearchFilter('Review needed');
  console.log('FACETS after Open + Review needed', JSON.stringify(await hd.getSearchFacets()), 'pager', await hd.getPagerText().catch(() => '?'));
  await hd.clearSearchFacets();

  // Create form - required markers and the Customer dropdown (discarded, never saved)
  await hd.switchToListView().catch(() => {});
  await page.locator('button.o_list_button_add').first().click();
  await page.locator('.o_form_view').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(2500);
  const req = await page.evaluate(() => Array.from(document.querySelectorAll('.o_form_view .o_required_modifier')).filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getAttribute('name') || e.querySelector('[name]')?.getAttribute('name') || e.className.slice(0, 60)));
  console.log('REQUIRED (visible)', JSON.stringify(req));
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('.o_form_view label.o_form_label')).filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => `${(e as HTMLElement).innerText.trim()}${e.classList.contains('o_required_modifier') ? ' [REQ]' : ''} -> ${e.getAttribute('for') || ''}`));
  console.log('LABELS', JSON.stringify(labels));
  await shot(page, 'a1-create-form');
  const cust = page.locator('.o_form_view .o_field_widget[name="partner_id"] input').first();
  if (await cust.isVisible().catch(() => false)) {
    await cust.click(); await cust.fill('backup'); await page.waitForTimeout(2500);
    console.log('PARTNER OPTIONS (backup)', JSON.stringify((await page.locator('ul.ui-autocomplete li').allInnerTexts()).map((t) => t.trim())));
    await shot(page, 'a1-customer-options-name');
    await cust.fill('binaryonellc.com'); await page.waitForTimeout(2500);
    console.log('PARTNER OPTIONS (binaryonellc.com)', JSON.stringify((await page.locator('ul.ui-autocomplete li').allInnerTexts()).map((t) => t.trim())));
    await shot(page, 'a1-customer-options-domain');
    await page.keyboard.press('Escape');
  } else console.log('partner_id input not visible');
  const discard = page.locator('button.o_form_button_cancel').first();
  if (await discard.isVisible().catch(() => false)) { await discard.click(); await page.waitForTimeout(1500); const ok = page.locator('.modal.show .btn-primary').first(); if (await ok.isVisible().catch(() => false)) await ok.click(); }

  // meeting report (gtm.info) - where it shows on the ticket
  const g = await kw(page, 'gtm.info', 'search_read', [[['ticket_id', '!=', false]], ['id', 'ticket_id', 'start_date', 'end_date', 'bonus_meeting', 'canceled_meeting', 'type', 'feedback']], { limit: 3, order: 'id desc' });
  console.log('GTM.INFO as Giang', JSON.stringify(g).slice(0, 1500));
  const rows = (g as { result?: Array<{ ticket_id: [number, string] }> }).result || [];
  if (rows.length) {
    await hd.openTicketById(baseUrl, rows[0].ticket_id[0]);
    await page.waitForTimeout(3000);
    console.log('BUTTON BOX', JSON.stringify(await page.locator('.o_form_view .oe_button_box button').allInnerTexts()));
    console.log('NOTEBOOK TABS', JSON.stringify(await page.locator('.o_form_view .o_notebook .nav-link').allInnerTexts()));
    await shot(page, 'a1-ticket-with-meeting');
    await page.locator('.o_form_view .oe_button_box button').filter({ hasText: 'Ticket Meetings' }).first().click();
    await page.waitForTimeout(3500);
    console.log('TM BREADCRUMB', await page.locator('.o_control_panel .breadcrumb').innerText().catch(() => ''));
    console.log('TM VIEW', await page.evaluate(() => (document.querySelector('.o_list_view') ? 'list' : document.querySelector('.o_form_view') ? 'form' : document.querySelector('.o_kanban_view') ? 'kanban' : 'other')));
    console.log('TM HEADERS', JSON.stringify(await page.locator('.o_list_view thead th').allInnerTexts()));
    console.log('TM ROW1', JSON.stringify(await page.locator('.o_list_view tbody tr.o_data_row').first().locator('td').allInnerTexts().catch(() => [])));
    await shot(page, 'a1-ticket-meetings-list');
    const r1 = page.locator('.o_list_view tbody tr.o_data_row').first();
    if (await r1.isVisible().catch(() => false)) {
      await r1.click(); await page.waitForTimeout(3000);
      console.log('TM FORM', JSON.stringify(await hd.readFormFieldsByName(['name', 'start_date', 'end_date', 'duration', 'type', 'bonus_meeting', 'canceled_meeting', 'feedback', 'ticket_id'])).slice(0, 1200));
      const cb = await page.evaluate(() => ['bonus_meeting', 'canceled_meeting'].map((n) => { const i = document.querySelector(`.o_form_view [name="${n}"] input`) as HTMLInputElement | null; return `${n}=${i ? i.checked : 'n/a'}`; }));
      console.log('TM CHECKBOXES', JSON.stringify(cb));
      await shot(page, 'a1-ticket-meeting-form');
    }
  }
  // the Helpdesk app menus
  console.log('APP MENUS', JSON.stringify((await page.locator('.o_main_navbar .o_menu_sections > li > a, .o_main_navbar .o_menu_sections a.dropdown-item').allInnerTexts()).map((t) => t.trim()).filter(Boolean)));
});
