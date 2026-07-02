import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';
import { baseUrl } from '@config/users.config';

/**
 * Payment Page Object (account.payment - standalone Customer Payment).
 *
 * Handles the Invoicing > Customers > Payments flow used by UC-B-5 / UC-B-6:
 *   - open the Invoicing module + the Customer Payments list
 *   - Create a standalone payment (Receive Money, Customer, partner, amount, Bank Transfer journal,
 *     Actually Received)
 *   - Save + Confirm (post) the payment
 *   - drill into the posted payment's Journal Items and read the "Journal Entry" (move_id) value
 *
 * Field map captured live (pre-prod, Faye / accountant):
 *   payment_type   : radio (data-value outbound=Send Money | inbound=Receive Money | transfer)
 *   partner_type   : <select> Customer | Vendor
 *   partner_id     : Many2one  (div[name="partner_id"]//input)
 *   amount         : monetary  (div[name="amount"]//input)
 *   journal_id     : <select>  Bank Transfer | Bank Remittance | Bank Check | Credit Card | Cash | ...
 *   actually_received : text input  (NAKIVO custom field)
 *   x_studio_invoice  : text input  ("Invoice" field - left blank)
 *   Confirm button : button[name="post"]   |  smart button: button[name="button_journal_entries"]
 *   Journal Items list "Journal Entry" column == aml form a[name="move_id"] (e.g. "BNK1/2026/0715")
 */
export class PaymentPage extends BasePage {
  // Invoicing module action deep-links (same targets as the Invoicing menu items).
  private static readonly INVOICING_DASHBOARD_HASH = 'web#menu_id=148&action=305';      // Invoicing > Overview
  private static readonly CUSTOMER_PAYMENTS_HASH = 'web#menu_id=164&action=224';         // Customers > Payments

  // ─── Locators (XPath primary, CSS / role fallback) ─────────────────────────
  private readonly createButton          = () => this.page.locator("xpath=//button[contains(@class,'o_list_button_add')]").or(this.page.getByRole('button', { name: /^Create$/i })).first();
  private readonly saveButton            = () => this.page.locator("xpath=//button[contains(@class,'o_form_button_save')]").or(this.page.getByRole('button', { name: /^Save$/i })).first();
  private readonly confirmButton         = () => this.page.locator('xpath=//button[@name="post"]').or(this.page.getByRole('button', { name: /^Confirm$/i })).first();
  private readonly editButton            = () => this.page.locator("xpath=//button[contains(@class,'o_form_button_edit')]").or(this.page.getByRole('button', { name: /^Edit$/i })).first();

  // payment_type radio uses a per-render name (e.g. "radio1245"); anchor on its stable data-value.
  private readonly paymentTypeLabel      = (dataValue: string) =>
    this.page.locator(`xpath=//input[@data-value="${dataValue}"]/following-sibling::label`)
      .or(this.page.locator(`xpath=//label[normalize-space()="${dataValue === 'inbound' ? 'Receive Money' : dataValue === 'outbound' ? 'Send Money' : 'Internal Transfer'}"]`)).first();
  private readonly paymentTypeRadioInput = (dataValue: string) => this.page.locator(`xpath=//input[@data-value="${dataValue}"]`).first();

  private readonly partnerTypeSelect     = () => this.page.locator('xpath=//select[@name="partner_type"]').first();
  private readonly partnerInput          = () => this.page.locator('xpath=//div[@name="partner_id"]//input').or(this.page.locator('input#partner_id, input[name="partner_id"]')).first();
  private readonly invoiceField          = () => this.page.locator('xpath=//input[@name="x_studio_invoice"]').first();
  private readonly amountInput           = () => this.page.locator('xpath=//div[@name="amount"]//input').or(this.page.locator('xpath=//input[@name="amount"]')).first();
  private readonly journalSelect         = () => this.page.locator('xpath=//select[@name="journal_id"]').first();
  private readonly actuallyReceivedInput = () => this.page.locator('xpath=//input[@name="actually_received"]').first();

  private readonly statusBar             = () => this.page.locator('.o_statusbar_status').first();
  private readonly journalItemsButton    = () => this.page.locator('xpath=//button[@name="button_journal_entries"]').or(this.page.locator('.oe_stat_button', { hasText: /Journal Items/i })).first();
  private readonly invoicesSmartButton   = () => this.page.locator('xpath=//button[@name="button_invoices"]').or(this.page.locator('.oe_stat_button', { hasText: /Invoices/i })).first();
  private readonly firstDataRow          = () => this.page.locator('tr.o_data_row').first();
  // "Journal Entry" (move_id) on the account.move.line form - readonly link.
  private readonly moveIdLink            = () => this.page.locator('xpath=//a[@name="move_id"]').or(this.page.locator('xpath=//div[@name="move_id"]')).first();

