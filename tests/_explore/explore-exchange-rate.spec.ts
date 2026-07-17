import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';

/** THROWAWAY: debug the Invoices-list search using REAL keystrokes (so the autocomplete populates). */
const DUMP = path.join(process.cwd(), 'tests', '_explore', '_dumps');
function dump(name: string, content: string) {
  fs.mkdirSync(DUMP, { recursive: true });
  fs.writeFileSync(path.join(DUMP, name), content, 'utf8');
  console.log(`[dump] ${name} (${content.length})`);
}
const INV = 'INV/2026/1713';

async function readRows(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    const table = document.querySelector('table.o_list_view') || document.querySelector('.o_list_view table');
    if (!table) return { found: false, rowCount: 0, headers: [], rows: [] as any[] };
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent || '').replace(/\s+/g, ' ').trim());
    const numIdx = headers.findIndex((h) => h === 'Number');
    const tcIdx = headers.findIndex((h) => h.startsWith('Total in Company Currency'));
    const rows = Array.from(table.querySelectorAll('tbody tr.o_data_row')).slice(0, 12).map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim());
      return { number: cells[numIdx], totalCompany: cells[tcIdx], cells };
    });
    return { found: true, rowCount: rows.length, numIdx, tcIdx, headers, rows };
  });
}

test.describe('EXPLORE exchange rate search v2', () => {
  test('explore: search invoices by number with keystrokes', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    await loginPage.navigateTo(baseUrl);
    await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
    await loginPage.dismissLocationPermissionDialog().catch(() => {});

    await page.goto(`${baseUrl}web?#menu_id=180&action=289`, { waitUntil: 'domcontentloaded' });
    await invoicePage.dismissErrorDialogWithRetry().catch(() => {});
    await page.locator('tr.o_data_row').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await page.waitForTimeout(CommonUtils.waitTimes.long);

    // Type with REAL keystrokes so the searchview autocomplete dropdown populates.
    const search = page.locator('input.o_searchview_input').first();
    await search.click();
    await search.pressSequentially(INV, { delay: 40 });
    await page.waitForTimeout(CommonUtils.waitTimes.long);

    const dropdown = await page.evaluate(() => {
      const root = document.querySelector('.o_searchview_autocomplete') || document.querySelector('.o_searchview .dropdown-menu');
      const items = root ? Array.from(root.querySelectorAll('li')) : [];
      return {
        rootCls: root ? root.className : '(none)',
        items: items.map((el) => ({ text: (el.textContent || '').replace(/\s+/g, ' ').trim(), cls: el.getAttribute('class') || '' })),
      };
    });
    dump('ER-v2-dropdown.json', JSON.stringify(dropdown, null, 2));

    // Press Enter (applies the focused/first option) and read the filtered list.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    await page.locator('tr.o_data_row').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    dump('ER-v2-after-enter.json', JSON.stringify(await readRows(page), null, 2));

    const facet = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.o_searchview .o_facet_values, .o_facet, .o_searchview_facet, .o_facet_value')).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
    dump('ER-v2-facet.json', JSON.stringify(facet, null, 2));

    console.log('Exchange-rate SEARCH v2 explore done');
  });
});
