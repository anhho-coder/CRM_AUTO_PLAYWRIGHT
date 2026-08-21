import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Subscription Template Page Object (sale.subscription.template)
 *
 * The template list and detail screens reached from
 * Subscriptions > Configuration > Subscription Templates.
 * Odoo 12 pre-prod: list action = 433, menu = 279.
 *
 * Fields read here (verified against the live pre-prod DOM):
 *   - Recurrence               -> recurring_rule_type   (selection)
 *   - Repeat Every             -> recurring_interval    (integer)
 *   - Payment Mode             -> payment_mode          (selection)
 *   - Automatic closing limit  -> auto_close_limit      (integer)
 *   - Invoice Email Template   -> invoice_mail_template_id (many2one, may be empty)
 */
export interface TemplateSettings {
  recurrence: string;
  repeatEvery: number;
  paymentMode: string;
  closingLimit: number;
  invoiceMailTemplate: string;
}

export class SubscriptionTemplatePage extends BasePage {
  // ---- Locators (XPath primary, CSS fallback) ----
  private readonly listRows = () =>
    this.page.locator('xpath=//div[contains(@class,"o_list_view")]//tbody//tr[contains(@class,"o_data_row")]')
      .or(this.page.locator('.o_list_view tbody tr.o_data_row'));
  private readonly listRowByName = (name: string) =>
    this.listRows().filter({ hasText: name }).first();
  private readonly firstCellOfRow = (index: number) =>
    this.listRows().nth(index).locator('xpath=.//td[contains(@class,"o_data_cell")]')
      .or(this.listRows().nth(index).locator('td.o_data_cell')).first();
  private readonly headerCells = () =>
    this.page.locator('.o_list_view thead th');
  private readonly cellOfRow = (rowIndex: number, cellIndex: number) =>
    this.listRows().nth(rowIndex).locator('td.o_data_cell').nth(cellIndex);
  private readonly createButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_list_button_add")]')
      .or(this.page.locator('.o_list_button_add')).first();
  private readonly saveButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_form_button_save")]')
      .or(this.page.locator('.o_form_button_save')).first();
  private readonly nameInput = () =>
    this.page.locator('xpath=//input[@name="name"] | //div[@name="name"]//input | //textarea[@name="name"]')
      .or(this.page.locator('input[name="name"]')).first();
  private readonly selectField = (name: string) =>
    this.page.locator(`xpath=//select[@name="${name}"]`).or(this.page.locator(`select[name="${name}"]`)).first();
  private readonly spanField = (name: string) =>
    this.page.locator(`xpath=//span[@name="${name}"]`).or(this.page.locator(`span[name="${name}"]`)).first();
  private readonly inputField = (name: string) =>
    this.page.locator(`xpath=//div[@name="${name}"]//input | //input[@name="${name}"]`)
      .or(this.page.locator(`input[name="${name}"]`)).first();
  private readonly m2oAnchor = (name: string) =>
    this.page.locator(`xpath=//a[@name="${name}"]`).or(this.page.locator(`a[name="${name}"]`)).first();
  private readonly actionMenuToggle = () =>
    this.page.locator('.o_cp_sidebar button.o_dropdown_toggler_btn, .o_cp_sidebar button.dropdown-toggle')
      .filter({ hasText: /Action/i }).first();
  private readonly listViewSwitcher = () =>
    this.page.locator('.o_cp_switch_buttons button[data-view-type="list"], .o_cp_switch_list, button[data-view-type="list"]').first();
  private readonly listView = () =>
    this.page.locator('.o_list_view').first();
  private readonly kanbanCardTitles = () =>
    this.page.locator('.o_kanban_view .o_kanban_record strong, .o_kanban_view .o_kanban_record .o_kanban_record_title');
  private readonly actionMenuItem = (label: string) =>
    this.page.locator('.dropdown-menu a, .o_dropdown_menu a').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') }).first();
  private readonly modalConfirmButton = () =>
    this.page.locator('.modal-footer button').filter({ hasText: /^\s*(Ok|Archive|Confirm)\s*$/i }).first();

