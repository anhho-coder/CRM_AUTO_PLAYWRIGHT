import { test, Page } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl } from '@config/users.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-04, pre-production. Each test creates ONE probe ticket of its
 * own (marker AUTO-CRM-11859-G2-...) and archives it in afterEach; pre-production sends no e-mail.
 * G2-A1 (L2 engineer Nam): TC-CUST-074_A - the Jira reference widget: refusal text for a bare key and a non-/browse/ URL,
 *        what a valid URL shows, and where its click goes (the jira host is routed to an abort - no Jira call).
 * G2-A2 (L1 agent Giang): TC-SEC-052_A - the full composer: where a reply template is saved / chosen (read only, discarded).
 */
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-g2';
fs.mkdirSync(OUT, { recursive: true });
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }
async function login(page: Page, who: { username: string; password: string }) {
  const lp = new LoginPage(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await lp.navigateTo(baseUrl);
  await lp.login(who.username, who.password, CommonUtils.waitTimes.pageLoad);
  await lp.dismissLocationPermissionDialog();
}
const probe = { id: 0, subject: '' };
test.afterEach(async ({ page }) => {
  if (!probe.id) return;
  console.log('archive probe', await new HelpdeskPage(page).archiveTicketByIdOverRpc(probe.id, probe.subject).catch((e) => String(e)));
  probe.id = 0;
});
async function makeProbe(page: Page, login: string, tag: string) {
  const hp = new HelpdeskPage(page);
  const team = (await hp.searchIdsOverRpc('helpdesk.team', [['name', '=', 'Customer Support']], 1))[0];
  const uid = (await hp.searchIdsOverRpc('res.users', [['login', '=', login]], 1))[0];
  probe.subject = `AUTO-CRM-11859-G2-${tag}-${RUN}`;
  probe.id = await hp.createTicketOverRpc({ name: probe.subject, team_id: team, user_id: uid, partner_email: 'qa.g2@example.com' });
  console.log('probe', probe.id, probe.subject);
  await hp.openTicketById(baseUrl, String(probe.id));
  return hp;
}

test('EXPLORE-G2-A1: Jira reference widget (Nam, own probe)', async ({ page, context }) => {
  test.setTimeout(6 * 60_000);
  await context.route(/jira\.example\.com/, (r) => r.abort());
  await login(page, users.support_l2_manager_nam);
  const hp = await makeProbe(page, users.support_l2_manager_nam.username, 'JIRA');
  for (const v of ['ITSM-123', 'https://jira.example.com/issues/ITSM-123', 'https://jira.example.com/browse/ITSM-123']) {
    await hp.clickEditTicket();
    const w = page.locator('.o_form_view .o_field_widget[name="jira_edit_mode_field"]').first();
    const tag = await w.evaluate((e) => `${e.tagName} ${e.className} input:${!!e.querySelector('input')}`).catch((e) => `ERR ${e}`);
    console.log(`widget in edit: ${tag}`);
    const input = (await w.evaluate((e) => e.tagName === 'INPUT')) ? w : w.locator('input').first();
    await input.fill(v);
    const saved = await hp.clickSaveTicket().catch((e) => `ERR ${String(e).split('\n')[0]}`);
    await page.waitForTimeout(1500);
    const dlg = await hp.getShownDialogText().catch(() => '');
    console.log(`SET "${v}": saved=${saved} dialog="${dlg}"`);
    await shot(page, `a1-${v.replace(/[^a-z0-9]+/gi, '_')}`);
    if (dlg) { await hp.closeShownDialog().catch(() => {}); await hp.discardTicketEdits().catch(() => {}); }
    const stored = await hp.readTicketOverRpc(probe.id, ['jira_edit_mode_field', 'jira_save_mode_field']);
    console.log(`  stored ${JSON.stringify(stored)}`);
  }
  const ro = page.locator('.o_form_view .o_field_widget[name="jira_edit_mode_field"]').first();
  console.log('read-mode widget html', (await ro.evaluate((e) => e.outerHTML).catch(() => '')).slice(0, 600));
  const pop = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  await ro.locator('a').first().click().catch((e) => console.log('click', String(e).split('\n')[0]));
  const p = await pop;
  console.log('POPUP url', p ? p.url() : '(no popup)', '| page url', page.url());
});

test('EXPLORE-G2-A2: full composer - templates (Giang, own probe, nothing sent)', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await login(page, users.support_l1_giang_preprod);
  await makeProbe(page, users.support_l1_giang_preprod.username, 'TPL');
  await page.locator('button.o_chatter_button_new_message').first().click();
  await page.waitForTimeout(1500);
  const full = page.locator('.o_composer_button_full_composer').first();
  console.log('full composer button', await full.count());
  await full.click().catch((e) => console.log('full', String(e).split('\n')[0]));
  await page.waitForTimeout(3000);
  const dlg = page.locator('.modal.show .modal-content').last();
  fs.writeFileSync(`${OUT}/a2-composer.html`, await dlg.innerHTML().catch(() => ''));
  console.log('labels', JSON.stringify(await dlg.locator('label').allInnerTexts().catch(() => [])));
  console.log('buttons', JSON.stringify(await dlg.locator('button, .btn').allInnerTexts().catch(() => [])));
  console.log('fields', JSON.stringify(await dlg.locator('.o_field_widget[name]').evaluateAll((els) => els.map((e) => e.getAttribute('name')))));
  await shot(page, 'a2-composer');
  const tpl = dlg.locator('.o_field_widget[name="template_id"] input').first();
  if (await tpl.count()) {
    await tpl.click();
    await tpl.fill('');
    await page.waitForTimeout(1500);
    console.log('template options', JSON.stringify(await page.locator('ul.ui-autocomplete li').allInnerTexts().catch(() => [])).slice(0, 1500));
    await page.keyboard.press('Escape');
  }
  const hp = new HelpdeskPage(page);
  console.log('mail.template create allowed?', JSON.stringify(await page.evaluate(async () => {
    const r = await fetch('/web/dataset/call_kw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model: 'mail.template', method: 'check_access_rights', args: ['create'], kwargs: { raise_exception: false } } }) });
    return (await r.json()).result;
  })));
  console.log('templates for helpdesk.ticket', JSON.stringify(await hp.searchIdsOverRpc('mail.template', [['model', '=', 'helpdesk.ticket']], 50)).slice(0, 400));
  await page.locator('.modal.show .modal-footer button').filter({ hasText: /Discard|Cancel/ }).first().click().catch(() => {});
});
