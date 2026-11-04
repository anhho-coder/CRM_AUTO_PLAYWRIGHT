import { test, Page, request, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl_support_mig } from '@config/users.config';
import { SupportDeskPageMig } from '@pages/mig/SupportDeskPageMig';
import { deleteSupportProbeAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-04. Tester: "use pre-prod to find what puts a ticket into
 * Review needed, then create test data on the Support service so a ticket enters Review needed and check the filter".
 * Pre-prod (measured by MCP): Review needed = helpdesk.ticket.review_needed (module nakivo_message_approval), approval rule
 * 139 "L1 support review" - public messages from support engineers to end users are reviewed by another L1 engineer.
 * FF: NK-VIEW-REVIEW-NEEDED = {"custom_review_needed": 1}; Communication.custom_approval_status = Pending Approval; the agent
 * composer calls nakivo_helpdesk.reply_review.* and refuses a reply without a stage ("Please input stage!").
 * This run: Administrator creates ONE probe ticket (run marker in subject + example.com Raised By), L1 Vince replies to the
 * customer from the agent UI, and the run reads what the reply and the ticket became. afterEach deletes the run's
 * Communications, Email Queue rows, ticket and contact (deny-list: captured ticket number + run marker + since its creation).
 * LEFTOVER_TICKET / LEFTOVER_SUBJECT / LEFTOVER_EMAIL: clean one earlier probe that a killed run left behind (same guards).
 */
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-v9';
test.use({ ignoreHTTPSErrors: true });

const ADMIN = users.admin_support_mig;
const AGENT = users.support_l1_vince_support_mig;
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const enc = (o: unknown) => encodeURIComponent(JSON.stringify(o));
const T = 15_000; // every UI action is bounded - an unbounded click hung the first run until the shell killed it
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {}); }
async function adminApi(): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: baseUrl_support_mig.replace(/\/$/, ''), ignoreHTTPSErrors: true });
  const lg = await api.post('/api/method/login', { data: { usr: ADMIN.username, pwd: ADMIN.password } });
  if (lg.status() !== 200) throw new Error(`admin login HTTP ${lg.status()}`);
  return api;
}

const probe = { ticket: '', subject: '', email: '', since: '' };

/** Deny-list cleanup of ONE probe: its Communications + Email Queue rows created since the ticket, then ticket + contact. */
async function cleanupProbe(p: typeof probe): Promise<void> {
  if (!p.subject) return;
  const api = await adminApi();
  try {
    if (p.ticket) {
      const t = await api.get(`/api/resource/HD Ticket/${p.ticket}`);
      if (t.status() === 200) {
        const doc = (await t.json()).data || {};
        if (String(doc.subject) !== p.subject) throw new Error(`ticket ${p.ticket} has subject "${doc.subject}" - not this run's; nothing deleted`);
        p.since = p.since || String(doc.creation).slice(0, 19);
      }
    }
    if (p.ticket && p.since) {
      for (const dt of ['Communication', 'Email Queue']) {
        const rows: Array<{ name: string; reference_name: string }> = (await (await api.get(`/api/resource/${encodeURIComponent(dt)}?fields=${enc(['name', 'reference_name'])}&filters=${enc([['reference_doctype', '=', 'HD Ticket'], ['reference_name', '=', p.ticket], ['creation', '>=', p.since]])}&limit_page_length=11`)).json()).data || [];
        if (rows.length > 10) { console.log(`TEARDOWN STOP: ${rows.length} ${dt} rows on ticket ${p.ticket} - more than this run makes; none deleted`); continue; }
        for (const r of rows) {
          if (String(r.reference_name) !== p.ticket) continue;
          const d = await api.delete(`/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(r.name)}`);
          console.log(`TEARDOWN ${dt} ${r.name} (ticket ${p.ticket}): HTTP ${d.status()}`);
        }
        if (!rows.length) console.log(`TEARDOWN ${dt}: none on ticket ${p.ticket} since ${p.since}`);
      }
    }
  } finally {
    await api.dispose();
  }
  for (const line of await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, { ticketName: p.ticket || undefined, subject: p.subject, contactEmail: p.email || undefined, since: p.since || undefined }).catch((e) => [`TEARDOWN FAILED: ${String(e).slice(0, 300)}`])) console.log(`TEARDOWN ${line}`);
}

test.afterEach(async () => {
  console.log('\n--- afterEach: cleanup ---');
  await cleanupProbe(probe).catch((e) => console.log(`TEARDOWN FAILED: ${String(e).slice(0, 300)}`));
});

test('CLEANUP-LEFTOVER: delete one probe a killed run left behind', async () => {
  test.skip(!process.env.LEFTOVER_TICKET, 'set LEFTOVER_TICKET / LEFTOVER_SUBJECT / LEFTOVER_EMAIL');
  Object.assign(probe, { ticket: process.env.LEFTOVER_TICKET, subject: process.env.LEFTOVER_SUBJECT || '', email: process.env.LEFTOVER_EMAIL || '', since: '' });
  console.log('leftover to clean', JSON.stringify(probe));
});

