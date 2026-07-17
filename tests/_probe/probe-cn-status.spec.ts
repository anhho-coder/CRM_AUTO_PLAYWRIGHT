import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/** THROWAWAY - read live status/reseller of the 2 CN the user sees. Delete after use. */
test('PROBE: CN live status', async ({ page }) => {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);

  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});
  const origin = new URL(page.url()).origin;

  for (const id of [196722, 196716]) { // CN/2026/0011, CN/2026/0010
    await page.goto(`${origin}/web?#id=${id}&action=289&model=account.invoice&view_type=form`, { waitUntil: 'domcontentloaded' });
    await invoicePage.dismissErrorDialogWithRetry();
    await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    const number = await invoicePage.getInvoiceNumber().catch(() => '(no number)');
    const reseller = await invoicePage.getReseller().catch(() => '(err)');
    const status = await invoicePage.getInvoiceStatus().catch(() => '(err)');
    const breadcrumb = await page.locator("xpath=//li[contains(@class,'breadcrumb-item') and contains(@class,'active')]").innerText().catch(() => '');
    const cancelBtn = await page.locator("xpath=//button[@name='action_invoice_cancel']").isVisible().catch(() => false);
    console.log(`\n===== id=${id} =====`);
    console.log(`  number="${number}" status="${status}" reseller="${reseller}" breadcrumb="${breadcrumb.replace(/\s+/g, ' ').trim()}" cancelBtnVisible=${cancelBtn}`);
  }
});
