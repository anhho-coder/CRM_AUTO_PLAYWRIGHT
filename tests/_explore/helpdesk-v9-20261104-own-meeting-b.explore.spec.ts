import { test, Page, Frame, request, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl_support_mig } from '@config/users.config';
import { SupportDeskPageMig } from '@pages/mig/SupportDeskPageMig';
import { createSupportTicketAsAdmin, deleteSupportProbeAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-04. Tester: the Support service is a NEW system - find ITS path:
 * as agent giang.le create a ticket > create a meeting on it > back to the Meetings page > filter: is the new meeting listed?
 * Path known from TC-CUST-051_B: ticket must have an assigned engineer; header Actions > "Schedule meeting" opens a drawer
 * embedding the Desk form "New NK Meeting" in a frame.
 * SAFETY: room "Zoom Link #1" carries Zoom API credentials (measured 2026-11-04) - saving a meeting there may book a REAL Zoom
 * meeting, so this run sets a room WITHOUT credentials and refuses to save when the form still points at Zoom Link #1.
 * afterEach (Administrator, deny-list): the run's NK Meeting + rows referencing it, then the ticket / e-mails / contact; the
 * agent's Meetings list filters are cleared.
 */
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-v9';
test.use({ ignoreHTTPSErrors: true });
const ADMIN = users.admin_support_mig;
const AGENT = users.support_l1_giang_support_mig;
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const SUBJECT = `AUTO-CRM-11859-TC-CUST-099_B-${RUN} meeting probe`;
const RAISED_BY = `qa.customer.cust099.${RUN}@example.com`;
const SAFE_ROOM = process.env.SAFE_ROOM || 'Zoom Link #2';
const UNSAFE_ROOM = 'Zoom Link #1';
const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));
/** Never print a meeting join link or passcode: keep only whether one is there. */
const mask = (s: string) => s.replace(/https?:\/\/[^\s"']*(zoom|gotomeet|goto)[^\s"']*/gi, '<join-link>').replace(/(pwd|passcode|password)=?["':]*[^\s"'&,}]+/gi, '$1=<hidden>');
const T = 20_000;
const probe = { ticket: '', since: '', meetings: [] as string[] };
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }
async function adminApi(): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: baseUrl_support_mig.replace(/\/$/, ''), ignoreHTTPSErrors: true });
  const lg = await api.post('/api/method/login', { data: { usr: ADMIN.username, pwd: ADMIN.password } });
  if (lg.status() !== 200) throw new Error(`admin login HTTP ${lg.status()}`);
  return api;
}
function meetingFormFrame(page: Page): Frame | undefined { return page.frames().find((f) => /\/app\/nk-meeting\/new/.test(f.url())); }

test.afterEach(async ({ page }) => {
  console.log('\n--- afterEach: cleanup ---');
  if (probe.ticket && probe.since) {
    const api = await adminApi();
    try {
      // every NK Meeting created since the probe on the probe ticket (deny-list: ticket = probe AND creation >= probe)
      const ms: Array<{ name: string; ticket: string }> = (await (await api.get(`/api/resource/NK Meeting?fields=${enc(['name', 'ticket'])}&filters=${enc([['ticket', '=', probe.ticket], ['creation', '>=', probe.since]])}&limit_page_length=6`)).json()).data || [];
      if (ms.length > 5) console.log(`TEARDOWN STOP: ${ms.length} NK Meetings on ticket ${probe.ticket} - more than this run makes; none deleted`);
      else for (const m of ms) {
        if (String(m.ticket) !== probe.ticket) continue;
        for (const dt of ['Communication', 'Email Queue', 'ToDo']) {
          const field = dt === 'ToDo' ? 'reference_type' : 'reference_doctype';
          const rows: Array<{ name: string }> = (await (await api.get(`/api/resource/${encodeURIComponent(dt)}?fields=${enc(['name'])}&filters=${enc([[field, '=', 'NK Meeting'], ['reference_name', '=', m.name]])}&limit_page_length=11`)).json()).data || [];
          for (const r of rows.slice(0, 10)) console.log(`TEARDOWN ${dt} ${r.name} (NK Meeting ${m.name}): HTTP ${(await api.delete(`/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(r.name)}`)).status()}`);
        }
        const d = await api.delete(`/api/resource/NK Meeting/${encodeURIComponent(m.name)}`);
        console.log(`TEARDOWN NK Meeting ${m.name}: HTTP ${d.status()} ${d.status() >= 300 ? (await d.text()).slice(0, 200) : ''}`);
      }
    } finally { await api.dispose(); }
  }
  for (const l of await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, { ticketName: probe.ticket || undefined, subject: SUBJECT, contactEmail: RAISED_BY, since: probe.since || undefined }).catch((e) => [`TEARDOWN FAILED: ${String(e).slice(0, 300)}`])) console.log(`TEARDOWN ${l}`);
  const desk = new SupportDeskPageMig(page);
  await desk.openMeetingsList().catch(() => {});
  console.log('TEARDOWN meetings list filters ->', await desk.clearMeetingsListFilters().catch((e) => `NOT CLEARED ${String(e).split('\n')[0]}`));
});

