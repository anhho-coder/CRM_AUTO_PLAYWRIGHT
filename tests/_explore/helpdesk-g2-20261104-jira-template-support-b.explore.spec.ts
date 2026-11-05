import { test, Page } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl_support_mig } from '@config/users.config';
import { SupportDeskPageMig } from '@pages/mig';
import { createSupportTicketAsAdmin, deleteSupportProbeAsAdmin, assignSupportTicketAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-04, support-crm-mig. Each test creates ONE probe ticket as
 * Administrator (marker AUTO-CRM-11859-G2-...) and deletes it (deny-list) in afterEach. Nothing is sent.
 * G2-B1 (L2 engineer Nam): TC-CUST-074_B - the side panel "Jira reference" input: what a bare key / a non-/browse/ URL /
 *        a /browse/ URL does on blur, what is stored, and the header action 'Jira <key>' (the jira host is aborted).
 * G2-B2 (L1 agent Giang): TC-SEC-052_B - where a personal saved reply is created and how it is inserted into a reply.
 */
test.use({ ignoreHTTPSErrors: true });
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-g2';
fs.mkdirSync(OUT, { recursive: true });
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const ADMIN = users.admin_support_mig;
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }
const probe = { name: '', subject: '', email: '', since: '' };
test.afterEach(async () => {
  if (!probe.name) return;
  console.log('cleanup', JSON.stringify(await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, { ticketName: probe.name, subject: probe.subject, contactEmail: probe.email, since: probe.since }).catch((e) => String(e))));
  probe.name = '';
});
async function makeProbe(tag: string, assignee: string) {
  probe.subject = `AUTO-CRM-11859-G2-${tag}-${RUN}`;
  probe.email = `qa.g2.${RUN}@example.com`;
  const t = await createSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, { subject: probe.subject, raisedBy: probe.email, description: '<p>Explore probe G2. Not a real customer.</p>' });
  Object.assign(probe, { name: t.name, since: t.creation });
  console.log('probe', t.name, 'assigned', await assignSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, t.name, probe.subject, assignee));
}

test('EXPLORE-G2-B1: Jira reference input + Jira action (Nam, own probe)', async ({ page, context }) => {
  test.setTimeout(6 * 60_000);
  await context.route(/jira\.example\.com/, (r) => r.abort());
  const desk = new SupportDeskPageMig(page);
  const me = users.support_l2_nam_support_mig;
  await desk.login(baseUrl_support_mig, me.username, me.password);
  await makeProbe('JIRA', me.username);
  await desk.openTicketByLink(baseUrl_support_mig, probe.name);
  for (const v of ['ITSM-123', 'https://jira.example.com/issues/ITSM-123', 'https://jira.example.com/browse/ITSM-123']) {
    const cell = page.locator('xpath=//span[@data-grace-area-trigger and normalize-space()="Jira reference"]/../following-sibling::div[1]').first();
    const input = cell.locator('input, textarea').first();
    console.log('jira cell', (await cell.evaluate((e) => e.outerHTML).catch(() => '')).slice(0, 500));
    await input.click();
    await input.fill(v);
    await input.press('Tab');
    await page.waitForTimeout(2500);
    const dlg = await desk.getShownDialogTextFF().catch(() => '');
    const toast = await page.locator('[role="status"], .toast, [data-sonner-toast]').allInnerTexts().catch(() => []);
    console.log(`SET "${v}": dialog="${dlg}" toast=${JSON.stringify(toast)}`);
    await shot(page, `b1-${v.replace(/[^a-z0-9]+/gi, '_')}`);
    if (dlg) await desk.confirmShownDialogOk().catch(() => page.keyboard.press('Escape'));
    console.log('  stored', JSON.stringify(await desk.listTicketsOverRest([['name', '=', probe.name]], ['custom_jira_url', 'custom_jira_key'], 1)));
    console.log('  input now', await input.inputValue().catch(() => '?'));
  }
  await page.reload();
  await page.waitForTimeout(3000);
  await desk.openHeaderActionsMenu().catch((e) => console.log('actions', String(e).split('\n')[0]));
  const items = await desk.getHeaderMenuItems().catch(() => []);
  console.log('ACTIONS', JSON.stringify(items));
  const header = await page.locator('header').first().innerText().catch(() => '');
  console.log('HEADER', header.replace(/\s+/g, ' ').slice(0, 400));
  await shot(page, 'b1-actions');
  const jira = page.getByText(/^Jira ITSM-123$/).first();
  console.log('Jira ITSM-123 elements', await page.getByText(/Jira ITSM-123/).count());
  const pop = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  await jira.click().catch((e) => console.log('click', String(e).split('\n')[0]));
  const p = await pop;
  console.log('POPUP url', p ? p.url() : '(no popup)');
});

