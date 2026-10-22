import { Page } from '@playwright/test';
import { DealElementPage } from '../DealElementPage';
import { CommonUtils } from '@helpers/common.utils';
import { readRowByAuthoredCaption } from './MigListCaption';

/**
 * Deal Element on crm-mig. Only the Order Lines row reader differs: it keys each cell on the column caption as
 * authored, not on the theme's upper-cased header text (see MigListCaption). Every base method that reads rows
 * (getAllOrderLineRows, waitForOrderLineCell, addOrderLineStrict, ...) goes through this override.
 */
export class DealElementPageMig extends DealElementPage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Breadcrumb back to the parent Opportunity. The base locator wants `li.breadcrumb-item.o_back_button`, which the
   * Mig theme does not render (CRM-12144_2.1, 2026-10-21: 30 s wait, then failed) - the crm-mig breadcrumb is
   * "<list> / <opportunity> / <deal element>", so the opportunity is the LAST link of the trail.
   */
  async clickBackToOpportunity(): Promise<void> {
    const links = this.page.locator('xpath=//ol[contains(@class,"breadcrumb")]/li/a').or(this.page.locator('.o_control_panel .breadcrumb li a'));
    await links.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const n = await links.count();
    const link = links.nth(n - 1);
    const caption = ((await link.innerText().catch(() => '')) || '').trim();
    await link.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForURL('**/web?*model=crm.lead*', CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    console.log(`  ✓ Back on the opportunity through the breadcrumb "${caption}"`);
  }

  async getOrderLineRowCells(rowIndex: number = 0): Promise<Record<string, string>> {
    const table = this.page.locator('xpath=//div[contains(@class,"o_notebook")]//div[contains(@class,"tab-pane") and contains(@class,"active")]//table[contains(@class,"o_list_view")]')
      .or(this.page.locator('.o_notebook .tab-pane.active table.o_list_view'))
      .first();
    return readRowByAuthoredCaption(table, rowIndex, CommonUtils.waitTimes.abnormalWait);
  }
}
