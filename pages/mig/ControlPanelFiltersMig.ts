import { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * The Odoo 12 control-panel search on crm-mig: "Filters > Add Custom Filter" and the facet chips, for ANY view
 * (list or pivot). Added 2026-10-26 for CRM-11857 (7.1 rate list, 3.4 / 8.1 Invoices Analysis pivot).
 *
 * Measured on crm-mig 2026-10-26 (EXPLORE-20261026_30):
 *  - the Filters toggle is a control-panel button labelled "Filters"; "Add Custom Filter" is an entry of its
 *    dropdown (class o_add_custom_filter);
 *  - the condition editor carries select.o_searchview_extended_prop_field (options = field labels, e.g.
 *    "Invoice #", "Untaxed Total" on account.invoice.report, "Date", "Rate" on res.currency.rate),
 *    select.o_searchview_extended_prop_op (e.g. "is equal to", "less than or equal to") and a value input;
 *  - Apply adds one facet chip (.o_searchview_facet) whose (x) is .o_facet_remove.
 * The page object never types into the list's quick-search box, it only drives the custom filter editor.
 */
export class ControlPanelFiltersMig extends BasePage {
  // ─── Locators (XPath primary, CSS fallback) ───────────────────────────────
  protected readonly filtersToggle = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_control_panel")]//button[contains(@class,"dropdown-toggle")][normalize-space()="Filters"]')
      .or(this.page.locator('.o_control_panel button.dropdown-toggle:has-text("Filters")')).first();
  protected readonly addCustomFilterEntry = (): Locator =>
    this.page.locator('xpath=//*[contains(@class,"o_add_custom_filter")]')
      .or(this.page.locator('.o_add_custom_filter')).first();
  protected readonly fieldSelect = (): Locator =>
    this.page.locator('xpath=//select[contains(@class,"o_searchview_extended_prop_field")]')
      .or(this.page.locator('select.o_searchview_extended_prop_field')).first();
  protected readonly operatorSelect = (): Locator =>
    this.page.locator('xpath=//select[contains(@class,"o_searchview_extended_prop_op")]')
      .or(this.page.locator('select.o_searchview_extended_prop_op')).first();
  protected readonly valueInput = (): Locator =>
    this.page.locator('xpath=//span[contains(@class,"o_searchview_extended_prop_value")]//input | //input[contains(@class,"o_searchview_extended_prop_value")]')
      .or(this.page.locator('.o_searchview_extended_prop_value input, input.o_searchview_extended_prop_value')).first();
  protected readonly applyButton = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_filters_menu")]//button[contains(@class,"o_apply_filter")] | //div[contains(@class,"o_filters_menu")]//button[normalize-space()="Apply"]')
      .or(this.page.locator('.o_filters_menu button.o_apply_filter, .o_filters_menu button:has-text("Apply")')).first();
  protected readonly facets = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview_facet")]').or(this.page.locator('.o_searchview_facet'));
  /** An XPath string literal for any text (quotes included) - concat() when it holds both quote kinds. */
  protected static xpathLiteral(text: string): string {
    if (!text.includes('"')) return `"${text}"`;
    if (!text.includes("'")) return `'${text}'`;
    return `concat(${text.split('"').map((part) => `"${part}"`).join(`, '"', `)})`;
  }
  protected readonly facetRemoveOf = (text: string): Locator =>
    this.page.locator(`xpath=//div[contains(@class,"o_searchview_facet")][contains(normalize-space(.),${ControlPanelFiltersMig.xpathLiteral(text)})]//*[contains(@class,"o_facet_remove")]`)
      .or(this.page.locator('.o_searchview_facet').filter({ hasText: text }).locator('.o_facet_remove')).first();

  constructor(page: Page) {
    super(page);
  }

  /** Open the Filters dropdown until its "Add Custom Filter" entry shows (the toggle can miss on a re-render). */
  async openFiltersMenu(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (await this.addCustomFilterEntry().isVisible().catch(() => false)) return true;
      await this.filtersToggle().click({ timeout }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
    }
    return this.addCustomFilterEntry().isVisible().catch(() => false);
  }

  /** Close the Filters dropdown when it is open. */
  async closeFiltersMenu(): Promise<void> {
    if (await this.addCustomFilterEntry().isVisible().catch(() => false)) {
      await this.filtersToggle().click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.short);
    }
  }

  /**
   * Filters > Add Custom Filter > field > operator > value > Apply.
   * The value is typed and committed with Tab (a char or a date input; for a date it is the MM/DD/YYYY text the
   * datepicker shows on this build).
   * @returns the facet texts after Apply (the new condition is among them when it took)
   */
  async addCustomFilter(fieldLabel: string, operator: string | { value: string }, value: string,
    timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string[]> {
    const operatorLabel = typeof operator === 'string' ? operator : `[operator value ${operator.value}]`;
    console.log(`  - Filters > Add Custom Filter: "${fieldLabel}" ${operatorLabel} "${value}"`);
    const opened = await this.openFiltersMenu(timeout);
    if (!opened) throw new Error('The Filters dropdown did not open (no "Add Custom Filter" entry)');
    await this.addCustomFilterEntry().click({ timeout });
    await this.fieldSelect().waitFor({ state: 'visible', timeout });
    await this.fieldSelect().selectOption({ label: fieldLabel }, { timeout });
    await this.wait(CommonUtils.waitTimes.standard); // the value widget re-renders after the field changes
    // A label for char / number fields ("is equal to"); a VALUE ('<=') when the UI words the operator differently
    // per field type (a Date field offers "is before or equal to" for <=, a number "less than or equal to").
    await this.operatorSelect().selectOption(typeof operator === 'string' ? { label: operator } : { value: operator.value }, { timeout });
    const chosen = await this.operatorSelect().evaluate((el) => {
      const sel = el as HTMLSelectElement;
      return sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].textContent || '').trim() : '';
    }, undefined, { timeout }).catch(() => '');
    console.log(`    - operator shown in the editor: "${chosen}"`);
    await this.wait(CommonUtils.waitTimes.standard);
    const input = this.valueInput();
    await input.waitFor({ state: 'visible', timeout });
    await input.click({ timeout });
    await input.fill('', { timeout });
    await input.fill(value, { timeout });
    await this.page.keyboard.press('Tab');
    await this.wait(CommonUtils.waitTimes.standard);
    const typed = await input.inputValue({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '');
    console.log(`    - value input holds "${typed}"`);
    await this.applyButton().click({ timeout });
    await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    await this.closeFiltersMenu();
    const facetTexts = await this.getFacetTexts();
    console.log(`    - facets now: ${facetTexts.join(' | ')}`);
    return facetTexts;
  }

  /** The text of every search facet chip, whitespace-collapsed. */
  async getFacetTexts(): Promise<string[]> {
    return (await this.facets().allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /**
   * Remove the facet whose text contains `text` (e.g. the custom filter facet "Invoice # is equal to ...").
   * @returns true when no facet with that text is left
   */
  async removeFacetContaining(text: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const remove = this.facetRemoveOf(text);
    if (await remove.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      await remove.click({ timeout });
      await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
    }
    const left = (await this.getFacetTexts()).filter((f) => f.includes(text));
    console.log(`  - facet "${text}" removed: ${left.length === 0}`);
    return left.length === 0;
  }
}