test('EXPLORE-G2-B2: saved replies (Giang, own probe, nothing sent)', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const me = users.support_l1_giang_support_mig;
  await desk.login(baseUrl_support_mig, me.username, me.password);
  await makeProbe('TPL', me.username);
  await desk.openTicketByLink(baseUrl_support_mig, probe.name);
  await page.getByRole('button', { name: /^Reply$/ }).first().click().catch((e) => console.log('reply', String(e).split('\n')[0]));
  await page.waitForTimeout(2500);
  const tools = await page.locator('button').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => `${(e as HTMLElement).innerText.trim()}|${e.getAttribute('aria-label') || ''}|${e.getAttribute('title') || ''}`).filter((t) => t !== '||'));
  console.log('BUTTONS', JSON.stringify(tools).slice(0, 3000));
  await shot(page, 'b2-reply-editor');
  for (const label of [/saved repl/i, /template/i, /canned/i]) {
    const b = page.locator('button').filter({ hasText: label }).or(page.locator(`button[aria-label]`).filter({ has: page.locator(':scope') })).first();
    void b;
  }
  const cand = page.locator('button[title*="eply" i], button[aria-label*="eply" i], button[title*="emplate" i], button[aria-label*="emplate" i]');
  console.log('saved-reply-ish buttons', await cand.count(), JSON.stringify(await cand.evaluateAll((els) => els.map((e) => e.outerHTML.slice(0, 200)))));
  if (await cand.count()) {
    await cand.first().click().catch(() => {});
    await page.waitForTimeout(2000);
    console.log('DIALOG', (await page.locator('[role="dialog"]').last().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 1500));
    await shot(page, 'b2-saved-replies');
    await page.keyboard.press('Escape');
  }
  for (const route of ['/helpdesk/saved-replies', '/helpdesk/canned-responses', '/app/hd-saved-reply/new']) {
    await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    console.log(`ROUTE ${route}: url ${page.url().replace(/^https?:\/\/[^/]+/, '')} text "${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300)}"`);
    await shot(page, `b2-route-${route.replace(/[^a-z0-9]+/gi, '_')}`);
  }
});

