import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Configuration for {@link PromotionPage.createPromotion} - mirrors the CRM-10780 "Promotion A"
 * fields. Every field is optional; the defaults describe the base promotion (Automatically Applied,
 * Discount, Percentage 10%, On Order), so `createPromotion({})` builds that base promotion. Override
 * only what a given test case needs (see the @example block on createPromotion).
 */
export interface PromotionConfig {
  /** Use this exact Program Name. If omitted, a unique name is generated from `namePrefix`. */
  name?: string;
  /** Prefix for the auto-generated unique name (a timestamp is appended). Default: 'TEST- Order - 10% '. */
  namePrefix?: string;
  /** Promo Code Usage radio. Default: 'Automatically Applied'. */
  promoCodeUsage?: string;
  /** Promo code value (only relevant when promoCodeUsage uses a code). */
  promoCode?: string;
  /** Reward radio. Default: 'Discount'. */
  reward?: string;
  /** Apply Discount (native <select>). Default: 'Percentage'. */
  applyDiscount?: 'Percentage' | 'Fixed Amount' | string;
  /** Percentage value (when applyDiscount = 'Percentage'). Default: 10. */
  discountPercentage?: number;
  /** Fixed amount value (when applyDiscount = 'Fixed Amount'). */
  discountFixedAmount?: number;
  /** Discount Apply On radio. Default: 'On Order'. */
  discountApplyOn?: 'On Order' | 'On Cheapest Product' | 'On Specific Product' | 'On Specific Products' | string;
  /** Max discount cap (discount_max_amount). Optional. */
  maxDiscountAmount?: number;
  /** Minimum purchase amount condition (rule_minimum_amount). Optional. */
  minPurchaseAmount?: number;
  /** Minimum quantity condition (rule_min_quantity). Optional. */
  minQuantity?: number;
  /** Maximum number of uses (maximum_use_number). Optional. */
  maximumUseNumber?: number;
  /** Applicability radio ('Apply On Current Order' | 'Apply On Next Order'). Optional. */
  applicability?: string;
  /** For Reseller boolean. Optional. */
  forReseller?: boolean;
  /** For Distributor boolean. Optional. */
  forDistributor?: boolean;
  /** Specific product name (single) - used when discountApplyOn = 'On Specific Product'. */
  specificProduct?: string;
  /** Specific product names (multiple) - used when discountApplyOn = 'On Specific Products'. */
  specificProducts?: string[];
  /** Free product name - used when reward = 'Free Product'. */
  freeProduct?: string;
  /** Free product quantity - used when reward = 'Free Product'. */
  freeProductQuantity?: number;
}

/**
 * Promotion Page Object - Sales module > Products > Promotion Programs (model: sale.coupon.program).
 * Covers CRM-10780 "Promotion creation". The form renders selection fields as Odoo radio groups:
 * <div name="<field>" role="radiogroup"> with <label ...>Option text</label> per option, so an option
 * is selected by clicking the label (by visible text) inside the field's div[name=...] container.
 */
export class PromotionPage extends BasePage {
  // --- Navigation (Sales app -> Products -> Promotion Programs) ---
  private readonly createButton = () =>
    this.page.locator("xpath=//button[normalize-space()='Create' or normalize-space()='CREATE' or normalize-space()='New']").first();
  private readonly productsMenuButton = () => this.page.getByRole('button', { name: 'Products', exact: true }).first();
  private readonly promotionProgramsMenuItem = () =>
    this.page.locator("xpath=//a[@role='menuitem' and normalize-space()='Promotion Programs']").first();
  private readonly listView = () => this.page.locator('.o_list_view, table.o_list_table').first();
  private readonly formView = () => this.page.locator('.o_form_view').first();
  private readonly saveButton = () => this.page.locator("xpath=//button[contains(@class,'o_form_button_save')]").first();