test('EXPLORE-V9-B7: an L1 reply to the customer - does FF hold it and flag the ticket Review needed?', async ({ page }) => {
  test.skip(!!process.env.LEFTOVER_TICKET, 'cleanup run');
  test.setTimeout(6 * 60_000);
  page.setDefaultTimeout(T);
  Object.assign(probe, { subject: `AUTO-CRM-11859-UI112-${RUN} review probe`, email: `qa.customer.ui112.${RUN}@example.com` });
  const api = await adminApi();
  try {
    const c = await api.post('/api/resource/HD Ticket', { data: { subject: probe.subject, raised_by: probe.email, description: '<p>Automated probe for CRM-11859 TC-UI-112 (Review needed). Not a real customer.</p>' } });
    const cj = await c.json().catch(() => ({}));
    probe.ticket = String((cj.data || {}).name || '');
    probe.since = String((cj.data || {}).creation || '').slice(0, 19);
    console.log('ticket create', c.status(), probe.ticket, probe.since);
    if (!probe.ticket) return;

    const desk = new SupportDeskPageMig(page);
    await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
    page.on('response', async (r) => {
      const u = r.url();
      if (/reply|communication|send|approv|review/i.test(u) && r.request().method() === 'POST') console.log('POST', r.status(), u.replace(/^https?:\/\/[^/]+/, ''), (await r.text().catch(() => '')).slice(0, 400));
    });
    await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/helpdesk/tickets/${probe.ticket}`);
    await page.waitForTimeout(5000);
    await page.locator('button', { hasText: /^\s*Reply\s*$/ }).first().click();
    await page.waitForTimeout(2000);
    const send = page.locator('button', { hasText: /^\s*Send\b/ }).last();
    // dump the composer (the block that holds the editor and Send) to read its stage control
    const composer = send.locator('xpath=ancestor::*[.//*[contains(@class,"ProseMirror")]][1]');
    const html = await composer.evaluate((e) => e.outerHTML.replace(/\sstyle="[^"]*"/g, '')).catch((e) => `ERR ${e}`);
    fs.writeFileSync(`${OUT}/b7-composer.html`, html);
    const controls = await composer.locator('button, input, select, textarea, [role="combobox"], [contenteditable="true"]').evaluateAll((els) =>
      els.map((e) => ({ tag: e.tagName, text: (e as HTMLElement).innerText?.trim().slice(0, 60), ph: e.getAttribute('placeholder'), aria: e.getAttribute('aria-label'), cls: (e.getAttribute('class') || '').slice(0, 80) }))).catch(() => []);
    console.log('COMPOSER CONTROLS', JSON.stringify(controls));
    await page.locator('.ProseMirror[contenteditable="true"]').last().click();
    await page.keyboard.type(`Hello, this is an automated probe reply ${RUN} (CRM-11859 TC-UI-112).`);
    await shot(page, 'b7-2-reply-typed');
    // the composer refuses a reply without a stage ("Please input stage!") - a native <select> in the label "Stage:"
    const stage = composer.locator('label', { hasText: 'Stage' }).locator('select').first();
    console.log('stage control found', await stage.count());
    await stage.selectOption(process.env.REPLY_STAGE || 'On Customer').catch((e) => console.log('stage pick', String(e).split('\n')[0]));
    await page.waitForTimeout(800);
    await shot(page, 'b7-3-before-send');
    console.log('send enabled', await send.isEnabled().catch(() => 'n/a'));
    await send.click().catch((e) => console.log('send click', String(e).split('\n')[0]));
    await page.waitForTimeout(6000);
    await shot(page, 'b7-4-after-send');
    const bodyText = await page.locator('body').innerText().catch(() => '');
    for (const k of ['Pending', 'review', 'Review', 'pprov', 'stage']) {
      const i = bodyText.indexOf(k);
      if (i >= 0) console.log('UI TEXT near', k, JSON.stringify(bodyText.slice(Math.max(0, i - 120), i + 160)));
    }

    const comms = (await (await api.get(`/api/resource/Communication?fields=${enc(['name', 'sent_or_received', 'communication_type', 'custom_approval_status', 'custom_approval_author', 'sender', 'creation'])}&filters=${enc([['reference_doctype', '=', 'HD Ticket'], ['reference_name', '=', probe.ticket], ['creation', '>=', probe.since]])}&limit_page_length=10`)).json()).data || [];
    console.log('COMMUNICATIONS', JSON.stringify(comms));
    const t1 = (await (await api.get(`/api/resource/HD Ticket/${probe.ticket}`)).json()).data || {};
    console.log('ticket after', JSON.stringify({ status: t1.status, custom_review_needed: t1.custom_review_needed, custom_review_author: t1.custom_review_author }));
    const appr = (await (await api.get(`/api/resource/NK Approval Request?fields=${enc(['name', 'state', 'reference_doctype', 'reference_name', 'approver'])}&filters=${enc([['creation', '>=', probe.since]])}&limit_page_length=10`)).json()).data || [];
    console.log('NK APPROVAL REQUESTS since the probe', JSON.stringify(appr));
    const eq = (await (await api.get(`/api/resource/Email Queue?fields=${enc(['name', 'status'])}&filters=${enc([['reference_doctype', '=', 'HD Ticket'], ['reference_name', '=', probe.ticket], ['creation', '>=', probe.since]])}&limit_page_length=10`)).json()).data || [];
    console.log('EMAIL QUEUE', JSON.stringify(eq));

    if (Number(t1.custom_review_needed) === 1) {
      await desk.openAllTicketsFromSidebar();
      await desk.chooseFiltersMenuEntry('Review needed');
      await page.waitForTimeout(3000);
      console.log('URL', page.url(), 'counter', JSON.stringify(await desk.getListCounter().catch((e) => String(e))));
      console.log('probe row shown', await desk.revealListRow(probe.ticket, probe.subject).catch((e) => String(e)));
      await shot(page, 'b7-5-review-needed-filter');
      await desk.chooseFiltersMenuEntry('Open Tickets').catch(() => {});
    }
  } finally {
    await api.dispose();
  }
});
