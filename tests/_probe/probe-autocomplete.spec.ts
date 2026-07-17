import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';

/** THROWAWAY - dump the Reseller "is equal to" autocomplete options (distinguish duplicate partners). */
test('PROBE: reseller autocomplete options', async ({ page }) => {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);
  const reseller = DEAL_REGISTRATION.partnerCompanyName;

  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});
  await invoicePage.openCustomerInvoicesList();

  await invoicePage.openFiltersMenu();
  await page.locator("xpath=//button[contains(normalize-space(),'Add Custom Filter')] | //a[contains(normalize-space(),'Add Custom Filter')]").first().click();
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  await page.locator("xpath=//select[contains(@class,'o_searchview_extended_prop_field')]").first().selectOption({ label: 'Reseller' });
  await page.waitForTimeout(CommonUtils.waitTimes.standard);

  // Type the name in the m2o autocomplete (operator defaults to "is equal to").
  const input = page.locator("xpath=//span[contains(@class,'o_searchview_extended_prop_value')]//input").first();
  await input.click();
  await input.fill(reseller);
  await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
  const opts = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]'));
    return items.map((i) => ({ text: (i.textContent || '').replace(/\s+/g, ' ').trim(), html: (i as HTMLElement).outerHTML.slice(0, 300) }));
  });
  console.log(`\n===== RESELLER AUTOCOMPLETE OPTIONS (${opts.length}) =====`);
  opts.forEach((o, i) => console.log(`  [${i}] "${o.text}"\n       ${o.html}`));

  // Also: type with a broader token to see all same-named partners.
  await input.fill('TEST-Reseller#Automation');
  await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
  const opts2 = await page.evaluate(() => Array.from(document.querySelectorAll('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]')).map((i) => (i.textContent || '').replace(/\s+/g, ' ').trim()));
  console.log(`\n===== OPTIONS for "TEST-Reseller#Automation" (${opts2.length}) =====\n${JSON.stringify(opts2, null, 2)}`);
});
