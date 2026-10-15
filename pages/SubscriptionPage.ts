import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Subscription Page Object (sale.subscription)
 *
 * The subscription detail screen reached from a confirmed Quotation/Sales Order via the
 * "Subscriptions" smart button (sale.order button name="action_open_subscriptions").
 * All fields are read in readonly mode. Selectors verified against the live pre-prod DOM:
 *   - State                  -> statusbar div[name="stage_id"] active button (aria-checked="true")
 *   - Name                   -> breadcrumb active item ("SUBxxx - <Payer>")
 *   - Customer               -> a[name="partner_id"]
 *   - Pricelist              -> a[name="pricelist_id"]
 *   - Start Date             -> span[name="date_start"]
 *   - Subscription Template  -> a[name="template_id"]
 *   - Salesperson            -> a[name="user_id"]
 *   - Date of Next Invoice   -> span[name="recurring_next_date"]
 *   - To Renew               -> div[name="to_renew"] input[type=checkbox]
 *   - Subscription Reminder  -> div[name="subscription_reminder"] input[type=checkbox]
 *   - Recurring Price        -> span[name="recurring_total"]
 *   - Subscription Lines     -> table inside div[name="recurring_invoice_line_ids"]
 *       columns: Product | Description | Quantity | Unit of Measure | Unit Price | Discount (%) | Sub Total
 */
/** What clicking the "=> Generate Invoice" link produced. */
export interface GenerateInvoiceResult {
  /** The subscription URL the click started from - navigate back to it to keep asserting. */
  returnUrl: string;
  /** Where the click landed (the created invoice, in current Odoo behaviour). */
  invoiceUrl: string;
  /** True when the click navigated to an account.invoice form. */
  navigatedToInvoice: boolean;
  /** Text of any Odoo dialog raised by the click, captured BEFORE it was dismissed ("" if none). */
  dialogText: string;
}

export class SubscriptionPage extends BasePage {
  // ---- Locators (XPath primary, CSS fallback) ----
  private readonly formView = () =>
    this.page.locator('xpath=//div[contains(@class,"o_form_view")]').or(this.page.locator('.o_form_view')).first();
  private readonly breadcrumbActive = () =>
    this.page.locator('xpath=//li[contains(@class,"breadcrumb-item") and contains(@class,"active")]')
      .or(this.page.locator('.breadcrumb-item.active')).first();
  private readonly stageActiveButton = () =>
    this.page.locator('xpath=//div[@name="stage_id"]//button[@aria-checked="true"]')
      .or(this.page.locator('div[name="stage_id"] button.btn-primary')).first();
  private readonly recurringTotal = () =>
    this.page.locator('xpath=//span[@name="recurring_total"]').or(this.page.locator('span[name="recurring_total"]')).first();
  private readonly subscriptionCode = () =>
    this.page.locator('xpath=//span[@name="code"]').or(this.page.locator('span[name="code"]')).first();
  private readonly subscriptionLinesContainer = () =>
    this.page.locator('xpath=//div[@name="recurring_invoice_line_ids"]').or(this.page.locator('div[name="recurring_invoice_line_ids"]')).first();
  private readonly firstLineRow = () =>
    this.subscriptionLinesContainer().locator('xpath=.//tr[contains(@class,"o_data_row")]').first();

  // Many2one (anchor in readonly, input in edit) field by field name
  private readonly m2oField = (name: string) =>
    this.page.locator(`xpath=//a[@name="${name}"]`).or(this.page.locator(`a[name="${name}"]`)).first();
  private readonly m2oInput = (name: string) =>
    this.page.locator(`xpath=//div[@name="${name}"]//input`).or(this.page.locator(`div[name="${name}"] input`)).first();
  // Plain readonly value span (date/char/monetary) by field name
  private readonly spanField = (name: string) =>
    this.page.locator(`xpath=//span[@name="${name}"]`).or(this.page.locator(`span[name="${name}"]`)).first();
  // Boolean checkbox input by field name
  private readonly booleanInput = (name: string) =>
    this.page.locator(`xpath=//div[@name="${name}"]//input[@type="checkbox"]`).or(this.page.locator(`div[name="${name}"] input[type="checkbox"]`)).first();

  constructor(page: Page) {
    super(page);
  }

