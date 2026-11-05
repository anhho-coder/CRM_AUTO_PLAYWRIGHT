import { test, Page } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl_support_mig } from '@config/users.config';
import { SupportDeskPageMig } from '@pages/mig';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-04, support-crm-mig (Frappe Helpdesk), READ ONLY except the
 * agent's own saved list state, which is snapshotted and restored.
 * G1-B1 (L2 engineer Nam): TC-UI-015_B - a migrated closed ticket with Jira reference and CC: the side panel's sections
 *        (headings, collapsed or not) and rows in screen order.
 * G1-B2 (L1 agent Giang): TC-UI-046_B / TC-UI-050_B / TC-UI-010_B - the four Filters entries (counter, first rows, the
 *        preset view filters), the 'Search (All)' box for a word and for a number, and what clearing the box does.
 */
test.use({ ignoreHTTPSErrors: true });
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-g1';
fs.mkdirSync(OUT, { recursive: true });
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }

test('EXPLORE-G1-B1: side panel sections of a migrated closed ticket (Nam, read only)', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const desk = new SupportDeskPageMig(page);
  await desk.login(baseUrl_support_mig, users.support_l2_nam_support_mig.username, users.support_l2_nam_support_mig.password);
  const rows = await desk.listTicketsOverRest([['status', '=', 'Closed'], ['custom_odoo_id', 'is', 'set'], ['custom_jira_url', 'is', 'set'], ['custom_cc', 'is', 'set'], ['creation', '<', '2026-01-23']], ['name', 'subject', 'custom_odoo_id', 'custom_jira_url', 'custom_cc', 'ticket_type', 'creation'], 10);
  console.log('candidates', JSON.stringify(rows));
  const t = rows[0];
  if (!t) return;
  await desk.openTicketByLink(baseUrl_support_mig, String(t.name));
  await page.waitForTimeout(3000);
  await shot(page, 'b1-panel-top');
  const dump = await page.evaluate(() => {
    const caps = Array.from(document.querySelectorAll('span[data-grace-area-trigger]')) as HTMLElement[];
    // the panel = the closest common ancestor of the captions
    let panel: HTMLElement | null = caps[0] || null;
    while (panel && !caps.every((c) => panel!.contains(c))) panel = panel.parentElement;
    const heads = panel ? (Array.from(panel.querySelectorAll('button, h1, h2, h3, h4, [role="button"], .font-semibold, .font-medium')) as HTMLElement[])
      .filter((e) => e.offsetParent !== null && (e.innerText || '').trim().length > 0 && (e.innerText || '').trim().length < 40 && !e.closest('span[data-grace-area-trigger]'))
      .map((e) => ({ tag: e.tagName, cls: e.className.slice(0, 60), text: (e.innerText || '').trim(), top: Math.round(e.getBoundingClientRect().top), expanded: e.getAttribute('aria-expanded') })) : [];
    return { panelCls: panel?.className.slice(0, 120), html: panel ? panel.outerHTML.slice(0, 60000) : '', heads, caps: caps.map((c) => ({ text: (c.textContent || '').trim(), top: Math.round(c.getBoundingClientRect().top), vis: c.getBoundingClientRect().height > 0 })) };
  });
  fs.writeFileSync(`${OUT}/b1-panel.html`, dump.html);
  console.log('PANEL', dump.panelCls);
  console.log('HEADS', JSON.stringify(dump.heads).slice(0, 4000));
  console.log('CAPTIONS', JSON.stringify(dump.caps).slice(0, 5000));
  console.log('ROWS (getSidePanelRows)', JSON.stringify(await desk.getSidePanelRows()).slice(0, 5000));
});

