import { test, Page, request } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl_support_mig } from '@config/users.config';
import { SupportDeskPageMig } from '@pages/mig';
import { createSupportTicketAsAdmin, deleteSupportProbeAsAdmin, assignSupportTicketAsAdmin, updateSupportTicketAsAdmin, readTicketEmailQueueAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-04, support-crm-mig. ONE probe ticket as Administrator (marker
 * AUTO-CRM-11859-G3-...), deleted (deny-list) in afterEach. Outgoing mail goes to the crm-mig Mailpit only (SMTP mailpit:1025).
 * G3-B1 (L2 engineer Nam): TC-MAIL-059/061/062/070_B - the demo allowlist (that ONE field of NAKIVO Helpdesk Settings), the
 *        reply editor before typing (greeting, signature, To, CC, Bcc), one reply sent with a Stage -> its Email Queue row
 *        (subject, recipients, cc), then the ticket closed -> the satisfaction mail; the HD Ticket Types (for "Subtask").
 */
test.use({ ignoreHTTPSErrors: true });
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-g3';
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

test('EXPLORE-G3-B1: reply editor, sent reply, close mail (Nam, own probe)', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const api = await request.newContext({ baseURL: baseUrl_support_mig.replace(/\/$/, ''), ignoreHTTPSErrors: true });
  await api.post('/api/method/login', { data: { usr: ADMIN.username, pwd: ADMIN.password } });
  const allow = await (await api.get(`/api/method/frappe.client.get_single_value?doctype=${encodeURIComponent('NAKIVO Helpdesk Settings')}&field=demo_allowed_recipients`)).json();
  const allowList = String(allow.message || '').split(/\s+/).filter(Boolean);
  console.log('DEMO ALLOWLIST', JSON.stringify(allowList));
  const types = await (await api.get(`/api/resource/HD Ticket Type?fields=${encodeURIComponent(JSON.stringify(['name']))}&limit_page_length=80`)).json();
  console.log('HD Ticket Types', JSON.stringify((types.data || []).map((t: { name: string }) => t.name)));
  await api.dispose();
  const alice = allowList.find((a) => /alice/i.test(a)) || allowList[0] || `qa.alice.${RUN}@example.com`;
  const bob = allowList.find((a) => /bob/i.test(a)) || allowList[1] || `qa.bob.${RUN}@example.com`;
  console.log('alice =', alice, '| bob =', bob);

  const desk = new SupportDeskPageMig(page);
  const me = users.support_l2_nam_support_mig;
  await desk.login(baseUrl_support_mig, me.username, me.password);
  probe.subject = `AUTO-CRM-11859-G3-MAIL-${RUN}`;
  probe.email = alice;
  const t = await createSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, { subject: probe.subject, raisedBy: alice, description: '<p>Explore probe G3. Not a real customer.</p>' });
  Object.assign(probe, { name: t.name, since: t.creation });
  console.log('probe', t.name, 'assigned', await assignSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, t.name, probe.subject, me.username));
  console.log('cc', JSON.stringify(await updateSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, t.name, probe.subject, { custom_cc: bob })));
  console.log('contact of the ticket', JSON.stringify(await desk.listTicketsOverRest([['name', '=', t.name]], ['contact', 'raised_by', 'customer', 'custom_cc'], 1)));
  await desk.openTicketByLink(baseUrl_support_mig, t.name);
  await page.getByRole('button', { name: /^Reply$/ }).first().click();
  await page.waitForTimeout(3000);
  const editor = page.locator('.ProseMirror').first();
  console.log('EDITOR html', (await editor.innerHTML().catch(() => '')).slice(0, 1500));
  console.log('EDITOR text', JSON.stringify((await editor.innerText().catch(() => '')).slice(0, 600)));
  const area = editor.locator('xpath=ancestor::*[.//*[contains(normalize-space(.),"TO") or contains(normalize-space(.),"To")]][1]');
  void area;
  const box = await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror') as HTMLElement | null;
    let root: HTMLElement | null = ed;
    for (let i = 0; i < 8 && root; i++) root = root.parentElement;
    return root ? root.innerText.replace(/\s+/g, ' ').slice(0, 1500) : '';
  });
  console.log('COMPOSER around the editor', box);
  fs.writeFileSync(`${OUT}/b1-composer.html`, await page.evaluate(() => { const ed = document.querySelector('.ProseMirror'); let r: Element | null = ed; for (let i = 0; i < 8 && r; i++) r = r.parentElement; return r ? r.outerHTML : ''; }));
  await shot(page, 'b1-reply-editor');
  console.log('inputs near', JSON.stringify(await page.locator('input:visible').evaluateAll((els) => els.map((e) => `${e.getAttribute('placeholder') || ''}=${(e as HTMLInputElement).value}`))));
  // send one reply with a Stage
  await desk.replyToCustomer('QA explore reply text', 'On Customer').catch((e) => console.log('reply', String(e).split('\n')[0]));
  await page.waitForTimeout(5000);
  console.log('EMAIL QUEUE after reply', JSON.stringify(await readTicketEmailQueueAsAdmin(baseUrl_support_mig, ADMIN, t.name, t.creation).catch((e) => String(e))).slice(0, 2500));
  await shot(page, 'b1-after-reply');
  // close it
  const close = { custom_severity_level: 'Severity 3', custom_bug_report: 'No', custom_fcr: 'No', custom_wrongly_escalated_to_l2: 'No', custom_class_ticket_type: 'Support Requests', custom_product_line: 'Core', custom_classification_area: 'None', custom_sub_area: 'None', custom_issue_type: 'Install/Update', custom_class_description: 'x', custom_root_cause: 'x', custom_resolution: 'x' };
  console.log('close fields', JSON.stringify(await updateSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, t.name, probe.subject, close).catch((e) => String(e))));
  console.log('closed', JSON.stringify(await updateSupportTicketAsAdmin(baseUrl_support_mig, ADMIN, t.name, probe.subject, { status: 'Closed' }).catch((e) => String(e))));
  await page.waitForTimeout(8000);
  console.log('EMAIL QUEUE after close', JSON.stringify(await readTicketEmailQueueAsAdmin(baseUrl_support_mig, ADMIN, t.name, t.creation).catch((e) => String(e))).slice(0, 3000));
});