  /** Parse a displayed amount like "$ 244.38" / "244.38" / "$&nbsp;244.37" into a number. */
  private parseAmount(raw: string): number {
    return parseFloat((raw || '').replace(/ /g, ' ').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
  }

  /**
   * Read a readonly Many2one field's display text (anchor text primary, edit-mode input fallback).
   * Odoo renders a partner Many2one as "Name<br>City<br>Country", so innerText carries the address
   * lines; we keep only the FIRST line (the partner/record name) so it matches the clean value shown
   * elsewhere (e.g. the subscription breadcrumb / the quotation payer name).
   */
  private async readM2o(name: string): Promise<string> {
    const anchor = this.m2oField(name);
    if (await anchor.count().catch(() => 0)) {
      const raw = ((await anchor.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '');
      const firstLine = raw.split('\n')[0].replace(/\s+/g, ' ').trim();
      if (firstLine) return firstLine;
    }
    const input = this.m2oInput(name);
    if (await input.count().catch(() => 0)) {
      return ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    }
    return '';
  }

  /** Read a readonly span field's text. */
  private async readSpan(name: string): Promise<string> {
    const span = this.spanField(name);
    if (await span.count().catch(() => 0)) {
      return ((await span.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/ /g, ' ').trim();
    }
    return '';
  }

  /**
   * Wait for the Subscription form to render (form view + the Recurring Price footer present),
   * dismissing any "Odoo Client Error" popup that can appear after navigation.
   */
  async waitForLoaded(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.formView().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.recurringTotal().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Subscription form loaded (URL: ${this.page.url()})`);
  }

  /**
   * State (subscription stage) shown active in the statusbar, e.g. "In Progress".
   * The statusbar button is uppercased via CSS (innerText reads "IN PROGRESS"), so normalise to
   * title case to match the canonical label.
   */
  async getState(): Promise<string> {
    const btn = this.stageActiveButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const raw = ((await btn.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const value = raw.replace(/\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    console.log(`  - Subscription State: "${value}" (raw: "${raw}")`);
    return value;
  }

  /** Name shown in the breadcrumb active item, e.g. "SUB1415 - TEST-Reseller#Automation-Jun10". */
  async getName(): Promise<string> {
    const value = ((await this.breadcrumbActive().innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`  - Subscription Name (breadcrumb): "${value}"`);
    return value;
  }

  /**
   * Subscription code, e.g. "SUB1415".
   *
   * Odoo assigns the code on SAVE and re-renders the form afterwards, so a read that lands between
   * the save and the re-render returns "" - which then fails a later assertion far away from the
   * real cause. Poll until the code appears rather than trusting the first read.
   */
  async getCode(attempts = 6): Promise<string> {
    let value = '';
    for (let attempt = 1; attempt <= attempts; attempt++) {
      value = await this.readSpan('code');
      if (value.trim()) {
        console.log(`  - Subscription Code: "${value}"${attempt > 1 ? ` (after ${attempt} reads)` : ''}`);
        return value;
      }
      await this.wait(CommonUtils.waitTimes.long);
    }
    console.log(`  - Subscription Code: "" (still empty after ${attempts} reads)`);
    return value;
  }

  async getCustomer(): Promise<string> {
    const value = await this.readM2o('partner_id');
    console.log(`  - Customer: "${value}"`);
    return value;
  }

  async getPricelist(): Promise<string> {
    const value = await this.readM2o('pricelist_id');
    console.log(`  - Pricelist: "${value}"`);
    return value;
  }

  async getSubscriptionTemplate(): Promise<string> {
    const value = await this.readM2o('template_id');
    console.log(`  - Subscription Template: "${value}"`);
    return value;
  }

  async getSalesperson(): Promise<string> {
    const value = await this.readM2o('user_id');
    console.log(`  - Salesperson: "${value}"`);
    return value;
  }

  /** Start Date as displayed, e.g. "06/29/2026". */
  async getStartDate(): Promise<string> {
    const value = await this.readSpan('date_start');
    console.log(`  - Start Date: "${value}"`);
    return value;
  }

  /** Date of Next Invoice as displayed, e.g. "07/30/2026". */
  async getDateOfNextInvoice(): Promise<string> {
    const value = await this.readSpan('recurring_next_date');
    console.log(`  - Date of Next Invoice: "${value}"`);
    return value;
  }

  /** To Renew checkbox state (default False). */
  async getToRenew(): Promise<boolean> {
    const input = this.booleanInput('to_renew');
    const checked = await input.isChecked().catch(() => false);
    console.log(`  - To Renew: ${checked}`);
    return checked;
  }

  /** Subscription Reminder checkbox state (default False). */
  async getSubscriptionReminder(): Promise<boolean> {
    const input = this.booleanInput('subscription_reminder');
    const checked = await input.isChecked().catch(() => false);
    console.log(`  - Subscription Reminder: ${checked}`);
    return checked;
  }

  /** Recurring Price (recurring_total) as a number, e.g. 244.38. */
  async getRecurringPrice(): Promise<number> {
    await this.recurringTotal().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const raw = (await this.recurringTotal().innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '';
    const value = this.parseAmount(raw);
    console.log(`  - Recurring Price: ${value} (raw: "${raw.replace(/ /g, ' ').trim()}")`);
    return value;
  }

  // ---- Subscription line readers (first data row, header-indexed for robustness) ----

  /** Product text on the first subscription line (span[name="product_id"]). */
  async getLineProduct(): Promise<string> {
    const cell = this.firstLineRow().locator('xpath=.//span[@name="product_id"]').first();
    const value = ((await cell.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`  - Line Product: "${value}"`);
    return value;
  }

  /** Unit of Measure text on the first subscription line (span[name="uom_id"]). */
  async getLineUoM(): Promise<string> {
    const cell = this.firstLineRow().locator('xpath=.//span[@name="uom_id"]').first();
    const value = ((await cell.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`  - Line Unit of Measure: "${value}"`);
    return value;
  }

  /**
   * Read a numeric cell on the first subscription line by its column header text (exact match).
   * The subscription line list columns: Product | Description | Quantity | Unit of Measure |
   * Unit Price | Discount (%) | Sub Total. Header-indexed so it is resilient to column shifts.
   */
  private async getLineCellByHeader(headerExact: string): Promise<string> {
    return await this.page.evaluate((header) => {
      const container = document.querySelector('div[name="recurring_invoice_line_ids"]');
      if (!container) return '';
      const table = container.querySelector('table');
      if (!table) return '';
      const ths = Array.from(table.querySelectorAll('thead th'));
      const idx = ths.findIndex((th) => (th.textContent || '').replace(/\s+/g, ' ').trim() === header);
      if (idx < 0) return '';
      const row = table.querySelector('tbody tr.o_data_row');
      if (!row) return '';
      const cells = Array.from(row.querySelectorAll('td'));
      return cells[idx] ? (cells[idx].textContent || '').replace(/\s+/g, ' ').trim() : '';
    }, headerExact);
  }

  async getLineQuantity(): Promise<number> {
    const raw = await this.getLineCellByHeader('Quantity');
    const value = this.parseAmount(raw);
    console.log(`  - Line Quantity: ${value} (raw: "${raw}")`);
    return value;
  }

  async getLineUnitPrice(): Promise<number> {
    const raw = await this.getLineCellByHeader('Unit Price');
    const value = this.parseAmount(raw);
    console.log(`  - Line Unit Price: ${value} (raw: "${raw}")`);
    return value;
  }

  async getLineDiscount(): Promise<number> {
    const raw = await this.getLineCellByHeader('Discount (%)');
    const value = this.parseAmount(raw);
    console.log(`  - Line Discount (%): ${value} (raw: "${raw}")`);
    return value;
  }

  async getLineSubTotal(): Promise<number> {
    const raw = await this.getLineCellByHeader('Sub Total');
    const value = this.parseAmount(raw);
    console.log(`  - Line Sub Total: ${value} (raw: "${raw}")`);
    return value;
  }

  // ==========================================================================================
  //  ACTIONS - create / edit / stage / billing
  //  Added for the CRM-11806 Subscription Management (Recurring Billing) suite.
  //  Selectors follow the same XPath-primary / CSS-fallback style as the readers above.
  //  Odoo 12 pre-prod: Subscriptions list = action 430 (menu 274);
  //                    Subscription Templates list = action 433 (menu 279).
  //  NOTE: action 430 carries context search_default_my_subscriptions=1, so the list opens
  //  filtered to the logged-in user. clearSearchFacets() removes it when a global view is needed.
  // ==========================================================================================

  private readonly createButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_list_button_add") or normalize-space(.)="Create"]')
      .or(this.page.locator('.o_list_button_add')).first();
  private readonly saveButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_form_button_save")]')
      .or(this.page.locator('.o_form_button_save')).first();
  private readonly stageButtonByLabel = (label: string) =>
    this.page.locator('div[name="stage_id"] button').filter({ hasText: new RegExp('^\\s*' + label + '\\s*$', 'i') }).first();
  private readonly headerButton = (label: string) =>
    this.page.locator('.o_form_statusbar button').filter({ hasText: new RegExp('^\\s*' + label + '\\s*$', 'i') }).first();
  private readonly generateInvoiceLink = () =>
    this.page.locator('xpath=//button[@name="recurring_invoice_new"]')
      .or(this.page.locator('button[name="recurring_invoice_new"]')).first();
  private readonly invoicesStatButton = () =>
    this.page.locator('xpath=//button[@name="action_subscription_invoice"]')
      .or(this.page.locator('button[name="action_subscription_invoice"]')).first();
  private readonly salesStatButton = () =>
    this.page.locator('xpath=//button[@name="action_open_sales"]')
      .or(this.page.locator('button[name="action_open_sales"]')).first();
  private readonly dateInput = (name: string) =>
    this.page.locator('div[name="' + name + '"] input').or(this.page.locator('input[name="' + name + '"]')).first();
  private readonly linesAddRow = () =>
    this.subscriptionLinesContainer().locator('.o_field_x2many_list_row_add a').first();
  private readonly searchInput = () =>
    this.page.locator('.o_searchview_input').first();
  private readonly searchFacetRemove = () =>
    this.page.locator('.o_searchview_facet .o_facet_remove');
  private readonly listRows = () =>
    this.page.locator('.o_list_view tbody tr.o_data_row');

  /** Open the Subscriptions list (action 430 / menu 274) and clear the default "My Subscriptions" facet. */
  async openSubscriptionsList(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    await this.goto(`${origin}/web#action=${await this.xmlId('sale_subscription.sale_subscription_action')}&model=sale.subscription&view_type=list&menu_id=${await this.xmlId('sale_subscription.menu_sale_subscription_action')}`, { waitUntil: 'domcontentloaded' });
    await this.waitForLoadingSpinnerToHide(timeout).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    await this.clearSearchFacets();
    console.log('  - Subscriptions list opened (all records)');
  }

  /** Open the Subscription Templates list (action 433 / menu 279). */
  async openSubscriptionTemplatesList(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    await this.goto(`${origin}/web#action=${await this.xmlId('sale_subscription.sale_subscription_template_action')}&model=sale.subscription.template&view_type=list&menu_id=${await this.xmlId('sale_subscription.menu_template_of_subscription')}`, { waitUntil: 'domcontentloaded' });
    await this.waitForLoadingSpinnerToHide(timeout).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Subscription Templates list opened');
  }

  /**
   * Remove every active search facet (e.g. the default "My Subscriptions").
   * Clicking the facet x is safe; typing Ctrl+A / Backspace into the search box would eat facets.
   */
  async clearSearchFacets(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      const n = await this.searchFacetRemove().count().catch(() => 0);
      if (!n) break;
      await this.searchFacetRemove().first().click().catch(() => {});
      await this.wait(CommonUtils.waitTimes.short);
    }
  }

  /**
   * Type a term into the list search box and press Enter. Returns the number of MATCHING RECORDS.
   *
   * FIXED 2026-10-08 - it used to return 0 unconditionally, which quietly made every assertion built
   * on it meaningless. Two separate causes, both proven by a UI probe against pre-production:
   *
   *  1. The Subscriptions list ships GROUPED BY STAGE. The screen holds only group headers
   *     ("Draft (0)", "In Progress (3)", "To Upsell (0)", "Closed (2)") and NO expanded
   *     `tr.o_data_row`, so counting data rows returned 0 whatever was searched. Specs expecting a
   *     hit failed; specs expecting zero PASSED VACUOUSLY.
   *  2. `fill()` on `.o_searchview_input` did not stick - the term never reached the box, so Enter
   *     just re-applied the default "My Subscriptions" facet. Typing via the keyboard does work.
   *
   * It now types the term properly and, when the list is grouped, sums the per-group counts instead
   * of counting rendered rows.
   */
  async searchInList(term: string): Promise<number> {
    await this.searchInput().click().catch(() => {});
    if (term) {
      await this.page.keyboard.type(term, { delay: 20 });
      await this.wait(CommonUtils.waitTimes.short);
      await this.page.keyboard.press('Enter');
    }
    return this.countListRecords(`Search "${term}"`);
  }

  /**
   * Search the Subscriptions list on a NAMED field instead of the default one.
   *
   * Pressing Enter in the search box takes the FIRST dropdown option, which on this list is
   * "Search Subscription for: ..." - NOT Customer. Probed on pre-production 2026-10-08, the box
   * offers: Subscription | End Date | Customer | Salesperson | Subscription Template | Reference |
   * Message Content. So a partner name typed + Enter matches nothing and silently reads as
   * "0 subscriptions exist for this customer".
   *
   * THROWS when the requested field is not on offer - a wrong field name must fail loudly, never
   * fall back to the default option and return a number that means something else.
   *
   * @param term - what to search for
   * @param fieldLabel - the field as the dropdown spells it, e.g. 'Customer', 'Reference'
   */
  async searchInListByField(term: string, fieldLabel: string): Promise<number> {
    await this.searchInput().click().catch(() => {});
    await this.page.keyboard.type(term, { delay: 20 });
    await this.wait(CommonUtils.waitTimes.short);

    const options = this.page.locator('.o_searchview_autocomplete li');
    await options.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});

    const n = await options.count().catch(() => 0);
    const seen: string[] = [];
    const wanted = new RegExp('^\\s*Search\\s+' + fieldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+for\\s*:', 'i');
    for (let i = 0; i < n; i++) {
      const text = ((await options.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      seen.push(text);
      if (wanted.test(text)) {
        await options.nth(i).click();
        await this.waitForLoadingSpinnerToHide().catch(() => {});
        await this.wait(CommonUtils.waitTimes.long);
        return this.countListRecords(`Search ${fieldLabel} = "${term}"`);
      }
    }

    throw new Error(
      `The Subscriptions search offers no "${fieldLabel}" option for "${term}". It offered ${n}: ` +
      (seen.join(' | ') || '(none)')
    );
  }

  /**
   * Count the records a Subscriptions list is showing.
   *
   * The list ships GROUPED BY STAGE, so the screen holds group headers ("In Progress (3)") and no
   * expanded `tr.o_data_row` - counting rendered rows returns 0 regardless of the filter. Falls back
   * to summing the per-group counts.
   */
  private async countListRecords(label: string): Promise<number> {
    const dataRows = await this.listRows().count().catch(() => 0);
    if (dataRows > 0) {
      console.log('  - ' + label + ' -> ' + dataRows + ' row(s) [ungrouped list]');
      return dataRows;
    }

    const groups = this.page.locator('tr.o_group_header');
    const groupCount = await groups.count().catch(() => 0);
    let total = 0;
    let parsed = 0;
    for (let i = 0; i < groupCount; i++) {
      const text = ((await groups.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      const m = text.match(/\((\d+)\)/);
      if (m) {
        total += Number(m[1]);
        parsed++;
      }
    }
    if (parsed > 0) {
      console.log('  - ' + label + ' -> ' + total + ' record(s) across ' + parsed + ' group(s)');
      return total;
    }

    console.log('  - ' + label + ' -> 0 (no data rows and no group headers on screen)');
    return 0;
  }

  /**
   * Expand every collapsed group header on the Subscriptions list.
   *
   * The list ships GROUPED BY STAGE, so it renders only `tr.o_group_header` rows and the actual
   * records stay collapsed inside them. Anything that reads a row - or counts `tr.o_data_row` -
   * sees nothing until the groups are opened.
   *
   * @returns the number of group headers clicked
   */
  async expandAllListGroups(): Promise<number> {
    const headers = this.page.locator('tr.o_group_header');
    const total = await headers.count().catch(() => 0);
    let opened = 0;
    for (let i = 0; i < total; i++) {
      const header = headers.nth(i);
      const text = ((await header.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      // "Stage (0)" has nothing to show - clicking it only costs a round-trip.
      if (/\(0\)/.test(text)) continue;
      const alreadyOpen = await header.locator('.fa-caret-down, .o_group_open').count().catch(() => 0);
      if (alreadyOpen) continue;
      await header.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.short);
      opened++;
    }
    await this.waitForLoadingSpinnerToHide().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Expanded ${opened} of ${total} list group(s)`);
    return opened;
  }

  /**
   * Read the Subscriptions LIST row whose Reference cell matches `reference`.
   *
   * Use this instead of the form readers (getCode / getCustomer / getState ...) when the assertion
   * is about what the LIST shows - those read `<span name="...">` on a form and return "" on a list,
   * which reads as "the column is empty" rather than "I looked in the wrong place".
   *
   * THROWS when the row is not on screen, so a missing row can never be mistaken for empty columns.
   *
   * @returns the row's visible cell texts, in column order
   */
  async getListRowCells(reference: string): Promise<string[]> {
    await this.expandAllListGroups();
    const row = this.page.locator('tr.o_data_row').filter({ hasText: reference }).first();
    const found = await row.count().catch(() => 0);
    if (!found) {
      const visible = await this.page.locator('tr.o_data_row').count().catch(() => 0);
      throw new Error(
        `No list row matching "${reference}" (${visible} data row(s) on screen after expanding groups).`
      );
    }
    const cells = row.locator('td.o_data_cell');
    const n = await cells.count().catch(() => 0);
    const values: string[] = [];
    for (let i = 0; i < n; i++) {
      values.push(((await cells.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim());
    }
    console.log(`  - List row "${reference}": [${values.join(' | ')}]`);
    return values;
  }

  /**
   * The Subscriptions list row for `reference`, as a header -> cell-text map.
   *
   * Prefer this over getListRowCells(): the column SET depends on who is logged in. Probed on
   * pre-production the same list renders 7 columns for a salesperson and 10 for the administrator
   * (it gains Company and two timestamps), so reading cells by POSITION picks a different field per
   * user - `cells[last]` returned the Stage for one and a timestamp for the other.
   *
   * THROWS when the row is not on screen.
   */
  async getListRowByHeaders(reference: string): Promise<Record<string, string>> {
    const cells = await this.getListRowCells(reference);

    const headerCells = this.page.locator('.o_list_view thead th');
    const hn = await headerCells.count().catch(() => 0);
    const headers: string[] = [];
    for (let i = 0; i < hn; i++) {
      const raw = (await headerCells.nth(i).innerText().catch(() => '')) || '';
      // Odoo's leading selector column renders a ZERO-WIDTH SPACE (U+200B), not an empty string, so
      // a plain `!== ''` filter keeps it and shifts every header one column to the right - which
      // silently mapped Reference onto the Customer value here. Strip invisible characters first.
      headers.push(raw.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim());
    }
    const named = headers.filter((h) => h.length > 0);

    const map: Record<string, string> = {};
    for (let i = 0; i < cells.length; i++) {
      map[named[i] ?? `col${i}`] = cells[i];
    }
    console.log(`  - List row "${reference}" headers: ${named.join(' | ')}`);
    return map;
  }

  /** Open the subscription whose list row carries `reference`, and wait for its form. */
  async openRowByReference(reference: string): Promise<void> {
    await this.expandAllListGroups();
    const row = this.page.locator('tr.o_data_row').filter({ hasText: reference }).first();
    if (!(await row.count().catch(() => 0))) {
      throw new Error(`Cannot open "${reference}" - no such row on the Subscriptions list.`);
    }
    await row.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForFormView(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log(`  - Opened subscription "${reference}" from the list`);
  }

  /**
   * Switch the Subscriptions view between list and kanban using the control-panel switcher.
   * THROWS when the switcher button is not on screen - a silent no-op would leave the next
   * assertion describing the wrong view.
   */
  async switchListViewMode(mode: 'list' | 'kanban'): Promise<void> {
    const button = this.page
      .locator(`.o_cp_switch_buttons button[data-view-type="${mode}"]`)
      .or(this.page.locator(`button[data-view-type="${mode}"]`))
      .or(this.page.locator(`.o_cp_switch_${mode}`))
      .first();
    const present = await button.count().catch(() => 0);
    if (!present) {
      throw new Error(`No "${mode}" view-switcher button on the control panel.`);
    }
    await button.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingSpinnerToHide().catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log(`  - Switched to the ${mode} view`);
  }

  /**
   * Titles of the kanban stage columns, in screen order.
   * THROWS when no column renders - an empty array would read as "the kanban has no stages".
   */
  async getKanbanColumnTitles(): Promise<string[]> {
    const columns = this.page.locator('.o_kanban_group .o_column_title, .o_kanban_header_title .o_column_title');
    await columns.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const n = await columns.count().catch(() => 0);
    if (!n) {
      throw new Error('No kanban stage columns on screen - is the view actually in kanban mode?');
    }
    const titles: string[] = [];
    for (let i = 0; i < n; i++) {
      titles.push(((await columns.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim());
    }
    console.log(`  - Kanban columns (${n}): ${titles.join(' | ')}`);
    return titles;
  }

  /** Click CREATE on a list view. */
  async clickCreate(): Promise<void> {
    await this.waitForConnectionRestored();
    await this.createButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForFormView().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - CREATE clicked, new form opened');
  }

  /** Click SAVE and wait for the form to leave edit mode. */
  async save(): Promise<void> {
    await this.waitForConnectionRestored();
    await this.saveButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForFormSaved(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - SAVE clicked');
  }

  /** Click EDIT and wait for edit mode. */
  async clickEdit(): Promise<void> {
    await this.editButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - EDIT clicked');
  }

  /**
   * Fill a Many2one field by typing and picking the matching suggestion.
   * When createIfMissing is true and no existing record matches, the "Create ..." entry is used.
   */
  async fillMany2One(fieldName: string, value: string, createIfMissing = false): Promise<void> {
    await this.waitForConnectionRestored();
    const input = this.m2oInput(fieldName);
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

    // CANONICAL Odoo combobox pattern (mirrors InvestmentPage.selectInvestmentType):
    // click -> clear -> settle -> fill the WHOLE value at once -> settle -> Enter.
    // Typing character by character races with the previous field's onchange re-render and
    // silently drops the leading characters.
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.standard);
    await input.fill(value);
    await this.wait(CommonUtils.waitTimes.long);

    const typed = ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    if (typed !== value) {
      console.log(`  ! ${fieldName}: the field holds "${typed}" but "${value}" was requested - retyping`);
      await input.fill('');
      await this.wait(CommonUtils.waitTimes.standard);
      await input.fill(value);
      await this.wait(CommonUtils.waitTimes.long);
    }

    const exact = this.autocompleteItems()
      .filter({ hasText: new RegExp('^\\s*' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') })
      .first();

    if (await exact.count().catch(() => 0)) {
      await exact.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    } else if (createIfMissing) {
      const createItem = this.autocompleteItems().filter({ hasText: /^Create "/ }).first();
      if (await createItem.count().catch(() => 0)) {
        await createItem.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      } else {
        await this.page.keyboard.press('Enter');
      }
    } else {
      // No exact match and we are NOT allowed to create - pressing Enter picks the highlighted
      // suggestion. Never click a "Create ..." entry here: that would invent a bogus record.
      await this.page.keyboard.press('Enter');
    }

    await this.wait(CommonUtils.waitTimes.long);
    const finalValue = ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    console.log(`  - ${fieldName} set to "${finalValue}" (requested "${value}")`);
  }

  /**
   * Set a many2one by typing `searchText` and clicking the option whose label is EXACTLY
   * `exactLabel`. THROWS when that option is not on offer, or when the field does not end up
   * holding it.
   *
   * Why this exists (proven on pre-production 2026-10-08): Odoo renders a pricelist as
   * "<name> (<currency>)". Two pricelists collide here -
   *    name "Public Pricelist_EUR"        currency EUR -> shows "Public Pricelist_EUR (EUR)"
   *    name "Public Pricelist_EUR (EUR)"  currency USD -> shows "Public Pricelist_EUR (EUR) (USD)"
   * Typing the full label "Public Pricelist_EUR (EUR)" makes name_search FILTER OUT the first one
   * (its name does not contain that string), leaving only the USD-currency trap. fillMany2One then
   * found no exact match, pressed Enter, took the highlighted suggestion and merely LOGGED
   * `set to "...(USD)" (requested "...(EUR)")` - so subscription-3.6 silently billed in USD and
   * failed on a currency assertion that was never the real defect.
   *
   * @param fieldName  the many2one technical name, e.g. 'pricelist_id'
   * @param searchText what to TYPE (usually the bare name, without the currency parenthetical)
   * @param exactLabel the option label that must be clicked, matched exactly after whitespace trim
   */
  async selectMany2OneByExactLabel(fieldName: string, searchText: string, exactLabel: string): Promise<void> {
    await this.waitForConnectionRestored();
    const input = this.m2oInput(fieldName);
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.standard);
    await input.fill(searchText);
    await this.wait(CommonUtils.waitTimes.long);

    const items = this.autocompleteItems();
    await items.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});

    const n = await items.count().catch(() => 0);
    const seen: string[] = [];
    for (let i = 0; i < n; i++) {
      const text = ((await items.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      seen.push(text);
      if (text === exactLabel) {
        await items.nth(i).click({ timeout: CommonUtils.waitTimes.abnormalWait });
        await this.wait(CommonUtils.waitTimes.long);
        const finalValue = ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
        if (finalValue !== exactLabel) {
          throw new Error(
            `${fieldName}: clicked "${exactLabel}" but the field now holds "${finalValue}".`
          );
        }
        console.log(`  - ${fieldName} set to "${finalValue}" (exact match on "${exactLabel}")`);
        return;
      }
    }

    throw new Error(
      `${fieldName}: typing "${searchText}" offered no option labelled exactly "${exactLabel}". ` +
      `It offered ${n}: ${seen.join(' | ') || '(none)'}`
    );
  }

  /**
   * Set the Pricelist to the record the picker LABELS exactly `exactLabel`.
   *
   * Always use this instead of fillMany2One('pricelist_id', ...). Odoo labels a pricelist
   * "<name> (<currency>)" and this database holds pairs whose names differ only by that suffix:
   *     name "Public Pricelist_USD"        -> label "Public Pricelist_USD (USD)"
   *     name "Public Pricelist_USD (USD)"  -> label "Public Pricelist_USD (USD) (USD)"
   *     name "Public Pricelist_EUR"        -> label "Public Pricelist_EUR (EUR)"      [EUR money]
   *     name "Public Pricelist_EUR (EUR)"  -> label "Public Pricelist_EUR (EUR) (USD)" [USD money!]
   * Typing a full label makes name_search drop the shorter-named record, leaving only the trap,
   * and fillMany2One would then press Enter and take it while only LOGGING the mismatch.
   *
   * This types the bare name (the label minus its trailing currency parenthetical) and requires an
   * exact-label match, throwing otherwise.
   */
  async setPricelist(exactLabel: string): Promise<void> {
    const searchText = exactLabel.replace(/\s*\([^()]*\)\s*$/, '').trim();
    await this.selectMany2OneByExactLabel('pricelist_id', searchText, exactLabel);
  }

  /** Set a date field (format MM/DD/YYYY) and close the date picker. */
  async setDateField(fieldName: string, mmddyyyy: string): Promise<void> {
    await this.waitForConnectionRestored();
    const input = this.dateInput(fieldName);
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.standard);
    await input.fill(mmddyyyy);
    await this.wait(CommonUtils.waitTimes.standard);
    await this.page.keyboard.press('Escape');
    await this.wait(CommonUtils.waitTimes.standard);
    console.log('  - ' + fieldName + ' set to ' + mmddyyyy);
  }

  /** Add one Subscription Line: pick the product by search term and set the quantity. */
  async addSubscriptionLine(productTerm: string, quantity: number): Promise<void> {
    await this.waitForConnectionRestored();
    await this.page.locator('a.nav-link').filter({ hasText: 'Subscription Lines' }).first().click().catch(() => {});
    await this.wait(CommonUtils.waitTimes.standard);
    await this.linesAddRow().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    const productInput = this.subscriptionLinesContainer().locator('div[name="product_id"] input').first();
    await productInput.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await productInput.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await productInput.fill('');
    await this.wait(CommonUtils.waitTimes.standard);
    await productInput.fill(productTerm);
    await this.wait(CommonUtils.waitTimes.extraLong);
    const productSuggestion = this.autocompleteItems().filter({ hasText: productTerm }).first();
    if (await productSuggestion.count().catch(() => 0)) {
      await productSuggestion.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    } else {
      await this.page.keyboard.press('Enter');
    }
    await this.wait(CommonUtils.waitTimes.long);
    const qtyInput = this.subscriptionLinesContainer().locator('input[name="quantity"]').first();
    await qtyInput.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await qtyInput.fill(String(quantity));
    await this.page.keyboard.press('Tab');
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Subscription Line added: "' + productTerm + '" x ' + quantity);
  }

  /**
   * Click a stage on the status bar (e.g. "In Progress") and CONFIRM it took effect.
   *
   * Odoo writes the stage immediately only when the form is in readonly mode; a click landing
   * while the view is still re-rendering after a save is silently swallowed. Verify the state
   * afterwards and retry rather than letting a later step fail with a confusing message.
   */
  async setStage(label: string, attempts = 3): Promise<void> {
    await this.waitForConnectionRestored();
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.discardFormIfInEditMode().catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
      await this.stageButtonByLabel(label).waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.stageButtonByLabel(label).click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.waitForLoadingSpinnerToHide().catch(() => {});
      await this.wait(CommonUtils.waitTimes.extraLong);
      const current = await this.getState();
      if (current.trim().toLowerCase() === label.trim().toLowerCase()) {
        console.log(`  - Stage set to "${label}" (attempt ${attempt})`);
        return;
      }
      console.log(`  ! Stage is still "${current}" after attempt ${attempt} - retrying`);
    }
    console.log(`  ! Stage did NOT change to "${label}" after ${attempts} attempts`);
  }

  /**
   * True when "Date of Next Invoice" is rendered.
   * The field and its "=> Generate Invoice" link are hidden while the subscription is not
   * in progress (Odoo attrs invisible: in_progress = False) - this is the DRAFT check.
   */
  async isDateOfNextInvoiceVisible(): Promise<boolean> {
    const readonly = await this.spanField('recurring_next_date').isVisible().catch(() => false);
    const edit = await this.dateInput('recurring_next_date').isVisible().catch(() => false);
    const visible = readonly || edit;
    console.log('  - "Date of Next Invoice" visible: ' + visible);
    return visible;
  }

  /** True when the "=> Generate Invoice" link is rendered. */
  async isGenerateInvoiceVisible(): Promise<boolean> {
    const visible = await this.generateInvoiceLink().isVisible().catch(() => false);
    console.log('  - "=> Generate Invoice" link visible: ' + visible);
    return visible;
  }

  /** Set "Date of Next Invoice" (form must already be in edit mode and In Progress). */
  async setDateOfNextInvoice(mmddyyyy: string): Promise<void> {
    await this.setDateField('recurring_next_date', mmddyyyy);
  }

  /**
   * Click the "=> Generate Invoice" link and wait for the billing round-trip.
   *
   * IMPORTANT: this link navigates AWAY from the subscription to the invoice it just created
   * (the URL becomes model=account.invoice with active_id = the subscription id). The caller
   * must use returnUrl to come back before reading anything else off the subscription.
   */
  async clickGenerateInvoice(): Promise<GenerateInvoiceResult> {
    await this.waitForConnectionRestored();
    const returnUrl = this.page.url();
    await this.generateInvoiceLink().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});

    // READ any Odoo dialog before dismissing it. dismissErrorDialogWithRetry() throws the message
    // away, and that is how a billing run that raised a UserError ("no payment token", "nothing to
    // invoice", ...) looked like a silent no-op: no invoice, no date change, and no explanation.
    const dialog = this.page.locator('xpath=//div[contains(@class,"modal") and contains(@class,"show")]')
      .or(this.page.locator('.modal.show, .o_dialog')).first();
    let dialogText = '';
    if (await dialog.count().catch(() => 0)) {
      dialogText = ((await dialog.innerText({ timeout: CommonUtils.waitTimes.long }).catch(() => '')) || '')
        .replace(/\s+/g, ' ').trim();
      if (dialogText) console.log(`  ! Odoo dialog after "=> Generate Invoice": "${dialogText}"`);
    }

    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    const invoiceUrl = this.page.url();
    const navigatedToInvoice = /model=account\.invoice/.test(invoiceUrl);
    console.log(`  - "=> Generate Invoice" clicked (landed on ${navigatedToInvoice ? 'the new invoice' : 'the same page'})`);
    return { returnUrl, invoiceUrl, navigatedToInvoice, dialogText };
  }

  /** Navigate back to a subscription by its URL and wait for the form. */
  async openByUrl(url: string): Promise<void> {
    await this.goto(url, { waitUntil: 'domcontentloaded' });
    await this.waitForLoaded();
  }

  /** Number shown on the "Invoices" smart button. */
  async getInvoiceCount(): Promise<number> {
    const raw = await this.invoicesStatButton().innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '');
    const m = (raw || '').match(/\d+/);
    const value = m ? parseInt(m[0], 10) : 0;
    console.log('  - "Invoices" smart button: ' + value + ' (raw: "' + (raw || '').replace(/\n/g, ' ') + '")');
    return value;
  }

  /** Number shown on the "Sales" smart button. */
  async getSalesCount(): Promise<number> {
    const raw = await this.salesStatButton().innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '');
    const m = (raw || '').match(/\d+/);
    const value = m ? parseInt(m[0], 10) : 0;
    console.log('  - "Sales" smart button: ' + value);
    return value;
  }

  /**
   * Open the sales order(s) behind the "Sales" smart button.
   *
   * "Sales" is a STAT button, not a header button - `clickHeaderButton('Sales')` never matches it,
   * and a spec that fell back to `openInvoices()` landed on the invoice screen instead, where the
   * order number reads empty.
   */
  async openSales(): Promise<void> {
    await this.salesStatButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingSpinnerToHide().catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log('  - "Sales" smart button opened');
  }

  /** Open the invoices behind the "Invoices" smart button. */
  async openInvoices(): Promise<void> {
    await this.invoicesStatButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingSpinnerToHide().catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log('  - "Invoices" smart button opened');
  }

  /** True when a header button with this label is rendered (e.g. "Close", "Upsell"). */
  async isHeaderButtonVisible(label: string): Promise<boolean> {
    const visible = await this.headerButton(label).isVisible().catch(() => false);
    console.log('  - Header button "' + label + '" visible: ' + visible);
    return visible;
  }

  /** Click a header button by its label (e.g. "Close", "Upsell", "Create A Renewal Quotation"). */
  async clickHeaderButton(label: string): Promise<void> {
    await this.headerButton(label).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingSpinnerToHide().catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log('  - Header button "' + label + '" clicked');
  }

  /** Close Reason shown on the form (only rendered once the subscription is not in progress). */
  async getCloseReason(): Promise<string> {
    return await this.readM2o('close_reason_id');
  }

  /** Number of Subscription Lines currently on the form. */
  async getLineCount(): Promise<number> {
    const count = await this.subscriptionLinesContainer().locator('tr.o_data_row').count().catch(() => 0);
    console.log('  - Subscription Lines: ' + count + ' row(s)');
    return count;
  }

  private readonly autocompleteItems = () =>
    this.page.locator('xpath=//ul[contains(@class,"ui-autocomplete")]//li[contains(@class,"ui-menu-item")]/a')
      .or(this.page.locator('.ui-autocomplete li.ui-menu-item a'));

  /**
   * Open a Many2one dropdown and return the suggestion labels it offers.
   * Pass a searchText to filter, or leave it empty to read the full list.
   * The trailing helper entries ("Search More...", "Create ...") are stripped so the caller
   * gets only real record names and can assert set-equality.
   */
  async getMany2OneDropdownOptions(fieldName: string, searchText = ''): Promise<string[]> {
    const input = this.m2oInput(fieldName);
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.standard);
    if (searchText) {
      await input.fill(searchText);
    }
    await this.wait(CommonUtils.waitTimes.extraLong);

    const options: string[] = [];
    const count = await this.autocompleteItems().count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const text = ((await this.autocompleteItems().nth(i).innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
      if (text && !/^Search More/i.test(text) && !/^Create/i.test(text)) options.push(text);
    }
    console.log(`  - "${fieldName}" dropdown${searchText ? ` filtered by "${searchText}"` : ''} offers ${options.length}: ${options.join(' | ') || '(none)'}`);
    return options;
  }

  /** Read the text shown on the currently-open record page (used for coarse content checks). */
  // ==========================================================================================
  //  Notebook tabs, Settings fields, multi-line readers, chatter and lifecycle buttons
  //  (added for the CRM-11806 cases 1.2.x / 1.3.x / 1.4.x)
  // ==========================================================================================

  /**
   * Activate one of the subscription's notebook tabs ("Subscription Lines" / "Settings") and PROVE
   * it became the active page.
   *
   * Odoo keeps inactive notebook pages in the DOM but hidden, so a reader for a field on another
   * tab resolves its span and then times out waiting for visibility. Worse, when the form was
   * reached by drilling in from another record an overlay can swallow pointer events, so a plain
   * click - and even a forced one, which still dispatches at coordinates - silently does nothing.
   * A direct DOM click bypasses hit-testing and is what actually works.
   */
  async openTab(label: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    const tab = this.page
      .locator('xpath=//div[contains(@class,"o_notebook")]//a[contains(@class,"nav-link")]')
      .or(this.page.locator('.o_notebook .nav-link'))
      .filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') })
      .filter({ visible: true })
      .first();

    const isActive = async (): Promise<boolean> => {
      const cls = ((await tab.getAttribute('class').catch(() => '')) || '');
      const sel = ((await tab.getAttribute('aria-selected').catch(() => '')) || '');
      return /\bactive\b/.test(cls) || sel === 'true';
    };

    for (let attempt = 1; attempt <= 3; attempt++) {
      await tab.waitFor({ state: 'visible', timeout }).catch(() => {});
      await tab.click({ timeout }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      if (await isActive()) { console.log(`  - "${label}" tab active (attempt ${attempt}, plain click)`); return; }

      await tab.evaluate((el) => (el as HTMLElement).click()).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      if (await isActive()) { console.log(`  - "${label}" tab active (attempt ${attempt}, DOM click)`); return; }
    }
    throw new Error(`openTab: could not activate the "${label}" tab - every field on it stays hidden, so later readers would time out instead of reporting a value.`);
  }

  /** "Payment Token" on the Settings tab - the masked saved card, or "" when none is set. */
  async getPaymentToken(): Promise<string> {
    await this.openTab('Settings');
    const anchor = this.page.locator('xpath=//a[@name="payment_token_id"]')
      .or(this.page.locator('xpath=//div[@name="payment_token_id"]//input'))
      .or(this.page.locator('a[name="payment_token_id"]')).first();

    if (!(await anchor.count().catch(() => 0))) {
      console.log('  - Payment Token: "" (field not rendered - no sending payment mode on this template)');
      return '';
    }
    const tag = ((await anchor.evaluate((el) => el.tagName).catch(() => '')) || '').toUpperCase();
    const value = tag === 'INPUT'
      ? ((await anchor.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim()
      : ((await anchor.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    console.log(`  - Payment Token: "${value}"`);
    return value;
  }

  /** Set the "Payment Token" many2one on the Settings tab (form must already be in edit mode). */
  async setPaymentToken(value: string): Promise<void> {
    await this.openTab('Settings');
    await this.fillMany2One('payment_token_id', value);
  }

  /** End Date (field "date"), e.g. "09/19/2026"; "" when the subscription has none. */
  async getEndDate(): Promise<string> {
    const span = this.page.locator('xpath=//span[@name="date"]').or(this.page.locator('span[name="date"]')).first();
    const input = this.page.locator('xpath=//div[@name="date"]//input').or(this.page.locator('input[name="date"]')).first();
    let value = '';
    if (await span.count().catch(() => 0)) {
      value = ((await span.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    }
    if (!value && (await input.count().catch(() => 0))) {
      value = ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    }
    console.log(`  - End Date: "${value}"`);
    return value;
  }

  /** Tick / untick a boolean field by name (e.g. "to_renew"). Form must be in edit mode. */
  async setCheckbox(fieldName: string, value: boolean): Promise<void> {
    const box = this.page.locator(`xpath=//div[@name="${fieldName}"]//input[@type="checkbox"] | //input[@name="${fieldName}"][@type="checkbox"]`)
      .or(this.page.locator(`input[name="${fieldName}"][type="checkbox"]`)).first();
    await box.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const current = await box.isChecked().catch(() => false);
    if (current === value) { console.log(`  - "${fieldName}" already ${value ? 'ticked' : 'unticked'}`); return; }
    await box.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
    if ((await box.isChecked().catch(() => false)) !== value) {
      await box.evaluate((el) => (el as HTMLElement).click()).catch(() => {});
      await this.wait(CommonUtils.waitTimes.medium);
    }
    const after = await box.isChecked().catch(() => false);
    console.log(`  - "${fieldName}" set to ${after}`);
    if (after !== value) throw new Error(`setCheckbox: "${fieldName}" is ${after}, expected ${value}`);
  }

  /** Product text of EVERY subscription line, in list order. */
  async getAllLineProducts(): Promise<string[]> {
    await this.openTab('Subscription Lines').catch(() => {});
    const rows = this.subscriptionLinesContainer().locator('tr.o_data_row');
    const count = await rows.count().catch(() => 0);
    const products: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = ((await rows.nth(i).locator('xpath=.//span[@name="product_id"]').first()
        .innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (text) products.push(text);
    }
    console.log(`  - Subscription line products (${products.length}): ${products.join(' | ')}`);
    return products;
  }

  /** Read one column of EVERY subscription line by its header text, as numbers. */
  async getAllLineNumbersByHeader(headerExact: string): Promise<number[]> {
    const raw = await this.page.evaluate((header) => {
      const container = document.querySelector('div[name="recurring_invoice_line_ids"]');
      const table = container?.querySelector('table');
      if (!table) return [] as string[];
      const ths = Array.from(table.querySelectorAll('thead th'));
      const idx = ths.findIndex((th) => (th.textContent || '').replace(/\s+/g, ' ').trim() === header);
      if (idx < 0) return [] as string[];
      return Array.from(table.querySelectorAll('tbody tr.o_data_row')).map((row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        return cells[idx] ? (cells[idx].textContent || '').replace(/\s+/g, ' ').trim() : '';
      });
    }, headerExact);
    const values = raw.map((r) => this.parseAmount(r));
    console.log(`  - Line "${headerExact}" values: ${values.join(' | ')}`);
    return values;
  }

  /** Full chatter / message-history text of the open subscription. */
  async getChatterText(): Promise<string> {
    const chatter = this.page
      .locator("xpath=//*[contains(@class,'o_mail_thread') or contains(@class,'o-mail-Thread') or contains(@class,'o_thread_message_content')]")
      .or(this.page.locator('.o_mail_thread, .o-mail-Thread, .o_thread_message_content'));
    await chatter.first().waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const texts = await chatter.allTextContents().catch(() => [] as string[]);
    const joined = texts.join('\n').replace(/\s+\n/g, '\n').trim();
    console.log(`  - Subscription chatter read (${joined.length} chars)`);
    return joined;
  }

  /** Is the chatter region rendered? Pair with getChatterText before asserting an ABSENCE. */
  async hasChatter(): Promise<boolean> {
    const chatter = this.page.locator("xpath=//*[contains(@class,'o_mail_thread') or contains(@class,'o-mail-Thread')]")
      .or(this.page.locator('.o_mail_thread, .o-mail-Thread'));
    const present = (await chatter.count().catch(() => 0)) > 0;
    console.log(`  - Subscription chatter present: ${present}`);
    return present;
  }

  /** Number of scheduled activities shown on the subscription (0 when none). */
  async getActivityCount(): Promise<number> {
    const rows = this.page.locator('xpath=//div[contains(@class,"o_mail_activity")]//div[contains(@class,"o_activity_record")] | //div[contains(@class,"o_mail_activity")]//div[contains(@class,"o_thread_message")]')
      .or(this.page.locator('.o_mail_activity .o_activity_record'));
    const count = await rows.count().catch(() => 0);
    console.log(`  - Scheduled activities on the subscription: ${count}`);
    return count;
  }

  /**
   * Drive the "Upsell" wizard: open it from the header, add one product line, then click
   * "Create & View Quotation" so the browser lands on the upsell quotation.
   *
   * The "Upsell" button carries attrs invisible in_progress = False, so the subscription must
   * already be IN PROGRESS - this method fails loudly rather than silently doing nothing.
   */
  async upsellWithProduct(productTerm: string, quantity: number): Promise<void> {
    if (!(await this.isHeaderButtonVisible('Upsell'))) {
      throw new Error('upsellWithProduct: the "Upsell" button is not offered - it only appears once the subscription is IN PROGRESS.');
    }
    await this.clickHeaderButton('Upsell');

    const modal = this.page.locator('xpath=//div[contains(@class,"modal") and contains(@class,"show")]')
      .or(this.page.locator('.modal.show')).first();
    await modal.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);

    const addRow = modal.locator('xpath=.//a[contains(@class,"o_field_x2many_list_row_add")] | .//div[contains(@class,"o_field_x2many_list_row_add")]//a')
      .or(modal.locator('.o_field_x2many_list_row_add a')).first();
    await addRow.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);

    const productInput = modal.locator('xpath=.//div[@name="product_id"]//input')
      .or(modal.locator('div[name="product_id"] input')).first();
    await productInput.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await productInput.fill('');
    await this.wait(CommonUtils.waitTimes.standard);
    await productInput.fill(productTerm);
    await this.wait(CommonUtils.waitTimes.long);
    await this.page.keyboard.press('Enter');
    await this.wait(CommonUtils.waitTimes.long);

    const qtyInput = modal.locator('xpath=.//input[@name="product_uom_qty"] | .//input[@name="quantity"]')
      .or(modal.locator('input[name="product_uom_qty"], input[name="quantity"]')).first();
    if (await qtyInput.count().catch(() => 0)) {
      await qtyInput.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await qtyInput.fill(String(quantity));
      await this.wait(CommonUtils.waitTimes.medium);
    }
    console.log(`  - Upsell line "${productTerm}" x ${quantity} entered`);

    const createButton = modal.locator('xpath=.//button[contains(normalize-space(),"Create") and contains(normalize-space(),"Quotation")]')
      .or(modal.locator('.modal-footer button.btn-primary')).first();
    await createButton.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log('  - "Create & View Quotation" clicked - now on the upsell quotation');
  }

  /**
   * Close the subscription through the header "Close" button, picking a Close Reason in the dialog.
   * Returns the reason that was actually selected so the test can assert the form keeps it.
   */
  async closeSubscription(): Promise<string> {
    await this.clickHeaderButton('Close');

    // This block mirrors a UI probe that was run against pre-production and DID work. Two earlier
    // attempts to fix it failed because both diagnoses were wrong: the reasons are not missing (the
    // probe saw NINE) and the list is not merely counted too early. What actually broke it:
    //   - the modal and the input were located through `A.or(B).first()` chains, where .first()
    //     takes the first DOM match of EITHER selector and could land on the wrong element;
    //   - every interaction was wrapped in `.catch(() => {})`, so a click that never landed was
    //     swallowed and the method simply reported "(none offered)" - a silent failure reported as
    //     a finding about the product.
    // So: plain locators, and the click is NOT swallowed.
    const modal = this.page.locator('.modal.show').first();
    await modal.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.extraLong);

    const reasonInput = modal.locator('div[name="close_reason_id"] input').first();
    let reason = '';
    if (await reasonInput.count().catch(() => 0)) {
      await reasonInput.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await reasonInput.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.long);

      // Scope to the VISIBLE list - Odoo 12 keeps one hidden <ul> per many2one in the DOM.
      const options = this.page.locator('.ui-autocomplete:visible li.ui-menu-item');
      await options.first()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .catch(() => {});

      const n = await options.count().catch(() => 0);
      console.log(`  - Close Reason picker offers ${n} entr${n === 1 ? 'y' : 'ies'}`);
      for (let i = 0; i < n; i++) {
        const text = ((await options.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        // "Search More..." and "Create ..." are not close reasons.
        if (!text || /^search more/i.test(text) || /^create\b/i.test(text)) continue;
        reason = text;
        await options.nth(i).click({ timeout: CommonUtils.waitTimes.abnormalWait });
        await this.wait(CommonUtils.waitTimes.long);
        break;
      }
    }

    const confirm = modal.locator('xpath=.//button[contains(@class,"btn-primary")]')
      .or(modal.locator('.modal-footer button.btn-primary')).first();
    await confirm.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.waitForLoadingSpinnerToHide().catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log(`  - Subscription closed with reason "${reason || '(none offered)'}"`);
    return reason;
  }

  async getContentText(): Promise<string> {
    return ((await this.page.locator('.o_content').first().innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/ /g, ' ');
  }

  private readonly connectionLostDialog = () =>
    this.page.locator('xpath=//div[@role="alertdialog"][contains(.,"Connection lost")]')
      .or(this.page.locator('[role="alertdialog"]:has-text("Connection lost")')).first();

  /**
   * Odoo shows a "Connection lost - Trying to reconnect..." alert dialog when the session bus
   * drops (pre-prod does this occasionally). The dialog overlays the form, so every following
   * click waits for actionability forever. Poll until it clears before continuing.
   * Best-effort: returns true when the page is usable, false when the banner never went away.
   */
  async waitForConnectionRestored(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const present = await this.connectionLostDialog().isVisible().catch(() => false);
    if (!present) return true;

    console.log('  ! Odoo reported "Connection lost" - waiting for the session to come back');
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await this.wait(CommonUtils.waitTimes.long);
      const stillThere = await this.connectionLostDialog().isVisible().catch(() => false);
      if (!stillThere) {
        console.log('  ! Connection restored - continuing');
        await this.wait(CommonUtils.waitTimes.extraLong);
        return true;
      }
    }
    console.log('  ! Connection did NOT come back within the wait budget');
    return false;
  }
}
