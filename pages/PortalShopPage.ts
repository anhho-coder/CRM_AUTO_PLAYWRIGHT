import { Page } from '@playwright/test';
import { ResellerPortalPage } from './ResellerPortalPage';
import { CommonUtils } from '@helpers/common.utils';

/** Radio ids of the licence-type switch on the /shop calculator. */
export type ShopLicenseType = 'perpetual' | 'subscription';
/** Radio ids of the edition switch on the /shop calculator. */
export type ShopEdition = 'pro_essentials' | 'pro' | 'enterprise_essentials' | 'enterprise' | 'enterprise_plus';

export interface ShopLicenseConfig {
  licenseType: ShopLicenseType;
  /** Number typed into the "Sockets" field (2 = the [A2144B] "Minimum of 2 ... Sockets" SKU). */
  sockets: number;
  edition: ShopEdition;
}

export interface ShopEndUserAddress {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  street: string;
  city: string;
  zip?: string;
  /** res.country id used by the custom dropdown (233 = United States, 46 = Chile is the default). */
  countryId: string;
  /** State label to pick once the state list has loaded for the country (first state when omitted). */
  stateName?: string;
}

/**
 * Partner-portal WebShop Page Object (nakivo_shop module) - the "BUY NEW LICENSE" flow:
 *   /shop (notice modal -> licence calculator #calc_form) -> Next -> /shop/address (new end user)
 *   -> Next -> /shop/payment (Stripe inline Elements, form action /shop/payment/token) -> Pay.
 *
 * Pressing Next on the calculator already creates the website Sale Order (website_id = NAKIVO Partner
 * Portal); the payment page shows it as "Your order: SO######". Paying it is what makes the order a
 * "paid WebShop order" for CRM-12501: the website confirms the SO and creates its invoice itself
 * (create_uid = NAKIVO, Inc.), which is the only kind of invoice the "License Manager: Website Invoice
 * to License" job picks up.
 *
 * Grounded on pre-production DOM dumps of 2026-09-10 (tests/_explore, since deleted). Extends
 * ResellerPortalPage so the Stripe Elements typing and the portal My-invoices helpers are shared.
 * Locators: XPath primary, CSS fallback.
 */
export class PortalShopPage extends ResellerPortalPage {
  // --- Locators: notice modal + calculator ------------------------------------------------------
  private readonly noticeContinueButton = () =>
    this.page.locator("xpath=//button[@id='shop-redirect']").or(this.page.locator('#shop-redirect')).first();
  private readonly calculatorForm = () =>
    this.page.locator("xpath=//form[@id='calc_form']").or(this.page.locator('#calc_form')).first();
  private readonly radioById = (id: string) =>
    this.page.locator(`xpath=//input[@type='radio'][@id='${id}']`).or(this.page.locator(`input[type="radio"]#${id}`)).first();
  private readonly labelFor = (id: string) =>
    this.page.locator(`xpath=//label[@for='${id}']`).or(this.page.locator(`label[for="${id}"]`)).first();
  private readonly socketInput = () =>
    this.page.locator("xpath=//input[@id='socket']").or(this.page.locator('#socket')).first();
  private readonly priceAside = () =>
    this.page.locator("xpath=//aside[contains(@class,'aside')]").or(this.page.locator('aside.aside')).first();
  private readonly calculatorNextButton = () =>
    this.page.locator("xpath=//button[@id='submit_button']").or(this.page.locator('#submit_button')).first();