  constructor(page: Page) {
    super(page);
  }

  /** Open the Subscription Templates list (action 433 / menu 279). */
  async openList(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    await this.goto(`${origin}/web#action=433&model=sale.subscription.template&view_type=list&menu_id=279`, { waitUntil: 'domcontentloaded' });
    await this.waitForLoadingSpinnerToHide(timeout).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    await this.ensureListView();
    console.log('  - Subscription Templates list opened');
  }

  /**
   * The Subscription Templates action declares view_mode "kanban,tree,form", so Odoo renders
   * the KANBAN view even when the URL asks for view_type=list. Click the list view switcher
   * when the list is not already showing.
   */
  async ensureListView(): Promise<void> {
    if (await this.listView().isVisible().catch(() => false)) return;
    if (await this.listViewSwitcher().count().catch(() => 0)) {
      await this.listViewSwitcher().click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.waitForLoadingSpinnerToHide().catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      console.log('  - Switched from kanban to the list view');
    }
  }

  /**
   * Resolve a data-column's index by its header label. The template list starts with a "Code"
   * column which is empty for every delivered template, so reading "the first cell" returns
   * nothing - the name lives in the "Name" column.
   */
  async getColumnIndexByHeader(headerLabel: string): Promise<number> {
    // Odoo renders a leading record-selector <th> with no text. Only headers that actually
    // carry a label line up 1:1 with the td.o_data_cell columns, so filter to those first.
    const labels: string[] = [];
    const count = await this.headerCells().count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const raw = ((await this.headerCells().nth(i).innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '');
      // The record-selector header carries a ZERO-WIDTH SPACE, not an empty string - strip all
      // invisible characters before deciding whether this header really has a label.
      const text = raw.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
      if (text) labels.push(text);
    }
    const index = labels.findIndex(l => l.toLowerCase() === headerLabel.toLowerCase());
    console.log(`  - Headers [${labels.join(' | ')}] -> "${headerLabel}" is data-cell index ${index}`);
    return index >= 0 ? index : 0;
  }

