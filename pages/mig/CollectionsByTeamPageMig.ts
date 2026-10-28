import { Locator } from '@playwright/test';
import { BasePage } from '@pages/BasePage';
import { CommonUtils } from '@helpers/common.utils';
import { resolveScreenIds, SCREEN_XMLIDS } from '@helpers/odoo-xmlid.helper';

/** One data row of the report, keyed by the column header text exactly as the list shows it. */
export type CollectionRow = Record<string, string>;

/**
 * Invoicing > Customers > Collections by Team (model nakivo.collections.report) on crm-mig.
 *
 * Opened by its XML ids - a crm-mig rebuild re-sequences menu and action ids, so no ids are hard-coded.
 * Verified on crm-mig 2026-10-22 (EXPLORE-20261022_12):
 *  - the list opens with the facets "This Month" and "Sales Team" (group by Sales Team);
 *  - columns: Payment Date | Invoice | Customer | Sales Team | Salesperson | Amount (Doc Currency) |
 *    Currency | Amount (Company Currency) | Payment | Payment Journal | Invoice Type;
 *  - the search box ignores fill(): the customer is typed with key events, then the
 *    "Search Customer for: <name>" option is chosen, which adds the facet "Customer <name>".
 */
export class CollectionsByTeamPageMig extends BasePage {
  // ─── Locators (XPath primary, CSS fallback) ───────────────────────────────
  protected readonly listView = (): Locator =>
    this.page.locator('xpath=//*[contains(@class,"o_list_view")]').or(this.page.locator('.o_list_view')).first();
  protected readonly dataRows = (): Locator =>
    this.page.locator('xpath=//*[contains(@class,"o_list_view")]//tbody//tr[contains(@class,"o_data_row")]')
      .or(this.page.locator('.o_list_view tbody tr.o_data_row'));
  protected readonly searchInput = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview")]//input[contains(@class,"o_searchview_input")]')
      .or(this.page.locator('.o_searchview input.o_searchview_input')).first();
  protected readonly customerOption = (): Locator =>
    this.page.locator('xpath=//ul[contains(@class,"o_searchview_autocomplete")]//li[contains(normalize-space(.),"Search Customer for")]')
      .or(this.page.locator('.o_searchview_autocomplete li').filter({ hasText: 'Search Customer for' }))
      .first();
  protected readonly salesTeamFacetRemove = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview_facet")][.//*[normalize-space(.)="Sales Team"]]//*[contains(@class,"o_facet_remove")]')
      .or(this.page.locator('.o_searchview_facet').filter({ hasText: 'Sales Team' }).locator('.o_facet_remove'))
      .first();

  /**
   * Open the report from its XML ids.
   * @returns true when the list view is on screen
   */
  async open(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const origin = new URL(this.page.url()).origin;
    const ids = await resolveScreenIds(this.page, SCREEN_XMLIDS.collectionsByTeam);
    console.log(`  - Opening Collections by Team (menu ${ids.menuId}, action ${ids.actionId})`);
    await this.page.goto(`${origin}/web?#menu_id=${ids.menuId}&action=${ids.actionId}&model=nakivo.collections.report&view_type=list`,
      { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.abnormalWait });
    const listed = await this.listView().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    console.log(`  - Collections by Team list on screen: ${listed}`);
    return listed;
  }

  /**
   * Search the report by customer: type the name, then choose "Search Customer for: <name>".
   * @returns true when the "Customer <name>" facet is applied
   */
  async searchCustomer(customerName: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    console.log(`  - Searching Customer = ${customerName}`);
    await this.searchInput().click({ timeout });
    await this.page.keyboard.type(customerName, { delay: 30 });
    const offered = await this.customerOption().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!offered) {
      console.log(`  ! No "Search Customer for: ${customerName}" option was offered`);
      return false;
    }
    await this.customerOption().click({ timeout });
    const facet = this.page.locator('.o_searchview_facet').filter({ hasText: `Customer ${customerName}` }).first();
    const applied = await facet.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    await this.wait(CommonUtils.waitTimes.standard);
    return applied;
  }

  /**
   * Remove the "Sales Team" group-by facet so the matching rows are listed one per line.
   * @returns true when no grouping facet is left
   */
  async removeSalesTeamGrouping(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const remove = this.salesTeamFacetRemove();
    if (await remove.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false)) {
      await remove.click({ timeout });
      await this.wait(CommonUtils.waitTimes.standard);
    }
    return !(await remove.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false));
  }

  /**
   * Every data row of the list, keyed by its column header text.
   * Mapped by HEADER NAME, not by position: the first cell of an Odoo list row is the record checkbox.
   */
  async getRows(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<CollectionRow[]> {
    await this.dataRows().first().waitFor({ state: 'visible', timeout }).catch(() => {});
    const rows = await this.page.evaluate(() => {
      // Odoo puts o_list_view on the <table> itself in some builds and on a wrapper in others: take the visible one.
      const table = Array.from(document.querySelectorAll('.o_list_view')).find((el) => (el as HTMLElement).offsetParent !== null);
      if (!table) return [] as Array<Record<string, string>>;
      const headers = Array.from(table.querySelectorAll('thead th'))
        .map((th) => (th.textContent || '').replace(/\s+/g, ' ').trim());
      return Array.from(table.querySelectorAll('tbody tr.o_data_row')).map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td'));
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (h && cells[i]) row[h] = (cells[i].textContent || '').replace(/\s+/g, ' ').trim();
        });
        return row;
      });
    }).catch(() => [] as Array<Record<string, string>>);
    console.log(`  - Collections by Team rows listed: ${rows.length}`);
    return rows;
  }

  /** "€ 863.60" / "$ 969.39" / "1,234.50" -> 863.6 / 969.39 / 1234.5 (NaN when the text holds no number). */
  static parseAmount(text: string | null | undefined): number {
    const cleaned = String(text ?? '').replace(/,/g, '').replace(/[^0-9.-]/g, '');
    return cleaned ? parseFloat(cleaned) : NaN;
  }
}