test('EXPLORE-V9-B11: agent creates a ticket > a meeting > Meetings page filter - is the new meeting listed?', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  page.setDefaultTimeout(T);
  const desk = new SupportDeskPageMig(page);
  const t = await createSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, { subject: SUBJECT, raisedBy: RAISED_BY, description: '<p>Automated probe for CRM-11859 TC-CUST-099_B (own meeting). Not a real customer.</p>' });
  Object.assign(probe, { ticket: t.name, since: t.creation });
  console.log('probe ticket', t.name, t.creation);
  await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
  await desk.openTicketByLink(baseUrl_support_mig, probe.ticket);
  await desk.assignToMeFromHeader().catch((e) => console.log('assign to me', String(e).split('\n')[0]));
  await page.waitForTimeout(2500);
  console.log('header menu items', JSON.stringify(await (async () => { await desk.openHeaderActionsMenu().catch(() => {}); const i = await desk.getHeaderMenuItems().catch(() => []); await desk.closeOpenMenu().catch(() => {}); return i; })()));
  const r = await desk.scheduleMeetingFromActions('Schedule').catch((e) => ({ serverMessage: `ERR ${String(e).split('\n')[0]}`, shown: '' }));
  console.log('schedule meeting ->', JSON.stringify(r));
  for (let i = 0; i < 20 && !meetingFormFrame(page); i++) await page.waitForTimeout(500);
  const f = meetingFormFrame(page);
  console.log('meeting form frame', f?.url());
  await shot(page, 'b11-1-meeting-form');
  if (!f) return;
  await f.waitForTimeout(2500);
  const controls = await f.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.frappe-control[data-fieldname]')).filter((e) => e.offsetParent !== null).map((e) => {
    const inp = e.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea');
    return { f: e.getAttribute('data-fieldname'), label: (e.querySelector('.control-label, label')?.textContent || '').trim(), reqd: e.classList.contains('frappe-control') && !!e.querySelector('.reqd, .control-label.reqd'), value: inp ? (inp as HTMLInputElement).value : '' };
  }));
  fs.writeFileSync(`${OUT}/b11-form-controls.json`, JSON.stringify(controls, null, 1));
  console.log('FORM CONTROLS', JSON.stringify(controls).slice(0, 2500));
  const docBefore = await f.evaluate(() => { const w = window as unknown as { cur_frm?: { doc: Record<string, unknown> } }; const d = w.cur_frm?.doc || {}; return JSON.stringify({ room: d.room, provider: d.provider, start_time: d.start_time, agent: d.agent, ticket: d.ticket, customer_email: d.customer_email, duration_minutes: d.duration_minutes, subject: d.subject, meeting_type: d.meeting_type }); });
  console.log('form doc (defaults)', docBefore);

  // set a room WITHOUT API credentials, a start tomorrow 10:00 (system zone) and a subject with the run marker
  const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
  const set = await f.evaluate(async ([room, start, subj]) => {
    const w = window as unknown as { cur_frm?: { set_value: (k: string, v: unknown) => Promise<unknown>; doc: Record<string, unknown> } };
    if (!w.cur_frm) return 'no cur_frm';
    await w.cur_frm.set_value('room', room);
    await w.cur_frm.set_value('start_time', `${start} 10:00:00`);
    if ('subject' in w.cur_frm.doc || true) await w.cur_frm.set_value('subject', subj).catch(() => {});
    // mandatory on save (measured 2026-11-04: "Missing Fields: Meeting Type, Customer's Timezone")
    await w.cur_frm.set_value('meeting_type', 'Regular meeting');
    await w.cur_frm.set_value('customer_tz', 'UTC');
    return JSON.stringify({ room: w.cur_frm.doc.room, start_time: w.cur_frm.doc.start_time, subject: w.cur_frm.doc.subject, provider: w.cur_frm.doc.provider, agent: w.cur_frm.doc.agent, meeting_type: w.cur_frm.doc.meeting_type, customer_tz: w.cur_frm.doc.customer_tz });
  }, [SAFE_ROOM, tomorrow, `AUTO meeting ${RUN}`] as [string, string, string]);
  console.log('form doc (set)', set);
  await shot(page, 'b11-2-form-filled');
  const room = await f.evaluate(() => String((window as unknown as { cur_frm?: { doc: Record<string, unknown> } }).cur_frm?.doc.room || ''));
  if (room !== SAFE_ROOM) { console.log(`NOT SAVED - room is "${room}" (a room with Zoom credentials, or none)`); return; }
  const buttons = await f.locator('button:visible, .btn:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean));
  console.log('FORM BUTTONS', JSON.stringify(buttons));
  const scripts = await f.evaluate(() => { const w = window as unknown as { frappe?: { ui?: { form?: { handlers?: Record<string, unknown> } } } }; const h = (w.frappe?.ui?.form?.handlers || {})['NK Meeting'] as Record<string, unknown[]> | undefined; return h ? Object.fromEntries(Object.entries(h).map(([k, v]) => [k, (v || []).map((fn) => String(fn).slice(0, 300))])) : 'no handlers'; }).catch((e) => String(e));
  fs.writeFileSync(`${OUT}/b11-form-handlers.json`, JSON.stringify(scripts, null, 1));
  if (!process.env.SAVE_MEETING) { console.log('PHASE 1 - NOT SAVED (set SAVE_MEETING=1 to save)'); return; }
  page.on('response', async (resp) => { if (/savedocs|nk_meeting|meeting/i.test(resp.url()) && resp.request().method() === 'POST') console.log('POST', resp.status(), resp.url().replace(/^https?:\/\/[^/]+/, ''), mask((await resp.text().catch(() => '')).slice(0, 600))); });
  await f.locator('body').press('Control+s');
  await page.waitForTimeout(6000);
  await shot(page, 'b11-3-after-save');
  const after = await f.evaluate(() => { const w = window as unknown as { cur_frm?: { doc: Record<string, unknown> } }; const d = w.cur_frm?.doc || {}; return JSON.stringify({ name: d.name, __islocal: d.__islocal, owner: d.owner, agent: d.agent, room: d.room, provider: d.provider, join_url: d.join_url ? '(set)' : '(empty)', provider_meeting_id: d.custom_zoom_meeting_id || '(empty)' }); }).catch((e) => String(e));
  console.log('form doc (after save)', after);
  const msg = await f.locator('.modal.show .modal-body, .msgprint').first().innerText({ timeout: 3000 }).catch(() => '');
  console.log('message after save', JSON.stringify(mask(msg.slice(0, 300))));

  const api = await adminApi();
  const ms = (await (await api.get(`/api/resource/NK Meeting?fields=${enc(['name', 'owner', 'agent', 'start_time', 'room', 'provider', 'ticket', 'custom_state', 'creation', 'custom_zoom_meeting_id', 'join_url'])}&filters=${enc([['ticket', '=', probe.ticket], ['creation', '>=', probe.since]])}&limit_page_length=5`)).json()).data || [];
  await api.dispose();
  console.log('NK MEETINGS of the probe', mask(JSON.stringify(ms.map((x: Record<string, unknown>) => ({ ...x, join_url: x.join_url ? '(set)' : '(empty)', custom_zoom_meeting_id: x.custom_zoom_meeting_id || '(empty)' })))));
  if (!ms.length) return;
  const m = ms[0];

  // back to the Meetings page and filter
  await desk.openMeetingsList();
  for (const [label, fl] of [
    ['Created By = me', [['owner', '=', AGENT.username]]],
    ['Assignee = me', [['agent', '=', AGENT.username]]],
    ['Start on its day', [['start_time', 'Between', [m.start_time.slice(0, 10), m.start_time.slice(0, 10)]]]],
    ['Created By = me + Start on its day', [['owner', '=', AGENT.username], ['start_time', 'Between', [m.start_time.slice(0, 10), m.start_time.slice(0, 10)]]]],
    ['Ticket = probe', [['ticket', '=', probe.ticket]]],
  ] as Array<[string, Array<[string, string, unknown]>]>) {
    const res = await desk.filterMeetingsList(fl).catch((e) => ({ count: `ERR ${String(e).split('\n')[0]}`, emptyMessage: '', applied: '' }));
    const fr = page.frames().find((x) => /\/app\/nk-meeting/.test(x.url()));
    const listed = fr ? await fr.locator(`a[href*="/app/nk-meeting/${m.name}"], [data-name="${m.name}"]`).count().catch(() => -1) : -1;
    console.log(`FILTER ${label}: ${JSON.stringify(res)}; new meeting ${m.name} row drawn = ${listed}`);
    await shot(page, `b11-4-${label.replace(/[^a-z0-9]+/gi, '_')}`);
  }
  // the standard filters the Meetings list offers (what a person types into)
  const fr = page.frames().find((x) => /\/app\/nk-meeting/.test(x.url()));
  if (fr) console.log('STANDARD FILTERS', JSON.stringify(await fr.locator('.standard-filter-section .frappe-control').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-fieldname')}:${(e.querySelector('input,select') as HTMLInputElement | null)?.getAttribute('placeholder') || ''}`))));
});

test('EXPLORE-V9-B12: ticket header - where is "Actions" and what does it hold (read only)', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  page.setDefaultTimeout(T);
  const desk = new SupportDeskPageMig(page);
  await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
  const t = process.env.READ_TICKET || '13122';
  await desk.openTicketByLink(baseUrl_support_mig, t);
  await page.waitForTimeout(3000);
  const els = await page.locator('button, [role="button"]').evaluateAll((list) => list.filter((e) => (e as HTMLElement).getBoundingClientRect().top < 45 && (e as HTMLElement).offsetParent !== null)
    .map((e) => ({ tag: e.tagName, text: (e as HTMLElement).innerText.trim(), aria: e.getAttribute('aria-label'), inHeader: !!e.closest('header'), cls: (e.getAttribute('class') || '').slice(0, 60) })));
  console.log('TOP BAR CONTROLS', JSON.stringify(els));
  const actions = page.locator('button, [role="button"]').filter({ hasText: /^\s*Actions\s*$/ }).first();
  console.log('actions count', await page.locator('button, [role="button"]').filter({ hasText: /^\s*Actions\s*$/ }).count());
  await actions.click().catch((e) => console.log('click', String(e).split('\n')[0]));
  await page.waitForTimeout(1200);
  const items = await page.locator('[role="menu"] [role="menuitem"], [role="menu"] button, [role="menuitem"]').evaluateAll((l) => l.map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean));
  console.log('ACTIONS ITEMS', JSON.stringify(items));
  await shot(page, 'b12-actions-menu');
  await page.keyboard.press('Escape');
});
