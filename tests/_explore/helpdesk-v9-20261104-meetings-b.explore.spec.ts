import { test, Page, Frame } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { SupportDeskPageMig } from '@pages/mig/SupportDeskPageMig';

/**
 * EXPLORE (read only, kept per the never-delete-explore rule) - 2026-11-04, support-crm-mig, L1 agent Giang Le.
 * Tester 2026-11-04: "my meeting" = a meeting the signed-in account CREATED; narrow by date on OLD meetings instead of booking
 * new ones. Reads: the Meetings drawer's "Created By" sidebar group, the list filtered owner = me, and Start windows
 * (one day D / before D / after D) set through the list's route options; the filters are cleared again at the end.
 */
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-v9';
test.use({ ignoreHTTPSErrors: true });
const AGENT = users.support_l1_giang_support_mig;
const D = process.env.MEETING_DAY || '2026-08-28';
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }
function listFrame(page: Page): Frame | undefined { return page.frames().find((f) => /\/app\/nk-meeting/.test(f.url())); }
async function readCount(f: Frame): Promise<string> {
  await f.waitForTimeout(2500);
  const c = await f.locator('.list-count:visible').first().innerText().catch(() => '');
  const n = await f.locator('.no-result:visible').first().innerText().catch(() => '');
  const pills = await f.locator('.filter-selector .filter-label, .filter-x-button, .filter-button').allInnerTexts().catch(() => []);
  return `count="${c}" noResult="${n.replace(/\s+/g, ' ').slice(0, 80)}" pills=${JSON.stringify(pills)}`;
}

test('EXPLORE-V9-B9: Meetings - filters set through the list filter area, then cleared (read only)', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  page.setDefaultTimeout(20_000);
  const desk = new SupportDeskPageMig(page);
  await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
  await desk.openMeetingsList();
  const f = listFrame(page);
  if (!f) return;
  console.log('saved filters on open', await f.evaluate(() => { const w = window as unknown as { cur_list?: { filter_area: { get: () => unknown } } }; return w.cur_list ? JSON.stringify(w.cur_list.filter_area.get()) : 'no cur_list'; }));
  for (const fl of [[['owner', '=', AGENT.username]], [['start_time', 'Between', [D, D]]], [['start_time', '<', `${D} 00:00:00`]], [['start_time', '>', `${D} 23:59:59`]], [['owner', '=', AGENT.username], ['start_time', 'Between', [D, D]]]] as Array<Array<[string, string, unknown]>>) {
    const r = await desk.filterMeetingsList(fl).catch((e) => ({ count: `ERR ${String(e).split('\n')[0]}`, emptyMessage: '', applied: '' }));
    console.log('B9', JSON.stringify(fl), '->', JSON.stringify(r));
    await shot(page, `b9-${fl.map((x) => x[1]).join('-').replace(/[^a-z0-9]+/gi, '_')}`);
  }
  console.log('cleared ->', await desk.clearMeetingsListFilters());
  await desk.reloadPage().catch(() => {});
  await desk.openMeetingsList().catch((e) => console.log('reopen', String(e).split('\n')[0]));
  const f2 = listFrame(page);
  console.log('filters after reopen', f2 ? await f2.evaluate(() => { const w = window as unknown as { cur_list?: { filter_area: { get: () => unknown } } }; return w.cur_list ? JSON.stringify(w.cur_list.filter_area.get()) : 'no cur_list'; }) : 'no frame');
});

