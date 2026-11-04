import { test, Page } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { SupportDeskPageMig } from '@pages/mig/SupportDeskPageMig';

/**
 * EXPLORE (read-only, kept per the never-delete-explore rule) - 2026-11-03. Grounds the TCs written for Confluence 231246777
 * v9 (CRM-13842/13843/13845/13846 answers) on support-crm-mig: Filters combination (IS-CRM-UI-0014-1), New Ticket required
 * markers (IS-CRM-UI-0016 / FUNC-0383), Customer picker content (IS-CRM-UI-0017), Meetings list (FUNC-0289-1) and the meeting
 * report on a ticket (FUNC-0289-2). Nothing is submitted, saved or chosen in a way the list state keeps.
 */
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-v9';
test.use({ ignoreHTTPSErrors: true });

async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }
async function rest(page: Page, url: string) {
  return page.evaluate(async (u) => { const r = await fetch(u, { headers: { Accept: 'application/json' } }); return { status: r.status, body: (await r.text()).slice(0, 4000) }; }, url);
}
const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));

test('EXPLORE-V9-B1: Filters combination, New Ticket form, Customer picker (Giang)', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const A = users.support_l1_giang_support_mig;
  await desk.login(baseUrl_support_mig, A.username, A.password);

  // ---- Filters: choose Open Tickets, then Review needed, and read what stays active
  await desk.openAllTicketsFromSidebar();
  console.log('URL0', page.url());
  await desk.chooseFiltersMenuEntry('Open Tickets');
  await page.waitForTimeout(2500);
  console.log('URL after Open Tickets', page.url());
  await desk.chooseFiltersMenuEntry('Review needed');
  await page.waitForTimeout(2500);
  console.log('URL after Review needed', page.url());
  console.log('counter', JSON.stringify(await desk.getListCounter().catch((e) => String(e))));
  await page.locator('button:has-text("Filters")').first().click();
  await page.waitForTimeout(1200);
  const items = await page.locator('[role="menu"] [role="menuitem"]').evaluateAll((els) => els.map((e) => ({ t: (e as HTMLElement).innerText.trim(), html: e.outerHTML.slice(0, 400) })));
  for (const i of items.slice(0, 14)) console.log('MENUITEM', JSON.stringify(i));
  await shot(page, 'b1-filters-after-two');
  await page.keyboard.press('Escape');
  for (const f of [[['status', '!=', 'Closed']], [['custom_review_needed', '=', 1]], [['status', '!=', 'Closed'], ['custom_review_needed', '=', 1]]]) {
    const r = await rest(page, `/api/method/frappe.client.get_count?doctype=HD%20Ticket&filters=${enc(f)}`);
    console.log('COUNT', JSON.stringify(f), r.status, r.body);
  }
  // back to the default entry so nothing odd is left (the Filters entries are public views, not the saved default)
  await desk.chooseFiltersMenuEntry('Open Tickets').catch(() => {});

  // ---- New Ticket form
  await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/helpdesk/tickets/new`);
  await page.locator('input[placeholder="A short description"]').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(2000);
  await shot(page, 'b1-new-ticket-form');
  const form = await page.evaluate(() => {
    const out: Array<Record<string, string>> = [];
    document.querySelectorAll('input, textarea, [contenteditable="true"]').forEach((el) => {
      const e = el as HTMLElement;
      let box: HTMLElement | null = e; let label = '';
      for (let k = 0; k < 6 && box && !label; k++) { box = box.parentElement; const l = box?.querySelector('label, .text-ink-gray-5, span'); if (l && (l as HTMLElement).innerText.trim()) label = (l as HTMLElement).innerText.trim(); }
      out.push({ tag: e.tagName, ph: e.getAttribute('placeholder') || '', role: e.getAttribute('role') || '', req: String(e.hasAttribute('required')), label: label.slice(0, 80), boxHtml: (box?.outerHTML || '').slice(0, 600) });
    });
    return out;
  });
  for (const f of form) console.log('FIELD', JSON.stringify(f));
  const asterisks = await page.evaluate(() => Array.from(document.querySelectorAll('*')).filter((e) => e.children.length === 0 && /^\s*\*\s*$/.test((e as HTMLElement).innerText || '')).map((e) => ({ html: e.outerHTML.slice(0, 200), parent: (e.parentElement?.innerText || '').trim().slice(0, 80) })));
  console.log('ASTERISKS', JSON.stringify(asterisks));
  // Submit state with Subject + Raised By and NO description
  await page.locator('input[placeholder="Customer e-mail"]').fill('probe.v9.nosubmit@example.com');
  await page.locator('input[placeholder="A short description"]').fill('V9 explore - never submitted');
  await page.waitForTimeout(800);
  console.log('SUBMIT disabled (subject + raised by, no description):', await page.locator('button[aria-label="Submit"]').isDisabled());
  await shot(page, 'b1-new-ticket-no-description');

  // ---- Customer picker
  const cust = page.locator('input[role="combobox"][placeholder="Customer company"]').first();
  await cust.click();
  await page.waitForTimeout(1500);
  let opts = await page.locator('[role="option"]').evaluateAll((els) => els.slice(0, 6).map((e) => ({ t: (e as HTMLElement).innerText.trim(), html: e.outerHTML.slice(0, 500) })));
  console.log('CUSTOMER OPTIONS (empty text)', JSON.stringify(opts));
  const sample = await rest(page, `/api/resource/HD Customer?fields=${enc(['name', 'domain', 'custom_country'])}&filters=${enc([['domain', 'like', '%.%']])}&limit_page_length=3`);
  console.log('HD CUSTOMER SAMPLE (as Giang)', sample.status, sample.body);
  await cust.fill('backup');
  await page.waitForTimeout(2000);
  opts = await page.locator('[role="option"]').evaluateAll((els) => els.slice(0, 6).map((e) => ({ t: (e as HTMLElement).innerText.trim(), html: e.outerHTML.slice(0, 500) })));
  console.log('CUSTOMER OPTIONS ("backup")', JSON.stringify(opts));
  await shot(page, 'b1-customer-options-name');
  let dom = '';
  try { const s = JSON.parse(sample.body).data || []; dom = s[0]?.domain || ''; } catch { /* */ }
  if (dom) {
    await cust.fill(dom);
    await page.waitForTimeout(2000);
    opts = await page.locator('[role="option"]').evaluateAll((els) => els.slice(0, 6).map((e) => ({ t: (e as HTMLElement).innerText.trim(), html: '' })));
    console.log(`CUSTOMER OPTIONS (domain "${dom}")`, JSON.stringify(opts));
    await shot(page, 'b1-customer-options-domain');
  }
  await page.keyboard.press('Escape');
  // Contact picker
  const placeholders = await page.locator('input').evaluateAll((els) => els.map((e) => e.getAttribute('placeholder') || '').filter(Boolean));
  console.log('PLACEHOLDERS', JSON.stringify(placeholders));
  // leave the page without submitting
  await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/helpdesk/tickets`);
});

