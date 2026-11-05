import { test, Page } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl_support_mig } from '@config/users.config';
import { SupportDeskPageMig } from '@pages/mig';
import { createSupportTicketAsAdmin, deleteSupportProbeAsAdmin, assignSupportTicketAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-05, support-crm-mig. ONE probe ticket as Administrator
 * (marker AUTO-CRM-11859-X074B-...) deleted (deny-list) in afterEach. Nothing is sent; jira.example.com answers a stub page.
 * X074B-1 (L2 engineer Nam): TC-CUST-074_B - (a) the DOM of the box FF draws for the wrong-format message (role, title,
 *         buttons, ancestors) - the spec read it as "a toast, no dialog"; (b) after a /browse/ URL is saved, what the side
 *         panel rows Jira reference / JIRA Key draw (input, link, icon) and whether a click on them opens a tab.
 */
test.use({ ignoreHTTPSErrors: true });
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-x074b';
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

/** Every visible leaf element holding `text`, with its ancestor chain (tag, role, aria-*, class head, data-* names). */
async function dumpHolders(page: Page, text: string): Promise<string> {
  return page.evaluate((t) => {
    const out: string[] = [];
    const all = Array.from(document.querySelectorAll('body *')).filter((e) => (e as HTMLElement).innerText?.includes(t));
    const leaves = all.filter((e) => !all.some((o) => o !== e && e.contains(o)));
    for (const leaf of leaves) {
      const r = (leaf as HTMLElement).getBoundingClientRect();
      out.push(`LEAF <${leaf.tagName.toLowerCase()}> ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}`);
      let e: Element | null = leaf;
      for (let i = 0; e && e !== document.body && i < 14; i++, e = e.parentElement) {
        const attrs = Array.from(e.attributes).filter((a) => /^(role|aria-|data-|id$|open$)/.test(a.name)).map((a) => `${a.name}=${a.value.slice(0, 40)}`).join(' ');
        const cls = (e.getAttribute('class') || '').split(/\s+/).slice(0, 6).join('.');
        const rr = (e as HTMLElement).getBoundingClientRect();
        out.push(`   ${i} <${e.tagName.toLowerCase()}> ${attrs} .${cls} ${Math.round(rr.width)}x${Math.round(rr.height)} text="${((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').slice(0, 120)}"`);
      }
    }
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]'))
      .map((d) => { const rr = (d as HTMLElement).getBoundingClientRect(); return `DIALOG <${d.tagName.toLowerCase()}> role=${d.getAttribute('role')} ${Math.round(rr.width)}x${Math.round(rr.height)} "${((d as HTMLElement).innerText || '').replace(/\s+/g, ' ').slice(0, 160)}"`; });
    return [...out, `dialogs in DOM: ${dialogs.length}`, ...dialogs].join('\n');
  }, text);
}

/** The side panel row `label`: its DOM (trimmed) and every link / button / icon it holds. */
async function dumpRow(page: Page, label: string): Promise<string> {
  const row = page.locator(`xpath=//*[normalize-space()="${label}"]/ancestor::*[.//input or .//a][1]`).first();
  const html = (await row.evaluate((e) => e.outerHTML).catch(() => '(no row)')).replace(/\s+/g, ' ');
  const kids = await row.locator('a, button, svg, input, [role="link"], [role="button"]').evaluateAll((els) => els.map((e) => `${e.tagName} href=${e.getAttribute('href') || ''} target=${e.getAttribute('target') || ''} value=${(e as HTMLInputElement).value ?? ''} readonly=${e.hasAttribute('readonly')} text="${((e as HTMLElement).innerText || '').trim()}"`)).catch(() => [] as string[]);
  return `ROW ${label}: ${html.slice(0, 1500)}\n  children: ${JSON.stringify(kids)}`;
}

test('EXPLORE-X074B-1: wrong-format box DOM + Jira reference / JIRA Key rows after save (Nam, own probe)', async ({ page, context }) => {
  test.setTimeout(6 * 60_000);
  await context.route(/jira\.(example|nakivo)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stub</body></html>' }));
  const desk = new SupportDeskPageMig(page);
  const me = users.support_l2_nam_support_mig;
  await desk.login(baseUrl_support_mig, me.username, me.password);
  probe.subject = `AUTO-CRM-11859-X074B-${RUN}`;
  probe.email = `qa.x074b.${RUN}@example.com`;
  const t = await createSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, { subject: probe.subject, raisedBy: probe.email, description: '<p>Explore probe X074B. Not a real customer.</p>' });
  Object.assign(probe, { name: t.name, since: t.creation });
  console.log('probe', t.name, 'assigned', await assignSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, t.name, probe.subject, me.username));
  await desk.openTicketByLink(baseUrl_support_mig, probe.name);

  // (a) the wrong-format box
  const input = page.getByPlaceholder('Set Jira reference...').first();
  await input.fill('ITSM-123', { timeout: 15000 });
  await input.press('Tab');
  for (const ms of [300, 1200, 3000, 6000]) {
    await page.waitForTimeout(ms);
    console.log(`--- after ${ms} ms ---\n${await dumpHolders(page, 'Wrong format')}`);
    console.log('  getByRole(dialog) count', await page.getByRole('dialog').count(), 'alertdialog', await page.getByRole('alertdialog').count());
    console.log('  toast locator texts', JSON.stringify(await page.locator('[data-sonner-toast], [role="status"], .toast').allInnerTexts().catch(() => [])));
    await shot(page, `x074b-a-${ms}`);
  }
  const ok = page.getByRole('button', { name: /^OK$/ });
  console.log('OK buttons', await ok.count());
  await ok.first().click({ timeout: 5000 }).catch((e) => console.log('ok click', String(e).split('\n')[0]));
  await page.waitForTimeout(1500);
  console.log('after OK', await dumpHolders(page, 'Wrong format'));

  // (b) a /browse/ URL, then the rows
  // X074B_URL: the /browse/ URL to save (default the tester's real issue TEST-1427, 2026-11-05)
  const GOOD = process.env.X074B_URL || 'http://jira.nakivo.com/browse/TEST-1427';
  const KEY = GOOD.split('/').pop() || '';
  await input.fill(GOOD, { timeout: 15000 });
  await input.press('Tab');
  await page.waitForTimeout(4000);
  console.log('  stored', JSON.stringify(await desk.listTicketsOverRest([['name', '=', probe.name]], ['custom_jira_url', 'custom_jira_key'], 1)));
  await page.reload();
  await page.waitForTimeout(5000);
  for (const label of ['Jira reference', 'JIRA Key']) console.log(await dumpRow(page, label));
  console.log(`holders of ${KEY}
${await dumpHolders(page, KEY)}`);
  console.log('links to jira', JSON.stringify(await page.locator('a[href*="jira"]').evaluateAll((els) => els.map((e) => `${e.tagName} "${(e as HTMLElement).innerText.trim()}" href=${e.getAttribute('href')} target=${e.getAttribute('target')}`))));
  await shot(page, 'x074b-b-rows');
  for (const label of ['Jira reference', 'JIRA Key']) {
    const row = page.locator(`xpath=//*[normalize-space()="${label}"]/ancestor::*[.//input or .//a][1]`).first();
    const target = row.locator('a, input').last();
    const pop = page.waitForEvent('popup', { timeout: 6000 }).catch(() => null);
    await target.click({ timeout: 8000, modifiers: [] }).catch((e) => console.log(`click ${label}`, String(e).split('\n')[0]));
    const p = await pop;
    console.log(`CLICK ${label} -> popup ${p ? p.url() : '(none)'}; page url ${page.url()}`);
    if (p) await p.close().catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1000);
  }
});
