import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';

/** THROWAWAY - inspect the Reseller custom-filter VALUE widget for operator "contains". Delete after use. */
test('PROBE: contains widget', async ({ page }) => {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);
  const reseller = DEAL_REGISTRATION.partnerCompanyName;

  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});
  await invoicePage.openCustomerInvoicesList();

  // Open Filters > Add Custom Filter, select Reseller, select operator "contains".
  await invoicePage.openFiltersMenu();
  await page.locator("xpath=//button[contains(normalize-space(),'Add Custom Filter')] | //a[contains(normalize-space(),'Add Custom Filter')]").first().click();
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  await page.locator("xpath=//select[contains(@class,'o_searchview_extended_prop_field')]").first().selectOption({ label: 'Reseller' });
  await page.waitForTimeout(CommonUtils.waitTimes.standard);

  const dumpValue = async (opLabel: string) => {
    await page.locator("xpath=//select[contains(@class,'o_searchview_extended_prop_op')]").first().selectOption({ label: opLabel });
    await page.waitForTimeout(CommonUtils.waitTimes.long);
    const html = await page.evaluate(() => {
      const span = document.querySelector('span.o_searchview_extended_prop_value');
      return span ? (span as HTMLElement).outerHTML.slice(0, 800) : '(no value span)';
    });
    console.log(`\n===== operator "${opLabel}" value widget =====\n${html}`);
  };
  await dumpValue('is equal to');
  await dumpValue('contains');

  // Type the name under "contains" and see if a dropdown appears.
  const input = page.locator("xpath=//span[contains(@class,'o_searchview_extended_prop_value')]//input | //input[contains(@class,'o_searchview_extended_prop_value')]").first();
  await input.click().catch(() => {});
  await input.fill(reseller).catch(() => {});
  await page.waitForTimeout(CommonUtils.waitTimes.long);
  const dd = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]'));
    return items.map((i) => (i.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  });
  console.log(`\n  dropdown after typing under "contains": ${JSON.stringify(dd)}`);
});
