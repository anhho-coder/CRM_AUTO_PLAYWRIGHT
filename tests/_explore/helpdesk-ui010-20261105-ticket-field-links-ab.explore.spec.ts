import { test, Page } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl, baseUrl_support_mig } from '@config/users.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-05, READ ONLY on both systems.
 * Follow-up of CRM-14429 (TC-UI-010_B Customer not a hyperlink): on the same ticket in both systems - pre-production
 * helpdesk.ticket 374551 (A, baseline) and support-crm-mig HD Ticket 2574 (B) - which fields draw their value as a
 * hyperlink. A: every visible form field (label, widget, link href) + its field type (fields_get). B: every side-panel row
 * (label, control, links), every a[href] of the side panel, and the Details tab. Output JSON + shots in OUT.
 */
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-ui010-field-links';
fs.mkdirSync(OUT, { recursive: true });
const A_TICKET = 374551;
const B_TICKET = '2574';
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }

test('EXPLORE-UI-010 A/B: which ticket fields are hyperlinks (Nam, read only)', async ({ page, browser }) => {
  test.setTimeout(10 * 60_000);
  // ---- A: pre-production ticket form
  const lp = new LoginPage(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await lp.navigateTo(baseUrl);
  await lp.login(users.support_l2_manager_nam.username, users.support_l2_manager_nam.password, CommonUtils.waitTimes.pageLoad);
  await lp.dismissLocationPermissionDialog();
  await new HelpdeskPage(page).openTicketById(baseUrl, A_TICKET);
  await page.locator('.o_form_view .o_field_widget[name="partner_id"]').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(CommonUtils.waitTimes.long);
  const aFields = await page.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    const sheet = document.querySelector('.o_form_view .o_form_sheet') || document.querySelector('.o_form_view');
    for (const el of Array.from(sheet!.querySelectorAll<HTMLElement>('.o_field_widget[name]'))) {
      if (el.closest('.o_chatter') || el.parentElement?.closest('.o_field_widget[name]')) continue;
      if (el.offsetParent === null) continue;
      const id = el.getAttribute('id') || el.querySelector('[id]')?.getAttribute('id') || '';
      const lab = id ? document.querySelector(`label[for="${id}"]`) : null;
      const a = (el.tagName === 'A' ? el : el.querySelector('a[href]')) as HTMLAnchorElement | null;
      out.push({ name: el.getAttribute('name'), label: (lab?.textContent || '').replace(/\s+/g, ' ').trim(), tag: el.tagName, cls: el.className.replace(/\s+/g, ' ').slice(0, 120),
        value: (el.innerText || (el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 80), href: a ? a.getAttribute('href') : null });
    }
    return out;
  });
  const names = [...new Set(aFields.map((f) => String(f.name)))];
  const fg = await page.evaluate(async (fl) => {
    const r = await fetch('/web/dataset/call_kw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model: 'helpdesk.ticket', method: 'fields_get', args: [fl], kwargs: { attributes: ['string', 'type', 'relation'] } } }) });
    const j = await r.json();
    return j.result || {};
  }, names) as Record<string, { string: string; type: string; relation?: string }>;
  for (const f of aFields) { const d = fg[String(f.name)]; if (d) Object.assign(f, { type: d.type, relation: d.relation || '' }); }
  fs.writeFileSync(`${OUT}/a-fields.json`, JSON.stringify(aFields, null, 1));
  console.log(`A FIELDS ${aFields.length}`);
  for (const f of aFields) console.log(`  A | ${f.label || '(no label)'} | ${f.name} | ${f.type}${f.relation ? `->${f.relation}` : ''} | ${f.tag} | link ${f.href ?? '-'} | "${f.value}"`);
  await shot(page, 'a-ticket-form');

  // ---- B: support-crm-mig ticket page
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
  const bp = await ctx.newPage();
  const desk = new SupportDeskPageMig(bp);
  await desk.login(baseUrl_support_mig, users.support_l2_nam_support_mig.username, users.support_l2_nam_support_mig.password);
  await desk.openTicketByLink(baseUrl_support_mig, B_TICKET);
  await desk.waitForSidePanelRowValue('Customer', 'license@nakivo.com (#547004)');
  const rows = await desk.getSidePanelRows();
  const bRows: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    const l = await desk.getSidePanelRowLinks(r.label);
    bRows.push({ label: r.label, value: r.value, control: l.control, links: l.links });
  }
  const panelLinks = await bp.evaluate(() => {
    const aside = Array.from(document.querySelectorAll<HTMLElement>('span[data-grace-area-trigger]'))[0]?.closest('aside, [class*="border-l"], [class*="w-[3"]') || document.body;
    return Array.from(aside.querySelectorAll<HTMLAnchorElement>('a[href]')).filter((a) => a.offsetParent !== null).map((a) => ({ text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80), href: a.getAttribute('href') }));
  });
  const sections = await bp.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('button, div')).filter((e) => /^(Overview|More Details|Contact|Customer|Details)\b/.test((e.innerText || '').trim()) && (e.innerText || '').length < 40 && e.offsetParent !== null).map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()));
  fs.writeFileSync(`${OUT}/b-rows.json`, JSON.stringify({ rows: bRows, panelLinks, sections }, null, 1));
  console.log(`B ROWS ${bRows.length}`);
  for (const r of bRows) console.log(`  B | ${r.label} | ${r.control} | links ${JSON.stringify(r.links)} | "${r.value}"`);
  console.log(`B PANEL LINKS ${JSON.stringify(panelLinks)}`);
  console.log(`B SECTIONS ${JSON.stringify([...new Set(sections)])}`);
  await shot(bp, 'b-ticket-page');
  // the main-area Details tab
  const details = bp.getByText('Details', { exact: true }).first();
  if (await details.count()) {
    await details.click().catch(() => {});
    await bp.waitForTimeout(CommonUtils.waitTimes.long);
    const tab = await bp.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      const links = Array.from(main.querySelectorAll<HTMLAnchorElement>('a[href]')).filter((a) => a.offsetParent !== null).map((a) => ({ text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80), href: a.getAttribute('href') }));
      return { text: ((main as HTMLElement).innerText || '').slice(0, 3000), links };
    });
    fs.writeFileSync(`${OUT}/b-details-tab.json`, JSON.stringify(tab, null, 1));
    console.log(`B DETAILS TAB links ${JSON.stringify(tab.links).slice(0, 2000)}`);
    console.log(`B DETAILS TAB text ${tab.text.replace(/\n+/g, ' | ').slice(0, 2000)}`);
    await shot(bp, 'b-details-tab');
  }
  await ctx.close();
});