test('EXPLORE-V9-B3: ticket meetings section + Customer picker by domain (Nam)', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const A = users.support_l2_nam_support_mig;
  await desk.login(baseUrl_support_mig, A.username, A.password);
  const sample = await rest(page, `/api/resource/HD Customer?fields=${enc(['name', 'domain', 'country'])}&filters=${enc([['domain', 'like', '%.%'], ['country', 'is', 'set']])}&order_by=modified%20desc&limit_page_length=3`);
  console.log('HD CUSTOMER SAMPLE (as Nam)', sample.status, sample.body);
  // ticket 12928 carries a logged migrated meeting (bonus, 2026-09-15)
  await desk.openTicketByLink(baseUrl_support_mig, '12928');
  await page.waitForTimeout(3500);
  console.log('T12928 URL', page.url());
  const meetBtns = await page.locator('button, a').filter({ hasText: /Meeting/ }).evaluateAll((els) => els.map((e) => ({ t: (e as HTMLElement).innerText.trim(), tag: e.tagName, html: e.outerHTML.slice(0, 250) })));
  console.log('T12928 MEETING CONTROLS', JSON.stringify(meetBtns));
  await shot(page, 'b3-ticket-12928');
  const panel = page.locator('text=/^Meetings/').first();
  if (await panel.isVisible().catch(() => false)) {
    await panel.click(); await page.waitForTimeout(2500);
    await shot(page, 'b3-ticket-12928-meetings-open');
    const txt = await page.locator('body').innerText();
    const i = txt.indexOf('Meetings');
    console.log('T12928 AROUND MEETINGS', txt.slice(Math.max(0, i - 200), i + 1500).replace(/\n+/g, ' | '));
  }
  // Customer picker on New Ticket: search by a domain
  await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/helpdesk/tickets/new`);
  await page.locator('input[placeholder="A short description"]').waitFor({ state: 'visible', timeout: 60_000 });
  let dom = ''; let cname = '';
  try { const s = JSON.parse(sample.body).data || []; dom = s[0]?.domain || ''; cname = s[0]?.name || ''; } catch { /* */ }
  const cust = page.locator('input[role="combobox"][placeholder="Customer company"]').first();
  for (const q of [cname.split(/\s+/)[0], dom]) {
    if (!q) continue;
    await cust.click(); await cust.fill(q); await page.waitForTimeout(2500);
    const opts = await page.locator('[role="option"]').evaluateAll((els) => els.slice(0, 8).map((e) => (e as HTMLElement).innerText.trim()));
    console.log(`CUSTOMER OPTIONS ("${q}") for company "${cname}" / domain "${dom}"`, JSON.stringify(opts));
    await shot(page, `b3-customer-${q.replace(/[^a-z0-9]/gi, '_')}`);
    await page.keyboard.press('Escape');
  }
  await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/helpdesk/tickets`);
});

