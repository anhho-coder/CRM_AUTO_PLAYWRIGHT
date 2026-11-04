import { Frame, Page } from '@playwright/test';
import { SubscriptionPageMig } from './SubscriptionPageMig';
import type { GenerateInvoiceResult } from '../SubscriptionPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Drop-in replacement for the PRE-PRODUCTION `SubscriptionPage`, driving the crm-mig EMBED.
 *
 * WHY THIS EXISTS
 * ---------------
 * 29 of the 31 blocked CRM-11806 specs import `SubscriptionPage` from `@pages` and drive the native
 * Odoo 12 `sale.subscription` screens. crm-mig does not have that module: the subscription lives on
 * the peer (`pre-sales-crm-mig.nakivo.site`, db `odoo19`) and the CRM renders it inside
 * `iframe.o_nakivo_embed_frame`. Measured 2026-10-16, two of those specs fail with exactly that:
 *
 *     BasePage.xmlId: "sale_subscription.sale_subscription_action" does not exist on
 *     crm-mig.nakivo.site. The module is not installed there.
 *
 * Their `@blocked-devrun` / `@blocked-mail` labels describe the SECOND blocker. This is the first.
 *
 * HOW TO USE IT
 * -------------
 * One line per spec, the same alias trick that fixed the pre-production leak - the body does not
 * change:
 *
 *     import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
 *
 * WHAT IS AND IS NOT PORTED
 * -------------------------
 * Every method below was measured on the live embed in this session. Everything else throws
 * `notPorted()` with the method name, **on purpose**: a stub that returned `''` or `0` would turn a
 * missing capability into a green tick. CRM-11806_1.5 already showed what that looks like - it
 * "passed" while every step was a placeholder. A loud failure naming the method is the only honest
 * default.
 */
export class SubscriptionPageEmbed {
  private readonly subs: SubscriptionPageMig;
  private frame: Frame | null = null;

  constructor(private readonly page: Page) {
    this.subs = new SubscriptionPageMig(page);
  }

  /** Pre-prod field name -> the peer's. Measured: the embed form uses `remote_*` for these two. */
  private static readonly FIELD_MAP: Record<string, string> = {
    partner_id: 'remote_partner_id',
    pricelist_id: 'remote_pricelist_id',
  };

  // Signatures accept anything and return `any` ON PURPOSE: a compile error here would block
  // the whole repo, not just this suite. The failure is deferred to run time, where it is LOUD and
  // names the method - never a silent '' that would turn a missing capability into a green tick.
  private notPorted(method: string): never {
    throw new Error(
      `SubscriptionPageEmbed.${method}() is NOT ported to the crm-mig embed yet.\n` +
      'The pre-production SubscriptionPage drives the native sale.subscription screens, which do ' +
      'not exist on crm-mig - the record lives on the peer behind iframe.o_nakivo_embed_frame.\n' +
      'Port this method against the embed (dump the control first, do not guess a selector) and ' +
      'add it here. Returning an empty value instead would make the spec pass without checking ' +
      'anything.',
    );
  }

  /**
   * The live embed frame.
   *
   * ADOPT AN OPEN RECORD BEFORE OPENING THE LIST (fixed 2026-10-21). A spec that creates its
   * subscription through `createSubscriptionMig()` / `createSubscriptionViaEmbed()` leaves the page
   * holding an embed frame already parked on `/sale.subscription/<id>` - but those helpers build
   * their OWN `SubscriptionPageMig`, so this adapter never learned about it. Opening the list here
   * instead pointed every later read at a grid with no record on it, and `getState()`,
   * `getPricelist()`, `getDateOfNextInvoice()` and friends all returned `''` on a subscription that
   * plainly existed. Six specs (3.3, 3.5, 3.6, 7.3, 7.4, 10.2) failed on that `''`, each with a
   * different-looking message and the same cause.
   */
  private async f(): Promise<Frame> {
    if (this.frame && !this.frame.isDetached()) return this.frame;
    const onRecord = this.page.frames().find((fr) =>
      /pre-sales-crm-mig/.test(fr.url()) && /\/sale\.subscription\/\d+/.test(fr.url()));
    if (onRecord) {
      console.log(`  - SubscriptionPageEmbed: adopted the embed frame already on ${onRecord.url()}`);
      this.frame = onRecord;
      return onRecord;
    }
    this.frame = await this.subs.openSubscriptionsEmbed();
    return this.frame;
  }

  // ---------------------------------------------------------------- navigation

  async openSubscriptionsList(): Promise<void> {
    this.frame = await this.subs.openSubscriptionsEmbed();
  }