  // ── Payment form: CANCEL / Set-To-Draft header buttons ──
  //   The cancel button (view id 1886) is a plain server action - it moves state posted/reconciled -> cancelled
  //   with NO confirmation wizard, and is invisible for draft/cancelled. "Set To Draft" (action_draft) shows only
  //   in the cancelled state, so its appearance is a reliable "cancel succeeded" signal.
  private readonly cancelPaymentButton   = () => this.page.locator('xpath=//button[@name="cancel"]').or(this.page.getByRole('button', { name: /^Cancel$/i })).first();
  private readonly setToDraftButton      = () => this.page.locator('xpath=//button[@name="action_draft"]').or(this.page.getByRole('button', { name: /Set\s*To\s*Draft/i })).first();
  // Optional confirmation dialog (defensive - the cancel action has no <confirm> in the arch, but guard anyway).
  private readonly cancelConfirmOkButton = () => this.page.locator('.modal, .o_dialog').filter({ hasText: /cancel this payment|are you sure/i }).getByRole('button', { name: /^OK$/i }).first();
  // Readonly-safe Partner reader (posted form renders partner_id as an <a> link, not an <input>).
  private readonly partnerFieldContainer = () => this.page.locator('xpath=//div[@name="partner_id"]').first();

  // ── Payments LIST view: search / list table + rows ──
  private readonly paymentListTable      = () => this.page.locator('xpath=//table[contains(@class,"o_list_view")]').or(this.page.locator('table.o_list_view')).first();
  private readonly listDataRow           = () => this.page.locator('tr.o_data_row');
  private readonly breadcrumbPaymentsLink = () => this.page.locator("xpath=//li[contains(@class,'breadcrumb-item')]//a[normalize-space()='Payments']").first();
  // List pager: ".o_pager_value" shows the current range ("1-80"); clicking it makes it editable so a
  // wider range ("1-1000") can be typed to load ALL rows on one page (the list is capped at 80/page).
  private readonly pagerValueSpan        = () => this.page.locator('.o_pager_value').first();
  private readonly pagerLimitSpan        = () => this.page.locator('.o_pager_limit').first();
  private readonly pagerValueInput       = () => this.page.locator('input.o_pager_value').first();

  // ── Payments LIST view: "Filters > Add Custom Filter" facet builder (generic Odoo 12 search view) ──
  //   Same widget kinds as the Invoices list: Many2one field (e.g. "Partner") = autocomplete <input>;
  //   Selection field (e.g. "Status") = native <select>. Each Add-Custom-Filter Apply = one AND-ed facet.
  private readonly filtersMenuButton     = () => this.page.locator("xpath=//div[contains(@class,'o_search_options')]//button[normalize-space()='Filters']").first();
  private readonly addCustomFilterBtn    = () => this.page.locator("xpath=//button[contains(normalize-space(),'Add Custom Filter')] | //a[contains(normalize-space(),'Add Custom Filter')]").first();
  private readonly cfFieldSelect         = () => this.page.locator("xpath=//select[contains(@class,'o_searchview_extended_prop_field')]").first();
  private readonly cfOpSelect            = () => this.page.locator("xpath=//select[contains(@class,'o_searchview_extended_prop_op')]").first();
  private readonly cfValueSelect         = () => this.page.locator("xpath=//span[contains(@class,'o_searchview_extended_prop_value')]//select | //select[contains(@class,'o_searchview_extended_prop_value')]").first();
  private readonly cfValueInput          = () => this.page.locator("xpath=//input[contains(@class,'o_searchview_extended_prop_value')] | //span[contains(@class,'o_searchview_extended_prop_value')]//input").first();
  private readonly cfApplyButton         = () => this.page.locator("xpath=//div[contains(@class,'o_filters_menu')]//button[normalize-space()='Apply'] | //button[normalize-space()='Apply']").first();
  private readonly cfDropdownOption      = () => this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');

  constructor(page: Page) {
    super(page);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Navigation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Open the Invoicing module (Overview dashboard) - deep-links to the same action the Invoicing
   * app menu opens (menu_id=148, action=305). Mirrors the manual "Open the Invoicing module" step.
   */
  async openInvoicingModule(): Promise<void> {
    await this.page.goto(`${baseUrl}${PaymentPage.INVOICING_DASHBOARD_HASH}`, { waitUntil: 'domcontentloaded' });
    await this.dismissDiscardChangesDialog().catch(() => {}); // a prior readonly form should not block, but be safe
    await this.wait(CommonUtils.waitTimes.extraLong);
    await this.dismissErrorDialogWithRetry();
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.pageLoad);
    console.log('  ✓ Invoicing module opened (Overview)');
  }

  /**
   * Open the Customer Payments list (Invoicing > Customers > Payments; menu_id=164, action=224).
   * Mirrors the manual "Navigate to Customers > Payments" step.
   */
  async openCustomerPaymentsList(): Promise<void> {
    await this.page.goto(`${baseUrl}${PaymentPage.CUSTOMER_PAYMENTS_HASH}`, { waitUntil: 'domcontentloaded' });
    await this.dismissDiscardChangesDialog().catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    await this.dismissErrorDialogWithRetry();
    await this.createButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    console.log('  ✓ Customer Payments list opened');
  }

