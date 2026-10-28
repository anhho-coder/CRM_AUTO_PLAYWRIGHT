import { Page } from '@playwright/test';
import { QuotationPage } from '../QuotationPage';
import { CommonUtils } from '@helpers/common.utils';
import { readRowByAuthoredCaption } from './MigListCaption';
import { MigPlatformPage } from './MigPlatformPage';
import { baseUrl_mig } from '@config/users.config';

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

  // Locators - XPath primary, CSS fallback
  private readonly migOrderDateInput = () => this.page.locator('xpath=//input[@name="date_order"]').or(this.page.locator('input[name="date_order"]')).first();
  private readonly migPayerInput = () => this.page.locator('xpath=//div[@name="partner_id"]//input').or(this.page.locator('div[name="partner_id"] input')).first();

  /**
   * Move the Order Date by `days` (edit mode), keeping the date format and the time the form shows. The current
   * value is read from the input first, so nothing about the build's date format is hard-coded: "MM/DD/YYYY hh:mm:ss"
   * (en_US) and "YYYY-MM-DD hh:mm:ss" are both handled. Commits with Enter (setOrderDate).
   * @returns the value before, the value typed and whether the input read the typed value back
   */
  async shiftOrderDateByDays(days: number): Promise<{ before: string; typed: string; readBack: boolean }> {
    await this.clickOtherInformationTab();
    const input = this.migOrderDateInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const before = (await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait })).trim();
    const m = before.match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(.*)$/);
    if (!m) throw new Error(`Order Date "${before}" is in a format this method does not know`);
    const iso = m[1].length === 4;
    const [y, mo, d] = iso ? [Number(m[1]), Number(m[2]), Number(m[3])] : [Number(m[3]), Number(m[1]), Number(m[2])];
    const shifted = new Date(Date.UTC(y, mo - 1, d + days));
    const pad = (n: number) => String(n).padStart(2, '0');
    const yy = shifted.getUTCFullYear();
    const mm = pad(shifted.getUTCMonth() + 1);
    const dd = pad(shifted.getUTCDate());
    const typed = `${iso ? `${yy}-${mm}-${dd}` : `${mm}/${dd}/${yy}`}${m[4]}`;
    const readBack = await this.setOrderDate(typed);
    return { before, typed, readBack };
  }

  /**
   * Bring the "Order Lines" notebook page to the front and confirm it is the active page (shiftOrderDateByDays leaves
   * the form on Other Information, where the reward lines are not on screen). Bounded; never throws.
   * @returns whether the Order Lines page is active afterwards
   */
  async openOrderLinesTabMig(): Promise<boolean> {
    const tab = this.page.locator('xpath=//div[contains(concat(" ",normalize-space(@class)," ")," o_notebook ")]//a[contains(concat(" ",normalize-space(@class)," ")," nav-link ") and normalize-space(.)="Order Lines"]')
      .or(this.page.locator('.o_notebook .nav-link').filter({ hasText: /^\s*Order Lines\s*$/i })).first();
    if (!(await tab.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false))) return false;
    await tab.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.standard);
    const lines = this.page.locator('xpath=//div[@name="order_line"]').or(this.page.locator('div[name="order_line"]')).first();
    return lines.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
  }

  /** Whether the e-mail composer of Send by Email is still open. */
  async isEmailDialogOpen(): Promise<boolean> {
    const composer = this.page.locator('xpath=//div[contains(@class,"modal") and contains(@class,"show")]//*[@name="body" or @name="subject"]')
      .or(this.page.locator('.modal.show [name="subject"], .modal.show [name="body"]')).first();
    return composer.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
  }

  /** Reload the open record (a fresh read of what the server saved) and wait until the form view is back. */
  async reloadAndWaitForForm(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
    await this.page.locator('xpath=//div[contains(@class,"o_form_view")]').or(this.page.locator('.o_form_view')).first()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Set the quotation's Payer (partner_id, edit mode) with the repo's Many2one pattern: type the exact name, let the
   * autocomplete highlight it, press Enter, read it back. Throws when the field does not take the name after two tries.
   */
  async setPayer(name: string): Promise<string> {
    const input = this.migPayerInput();
    for (let attempt = 1; attempt <= 2; attempt++) {
      await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await input.fill('', { timeout: CommonUtils.waitTimes.abnormalWait });
      await input.fill(name, { timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.long); // let the autocomplete fetch and highlight the match
      await this.page.keyboard.press('Enter');
      await this.wait(CommonUtils.waitTimes.long); // the Payer onchange recomputes addresses / pricelist
      const current = (await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')).trim();
      if (current.includes(name)) {
        console.log(`  ✓ Payer = "${current}" (attempt ${attempt})`);
        return current;
      }
      console.log(`  ⚠ Payer reads "${current}" after attempt ${attempt}`);
    }
    throw new Error(`Payer could not be set to "${name}"`);
  }

  // ==========================================================================================
  //  Added 2026-10-26 for CRM-11857_4.3 / 4.6 / 8.4 (Exchange Rates on crm-mig). All bounded.
  // ==========================================================================================

  private readonly fxAmountTotal = () =>
    this.page.locator('xpath=//span[@name="amount_total"]').or(this.page.locator('span[name="amount_total"]')).first();
  private readonly fxPaymentTermInput = () =>
    this.page.locator('xpath=//div[@name="payment_term_id" and not(contains(@class,"o_invisible_modifier"))]//input')
      .or(this.page.locator('div[name="payment_term_id"]:not(.o_invisible_modifier) input')).first();
  private readonly fxAutocompleteItem = (text: RegExp) =>
    this.page.locator("xpath=//ul[contains(@class,'ui-autocomplete') and not(contains(@style,'display: none'))]//li[contains(@class,'ui-menu-item')]")
      .or(this.page.locator('ul.ui-autocomplete:visible li.ui-menu-item')).filter({ hasText: text }).first();
  private readonly fxSaveButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_form_button_save")]').or(this.page.locator('button.o_form_button_save')).first();
  private readonly fxEditButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_form_button_edit")]').or(this.page.locator('button.o_form_button_edit')).first();
  private readonly fxListTable = () =>
    this.page.locator('xpath=//table[contains(@class,"o_list_view") or contains(@class,"o_list_table")]')
      .or(this.page.locator('table.o_list_view, table.o_list_table')).first();

  /** The quotation grand Total exactly as the form shows it, currency symbol included (e.g. "€ 1,135.00"). */
  async getAmountTotalRaw(): Promise<string> {
    const field = this.fxAmountTotal();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const raw = ((await field.innerText({ timeout: CommonUtils.waitTimes.abnormalWait })) || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`  - Quotation Total (raw) : "${raw}"`);
    return raw;
  }

  /**
   * Set Payment Terms (edit mode): type the term, click the option whose text is exactly the term, read it back.
   * Throws when the option never appears or the field does not keep the term.
   */
  async setPaymentTermMig(term: string): Promise<string> {
    const input = this.fxPaymentTermInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill(term, { timeout: CommonUtils.waitTimes.abnormalWait });
    const option = this.fxAutocompleteItem(new RegExp(`^\\s*${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`));
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await option.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    const readBack = ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    if (readBack !== term) throw new Error(`Payment Terms reads "${readBack}" after picking "${term}"`);
    console.log(`  - Payment Terms = "${readBack}"`);
    return readBack;
  }

  /**
   * Set the Pricelist (edit mode) to exactly `pricelistName` as Odoo 12 displays it: "<name> (<CUR>)".
   * Not setQuotationPricelist() (Enter takes the FIRST suggestion): crm-mig also holds a USD pricelist literally NAMED
   * "Public Pricelist_EUR (EUR)" (id 100000000, measured 2026-10-26), so the option is matched on its exact text.
   */
  async setPricelistExactMig(displayName: string): Promise<string> {
    const input = this.page.locator('xpath=//div[@name="pricelist_id" and not(contains(@class,"o_invisible_modifier"))]//input')
      .or(this.page.locator('div[name="pricelist_id"]:not(.o_invisible_modifier) input')).first();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill('', { timeout: CommonUtils.waitTimes.abnormalWait });
    // type the bare name (the part before " (CUR)"), so the search offers it
    const bare = displayName.replace(/\s*\([A-Z]{3}\)\s*$/, '');
    await input.fill(bare, { timeout: CommonUtils.waitTimes.abnormalWait });
    const option = this.fxAutocompleteItem(new RegExp(`^\\s*${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`));
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await option.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long); // pricelist onchange
    // Odoo 12 may raise a warning dialog on a pricelist change - report it, never swallow it silently
    const popup = (await this.getBlockingPopupText(CommonUtils.waitTimes.standard).catch(() => '')).replace(/\s+/g, ' ').trim();
    if (popup) console.log(`  - dialog after the pricelist change: "${popup.slice(0, 300)}"`);
    const readBack = ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    console.log(`  - Pricelist reads "${readBack}"`);
    return readBack;
  }

  /**
   * URL of the Sales > Orders > Quotations LIST (the view that carries the optional "Total in Company Currency" column),
   * opened by its ACTION, resolved from its XML id at run time (ids are re-issued by every rebuild).
   *
   * Why not the menu: Faye Nguyen (CRM-11857_8.4) has no "Sales" app on crm-mig - menu Sales > Orders > Quotations is
   * limited to groups 11 / 143 - while the action itself (sale.action_quotations_with_onboarding, view sale.order.tree
   * 808) carries no group. The list she does see, CRM > Sales > My Quotations (sale.action_quotations), uses the plain
   * view WITHOUT that column (run of 2026-10-26 12:33: column absent, value "").
   */
  async quotationsListUrlByActionXmlIdMig(xmlId: string = 'sale.action_quotations_with_onboarding'): Promise<string> {
    const [module, name] = xmlId.split('.');
    const rows = await new MigPlatformPage(this.page).callKw<Array<{ res_id: number }>>(
      'ir.model.data', 'search_read', [[['module', '=', module], ['name', '=', name], ['model', '=', 'ir.actions.act_window']], ['res_id']], { limit: 1 });
    if (!rows.length) throw new Error(`QuotationPageMig: action ${xmlId} not found (or ir.model.data not readable by this user)`);
    const url = `${baseUrl_mig}web?#action=${rows[0].res_id}&model=sale.order&view_type=list`;
    console.log(`  - ${xmlId} -> ${url}`);
    return url;
  }

  /**
   * Make a list column visible through the "Show / hide columns" dropdown (module web_dynamic_list) of the list on
   * screen. Measured on crm-mig 2026-10-26 (EXPLORE-20261026_21): every entry is a SWITCH (input.columnCheckbox[name=<field>]
   * + button.btn-toggle) - clicking the entry's label does nothing, which is why the base toggling in
   * getTotalInCompanyCurrencyForQuotationId() only works for a user who already has the column on (the admin). The first
   * switch a user flips CREATES an ir.listview.columns row (that user, that view) - the caller registers it for teardown.
   * @returns true when this call flipped the switch, false when the column was already on
   */
  async ensureListColumnShownMig(fieldName: string): Promise<boolean> {
    const toggle = this.page.locator('xpath=//button[@id="dyncolbtn" or contains(@class,"o_customize_btn")]')
      .or(this.page.locator('#dyncolbtn, .o_control_panel button.o_customize_btn')).first();
    await toggle.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await toggle.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const box = this.page.locator(`xpath=//ul[contains(@class,"dropdown-menu") and contains(@class,"show")]//input[contains(@class,"columnCheckbox") and @name="${fieldName}"] | //div[contains(@class,"dropdown-menu") and contains(@class,"show")]//input[contains(@class,"columnCheckbox") and @name="${fieldName}"]`)
      .or(this.page.locator(`.dropdown-menu.show input.columnCheckbox[name="${fieldName}"]`)).first();
    await box.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    const on = await box.isChecked({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!on) {
      const sw = this.page.locator(`.dropdown-menu.show input.columnCheckbox[name="${fieldName}"] ~ button.btn-toggle`).first();
      await sw.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await this.wait(CommonUtils.waitTimes.extraLong);
    }
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - List column "${fieldName}": ${on ? 'already shown' : 'switched ON through "Show / hide columns"'}`);
    return !on;
  }

  /**
   * Re-open a quotation by its record id (URL-hash navigation) and wait until the form is back in READ mode (EDIT button).
   * Used after a list read left the browser on the Quotations list (CRM-11857_4.6 / 8.4 step 7).
   */
  async openByIdMig(quotationId: number | string): Promise<void> {
    await this.page.evaluate(() => { (window as unknown as { onbeforeunload: unknown }).onbeforeunload = null; }).catch(() => {});
    await this.page.goto(`${baseUrl_mig}web?#id=${quotationId}&model=sale.order&view_type=form`, {
      waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.abnormalWait,
    });
    await this.fxEditButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
  }

  /** The text of the open dialog, '' when none (exposed for the evidence log). */
  async getOpenDialogText(): Promise<string> {
    return (await this.getBlockingPopupText(CommonUtils.waitTimes.standard).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Press SAVE (bounded) and wait until the form is back in read mode (EDIT button visible). */
  async saveAndWaitForReadModeMig(): Promise<void> {
    await this.fxSaveButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const back = await this.fxEditButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.savingPage * 2 })
      .then(() => true).catch(() => false);
    if (!back) {
      const popup = (await this.getBlockingPopupText(CommonUtils.waitTimes.standard).catch(() => '')).replace(/\s+/g, ' ').trim();
      throw new Error(`The quotation did not return to read mode after SAVE${popup ? ` - dialog: "${popup.slice(0, 300)}"` : ''}`);
    }
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * One cell of the list CURRENTLY on screen (e.g. the Quotations list that getTotalInCompanyCurrencyForQuotationId()
   * left filtered on one ID), by column header text (case-insensitive), on the FIRST data row.
   * @returns headers (evidence), rows = data rows on screen, raw = the cell text ('' when absent)
   */
  async readListCellByHeaderMig(header: string): Promise<{ headers: string[]; rows: number; raw: string }> {
    const table = this.fxListTable();
    await table.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const out = await table.evaluate((el: HTMLElement, h: string) => {
      const norm = (s: string | null) => (s || '').replace(/​/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
      const ths = Array.from(el.querySelectorAll('thead th'));
      const headers = ths.map((t) => norm(t.textContent)).filter(Boolean);
      const idx = ths.findIndex((t) => norm(t.textContent).toLowerCase() === h.toLowerCase());
      const rows = Array.from(el.querySelectorAll('tbody tr.o_data_row'));
      if (idx < 0 || rows.length === 0) return { headers, rows: rows.length, raw: '' };
      const cell = rows[0].querySelectorAll('td')[idx] as HTMLElement | undefined;
      return { headers, rows: rows.length, raw: cell ? norm(cell.textContent) : '' };
    }, header, { timeout: CommonUtils.waitTimes.abnormalWait });
    console.log(`  - List cell "${header}" (first row of ${out.rows}): "${out.raw}"`);
    return out;
  }
}