  // --- Form fields (model sale.coupon.program) ---
  private readonly nameInput = () => this.page.locator("xpath=//input[@name='name']").first();
  // discount_type is a native <select> (Percentage / Fixed Amount), not a radio.
  private readonly discountTypeSelect = () => this.page.locator("xpath=//select[@name='discount_type']").first();
  private readonly discountPercentageInput = () => this.page.locator("xpath=//input[@name='discount_percentage']").first();
  // Monetary fields render as <div name="X"><input.../></div> (the inner input has no name=), so target the inner input.
  private readonly discountFixedAmountInput = () => this.page.locator("xpath=//div[@name='discount_fixed_amount']//input | //input[@name='discount_fixed_amount']").first();
  private readonly discountMaxAmountInput = () => this.page.locator("xpath=//div[@name='discount_max_amount']//input | //input[@name='discount_max_amount']").first();
  private readonly ruleMinQuantityInput = () => this.page.locator("xpath=//input[@name='rule_min_quantity']").first();
  private readonly ruleMinAmountInput = () => this.page.locator("xpath=//div[@name='rule_minimum_amount']//input | //input[@name='rule_minimum_amount']").first();
  private readonly maxUseNumberInput = () => this.page.locator("xpath=//input[@name='maximum_use_number']").first();
  private readonly promoCodeInput = () => this.page.locator("xpath=//input[@name='promo_code']").first();
  // Active (archived) state: the boolean active field on the form.
  private readonly activeInputs = () => this.page.locator("xpath=//div[@name='active']//input | //input[@name='active']");
  // A radio option label inside a named radio-group field.
  private readonly radioOption = (field: string, option: string) =>
    this.page.locator(`xpath=//div[@name='${field}']//label[normalize-space()="${option}"]`).first();
  // Saved-record breadcrumb / title (read the saved Program Name).
  private readonly breadcrumbActive = () =>
    this.page.locator("xpath=//ol[contains(@class,'breadcrumb')]//li[contains(@class,'active')] | //span[@name='name']").first();
  // Server validation / error dialog (e.g. missing required field, duplicate name).
  private readonly promoErrorDialog = () =>
    this.page.locator("xpath=//div[contains(@class,'o_error_dialog')] | //div[contains(@class,'modal') and contains(@class,'show')]//div[contains(@class,'o_dialog_warning')] | //div[contains(@class,'o_notification') and contains(@class,'o_error')]").first();

  // --- List view: search + row selection + Action > Archive (used by teardown) ---
  private readonly searchInput = () =>
    this.page.locator("xpath=//div[contains(@class,'o_searchview')]//input[contains(@class,'o_searchview_input')]").first();
  private readonly dataRows = () => this.page.locator('tr.o_data_row');
  // Header "select all" checkbox - input is visually hidden, so toggle it via JS dispatch.
  private readonly selectAllCheckbox = () =>
    this.page.locator("xpath=//th[contains(@class,'o_list_record_selector')]//input[@type='checkbox']").first();
  // Action menu button (becomes visible once >=1 row is selected).
  private readonly listActionMenuButton = () =>
    this.page.locator("xpath=//button[normalize-space()='Action' or normalize-space()='ACTION'] | //div[contains(@class,'o_cp_action_menus')]//button").first();
  private readonly archiveMenuOption = () =>
    this.page.locator("xpath=//a[@role='menuitem' and normalize-space()='Archive'] | //span[normalize-space()='Archive']/parent::a").first();
  private readonly confirmOkButton = () =>
    this.page.locator("xpath=//button[normalize-space()='Ok' or normalize-space()='OK']").first();

  constructor(page: Page) {
    super(page);
  }

  private origin(): string {
    try { return new URL(this.page.url()).origin; } catch { return 'http://pre-production.nakivo.site'; }
  }

  /** Open the Sales module (Quotations list) directly via its menu action. */
  async openSalesModule(): Promise<void> {
    await this.goto(`${this.origin()}/web#menu_id=202&action_id=344`);
    await this.createButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Sales module opened');
  }