test('EXPLORE-G2-B3: Jira reference by fill() + the Jira action (Nam, own probe)', async ({ page, context }) => {
  test.setTimeout(6 * 60_000);
  await context.route(/jira\.example\.com/, (r) => r.abort());
  const desk = new SupportDeskPageMig(page);
  const me = users.support_l2_nam_support_mig;
  await desk.login(baseUrl_support_mig, me.username, me.password);
  await makeProbe('JIRA3', me.username);
  await desk.openTicketByLink(baseUrl_support_mig, probe.name);
  for (const v of ['ITSM-123', 'https://jira.example.com/issues/ITSM-123', 'https://jira.example.com/browse/ITSM-123']) {
    const input = page.getByPlaceholder('Set Jira reference...').first();
    await input.fill(v, { timeout: 15000 });
    await input.press('Tab');
    await page.waitForTimeout(2500);
    const toast = await page.locator('[role="status"], .toast, [data-sonner-toast], li[data-sonner-toast]').allInnerTexts().catch(() => []);
    const dlg = await page.locator('[role="dialog"]').allInnerTexts().catch(() => []);
    console.log(`SET3 "${v}": toast=${JSON.stringify(toast)} dialogs=${JSON.stringify(dlg)} value now "${await input.inputValue().catch(() => '?')}"`);
    console.log('  stored', JSON.stringify(await desk.listTicketsOverRest([['name', '=', probe.name]], ['custom_jira_url', 'custom_jira_key'], 1)));
    await shot(page, `b3-${v.replace(/[^a-z0-9]+/gi, '_')}`);
    await page.waitForTimeout(4000);
  }
  await page.reload();
  await page.waitForTimeout(4000);
  console.log('HEADER3', (await page.locator('header').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400));
  console.log('Jira-ish elements', JSON.stringify(await page.locator('a, button').filter({ hasText: /Jira/ }).evaluateAll((els) => els.map((e) => `${e.tagName} "${(e as HTMLElement).innerText.trim()}" href=${e.getAttribute('href') || ''} target=${e.getAttribute('target') || ''}`))));
  await desk.openHeaderActionsMenu().catch((e) => console.log('actions', String(e).split('\n')[0]));
  console.log('ACTIONS3', JSON.stringify(await desk.getHeaderMenuItems().catch(() => [])));
  await shot(page, 'b3-actions');
  const item = page.getByRole('menuitem', { name: /Jira ITSM-123/ }).or(page.locator('[role="menu"] *').filter({ hasText: /^Jira ITSM-123$/ })).first();
  console.log('menu item count', await item.count());
  const pop = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  await item.click({ timeout: 10000 }).catch((e) => console.log('click', String(e).split('\n')[0]));
  const p = await pop;
  console.log('POPUP3 url', p ? p.url() : '(no popup)');
});

test('EXPLORE-G2-B4: reply editor toolbar + saved replies (Giang, own probe, nothing sent)', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const me = users.support_l1_giang_support_mig;
  await desk.login(baseUrl_support_mig, me.username, me.password);
  await makeProbe('TPL4', me.username);
  await desk.openTicketByLink(baseUrl_support_mig, probe.name);
  await page.getByRole('button', { name: /^Reply$/ }).first().click();
  await page.waitForTimeout(2500);
  const tools = await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror'); let root: Element | null = ed;
    for (let i = 0; i < 10 && root && root.querySelectorAll('button').length < 25; i++) root = root.parentElement;
    return root ? Array.from(root.querySelectorAll('button')).filter((b) => (b as HTMLElement).offsetParent !== null).map((b) => `${(b as HTMLElement).innerText.trim()}|${b.getAttribute('aria-label') || ''}|${b.getAttribute('title') || ''}`) : [];
  });
  console.log('TOOLBAR', JSON.stringify(tools));
  await shot(page, 'b4-editor');
  for (const route of ['/helpdesk/saved-replies', '/app/hd-saved-reply', '/app/hd-saved-reply/new']) {
    await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    console.log(`ROUTE4 ${route}: url ${page.url().replace(/^https?:\/\/[^/]+/, '')} text "${(await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}"`);
    await shot(page, `b4-route-${route.replace(/[^a-z0-9]+/gi, '_')}`);
  }
});