test('EXPLORE-V9-B8: Meetings - Created By = me and Start windows on old meetings (read only)', async ({ page }) => {
  test.skip(!process.env.RUN_B8, 'B8 ran 2026-11-04 (route options; Between breaks the Desk page) - B9 replaces it');
  test.setTimeout(6 * 60_000);
  page.setDefaultTimeout(20_000);
  const desk = new SupportDeskPageMig(page);
  await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
  await desk.openMeetingsList();
  const f = listFrame(page);
  console.log('frame', f?.url());
  if (!f) return;
  console.log('tz', JSON.stringify(await f.evaluate(() => { const w = window as unknown as { frappe: { boot: { time_zone: unknown; user: { time_zone?: string } } } }; return { tz: w.frappe.boot.time_zone, user: w.frappe.boot.user.time_zone }; }).catch((e) => String(e))));
  console.log('initial', await readCount(f));
  const side = await f.locator('.list-sidebar').innerText().catch(() => '');
  console.log('SIDEBAR', JSON.stringify(side.slice(0, 600)));
  const createdBy = f.locator('.list-sidebar .group-by-dropdown, .list-sidebar [data-label="Created By"], .list-sidebar .dropdown-toggle', { hasText: /Created By/i }).first();
  console.log('created-by toggles', await createdBy.count());
  if (await createdBy.count()) {
    await createdBy.click().catch((e) => console.log('created-by click', String(e).split('\n')[0]));
    await f.waitForTimeout(2000);
    const items = await f.locator('.list-sidebar .dropdown-menu.show, .list-sidebar .group-by-dropdown .dropdown-menu').first().innerText().catch(() => '');
    console.log('CREATED BY ITEMS', JSON.stringify(items.slice(0, 400)));
    await shot(page, 'b8-1-created-by');
    await f.locator('body').press('Escape').catch(() => {});
  }
  const base = f.url().split('?')[0];
  const enc = (v: unknown) => encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v));
  for (const [name, q] of [
    ['owner=me', `owner=${enc(AGENT.username)}`],
    ['start on D', `start_time=${enc(['Between', [D, D]])}`],
    ['start before D', `start_time=${enc(['<', `${D} 00:00:00`])}`],
    ['start after D', `start_time=${enc(['>', `${D} 23:59:59`])}`],
    ['owner=me + start on D', `owner=${enc(AGENT.username)}&start_time=${enc(['Between', [D, D]])}`],
  ] as const) {
    await f.goto(`${base}?${q}`).catch((e) => console.log('goto', String(e).split('\n')[0]));
    console.log(`WINDOW ${name}:`, await readCount(f));
    const filters = await f.evaluate(() => { const w = window as unknown as { cur_list?: { filter_area: { get: () => unknown } } }; return w.cur_list ? JSON.stringify(w.cur_list.filter_area.get()) : 'no cur_list'; }).catch((e) => String(e));
    console.log('   filters', filters);
    await shot(page, `b8-2-${name.replace(/[^a-z0-9]+/gi, '-')}`);
  }
  for (const fl of [[['start_time', 'between', [`${D} 00:00:00`, `${D} 23:59:59`]]], [['start_time', '<', `${D} 00:00:00`]], [['start_time', '>', `${D} 23:59:59`]], [['owner', '=', AGENT.username]]]) {
    const r = await page.evaluate(async (fl) => { const x = await fetch(`/api/method/frappe.client.get_count?doctype=NK%20Meeting&filters=${encodeURIComponent(JSON.stringify(fl))}`); return `${x.status} ${(await x.text()).slice(0, 120)}`; }, fl);
    console.log('API COUNT', JSON.stringify(fl), r);
  }
  // clear the list filters again (Desk keeps the last filters per user)
  console.log('clear', await f.evaluate(async () => { const w = window as unknown as { cur_list?: { filter_area: { clear: () => Promise<unknown> } } }; if (!w.cur_list) return 'no cur_list'; await w.cur_list.filter_area.clear(); return 'cleared'; }).catch((e) => String(e)));
  console.log('after clear', await readCount(f));
});

test('CLEAN-B10: clear the saved filters of the NK Meeting list for the agent, then reopen and re-read', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  page.setDefaultTimeout(20_000);
  const who = process.env.CLEAN_AGENT === 'nam' ? users.support_l2_nam_support_mig : AGENT;
  const desk = new SupportDeskPageMig(page);
  await desk.login(baseUrl_support_mig, who.username, who.password);
  await desk.openMeetingsList();
  const read = async () => { const f = listFrame(page); return f ? f.evaluate(() => { const w = window as unknown as { cur_list?: { filter_area: { get: () => unknown } } }; return w.cur_list ? JSON.stringify(w.cur_list.filter_area.get()) : 'no cur_list'; }) : 'no frame'; };
  console.log('filters on open', await read());
  console.log('server-held after clear', await desk.clearMeetingsListFilters());
  await page.waitForTimeout(3000);
  await desk.reloadPage();
  await desk.openMeetingsList();
  console.log('filters after reopen', await read(), '| counter', await desk.getMeetingsListCount().catch(() => '(none)'));
});
