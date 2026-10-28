import { Locator, Page } from '@playwright/test';
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

  /**
   * ONE re-type, logged. On crm-mig (CRM-12144_2.3, 2026-10-22 19:03) "A2144B" sat in the Product cell with no
   * dropdown for 30 s, while the same step passed in 2.1 / 2.2 minutes before and in 2.3's own re-run - the search
   * never fired or never answered. Typing the SKU again key by key fires a new search. Still strict: no Enter
   * fallback (it once picked the wrong product), a second miss throws.
   */
  protected async waitForProductOption(input: Locator, sku: string, option: Locator): Promise<void> {
    const shown = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true, () => false);
    if (shown) return;
    console.log(`  ⚠ no dropdown option for "${sku}" after ${CommonUtils.waitTimes.abnormalWait / 1000} s - typing it again`);
    await input.fill('');
    await input.pressSequentially(sku, { delay: CommonUtils.waitTimes.short });
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
  }

  async getOrderLineRowCells(rowIndex: number = 0): Promise<Record<string, string>> {
    const table = this.page.locator('xpath=//div[contains(@class,"o_notebook")]//div[contains(@class,"tab-pane") and contains(@class,"active")]//table[contains(@class,"o_list_view")]')
      .or(this.page.locator('.o_notebook .tab-pane.active table.o_list_view'))
      .first();
    return readRowByAuthoredCaption(table, rowIndex, CommonUtils.waitTimes.abnormalWait);
  }

  // ==========================================================================================
  //  Added 2026-10-26 for CRM-11857_4.3 / 4.4 / 4.6 / 8.4 (Exchange Rates on crm-mig). All bounded.
  // ==========================================================================================

  private readonly fxPaymentTermInput = () =>
    this.page.locator('xpath=//div[@name="payment_term_id" and not(contains(@class,"o_invisible_modifier"))]//input')
      .or(this.page.locator('div[name="payment_term_id"]:not(.o_invisible_modifier) input')).first();
  private readonly fxAutocompleteItem = (text: RegExp) =>
    this.page.locator("xpath=//ul[contains(@class,'ui-autocomplete') and not(contains(@style,'display: none'))]//li[contains(@class,'ui-menu-item')]")
      .or(this.page.locator('ul.ui-autocomplete:visible li.ui-menu-item')).filter({ hasText: text }).first();
  private readonly fxPricelistField = () =>
    this.page.locator('xpath=//*[@name="pricelist_id" and not(contains(@class,"o_invisible_modifier"))]')
      .or(this.page.locator('[name="pricelist_id"]:not(.o_invisible_modifier)')).first();
  private readonly fxAmountTotal = () =>
    this.page.locator('xpath=//span[@name="amount_total"]').or(this.page.locator('span[name="amount_total"]')).first();

  /**
   * Payment Term, bounded (the base selectPaymentTerm() clicks without a timeout). Clicks the option whose text is
   * exactly `term` and reads the field back; throws when it does not stick.
   */
  async selectPaymentTermMig(term: string): Promise<string> {
    const input = this.fxPaymentTermInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill(term, { timeout: CommonUtils.waitTimes.abnormalWait });
    const option = this.fxAutocompleteItem(new RegExp(`^\\s*${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`));
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await option.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    const readBack = ((await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    if (readBack !== term) throw new Error(`Deal Element Payment Term reads "${readBack}" after picking "${term}"`);
    console.log(`  - Payment Term = "${readBack}"`);
    return readBack;
  }

  /** The Pricelist as the form shows it, in read or edit mode (e.g. "Public Pricelist_EUR (EUR)"). */
  async getPricelistDisplayMig(): Promise<string> {
    const field = this.fxPricelistField();
    await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    const value = await field.evaluate((el: HTMLElement) => {
      const input = el.matches('input') ? (el as HTMLInputElement) : (el.querySelector('input') as HTMLInputElement | null);
      const raw = input ? input.value : (el.innerText || el.textContent || '');
      return raw.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    }, undefined, { timeout: CommonUtils.waitTimes.abnormalWait });
    console.log(`  - Deal Element Pricelist : "${value}"`);
    return value;
  }

  /** The grand Total exactly as shown, currency symbol included. */
  async getAmountTotalRawMig(): Promise<string> {
    const field = this.fxAmountTotal();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const raw = ((await field.innerText({ timeout: CommonUtils.waitTimes.abnormalWait })) || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`  - Deal Element Total (raw) : "${raw}"`);
    return raw;
  }

  /**
   * One order-line cell, raw, by column caption (case-insensitive) on the row whose text contains `rowText` (e.g. the SKU).
   * @returns '' when the column or the row is absent
   */
  async getOrderLineCellRawMig(rowText: string, caption: string): Promise<string> {
    const table = this.page.locator('xpath=//div[@name="order_line"]//table').or(this.page.locator('div[name="order_line"] table')).first();
    await table.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const raw = await table.evaluate((el: HTMLElement, a: { rowText: string; caption: string }) => {
      const norm = (s: string | null) => (s || '').replace(/​/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
      const ths = Array.from(el.querySelectorAll('thead th'));
      const idx = ths.findIndex((t) => norm(t.textContent).toLowerCase() === a.caption.toLowerCase());
      const row = Array.from(el.querySelectorAll('tbody tr.o_data_row')).find((r) => norm(r.textContent).includes(a.rowText));
      if (idx < 0 || !row) return '';
      const cell = row.querySelectorAll('td')[idx] as HTMLElement | undefined;
      return cell ? norm(cell.textContent) : '';
    }, { rowText, caption }, { timeout: CommonUtils.waitTimes.abnormalWait });
    console.log(`  - Deal Element line "${rowText}" ${caption} (raw) : "${raw}"`);
    return raw;
  }

  /** Evidence hooks set by markOrderLineCellMig(): the order-line cell a check read, and its column caption. */
  static readonly ORDER_LINE_CELL = '[data-pw-verify="de-line-cell"]';
  static readonly ORDER_LINE_HEAD = '[data-pw-verify="de-line-head"]';

  /**
   * TAG one order-line cell (ORDER_LINE_CELL) and its column caption (ORDER_LINE_HEAD) - the row whose text contains
   * `rowText`, the column whose caption is `caption` (case-insensitive) - and scroll the Order Lines table sideways
   * until that cell is on screen. The table is wider than the form: on a 1920 px screen it stops at "Unit of Measure"
   * (CRM-12144_4.3 / 7.5 / 8.1 review 2026-10-26: the reward's Unit Price was off-image although the check read it).
   * Reads / tags / scrolls only. Any tag left by an earlier call is removed first.
   * @returns the cell text, or '' when the row or the column is absent (nothing is tagged then)
   */
  async markOrderLineCellMig(rowText: string, caption: string): Promise<string> {
    const table = this.page.locator('xpath=//div[@name="order_line"]//table').or(this.page.locator('div[name="order_line"] table')).first();
    await table.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const text = await table.evaluate((el: HTMLElement, a: { rowText: string; caption: string }) => {
      document.querySelectorAll('[data-pw-verify="de-line-cell"], [data-pw-verify="de-line-head"]').forEach((n) => n.removeAttribute('data-pw-verify'));
      const norm = (s: string | null) => (s || '').replace(/​/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
      const ths = Array.from(el.querySelectorAll('thead th'));
      const idx = ths.findIndex((t) => norm(t.textContent).toLowerCase() === a.caption.toLowerCase());
      const row = Array.from(el.querySelectorAll('tbody tr.o_data_row')).find((r) => norm(r.textContent).includes(a.rowText));
      if (idx < 0 || !row) return '';
      const cell = row.querySelectorAll('td')[idx] as HTMLElement | undefined;
      if (!cell) return '';
      cell.setAttribute('data-pw-verify', 'de-line-cell');
      ths[idx].setAttribute('data-pw-verify', 'de-line-head');
      cell.scrollIntoView({ block: 'nearest', inline: 'center' });
      return norm(cell.innerText || cell.textContent);
    }, { rowText, caption }, { timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '');
    await this.wait(CommonUtils.waitTimes.short);
    console.log(`  - evidence: order line "${rowText}" ${caption} cell ${text ? `tagged ("${text}")` : 'NOT found - nothing tagged'}`);
    return text;
  }

  // ==========================================================================================
  //  Added 2026-10-26 for CRM-12144_7.5 (maintenance mode, QI TC-22). All bounded.
  // ==========================================================================================

  /** CSS of the "Promotion from snapshot" field (sale.order.promo_from_snapshot) - for verify-point highlights. */
  readonly promoFromSnapshotCss = ".o_form_sheet [name='promo_from_snapshot']";
  /**
   * Evidence hook for "Promotion from snapshot" while the view HIDES it (False): the form group the field sits in, which
   * stays on screen - the shot then outlines where the mark would be drawn. promoFromSnapshotCss outlines nothing then.
   */
  readonly promoFromSnapshotGroupCss = ".o_form_sheet .o_inner_group:has([name='promo_from_snapshot'])";
  private readonly snapshotField = () =>
    this.page.locator('xpath=//div[contains(@class,"o_form_sheet")]//*[@name="promo_from_snapshot"]')
      .or(this.page.locator(this.promoFromSnapshotCss)).first();
  /**
   * CSS of the BOX that carries the "Promotions unavailable" warning: a dialog's .modal-content (never .modal.show - that
   * is the full-screen overlay, an outline round the whole window marks nothing) or a notification.
   */
  readonly promotionsUnavailableCss = '.modal.show .modal-content, .o_notification';
  private readonly unavailableNotice = () =>
    this.page.locator('xpath=//div[contains(concat(" ",normalize-space(@class)," ")," modal ") and contains(concat(" ",normalize-space(@class)," ")," show ")]//div[contains(concat(" ",normalize-space(@class)," ")," modal-content ")] | //div[contains(concat(" ",normalize-space(@class)," ")," o_notification ")]')
      .or(this.page.locator(this.promotionsUnavailableCss))
      .filter({ hasText: /Promotions unavailable|Discount Service did not answer/i });

  /**
   * "Promotion from snapshot" as the form shows it. The view (sale.order.deal.element.form.promotion.service, read on
   * crm-mig 2026-10-26) hides the field while it is False: attrs invisible = [('promo_from_snapshot', '=', False)].
   * @returns 'ticked' | 'not ticked (field hidden)' | 'not ticked (field shown unticked)'
   * @throws when the field is not on the form at all - an unread field is never reported as "not ticked"
   */
  async getPromoFromSnapshotState(): Promise<string> {
    const field = this.snapshotField();
    const attached = await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (!attached) throw new Error(`"Promotion from snapshot" (promo_from_snapshot) is not on the Deal Element form at ${this.page.url()}`);
    const info = await field.evaluate((el: HTMLElement) => {
      const box = (el.matches('input') ? el : el.querySelector('input[type="checkbox"]')) as HTMLInputElement | null;
      const hidden = el.classList.contains('o_invisible_modifier') || !(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return { hidden, checked: box ? box.checked : null };
    }, undefined, { timeout: CommonUtils.waitTimes.abnormalWait });
    const state = info.hidden ? 'not ticked (field hidden)' : info.checked ? 'ticked' : 'not ticked (field shown unticked)';
    console.log(`  - Promotion from snapshot : ${state}`);
    return state;
  }

  /** Text of every visible "Promotions unavailable" dialog / notification ([] = none on screen). */
  async getPromotionsUnavailableNotices(): Promise<string[]> {
    const n = await this.unavailableNotice().count().catch(() => 0);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const el = this.unavailableNotice().nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      out.push(((await el.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 300));
    }
    console.log(`  - "Promotions unavailable" warnings on screen : ${out.length ? out.join(' | ') : '(none)'}`);
    return out;
  }
}
