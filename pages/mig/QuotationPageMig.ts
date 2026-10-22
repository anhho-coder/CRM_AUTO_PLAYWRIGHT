import { Page } from '@playwright/test';
import { QuotationPage } from '../QuotationPage';
import { CommonUtils } from '@helpers/common.utils';
import { readRowByAuthoredCaption } from './MigListCaption';

/**
 * Quotation / sale order on crm-mig. Only the Order Lines row reader differs: it keys each cell on the column
 * caption as authored, not on the theme's upper-cased header text (see MigListCaption).
 */
export class QuotationPageMig extends QuotationPage {
  constructor(page: Page) {
    super(page);
  }

  async getOrderLineRowCells(rowIndex: number = 0): Promise<Record<string, string>> {
    const table = this.page.locator('xpath=//div[@name="order_line"]//table').or(this.page.locator('div[name="order_line"] table')).first();
    return readRowByAuthoredCaption(table, rowIndex, CommonUtils.waitTimes.abnormalWait);
  }
}
