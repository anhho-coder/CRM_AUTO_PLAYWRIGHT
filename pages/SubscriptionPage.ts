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
      const raw = ((await anchor.innerText().catch(() => '')) || '');
      const firstLine = raw.split('\n')[0].replace(/\s+/g, ' ').trim();
      if (firstLine) return firstLine;
    }
    const input = this.m2oInput(name);
    if (await input.count().catch(() => 0)) {
      return ((await input.inputValue().catch(() => '')) || '').trim();
    }
    return '';
  }

  /** Read a readonly span field's text. */
  private async readSpan(name: string): Promise<string> {
    const span = this.spanField(name);
    if (await span.count().catch(() => 0)) {
      return ((await span.innerText().catch(() => '')) || '').replace(/ /g, ' ').trim();
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
    const raw = ((await btn.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const value = raw.replace(/\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    console.log(`  - Subscription State: "${value}" (raw: "${raw}")`);
    return value;
  }

  /** Name shown in the breadcrumb active item, e.g. "SUB1415 - TEST-Reseller#Automation-Jun10". */
  async getName(): Promise<string> {
    const value = ((await this.breadcrumbActive().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`  - Subscription Name (breadcrumb): "${value}"`);
    return value;
  }

  /** Subscription code, e.g. "SUB1415". */
  async getCode(): Promise<string> {
    const value = await this.readSpan('code');
    console.log(`  - Subscription Code: "${value}"`);
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
    const raw = (await this.recurringTotal().innerText().catch(() => '')) || '';
    const value = this.parseAmount(raw);
    console.log(`  - Recurring Price: ${value} (raw: "${raw.replace(/ /g, ' ').trim()}")`);
    return value;
  }

  // ---- Subscription line readers (first data row, header-indexed for robustness) ----

  /** Product text on the first subscription line (span[name="product_id"]). */
  async getLineProduct(): Promise<string> {
    const cell = this.firstLineRow().locator('xpath=.//span[@name="product_id"]').first();
    const value = ((await cell.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`  - Line Product: "${value}"`);
    return value;
  }

  /** Unit of Measure text on the first subscription line (span[name="uom_id"]). */
  async getLineUoM(): Promise<string> {
    const cell = this.firstLineRow().locator('xpath=.//span[@name="uom_id"]').first();
    const value = ((await cell.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
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
}
