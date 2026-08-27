import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/** One row of a currency's rate history, as shown on the "Currency Rates" list. */
export interface CurrencyRateRow {
  /** Date normalised to ISO `YYYY-MM-DD` (the list itself renders `MM/DD/YYYY`). */
  date: string;
  /** Rate as a number, e.g. 0.862589. */
  rate: number;
  /** Raw Date cell text exactly as rendered, e.g. "08/18/2026". */
  rawDate: string;
  /** Raw Rate cell text exactly as rendered, e.g. "0.862589". */
  rawRate: string;
}

/**
 * Currency Page Object (Invoicing > Configuration > Accounting > Currencies, model res.currency).
 *
 * The Currencies list columns on this Odoo 12 build are:
 *   [selector] | Currency (e.g. "EUR") | Symbol | Date | Current Rate | Active
 * "Current Rate" is the today-effective exchange rate ("Unit per USD") read by ExchangeRate-1.1.
 *
 * A currency's rate HISTORY is not a notebook tab - it is a stat button labelled "Rates" in the
 * button box at the top right of the currency form (next to the Active / Inactive marker). Clicking
 * it opens a separate list titled "Currency Rates" (model res.currency.rate, action 63) with the
 * breadcrumb "Currencies / <CODE> / Currency Rates" and the columns Date | Rate | Company.
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
  // The whole data row for a currency code - clicked to open the currency form.
  private readonly currencyRow      = (code: string) =>
    this.page.locator(`xpath=//table[contains(@class,"o_list_view")]//tr[contains(@class,"o_data_row")][td[normalize-space()="${code}"]]`)
      .or(this.page.locator(`tr.o_data_row:has(td:text-is("${code}"))`)).first();
  // The "Rates" stat button in the button box at the top right of the currency form.
  private readonly ratesStatButton  = () =>
    this.page.locator('xpath=//div[contains(@class,"oe_button_box")]//button[contains(normalize-space(.),"Rates")]')
      .or(this.page.locator('.oe_button_box button:has-text("Rates")')).first();
  private readonly formView         = () =>
    this.page.locator('xpath=//div[contains(@class,"o_form_view")]').or(this.page.locator('.o_form_view')).first();
  private readonly breadcrumb       = () =>
    this.page.locator('xpath=//ol[contains(@class,"breadcrumb")]').or(this.page.locator('ol.breadcrumb')).first();
  // Pager text at the top right of a list, e.g. "1-80 / 2471".
  private readonly pagerCounter     = () =>
    this.page.locator('xpath=//span[contains(@class,"o_pager_counter")]').or(this.page.locator('.o_pager_counter')).first();
  private readonly pagerValue       = () =>
    this.page.locator('xpath=//span[contains(@class,"o_pager_value")]').or(this.page.locator('.o_pager_value')).first();
  private readonly pagerLimit       = () =>
    this.page.locator('xpath=//span[contains(@class,"o_pager_limit")]').or(this.page.locator('.o_pager_limit')).first();
  // A list column header carrying the given label (used to sort / resolve column order).
  private readonly columnHeader     = (label: string) =>
    this.page.locator(`xpath=//table[contains(@class,"o_list_view")]//thead//th[normalize-space()="${label}"]`)
      .or(this.page.locator(`table.o_list_view thead th:text-is("${label}")`)).first();
  // The "Applications" launcher in the navbar, and an app tile inside it (used to enter a module the
  // way a user does, which is the only way the module's own menu bar gets rendered).
  private readonly applicationsLauncher    = () =>
    this.page.locator('xpath=//a[@title="Applications"]').or(this.page.locator('//button[contains(., "Applications")]')).first();
  private readonly appTile                 = (appName: string) =>
    this.page.locator(`xpath=//a[contains(@class,"o_app")][.//text()[normalize-space()="${appName}"]]`)
      .or(this.page.locator(`a.o_app:has-text("${appName}")`)).first();
  // Form/list controls whose ABSENCE proves a user cannot change rates.
  private readonly formEditButton          = () =>
    this.page.locator('xpath=//button[contains(@class,"o_form_button_edit")]').or(this.page.locator('button.o_form_button_edit')).first();
  private readonly listCreateButton        = () =>
    this.page.locator('xpath=//button[contains(@class,"o_list_button_add")] | //button[normalize-space()="CREATE" or normalize-space()="Create"]')
      .or(this.page.locator('button.o_list_button_add')).first();
  // "Filters" menu on the Currencies list and its "Archived" entry.
  private readonly filtersMenuButton       = () =>
    this.page.locator("xpath=//div[contains(@class,'o_search_options')]//button[normalize-space()='Filters']").first();
  // This Odoo 12 build's res.currency search view defines the filters "Active" and "Inactive" - there is
  // no "Archived" entry (that label arrived in later Odoo versions).
  private readonly inactiveFilterOption    = () =>
    this.page.locator("xpath=//div[contains(@class,'dropdown-menu') and contains(@class,'show')]//a[normalize-space()='Inactive']")
      .or(this.page.locator("a[role='menuitem']:text-is('Inactive')")).first();
  // The (x) control on an applied search facet chip (the list opens with an "Active" facet already on).
  private readonly facetRemoveButtons      = () =>
    this.page.locator("xpath=//div[contains(@class,'o_searchview_facet')]//*[contains(@title,'Remove')] | //div[contains(@title,'Remove')]");
  // -- Editable "Currency Rates" list (tree is editable="bottom": rows are edited INLINE) --
  // The row currently in edit mode, and the inline inputs inside it.
  private readonly selectedRow             = () =>
    this.page.locator('xpath=//tr[contains(@class,"o_selected_row")]').or(this.page.locator('tr.o_selected_row')).first();
  // In an Odoo 12 editable list the Date cell is a datepicker widget, so the <input> is WRAPPED and does
  // not carry the field name - the name sits on the surrounding element. Address the inputs by structure
  // instead: the date input is the datepicker input, the rate input is the one in the numeric cell.
  private readonly inlineDateInput         = () =>
    this.page.locator('xpath=//tr[contains(@class,"o_selected_row")]//input[contains(@class,"o_datepicker_input")]')
      .or(this.page.locator('tr.o_selected_row td[name="name"] input'))
      .or(this.page.locator('tr.o_selected_row input[name="name"]')).first();
  // In EDIT mode the numeric cell loses its readonly `o_list_number` class, so that class cannot be used
  // to find the Rate input. Address it by structure instead: of the row's inputs, skip the row-selector
  // checkbox and the datepicker, and the next one is Rate (columns render in order Date, Rate, Company).
  private readonly inlineRateInput         = () =>
    this.page.locator('tr.o_selected_row input:not([type="checkbox"]):not(.o_datepicker_input)')
      .or(this.page.locator('tr.o_selected_row td[name="rate"] input')).first();
  // Odoo's canonical "add a record" button for a list view. Deliberately NOT text-based: a text match on
  // "CREATE" can pick a hidden button from another view that is still in the DOM.
  private readonly addRecordButton         = () =>
    this.page.locator('xpath=//button[contains(@class,"o_list_button_add")]')
      .or(this.page.locator('button.o_list_button_add')).first();
  private readonly anySelectedRowInput     = () =>
    this.page.locator('xpath=//tr[contains(@class,"o_selected_row")]//input');
  private readonly listSaveButton          = () =>
    this.page.locator('xpath=//button[contains(@class,"o_list_button_save")]').or(this.page.locator('button.o_list_button_save')).first();
  private readonly listDiscardButton       = () =>
    this.page.locator('xpath=//button[contains(@class,"o_list_button_discard")]').or(this.page.locator('button.o_list_button_discard')).first();
  // A rate row addressed by its rendered Date cell, plus that row's Rate cell and its selector checkbox.
  private readonly rateRowByDate           = (dateText: string) =>
    this.page.locator(`xpath=//tr[contains(@class,"o_data_row")][td[normalize-space()="${dateText}"]]`)
      .or(this.page.locator(`tr.o_data_row:has(td:text-is("${dateText}"))`)).first();
  private readonly rateRowRateCell         = (dateText: string) =>
    this.page.locator(`xpath=//tr[contains(@class,"o_data_row")][td[normalize-space()="${dateText}"]]/td[contains(@class,"o_list_number")]`)
      .or(this.page.locator(`tr.o_data_row:has(td:text-is("${dateText}")) td.o_list_number`)).first();
  private readonly rateRowSelectorCell     = (dateText: string) =>
    this.page.locator(`xpath=//tr[contains(@class,"o_data_row")][td[normalize-space()="${dateText}"]]/td[contains(@class,"o_list_record_selector")]`)
      .or(this.page.locator(`tr.o_data_row:has(td:text-is("${dateText}")) td.o_list_record_selector`)).first();
  private readonly rateRowCheckbox         = (dateText: string) =>
    this.page.locator(`xpath=//tr[contains(@class,"o_data_row")][td[normalize-space()="${dateText}"]]//input[@type="checkbox"]`)
      .or(this.page.locator(`tr.o_data_row:has(td:text-is("${dateText}")) input[type="checkbox"]`)).first();
  // An editable list renders a per-row trash control - the simplest way to remove one row, and it needs no
  // selection and no Action menu (the Action menu only appears once a row is ticked).
  // The trash control of an editable list is rendered only for the row currently IN EDIT MODE, so the row
  // has to be clicked before this can be found.
  private readonly selectedRowTrashButton  = () =>
    this.page.locator('xpath=//tr[contains(@class,"o_selected_row")]//td[contains(@class,"o_list_record_remove")]//button')
      .or(this.page.locator('xpath=//tr[contains(@class,"o_selected_row")]//button[contains(@class,"fa-trash-o")]'))
      .or(this.page.locator('tr.o_selected_row td.o_list_record_remove button')).first();
  // Control-panel "Action" menu and its Delete entry (fallback path), plus the confirmation dialog's OK.
  private readonly actionMenuButton        = () =>
    this.page.locator('xpath=//div[contains(@class,"o_cp_sidebar")]//button[contains(normalize-space(.),"Action")]')
      .or(this.page.locator('xpath=//button[contains(@class,"o_dropdown_toggler_btn")][contains(normalize-space(.),"Action")]'))
      .or(this.page.locator('xpath=//button[contains(normalize-space(.),"Action")]'))
      .or(this.page.locator('button:has-text("Action")')).first();
  private readonly actionDeleteOption      = () =>
    this.page.locator('xpath=//ul[contains(@class,"o_dropdown_menu")]//a[contains(normalize-space(),"Delete")]')
      .or(this.page.locator('xpath=//a[contains(@class,"dropdown-item")][contains(normalize-space(),"Delete")]'))
      .or(this.page.locator("a[role='menuitem']:has-text('Delete')")).first();
  private readonly anyDropdownItem         = () =>
    this.page.locator('xpath=//ul[contains(@class,"o_dropdown_menu")]//a | //div[contains(@class,"show")]//a[contains(@class,"dropdown-item")]');
  // The rate record's own FORM view: its Date field, the pager's next arrow, and the readonly-mode marker.
  private readonly rateFormDateField       = () =>
    this.page.locator('xpath=//div[contains(@class,"o_form_view")]//div[@name="name"] | //div[contains(@class,"o_form_view")]//span[@name="name"]')
      .or(this.page.locator('.o_form_view [name="name"]')).first();
  private readonly pagerNextButton         = () =>
    this.page.locator('xpath=//span[contains(@class,"o_pager")]//button[contains(@class,"o_pager_next")]')
      .or(this.page.locator('.o_pager_next')).first();
  // One entry of an open Action dropdown, addressed by its label (e.g. "Archive", "Unarchive").
  private readonly actionOptionByLabel     = (label: string) =>
    this.page.locator(`xpath=//div[contains(@class,"dropdown-menu") and contains(@class,"show")]//a[normalize-space()="${label}"]`)
      .or(this.page.locator(`xpath=//ul[contains(@class,"dropdown-menu") and contains(@class,"show")]//a[normalize-space()="${label}"]`))
      .or(this.page.locator(`xpath=//a[contains(@class,"dropdown-item")][normalize-space()="${label}"]`)).first();
  // The archive box in the currency form's button box: `toggle_active` with a boolean_button widget whose
  // text reads "Active" or "Archived". It is the control the form itself declares, so it always exists.
  private readonly toggleActiveButton      = () =>
    this.page.locator('xpath=//button[@name="toggle_active"]').or(this.page.locator('button[name="toggle_active"]')).first();
  private readonly confirmDialogOk         = () =>
    this.page.locator('xpath=//div[contains(@class,"modal")]//button[normalize-space()="Ok" or normalize-space()="OK"]')
      .or(this.page.locator('.modal-footer button.btn-primary')).first();
  // The search box of whichever list is on screen. The Currency Rates search view offers one field, "Date".
  private readonly listSearchInput         = () =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview")]//input').or(this.page.locator('.o_searchview input')).first();
  // The app-menu sections container in the navbar - present once the Odoo shell has booted.
  private readonly menuSections           = () =>
    this.page.locator('xpath=//div[contains(@class,"o_menu_sections")]').or(this.page.locator('.o_menu_sections')).first();
  // The Invoicing > Configuration top menu and its dropdown items.
  private readonly configurationMenu      = () =>
    this.page.locator('xpath=//a[contains(@class,"o_menu_entry_lvl_0") or contains(@class,"dropdown-toggle")][normalize-space()="Configuration"]')
      .or(this.page.locator('a.dropdown-toggle:text-is("Configuration")')).first();
  private readonly configurationMenuItems = () =>
    this.page.locator('xpath=//div[contains(@class,"show")]//a[contains(@class,"dropdown-item")]')
      .or(this.page.locator('.dropdown-menu.show a.dropdown-item'));

  constructor(page: Page) {
    super(page);
  }

  /**
   * Open Invoicing > Configuration > Accounting > Currencies (model res.currency, list view) via the
   * menu action hash, dismiss any Odoo error popup, and wait for the list rows to render.
   * @param timeout - max time to wait for the list (default: pageLoad)
   */
  async openCurrenciesList(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    console.log('  - Opening Invoicing > Configuration > Accounting > Currencies');
    // Odoo keeps its whole client in one document, so asking for another hash of the same path is a
    // SAME-DOCUMENT navigation: goto resolves the instant the hash changes and the client can keep the
    // previous screen on display. The waits below then sit out their full pageLoad budget twice over for a
    // list that is never going to appear - a single call was measured burning minutes this way. The reload
    // turns it into a real document load at that hash, which makes the boot deterministic.
    await this.page.goto(`${origin}/web?#menu_id=163&action=64`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
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

  /**
   * Read the list of currency codes currently shown in the Currencies list (the enabled set when no
   * filter is applied). Resolves the "Currency" column by header text.
   * @param timeout - max time to wait for the list (default: abnormalWait)
   * @returns the codes in list order, e.g. ["CHF","EUR","GBP","IDR","INR","UAH","USD"]
   */
  async getListedCurrencyCodes(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string[]> {
    await this.listTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    const codes = await this.page.evaluate(() => {
      const table = document.querySelector('table.o_list_view') || document.querySelector('.o_list_view table');
      if (!table) return [] as string[];
      const headers = Array.from(table.querySelectorAll('thead th'));
      const colIdx = headers.findIndex((h) => (h.textContent || '').trim() === 'Currency');
      if (colIdx === -1) return [] as string[];
      return Array.from(table.querySelectorAll('tbody tr.o_data_row')).map((r) => {
        const cells = Array.from(r.querySelectorAll('td'));
        return cells[colIdx] ? (cells[colIdx].textContent || '').trim() : '';
      }).filter((v) => !!v);
    }).catch(() => [] as string[]);
    console.log(`  ✓ Currencies listed (${codes.length}): ${codes.join(', ')}`);
    return codes;
  }

  /**
   * Open a currency's rate history: click the currency row in the Currencies list, then click the
   * "Rates" stat button in the button box at the top right of the currency form.
   *
   * Primary path is the stat button (mirrors the manual step). If the button cannot be clicked, falls
   * back to navigating straight to the Currency Rates action hash using the record id taken from the
   * form URL - the same action the stat button opens (action=63, model=res.currency.rate).
   *
   * @param currencyCode - the currency code, e.g. "EUR"
   * @param timeout - max time to wait for each stage (default: pageLoad)
   * @returns the numeric record id of the currency, taken from the form URL
   */
  async openRatesForCurrency(currencyCode: string, timeout: number = CommonUtils.waitTimes.pageLoad): Promise<string> {
    const currencyId = await this.openCurrencyForm(currencyCode, timeout);
    await this.clickRatesButtonOnOpenForm(currencyId, timeout);
    return currencyId;
  }

  /**
   * Open the Currencies list and open ONE currency's form.
   * @param currencyCode - the currency code, e.g. "EUR"
   * @param timeout - max time to wait for each stage (default: pageLoad)
   * @returns the numeric record id of the currency, taken from the form URL ('' when not resolvable)
   */
  async openCurrencyForm(currencyCode: string, timeout: number = CommonUtils.waitTimes.pageLoad): Promise<string> {
    await this.openCurrenciesList(timeout);
    return this.openCurrencyFormFromOpenList(currencyCode, timeout);
  }

  /**
   * Open one currency's form by clicking its row on the list ALREADY on screen.
   *
   * Kept separate from {@link openCurrencyForm} because that one re-opens the Currencies list first, which
   * resets the search view to its default "Active" facet - so an ARCHIVED currency becomes unreachable
   * through it. Filter the list however you need, then call this.
   *
   * @param currencyCode - the currency code, e.g. "JPY"
   * @param timeout - max time to wait for the form (default: pageLoad)
   * @returns the numeric record id of the currency, taken from the form URL ('' when not resolvable)
   */
  async openCurrencyFormFromOpenList(currencyCode: string, timeout: number = CommonUtils.waitTimes.pageLoad): Promise<string> {
    console.log(`  - Opening the "${currencyCode}" currency form`);
    await this.currencyRow(currencyCode).waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.currencyRow(currencyCode).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.formView().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    // The form URL carries the record id, e.g. "...#id=1&action=64&model=res.currency&view_type=form".
    const idMatch = /[#&]id=(\d+)/.exec(this.page.url());
    const currencyId = idMatch ? idMatch[1] : '';
    console.log(`  ✓ "${currencyCode}" currency form opened (id=${currencyId || 'unknown'})`);
    return currencyId;
  }

  /**
   * From an OPEN currency form, click the "Rates" button in the button box at the top right (to the left
   * of the Active / Inactive marker) to open that currency's "Currency Rates" list.
   *
   * Primary path is the stat button, mirroring the manual step. If it cannot be clicked, falls back to
   * the Currency Rates action hash using the record id - the same action the button opens.
   *
   * @param currencyId - the record id from {@link openCurrencyForm}, used only by the fallback
   * @param timeout - max time to wait for the list (default: pageLoad)
   * @returns true when the "Currency Rates" list rendered rows
   */
  async clickRatesButtonOnOpenForm(currencyId: string = '', timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    console.log('  - Clicking the "Rates" button in the button box at the top right');
    const clicked = await this.ratesStatButton()
      .click({ timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true)
      .catch(() => false);

    if (!clicked && currencyId) {
      const origin = new URL(this.page.url()).origin;
      console.log('  - "Rates" button not clickable; navigating to the Currency Rates action hash instead');
      await this.page.goto(
        `${origin}/web?#action=63&active_id=${currencyId}&model=res.currency.rate&view_type=list`,
        { waitUntil: 'domcontentloaded' }
      ).catch(() => {});
      // Same-document hash navigation needs a real load behind it - see openCurrenciesList.
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }

    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.listTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    const hasRows = await this.anyDataRow().waitFor({ state: 'visible', timeout })
      .then(() => true).catch(() => false);
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ "Currency Rates" list opened (rows rendered: ${hasRows})`);
    return hasRows;
  }

  /**
   * Read the breadcrumb text of the currently open view, e.g. "Currencies / EUR / Currency Rates".
   * @param timeout - max time to wait for the breadcrumb (default: abnormalWait)
   */
  async getBreadcrumbText(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    await this.breadcrumb().waitFor({ state: 'visible', timeout }).catch(() => {});
    const raw = ((await this.breadcrumb().innerText().catch(() => '')) || '').trim();
    const normalized = raw.replace(/\s*\n\s*/g, ' / ').replace(/\s{2,}/g, ' ').trim();
    console.log(`  ✓ Breadcrumb: "${normalized}"`);
    return normalized;
  }

  /**
   * Read the column headers of the list currently open (e.g. the Currency Rates list -> Date, Rate,
   * Company). Empty header cells (the row-selector column) are dropped.
   * @param timeout - max time to wait for the list (default: abnormalWait)
   */
  async getListColumnHeaders(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string[]> {
    await this.listTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    const headers = await this.page.evaluate(() => {
      const table = document.querySelector('table.o_list_view') || document.querySelector('.o_list_view table');
      if (!table) return [] as string[];
      return Array.from(table.querySelectorAll('thead th'))
        .map((h) => (h.textContent || '').replace(/[​-‍﻿]/g, '').trim())
        .filter((t) => !!t);
    }).catch(() => [] as string[]);
    console.log(`  ✓ List columns: ${headers.join(' | ')}`);
    return headers;
  }

  /**
   * Read the total number of records the open list holds, taken from the pager ("1-80 / 2471" -> 2471).
   * Returns the number of loaded rows when no pager is rendered (a short list).
   * @param timeout - max time to wait for the pager (default: abnormalWait)
   */
  async getListTotalCount(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<number> {
    const hasPager = await this.pagerCounter().isVisible({ timeout }).catch(() => false);
    if (hasPager) {
      const limitText = ((await this.pagerLimit().innerText().catch(() => '')) || '').trim();
      const parsed = parseInt(limitText.replace(/[^0-9]/g, ''), 10);
      if (!Number.isNaN(parsed)) {
        console.log(`  ✓ List total count (pager): ${parsed}`);
        return parsed;
      }
    }
    const loaded = await this.page.locator('tr.o_data_row').count().catch(() => 0);
    console.log(`  ✓ List total count (loaded rows, no pager): ${loaded}`);
    return loaded;
  }

  /**
   * Sort the open list by a column, by clicking its header.
   *
   * The sort direction is verified from the DATA, not from the header's CSS classes: this Odoo 12
   * build does not expose a stable asc/desc class, and a 4000-row list re-renders slower than a
   * fixed buffer, so class sniffing produced the wrong order. After each click the first and last
   * loaded values of the column are compared; the loop stops as soon as the requested direction
   * holds (max 3 clicks).
   *
   * @param columnLabel - the header label, e.g. "Date"
   * @param direction - 'asc' or 'desc'
   * @returns true when the requested direction was reached
   */
  async sortListByColumn(columnLabel: string, direction: 'asc' | 'desc'): Promise<boolean> {
    const header = this.columnHeader(columnLabel);
    await header.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

    for (let attempt = 0; attempt < 3; attempt++) {
      const values = await this.getColumnValues(columnLabel);
      if (values.length > 1) {
        const first = values[0];
        const last = values[values.length - 1];
        const isDesc = first >= last;
        const isAsc = first <= last;
        if ((direction === 'desc' && isDesc) || (direction === 'asc' && isAsc)) {
          console.log(`  ✓ List sorted by "${columnLabel}" ${direction} (first="${first}", last="${last}")`);
          return true;
        }
      }
      await header.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      // A long list re-renders slowly; wait for the rows to settle before re-reading the order.
      await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await this.anyDataRow().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.extraLong);
    }
    console.log(`  ! Could not confirm "${columnLabel}" is sorted ${direction} after 3 clicks`);
    return false;
  }

  /**
   * Read one column's loaded cell values, in row order, resolving the column by header text.
   * Date columns are returned normalised to ISO `YYYY-MM-DD` so they compare correctly as strings.
   * @param columnLabel - the header label, e.g. "Date"
   */
  async getColumnValues(columnLabel: string): Promise<string[]> {
    const raw = await this.page.evaluate((label: string) => {
      const table = document.querySelector('table.o_list_view') || document.querySelector('.o_list_view table');
      if (!table) return [] as string[];
      const headers = Array.from(table.querySelectorAll('thead th')).map((h) => (h.textContent || '').trim());
      const colIdx = headers.findIndex((h) => h === label);
      if (colIdx === -1) return [] as string[];
      return Array.from(table.querySelectorAll('tbody tr.o_data_row')).map((r) => {
        const cells = Array.from(r.querySelectorAll('td'));
        return cells[colIdx] ? (cells[colIdx].textContent || '').trim() : '';
      }).filter((v) => !!v);
    }, columnLabel).catch(() => [] as string[]);
    return raw.map((v) => (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v) ? CurrencyPage.toIsoDate(v) : v));
  }

  /**
   * Widen the open list's page size by typing a range into the pager, e.g. "1-500". Used when the
   * record being looked for may sit past the default 80-row page.
   * @param upTo - the last row number to load, e.g. 500
   */
  async expandListPageSize(upTo: number): Promise<void> {
    const hasPager = await this.pagerValue().isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!hasPager) {
      console.log('  - No pager rendered; the whole list is already loaded');
      return;
    }
    await this.pagerValue().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.type(`1-${upTo}`);
    await this.page.keyboard.press('Enter');
    await this.wait(CommonUtils.waitTimes.extraLong);
    await this.anyDataRow().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    console.log(`  ✓ List page size expanded to 1-${upTo}`);
  }

  /**
   * Read every loaded row of the open "Currency Rates" list as {date, rate}. The Date and Rate columns
   * are resolved by header text, so the reader survives a column re-order. The rendered Date is
   * `MM/DD/YYYY` on this build and is normalised to ISO `YYYY-MM-DD`.
   * @param timeout - max time to wait for the list (default: abnormalWait)
   */
  async getRateRows(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<CurrencyRateRow[]> {
    await this.listTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    const raw = await this.page.evaluate(() => {
      const table = document.querySelector('table.o_list_view') || document.querySelector('.o_list_view table');
      if (!table) return [] as Array<{ rawDate: string; rawRate: string }>;
      const headers = Array.from(table.querySelectorAll('thead th')).map((h) => (h.textContent || '').trim());
      const dateIdx = headers.findIndex((h) => h === 'Date');
      const rateIdx = headers.findIndex((h) => h === 'Rate');
      if (dateIdx === -1 || rateIdx === -1) return [] as Array<{ rawDate: string; rawRate: string }>;
      return Array.from(table.querySelectorAll('tbody tr.o_data_row')).map((r) => {
        const cells = Array.from(r.querySelectorAll('td'));
        return {
          rawDate: cells[dateIdx] ? (cells[dateIdx].textContent || '').trim() : '',
          rawRate: cells[rateIdx] ? (cells[rateIdx].textContent || '').trim() : '',
        };
      }).filter((row) => !!row.rawDate);
    }).catch(() => [] as Array<{ rawDate: string; rawRate: string }>);

    const rows: CurrencyRateRow[] = raw.map((r) => ({
      rawDate: r.rawDate,
      rawRate: r.rawRate,
      date: CurrencyPage.toIsoDate(r.rawDate),
      rate: parseFloat(r.rawRate.replace(/[^0-9.]/g, '')) || 0,
    }));
    console.log(`  ✓ Rate rows loaded: ${rows.length}${rows.length ? ` (newest "${rows[0].rawDate}" = ${rows[0].rawRate})` : ''}`);
    return rows;
  }

  /**
   * Count the rows of the open "Currency Rates" list that carry a given date.
   * @param isoDate - the date as `YYYY-MM-DD`
   */
  async countRateRowsForDate(isoDate: string): Promise<number> {
    const rows = await this.getRateRows();
    const count = rows.filter((r) => r.date === isoDate).length;
    console.log(`  ✓ Rate rows dated ${isoDate}: ${count}`);
    return count;
  }

  /**
   * Find the rate that applies to a date: the row with the LATEST date that is on or before it.
   * This is the rule Odoo uses when converting an amount, and it is what makes a document dated
   * inside a gap in the history convert at the last rate published before the gap.
   *
   * The selection does NOT depend on the list's sort order: the loaded rows are filtered to those on
   * or before the date and the one with the greatest date is taken. When no loaded row qualifies (the
   * page holds only rows newer than the target), the page size is widened and the rows are re-read,
   * bounded to `maxExpansions`. This keeps the reader correct whichever way the list happens to be
   * ordered - only how many pages have to be loaded changes.
   *
   * @param isoDate - the document date as `YYYY-MM-DD`
   * @param maxExpansions - how many times the page size may be widened (default 3: 500, 2000, 5000)
   * @returns the applicable row, or null when the currency has no row on or before that date
   */
  async getRateApplicableToDate(isoDate: string, maxExpansions: number = 3): Promise<CurrencyRateRow | null> {
    const pageSizes = [500, 2000, 5000];

    for (let attempt = 0; attempt <= maxExpansions; attempt++) {
      const rows = await this.getRateRows();
      const onOrBefore = rows.filter((r) => r.date <= isoDate);
      if (onOrBefore.length) {
        // Order-independent: take the greatest date among the rows on or before the target.
        const hit = onOrBefore.reduce((best, r) => (r.date > best.date ? r : best), onOrBefore[0]);
        console.log(`  ✓ Rate applicable to ${isoDate}: ${hit.rawRate} (from the row dated ${hit.rawDate})`);
        return hit;
      }
      const total = await this.getListTotalCount();
      if (rows.length >= total) {
        console.log(`  ! No rate row dated on or before ${isoDate} exists (whole history of ${total} rows scanned)`);
        return null;
      }
      if (attempt === maxExpansions) break;
      console.log(`  - Oldest loaded row is still newer than ${isoDate}; widening the page size`);
      await this.expandListPageSize(pageSizes[Math.min(attempt, pageSizes.length - 1)]);
    }
    console.log(`  ! Could not resolve the rate applicable to ${isoDate} within ${maxExpansions} page expansions`);
    return null;
  }

  /**
   * Enter a module the way a user does: click the "Applications" launcher in the navbar, then click the
   * module's tile.
   *
   * This matters for any check that reads a module's OWN menu bar. Deep-linking to an action by hash
   * (the fast path `openCurrenciesList` uses) renders the action but leaves the navbar without the
   * module's menu sections - the navbar then holds only Applications / Activities / Messages / User, so
   * "Configuration" cannot be found at all.
   *
   * @param appName - the module tile label, e.g. "Invoicing"
   * @param timeout - max time to wait for each stage (default: pageLoad)
   * @returns true when the module's menu sections rendered
   */
  async openModuleFromApplications(appName: string, timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    console.log(`  - Opening the "${appName}" module from the Applications launcher`);
    await this.applicationsLauncher().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.applicationsLauncher().click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    const tileVisible = await this.appTile(appName)
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementVisibility })
      .then(() => true).catch(() => false);
    if (!tileVisible) {
      console.log(`  ! The "${appName}" tile did not appear in the Applications launcher`);
      return false;
    }
    await this.appTile(appName).click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});

    const sectionsReady = await this.menuSections()
      .waitFor({ state: 'visible', timeout })
      .then(() => true).catch(() => false);
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ${sectionsReady ? '✓' : '!'} "${appName}" module opened (menu sections rendered: ${sectionsReady})`);
    return sectionsReady;
  }

  /**
   * Read the labels offered by the Invoicing > Configuration top menu. Used to prove that the rate
   * history has no menu entry of its own and is reachable only from a currency.
   * @returns the dropdown item labels, e.g. ["Settings","Accounting","Payment Terms", ...]
   */
  async getConfigurationMenuLabels(): Promise<string[]> {
    // Wait for the Odoo shell to finish booting: right after a hash navigation the action renders
    // before the navbar app-menu sections do, and reading too early returns nothing.
    const shellReady = await this.menuSections()
      .waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.pageLoad })
      .then(() => true).catch(() => false);
    if (!shellReady) {
      console.log('  ! The navbar app-menu sections never rendered');
      return [];
    }
    await this.wait(CommonUtils.waitTimes.long);

    // Read the dropdown items straight from the DOM. Odoo 12 renders every menu section's items into
    // the page and only hides them with CSS, so no click is needed - which also removes any chance of
    // an unbounded click hanging the test.
    const labels = await this.page.evaluate(() => {
      const sections = document.querySelector('.o_menu_sections');
      if (!sections) return [] as string[];
      const toggles = Array.from(sections.querySelectorAll('a.dropdown-toggle, a[data-toggle="dropdown"]'));
      const configToggle = toggles.find((t) => (t.textContent || '').replace(/\s+/g, ' ').trim() === 'Configuration');
      if (!configToggle) return [] as string[];
      const holder = configToggle.parentElement;
      const dropdown = holder ? holder.querySelector('.dropdown-menu') : null;
      if (!dropdown) return [] as string[];
      return Array.from(dropdown.querySelectorAll('a'))
        .map((a) => (a.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => !!t);
    }).catch(() => [] as string[]);

    console.log(`  ✓ Invoicing > Configuration offers (${labels.length}): ${labels.join(' | ')}`);
    return labels;
  }

  /**
   * Whether the open currency form offers an "EDIT" button. Its ABSENCE is what proves a user may read
   * rates but not change them.
   * @param timeout - how long to look for the button (default: elementVisibility)
   */
  async hasEditButtonOnForm(timeout: number = CommonUtils.waitTimes.elementVisibility): Promise<boolean> {
    const present = await this.formEditButton().isVisible({ timeout }).catch(() => false);
    console.log(`  ✓ "EDIT" button on the currency form: ${present ? 'present' : 'absent'}`);
    return present;
  }

  /**
   * Whether the open list offers a "CREATE" button. Used on the "Currency Rates" list: its absence is
   * what proves a user cannot add a rate by hand.
   * @param timeout - how long to look for the button (default: elementVisibility)
   */
  async hasCreateButtonOnList(timeout: number = CommonUtils.waitTimes.elementVisibility): Promise<boolean> {
    const present = await this.listCreateButton().isVisible({ timeout }).catch(() => false);
    console.log(`  ✓ "CREATE" button on the open list: ${present ? 'present' : 'absent'}`);
    return present;
  }

  /**
   * Remove every applied search facet from the currently open list. The Currencies list opens with an
   * "Active" facet already applied, so it must be dropped before the "Inactive" filter can show only the
   * disabled currencies (filters in the same group are OR-ed, so keeping both would list everything).
   * @returns how many facets were removed
   */
  async clearSearchFacets(): Promise<number> {
    let removed = 0;
    for (let guard = 0; guard < 10; guard++) {
      const controls = this.facetRemoveButtons();
      const count = await controls.count().catch(() => 0);
      if (count === 0) break;
      const first = controls.first();
      const visible = await first.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
      if (!visible) break;
      await first.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      removed++;
    }
    if (removed) {
      await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
    }
    console.log(`  ✓ Search facets cleared from the open list (${removed} removed)`);
    return removed;
  }

  /**
   * Show ONLY the disabled currencies: drop the default "Active" facet, then apply the "Inactive" filter
   * from the Filters menu.
   *
   * The filter is labelled "Inactive" on this build (res.currency's search view defines "Active" and
   * "Inactive"); there is no "Archived" entry, so looking for that name finds nothing.
   *
   * @returns true when the "Inactive" filter was applied
   */
  async applyInactiveFilter(): Promise<boolean> {
    await this.clearSearchFacets();

    const filters = this.filtersMenuButton();
    const visible = await filters.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!visible) {
      console.log('  ! The "Filters" menu is not on screen');
      return false;
    }
    await filters.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    const inactive = this.inactiveFilterOption();
    const offered = await inactive.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementVisibility })
      .then(() => true).catch(() => false);
    if (!offered) {
      console.log('  ! The "Inactive" filter is not offered in the Filters menu');
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }
    await inactive.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ "Inactive" filter applied to the Currencies list');
    return true;
  }

  /**
   * Read the Invoicing > Configuration menu, reporting BOTH whether the menu exists and what it offers.
   *
   * A user with no rights to anything under Configuration does not merely see an empty menu - Odoo hides
   * the whole "Configuration" toggle. Callers must be able to tell that apart from a failed read, so the
   * presence flag is returned alongside the labels.
   */
  async getConfigurationMenu(): Promise<{ present: boolean; labels: string[] }> {
    const shellReady = await this.menuSections()
      .waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.pageLoad })
      .then(() => true).catch(() => false);
    if (!shellReady) {
      console.log('  ! The navbar app-menu sections never rendered');
      return { present: false, labels: [] };
    }
    await this.wait(CommonUtils.waitTimes.long);

    const result = await this.page.evaluate(() => {
      const sections = document.querySelector('.o_menu_sections');
      if (!sections) return { present: false, labels: [] as string[] };
      const toggles = Array.from(sections.querySelectorAll('a.dropdown-toggle, a[data-toggle="dropdown"]'));
      const configToggle = toggles.find((t) => (t.textContent || '').replace(/\s+/g, ' ').trim() === 'Configuration');
      if (!configToggle) return { present: false, labels: [] as string[] };
      const holder = configToggle.parentElement;
      const dropdown = holder ? holder.querySelector('.dropdown-menu') : null;
      if (!dropdown) return { present: true, labels: [] as string[] };
      return {
        present: true,
        labels: Array.from(dropdown.querySelectorAll('a'))
          .map((a) => (a.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((t) => !!t),
      };
    }).catch(() => ({ present: false, labels: [] as string[] }));

    console.log(`  ✓ Invoicing > Configuration menu present: ${result.present}; offers (${result.labels.length}): ${result.labels.join(' | ') || 'nothing'}`);
    return result;
  }

  /**
   * Add a rate row by hand to the OPEN "Currency Rates" list.
   *
   * The tree is editable="bottom", so "CREATE" opens an inline editable row rather than a dialog - the
   * Date and Rate inputs live inside that row. The Date is committed with Tab, which also moves to the
   * Rate cell. Escape must NOT be used here: in an editable list it abandons the row being edited rather
   * than closing the date picker, leaving nothing to save.
   *
   * A currency may hold only ONE row per date per company (unique(name, currency_id, company_id)), so a
   * date that already has a row will not gain a second one.
   *
   * @param dateText - the date in the list's rendered format, e.g. "08/20/2026"
   * @param rate - the rate to store, e.g. "44.300000"
   * @returns true when the row was saved
   */
  async createRateRow(dateText: string, rate: string): Promise<boolean> {
    console.log(`  - Adding a rate row by hand: Date="${dateText}", Rate="${rate}"`);
    const create = this.addRecordButton();
    const canCreate = await create.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
    if (!canCreate) {
      console.log('  ! No "CREATE" button on the Currency Rates list - this user cannot add a rate');
      return false;
    }
    await create.click({ timeout: CommonUtils.waitTimes.abnormalWait });

    // The list must enter edit mode; if it does not, say so instead of timing out on an input later.
    const inEditMode = await this.selectedRow()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    const inputCount = await this.anySelectedRowInput().count().catch(() => 0);
    console.log(`  - After CREATE: row in edit mode = ${inEditMode}, inputs inside that row = ${inputCount}`);
    if (!inEditMode) {
      console.log('  ! The list did not enter edit mode after CREATE - nothing was added');
      return false;
    }
    await this.wait(CommonUtils.waitTimes.standard);

    const dateInput = this.inlineDateInput();
    const dateReady = await dateInput.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!dateReady) {
      console.log('  ! The inline Date input never became visible - discarding the new row');
      await this.discardEditableList().catch(() => {});
      return false;
    }
    await dateInput.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await dateInput.press('Control+a').catch(() => {});
    await dateInput.press('Backspace').catch(() => {});
    await this.page.keyboard.type(dateText, { delay: 30 });
    // Do NOT press Escape here. In an Odoo 12 EDITABLE LIST, Escape does not just close the date picker -
    // it ABANDONS the row being edited, so the new row disappears and there is nothing left to save.
    // Tab both commits the typed date (closing the picker) and moves on to the Rate cell.
    await this.wait(CommonUtils.waitTimes.medium);

    // Move to the Rate cell with Tab, the way a person does in an editable list. This is more reliable
    // than locating the Rate input, whose cell classes differ between readonly and edit mode.
    await this.page.keyboard.press('Tab');
    await this.wait(CommonUtils.waitTimes.medium);
    await this.page.keyboard.press('Control+a').catch(() => {});
    await this.page.keyboard.press('Backspace').catch(() => {});
    await this.page.keyboard.type(rate, { delay: 30 });
    await this.wait(CommonUtils.waitTimes.medium);

    // Report what actually landed in the row before saving, so a wrong cell is obvious from the log.
    const typed = await this.inlineRateInput().inputValue({ timeout: CommonUtils.waitTimes.long }).catch(() => '');
    console.log(`  - Rate cell now holds: "${typed}" (expected "${rate}")`);

    return this.saveEditableList(`rate row ${dateText} = ${rate}`);
  }

  /**
   * Change the Rate of an existing row on the OPEN "Currency Rates" list, addressed by its Date.
   * @param dateText - the row's date as rendered, e.g. "01/22/2026"
   * @param newRate - the replacement rate, e.g. "0.900000"
   * @returns true when the change was saved
   */
  async setRateForDate(dateText: string, newRate: string): Promise<boolean> {
    console.log(`  - Changing the rate of the row dated ${dateText} to "${newRate}"`);
    const cell = this.rateRowRateCell(dateText);
    const found = await cell.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!found) {
      console.log(`  ! No rate row dated ${dateText} is loaded on this page of the list`);
      return false;
    }
    await cell.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const inEdit = await this.selectedRow().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!inEdit) {
      console.log('  ! Clicking the Rate cell did not put the row into edit mode');
      return false;
    }
    // The click already focused the Rate cell, so type straight into it rather than re-locating the input.
    await this.page.keyboard.press('Control+a').catch(() => {});
    await this.page.keyboard.press('Backspace').catch(() => {});
    await this.page.keyboard.type(newRate, { delay: 30 });
    await this.wait(CommonUtils.waitTimes.medium);
    const typed = await this.inlineRateInput().inputValue({ timeout: CommonUtils.waitTimes.long }).catch(() => '');
    console.log(`  - Rate cell now holds: "${typed}" (expected "${newRate}")`);
    return this.saveEditableList(`rate of ${dateText} -> ${newRate}`);
  }

  /**
   * Remove ONE rate row, addressed by its date, by SELECTING it and using the control-panel Action > Delete.
   *
   * What actually mattered here was verifying the SELECTION. An earlier attempt concluded the Action menu
   * "was not rendered on this list" - wrong: the checkbox click had silently failed, and Odoo only renders
   * the menu once a row is really ticked. So the tick is asserted, not assumed. With the row selected the
   * menu offers exactly "Export | Delete".
   *
   * Two other routes ARE dead ends on this build, recorded here so they are not re-attempted:
   *
   *   1. A per-row trash control. It does not exist. A row carries only four cells -
   *      o_list_record_selector | o_data_cell o_required_modifier | o_data_cell o_list_number | o_data_cell o_many2one_cell
   *      with no `o_list_record_remove` cell, in readonly OR while the row is in edit mode. Odoo 12 renders
   *      that cell only for an editable list embedded in a form (a x2many subview), and res.currency has no
   *      such embedded list - its form reaches the rates through a stat button that opens action 63.
   *
   *   2. The rate record's own form view. Reachable in principle (the action's view_mode is "tree,form"),
   *      but the hash carries no record id, so Odoo opens a form for a NEW record: the Date field reads
   *      empty and there is no pager to walk. Without an id there is no way to address one existing rate,
   *      and the list exposes no server-side id to build one from.
   *

   * @param dateText - the row's date exactly as the list renders it, e.g. "12/31/2030"
   * @returns true when the row is confirmed gone from the list
   */
  async deleteRateRowForDate(dateText: string): Promise<boolean> {
    console.log(`  - Deleting the rate row dated ${dateText}`);
    const row = this.rateRowByDate(dateText);
    const present = await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!present) {
      console.log(`  OK No rate row dated ${dateText} is on the list - nothing to delete`);
      return true;
    }

    // Leave any inline edit before selecting, or the checkbox click lands on a row being edited.
    await this.discardEditableList().catch(() => {});

    const box = this.rateRowCheckbox(dateText);
    await box.check({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(async () => {
      // The visible control can be a styled label sitting over the input; clicking the cell also toggles it.
      await this.rateRowSelectorCell(dateText).click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    });
    await this.wait(CommonUtils.waitTimes.standard);
    const ticked = await box.isChecked().catch(() => false);
    console.log(`  - Row checkbox ticked: ${ticked}`);

    const menu = this.actionMenuButton();
    const hasMenu = await menu.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
    console.log(`  - "Action" menu present after selecting the row: ${hasMenu}`);

    if (!hasMenu) {
      // Report every control the panel actually offers, so the next step does not have to guess again.
      const buttons = await this.page.evaluate(() => {
        const panel = document.querySelector('.o_control_panel') || document.body;
        return Array.from(panel.querySelectorAll('button, a.dropdown-toggle'))
          .filter((b) => (b as HTMLElement).offsetParent !== null)
          .map((b) => `${(b.textContent || '').replace(/\s+/g, ' ').trim() || '(no text)'} [${b.className}]`);
      }).catch(() => [] as string[]);
      console.log(`  ! No Action menu. Control panel offers: ${buttons.join(' || ') || 'nothing readable'}`);
      return false;
    }

    await menu.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    const offered = (await this.anyDropdownItem().allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => !!t);
    console.log(`  - Action menu offers: ${offered.join(' | ') || 'nothing'}`);

    const del = this.actionDeleteOption();
    if (!(await del.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false))) {
      console.log('  ! "Delete" is not offered in the Action menu');
      await this.page.keyboard.press('Escape').catch(() => {});   // closes the dropdown only; no row is in edit mode here
      return false;
    }
    await del.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.confirmDeleteIfAsked();
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    const stillThere = await this.rateRowByDate(dateText)
      .isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    console.log(`  ${stillThere ? '!' : 'OK'} Rate row dated ${dateText} ${stillThere ? 'is STILL present' : 'deleted'}`);
    return !stillThere;
  }

  /**
   * Archive or unarchive the currency whose form is currently OPEN.
   *
   * The control is the archive box in the form's button box (`toggle_active`), which the currency form
   * declares in its own arch. The manual steps name "Action" > "Archive" / "Unarchive" instead, but on this
   * build that menu offers only "Delete | Duplicate" - measured, not assumed - so the archive box is the
   * only route there is. The Master steps were updated to match.
   *
   * @param archive - true to archive (take out of use), false to unarchive
   * @returns true when the record ended up in the wanted state
   */
  async setCurrencyArchivedFromForm(archive: boolean): Promise<boolean> {
    console.log(`  - ${archive ? 'Archive' : 'Unarchive'} the open currency record`);
    const before = await this.isCurrencyActiveOnForm();
    console.log(`  - Before: the record is ${before === null ? 'unreadable' : before ? 'in use' : 'out of use'}`);
    if (before !== null && before === !archive) {
      console.log(`  OK The record is already ${archive ? 'out of use' : 'in use'} - nothing to click`);
      return true;
    }

    const toggle = this.toggleActiveButton();
    if (!(await toggle.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false))) {
      console.log('  ! The archive box is not on this form, so the record cannot be enabled or disabled here');
      return false;
    }
    await toggle.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.confirmDeleteIfAsked();
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    const after = await this.isCurrencyActiveOnForm();
    const ok = after !== null && after === !archive;
    console.log(`  ${ok ? 'OK' : '!'} After: the record is ${after === null ? 'unreadable' : after ? 'in use' : 'out of use'} (wanted ${archive ? 'out of use' : 'in use'})`);
    return ok;
  }

  /**
   * Is the currency on the open form currently in use?
   *
   * Read from the archive box, whose `boolean_button` widget mixes state and action wording: measured on
   * this build it renders "Deactivate" while the record IS in use, and "Inactive" once it is not. Reading
   * either word as a plain state label gets the answer backwards for one of the two, so all four wordings
   * are handled in an order where no word swallows another.
   *
   * @returns true when in use, false when out of use, null when the control cannot be read
   */
  async isCurrencyActiveOnForm(): Promise<boolean | null> {
    const raw = (await this.readActiveMarker()).toLowerCase();
    if (!raw) return null;
    // All four renderings this widget produces, tested in an order where no word swallows another:
    //   "Inactive"   -> out of use   (checked first: it contains neither "activate" nor "deactivate")
    //   "Deactivate" -> in use       (the action offered on an in-use record)
    //   "Activate"   -> out of use   (the action offered on a disabled record)
    //   "Active"     -> in use
    if (raw.includes('inactive')) return false;
    if (raw.includes('deactivate')) return true;
    if (raw.includes('activate')) return false;
    if (raw.includes('active')) return true;
    console.log(`  ! The archive box reads "${raw}", which is none of Active / Inactive / Activate / Deactivate`);
    return null;
  }

  /**
   * Read the archive box's text on an open currency form, exactly as rendered (e.g. "Deactivate").
   * @returns the rendered text, or '' when the control is not on screen
   */
  async readActiveMarker(): Promise<string> {
    const toggle = this.toggleActiveButton();
    if (!(await toggle.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false))) return '';
    return ((await toggle.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Search the Currency Rates list for ONE date and report how many rows carry it.
   *
   * Needed because a well-used currency holds thousands of rate rows: reading them all to look for one date
   * is not an option, and the list only renders a page at a time. The list's own search view offers a "Date"
   * field, so the server does the filtering and the pager reports the count.
   *
   * @param dateText - the date as the list renders it, e.g. "06/01/2026"
   * @returns the number of rows carrying that date
   */
  async countRateRowsForDateBySearch(dateText: string): Promise<number> {
    console.log(`  - Searching the rate list for rows dated ${dateText}`);
    const searched = await this.searchOpenListFor(dateText, true);
    if (!searched) return -1;
    const rows = await this.getRateRows().catch(() => []);
    const matching = rows.filter((r) => r.rawDate === dateText).length;
    console.log(`  - Rows dated ${dateText}: ${matching} (the filtered list returned ${rows.length} row(s))`);
    return matching;
  }

  /**
   * Type a term into whichever list is on screen and apply it as a search facet.
   *
   * @param text - what to search for, e.g. "JPY" or "06/01/2026"
   * @param clearFacetsFirst - drop the facets already applied first. Leave FALSE when an existing facet
   *        has to survive: clearing them on the Currencies list also drops the default "Active" one, and the
   *        list then returns enabled AND disabled records mixed together - measured, not assumed, and the
   *        reason an earlier version of this read 80 currencies where it expected 7.
   * @returns true when the search box was usable
   */
  async searchOpenListFor(text: string, clearFacetsFirst: boolean = false): Promise<boolean> {
    if (clearFacetsFirst) await this.clearSearchFacets().catch(() => {});
    const input = this.listSearchInput();
    const usable = await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!usable) {
      console.log('  ! The list search box is not on screen, so nothing can be searched');
      return false;
    }
    // Type through real key events: fill() alone leaves Odoo without a facet, so nothing is filtered.
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.page.keyboard.type(text, { delay: 30 });
    await this.wait(CommonUtils.waitTimes.long);
    await this.page.keyboard.press('Enter');
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Searched the open list for "${text}"`);
    return true;
  }

  /**
   * Click through Odoo's delete confirmation dialog when it appears.
   */
  async confirmDeleteIfAsked(): Promise<void> {
    await this.wait(CommonUtils.waitTimes.long);
    const ok = this.confirmDialogOk();
    if (await ok.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false)) {
      await ok.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      console.log('  - Delete confirmation accepted');
    }
  }

  /**
   * Save the editable list and wait for it to return to readonly.
   * @param what - a short description used only in the log line
   */
  async saveEditableList(what: string = 'the list'): Promise<boolean> {
    const save = this.listSaveButton();
    const visible = await save.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true).catch(() => false);
    if (!visible) {
      console.log('  ! No list SAVE button is visible - nothing was in edit mode');
      return false;
    }
    await save.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    const stillEditing = await this.selectedRow().isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    console.log(`  ${stillEditing ? '!' : 'OK'} Saved ${what}${stillEditing ? ' - the row is STILL in edit mode' : ''}`);
    if (stillEditing) {
      // The save was REFUSED - most often the unique(date, currency, company) constraint, which raises an
      // Odoo error dialog and leaves the row in edit mode. Discard it: a list left dirty blocks every later
      // navigation (a following Currencies list came back with zero rows because of exactly this), which
      // buries the real cause under a pile of unrelated timeouts.
      console.log('  - The save was refused, so the dirty row is being discarded to keep navigation working');
      await this.discardEditableList().catch(() => {});
    }
    return !stillEditing;
  }

  /**
   * Leave the editable list without saving, so a failed step cannot block later navigation.
   */
  async discardEditableList(): Promise<void> {
    const discard = this.listDiscardButton();
    if (await discard.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      await discard.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      console.log('  OK Editable list discarded');
    }
  }

  /**
   * Convert a rendered Odoo date to ISO `YYYY-MM-DD`. This build renders `MM/DD/YYYY`; an already-ISO
   * value is returned unchanged so the helper is safe if the locale ever changes.
   * @param raw - the rendered date text, e.g. "08/18/2026"
   */
  static toIsoDate(raw: string): string {
    const text = (raw || '').trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (iso) return text;
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (us) {
      const [, m, d, y] = us;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return text;
  }
}