  // --- Locators: /shop/address ----------------------------------------------------------------
  private readonly countryHiddenInput = () =>
    this.page.locator("xpath=//input[@id='country_id']").or(this.page.locator('#country_id')).first();
  private readonly countryDropdownTitle = () =>
    this.page.locator("xpath=//input[@id='country_id']/following-sibling::div[contains(@class,'js-dropdown-title')]")
      .or(this.page.locator('input#country_id + div.js-dropdown-title')).first();
  private readonly countryItem = (countryId: string) =>
    this.page.locator(`xpath=//div[contains(@class,'o_country_item') and @data-country='${countryId}']`)
      .or(this.page.locator(`.o_country_item[data-country="${countryId}"]`)).first();
  private readonly stateDropdownTitle = () =>
    this.page.locator("xpath=//div[@id='prev_selected_state']").or(this.page.locator('#prev_selected_state')).first();
  private readonly stateItems = () =>
    this.page.locator("xpath=//div[@id='state_id']//div[contains(@class,'o_state_item')]")
      .or(this.page.locator('#state_id .o_state_item'));
  private readonly stateHiddenInput = () =>
    this.page.locator("xpath=//input[@id='input_state_id']").or(this.page.locator('#input_state_id')).first();
  private readonly addressInput = (name: string) =>
    this.page.locator(`xpath=//form[@action='/shop/address']//input[@name='${name}']`)
      .or(this.page.locator(`form[action="/shop/address"] input[name="${name}"]`)).first();
  private readonly addressNextButton = () =>
    this.page.locator("xpath=//a[contains(@class,'a-submit') and contains(normalize-space(.),'Next')]")
      .or(this.page.locator('a.a-submit:has-text("Next")')).first();
  private readonly addressErrors = () =>
    this.page.locator("xpath=//*[contains(@class,'has-error') or contains(@class,'is-invalid') or contains(@class,'alert-danger')]")
      .or(this.page.locator('.has-error, .is-invalid, .alert-danger'));

  // --- Locators: /shop/payment ----------------------------------------------------------------
  private readonly shopPaymentForm = () =>
    this.page.locator("xpath=//form[contains(@class,'o_custom_payment_form')]").or(this.page.locator('form.o_custom_payment_form')).first();
  private readonly shopStripeRadio = () =>
    this.page.locator("xpath=//input[@name='pm_id' and @data-provider='stripe']")
      .or(this.page.locator('input[name="pm_id"][data-provider="stripe"]')).first();
  private readonly shopPayButton = () =>
    this.page.locator("xpath=//button[@id='o_payment_form_pay']").or(this.page.locator('#o_payment_form_pay')).first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Open /shop as the logged-in reseller and pass the "new end users only" notice when it shows.
   * @returns true when the licence calculator form is on screen
   */
  async openShop(): Promise<boolean> {
    const origin = new URL(this.page.url()).origin;
    await this.page.goto(`${origin}/shop`, { waitUntil: 'domcontentloaded' });
    await this.wait(CommonUtils.waitTimes.extraLong);
    const notice = await this.noticeContinueButton().isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    if (notice) {
      await this.noticeContinueButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.page.waitForLoadState('domcontentloaded');
      await this.wait(CommonUtils.waitTimes.extraLong);
      console.log('  - Passed the "NEW END USER - CONTINUE" notice');
    }
    const onCalculator = await this.calculatorForm().isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    console.log(`  - /shop licence calculator on screen: ${onCalculator}`);
    return onCalculator;
  }