  /**
   * Open the Customer Payments list FRESH (force a real reload so Odoo re-renders the account.payment
   * LIST action even when we are navigating away from a payment FORM - a hash-only change does not
   * re-render the action). Nulls onbeforeunload first to avoid a blocking "unsaved changes" prompt.
   * Used by the cancel-until-none data-cleanup loop, where each pass must re-read the authoritative
   * current set. The action (id 224) carries search_default_inbound_filter, so the "Customer Payments"
   * facet is applied automatically on landing (mirrors the manual Customers > Payments step).
   */
  async openCustomerPaymentsListFresh(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    console.log('  - Opening Invoicing > Customers > Payments (fresh)');
    await this.page.evaluate(() => { (window as unknown as { onbeforeunload: unknown }).onbeforeunload = null; }).catch(() => {});
    await this.page.goto(`${baseUrl}${PaymentPage.CUSTOMER_PAYMENTS_HASH}`, { waitUntil: 'domcontentloaded' });
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
    let onList = await this.paymentListTable().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!onList) {
      console.log('  ⚠ Payments list table not visible after navigation - reloading once more');
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.dismissErrorDialogWithRetry().catch(() => {});
      await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
      onList = await this.paymentListTable().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    }
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Customer Payments list opened fresh (list table visible: ${onList})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Payments LIST view - "Add Custom Filter" facet (Partner) + row readers + row actions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Open the control-panel "Filters" dropdown and ensure it is actually OPEN (the "Add Custom Filter"
   * entry visible). The button is a toggle and the panel re-renders after a facet is applied, so a
   * single click can miss / close it - retry until the entry shows.
   */
  async openFiltersMenu(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
    await this.paymentListTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    const btn = this.filtersMenuButton();
    await btn.waitFor({ state: 'visible', timeout });
    const add = this.addCustomFilterBtn();
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (await add.isVisible().catch(() => false)) return;
      await btn.click().catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
    }
    await add.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.long }).catch(() => {});
  }

  /**
   * Close the "Filters" dropdown if it is open, so the next "Add Custom Filter" starts from a clean
   * single-condition editor (a lingering-open editor would OR the next condition).
   */
  async closeFiltersMenu(): Promise<void> {
    const add = this.addCustomFilterBtn();
    if (await add.isVisible().catch(() => false)) {
      await this.filtersMenuButton().click().catch(() => {});
      await this.wait(CommonUtils.waitTimes.short);
    }
  }

  /**
   * Apply ONE "Add Custom Filter" facet on the Payments list (Filters > Add Custom Filter > pick field
   * > [pick operator] > set value > Apply). Handles both value-widget kinds:
   *   - Many2one field (e.g. "Partner"): an autocomplete <input> - type + pick the option
   *   - Selection field (e.g. "Status"): a native <select> - selectOption by label
   * The default operator ("is equal to" for m2o, "is" for selection) is kept unless `operator` is given
   * (e.g. "is not" to build the "Status is not Cancelled" facet).
   * @param fieldLabel exact field label in the field <select> (e.g. "Partner", "Status")
   * @param value the value to match (e.g. the reseller name, "Cancelled")
   * @param isMany2one true if the value widget is a Many2one autocomplete <input>
   * @param operator optional operator label to select (e.g. "is not"); omit to keep the default
   */
  async addPaymentListCustomFilter(
    fieldLabel: string,
    value: string,
    isMany2one: boolean,
    operator?: string,
    timeout: number = CommonUtils.waitTimes.abnormalWait
  ): Promise<void> {
    console.log(`  - Add Custom Filter: "${fieldLabel}" ${operator || (isMany2one ? 'is equal to' : 'is')} "${value}"`);
    await this.openFiltersMenu(timeout);
    const add = this.addCustomFilterBtn();
    await add.waitFor({ state: 'visible', timeout });
    await add.click();
    await this.wait(CommonUtils.waitTimes.standard);

    const field = this.cfFieldSelect();
    await field.waitFor({ state: 'visible', timeout });
    await field.selectOption({ label: fieldLabel });
    await this.wait(CommonUtils.waitTimes.standard); // the operator/value widgets re-render after the field changes

    if (operator) {
      const op = this.cfOpSelect();
      await op.waitFor({ state: 'visible', timeout }).catch(() => {});
      await op.selectOption({ label: operator }).catch(async () => {
        // tolerate label variants (e.g. "is not" vs "is not =") by matching contains
        const labels: string[] = await op.evaluate((el: any) => Array.from(el.options).map((o: any) => o.text)).catch(() => []);
        const match = labels.find((l) => l.trim().toLowerCase() === operator.trim().toLowerCase())
          || labels.find((l) => l.trim().toLowerCase().includes(operator.trim().toLowerCase()));
        if (match) await op.selectOption({ label: match });
      });
      await this.wait(CommonUtils.waitTimes.standard); // value widget can re-render after the operator changes
      console.log(`    - Operator set to "${operator}"`);
    }

    if (isMany2one) {
      const input = this.cfValueInput();
      await input.waitFor({ state: 'visible', timeout });
      await input.click();
      await input.fill('');
      await input.fill(value);
      await this.wait(CommonUtils.waitTimes.long);
      const option = this.cfDropdownOption().filter({ hasText: value }).first();
      const visible = await option.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
      if (visible) {
        await option.click();
        console.log(`    - Picked "${value}" from the autocomplete`);
      } else {
        await this.page.keyboard.press('Enter');
        console.log(`    - No autocomplete option; committed "${value}" with Enter`);
      }
    } else {
      const select = this.cfValueSelect();
      await select.waitFor({ state: 'visible', timeout });
      await select.selectOption({ label: value });
      console.log(`    - Selected "${value}" from the <select>`);
    }

    await this.wait(CommonUtils.waitTimes.standard);
    const apply = this.cfApplyButton();
    await apply.waitFor({ state: 'visible', timeout });
    await apply.click();
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialog().catch(() => {});
    await this.closeFiltersMenu();
    await this.paymentListTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Custom Filter applied: "${fieldLabel}" = "${value}"`);
  }

  /**
   * Apply the facet: Partner = <reseller name>. The "Customer Payments" facet is already present from
   * the action default (search_default_inbound_filter).
   * @param partnerName the reseller partner name (e.g. "TEST-Reseller#Automation-Jun10")
   */
  async filterPaymentsByPartner(partnerName: string): Promise<void> {
    await this.addPaymentListCustomFilter('Partner', partnerName, true);
  }

  /**
   * Apply the two facets from the manual scenario:
   *   Partner = <reseller name>   AND   Status is not "Cancelled"
   * (two separate "Add Custom Filter" Apply operations = two AND-ed facets). Excluding Cancelled means
   * a cancelled payment leaves the view, so the filtered list shrinks toward empty as we cancel.
   * @param partnerName the reseller partner name (e.g. "TEST-Reseller#Automation-Jun10")
   */
  async filterPaymentsByPartnerNotCancelled(partnerName: string): Promise<void> {
    await this.addPaymentListCustomFilter('Partner', partnerName, true);
    await this.addPaymentListCustomFilter('Status', 'Cancelled', false, 'is not');
  }

  /**
   * Read every row of the Payments list as { key, invoice, status }, in row order.
   *   - key     : the payment's own name/display-name token "CUST.IN/YYYY/NNNN" extracted from the row
   *               text - UNIQUE per payment, always present, and stable across list refreshes. This is
   *               the key used to open a specific row and to skip an already-handled one. (This Odoo
   *               build does NOT expose tr@data-id, and the "Invoice" column is non-unique / often blank,
   *               so neither can be used as the key.)
   *   - invoice : the "Invoice" column cell (x_studio_invoice, e.g. "INV/2026/1723") for readable logs.
   *   - status  : the "Status" column cell (state), Title-cased (e.g. "Posted", "Draft", "Cancelled").
   * Resolves the Invoice / Status columns by header text (resilient to column re-order). Returns []
   * for an empty/filtered-out list.
   */
  async getPaymentRows(): Promise<{ key: string; invoice: string; status: string }[]> {
    await this.wait(CommonUtils.waitTimes.long); // let the list settle after a filter/nav
    const anyRow = await this.listDataRow().first().isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    if (!anyRow) return [];
    const rows = await this.page.evaluate(() => {
      const table = document.querySelector('table.o_list_view') || document.querySelector('.o_list_view table');
      if (!table) return [] as { key: string; invoice: string; status: string }[];
      const headers = Array.from(table.querySelectorAll('thead th')).map((h) => (h.textContent || '').trim());
      const invoiceIdx = headers.findIndex((h) => h === 'Invoice');
      const statusIdx = headers.findIndex((h) => h === 'Status');
      const cellText = (cells: HTMLTableCellElement[], idx: number) =>
        idx >= 0 && cells[idx] ? (cells[idx].textContent || '').replace(/\s+/g, ' ').trim() : '';
      return Array.from(table.querySelectorAll('tbody tr.o_data_row')).map((r) => {
        const cells = Array.from(r.querySelectorAll('td')) as HTMLTableCellElement[];
        const rowText = (r.textContent || '').replace(/\s+/g, ' ');
        const m = rowText.match(/CUST\.[A-Z]{2,}\/\d{4}\/\d+/); // payment name, e.g. "CUST.IN/2026/1237"
        return {
          key: m ? m[0] : '',
          invoice: cellText(cells, invoiceIdx),
          status: cellText(cells, statusIdx),
        };
      });
    }).catch(() => [] as { key: string; invoice: string; status: string }[]);
    // Title-case the status text ("posted" -> "Posted") for consistent matching/logging.
    return rows.map((r) => ({ ...r, status: r.status.replace(/\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) }));
  }

  /**
   * Expand the list pager so ALL rows load on a single page (the list is capped at 80 rows/page).
   * This matters for the cancel loop: a *cancelled* payment still matches the Partner-only filter and
   * keeps occupying a page-1 slot, so without expanding, records on page 2+ would never surface and
   * would be silently left uncancelled. Clicks ".o_pager_value" to make it editable and sets "1-<max>".
   * No-op when there is no pager (a single page already shows everything).
   * @returns the number of rows shown after expanding
   */
  async expandPagerToShowAll(maxRows: number = 1000): Promise<number> {
    const valueSpan = this.pagerValueSpan();
    const hasPager = await valueSpan.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    if (!hasPager) {
      console.log('  - No list pager (single page) - all rows already shown');
      return await this.getPaymentListRowCount();
    }
    const total = parseInt((((await this.pagerLimitSpan().innerText().catch(() => '')) || '').match(/\d+/) || ['0'])[0], 10);
    await valueSpan.click();
    const input = this.pagerValueInput();
    const editable = await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (editable) {
      await input.fill('');
      await input.fill(`1-${maxRows}`);
    } else {
      // Fallback: some builds turn the span into a focused contenteditable rather than an <input>.
      await this.page.keyboard.type(`1-${maxRows}`);
    }
    await this.page.keyboard.press('Enter');
    await this.wait(CommonUtils.waitTimes.long);
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.pageLoad);
    await this.wait(CommonUtils.waitTimes.long);
    const shown = await this.getPaymentListRowCount();
    console.log(`  ✓ Pager expanded to show all (total reported: ${total}, rows now shown: ${shown})`);
    return shown;
  }

  /**
   * Count the data rows currently shown in the Payments list (0 for an empty/filtered-out list).
   */
  async getPaymentListRowCount(): Promise<number> {
    await this.wait(CommonUtils.waitTimes.long);
    const anyRow = await this.listDataRow().first().isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    if (!anyRow) return 0;
    return await this.listDataRow().count().catch(() => 0);
  }

  /**
   * Open the Payments-list row whose payment name (CUST.IN/YYYY/NNNN) equals `key` (into its form).
   * The key is unique, so a text match on the row is safe. Returns false if no such row is visible.
   */
  async openPaymentRowByKey(key: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const row = this.listDataRow().filter({ hasText: key }).first();
    const visible = await row.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!visible) {
      console.log(`  ⚠ Payments-list row for "${key}" not found`);
      return false;
    }
    await row.click();
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialogWithRetry();
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.pageLoad);
    await this.statusBar().waitFor({ state: 'visible', timeout }).catch(() => {});
    return true;
  }

  /**
   * Read the payment name (CUST.IN/YYYY/NNNN) shown at the top of the OPEN payment form (the h1 title
   * field), for cross-checking against the list-row key we intended to open. Returns '' if not shown.
   */
  async getOpenPaymentName(): Promise<string> {
    const val = await this.page.evaluate(() => {
      const el = document.querySelector('.oe_title h1 [name="name"], .oe_title [name="name"]') as HTMLElement | null;
      const text = el ? (el.innerText || el.textContent || '') : (document.body.innerText || '');
      const m = text.match(/CUST\.[A-Z]{2,}\/\d{4}\/\d+/);
      return m ? m[0] : '';
    }).catch(() => '');
    return val;
  }

  /**
   * Read the Partner value on the open payment form, safely across readonly (posted) and edit states:
   * readonly renders partner_id as an <a> link, edit as an <input>. Returns '' when absent.
   */
  async getPartnerName(): Promise<string> {
    const container = this.partnerFieldContainer();
    await container.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const val = await this.page.evaluate(() => {
      const c = document.querySelector('div[name="partner_id"]');
      if (!c) return '';
      const a = c.querySelector('a');
      if (a && (a.textContent || '').trim()) return (a.textContent || '').trim();
      const inp = c.querySelector('input') as HTMLInputElement | null;
      if (inp && inp.value.trim()) return inp.value.trim();
      return (c.textContent || '').replace(/\s+/g, ' ').trim();
    }).catch(() => '');
    return val;
  }

  /**
   * Click the payment CANCEL button (button[name="cancel"]) and confirm the payment reaches the
   * "cancelled" state. Returns true only when the payment is Cancelled; false when it cannot be
   * cancelled (Draft/already Cancelled, or the cancel does not take effect after retries).
   *
   * Handling the two observed failure modes on this NAKIVO-customised action (some payments cancel
   * cleanly, a subset do not):
   *   (1) an "Odoo Client Error" dialog surfaces (sometimes a beat AFTER the click), or
   *   (2) the click is a SILENT no-op - no dialog, state stays "Posted".
   * Each attempt: click, then poll up to ~12s for an outcome (Cancelled | error dialog | no change).
   * On an error or a no-op, capture any dialog detail (expand "See details"), dismiss it, reload the
   * form, and RETRY. After `maxAttempts` the payment is reported un-cancellable so the caller records it
   * and moves on (never getting stuck) - this is how the client error is "handled" for a cleanup run.
   */
  async clickCancelPayment(maxAttempts: number = 3, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const preStatus = await this.getStatus().catch(() => '');
      if (/cancel/i.test(preStatus)) {
        console.log(`  ✓ Payment already Cancelled (status="${preStatus}")`);
        return true;
      }

      const button = this.cancelPaymentButton();
      const visible = await button.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
      if (!visible) {
        console.log(`  ⚠ CANCEL button not visible (status="${preStatus}") - not in a cancellable state`);
        return false;
      }

      await button.click();
      console.log(`  - Clicked "CANCEL" button (attempt ${attempt}/${maxAttempts})`);
      // Defensive: dismiss a confirmation dialog only if one appears (the arch declares no <confirm>).
      const ok = this.cancelConfirmOkButton();
      if (await ok.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
        await ok.click().catch(() => {});
        console.log('  - Confirmed cancellation (clicked OK on the confirmation dialog)');
      }
      await this.wait(CommonUtils.waitTimes.standard);

      // Poll up to ~12s for an outcome: Cancelled | error dialog | no change.
      let errText = '';
      for (let i = 0; i < 6; i++) {
        if (process.env.CANCEL_DEBUG) {
          const rawDlg = await this.readVisibleDialogText();
          const rawSt = await this.getStatus().catch(() => '');
          console.log(`    [debug poll ${i + 1}/6] status="${rawSt}" dialog="${rawDlg.slice(0, 200)}"`);
        }
        errText = await this.expandAndReadErrorDialog();
        if (errText) break;
        const st = await this.getStatus().catch(() => '');
        if (/cancel/i.test(st)) {
          console.log(`  ✓ Payment Cancelled (status="${st}")`);
          return true;
        }
        await this.wait(CommonUtils.waitTimes.long);
      }

      // Not cancelled this attempt: either an error dialog (errText) or a silent no-op.
      if (errText) {
        console.warn(`  ⚠ CANCEL raised an error dialog (attempt ${attempt}/${maxAttempts}): "${errText.slice(0, 400)}"`);
        await this.dismissErrorDialogWithRetry();
      } else {
        console.warn(`  ⚠ CANCEL had no effect - status still not Cancelled (attempt ${attempt}/${maxAttempts})`);
      }
      if (attempt < maxAttempts) {
        // Reload the form fresh and retry - clears a transient client error or a missed click.
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.dismissErrorDialogWithRetry();
        await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.pageLoad);
        await this.wait(CommonUtils.waitTimes.long);
      }
    }
    // Exhausted attempts - final status check (the cancel may still have landed server-side).
    const finalStatus = await this.getStatus().catch(() => '');
    console.warn(`  ⚠ CANCEL did not take effect after ${maxAttempts} attempts (status="${finalStatus}")`);
    return /cancel/i.test(finalStatus);
  }

  /**
   * If a visible ERROR modal is shown, expand its "See details" (to reveal the traceback) and return the
   * full dialog text. Returns '' when there is no visible error dialog (a benign/absent dialog).
   */
  async expandAndReadErrorDialog(): Promise<string> {
    const first = await this.readVisibleDialogText();
    if (!first || !/error|occurred|traceback|cannot|exception|not allowed|invalid/i.test(first)) return '';
    // Reveal the traceback for a more actionable log line.
    const seeDetails = this.page
      .locator('.modal, .o_dialog')
      .locator('xpath=.//*[normalize-space()="See details" or contains(normalize-space(),"See details")]')
      .first();
    if (await seeDetails.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      await seeDetails.click().catch(() => {});
      await this.wait(CommonUtils.waitTimes.short);
    }
    return await this.readVisibleDialogText();
  }

  /**
   * Read the text of the first VISIBLE modal/dialog (e.g. an "Odoo Client Error" popup), or '' if none
   * is shown. Used to record WHY a cancel failed.
   */
  async readVisibleDialogText(): Promise<string> {
    return await this.page.evaluate(() => {
      const modals = Array.from(document.querySelectorAll('.modal, .o_dialog, .o_error_dialog'));
      for (const m of modals) {
        const el = m as HTMLElement;
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null) {
          return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        }
      }
      return '';
    }).catch(() => '');
  }

  /**
   * Poll the payment statusbar until it reaches `expected` (e.g. "Cancel" for Cancelled), reloading the
   * form between attempts (the state can settle asynchronously). Also treats the appearance of the
   * "Set To Draft" button (states="cancelled") as proof the payment is cancelled. Returns the last
   * status read.
   * @param expected status substring matched case-insensitively (e.g. "Cancel", "Posted")
   * @param maxAttempts number of poll/reload cycles (default 8)
   */
  async waitForPaymentStatus(expected: string, maxAttempts: number = 8): Promise<string> {
    const re = new RegExp(expected, 'i');
    let status = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.dismissErrorDialog();
      try { status = await this.getStatus(); } catch { status = ''; }
      console.log(`  - Payment status poll ${attempt}/${maxAttempts}: "${status}" (waiting for "${expected}")`);
      if (re.test(status)) return status;
      // A visible "Set To Draft" button means the payment is cancelled even if the statusbar text is odd.
      if (/cancel/i.test(expected) && await this.setToDraftButton().isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
        console.log('  - "Set To Draft" button visible -> payment is Cancelled');
        return 'Cancelled';
      }
      await this.wait(CommonUtils.waitTimes.long);
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.dismissErrorDialog();
    }
    return status;
  }

  /**
   * Click the "Payments" breadcrumb link to return from a payment form back to the (still-filtered)
   * list. Non-throwing: logs a warning if the link is not present.
   */
  async clickPaymentsBreadcrumb(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    const link = this.breadcrumbPaymentsLink();
    const visible = await link.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!visible) {
      console.log('  ⚠ "Payments" breadcrumb link not found');
      return;
    }
    await link.click();
    await this.dismissDiscardChangesDialog().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    await this.paymentListTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /**
   * Click CREATE to open a new (blank) payment form.
   */
  async clickCreate(): Promise<void> {
    await this.createButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.createButton().click();
    await this.wait(CommonUtils.waitTimes.extraLong);
    await this.dismissErrorDialog();
    // Wait for a form field to render so the create form is interactive.
    await this.partnerTypeSelect().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    console.log('  ✓ New payment form opened');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Create-form field setters
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Select the Payment type ("Receive Money" = inbound, "Send Money" = outbound,
   * "Internal Transfer" = transfer). Clicks the visible label (the radio input is a hidden
   * Bootstrap custom-control) and verifies the radio became checked.
   */
  async selectPaymentType(type: 'Receive Money' | 'Send Money' | 'Internal Transfer'): Promise<boolean> {
    const dv = type === 'Receive Money' ? 'inbound' : type === 'Send Money' ? 'outbound' : 'transfer';
    console.log(`  - Setting Payment type = "${type}" (data-value=${dv})`);
    await this.paymentTypeLabel(dv).waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    try {
      await this.paymentTypeLabel(dv).click();
    } catch {
      await this.paymentTypeRadioInput(dv).check({ force: true }).catch(() => {});
    }
    await this.wait(CommonUtils.waitTimes.standard);
    const checked = await this.paymentTypeRadioInput(dv).isChecked().catch(() => false);
    console.log(`  ${checked ? '✓' : '⚠'} Payment type "${type}" selected (checked=${checked})`);
    return checked;
  }

  /**
   * Select the Partner type (native <select>): "Customer" or "Vendor".
   */
  async selectPartnerType(type: 'Customer' | 'Vendor'): Promise<void> {
    await this.partnerTypeSelect().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.partnerTypeSelect().selectOption({ label: type });
    await this.wait(CommonUtils.waitTimes.standard);
    console.log(`  ✓ Partner type = "${type}"`);
  }

  /**
   * Set the Partner (Many2one). Fills the input and confirms with Enter (this app has no JS
   * autocomplete dropdown for Many2one fields - set value then Enter).
   */
  async setPartner(partnerName: string): Promise<void> {
    const input = this.partnerInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await input.fill(partnerName);
    await this.wait(CommonUtils.waitTimes.long);
    await this.page.keyboard.press('Enter');
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Partner = "${partnerName}"`);
  }

  /**
   * Read the current Partner value (for verification / diagnostics).
   */
  async getPartnerValue(): Promise<string> {
    const input = this.partnerInput();
    const val = await input.inputValue().catch(() => '');
    return (val || '').trim();
  }

  /**
   * Leave the "Invoice" field (x_studio_invoice) blank (mirrors "Invoice = blank"). Clears it if it
   * carries any default value. No-op when the field is absent.
   */
  async clearInvoiceField(): Promise<void> {
    const f = this.invoiceField();
    if ((await f.count().catch(() => 0)) === 0) { console.log('  - Invoice field (x_studio_invoice) not present - nothing to clear'); return; }
    if (await f.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      await f.fill('').catch(() => {});
    }
    console.log('  ✓ Invoice field left blank');
  }

  /**
   * Set the Payment amount (monetary input inside div[name="amount"]).
   */
  async setAmount(amount: string): Promise<void> {
    const input = this.amountInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await input.fill(amount);
    console.log(`  ✓ Payment amount = ${amount}`);
  }

  /**
   * Select the Payment Journal (native <select>), e.g. "Bank Transfer".
   * @returns the selected journal label
   */
  async selectPaymentJournal(journalName: string): Promise<string> {
    await this.journalSelect().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.journalSelect().selectOption({ label: journalName }).catch(async () => {
      // tolerate case/whitespace differences by matching contains
      const labels: string[] = await this.journalSelect().evaluate((el: any) => Array.from(el.options).map((o: any) => o.text));
      const match = labels.find((l) => l.trim().toLowerCase() === journalName.trim().toLowerCase())
        || labels.find((l) => l.trim().toLowerCase().includes(journalName.trim().toLowerCase()));
      if (match) await this.journalSelect().selectOption({ label: match });
    });
    await this.wait(CommonUtils.waitTimes.standard);
    const current = await this.journalSelect().evaluate((el: any) => el.options[el.selectedIndex]?.text || '').catch(() => '');
    console.log(`  ✓ Payment Journal = "${current}"`);
    return (current || '').trim();
  }

  /**
   * Set the "Actually Received($)" amount (NAKIVO custom field). No-op + log if not present.
   */
  async setActuallyReceived(amount: string): Promise<boolean> {
    const f = this.actuallyReceivedInput();
    if (!(await f.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) {
      console.log('  ⚠ "Actually Received($)" field not visible - skipping');
      return false;
    }
    await f.click();
    await f.fill('');
    await f.fill(amount);
    console.log(`  ✓ "Actually Received($)" = ${amount}`);
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Save / Confirm
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Click SAVE and wait for the record to persist (URL gains an id / Edit button reappears).
   * @returns the saved payment form URL
   */
  async save(timeout: number = CommonUtils.waitTimes.savingPage): Promise<string> {
    await this.saveButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.saveButton().click();
    await this.dismissErrorDialog();
    // After save, the form returns to readonly (Edit button) and the URL carries id=NNN.
    await this.editButton().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    const url = this.page.url();
    console.log(`  ✓ Payment saved (URL: ${url})`);
    return url;
  }

  /**
   * Click CONFIRM (post) and wait until the payment status becomes "Posted".
   * @returns the final status text
   */
  async confirm(maxAttempts: number = 6): Promise<string> {
    await this.confirmButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.confirmButton().click();
    await this.wait(CommonUtils.waitTimes.extraLong);
    await this.dismissErrorDialogWithRetry();
    let status = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      status = await this.getStatus().catch(() => '');
      console.log(`  - Payment status poll ${attempt}/${maxAttempts}: "${status}"`);
      if (/Posted|Reconciled/i.test(status)) break;
      await this.wait(CommonUtils.waitTimes.long);
      await this.dismissErrorDialog();
    }
    console.log(`  ✓ Payment confirmed (status: "${status}")`);
    return status;
  }

  /**
   * Read the active status-bar label (e.g. "Draft", "Posted", "Reconciled").
   */
  async getStatus(): Promise<string> {
    await this.statusBar().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const raw = await this.page.evaluate(() => {
      const c = document.querySelector('.o_statusbar_status');
      if (!c) return '';
      const btn = c.querySelector<HTMLElement>('button[aria-checked="true"]')
        || c.querySelector<HTMLElement>('button.btn-primary')
        || c.querySelector<HTMLElement>('button[aria-selected="true"]');
      return btn ? (btn.innerText || btn.textContent || '').trim() : '';
    });
    return raw.replace(/\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Journal Items -> Journal Entry (JournalItem#1)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Click the "Journal Items" smart button on the posted payment to open its account.move.line list.
   */
  async clickJournalItems(): Promise<void> {
    await this.journalItemsButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.journalItemsButton().click();
    await this.wait(CommonUtils.waitTimes.long);
    await this.firstDataRow().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    console.log('  ✓ Journal Items list opened');
  }

  /**
   * Open the first Journal Item (account.move.line) record from the list.
   */
  async openFirstJournalItem(): Promise<void> {
    await this.firstDataRow().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.firstDataRow().click();
    await this.wait(CommonUtils.waitTimes.long);
    await this.moveIdLink().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    console.log('  ✓ Journal Item record opened');
  }

  /**
   * Read the "Journal Entry" value (move_id) on the open Journal Item record - this is JournalItem#1
   * (e.g. "BNK1/2026/0715"), the name shown in the invoice's Outstanding-credits section.
   */
  async getJournalEntryName(): Promise<string> {
    const link = this.moveIdLink();
    await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const value = (await link.innerText().catch(() => '')).trim();
    console.log(`  ✓ Journal Entry (move_id) = "${value}"`);
    return value;
  }

  /**
   * Read the "Journal Entry" column value from the Journal Items LIST (first data row) - a faster
   * alternative when the record form is not needed. Resolves the column by its header text.
   */
  async getJournalEntryFromList(): Promise<string> {
    await this.firstDataRow().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const value = await this.page.evaluate(() => {
      const table = document.querySelector('table.o_list_view, .o_list_view table, table');
      if (!table) return '';
      const headers = Array.from(table.querySelectorAll('thead th')).map((h) => (h.textContent || '').trim());
      const idx = headers.findIndex((h) => h.startsWith('Journal Entry'));
      if (idx === -1) return '';
      const row = table.querySelector('tbody tr.o_data_row');
      if (!row) return '';
      const cells = row.querySelectorAll('td');
      return cells[idx] ? (cells[idx].textContent || '').trim() : '';
    });
    console.log(`  ✓ Journal Entry (from list) = "${value}"`);
    return value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Invoices smart button (bidirectional link after reconciliation - UC-B-6.9)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Open the posted payment's Journal Items and read the "Matching Number" column for every line.
   * A non-empty Matching Number means that line has been reconciled (e.g. against an invoice) - this is
   * the reverse-side evidence that a standalone payment was matched to an invoice (UC-B-6.9), since the
   * "Invoices" smart button (invoice_ids) is only populated for payments registered FROM an invoice.
   * @returns the trimmed "Matching Number" cell text for each journal-item row
   */
  async getJournalItemsMatchingNumbers(): Promise<string[]> {
    await this.clickJournalItems();
    await this.firstDataRow().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const values = await this.page.evaluate(() => {
      const table = document.querySelector('table.o_list_view, .o_list_view table, table');
      if (!table) return [] as string[];
      const headers = Array.from(table.querySelectorAll('thead th')).map((h) => (h.textContent || '').trim());
      const idx = headers.findIndex((h) => h.startsWith('Matching Number'));
      if (idx === -1) return [] as string[];
      return Array.from(table.querySelectorAll('tbody tr.o_data_row')).map((r) => {
        const cells = r.querySelectorAll('td');
        return cells[idx] ? (cells[idx].textContent || '').trim() : '';
      });
    });
    console.log(`  ✓ Journal Items "Matching Number" column: ${JSON.stringify(values)}`);
    return values;
  }

  /**
   * Read the count shown on the payment's "Invoices" smart button (account.payment.button_invoices).
   * @returns the integer count (0 when none / not shown)
   */
  async getInvoicesSmartButtonCount(): Promise<number> {
    const btn = this.invoicesSmartButton();
    if (!(await btn.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) {
      console.log('  ⚠ "Invoices" smart button not visible');
      return 0;
    }
    const text = (await btn.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const n = parseInt((text.match(/\d+/) || ['0'])[0], 10);
    console.log(`  ✓ Invoices smart button: "${text}" -> ${n}`);
    return n;
  }

  /**
   * Click the payment's "Invoices" smart button to open the list of invoices this payment is matched
   * against, then return the displayed invoice numbers (first column / cell text).
   */
  async getLinkedInvoiceNumbers(): Promise<string[]> {
    await this.invoicesSmartButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.invoicesSmartButton().click();
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialogWithRetry();
    // The target may render as a list (multiple matched invoices) or open the single invoice form.
    await this.page.locator('tr.o_data_row, .o_form_view').first()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const numbers = await this.page.evaluate(() => {
      const out: string[] = [];
      // List view: read the "Number" column / first non-handle cell of each row.
      const rows = document.querySelectorAll('tr.o_data_row');
      if (rows.length) {
        rows.forEach((r) => {
          const cells = Array.from(r.querySelectorAll('td')).map((c) => (c.textContent || '').trim());
          const num = cells.find((t) => /INV\/|\/\d{4}\//.test(t));
          if (num) out.push(num);
        });
        return out;
      }
      // Form view (single invoice): read the invoice number span.
      const span = document.querySelector('span[name="number"]') as HTMLElement | null;
      if (span && span.innerText.trim()) out.push(span.innerText.trim());
      return out;
    });
    console.log(`  ✓ Payment is linked to invoice(s): ${JSON.stringify(numbers)}`);
    return numbers;
  }
}
