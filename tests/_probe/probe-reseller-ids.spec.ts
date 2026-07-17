import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/** THROWAWAY - read reseller_id partner id/href of the 2 CN vs a normal reseller invoice. Delete after use. */
test('PROBE: reseller ids', async ({ page }) => {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);
  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});
  const origin = new URL(page.url()).origin;

  for (const id of [196722, 196716]) { // CN/0011, CN/0010
    await page.goto(`${origin}/web?#id=${id}&action=289&model=account.invoice&view_type=form`, { waitUntil: 'domcontentloaded' });
    await invoicePage.dismissErrorDialogWithRetry();
    await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    const info = await page.evaluate(() => {
      const a = document.querySelector('a[name="reseller_id"]') as HTMLAnchorElement | null;
      const payer = document.querySelector('a[name="partner_id"]') as HTMLAnchorElement | null;
      return {
        resellerText: a ? (a.textContent || '').replace(/\s+/g, ' ').trim() : '(none)',
        resellerHref: a ? a.getAttribute('href') || '' : '',
        payerText: payer ? (payer.textContent || '').replace(/\s+/g, ' ').trim() : '(none)',
        payerHref: payer ? payer.getAttribute('href') || '' : '',
      };
    });
    console.log(`\n===== id=${id} =====`);
    console.log(`  reseller_id: "${info.resellerText}"  href=${info.resellerHref}`);
    console.log(`  partner_id (Payer): "${info.payerText}"  href=${info.payerHref}`);
  }
});