  /** `_timeout` is accepted for signature compatibility with the pre-production page object. */
  async waitForLoaded(_timeout?: number): Promise<void> {
    const fr = await this.f();
    const ready = await this.subs.waitForEmbedFormReady(fr);
    if (!ready) {
      throw new Error(
        'SubscriptionPageEmbed.waitForLoaded(): the embed did not render a subscription form. ' +
        `Frame URL: ${fr.url()}. A /web/login there is the SC-31 finding, not a wait to extend.`,
      );
    }
  }

  /** Open a subscription by the peer's own record URL. */
  async openByUrl(url: string): Promise<void> {
    const fr = await this.f();
    await fr.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
  }

  // ---------------------------------------------------------------- create / edit

  async clickCreate(): Promise<void> {
    await this.subs.clickNewInEmbed(await this.f());
  }

  /**
   * `createIfMissing` is NOT silently dropped. The pre-production baseline passes it to have the
   * picker create the Customer on the fly; the embed cannot do that - per the measured D5 note in
   * `createSubscriptionMig()`, crm-mig cannot create a partner on the peer from this form. Ignoring
   * the flag left the field EMPTY and the save then committed nothing, which is how CRM-11806_3.1
   * read `Reference = ""` with no error anywhere. Fail by name instead.
   */
  async fillMany2One(field: string, value: string, createIfMissing = false): Promise<void> {
    const mapped = SubscriptionPageEmbed.FIELD_MAP[field] ?? field;
    const fr = await this.f();
    await this.subs.fillEmbedMany2One(fr, mapped, value);
    const held = await this.subs.readEmbedField(fr, mapped).catch(() => '');
    if (!held.trim()) {
      throw new Error(
        `SubscriptionPageEmbed.fillMany2One("${field}"): the picker offered no match for ` +
        `"${value}" and the field is still empty` +
        (createIfMissing
          ? ' - the baseline would have CREATED the record here, which the embed cannot do on the ' +
            'peer (see the D5 note in createSubscriptionMig). Use an existing record and say so.'
          : '.'),
      );
    }
  }

  async addSubscriptionLine(sku: string, quantity?: number): Promise<void> {
    await this.subs.addEmbedSubscriptionLine(await this.f(), sku, quantity);
  }

  async save(): Promise<string> {
    return await this.subs.saveInEmbed(await this.f());
  }

  async setStage(stage: string): Promise<void> {
    await this.subs.setEmbedStage(await this.f(), stage);
  }

  async setCheckbox(field: string, checked: boolean): Promise<void> {
    await this.subs.setEmbedCheckbox(await this.f(), field, checked);
  }

  // ---------------------------------------------------------------- readers

  /**
   * Use `readEmbedReference`, not `getEmbedReference`. The latter reads the BREADCRUMB only; on a
   * frame this adapter adopted from a helper the control panel can still be re-rendering, and the
   * breadcrumb-only read then returns '' on a record whose Reference is plainly on the form.
   * `readEmbedReference` falls back to the `code` / `name` fields. CRM-11806_3.3 failed on exactly
   * that '' while the helper that created the record had already asserted a SUB reference.
   */
  async getCode(): Promise<string> {
    return await this.subs.readEmbedReference(await this.f());
  }

  async getState(): Promise<string> {
    return await this.subs.getEmbedStage(await this.f());
  }

