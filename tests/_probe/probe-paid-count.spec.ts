import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';

/** THROWAWAY - global Paid count + how reseller-1 rows appear among Paid. Delete after use. */
test('PROBE: paid count', async ({ page }) => {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);
  const target = DEAL_REGISTRATION.partnerCompanyName;

  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});
  await invoicePage.openCustomerInvoicesList();

  // Single filter: Status = Paid.
  await invoicePage.addInvoiceListCustomFilter('Status', 'Paid');
  await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
  const info = await page.evaluate((tgt: string) => {
    const pager = (document.querySelector('.o_pager_counter, .o_pager') as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim() || '';
    const table = document.querySelector('table.o_list_view');
    let resellerIdx = -1;
    const resellers: Record<string, number> = {};
    let targetOnPage = 0;
    if (table) {
      const heads = Array.from(table.querySelectorAll('thead th')).map((h) => (h.textContent || '').trim());
      resellerIdx = heads.findIndex((h) => h === 'Reseller');
      const rows = Array.from(table.querySelectorAll('tbody tr.o_data_row'));
      rows.forEach((r) => {
        const cells = Array.from(r.querySelectorAll('td'));
        const rr = resellerIdx >= 0 && cells[resellerIdx] ? (cells[resellerIdx].textContent || '').replace(/\s+/g, ' ').trim() : '';
        resellers[rr || '(blank)'] = (resellers[rr || '(blank)'] || 0) + 1;
        if (rr === tgt) targetOnPage++;
      });
    }
    return { pager, hasTable: !!table, resellerIdx, targetOnPage, distinctResellersOnPage: Object.keys(resellers).length, sample: resellers };
  }, target);
  console.log('\n===== STATUS=PAID GLOBAL =====');
  console.log(`  pager="${info.pager}" hasTable=${info.hasTable} resellerColIdx=${info.resellerIdx}`);
  console.log(`  target rows on page 1: ${info.targetOnPage}`);
  console.log(`  distinct resellers on page 1: ${info.distinctResellersOnPage}`);
  console.log(`  reseller histogram (page 1): ${JSON.stringify(info.sample)}`);
});