test('EXPLORE-V9-B4: the Meetings row of the ticket side panel (Nam)', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const A = users.support_l2_nam_support_mig;
  await desk.login(baseUrl_support_mig, A.username, A.password);
  await desk.openTicketByLink(baseUrl_support_mig, '12928');
  await page.waitForTimeout(3500);
  // side-panel elements whose own text mentions Meeting (the left sidebar is excluded by its aria-label button)
  const hits = await page.evaluate(() => Array.from(document.querySelectorAll('aside *, div *')).filter((e) => {
    const el = e as HTMLElement; const t = (el.innerText || '').trim();
    return el.children.length <= 2 && /Meeting/i.test(t) && t.length < 80 && !el.closest('button[aria-label="Meetings"]');
  }).slice(0, 15).map((e) => ({ t: (e as HTMLElement).innerText.trim(), tag: e.tagName, cls: String((e as HTMLElement).className).slice(0, 80) })));
  console.log('B4 MEETING ELEMENTS', JSON.stringify(hits));
  console.log('B4 side-panel Meetings value:', JSON.stringify(await desk.getSidePanelRowValue('Meetings').catch((e) => String(e))));
  const box = page.locator('div.flex.gap-2.leading-5.items-center').filter({ has: page.locator('div.shrink-0', { hasText: /^Meetings$/ }) }).first();
  console.log('B4 Meetings row html:', (await box.innerHTML().catch(() => '')).slice(0, 1500));
  await box.scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, 'b4-meetings-panel-row');
  const row = page.locator('text=/^Meetings \\(\\d+\\)/').first();
  console.log('B4 Meetings (n) visible:', await row.isVisible().catch(() => false));
  if (await row.count()) {
    await row.scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, 'b4-meetings-row');
    await row.click().catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, 'b4-meetings-row-open');
    const lines = (await page.locator('body').innerText()).split('\n').map((l) => l.trim()).filter((l) => /meeting|logged|bonus|cancel|start|end|feedback|done|regular/i.test(l) && l.length < 160);
    console.log('B4 MEETING LINES', JSON.stringify(lines.slice(0, 40)));
    const link = page.locator('a[href*="nk-meeting"], a[href*="/app/nk-meeting"]').first();
    console.log('B4 meeting link:', await link.getAttribute('href').catch(() => '(none)'));
  }
});

