import { test } from '@playwright/test';
import * as fs from 'fs';
import { users, baseUrl_support_mig } from '@config/users.config';
import { SupportDeskPageMig } from '@pages/mig';

/**
 * EXPLORE (kept per the never-delete-explore rule) - 2026-11-05, support-crm-mig. READ ONLY: opens an existing probe ticket
 * (X074B_TICKET, a TC-CUST-074_B probe kept with SKIP_CLEANUP, Jira reference already saved) as L2 engineer Nam and dumps
 * the header buttons and every header menu - TC-CUST-074_B Step 4 read only "Merge Ticket" while the tester sees
 * "Jira TEST-1427" in Actions as Administrator.
 */
test.use({ ignoreHTTPSErrors: true });
const OUT = process.env.EXPLORE_OUT || 'test-results/_explore-x074b';
fs.mkdirSync(OUT, { recursive: true });
const TICKET = process.env.X074B_TICKET || '13518';

for (const who of ['nam', 'admin'] as const) {
  test(`EXPLORE-X074B-2: header Actions menu of ticket ${TICKET} as ${who} (read only)`, async ({ page, context }) => {
    test.setTimeout(4 * 60_000);
    await context.route(/jira\.(example|nakivo)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stub</body></html>' }));
    const desk = new SupportDeskPageMig(page);
    const me = who === 'nam' ? users.support_l2_nam_support_mig : users.admin_support_mig;
    await desk.login(baseUrl_support_mig, me.username, me.password);
    await desk.openTicketByLink(baseUrl_support_mig, TICKET);
    await desk.waitForSidePanelRowValue('Jira reference', 'http://jira.nakivo.com/browse/TEST-1427');
    await page.waitForTimeout(3000);
    const head = page.locator('header').first();
    console.log(`[${who}] header buttons`, JSON.stringify(await head.locator('button, a').evaluateAll((els) => els.map((e) => `${e.tagName} "${(e as HTMLElement).innerText.replace(/\s+/g, ' ').trim()}" aria=${e.getAttribute('aria-label') || ''} vis=${(e as HTMLElement).getBoundingClientRect().width > 0}`))));
    await page.screenshot({ path: `${OUT}/x074b-2-${who}-header.png`, clip: { x: 900, y: 0, width: 1020, height: 120 } }).catch(() => {});
    const candidates = head.locator('button').filter({ hasNot: page.locator('input') });
    const n = await candidates.count();
    for (let i = 0; i < n; i++) {
      const b = candidates.nth(i);
      const label = ((await b.innerText().catch(() => '')) || (await b.getAttribute('aria-label')) || `#${i}`).replace(/\s+/g, ' ').trim();
      if (!/Actions|^#|^$/.test(label) && label.length > 0 && !/^\W*$/.test(label) && !/Actions/.test(label)) continue;
      await b.click({ timeout: 5000 }).catch((e) => console.log(`[${who}] click ${label}`, String(e).split('\n')[0]));
      await page.waitForTimeout(1500);
      const items = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts().catch(() => [] as string[]);
      console.log(`[${who}] button "${label}" -> menu ${JSON.stringify(items.map((t) => t.replace(/\s+/g, ' ').trim()))}`);
      await page.screenshot({ path: `${OUT}/x074b-2-${who}-menu-${i}.png` }).catch(() => {});
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }
  });
}
