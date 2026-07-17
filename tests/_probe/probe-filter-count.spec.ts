import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';

const SCRATCH = 'C:/Users/anh.ho/AppData/Local/Temp/claude/d--Automation-CRM/c301756a-1c24-4175-b7a5-34653cc0b8b6/scratchpad';

/** THROWAWAY - does conditional-reload fix the 2-filter render? Delete after use. */
test('PROBE: two-filter render', async ({ page }) => {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);
  const reseller = DEAL_REGISTRATION.partnerCompanyName;

  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});

  await invoicePage.openCustomerInvoicesList();
  await invoicePage.filterInvoicesByResellerAndStatus(reseller, 'Paid');
  await page.waitForTimeout(CommonUtils.waitTimes.extraLong);

  const st = async (label: string) => {
    const info = await page.evaluate(() => ({
      rawRows: document.querySelectorAll('tr.o_data_row').length,
      pager: (document.querySelector('.o_pager_counter, .o_pager') as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim() || '',
      hasListView: !!document.querySelector('table.o_list_view'),
      nocontent: !!document.querySelector('.o_view_nocontent, .oe_view_nocontent, .o_nocontent_help'),
      facets: Array.from(document.querySelectorAll('.o_searchview .o_facet_values, .o_searchview .o_facet'))
        .map((f) => (f as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
    }));
    console.log(`\n===== ${label} =====\n${JSON.stringify(info, null, 2)}`);
    await page.screenshot({ path: `${SCRATCH}/twofilter-${label}.png` }).catch(() => {});
    return info;
  };

  await st('A-after-two-filters');

  // If broken (rows 0 but pager not 0), try a NUDGE: re-trigger the search from the search box.
  const before = await page.evaluate(() => document.querySelectorAll('tr.o_data_row').length);
  if (before === 0) {
    console.log('  NUDGE: focusing search box + Enter to re-trigger the query');
    await page.locator('input.o_searchview_input').first().click().catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    await st('B-after-nudge');
  }
});