test('EXPLORE-V9-B5: Meetings list frame, Assignee filter, a meeting form (Nam)', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const A = users.support_l2_nam_support_mig;
  await desk.login(baseUrl_support_mig, A.username, A.password);
  await page.locator('button[aria-label="Meetings"]').first().click();
  await page.waitForTimeout(5000);
  for (const f of page.frames()) console.log('B5 FRAME', f.url());
  const fr = page.frames().find((f) => /\/app\/nk-meeting/.test(f.url()));
  if (!fr) { console.log('B5 no nk-meeting frame'); return; }
  console.log('B5 frame count text:', await fr.locator('.list-count, .level-right .text-muted').first().innerText().catch(() => '?'));
  const asg = fr.locator('.standard-filter-section [data-fieldname="agent"] input').first();
  console.log('B5 assignee filter visible:', await asg.isVisible().catch(() => false));
  await asg.fill('nam.pham@nakivo.com').catch(() => {});
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(3000);
  console.log('B5 after Assignee=nam count text:', await fr.locator('.list-count').first().innerText().catch(() => '?'), '| empty msg:', await fr.locator('.no-result, .msg-box').first().innerText().catch(() => ''));
  await shot(page, 'b5-meetings-assignee-nam');
  await asg.fill('').catch(() => {});
  await page.waitForTimeout(2500);
  // open a logged meeting (12928's) in the frame
  await fr.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/app/nk-meeting/cjcse9mooc`).catch(() => {});
  await page.waitForTimeout(4000);
  const labels = await fr.locator('.frappe-control[data-fieldname]').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => `${e.getAttribute('data-fieldname')}=${((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60)}`));
  console.log('B5 MEETING FORM FIELDS', JSON.stringify(labels.slice(0, 60)));
  await shot(page, 'b5-meeting-form');
});

test('EXPLORE-V9-B6: how a ticked Filters entry is drawn (Giang)', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const A = users.support_l1_giang_support_mig;
  await desk.login(baseUrl_support_mig, A.username, A.password);
  await desk.openAllTicketsFromSidebar();
  await desk.chooseFiltersMenuEntry('Open Tickets');
  await desk.openFiltersMenuGroups();
  for (const label of ['Open Tickets', 'Closed Tickets']) {
    const html = await page.locator('[role="menu"] [role="menuitem"]').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).first().evaluate((e) => ({ attrs: Array.from(e.attributes).map((a) => `${a.name}=${a.value}`).filter((a) => !a.startsWith('class=')), inner: e.innerHTML.slice(0, 900) }));
    console.log(`B6 ${label}`, JSON.stringify(html));
  }
  await desk.closeOpenMenu();
  console.log('B6 counter', JSON.stringify(await desk.getListCounter()), 'kanban', JSON.stringify(await desk.getKanbanTotal()));
});

test('EXPLORE-V9-B2: Meetings menu and a ticket meeting report (Nam, L2)', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const A = users.support_l2_nam_support_mig;
  await desk.login(baseUrl_support_mig, A.username, A.password);
  const side = await page.locator('nav button[aria-label], aside button[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  console.log('SIDEBAR', JSON.stringify(side));
  const meet = page.locator('button[aria-label="Meetings"]').first();
  if (await meet.isVisible().catch(() => false)) {
    await meet.click();
    await page.waitForTimeout(4000);
    console.log('MEETINGS URL', page.url());
    console.log('MEETINGS TEXT', (await page.locator('main, body').first().innerText()).slice(0, 2500));
    const btns = await page.locator('button').evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.trim() || e.getAttribute('aria-label') || '').filter(Boolean));
    console.log('MEETINGS BUTTONS', JSON.stringify(btns.slice(0, 60)));
    await shot(page, 'b2-meetings-list');
    const f = page.locator('button:has-text("Filter")').first();
    if (await f.isVisible().catch(() => false)) {
      await f.click(); await page.waitForTimeout(1200);
      console.log('MEETINGS FILTER POPUP', (await page.locator('[role="menu"], [role="dialog"], [data-reka-popper-content-wrapper]').last().innerText().catch(() => '')).slice(0, 1500));
      await shot(page, 'b2-meetings-filter'); await page.keyboard.press('Escape');
    }
  }
  const meetings = await rest(page, `/api/resource/NK Meeting?fields=${enc(['name', 'ticket', 'agent', 'owner', 'start_time', 'custom_state', 'logged'])}&order_by=start_time%20desc&limit_page_length=5`);
  console.log('NK MEETING as Nam', meetings.status, meetings.body);
  const att = await rest(page, `/api/resource/NK Meeting?fields=${enc(['name', 'ticket', 'start_time', 'custom_attendees.user', 'custom_attendees.email'])}&filters=${enc([['start_time', '>=', '2026-10-01']])}&limit_page_length=5`);
  console.log('NK MEETING attendees', att.status, att.body);

  // ticket 11149 carries a logged migrated meeting (Regular, 2026-10-15)
  await desk.openTicketByLink(baseUrl_support_mig, '11149');
  await page.waitForTimeout(3000);
  const mbtn = page.locator('button:has-text("Meetings")').first();
  console.log('TICKET 11149 Meetings button:', await mbtn.innerText().catch(() => '(none)'));
  await shot(page, 'b2-ticket-11149');
  if (await mbtn.isVisible().catch(() => false)) {
    await mbtn.click(); await page.waitForTimeout(2500);
    console.log('TICKET 11149 MEETINGS PANEL', (await page.locator('body').innerText()).split('\n').filter((l) => l.trim()).slice(-60).join(' | ').slice(0, 3000));
    await shot(page, 'b2-ticket-11149-meetings');
  }
});