  /**
   * Fill the licence calculator. The edition radios sit below the fold, so the label is scrolled into
   * view before it is clicked; the resulting radio state is re-read and returned so the caller can
   * assert it (a wrong edition silently buys a different SKU).
   */
  async configureLicense(config: ShopLicenseConfig): Promise<{ licenseTypeChecked: boolean; editionChecked: boolean; sockets: string }> {
    const typeLabel = this.labelFor(config.licenseType);
    await typeLabel.scrollIntoViewIfNeeded().catch(() => {});
    await typeLabel.click({ force: true, timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.socketInput().fill(String(config.sockets));
    await this.socketInput().press('Tab');
    const editionLabel = this.labelFor(config.edition);
    await editionLabel.scrollIntoViewIfNeeded().catch(() => {});
    await editionLabel.click({ force: true, timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.extraLong); // price recalculation
    const licenseTypeChecked = await this.radioById(config.licenseType).isChecked().catch(() => false);
    const editionChecked = await this.radioById(config.edition).isChecked().catch(() => false);
    const sockets = (await this.socketInput().inputValue().catch(() => '')) || '';
    console.log(`  - Calculator: ${config.licenseType} checked=${licenseTypeChecked} | sockets=${sockets} | ${config.edition} checked=${editionChecked}`);
    return { licenseTypeChecked, editionChecked, sockets };
  }

  /** The "Price" aside text (Subtotal / Partner discount / Total), whitespace-normalised. */
  async getCalculatorSummary(): Promise<string> {
    const text = (await this.priceAside().textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Press the calculator's Next (this creates / rebuilds the website Sale Order) and report which step
   * the shop rendered next, by CONTENT rather than URL:
   *  - 'address' : the "End user details" form (a cart with no end user yet - normal first run);
   *  - 'payment' : the "Checkout / Payment for your order" form straight away - the reseller's cart
   *                already carries an end user from an earlier run, and the shop skips the address
   *                step while keeping the URL at /shop (seen 2026-09-10 16:06).
   */
  async clickCalculatorNext(): Promise<'address' | 'payment'> {
    const next = this.calculatorNextButton();
    await next.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const disabled = await next.isDisabled().catch(() => true);
    if (disabled) throw new Error('The calculator "Next" button is disabled - the licence configuration is incomplete');
    // The submit is JS-driven and races the price recalculation the edition / socket change fires:
    // a Next pressed while that AJAX is in flight is silently dropped (2 of 5 runs on 2026-09-10 got
    // through, 3 did not). Let the network settle and the Price aside stabilise before pressing.
    await this.page.waitForLoadState('networkidle', { timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    let previous = await this.getCalculatorSummary();
    for (let i = 0; i < 10; i++) {
      await this.wait(CommonUtils.waitTimes.long);
      const current = await this.getCalculatorSummary();
      if (current === previous) break;
      previous = current;
    }
    const resultBefore = (await this.page.locator('#result').inputValue().catch(() => '')) || '';
    console.log(`  - Calculator hidden #result before Next: ${resultBefore ? resultBefore.slice(0, 80) : '(empty)'}`);
    // noWaitAfter: the response page (~1.8 MB of inline flag images) never reaches "load"; a default
    // click would wait for that navigation and time out (run of 2026-09-10 15:53).
    await next.scrollIntoViewIfNeeded().catch(() => {});
    await next.click({ timeout: CommonUtils.waitTimes.abnormalWait, noWaitAfter: true });
    let step = await this.waitForNextShopStep(CommonUtils.waitTimes.reAssignationWait);
    if (!step) {
      console.log(`  - Next did not switch step within ${CommonUtils.waitTimes.reAssignationWait / 1000}s (url ${this.page.url()}) - retrying with Enter on the button`);
      await next.focus().catch(() => {});
      await next.press('Enter', { noWaitAfter: true, timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      step = await this.waitForNextShopStep(CommonUtils.waitTimes.reAssignationWait);
    }
    if (!step) {
      console.log(`  - Still on the calculator (url ${this.page.url()}) - last resort: submitting #calc_form through its own submit event`);
      await this.calculatorForm().evaluate((form) => (form as HTMLFormElement).requestSubmit()).catch(() => {});
      step = await this.waitForNextShopStep(CommonUtils.waitTimes.pageLoad);
    }
    if (!step) throw new Error(`The calculator "Next" showed neither the address form nor the payment form (url ${this.page.url()})`);
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log(`  - Calculator Next -> ${step} step (${this.page.url()})`);
    return step;
  }

  /**
   * Wait until the address step or the payment step is on screen; '' when neither shows in time.
   * The shop's response pages are slow (the address page alone is ~1.8 MB), and a locator probe issued
   * while the document is being replaced blocks until the new document arrives - so first wait for
   * DOMContentLoaded, then race two bounded waitFor(visible) calls on controls that DO have a box
   * (a <form> reads as hidden even when its fields are on screen - run of 2026-09-10 16:23).
   */
  private async waitForNextShopStep(timeout: number): Promise<'address' | 'payment' | ''> {
    await this.page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
    let deadline = Date.now() + timeout;
    let extended = false;
    while (Date.now() < deadline) {
      // Once the shop has left the calculator (/shop/address, /shop/confirm_order -> /shop/payment) the
      // submit DID go through; give the slow server-side redirect the full page-load budget.
      if (!extended && /\/shop\/(address|confirm_order|payment)/.test(this.page.url())) {
        extended = true;
        deadline = Date.now() + CommonUtils.waitTimes.pageLoad;
        console.log(`  - Shop moved on to ${this.page.url()} - waiting for the step to render`);
      }
      // Each probe is bounded (1 s) so a document swap can never park the loop past the deadline.
      const payment = await this.shopPayButton()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.standard }).then(() => true).catch(() => false);
      if (payment) return 'payment';
      const address = await this.addressInput('first_name')
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.standard }).then(() => true).catch(() => false);
      if (address) return 'address';
    }
    return '';
  }

  private readonly addressForm = () =>
    this.page.locator("xpath=//form[@action='/shop/address']").or(this.page.locator('form[action="/shop/address"]')).first();

  /** Poll page.url() until it matches, without depending on the browser "load" event. */
  private async waitForUrlPattern(pattern: RegExp, timeout: number): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (pattern.test(this.page.url())) {
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        return true;
      }
      await this.wait(CommonUtils.waitTimes.standard);
    }
    return pattern.test(this.page.url());
  }

  /**
   * Fill the new end-user address. Country and State are custom dropdowns backed by hidden inputs:
   * pick the country item by res.country id, wait for the state list to load, then pick the state.
   * @returns the hidden country / state ids that ended up in the form
   */
  async fillEndUserAddress(addr: ShopEndUserAddress): Promise<{ countryId: string; stateId: string }> {
    const title = this.countryDropdownTitle();
    await title.scrollIntoViewIfNeeded().catch(() => {});
    await title.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
    await this.countryItem(addr.countryId).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.extraLong); // state list loads for the country
    const stateCount = await this.stateItems().count().catch(() => 0);
    console.log(`  - Country ${addr.countryId} picked; ${stateCount} states loaded`);
    if (stateCount > 0) {
      await this.stateDropdownTitle().click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.medium);
      const wanted = addr.stateName ? this.stateItems().filter({ hasText: addr.stateName }).first() : this.stateItems().first();
      const found = await wanted.count().catch(() => 0);
      await (found ? wanted : this.stateItems().first()).click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.medium);
    }
    await this.addressInput('first_name').fill(addr.firstName);
    await this.addressInput('last_name').fill(addr.lastName);
    await this.addressInput('email').fill(addr.email);
    await this.addressInput('phone').fill(addr.phone);
    if (addr.company) await this.addressInput('end_user_company').fill(addr.company).catch(() => {});
    await this.addressInput('street').fill(addr.street);
    await this.addressInput('city').fill(addr.city);
    if (addr.zip) await this.addressInput('zip').fill(addr.zip).catch(() => {});
    const countryId = (await this.countryHiddenInput().inputValue().catch(() => '')) || '';
    const stateId = (await this.stateHiddenInput().inputValue().catch(() => '')) || '';
    console.log(`  - Address filled: country_id=${countryId} state_id=${stateId}`);
    return { countryId, stateId };
  }

