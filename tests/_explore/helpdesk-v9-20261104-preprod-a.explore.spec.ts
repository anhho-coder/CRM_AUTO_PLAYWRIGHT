import { test, Page } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { readPreprodMeetingBaseline } from '@helpers/support-meetings-baseline.helper';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-04, pre-production, L1 agent Giang Le.
 * A8: what puts a ticket into Filters > Review needed (helpdesk.ticket.review_needed, rule 139 "L1 support review"): ONE probe
 *     ticket of this run, Giang sends a message to the customer from the chatter, the run reads review_needed and the
 *     approval, then Filters Open Tickets + Review needed. Teardown: the probe's pending approval is removed when Giang may
 *     remove it, and the ticket is archived (pre-production sends no e-mail).
 * A9: READ ONLY - Helpdesk > Configuration > Support meeting Info (support.meeting.info = the meetings an engineer scheduled,
 *     create_uid = that engineer): can Giang open it, and which custom-filter fields / operators does it offer.
 */
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-v9';
const AGENT = users.support_l1_giang_preprod;
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }
async function kw(page: Page, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  return page.evaluate(async ([m, f, a, k]) => {
    const r = await fetch('/web/dataset/call_kw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model: m, method: f, args: a, kwargs: k } }) });
    const j = await r.json();
    return j.error ? { error: `${(j.error.data || {}).name || ''} :: ${String((j.error.data || {}).message || j.error.message).slice(0, 300)}` } : { result: j.result };
  }, [model, method, args, kwargs] as [string, string, unknown[], Record<string, unknown>]);
}
async function login(page: Page) {
  const lp = new LoginPage(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await lp.navigateTo(baseUrl);
  await lp.login(AGENT.username, AGENT.password, CommonUtils.waitTimes.pageLoad);
  await lp.dismissLocationPermissionDialog();
}

let probeId = '';
const SUBJECT = `AUTO-CRM-11859-UI112-A-${RUN} review probe`;

test.afterEach(async ({ page }) => {
  if (!probeId) return;
  console.log('\n--- afterEach: cleanup ---');
  const appr = await kw(page, 'mail.message.approval', 'search_read', [[['model', '=', 'helpdesk.ticket'], ['res_id', '=', Number(probeId)]]], { fields: ['id', 'approval_state'], limit: 6 });
  console.log('approvals on the probe', JSON.stringify(appr));
  const rows = ((appr as { result?: Array<{ id: number }> }).result || []);
  if (rows.length && rows.length <= 5) console.log('unlink approvals', JSON.stringify(await kw(page, 'mail.message.approval', 'unlink', [rows.map((r) => r.id)])));
  console.log('archive probe', await new HelpdeskPage(page).archiveTicketByIdOverRpc(probeId, SUBJECT).catch((e) => String(e)));
});

test('EXPLORE-V9-A8: a message to the customer by an L1 agent - does the ticket enter Review needed?', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  page.setDefaultTimeout(20_000);
  await login(page);
  const hd = new HelpdeskPage(page);
  probeId = await hd.createTicket(baseUrl, SUBJECT);
  console.log('probe', probeId);
  await hd.openTicketById(baseUrl, probeId);
  await page.waitForTimeout(3000);
  // the NAKIVO composer refuses a message without a Stage ("Please input stage!") - same as the Support service's composer
  await page.locator('button.o_chatter_button_new_message').first().click();
  await page.waitForTimeout(1500);
  const composer = page.locator('.o_thread_composer').first();
  await composer.locator('textarea.o_composer_text_field').first().fill(`Hello, this is an automated probe message ${RUN} (CRM-11859 TC-UI-112). Not a real customer.`);
  const selects = await composer.locator('select').evaluateAll((els) => els.map((e) => Array.from((e as HTMLSelectElement).options).map((o) => o.text).join('|')));
  console.log('composer selects', JSON.stringify(selects));
  await composer.locator('select').first().selectOption({ label: process.env.REPLY_STAGE || 'On Customer' }).catch((e) => console.log('stage pick', String(e).split('\n')[0]));
  await page.waitForTimeout(800);
  await composer.locator('.o_composer_button_send').first().click();
  await page.waitForTimeout(6000);
  console.log('composer still open', await composer.locator('.o_composer_button_send').first().isVisible().catch(() => false));
  await shot(page, 'a8-1-after-send');
  console.log('ticket', JSON.stringify(await kw(page, 'helpdesk.ticket', 'read', [[Number(probeId)], ['review_needed', 'stage_id', 'user_id', 'partner_id']])));
  console.log('approvals', JSON.stringify(await kw(page, 'mail.message.approval', 'search_read', [[['model', '=', 'helpdesk.ticket'], ['res_id', '=', Number(probeId)]]], { fields: ['id', 'approval_state', 'need_approve_by_users_ids', 'approved_by_users_ids', 'author_id'], limit: 5 })));
  const chatter = await page.locator('.o_mail_thread, .o_thread_message').first().innerText().catch(() => '');
  console.log('chatter head', JSON.stringify(chatter.slice(0, 500)));

  await hd.openAllTicketsListDirect(baseUrl);
  await hd.clearSearchFacets();
  await hd.chooseSearchFilter('Open Tickets');
  await hd.chooseSearchFilter('Review needed');
  console.log('facets', JSON.stringify(await hd.getSearchFacets()), 'pager', await hd.getPagerTotal().catch((e) => String(e)));
  console.log('count open+review', await hd.countTicketsOverRpc([['stage_id.is_close', '=', false], ['review_needed', '=', true]]));
  console.log('count review only', await hd.countTicketsOverRpc([['review_needed', '=', true]]));
  console.log('probe rows listed', await hd.countListRowsContaining(SUBJECT).catch((e) => String(e)));
  await shot(page, 'a8-2-open-plus-review');
});

test('EXPLORE-V9-A9: Support meeting Info - access and custom filters (read only)', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  page.setDefaultTimeout(20_000);
  await login(page);
  const me = await kw(page, 'res.users', 'read', [[0]], {});
  console.log('me?', JSON.stringify(me).slice(0, 120));
  const uidR = await page.evaluate(async () => { const r = await fetch('/web/session/get_session_info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","method":"call","params":{}}' }); const j = await r.json(); return { uid: j.result.uid, tz: (j.result.user_context || {}).tz }; });
  console.log('session', JSON.stringify(uidR));
  console.log('my meetings (create_uid)', JSON.stringify(await kw(page, 'support.meeting.info', 'search_read', [[['create_uid', '=', uidR.uid]]], { fields: ['id', 'meeting_time', 'ticket_id'], order: 'meeting_time desc', limit: 12 })));
  console.log('my meetings count', JSON.stringify(await kw(page, 'support.meeting.info', 'search_count', [[['create_uid', '=', uidR.uid]]])));
  await page.goto(`${baseUrl.replace(/\/$/, '')}/web#action=2591&model=support.meeting.info&view_type=list`);
  await page.waitForTimeout(5000);
  console.log('breadcrumb', JSON.stringify(await page.locator('.o_control_panel .breadcrumb').innerText().catch(() => '')), 'pager', JSON.stringify(await page.locator('.o_pager_counter').innerText().catch(() => '')));
  const menu = await page.locator('.o_menu_sections').innerText().catch(() => '');
  console.log('menu sections', JSON.stringify(menu.slice(0, 300)));
  await shot(page, 'a9-1-support-meeting-info');
  await page.locator('.o_search_options .o_dropdown_toggler_btn, button:has-text("Filters")').first().click().catch((e) => console.log('filters btn', String(e).split('\n')[0]));
  await page.waitForTimeout(1000);
  console.log('filters menu', JSON.stringify(await page.locator('.o_filters_menu').innerText().catch(() => '')));
  await page.locator('.o_filters_menu :is(a,button):has-text("Add Custom Filter")').first().click().catch((e) => console.log('add custom', String(e).split('\n')[0]));
  await page.waitForTimeout(1000);
  const fieldSel = page.locator('.o_filters_menu .o_searchview_extended_prop_field').first();
  const fields = await fieldSel.evaluate((el) => Array.from((el as HTMLSelectElement).options).map((o) => o.text)).catch(() => [] as string[]);
  console.log('custom filter fields', JSON.stringify(fields));
  for (const f of ['Created by', 'Meeting Time', 'Meeting time']) {
    if (!fields.includes(f)) continue;
    await fieldSel.selectOption({ label: f });
    await page.waitForTimeout(800);
    const ops = await page.locator('.o_filters_menu .o_searchview_extended_prop_op').first().evaluate((el) => Array.from((el as HTMLSelectElement).options).map((o) => o.text)).catch(() => []);
    const valHtml = await page.locator('.o_filters_menu .o_searchview_extended_prop_value').first().innerHTML().catch(() => '');
    console.log('FIELD', f, 'ops', JSON.stringify(ops), 'value widget', JSON.stringify(valHtml.replace(/\s+/g, ' ').slice(0, 300)));
  }
  await shot(page, 'a9-2-custom-filter');
});