test('EXPLORE-G2-B5: save a personal saved reply, insert it (Giang, own probe + own saved reply, nothing sent)', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const { deleteRunRowsByMarkerAsAdmin } = await import('@helpers/support-desk-cleanup.helper');
  const desk = new SupportDeskPageMig(page);
  const me = users.support_l1_giang_support_mig;
  const title = `QA code test AUTO-G2-${RUN}`;
  await desk.login(baseUrl_support_mig, me.username, me.password);
  await makeProbe('TPL5', me.username);
  try {
    await desk.openTicketByLink(baseUrl_support_mig, probe.name);
    await page.getByRole('button', { name: /^Reply$/ }).first().click();
    await page.waitForTimeout(2000);
    const ed = page.locator('.ProseMirror').first();
    console.log('editor before', JSON.stringify(await ed.innerText()));
    await ed.click({ timeout: 10000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText('Hello {{ frappe.session.user }} - {{ 7*7 }}');
    console.log('editor after insertText', JSON.stringify(await ed.innerText()));
    page.on('dialog', async (dl) => { console.log(`NATIVE DIALOG ${dl.type()}: "${dl.message()}" default "${dl.defaultValue()}"`); await dl.accept(title).catch(() => {}); });
    // the button's accessible name is "Discard" (aria-label) although it reads "Save as template" (measured 2026-11-04)
    await page.locator('button').filter({ hasText: /^\s*Save as template\s*$/ }).first().click({ timeout: 10000 });
    await page.waitForTimeout(2000);
    await shot(page, 'b5-after-prompt');
    console.log('BODY after prompt', JSON.stringify((await page.locator('body').innerText({ timeout: 5000 }).catch((e) => `ERR ${e}`)).replace(/\s+/g, ' ').slice(0, 600)));
    return;
    console.log('SAVE DIALOG', JSON.stringify((await page.locator('[role="dialog"]').last().innerText().catch(() => '')).slice(0, 800)));
    console.log('dialog inputs', JSON.stringify(await page.locator('[role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea').evaluateAll((els) => els.map((e) => `${e.tagName}:${e.getAttribute('placeholder') || ''}:${(e as HTMLInputElement).value}`))));
    await shot(page, 'b5-save-dialog');
    const titleInput = page.locator('[role="dialog"] input[type="text"], [role="dialog"] input:not([type])').first();
    if (await titleInput.count()) await titleInput.fill(title);
    console.log('dialog buttons', JSON.stringify(await page.locator('[role="dialog"] button').allInnerTexts()));
    await page.locator('[role="dialog"] button').filter({ hasText: /^(Save|Create)$/ }).last().click({ timeout: 10000 }).catch((e) => console.log('save', String(e).split('\n')[0]));
    await page.waitForTimeout(2500);
    console.log('toasts', JSON.stringify(await page.locator('[data-sonner-toast], [role="status"]').allInnerTexts().catch(() => [])));
    const api = await (await import('@playwright/test')).request.newContext({ baseURL: baseUrl_support_mig.replace(/\/$/, ''), ignoreHTTPSErrors: true });
    await api.post('/api/method/login', { data: { usr: ADMIN.username, pwd: ADMIN.password } });
    const sr = await (await api.get(`/api/resource/HD Saved Reply?fields=${encodeURIComponent(JSON.stringify(['name', 'title', 'scope', 'owner', 'message']))}&filters=${encodeURIComponent(JSON.stringify([['creation', '>=', probe.since]]))}&limit_page_length=5`)).json();
    console.log('SAVED REPLIES since the probe', JSON.stringify(sr.data));
    await api.dispose();
    await page.locator('button').filter({ hasText: /^\s*Discard\s*$/ }).last().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /^Reply$/ }).first().click({ timeout: 10000 });
    await page.waitForTimeout(2000);
    const unl = page.locator('xpath=//button[normalize-space(.)="" and not(@aria-label) and not(@title)]');
    const n = await unl.count();
    console.log('unlabeled buttons', n);
    for (let i = 0; i < n; i++) {
      const b = unl.nth(i);
      if (!(await b.isVisible().catch(() => false))) continue;
      console.log(`unlabeled #${i}`, (await b.evaluate((e) => e.outerHTML)).slice(0, 300));
      await b.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const pop = await page.locator('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]').allInnerTexts().catch(() => []);
      console.log(`  -> popups ${JSON.stringify(pop).slice(0, 800)}`);
      await shot(page, `b5-unlabeled-${i}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }
  } finally {
    console.log('saved reply cleanup', JSON.stringify(await deleteRunRowsByMarkerAsAdmin(baseUrl_support_mig, ADMIN, 'HD Saved Reply', 'title', `AUTO-G2-${RUN}`, 2).catch((e) => String(e))));
  }
});

test('EXPLORE-G2-B6: where the personal template lives + insert it (Giang, own probe, nothing sent)', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const me = users.support_l1_giang_support_mig;
  const title = `QA code test AUTO-G2-${RUN}`;
  await desk.login(baseUrl_support_mig, me.username, me.password);
  await makeProbe('TPL6', me.username);
  await desk.openTicketByLink(baseUrl_support_mig, probe.name);
  page.on('dialog', async (dl) => { console.log(`NATIVE ${dl.type()}: "${dl.message()}"`); await dl.accept(title).catch(() => {}); });
  const calls: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\//.test(r.url())) calls.push(`${r.url().replace(/^https?:\/\/[^/]+/, '')} ${(r.postData() || '').slice(0, 200)}`); });
  await page.getByRole('button', { name: /^Reply$/ }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  const ed = page.locator('.ProseMirror').first();
  await ed.click({ timeout: 10000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText('Hello {{ frappe.session.user }} - {{ 7*7 }}');
  await page.locator('button').filter({ hasText: /^\s*Save as template\s*$/ }).first().click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  console.log('POST calls', JSON.stringify(calls).slice(0, 1500));
  console.log('localStorage keys', JSON.stringify(await page.evaluate(() => Object.keys(localStorage).filter((k) => /templ|repl|saved/i.test(k)).map((k) => `${k}=${(localStorage.getItem(k) || '').slice(0, 200)}`))));
  await page.locator('button').filter({ hasText: /^\s*Discard\s*$/ }).last().click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /^Reply$/ }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  const icons = page.locator('xpath=//button[normalize-space(.)="" and not(@aria-label) and not(@title)][.//*[name()="svg"]]');
  const n = await icons.count();
  for (let i = 0; i < n; i++) {
    const b = icons.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    const box = await b.boundingBox();
    if (!box || box.y < 900) continue;   // only the reply editor's bottom toolbar
    calls.length = 0;
    await b.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const pops = await page.locator('[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]').allInnerTexts().catch(() => []);
    console.log(`ICON #${i} at x=${Math.round(box.x)}: popups ${JSON.stringify(pops).slice(0, 700)} | calls ${JSON.stringify(calls).slice(0, 300)}`);
    await shot(page, `b6-icon-${i}`);
    const pick = page.getByText(title, { exact: false }).first();
    if (await pick.count()) {
      await pick.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
      console.log('EDITOR after pick', JSON.stringify(await ed.innerText().catch(() => '')));
      await shot(page, 'b6-after-pick');
      break;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
  await page.locator('button').filter({ hasText: /^\s*Discard\s*$/ }).last().click({ timeout: 10000 }).catch(() => {});
});

test('EXPLORE-G2-B7: save_as_template response (Giang, own probe, nothing sent)', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const me = users.support_l1_giang_support_mig;
  const title = `QA code test AUTO-G2-${RUN}`;
  await desk.login(baseUrl_support_mig, me.username, me.password);
  await makeProbe('TPL7', me.username);
  await desk.openTicketByLink(baseUrl_support_mig, probe.name);
  page.on('dialog', async (dl) => { console.log(`NATIVE ${dl.type()}: "${dl.message()}"`); await dl.accept(title).catch(() => {}); });
  const calls: string[] = [];
  page.on('response', async (r) => { if (/save_as_template|saved_repl/.test(r.url())) console.log(`RESPONSE ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')} ${(await r.text().catch(() => '')).slice(0, 600)}`); });
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\//.test(r.url())) calls.push(`${r.url().replace(/^https?:\/\/[^/]+/, '')} ${(r.postData() || '').slice(0, 200)}`); });
  await page.getByRole('button', { name: /^Reply$/ }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  const ed = page.locator('.ProseMirror').first();
  await ed.click({ timeout: 10000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText('Hello {{ frappe.session.user }} - {{ 7*7 }}');
  await page.locator('button').filter({ hasText: /^\s*Save as template\s*$/ }).first().click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  console.log('POST calls', JSON.stringify(calls).slice(0, 1500));
  console.log('localStorage keys', JSON.stringify(await page.evaluate(() => Object.keys(localStorage).filter((k) => /templ|repl|saved/i.test(k)).map((k) => `${k}=${(localStorage.getItem(k) || '').slice(0, 200)}`))));
});

test('EXPLORE-G2-B8: the saved-replies picker in the reply toolbar (Giang, own probe + own saved reply, nothing sent)', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const me = users.support_l1_giang_support_mig;
  const title = `QA code test AUTO-G2-${RUN}`;
  await desk.login(baseUrl_support_mig, me.username, me.password);
  await makeProbe('TPL8', me.username);
  try {
    await desk.openTicketByLink(baseUrl_support_mig, probe.name);
    page.on('dialog', async (dl) => { await dl.accept(title).catch(() => {}); });
    await page.getByRole('button', { name: /^Reply$/ }).first().click({ timeout: 10000 });
    await page.waitForTimeout(2000);
    const ed = page.locator('.ProseMirror').first();
    await ed.click({ timeout: 10000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText('Hello {{ frappe.session.user }} - {{ 7*7 }}');
    await page.locator('button').filter({ hasText: /^\s*Save as template\s*$/ }).first().click({ timeout: 10000 });
    await page.waitForTimeout(2500);
    await page.locator('button').filter({ hasText: /^\s*Discard\s*$/ }).last().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /^Reply$/ }).first().click({ timeout: 10000 });
    await page.waitForTimeout(2000);
    const save = page.locator('button').filter({ hasText: /^\s*Save as template\s*$/ }).first();
    const sb = await save.boundingBox();
    const btns = await page.locator('button').evaluateAll((els, y) => els.map((e, i) => ({ i, r: e.getBoundingClientRect(), html: e.outerHTML.slice(0, 160) })).filter((x) => Math.abs(x.r.y - (y as number)) < 20 && x.r.x < 400).map((x) => ({ i: x.i, x: Math.round(x.r.x), html: x.html })), sb ? sb.y : 0);
    console.log('LEFT TOOLBAR', JSON.stringify(btns));
    for (const b of btns) {
      await page.locator('button').nth(b.i).click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const d = await page.locator('[role="dialog"]').allInnerTexts().catch(() => []);
      console.log(`BTN x=${b.x}: dialogs ${JSON.stringify(d).slice(0, 700)}`);
      await shot(page, `b8-btn-${b.x}`);
      const pick = page.locator('[role="dialog"]').getByText(title).first();
      if (await pick.count()) {
        await pick.click({ timeout: 5000 });
        await page.waitForTimeout(1500);
        console.log('EDITOR after pick', JSON.stringify(await ed.innerText().catch(() => '')), 'HTML', (await ed.innerHTML().catch(() => '')).slice(0, 300));
        await shot(page, 'b8-after-pick');
        break;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }
    await page.locator('button').filter({ hasText: /^\s*Discard\s*$/ }).last().click({ timeout: 10000 }).catch(() => {});
  } finally {
    const { request } = await import('@playwright/test');
    const api = await request.newContext({ baseURL: baseUrl_support_mig.replace(/\/$/, ''), ignoreHTTPSErrors: true });
    await api.post('/api/method/login', { data: { usr: me.username, pwd: me.password } });
    const d = await api.delete(`/api/resource/HD Saved Reply/${encodeURIComponent(title)}`);
    console.log(`saved reply "${title}" deleted as its owner: HTTP ${d.status()}`);
    await api.dispose();
  }
});
