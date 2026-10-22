import { Page } from '@playwright/test';
import { InvoicePageMig } from './InvoicePageMig';
import { CommonUtils } from '@helpers/common.utils';
import { readRowByAuthoredCaption } from './MigListCaption';

/**
 * Customer invoice on crm-mig, for suites that assert on invoice-line VALUES (CRM-12144 Discounts). Same as
 * InvoicePageMig, except that the Invoice Lines row reader keys each cell on the column caption as authored, not on
 * the theme's upper-cased header text (see MigListCaption). InvoicePageMig itself is left unchanged for its suites.
 */
export class InvoiceLinesPageMig extends InvoicePageMig {
  constructor(page: Page) {
    super(page);
  }

  async getInvoiceLineRowCells(rowIndex: number = 0): Promise<Record<string, string>> {
    const table = this.page.locator('xpath=//div[@name="invoice_line_ids"]//table').or(this.page.locator('div[name="invoice_line_ids"] table')).first();
    return readRowByAuthoredCaption(table, rowIndex, CommonUtils.waitTimes.abnormalWait);
  }
}
