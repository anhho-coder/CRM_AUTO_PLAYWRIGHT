import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';

/** THROWAWAY - can "Commercial Entity" (or Payer) + Paid reach the CN? Delete after use. */
test('PROBE: commercial entity filter', async ({ page }) => {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);
  const reseller = DEAL_REGISTRATION.partnerCompanyName;

  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});

  const tryField = async (fieldLabel: string) => {
    await invoicePage.openCustomerInvoicesList();
    await invoicePage.addInvoiceListCustomFilter(fieldLabel, reseller, {}); // m2o "is equal to" pick
    await invoicePage.addInvoiceListCustomFilter('Status', 'Paid');
    await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    const count = await invoicePage.getInvoiceListRowCount(CommonUtils.waitTimes.abnormalWait);
    const numbers = await invoicePage.getAllRowInvoiceNumbers();
    const pager = await invoicePage.getListPagerTotal();
    console.log(`\n===== "${fieldLabel}" + Paid =====  count=${count} pagerTotal=${pager} numbers=${JSON.stringify(numbers)}`);
  };

  await tryField('Commercial Entity');
  await tryField('Payer');
});
