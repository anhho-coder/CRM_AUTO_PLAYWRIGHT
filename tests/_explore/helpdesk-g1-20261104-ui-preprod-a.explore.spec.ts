import { test, Page } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl } from '@config/users.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-04, pre-production, READ ONLY.
 * G1-A1 (L2 engineer Nam): TC-UI-015_A / TC-UI-010_A - which helpdesk.ticket fields carry the Jira reference, CC and the
 *        classification; candidate migrated pair tickets (CS team, closed, created 2026, unchanged 90+ days, Jira + CC +
 *        ticket type filled); the ticket form's groups (titles, labels, values) in screen order.
 * G1-A2 (L1 agent Giang): TC-UI-046_A / TC-UI-050_A - the search box autocomplete for a word and for a number, and what
 *        the facets are after clearing them and choosing a filter.
 */
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-g1';
fs.mkdirSync(OUT, { recursive: true });
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }
async function kw(page: Page, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  return page.evaluate(async ([m, f, a, k]) => {
    const r = await fetch('/web/dataset/call_kw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model: m, method: f, args: a, kwargs: k } }) });
    const j = await r.json();
    return j.error ? { error: `${(j.error.data || {}).name || ''} :: ${String((j.error.data || {}).message || j.error.message).slice(0, 300)}` } : { result: j.result };
  }, [model, method, args, kwargs] as [string, string, unknown[], Record<string, unknown>]);
}
async function login(page: Page, who: { username: string; password: string }) {
  const lp = new LoginPage(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await lp.navigateTo(baseUrl);
  await lp.login(who.username, who.password, CommonUtils.waitTimes.pageLoad);
  await lp.dismissLocationPermissionDialog();
}

test('EXPLORE-G1-A1: ticket form groups + candidate pair tickets (Nam, read only)', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  await login(page, users.support_l2_manager_nam);
  const fg = await kw(page, 'helpdesk.ticket', 'fields_get', [], { attributes: ['string', 'type', 'relation'] }) as { result?: Record<string, { string: string; type: string; relation?: string }> };
  const all = fg.result || {};
  const pick = Object.entries(all).filter(([k, v]) => /jira|cc|carbon|classif|type|product|area|root|resolution|severity|shift|fcr|interaction|escalat|round|note|timezone|closed|bug|affect|phone|customer|support|value|due|status|tag|count|number/i.test(`${k} ${v.string}`));
  fs.writeFileSync(`${OUT}/a1-fields.json`, JSON.stringify(Object.fromEntries(pick), null, 1));
  console.log('FIELDS', pick.length, JSON.stringify(pick.map(([k, v]) => `${k}:${v.type}:${v.string}`)).slice(0, 6000));
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const jiraF = Object.keys(all).filter((k) => /jira/i.test(k));
  const ccF = Object.keys(all).filter((k) => /(^|_)cc|carbon/i.test(k));
  console.log('jira fields', jiraF, 'cc fields', ccF);
  const base = [['team_id.name', '=', 'Customer Support'], ['stage_id.name', '=', 'Closed'], ['create_date', '>=', '2026-01-01 00:00:00'], ['write_date', '<', cutoff]];
  console.log('closed CS 2026 unchanged 90d:', JSON.stringify(await kw(page, 'helpdesk.ticket', 'search_count', [base])));
  for (const f of [...jiraF, ...ccF]) {
    if (!['char', 'text', 'many2one', 'many2many'].includes(all[f].type)) continue;
    const dom = all[f].type === 'many2many' ? [[f, '!=', false]] : [[f, '!=', false]];
    console.log(`  + ${f} set:`, JSON.stringify(await kw(page, 'helpdesk.ticket', 'search_count', [[...base, ...dom]])));
  }
  const cand = await kw(page, 'helpdesk.ticket', 'search_read', [base], { fields: ['id', 'name', 'stage_id', 'user_id', ...jiraF, ...ccF, 'ticket_type_id'].filter((f) => f in all), limit: 40, order: 'id asc' });
  fs.writeFileSync(`${OUT}/a1-candidates.json`, JSON.stringify(cand, null, 1));
  const rows = ((cand as { result?: Array<Record<string, unknown>> }).result || []);
  const full = rows.filter((r) => jiraF.some((f) => r[f]) && ccF.some((f) => r[f] && (!Array.isArray(r[f]) || (r[f] as unknown[]).length)));
  console.log('candidates', rows.length, 'with jira+cc', full.length, JSON.stringify(full.slice(0, 5).map((r) => ({ id: r.id, name: r.name, ...Object.fromEntries([...jiraF, ...ccF].map((f) => [f, r[f]])) }))));
  const id = (full[0] || rows[0] || {}).id;
  if (!id) return;
  await page.goto(`${baseUrl.replace(/\/$/, '')}/web#id=${id}&model=helpdesk.ticket&view_type=form`, { waitUntil: 'domcontentloaded' });
  await page.locator('.o_form_view').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4000);
  fs.writeFileSync(`${OUT}/a1-form.html`, await page.locator('.o_form_view').first().innerHTML());
  await shot(page, 'a1-form');
  const groups = await page.evaluate(() => {
    const sheet = document.querySelector('.o_form_sheet') || document.querySelector('.o_form_view');
    const out: Array<{ path: string; title: string; rows: Array<{ label: string; name: string; value: string; vis: boolean }> }> = [];
    const inner = Array.from(sheet!.querySelectorAll('.o_group .o_group, table.o_group.o_inner_group')) as HTMLElement[];
    const seen = new Set<Element>();
    for (const g of inner) {
      if (seen.has(g)) continue; seen.add(g);
      const prev = g.previousElementSibling as HTMLElement | null;
      const title = (g.querySelector(':scope > tbody > tr > td > .o_horizontal_separator, :scope .o_horizontal_separator') as HTMLElement | null)?.innerText || '';
      const rows: Array<{ label: string; name: string; value: string; vis: boolean }> = [];
      for (const tr of Array.from(g.querySelectorAll(':scope > tbody > tr')) as HTMLElement[]) {
        const lab = tr.querySelector('td.o_td_label label, label.o_form_label') as HTMLElement | null;
        const fld = tr.querySelector('[name]') as HTMLElement | null;
        if (!lab && !fld) continue;
        rows.push({ label: (lab?.innerText || '').trim(), name: fld?.getAttribute('name') || '', value: ((tr.querySelector('td:not(.o_td_label)') as HTMLElement | null)?.innerText || '').trim().slice(0, 80), vis: tr.offsetParent !== null && !tr.classList.contains('o_invisible_modifier') });
      }
      out.push({ path: `${g.className}`.slice(0, 60) + (prev ? ` prev:${prev.className}`.slice(0, 40) : ''), title, rows });
    }
    return out;
  });
  fs.writeFileSync(`${OUT}/a1-groups.json`, JSON.stringify(groups, null, 1));
  for (const g of groups) console.log(`GROUP [${g.title}] ${g.path}: ${g.rows.filter((r) => r.vis).map((r) => `${r.label}(${r.name})=${r.value}`).join(' | ')}`.slice(0, 1500));
  const tabs = await page.locator('.o_notebook .nav-link').allInnerTexts().catch(() => []);
  console.log('NOTEBOOK TABS', JSON.stringify(tabs));
});