test('EXPLORE-V9-A10: Support meeting Info - Created by = me + Meeting Time windows on old meetings (read only)', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  page.setDefaultTimeout(20_000);
  const w = await readPreprodMeetingBaseline(AGENT.username, AGENT.password);
  console.log('baseline', JSON.stringify({ uid: w.uid, tz: w.tz, n: w.ids.length, day: w.day, utc: w.utc, counts: w.counts }));
  await login(page);
  const hd = new HelpdeskPage(page);
  await hd.openSupportMeetingInfo();
  await hd.addCustomFilter('Created by', 'is equal to', { m2o: 'Giang Le' });
  console.log('pager created-by', await hd.getPagerTotal());
  const [y, m, d] = w.day.split('-');
  const us = `${m}/${d}/${y}`;
  await hd.addCustomFilter('Meeting Time', 'is between', { dates: [`${us} 00:00:00`, `${us} 23:59:59`] });
  console.log('pager on D', await hd.getPagerTotal());
  await shot(page, 'a10-1-on-day');
  await hd.removeSearchFacet('Meeting Time');
  await hd.addCustomFilter('Meeting Time', 'is before', { dates: [`${us} 00:00:00`] });
  console.log('pager before D', await hd.getPagerTotal());
  await hd.removeSearchFacet('Meeting Time');
  await hd.addCustomFilter('Meeting Time', 'is after', { dates: [`${us} 23:59:59`] });
  console.log('pager after D', await hd.getPagerTotal());
  await shot(page, 'a10-2-after-day');
});