  /** Press the address form's Next and land on /shop/payment. Throws with the form errors if it stays. */
  async clickAddressNext(): Promise<void> {
    await this.addressNextButton().click({ timeout: CommonUtils.waitTimes.abnormalWait, noWaitAfter: true });
    const reached = await this.waitForUrlPattern(/\/shop\/payment/, CommonUtils.waitTimes.pageLoad);
    if (!reached) {
      const errors = (await this.addressErrors().allTextContents().catch(() => [] as string[]))
        .map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
      throw new Error(`The address form did not reach /shop/payment (still ${this.page.url()}); form errors: ${errors.join(' | ') || '(none shown)'}`);
    }
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log(`  - Address Next -> ${this.page.url()}`);
  }

  /** The website Sale Order named on the payment page ("Your order: SO######"); '' when absent. */
  async getOrderNameOnPaymentPage(): Promise<string> {
    const text = (await this.page.locator('body').textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '';
    const match = text.replace(/\s+/g, ' ').match(/Your order:\s*(SO\d+)/i);
    return match ? match[1] : '';
  }

  /**
   * The order lines + totals block of /shop/payment as one normalised text line (starts at "Order:").
   * Used to log what is about to be paid and to read the grand total.
   */
  async getOrderSummaryOnPaymentPage(): Promise<string> {
    const text = ((await this.page.locator('body').textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
      .replace(/\s+/g, ' ');
    const start = text.indexOf('Order:');
    return start >= 0 ? text.slice(start, start + 1200).trim() : '';
  }

  /**
   * The grand total shown on /shop/payment as a number (currency symbol and thousands separators
   * stripped). A total <= 0 means the cart is being eaten by promotion programs and Stripe will refuse
   * the payment - the caller must assert it is positive before pressing Pay.
   * @returns the total, or NaN when no "Total" figure could be read
   */
  async getOrderTotalOnPaymentPage(): Promise<number> {
    const summary = await this.getOrderSummaryOnPaymentPage();
    const matches = [...summary.matchAll(/Total[^\d\-]{0,12}(-?\s?[\d,]+(?:\.\d+)?)/gi)];
    if (!matches.length) return NaN;
    const raw = matches[matches.length - 1][1].replace(/[\s,]/g, '');
    const total = parseFloat(raw);
    console.log(`  - /shop/payment order total: ${Number.isNaN(total) ? '(unreadable)' : total}`);
    return total;
  }

  /** The account.invoice id carried by a portal invoice URL (/my/invoices/<id>?access_token=...), or ''. */
  invoiceIdFromPortalUrl(url: string): string {
    const match = url.match(/\/my\/invoices\/(\d+)/);
    return match ? match[1] : '';
  }

  /** Select the Stripe card acquirer on /shop/payment (the radio sits outside #pay_with here). */
  async selectStripeOnShopPayment(): Promise<string> {
    await this.shopPaymentForm().waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    const radio = this.shopStripeRadio();
    await radio.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    await radio.check({ force: true }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long); // Stripe Elements mount
    const value = (await radio.getAttribute('value').catch(() => '')) || '';
    console.log(`  - Shop payment acquirer selected: ${value}`);
    return value;
  }

  /** Press "Pay" on /shop/payment. Does NOT wait for the outcome - pair with waitForPaymentToLeaveTheForm(). */
  async clickShopPay(): Promise<void> {
    const button = this.shopPayButton();
    await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await button.click({ timeout: CommonUtils.waitTimes.abnormalWait, noWaitAfter: true });
    console.log('  - Pressed "Pay" on /shop/payment');
  }

  /**
   * After Pay the portal goes through /payment/process (which polls the transaction) and then lands on
   * the shop confirmation. Wait until that intermediate page is gone and return the landing URL + text.
   */
  async waitForShopOrderConfirmation(maxRounds: number = 10): Promise<{ url: string; text: string }> {
    for (let round = 1; round <= maxRounds; round++) {
      const url = this.page.url();
      if (!/\/payment\/process|\/shop\/payment/.test(url)) break;
      await this.wait(CommonUtils.waitTimes.extraLong);
    }
    await this.wait(CommonUtils.waitTimes.long);
    const text = ((await this.page.locator('body').textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
      .replace(/\s+/g, ' ').trim();
    console.log(`  - Shop order confirmation landed on ${this.page.url()}`);
    return { url: this.page.url(), text };
  }
}