test('EXPLORE-G1-A2: search autocomplete for a word and a number; facets (Giang, read only)', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await login(page, users.support_l1_giang_preprod);
  const hp = new HelpdeskPage(page);
  await hp.openAllTicketsListDirect(baseUrl);
  console.log('facets at open', JSON.stringify(await hp.getSearchFacets()), 'pager', await hp.getPagerTotal().catch(() => -1));
  console.log('defaults', JSON.stringify(await hp.readAllTicketsDefaults().catch((e) => String(e))));
  const input = page.locator('.o_searchview_input').first();
  for (const text of ['QA-UI', '425522']) {
    await input.click();
    await input.fill(text);
    await page.waitForTimeout(1500);
    const items = await page.locator('.o_searchview_autocomplete li').allInnerTexts().catch(() => []);
    console.log(`AUTOCOMPLETE "${text}":`, JSON.stringify(items));
    await shot(page, `a2-autocomplete-${text}`);
    await input.press('Escape');
    await input.fill('');
  }
  await hp.clearSearchFacets();
  await page.waitForTimeout(1500);
  console.log('facets after clear', JSON.stringify(await hp.getSearchFacets()), 'pager', await hp.getPagerTotal().catch(() => -1));
  for (const f of ['My Tickets', 'Unassigned Tickets', 'Open Tickets', 'Closed Tickets']) {
    await hp.clearSearchFacets();
    await page.waitForTimeout(1000);
    await hp.chooseSearchFilter(f);
    await page.waitForTimeout(1500);
    console.log(`FILTER ${f}: facets`, JSON.stringify(await hp.getSearchFacets()), 'pager', await hp.getPagerTotal().catch(() => -1), 'domain', JSON.stringify(await hp.readSavedFilterDomain(f).catch((e) => String(e).slice(0, 120))));
  }
  const filt = await kw(page, 'ir.ui.view', 'search_read', [[['model', '=', 'helpdesk.ticket'], ['type', '=', 'search']]], { fields: ['id', 'name', 'arch_db', 'inherit_id'], limit: 20 });
  const views = ((filt as { result?: Array<{ id: number; name: string; arch_db: string }> }).result || []);
  for (const v of views) {
    const hits = (v.arch_db.match(/<(filter|field)[^>]*(My Tickets|Unassigned|Open Tickets|Closed Tickets|filter_domain|name="name"|string="All")[^>]*>/g) || []).slice(0, 12);
    if (hits.length) console.log(`SEARCH VIEW ${v.id} ${v.name}:`, hits.join('\n   '));
  }
});

test('EXPLORE-G1-A3: readFormLayout() on ticket #374641 (Nam, read only)', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  await login(page, users.support_l2_manager_nam);
  await page.goto(`${baseUrl.replace(/\/$/, '')}/web#id=374641&model=helpdesk.ticket&view_type=form`, { waitUntil: 'domcontentloaded' });
  const rows = await new HelpdeskPage(page).readFormLayout();
  for (const r of rows) console.log(`LAYOUT ${r.section || '(head)'} | ${r.column} | ${r.label} (${r.name}) = ${r.value}`);
  await shot(page, 'a3-layout');
});