  async getCustomer(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'remote_partner_id');
  }

  async getPricelist(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'remote_pricelist_id');
  }

  async getSubscriptionTemplate(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'template_id');
  }

  /**
   * Dates, in the MM/DD/YYYY the baseline parses.
   *
   * Odoo 19 DISPLAYS a short date ("Oct 21"); the full value lives in `data-tooltip` on the span or
   * the daterange button (measured 2026-10-21: `data-tooltip="11/20/2026"`, and the button also
   * carries `value="11/20/2026"`). Reading the display text handed the baseline's
   * `parseMMDDYYYY()` a string it cannot parse, and CRM-11806_3.5 failed with `got "Oct 21"` on a
   * date that was perfectly correct.
   */
  private async readDate(field: string): Promise<string> {
    const fr = await this.f();
    const host = fr.locator(`[name="${field}"]`).first();
    const t = CommonUtils.waitTimes.long * 2;
    for (const loc of [host.locator('[data-tooltip]').first(), host]) {
      const tip = await loc.getAttribute('data-tooltip', { timeout: t }).catch(() => null);
      if (tip && /\d{1,2}\/\d{1,2}\/\d{4}/.test(tip)) return tip.trim();
    }
    const val = await host.locator('button, input').first().getAttribute('value', { timeout: t }).catch(() => null);
    if (val && /\d{1,2}\/\d{1,2}\/\d{4}/.test(val)) return val.trim();
    return await this.subs.readEmbedField(fr, field);
  }

  async getDateOfNextInvoice(): Promise<string> {
    return await this.readDate('recurring_next_date');
  }

  async getStartDate(): Promise<string> {
    return await this.readDate('date_start');
  }

  async getPaymentToken(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'payment_token_id');
  }

  async getSalesperson(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'user_id');
  }

  /**
   * The "Invoices" smart button count. Measured: the embed renders
   * `button[name="action_open_source_invoices"]` with text like "2 Invoices"; those invoices are
   * CRM-side (`sale.subscription.source_invoice_count`), the peer's own account.move is empty.
   */
  async getInvoiceCount(): Promise<number> {
    const fr = await this.f();
    const btn = fr.locator('button[name="action_open_source_invoices"]').first();
    if (!(await btn.count().catch(() => 0))) {
      throw new Error(
        'SubscriptionPageEmbed.getInvoiceCount(): no action_open_source_invoices button on the ' +
        'embedded form. Do not read that as 0 - the control is missing, which is a different fact.',
      );
    }
    const raw = (await btn.innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => '')).replace(/\s+/g, ' ');
    const m = raw.match(/\d+/);
    if (!m) throw new Error(`SubscriptionPageEmbed.getInvoiceCount(): button text carries no number ("${raw}").`);
    return Number(m[0]);
  }

  async openInvoices(): Promise<void> {
    const fr = await this.f();
    await fr.locator('button[name="action_open_source_invoices"]').first()
      .click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
  }

  /**
   * Open the cycle's invoice as a FRESHLY LOADED CRM form, and return its id.
   *
   * WHY THIS EXISTS, measured 2026-11-03 - and the cause is still only half known:
   * after openInvoices() the page does land on a clean invoice form (one `.o_form_view`, one
   * statusbar, one VISIBLE Validate button - there are no duplicate forms, contrary to what I
   * first reported). Yet VALIDATE and Cancel clicked on that SPA-routed form did nothing, three
   * runs in a row, with the invoice staying `draft` in the database. The same invoice opened by
   * a plain `#id=<id>&model=account.invoice&view_type=form` URL posted on the first click
   * (100001695: draft -> open, CE-INV/2026/10214).
   *
   * So this re-opens the form at that proven URL shape. Note the shape matters: a `page.reload()`
   * on the SPA's own URL (which carries `action=262&menu_id=430`) rendered an EMPTY page, so do
   * not "simplify" this to a reload.
   *
   * The underlying reason the SPA-routed form ignores the clicks is still NOT established ON
   * CRM-MIG. There is now a strong candidate, measured on PRE-PRODUCTION on 2026-11-03: a Cancel
   * there was refused by a transient notification reading "The following fields are invalid: End
   * User Payment Terms", and the invoice stayed Draft. Every crm-mig probe dismissed its dialogs
   * without reading them, so the same thing could have been on screen each time. That is a lead to
   * check, NOT a cause to cite - nobody has read a crm-mig notification yet.
   *
   * That quoted message names TWO fields - `partner_end_user_id` ("End User") and
   * `payment_term_id` ("Payment Terms") - whose labels Odoo prints with nothing between them. It
   * is not a field called "End User Payment Terms", and the first write-up of this said it was.
   */
  async openInvoiceFormOnCrm(): Promise<number> {
    await this.openInvoices();

    // The smart button navigates the TOP-LEVEL page, and that navigation outlives openInvoices()'s
    // own fixed wait. Measured 2026-11-03 (subs-mig-open-invoices-lands-where): straight after
    // openInvoices() the page was still on the embed URL with 0 `.o_form_view`; one settle later it
    // was on `#id=100001696&action=262&model=account.invoice&view_type=form` with exactly one form,
    // one statusbar and one VISIBLE Validate. Reading the URL once therefore loses a race that it
    // wins only sometimes - which is exactly what happened: the 12:29 run got through, the three
    // runs after it all threw here. So POLL for the id instead of reading once.
    let url = this.page.url();
    let m = url.match(/[#&]id=(\d+)/);
    for (let i = 0; i < 12 && !m; i++) {
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
      url = this.page.url();
      m = url.match(/[#&]id=(\d+)/);
    }
    if (!m) {
      throw new Error(
        `SubscriptionPageEmbed.openInvoiceFormOnCrm(): the "Invoices" smart button did not land on ` +
        `an invoice form - the page is still at "${url}" after waiting. Do not carry on against ` +
        `whatever is on screen.`,
      );
    }
    const id = Number(m[1]);
    const base = url.split('/web#')[0];
    await this.page.goto(`${base}/web#id=${id}&model=account.invoice&view_type=form`,
      { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 4);
    console.log(`  - invoice ${id} re-opened as a fresh CRM form`);
    return id;
  }

  /** The "Sales" smart button - measured as `action_open_source_order`, labelled "1 Sales". */
  async getSalesCount(): Promise<number> {
    const fr = await this.f();
    const btn = fr.locator('button[name="action_open_source_order"]').first();
    if (!(await btn.count().catch(() => 0))) {
      throw new Error('SubscriptionPageEmbed.getSalesCount(): no action_open_source_order button on the embedded form.');
    }
    const raw = (await btn.innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => '')).replace(/\s+/g, ' ');
    const m = raw.match(/\d+/);
    if (!m) throw new Error(`SubscriptionPageEmbed.getSalesCount(): button text carries no number ("${raw}").`);
    return Number(m[0]);
  }

  // ---------------------------------------------------------------- ported 2026-10-21
  // Every selector below was MEASURED on the live crm-mig embed on 2026-10-21 by dumping the DOM of
  // an In Progress subscription (peer record 1809, SUB00079) in both readonly and edit mode. None
  // was inferred from the pre-production form.

  /** The embed's own Edit button - measured as `button.o_form_button_edit`, labelled "Edit". */
  async clickEdit(): Promise<void> {
    const fr = await this.f();
    await fr.locator('button.o_form_button_edit').first()
      .click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 2);
  }

  /**
   * The baseline's "=> Generate Invoice" link EXISTS on the embed, as
   * `button[name="recurring_invoice_new"]` labelled with an arrow plus "Generate Invoice".
   * It is the MANUAL billing path, so a billing case does not depend on the service cron.
   */
  async isGenerateInvoiceVisible(): Promise<boolean> {
    const fr = await this.f();
    const btn = fr.locator('button[name="recurring_invoice_new"]').first();
    if (!(await btn.count().catch(() => 0))) return false;
    return await btn.isVisible().catch(() => false);
  }

  async clickGenerateInvoice(): Promise<GenerateInvoiceResult> {
    const fr = await this.f();
    const returnUrl = fr.url();
    const btn = fr.locator('button[name="recurring_invoice_new"]').first();
    if (!(await btn.count().catch(() => 0))) {
      throw new Error(
        'SubscriptionPageEmbed.clickGenerateInvoice(): no button[name="recurring_invoice_new"] on ' +
        `the embedded form (${returnUrl}). The control is missing - that is a finding, not a 0.`,
      );
    }
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.savingPage);

    // READ any dialog BEFORE dismissing it, exactly as the baseline does: a billing run that
    // raised a UserError ("nothing to invoice", "no payment token") otherwise looks like a silent
    // no-op - no invoice, no date change and no explanation.
    let dialogText = '';
    const dialog = fr.locator('.modal.show, .o_dialog').first();
    if (await dialog.count().catch(() => 0)) {
      dialogText = ((await dialog.innerText({ timeout: CommonUtils.waitTimes.long }).catch(() => '')) || '')
        .replace(/\s+/g, ' ').trim();
      if (dialogText) console.log(`  ! dialog after "Generate Invoice": "${dialogText}"`);
      await fr.locator('.modal.show .btn-close, .modal.show button:has-text("Ok"), .o_dialog .btn-close')
        .first().click({ timeout: CommonUtils.waitTimes.long }).catch(() => {});
    }
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);

    const invoiceUrl = fr.url();
    const navigatedToInvoice = /account\.move|account\.invoice/.test(invoiceUrl);
    console.log(`  - "Generate Invoice" clicked (landed on ${navigatedToInvoice ? 'the new invoice' : 'the same page'})`);
    return { returnUrl, invoiceUrl, navigatedToInvoice, dialogText };
  }

  /** "Date of Next Invoice" = `recurring_next_date`; readonly a span, in edit a daterange button. */
  async isDateOfNextInvoiceVisible(): Promise<boolean> {
    const fr = await this.f();
    const field = fr.locator('[name="recurring_next_date"]').first();
    if (!(await field.count().catch(() => 0))) return false;
    return await field.isVisible().catch(() => false);
  }

  /**
   * Set a date field. Measured: in edit mode the control is
   * `button#<field>_0.o_daterange_start` carrying `value="MM/DD/YYYY"` - NOT an `<input>`.
   * `date_start` renders READONLY once the subscription leaves Draft, so this throws there rather
   * than silently leaving the old date in place.
   */
  async setDateField(fieldName: string, mmddyyyy: string): Promise<void> {
    const fr = await this.f();
    const btn = fr.locator(`button#${fieldName}_0.o_daterange_start`).first();
    if (!(await btn.count().catch(() => 0))) {
      throw new Error(
        `SubscriptionPageEmbed.setDateField("${fieldName}"): no editable daterange control. ` +
        'Measured 2026-10-21: date_start renders readonly once the subscription is In Progress. ' +
        'Click EDIT first, and set a start date only while the record is still in Draft.',
      );
    }
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.type(mmddyyyy, { delay: 40 });
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
  }

  async setDateOfNextInvoice(mmddyyyy: string): Promise<void> {
    await this.setDateField('recurring_next_date', mmddyyyy);
  }

  /** "Recurring Price" = `recurring_total`, rendered like "$ 3.85". */
  async getRecurringPrice(): Promise<number> {
    const fr = await this.f();
    const raw = await fr.locator('[name="recurring_total"]').first()
      .innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '');
    const n = parseFloat((raw || '').replace(/[^0-9.,-]/g, '').replace(/,/g, ''));
    if (Number.isNaN(n)) {
      throw new Error(`SubscriptionPageEmbed.getRecurringPrice(): recurring_total carries no number ("${raw}").`);
    }
    return n;
  }

  /** The record's Reference as the form field `name` renders it (e.g. "SUB00079"). */
  async getName(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'name');
  }

  /** Notebook tabs - measured as anchors `a[name="<slug>_page"]`. */
  private static readonly TAB_NAME: Record<string, string> = {
    'subscription lines': 'subscription_lines_page',
    'settings': 'settings_page',
    'misc': 'misc_page',
    'other info': 'other_info_page',
  };

  async openTab(label: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    const fr = await this.f();
    const slug = SubscriptionPageEmbed.TAB_NAME[(label || '').trim().toLowerCase()];
    const loc = slug ? fr.locator(`a[name="${slug}"]`) : fr.locator('.o_notebook .nav-link', { hasText: label });
    await loc.first().click({ timeout });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 2);
  }

  // ---------------------------------------------------------------- subscription lines
  // Measured row cells: remote_product_id | name | product_uom_qty | product_uom_id | price_unit |
  // discount | price_subtotal. There is NO product_id on the row.

  private lineRows() {
    return this.frame!.locator('[name="sale_subscription_line_ids"] .o_data_row');
  }

  private async lineCell(cell: string, row = 0): Promise<string> {
    await this.f();
    const td = this.lineRows().nth(row).locator(`td[name="${cell}"]`).first();
    if (!(await td.count().catch(() => 0))) {
      throw new Error(`SubscriptionPageEmbed: subscription line row ${row} has no cell "${cell}".`);
    }
    return (await td.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')).trim();
  }

  private static num(raw: string): number {
    const n = parseFloat((raw || '').replace(/[^0-9.,-]/g, '').replace(/,/g, ''));
    return Number.isNaN(n) ? 0 : n;
  }

  async getLineCount(): Promise<number> {
    await this.f();
    return await this.lineRows().count();
  }

  async getLineProduct(): Promise<string> { return await this.lineCell('remote_product_id'); }
  async getLineUoM(): Promise<string> { return await this.lineCell('product_uom_id'); }
  async getLineQuantity(): Promise<number> { return SubscriptionPageEmbed.num(await this.lineCell('product_uom_qty')); }
  async getLineUnitPrice(): Promise<number> { return SubscriptionPageEmbed.num(await this.lineCell('price_unit')); }
  async getLineDiscount(): Promise<number> { return SubscriptionPageEmbed.num(await this.lineCell('discount')); }
  async getLineSubTotal(): Promise<number> { return SubscriptionPageEmbed.num(await this.lineCell('price_subtotal')); }

  async getAllLineProducts(): Promise<string[]> {
    await this.f();
    const n = await this.lineRows().count();
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(await this.lineCell('remote_product_id', i));
    return out;
  }

  // ---------------------------------------------------------------- checkboxes
  // Measured: `input#<field>_0.form-check-input`.

  private async checkbox(field: string): Promise<boolean> {
    const fr = await this.f();
    const box = fr.locator(`input#${field}_0`).first();
    if (!(await box.count().catch(() => 0))) {
      throw new Error(`SubscriptionPageEmbed: no checkbox input#${field}_0 on the embedded form.`);
    }
    return await box.isChecked().catch(() => false);
  }

  async getToRenew(): Promise<boolean> { return await this.checkbox('to_renew'); }
  async getSubscriptionReminder(): Promise<boolean> { return await this.checkbox('subscription_reminder'); }

  // ---------------------------------------------------------------- chatter
  // Measured on the embed: one `.o-mail-Thread` and one `.o-mail-Chatter`; activities render as
  // `.o-mail-Activity` (none on the record measured).

  async hasChatter(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const fr = await this.f();
    const c = fr.locator('.o_mail_thread, .o-mail-Thread');
    await c.first().waitFor({ state: 'attached', timeout }).catch(() => {});
    return (await c.count().catch(() => 0)) > 0;
  }

  async getChatterText(): Promise<string> {
    const fr = await this.f();
    const c = fr.locator('.o_mail_thread, .o-mail-Thread').first();
    if (!(await c.count().catch(() => 0))) return '';
    return (await c.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')).trim();
  }

  async getActivityCount(): Promise<number> {
    const fr = await this.f();
    return await fr.locator('.o-mail-Activity, .o_mail_activity').count().catch(() => 0);
  }

  // ---------------------------------------------------------------- header buttons
  // Measured: "Edit", "Create", "Action", "Close subscription"
  // (`button[name="action_close_subscription"]`, btn-danger) plus the stage arrow buttons.

  private headerButton(label: string) {
    return this.frame!.locator('.o_form_statusbar button, .o_control_panel button, .o_cp_buttons button')
      .filter({ hasText: label });
  }

  async isHeaderButtonVisible(label: string): Promise<boolean> {
    await this.f();
    const b = this.headerButton(label).first();
    if (!(await b.count().catch(() => 0))) return false;
    return await b.isVisible().catch(() => false);
  }

  async clickHeaderButton(label: string): Promise<void> {
    await this.f();
    const b = this.headerButton(label).first();
    if (!(await b.count().catch(() => 0))) {
      throw new Error(`SubscriptionPageEmbed.clickHeaderButton("${label}"): no such header button on the embedded form.`);
    }
    await b.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
  }

  /**
   * Read any dialog the embed is showing, then dismiss it, and return its text ('' when none).
   *
   * Same locators as clickGenerateInvoice() uses, for the same reason: a header button that
   * answers with a UserError otherwise looks like a silent no-op. CRM-11806_7.2 needs it to assert
   * that "Create A Renewal Quotation" REFUSES - the refusal is the expected result since
   * IS-CRM-FUNC-0162 was retired (spec v5, CRM-13836).
   */
  async readAndDismissDialog(): Promise<string> {
    const fr = await this.f();
    const dialog = fr.locator('.modal.show, .o_dialog').first();
    if (!(await dialog.count().catch(() => 0))) return '';
    const text = ((await dialog.innerText({ timeout: CommonUtils.waitTimes.long }).catch(() => '')) || '')
      .replace(/\s+/g, ' ').trim();
    await fr.locator('.modal.show .btn-close, .modal.show button:has-text("Ok"), .o_dialog .btn-close')
      .first().click({ timeout: CommonUtils.waitTimes.long }).catch(() => {});
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    return text;
  }

  /** "Close subscription" - measured as `button[name="action_close_subscription"]`. */
  async closeSubscription(): Promise<string> {
    const fr = await this.f();
    const btn = fr.locator('button[name="action_close_subscription"]').first();
    if (!(await btn.count().catch(() => 0))) {
      throw new Error('SubscriptionPageEmbed.closeSubscription(): no action_close_subscription button on the embedded form.');
    }
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.savingPage);
    return await this.subs.getEmbedStage(fr).catch(() => '');
  }

  /**
   * The Close Reason on a closed subscription. Measured 2026-10-21 on the peer's SUB537
   * (stage Closed): the embed form carries `[name="close_reason_id"]`. It renders empty when
   * no reason was recorded, and '' is reported as-is - that is a finding, not a read failure.
   */
  async getCloseReason(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'close_reason_id');
  }

  // ---------------------------------------------------------------- many2one dropdown
  // Measured: every many2one is `input#<field>_0.o-autocomplete--input`; its options render in
  // `.o-autocomplete--dropdown-menu .o-autocomplete--dropdown-item`.

  async getMany2OneDropdownOptions(fieldName: string, searchText = ''): Promise<string[]> {
    const fr = await this.f();
    const mapped = SubscriptionPageEmbed.FIELD_MAP[fieldName] ?? fieldName;
    const input = fr.locator(`input#${mapped}_0`).first();
    if (!(await input.count().catch(() => 0))) {
      throw new Error(
        `SubscriptionPageEmbed.getMany2OneDropdownOptions("${fieldName}"): no input#${mapped}_0. ` +
        'Click EDIT first - the field renders as a readonly div outside edit mode.',
      );
    }
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill(searchText);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
    const opts = await fr.locator('.o-autocomplete--dropdown-menu .o-autocomplete--dropdown-item')
      .allInnerTexts().catch(() => [] as string[]);
    return opts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /** Pick the EXACT dropdown label, never the first fuzzy match - the baseline's setPricelist(). */
  async selectMany2OneByExactLabel(fieldName: string, searchText: string, exactLabel: string): Promise<void> {
    const fr = await this.f();
    const mapped = SubscriptionPageEmbed.FIELD_MAP[fieldName] ?? fieldName;
    const input = fr.locator(`input#${mapped}_0`).first();
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill(searchText);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
    const items = fr.locator('.o-autocomplete--dropdown-menu .o-autocomplete--dropdown-item');
    const texts = (await items.allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.replace(/\s+/g, ' ').trim());
    const idx = texts.findIndex((t) => t === exactLabel.trim());
    if (idx < 0) {
      throw new Error(
        `SubscriptionPageEmbed.selectMany2OneByExactLabel("${fieldName}"): typing "${searchText}" ` +
        `offered no option labelled exactly "${exactLabel}". It offered ${texts.length}: ` +
        `${texts.join(' | ') || '(none)'}`,
      );
    }
    await items.nth(idx).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 2);

    // The baseline verifies what the click actually put in the field - clicking the right row and
    // ending up with the wrong value is a real Odoo autocomplete failure mode.
    const finalValue = ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    if (finalValue !== exactLabel.trim()) {
      throw new Error(`${fieldName}: clicked "${exactLabel}" but the field now holds "${finalValue}".`);
    }
  }

  /**
   * Set the Pricelist to the record the picker LABELS exactly `exactLabel`.
   *
   * Ported from the pre-production baseline together with the reason it exists: Odoo labels a
   * pricelist "<name> (<currency>)" and this database holds pairs whose names differ only by that
   * suffix, so typing the FULL label makes name_search drop the shorter-named record and leaves
   * only the trap. Type the bare name, then require an exact-label match.
   * Measured 2026-10-21: typing the full "Public Pricelist_USD (USD)" into the embed returns
   * "No records" - the same trap, confirmed on crm-mig.
   */
  async setPricelist(exactLabel: string): Promise<void> {
    const searchText = exactLabel.replace(/\s*\([^()]*\)\s*$/, '').trim();
    await this.selectMany2OneByExactLabel('pricelist_id', searchText, exactLabel);
  }

  // ---------------------------------------------------------------- list search (ported 2026-11-03)
  // Measured by tests/_explore/subs-mig-embed-list-count-dom-20261103.explore.spec.ts against the
  // live list (frame https://pre-sales-crm-mig.nakivo.site/odoo/sale.subscription):
  //   .o_kanban_record:not(.o_kanban_ghost)  97   default view, GROUPED (o_kanban_grouped, 5 groups)
  //   .o_data_row                            97   after clicking button.o_switch_view.o_list
  //   .o_searchview_facet                     1   a default "My Subscriptions" facet
  //   .o_facet_remove                         1   removing all of them took 3 passes: 2 -> 1 -> 0
  //   searching "SUB00117"                    1   row, facets become ["My Subscriptions","NameSUB00117"]
  //   clearing every facet                  161   rows - so the default facet HIDES most records
  //
  // THREE TRAPS, each one measured, each one able to produce a confident wrong number:
  //  1. THE PAGER COUNTS GROUPS, NOT RECORDS. With 97 rows on screen the pager read "1-5 / 5" -
  //     five GROUPS. Never read a record total off it.
  //  2. A FOLDED GROUP'S ROWS ARE NOT IN THE DOM. The list and the kanban are both grouped, and a
  //     folded group contributes nothing to `.o_data_row`. Counting through one would silently
  //     undercount, so this throws instead of returning a number it cannot stand behind.
  //  3. THE DEFAULT "My Subscriptions" FACET HIDES RECORDS - 97 of 161 here. Any count that is
  //     meant to be absolute must clearSearchFacets() FIRST.

  /**
   * Re-resolve the embed frame handle WITHOUT navigating.
   *
   * `f()` is the wrong tool inside a click loop: when `this.frame` is null it falls through to
   * `openSubscriptionsEmbed()`, which RE-OPENS the list from scratch - resetting the view back to
   * kanban and re-applying the default facet. The first version of prepareCountableView() nulled
   * the frame after every click and called `f()`, so each group it expanded was immediately
   * undone by a fresh list load, and the guard kept reporting the same two folded groups however
   * many passes it made. Measured 2026-11-03: the groups were genuinely folded (`.o_data_row`
   * 97 with two folded, 80 after folding a third), so the guard was right and the expansion was
   * the broken half.
   */
  private liveFrame(): Frame | null {
    return this.page.frames().find((f) =>
      /pre-sales-crm-mig/.test(f.url()) && f.url() !== 'about:blank' && !f.isDetached()) ?? null;
  }

  /** Rows on whichever view is showing - list rows, else kanban cards. */
  private async countVisibleRecords(fr: Frame): Promise<number> {
    const listRows = await fr.locator('.o_data_row').count().catch(() => 0);
    if (listRows > 0) return listRows;
    if (await fr.locator('.o_list_view').count().catch(() => 0)) return 0; // list view, genuinely empty
    return await fr.locator('.o_kanban_record:not(.o_kanban_ghost)').count().catch(() => 0);
  }

  /**
   * Trap 2, handled rather than merely reported.
   *
   * The first real run of searchInList() (2026-11-03) threw here: the default KANBAN view ships
   * grouped with at least one column folded (a "None" column), so the guard fired on every call
   * and the method was unusable. Refusing to count was right; refusing to do anything about it
   * was not. So: switch to the LIST view, where the measured search returned its rows
   * ungrouped-enough to count, then expand anything still folded, and only THEN give up if a
   * folded group remains - because a count taken through one would be too low.
   */
  private async prepareCountableView(fr: Frame): Promise<Frame> {
    const listBtn = fr.locator('button.o_switch_view.o_list').or(fr.locator('[data-tooltip="List"]')).first();
    if (await listBtn.count().catch(() => 0) && !(await fr.locator('.o_list_view').count().catch(() => 0))) {
      await listBtn.click({ timeout: CommonUtils.waitTimes.long }).catch(() => {});
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 2);
      fr = this.liveFrame() ?? fr;
    }
    // Expand folded groups - a few passes, since expanding one can reveal another.
    for (let i = 0; i < 8; i++) {
      const folded = fr.locator('.o_group_header:not(.o_group_open), .o_column_folded');
      const n = await folded.count().catch(() => 0);
      if (!n) break;
      await folded.first().click({ timeout: CommonUtils.waitTimes.long }).catch(() => {});
      await this.page.waitForTimeout(CommonUtils.waitTimes.long);
      fr = this.liveFrame() ?? fr;
    }
    return fr;
  }

  /** Last line of defence: never return a count taken through a folded group. */
  private async assertNoFoldedGroup(fr: Frame, where: string): Promise<void> {
    const folded = await fr.locator('.o_group_header:not(.o_group_open), .o_column_folded')
      .count().catch(() => 0);
    if (folded > 0) {
      throw new Error(
        `SubscriptionPageEmbed.${where}: ${folded} group(s) are still FOLDED after trying to expand ` +
        'them. A folded group keeps its rows out of the DOM, so this count would be too low. ' +
        'Remove the grouping from the Subscriptions action, or expand them by hand first.',
      );
    }
  }

  /**
   * Remove every facet in the search bar, including the default "My Subscriptions" one.
   *
   * Measured: three passes (2 -> 1 -> 0). The frame is re-resolved each pass because removing a
   * facet can detach the handle - that detach is what made the first measurement attempt report
   * -1 for every later count.
   */
  async clearSearchFacets(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      const fr = await this.f();
      const n = await fr.locator('.o_facet_remove').count().catch(() => -1);
      if (n <= 0) break;
      await fr.locator('.o_facet_remove').first().click({ timeout: CommonUtils.waitTimes.long }).catch(() => {});
      await this.page.waitForTimeout(CommonUtils.waitTimes.long);
      // Re-resolve WITHOUT navigating - see liveFrame(). Nulling this.frame here would send the
      // next f() back through openSubscriptionsEmbed() and re-apply the facet just removed.
      this.frame = this.liveFrame();
    }
  }

  /**
   * Type `term` into the list search box, press Enter, and return the number of MATCHING RECORDS.
   *
   * Enter takes the default option, which this list spells "Name<term>" - measured, the
   * autocomplete returned no options of its own. An empty `term` just counts what is on screen.
   */
  async searchInList(term: string): Promise<number> {
    // Only navigate if the list is not already on screen. Re-opening it would re-apply the
    // default "My Subscriptions" facet - which silently undid the clearSearchFacets() that every
    // caller performs immediately before this (5.4, 5.5, 5.6, 5.7, 9.3, 7.2 all write that pair).
    const onList = this.liveFrame();
    const alreadyListing = onList
      ? await onList.locator('.o_list_view, .o_kanban_view').count().catch(() => 0) > 0
      : false;
    if (!alreadyListing) await this.openSubscriptionsList();
    const fr = await this.f();
    const input = fr.locator('input.o_searchview_input').or(fr.locator('.o_searchview input')).first();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

    if (term) {
      await input.click();
      await this.page.keyboard.type(term, { delay: 20 });
      await this.page.waitForTimeout(CommonUtils.waitTimes.short);
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
    }

    let live = await this.f();
    live = await this.prepareCountableView(live);
    await this.assertNoFoldedGroup(live, 'searchInList');
    const n = await this.countVisibleRecords(live);
    const facets = await live.locator('.o_searchview_facet').allTextContents().catch(() => []);
    console.log(`  - searchInList("${term}") = ${n} record(s); facets ${JSON.stringify(facets.map((s) => s.replace(/\s+/g, ' ').trim()))}`);
    return n;
  }

  // ------------------------------------------------- NOT PORTED - fail, never fake
  // Each of these drives a native pre-production control with no measured embed equivalent. The
  // 2026-10-21 dump covered an In Progress subscription's form; these were not on it.
  async getEndDate(..._args: any[]): Promise<any> { return this.notPorted('getEndDate'); }
  async setPaymentToken(..._args: any[]): Promise<any> { return this.notPorted('setPaymentToken'); }
  async getContentText(..._args: any[]): Promise<any> { return this.notPorted('getContentText'); }
  async openSubscriptionTemplatesList(..._args: any[]): Promise<any> { return this.notPorted('openSubscriptionTemplatesList'); }
}
