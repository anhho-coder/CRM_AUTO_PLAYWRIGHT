import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Currency Page Object (Invoicing > Configuration > Currencies, model res.currency, list view).
 *
 * The Currencies list columns on this Odoo 12 build are:
 *   [selector] | Currency (e.g. "EUR") | Symbol | Date | Current Rate | Active
 * "Current Rate" is the today-effective exchange rate ("Unit per USD") read by ExchangeRate-1.1.
 *
 * Navigation is by the Invoicing menu action hash (menu_id=163&action=64), captured live; the
 * list <table> itself carries the class `o_list_view` in this build.
 */
export class CurrencyPage extends BasePage {
  // ─── Locators (XPath primary, CSS fallback) ───────────────────────────────
  private readonly listTable        = () => this.page.locator('xpath=//table[contains(@class,"o_list_view")]').or(this.page.locator('table.o_list_view')).first();
  private readonly anyDataRow       = () => this.page.locator('xpath=//tr[contains(@class,"o_data_row")]').or(this.page.locator('tr.o_data_row')).first();
  // The "Current Rate" cell (o_list_number) in the data row whose Currency cell text == the code.
  private readonly currencyRateCell = (code: string) =>
    this.page.locator(`xpath=//table[contains(@class,"o_list_view")]//tr[contains(@class,"o_data_row")][td[normalize-space()="${code}"]]/td[contains(@class,"o_list_number")]`)
      .or(this.page.locator(`tr.o_data_row:has(td:text-is("${code}")) td.o_list_number`)).first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Open Invoicing > Configuration > Currencies (model res.currency, list view) via the menu action
   * hash, dismiss any Odoo error popup, and wait for the list rows to render.
   * @param timeout - max time to wait for the list (default: pageLoad)
   */
  async openCurrenciesList(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    console.log('  - Opening Invoicing > Configuration > Currencies');
    await this.page.goto(`${origin}/web?#menu_id=163&action=64`, { waitUntil: 'domcontentloaded' });
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.listTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.anyDataRow().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Currencies list opened');
  }

  /**
   * Read the "Current Rate" of a currency directly from the rate column (e.g. EUR -> "0.851861").
   * This is the today-effective rate ("Unit per USD") used by ExchangeRate-1.1.
   * Tries the XPath/CSS row-targeted locator first, then a header-resolved JS fallback (resolves the
   * "Current Rate" column by header text so it survives a column re-order).
   * @param currencyCode - the currency code shown in the Currency column, e.g. "EUR"
   * @param timeout - max time to wait for the cell (default: abnormalWait)
   * @returns the rate as a numeric string (digits + dot only), e.g. "0.851861"
   */
  async getCurrencyRate(currencyCode: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    let raw = '';
    const cell = this.currencyRateCell(currencyCode);
    const visible = await cell.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (visible) {
      raw = ((await cell.innerText().catch(() => '')) || '').trim();
    }

    // Header-resolved fallback: find the "Current Rate" column index and read the matching row's cell.
    if (!raw) {
      raw = await this.page.evaluate((code: string) => {
        const table = document.querySelector('table.o_list_view') || document.querySelector('.o_list_view table');
        if (!table) return '';
        const headers = Array.from(table.querySelectorAll('thead th'));
        const colIdx = headers.findIndex((h) => (h.textContent || '').trim().startsWith('Current Rate'));
        if (colIdx === -1) return '';
        const rows = Array.from(table.querySelectorAll('tbody tr.o_data_row'));
        for (const r of rows) {
          const cells = Array.from(r.querySelectorAll('td'));
          if (cells.some((td) => (td.textContent || '').trim() === code)) {
            return cells[colIdx] ? (cells[colIdx].textContent || '').trim() : '';
          }
        }
        return '';
      }, currencyCode).catch(() => '');
    }

    // Normalise "1,234.56" -> "1234.56" (strip thousands separators / whitespace).
    const normalized = raw.replace(/[^0-9.]/g, '');
    console.log(`  ✓ ${currencyCode} Current Rate: "${normalized}" (raw: "${raw}")`);
    return normalized;
  }
}
