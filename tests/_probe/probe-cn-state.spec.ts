import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/** THROWAWAY - read the REAL state (statusbar data-value) of CN/0011 & CN/0010. Delete after use. */
test('PROBE: CN real state', async ({ page }) => {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);
  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});
  const origin = new URL(page.url()).origin;

  for (const id of [196722, 196716]) {
    await page.goto(`${origin}/web?#id=${id}&action=289&model=account.invoice&view_type=form`, { waitUntil: 'domcontentloaded' });
    await invoicePage.dismissErrorDialogWithRetry();
    await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    const bar = await page.evaluate(() => {
      const c = document.querySelector('.o_statusbar_status');
      if (!c) return { active: '', buttons: [] as { v: string; t: string; on: boolean }[] };
      const btns = Array.from(c.querySelectorAll('button')).map((b) => ({
        v: b.getAttribute('data-value') || '',
        t: (b.textContent || '').replace(/\s+/g, ' ').trim(),
        on: b.getAttribute('aria-checked') === 'true' || b.classList.contains('btn-primary'),
      }));
      const active = btns.find((x) => x.on);
      return { active: active ? `${active.v} (${active.t})` : '', buttons: btns };
    });
    console.log(`\n===== id=${id} =====  ACTIVE state = "${bar.active}"`);
    console.log(`  statusbar buttons: ${JSON.stringify(bar.buttons)}`);
  }
});
