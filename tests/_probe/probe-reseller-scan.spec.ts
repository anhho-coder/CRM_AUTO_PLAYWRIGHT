import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';

/** THROWAWAY - Reseller-only filter, scan Status column across all pages. Delete after use. */
test('PROBE: reseller scan', async ({ page }) => {
  test.setTimeout(config.timeouts.test);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);
  const reseller = DEAL_REGISTRATION.partnerCompanyName;

  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.admin_crm.username, users.admin_crm.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});

  await invoicePage.openCustomerInvoicesList();
  await invoicePage.addInvoiceListCustomFilter('Reseller', reseller, { operator: 'contains' });
  await page.waitForTimeout(CommonUtils.waitTimes.extraLong);

  const readPage = async () => page.evaluate(() => {
    const table = document.querySelector('table.o_list_view');
    if (!table) return { rows: [] as { num: string; status: string }[], hasTable: false };
    const heads = Array.from(table.querySelectorAll('thead th')).map((h) => (h.textContent || '').trim());
    const statusIdx = heads.findIndex((h) => h === 'Status');
    const trs = Array.from(table.querySelectorAll('tbody tr.o_data_row'));
    const rows = trs.map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td'));
      const dataCells = Array.from(tr.querySelectorAll('td.o_data_cell'));
      return {
        num: dataCells[0] ? (dataCells[0].textContent || '').trim() : '',
        status: statusIdx >= 0 && cells[statusIdx] ? (cells[statusIdx].textContent || '').trim() : '',
      };
    });
    return { rows, hasTable: true };
  });

  const all: { num: string; status: string }[] = [];
  for (let p = 0; p < 6; p++) {
    await page.waitForTimeout(CommonUtils.waitTimes.long);
    const { rows, hasTable } = await readPage();
    console.log(`  page ${p + 1}: hasTable=${hasTable} rows=${rows.length}`);
    all.push(...rows);
    const next = page.locator('.o_pager_next, button[aria-label="Next"]').first();
    const canNext = await next.isEnabled().catch(() => false);
    const pagerTxt = ((await page.locator('.o_pager_counter, .o_pager').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (!canNext || /(\d+)\s*-\s*(\d+)\s*\/\s*\1?/.test('') || !/\/\s*\d+/.test(pagerTxt)) { /* noop */ }
    // Stop when the shown range end == total
    const m = pagerTxt.match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/);
    if (m && parseInt(m[2], 10) >= parseInt(m[3], 10)) break;
    if (!canNext) break;
    await next.click().catch(() => {});
  }

  const paid = all.filter((r) => /paid/i.test(r.status));
  console.log(`\n===== RESELLER SCAN =====`);
  console.log(`  total rows scanned: ${all.length}`);
  console.log(`  PAID rows (${paid.length}): ${JSON.stringify(paid)}`);
  console.log(`  CN/2026/0011 present: ${JSON.stringify(all.find((r) => r.num === 'CN/2026/0011') || null)}`);
  console.log(`  CN/2026/0010 present: ${JSON.stringify(all.find((r) => r.num === 'CN/2026/0010') || null)}`);
  const statuses = all.reduce((acc: Record<string, number>, r) => { const k = r.status || '(blank)'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  console.log(`  status histogram: ${JSON.stringify(statuses)}`);
});