test('EXPLORE-G1-B3: side panel container + section headings (Nam, read only)', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const desk = new SupportDeskPageMig(page);
  await desk.login(baseUrl_support_mig, users.support_l2_nam_support_mig.username, users.support_l2_nam_support_mig.password);
  await desk.openTicketByLink(baseUrl_support_mig, '2586');
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const capOf = (t: string) => (Array.from(document.querySelectorAll('span[data-grace-area-trigger]')) as HTMLElement[]).find((c) => (c.textContent || '').trim() === t);
    const a = capOf('Assignee'); const z = capOf('Severity Level');
    let panel: HTMLElement | null = a || null;
    while (panel && !(z && panel.contains(z))) panel = panel.parentElement;
    // climb while the ancestor does not contain the conversation
    while (panel && panel.parentElement && !panel.parentElement.querySelector('.ProseMirror, [class*="conversation"]') && panel.parentElement.getBoundingClientRect().width < 700) panel = panel.parentElement;
    const heads = panel ? (Array.from(panel.querySelectorAll('*')) as HTMLElement[]).filter((e) => e.children.length <= 2 && ['Ticket', 'Customer', 'Classification', 'Details', 'Overview'].includes((e.innerText || '').trim()) && !e.closest('span[data-grace-area-trigger]'))
      .map((e) => ({ tag: e.tagName, cls: e.className.slice(0, 90), text: (e.innerText || '').trim(), top: Math.round(e.getBoundingClientRect().top), parent: (e.parentElement?.outerHTML || '').slice(0, 400) })) : [];
    return { panelTag: panel?.tagName, panelCls: panel?.className.slice(0, 160), width: panel ? Math.round(panel.getBoundingClientRect().width) : 0, left: panel ? Math.round(panel.getBoundingClientRect().left) : 0, html: panel ? panel.outerHTML.slice(0, 120000) : '', heads };
  });
  fs.writeFileSync(`${OUT}/b3-panel.html`, r.html);
  console.log('PANEL3', r.panelTag, r.panelCls, 'width', r.width, 'left', r.left, 'html', r.html.length);
  console.log('HEADS3', JSON.stringify(r.heads).slice(0, 5000));
  await shot(page, 'b3-panel');
});

test('EXPLORE-G1-B2: Filters entries, Search (All) word / number (Giang, saved list state restored)', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  const desk = new SupportDeskPageMig(page);
  const me = users.support_l1_giang_support_mig;
  await desk.login(baseUrl_support_mig, me.username, me.password);
  await desk.openAllTicketsFromSidebar();
  const saved = await desk.readMyDefaultTicketView(me.username);
  console.log('saved view', JSON.stringify(saved));
  try {
    console.log('counter at open', JSON.stringify(await desk.getListCounter()));
    for (const e of ['My Tickets', 'Unassigned Tickets', 'Open Tickets', 'Closed Tickets']) {
      await desk.chooseFiltersMenuEntry(e);
      await page.waitForTimeout(1500);
      const c = await desk.getListCounter();
      const names = await desk.getListTicketNamesOrNone(5);
      console.log(`FILTER ${e}: url ${page.url().replace(/^https?:\/\/[^/]+/, '')} counter ${JSON.stringify(c)} first ${JSON.stringify(names)}`);
      await shot(page, `b2-filter-${e.replace(/\s+/g, '_')}`);
    }
    for (const v of ['NK-VIEW-MY-TICKETS', 'NK-VIEW-UNASSIGNED-TICKETS', 'NK-VIEW-OPEN-TICKETS', 'NK-VIEW-CLOSED-TICKETS']) {
      console.log(`preset view ${v} filters`, JSON.stringify(await desk.readHdViewFilterList(v).catch((err) => String(err).slice(0, 160))));
    }
    await desk.openAllTicketsFromSidebar();
    for (const text of ['QA-UI', '13111']) {
      await desk.searchListAll(text);
      await page.waitForTimeout(1500);
      console.log(`SEARCH ALL "${text}": counter ${JSON.stringify(await desk.getListCounter())} names ${JSON.stringify(await desk.getListTicketNamesOrNone(6))}`);
      await shot(page, `b2-search-${text}`);
    }
    const box = page.getByPlaceholder(/Search \(All\)|All/).first();
    console.log('search box count', await box.count(), 'value', await box.inputValue().catch(() => '?'));
    await box.fill('').catch(() => {});
    await box.press('Enter').catch(() => {});
    await page.waitForTimeout(2000);
    console.log('after clearing the box', JSON.stringify(await desk.getListCounter()), JSON.stringify(await desk.getListTicketNamesOrNone(3)));
    console.log('view after clearing', JSON.stringify(await desk.readMyDefaultTicketView(me.username)));
  } finally {
    await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/helpdesk/tickets`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(3000);
    if (saved) console.log('restore', await desk.restoreMyDefaultTicketView(me.username, saved).catch((e) => `RESTORE FAILED ${e}`));
    console.log('view now', JSON.stringify(await desk.readMyDefaultTicketView(me.username)));
  }
});

test('EXPLORE-G1-B4: getSidePanelSections() on FF ticket 2586 (Nam, read only)', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const desk = new SupportDeskPageMig(page);
  await desk.login(baseUrl_support_mig, users.support_l2_nam_support_mig.username, users.support_l2_nam_support_mig.password);
  await desk.openTicketByLink(baseUrl_support_mig, '2586');
  for (const s of await desk.getSidePanelSections()) console.log(`SECTION "${s.heading}": ${s.rows.map((r) => `${r.label}=${r.value}`).join(' | ')}`);
});