  /** From the Sales module, navigate Products > Promotion Programs and wait for the list. */
  async navigateToPromotionPrograms(): Promise<void> {
    await this.productsMenuButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.productsMenuButton().click();
    await this.wait(CommonUtils.waitTimes.standard);
    await this.promotionProgramsMenuItem().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.promotionProgramsMenuItem().click();
    await this.waitForURL('**model=sale.coupon.program**', CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.listView().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Promotion Programs list opened');
  }

  /** Click CREATE to open a new Promotion form. */
  async clickCreate(): Promise<void> {
    await this.createButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.createButton().click();
    await this.formView().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /** Fill the Program Name. */
  async setName(name: string): Promise<void> {
    await this.nameInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.nameInput().fill(name);
    await this.wait(CommonUtils.waitTimes.short);
  }

  /** Select an option in a radio-group field by visible label text. */
  async selectRadioOption(field: string, option: string): Promise<void> {
    const opt = this.radioOption(field, option);
    await opt.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await opt.scrollIntoViewIfNeeded().catch(() => {});
    await opt.click();
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  ✓ ${field} = "${option}"`);
  }

  // Convenience wrappers for the named radio groups.
  async selectPromoCodeUsage(option: string) { await this.selectRadioOption('promo_code_usage', option); }
  async selectApplicability(option: string) { await this.selectRadioOption('promo_applicability', option); }
  async selectReward(option: string) { await this.selectRadioOption('reward_type', option); }
  /** Apply Discount (discount_type) is a native <select>: select by label (Percentage / Fixed Amount). */
  async selectApplyDiscount(option: string) {
    const sel = this.discountTypeSelect();
    await sel.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await sel.selectOption({ label: option });
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  ✓ Apply Discount = "${option}"`);
  }
  async selectDiscountApplyOn(option: string) { await this.selectRadioOption('discount_apply_on', option); }

  private async fillNumber(locFn: () => import('@playwright/test').Locator, value: number | string): Promise<void> {
    const el = locFn();
    await el.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await el.click({ clickCount: 3 });
    await el.fill(String(value));
    await this.wait(CommonUtils.waitTimes.short);
  }
  async setDiscountPercentage(v: number | string) { await this.fillNumber(this.discountPercentageInput, v); }
  async setDiscountFixedAmount(v: number | string) { await this.fillNumber(this.discountFixedAmountInput, v); }
  async setDiscountMaxAmount(v: number | string) { await this.fillNumber(this.discountMaxAmountInput, v); }
  async setRuleMinQuantity(v: number | string) { await this.fillNumber(this.ruleMinQuantityInput, v); }
  async setRuleMinimumAmount(v: number | string) { await this.fillNumber(this.ruleMinAmountInput, v); }
  async setMaximumUseNumber(v: number | string) { await this.fillNumber(this.maxUseNumberInput, v); }
  async setPromoCode(v: string) {
    await this.promoCodeInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.promoCodeInput().fill(v);
    await this.wait(CommonUtils.waitTimes.short);
  }

  // --- Product / boolean fields revealed by the reward + discount-apply-on config ---
  private readonly dropdownOption = () => this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  private readonly rewardProductQtyInput = () => this.page.locator("xpath=//input[@name='reward_product_quantity']").first();

  /** Set a Many2one/Many2many product field (by field name) to a product, picking from the dropdown. */
  private async setProductField(fieldName: string, productName: string): Promise<void> {
    const input = this.page.locator(`xpath=//div[@name='${fieldName}']//input`).first();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.click();
    await input.fill(productName);
    await this.wait(CommonUtils.waitTimes.long);
    const escaped = productName.replace(/[[\]\\^$.|?*+(){}]/g, '\\$&');
    const opt = this.dropdownOption().filter({ hasText: new RegExp(escaped, 'i') }).first();
    if (await opt.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false)) {
      await opt.click();
    } else {
      await this.page.keyboard.press('Enter');
    }
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  ✓ ${fieldName} = "${productName}"`);
  }

  /** Specific Product (single) - for Discount Apply On = "On Specific Product" (discount_specific_product_id). */
  async setSpecificProduct(productName: string) { await this.setProductField('discount_specific_product_id', productName); }

  /** Specific Products (multiple) - for "On Specific Products" (Many2many discount_specific_product_ids). */
  async setSpecificProducts(productNames: string[]) {
    for (const p of productNames) await this.setProductField('discount_specific_product_ids', p);
  }

  /** Free Product (reward_product_id) - for Reward = "Free Product". */
  async setFreeProduct(productName: string) { await this.setProductField('reward_product_id', productName); }

  /** Free-product quantity (reward_product_quantity input). */
  async setRewardProductQuantity(v: number | string) { await this.fillNumber(this.rewardProductQtyInput, v); }

  /** Toggle a boolean field (e.g. for_reseller, for_distributor) by field name. */
  async setBooleanField(fieldName: string, checked: boolean = true): Promise<void> {
    const box = this.page.locator(`xpath=//div[@name='${fieldName}']//input[@type='checkbox']`).first();
    await box.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    if ((await box.isChecked().catch(() => false)) !== checked) {
      // Odoo boolean checkbox input is often visually hidden; a plain/force click may not register,
      // so set .checked + dispatch click+change (bubbling plain Events), like the list-row selector gotcha.
      await box.evaluate((el, want) => {
        const input = el as HTMLInputElement;
        input.checked = want as boolean;
        input.dispatchEvent(new Event('click', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, checked).catch(() => {});
      await this.wait(CommonUtils.waitTimes.short);
      if ((await box.isChecked().catch(() => false)) !== checked) {
        await box.click({ force: true }).catch(() => {});
        await this.wait(CommonUtils.waitTimes.short);
      }
    }
    console.log(`  ✓ ${fieldName} = ${checked} (checked=${await box.isChecked().catch(() => '?')})`);
  }
  async setForReseller(checked: boolean = true) { await this.setBooleanField('for_reseller', checked); }
  async setForDistributor(checked: boolean = true) { await this.setBooleanField('for_distributor', checked); }

  /**
   * Packaged "create a Promotion Program" flow - the whole thing in one call so other CRM-10780 specs
   * can set up a promotion (e.g. the "Promotion A" precondition for the Apply-Promotion tests) without
   * repeating the navigation + field-by-field steps.
   *
   * Assumes the correct user is already logged in (e.g. a Sales Manager). Runs, in form order:
   *   Open Sales module -> Products > Promotion Programs -> Create -> fill fields -> Save.
   * Only what `config` provides is set; everything else uses the base-promotion defaults
   * (Automatically Applied, Discount, Percentage 10%, On Order).
   *
   * @returns the `name` used and the saved record `url` - keep both for verification and teardown
   *          (`archivePromotionByName(name)` or `CommonUtils.deleteRecordByUrl(url)`).
   *
   * @example // Base "Promotion A" - auto-applied 10% on the whole order (CRM-10861 / 2.1.1.1, 2.1.1.17/18)
   *   const promo = await promotionPage.createPromotion({ namePrefix: 'TEST- Order - 10% ' });
   * @example // 10% but only when the order total reaches 1000$ (2.1.1.2 / 2.1.1.3)
   *   await promotionPage.createPromotion({ minPurchaseAmount: 1000 });
   * @example // 10% requiring a minimum quantity of 3 (2.1.1.4)
   *   await promotionPage.createPromotion({ minQuantity: 3 });
   * @example // discount applied on the cheapest / a specific product (2.1.1.6 / 2.1.1.7)
   *   await promotionPage.createPromotion({ discountApplyOn: 'On Cheapest Product' });
   * @example // fixed-amount 100$ on the order (2.1.1.8)
   *   await promotionPage.createPromotion({ applyDiscount: 'Fixed Amount', discountFixedAmount: 100 });
   * @example // fixed-amount capped at 50$ (2.1.1.9 / 2.1.1.13..16)
   *   await promotionPage.createPromotion({ applyDiscount: 'Fixed Amount', discountFixedAmount: 100, maxDiscountAmount: 50 });
   */
  async createPromotion(config: PromotionConfig = {}): Promise<{ name: string; url: string }> {
    await this.openSalesModule();
    await this.navigateToPromotionPrograms();
    await this.clickCreate();

    const name = config.name ?? this.generatePromotionName(config.namePrefix ?? 'TEST- Order - 10% ');
    await this.setName(name);

    await this.selectPromoCodeUsage(config.promoCodeUsage ?? 'Automatically Applied');
    if (config.promoCode) await this.setPromoCode(config.promoCode);

    const reward = config.reward ?? 'Discount';
    await this.selectReward(reward);

    if (reward === 'Free Product') {
      // Free Product reward: discount fields are hidden; set the free product + quantity instead.
      if (config.freeProduct) await this.setFreeProduct(config.freeProduct);
      if (config.freeProductQuantity != null) await this.setRewardProductQuantity(config.freeProductQuantity);
    } else {
      // Discount reward configuration.
      const applyDiscount = config.applyDiscount ?? 'Percentage';
      await this.selectApplyDiscount(applyDiscount);
      if (applyDiscount === 'Fixed Amount') {
        // Fixed Amount applies to the whole order; the "Discount Apply On" radio + specific-product
        // pickers are NOT rendered for it, so do not attempt to set them (they would time out).
        if (config.discountFixedAmount != null) await this.setDiscountFixedAmount(config.discountFixedAmount);
      } else {
        await this.setDiscountPercentage(config.discountPercentage ?? 10);
        const applyOn = config.discountApplyOn ?? 'On Order';
        await this.selectDiscountApplyOn(applyOn);
        if (applyOn === 'On Specific Product' && config.specificProduct) await this.setSpecificProduct(config.specificProduct);
        if (applyOn === 'On Specific Products' && config.specificProducts) await this.setSpecificProducts(config.specificProducts);
      }
      // Max Discount Amount is only shown for Percentage discounts (it caps a %); it is hidden for Fixed Amount.
      if (config.maxDiscountAmount != null && applyDiscount !== 'Fixed Amount') await this.setDiscountMaxAmount(config.maxDiscountAmount);
    }

    // Optional conditions / usage limits / targeting.
    if (config.minPurchaseAmount != null) await this.setRuleMinimumAmount(config.minPurchaseAmount);
    if (config.minQuantity != null) await this.setRuleMinQuantity(config.minQuantity);
    if (config.maximumUseNumber != null) await this.setMaximumUseNumber(config.maximumUseNumber);
    if (config.applicability) await this.selectApplicability(config.applicability);
    if (config.forReseller) await this.setForReseller(true);
    if (config.forDistributor) await this.setForDistributor(true);

    const url = await this.save();
    console.log(`  ✓ createPromotion: "${name}" -> ${url}`);
    return { name, url };
  }

  /** Save the form; waits for spinners to settle. Returns the saved record URL. */
  async save(): Promise<string> {
    await this.saveButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.saveButton().click();
    await CommonUtils.waitForSpinnersToHide(this.page).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    return this.page.url();
  }

  /** True if the save button is still showing (i.e. unsaved/blocked, e.g. a required field is empty). */
  async isInEditMode(): Promise<boolean> {
    return this.saveButton().isVisible({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => false);
  }

  /** Read whether the promotion is Active (true) or archived (false). Defensive true if not found. */
  async isPromotionActive(): Promise<boolean> {
    const inputs = this.activeInputs();
    const count = await inputs.count().catch(() => 0);
    if (count === 0) return true;
    return inputs.last().evaluate((el: HTMLInputElement) => el.checked).catch(() => true);
  }

  /** Read the saved Program Name from the breadcrumb/title. */
  async getSavedName(): Promise<string> {
    return ((await this.breadcrumbActive().textContent().catch(() => '')) ?? '').trim();
  }

  /** Read the error/validation popup text, or '' if none appears. */
  async getErrorText(): Promise<string> {
    const dlg = this.promoErrorDialog();
    const vis = await dlg.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!vis) return '';
    return ((await dlg.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Tear-down helper: go back to the Promotion Program LIST, isolate the just-created promotion by
   * its (unique) name, select it, then Action > Archive (soft-delete, not hard delete).
   * @returns true if a matching row was found and archived; false if none was found.
   */
  async archivePromotionByName(name: string): Promise<boolean> {
    // Back to the Promotion Program list view.
    await this.goto(`${this.origin()}/web#action=800&model=sale.coupon.program&view_type=list&menu_id=202`);
    await this.listView().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    // Search by the exact name to isolate the record we created.
    const search = this.searchInput();
    await search.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await search.click();
    await search.fill(name);
    await this.page.keyboard.press('Enter');
    await CommonUtils.waitForSpinnersToHide(this.page).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);

    if ((await this.dataRows().count().catch(() => 0)) === 0) {
      console.log(`  ⚠ Archive teardown: no Promotion row found for "${name}" - nothing to archive`);
      return false;
    }

    // Select the filtered row(s): Odoo's hidden list checkbox ignores plain clicks, so toggle it via
    // JS dispatch, then confirm the selection registered by the Action toolbar button appearing.
    await this.selectAllCheckbox().evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('click', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(() => {});
    await this.listActionMenuButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

    // Action > Archive, then confirm the dialog if one appears.
    await this.listActionMenuButton().click();
    await this.wait(CommonUtils.waitTimes.short);
    await this.archiveMenuOption().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.archiveMenuOption().click();
    await this.confirmOkButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.confirmOkButton().click().catch(() => {});
    await CommonUtils.waitForSpinnersToHide(this.page).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Archived Promotion "${name}" via Action > Archive`);
    return true;
  }

  /** Generate a unique promotion name with a timestamp. */
  generatePromotionName(prefix: string = 'TEST PROMO '): string {
    const now = new Date();
    const d = now.toISOString().split('T')[0].replace(/-/g, '');
    const t = now.toISOString().split('T')[1].replace(/[:.]/g, '').substring(0, 6);
    return `${prefix}${d}${t}`;
  }
}