  /** Every template name shown in the list, in list order (read from the "Name" column). */
  async getListNames(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<string[]> {
    await this.ensureListView();
    await this.listRows().first().waitFor({ state: 'visible', timeout }).catch(() => {});

    const names: string[] = [];
    const rowCount = await this.listRows().count().catch(() => 0);
    const nameIndex = rowCount ? await this.getColumnIndexByHeader('Name') : 0;

    for (let i = 0; i < rowCount; i++) {
      let text = ((await this.cellOfRow(i, nameIndex).innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
      if (!text) {
        text = ((await this.firstCellOfRow(i).innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
      }
      if (text) names.push(text);
    }

    // Fall back to the kanban cards when the list view could not be reached at all.
    if (!names.length) {
      const cardCount = await this.kanbanCardTitles().count().catch(() => 0);
      for (let i = 0; i < cardCount; i++) {
        const text = ((await this.kanbanCardTitles().nth(i).innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
        if (text) names.push(text);
      }
      if (names.length) console.log('  - Read the template names from the kanban cards (list view unavailable)');
    }

    console.log(`  - Templates listed (${names.length}): ${names.join(' | ')}`);
    return names;
  }

  /** Open one template from the list by its exact displayed name. */
  async openByName(name: string): Promise<void> {
    await this.ensureListView();
    if (!(await this.listRowByName(name).count().catch(() => 0))) {
      // Kanban fallback - click the card carrying this name.
      const card = this.page.locator('.o_kanban_view .o_kanban_record').filter({ hasText: name }).first();
      await card.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.waitForFormView().catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      console.log(`  - Template "${name}" opened from the kanban view`);
      return;
    }
    await this.listRowByName(name).click();
    await this.waitForFormView().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Template "${name}" opened`);
  }

  /**
   * Read one field's displayed value (radio group first, then readonly span, then edit input).
   *
   * The radio branch is NOT optional. Odoo renders `widget="radio"` fields (Payment Mode) as a
   * Bootstrap custom-radio group whose <input> carries the technical value in `data-value` and has
   * NO `value` attribute at all - so `inputValue()` returns "" and the generic input branch would
   * silently report an empty Payment Mode. That is exactly how CRM-11806_1.1.4 came to save the
   * wrong template configuration while still logging a plausible-looking value.
   */
  private async readValue(fieldName: string): Promise<string> {
    // 1) Radio group - report the CHECKED option's visible label.
    const radioGroup = this.page.locator(`xpath=//div[@name="${fieldName}"]//input[@type="radio"]`)
      .or(this.page.locator(`div[name="${fieldName}"] input[type="radio"]`));
    if (await radioGroup.count().catch(() => 0)) {
      const checkedLabel = this.page
        .locator(`xpath=//div[@name="${fieldName}"]//input[@type="radio"][@checked]/following-sibling::label`)
        .or(this.page.locator(`div[name="${fieldName}"] .o_radio_item:has(input[type="radio"]:checked) label`))
        .first();
      if (await checkedLabel.count().catch(() => 0)) {
        const label = ((await checkedLabel.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
        if (label) return label;
      }
      // Checked state can live only in the DOM property, not the attribute - ask each input.
      const total = await radioGroup.count().catch(() => 0);
      for (let i = 0; i < total; i++) {
        if (await radioGroup.nth(i).isChecked().catch(() => false)) {
          const value = ((await radioGroup.nth(i).getAttribute('data-value').catch(() => '')) || '').trim();
          const byValue = this.page
            .locator(`div[name="${fieldName}"] .o_radio_item:has(input[data-value="${value}"]) label`).first();
          const label = ((await byValue.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
          return label || value;
        }
      }
      return '';
    }

    // 2) Readonly span.
    const span = this.spanField(fieldName);
    if (await span.count().catch(() => 0)) {
      return ((await span.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/ /g, ' ').trim();
    }
    // 3) Edit-mode input.
    const input = this.inputField(fieldName);
    if (await input.count().catch(() => 0)) {
      return ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    }
    return '';
  }

  /** All billing settings of the currently-open template. */
  async getSettings(): Promise<TemplateSettings> {
    const recurrence = await this.readValue('recurring_rule_type');
    const repeatEveryRaw = await this.readValue('recurring_interval');
    const paymentMode = await this.readValue('payment_mode');
    const closingLimitRaw = await this.readValue('auto_close_limit');
    let invoiceMailTemplate = '';
    if (await this.m2oAnchor('invoice_mail_template_id').count().catch(() => 0)) {
      invoiceMailTemplate = ((await this.m2oAnchor('invoice_mail_template_id').innerText().catch(() => '')) || '').trim();
    }
    const settings: TemplateSettings = {
      recurrence,
      repeatEvery: parseInt((repeatEveryRaw.match(/\d+/) || ['-1'])[0], 10),
      paymentMode,
      closingLimit: parseInt((closingLimitRaw.match(/\d+/) || ['-1'])[0], 10),
      invoiceMailTemplate,
    };
    console.log(`  - Settings: Recurrence "${settings.recurrence}", Repeat Every ${settings.repeatEvery}, Payment Mode "${settings.paymentMode}", Automatic closing limit ${settings.closingLimit}, Invoice Email Template "${settings.invoiceMailTemplate}"`);
    return settings;
  }

  /**
   * Payment Mode is a RADIO GROUP whose inputs carry the technical value in data-value.
   * Selecting by the visible label proved unreliable, so target the value directly.
   */
  private static readonly PAYMENT_MODE_VALUES: Record<string, string> = {
    'Manual': 'manual',
    'Draft invoice': 'draft_invoice',
    'Invoice': 'validate_send',
    'Invoice & try to charge': 'validate_send_payment',
    'Invoice only on successful payment': 'success_payment',
  };

  private readonly paymentModeRadioByValue = (value: string) =>
    this.page.locator(`div[name="payment_mode"] input[type="radio"][data-value="${value}"]`).first();
  private readonly paymentModeLabelForValue = (value: string) =>
    this.page.locator(`div[name="payment_mode"] .o_radio_item:has(input[data-value="${value}"]) label`).first();
  private readonly paymentModeRadioByLabel = (label: string) =>
    this.page.locator('div[name="payment_mode"] label')
      .filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') }).first();
  private readonly invoiceMailInput = () =>
    this.page.locator('div[name="invoice_mail_template_id"] input').first();

  /** Pick a Payment Mode radio, preferring its technical value over its visible label. */
  async selectPaymentMode(label: string): Promise<void> {
    const value = SubscriptionTemplatePage.PAYMENT_MODE_VALUES[label];

    if (value && (await this.paymentModeRadioByValue(value).count().catch(() => 0))) {
      const input = this.paymentModeRadioByValue(value);

      // Three escalating ways to tick a Bootstrap custom-radio. The <input> is opacity:0 and the
      // <label> carries a ::before overlay, so a plain click can land on nothing and leave the
      // group untouched - which is exactly how this template was once saved with the wrong mode.
      if (await this.paymentModeLabelForValue(value).count().catch(() => 0)) {
        await this.paymentModeLabelForValue(value).click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        await this.wait(CommonUtils.waitTimes.medium);
      }
      if (!(await input.isChecked().catch(() => false))) {
        await input.check({ force: true, timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        await this.wait(CommonUtils.waitTimes.medium);
      }
      if (!(await input.isChecked().catch(() => false))) {
        await input.dispatchEvent('click').catch(() => {});
        await this.wait(CommonUtils.waitTimes.medium);
      }
    } else if (await this.paymentModeRadioByLabel(label).count().catch(() => 0)) {
      await this.paymentModeRadioByLabel(label).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    } else {
      throw new Error(`Payment Mode "${label}" is not offered on this form - the radio group has no matching option`);
    }

    await this.wait(CommonUtils.waitTimes.standard);

    // The <input> is a Bootstrap custom-radio and is visually hidden - only the <label> is
    // clickable, so a click that lands on the input does nothing. Prove the option really took
    // rather than trusting the click, and fail here instead of saving the wrong configuration.
    if (value) {
      const checked = await this.paymentModeRadioByValue(value).isChecked().catch(() => false);
      console.log(`  - Payment Mode "${label}" (${value}) selected: ${checked}`);
      if (!checked) {
        throw new Error(
          `selectPaymentMode: clicking "${label}" (${value}) left the radio unselected. ` +
          'The template would be saved with a different Payment Mode than the manual test case requires.',
        );
      }
    }
  }

  /**
   * Create a new template and save it.
   *
   * Two things the form demands that are easy to miss:
   *   - "Payment Mode" is a RADIO GROUP, not a dropdown.
   *   - Choosing a sending mode makes "Invoice Email Template" REQUIRED; saving without it is
   *     rejected with "The following fields are invalid: Invoice Email Template".
   *
   * Throws when the SAVED Payment Mode is not the requested one, so the test can never quietly
   * exercise a different template configuration than the manual test case describes.
   */
  async createTemplate(name: string, paymentModeLabel: string, invoiceMailTemplate = 'Subscription Invoice: Send by email'): Promise<void> {
    await this.createButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForFormView().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    await this.nameInput().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.nameInput().fill(name);
    await this.wait(CommonUtils.waitTimes.standard);

    await this.selectPaymentMode(paymentModeLabel);

    // Invoice Email Template becomes required once a sending payment mode is chosen.
    if (await this.invoiceMailInput().isVisible().catch(() => false)) {
      await this.invoiceMailInput().click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.invoiceMailInput().fill('');
      await this.wait(CommonUtils.waitTimes.standard);
      await this.invoiceMailInput().fill(invoiceMailTemplate);
      await this.wait(CommonUtils.waitTimes.long);
      await this.page.keyboard.press('Enter');
      await this.wait(CommonUtils.waitTimes.standard);
      console.log(`  - Invoice Email Template set to "${invoiceMailTemplate}" (required for this Payment Mode)`);
    }

    await this.saveButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForFormSaved(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    const saved = await this.getSettings();
    console.log(`  - Template "${name}" saved with Payment Mode "${saved.paymentMode}" (requested "${paymentModeLabel}")`);
    if (saved.paymentMode.trim().toLowerCase() !== paymentModeLabel.trim().toLowerCase()) {
      throw new Error(
        `createTemplate: the template was saved with Payment Mode "${saved.paymentMode}" but "${paymentModeLabel}" was requested. ` +
        'The automation would be exercising a different scenario than the manual test case - failing instead of continuing.',
      );
    }
  }

  private readonly activeSmartButton = () =>
    this.page.locator('.oe_button_box button, .o_form_view button.oe_stat_button').filter({ hasText: /Active/i }).first();

  /**
   * Archive the currently-open template.
   *
   * On sale.subscription.template the Action menu offers only Delete / Duplicate - there is NO
   * "Archive" entry. Archiving is done with the "Active" smart button in the button box, which
   * toggles the record between active and archived.
   */
  async archiveCurrent(): Promise<void> {
    await this.activeSmartButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.activeSmartButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingSpinnerToHide().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    if (await this.modalConfirmButton().count().catch(() => 0)) {
      await this.modalConfirmButton().click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
    }
    console.log('  - Record archived with the "Active" smart-button toggle');
  }

  /**
   * Archive every ACTIVE template whose name starts with `prefix`, and report how many were dealt
   * with. Best-effort: a template that cannot be opened or archived is logged and skipped.
   *
   * Housekeeping for the template cases. CRM-11806_1.1.4 creates a throwaway "Tmpl-Off-<unique>"
   * template and archives it as part of the case - but when the case fails BEFORE the archive step,
   * the template stays active and the next run of CRM-11806_1.1.3 ("the list holds exactly the five
   * templates in use") fails on the leftovers rather than on a real defect. Sweep first, so a red
   * 1.1.3 always means something real.
   */
  async archiveTemplatesByNamePrefix(prefix: string): Promise<number> {
    await this.openList();
    const names = await this.getListNames();
    const leftovers = names.filter(n => n.startsWith(prefix));

    if (!leftovers.length) {
      console.log(`  - No leftover templates matching "${prefix}*" to clean up`);
      return 0;
    }
    console.log(`  - Cleaning up ${leftovers.length} leftover template(s) matching "${prefix}*": ${leftovers.join(' | ')}`);

    let archived = 0;
    for (const name of leftovers) {
      try {
        await this.openByName(name);
        await this.archiveCurrent();
        archived += 1;
      } catch (error) {
        console.log(`  ! Could not archive leftover template "${name}": ${(error as Error).message}`);
      }
      await this.openList();
    }
    console.log(`  - Archived ${archived} of ${leftovers.length} leftover template(s)`);
    return archived;
  }

  /** Open the CREATE form from the templates list (used by the probe and by createTemplate). */
  async openCreateForm(): Promise<void> {
    await this.createButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForFormView().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /** DEBUG ONLY - return the raw markup of the Payment Mode radio group. */
  async dumpPaymentModeMarkup(): Promise<string> {
    const container = this.page.locator('div[name="payment_mode"]').first();
    if (await container.count().catch(() => 0)) {
      return ((await container.innerHTML({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '');
    }
    const anyRadio = this.page.locator('.o_field_radio').first();
    if (await anyRadio.count().catch(() => 0)) {
      return 'NO div[name=payment_mode]; first .o_field_radio = ' + ((await anyRadio.innerHTML().catch(() => '')) || '');
    }
    return 'NEITHER div[name=payment_mode] NOR .o_field_radio found';
  }
}
