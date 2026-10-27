import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Deal Element Page Object (Sale Order)
 * Handles interactions with Deal Element/Sale Order forms
 */
export class DealElementPage extends BasePage {
  // Form locators
  private readonly formView = () => this.page.locator('.o_form_view');
  private readonly pricelistInput = () => this.page.getByRole('textbox', { name: /Pricelist/i }).or(this.page.locator('input[name="pricelist_id"]')).first();
  private readonly paymentTermInput = () => this.page.getByRole('textbox', { name: /Payment Term/i }).first();
  private readonly addProductButton = () => this.page.getByRole('button', { name: 'Add a product' });
  /** Odoo renders the x2many row adder as an ANCHOR; the role=button lookup does not always resolve
   *  it on the O12 CE backend theme. XPath primary, CSS fallback. */
  private readonly addProductLink = () =>
    this.page.locator('xpath=//a[normalize-space()="Add a product"] | //div[contains(@class,"o_field_x2many_list_row_add")]//a')
      .or(this.page.locator('.o_field_x2many_list_row_add a'))
      .first();
  private readonly productInput = () => this.page.locator('.o_data_cell > .o_field_widget > .o_input_dropdown > .o_input').first();
  private readonly dropdownOption = () => this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  private readonly qtyInput = () => this.page.locator('input[name="product_uom_qty"]').first();
  private readonly firstProductRow = () => this.page.locator('xpath=//tr[contains(@class,"o_data_row")][1]');
  // `.//` keeps the search INSIDE the first order-line row - a leading `//` is document-absolute even
  // when chained off a row locator, which read an unrelated (empty) product_id node.
  private readonly firstProductNameField = () => this.firstProductRow().locator('xpath=.//*[@name="product_id"]').first();
  private readonly orderLineRows = () => this.page.locator('[name="order_line"] .o_data_row');
  private readonly lastRowQtyInput = () => this.orderLineRows().last().locator('xpath=//input[@name="product_uom_qty"]');
  private readonly lastRowUoMInput = () => this.orderLineRows().last().locator('xpath=//div[@name="product_uom"]//input');
  private readonly saveButton = () => this.page.locator("xpath=(//button[normalize-space(.)='Save' or normalize-space(.)='SAVE'])[1]").first();
  private readonly saveButtonDisabled = () => this.page.locator('button.o_form_button_save:disabled');
  private readonly editButtonLoc = () => this.page.locator("xpath=//button[normalize-space(.)='Edit' or normalize-space(.)='EDIT']").first();
  private readonly formEditable = () => this.page.locator('.o_form_editable');
  private readonly paymentTermRow = () => this.page.locator('tr').filter({ hasText: /Payment Term/i });
  private readonly payerInput = () => this.page.locator('xpath=//div[@name="partner_id"]//input').first();
  private readonly payerLabel = () => this.page.locator('xpath=//label[text()="Payer"]').first();
  private readonly endUserInput = () => this.page.locator('xpath=//div[@name="partner_end_user_id"]//input').first();
  private readonly distributorInput = () => this.page.locator('xpath=//div[@name="distributor_id"]//input').first();
  private readonly resellerInput = () => this.page.locator('xpath=//div[@name="reseller_id"]//input').first();
  private readonly invoiceAddressInput = () => this.page.locator('xpath=//div[@name="partner_invoice_id"]//input').first();
  private readonly deliveryAddressInput = () => this.page.locator('xpath=//div[@name="partner_shipping_id"]//input').first();
  private readonly validityInput = () => this.page.locator('xpath=//div[@name="validity_date"]//input | //input[@name="validity_date"]').first();
  // Validation error notification (right-side toast for required-field errors)
  private readonly validationErrorNotification = () =>
    this.page.locator("xpath=//div[contains(@class,'o_notification')]//div[contains(@class,'o_notification_content') or contains(@class,'o_notification_body')] | //div[contains(@class,'o_notification') and contains(.,'The following fields are invalid')]").first();
  // Breadcrumb link back to the parent Opportunity from within a Sale Order form
  private readonly breadcrumbOppLinkXPath = () =>
    this.page.locator("xpath=//li[contains(@class,'breadcrumb-item o_back_button')]/a").first();
  // Chatter / log thread on the Deal Element form (XPath primary, CSS fallback)
  private readonly chatterThread = () =>
    this.page
      .locator("xpath=//*[contains(@class,'o_mail_thread') or contains(@class,'o-mail-Thread') or contains(@class,'o_thread_message_content')]")
      .or(this.page.locator('.o_mail_thread, .o-mail-Thread, .o_thread_message_content'));

  constructor(page: Page) {
    super(page);
  }

  /**
   * Wait for Deal Element form to open
   */
  async waitForFormOpen() {
    await this.wait(3000);
    await this.waitForURL('**/web?*model=sale.order*', CommonUtils.waitTimes.pageLoad).catch(() => {
      console.log('  ⚠ URL did not change to sale.order model - checking for form load');
    });
    await this.formView().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
  }

  /**
   * Wait for fields to auto-populate from Opportunity
   */
  async waitForAutoPopulate() {
    await this.wait(3000);
    console.log('  - Waited for fields to auto-populate from Opportunity');
  }

  /**
   * Select Pricelist
   * @param pricelist - Pricelist name (e.g., "Public Pricelist_USD")
   * @returns true if set successfully, false otherwise
   */
  async selectPricelist(pricelist: string): Promise<boolean> {
    try {
      console.log('  - Checking Pricelist field...');
      const input = this.pricelistInput();
      const exists = await input.count() > 0;
      
      if (!exists) {
        console.log('  - Pricelist: Field not found, skipping');
        return false;
      }

      const currentValue = await input.inputValue().catch(() => '');
      if (currentValue && currentValue.includes(pricelist)) {
        console.log(`  - Pricelist: Already set to "${currentValue}" (skipping)`);
        return true;
      }

      console.log(`  - Pricelist: Current value "${currentValue}", updating...`);
      await input.click();
      await input.fill(pricelist);
      await this.wait(1000);
      
      const option = this.dropdownOption().filter({ hasText: new RegExp(pricelist, 'i') }).first();
      const optionVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
      
      if (optionVisible) {
        await option.click();
        console.log(`  - Pricelist: Set to ${pricelist}`);
        await this.wait(2000); // Wait for onchange events
        return true;
      } else {
        console.log('  - Pricelist: Typed but dropdown not found');
        return false;
      }
    } catch (error) {
      console.log(`  - Pricelist error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Select Payment Term
   * @param paymentTerm - Payment term name (e.g., "Immediate Payment", "15 Days")
   * @returns true if set successfully, false otherwise
   */
  async selectPaymentTerm(paymentTerm: string): Promise<boolean> {
    try {
      console.log(`  - Setting Payment Term to ${paymentTerm}...`);
      const input = this.paymentTermInput();
      await input.click();
      await input.fill(paymentTerm);
      await this.wait(1000);
      
      const option = this.dropdownOption().filter({ hasText: paymentTerm }).first();
      const optionVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
      
      if (optionVisible) {
        await option.click();
        console.log(`  - Payment Term: Set to ${paymentTerm}`);
        return true;
      } else {
        console.log('  - Payment Term: Typed but dropdown not found');
        return false;
      }
    } catch (error) {
      console.log(`  - Payment Term error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Add a product to Order Lines
   * @param productName - Product name or pattern to search (e.g., "NAKIVO Backup")
   * @returns true if added successfully, false otherwise
   */
  async addProduct(productName: string): Promise<boolean> {
    try {
      // Bounded click with an anchor fallback: an untimed click() here retries until the whole TEST
      // times out (15 min burned on CRM-12370_4.1.1 with not a single log line), so fail in seconds
      // and say what the screen was showing instead.
      let clicked = await this.addProductButton()
        .click({ timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        clicked = await this.addProductLink()
          .click({ timeout: CommonUtils.waitTimes.abnormalWait })
          .then(() => true)
          .catch(() => false);
        console.log(`  - "Add a product": role=button not clickable, anchor fallback ${clicked ? 'worked' : 'failed'}`);
      }
      if (!clicked) {
        const blocking = (await this.getBlockingPopupText().catch(() => '') || '').replace(/\s+/g, ' ').trim();
        const adderCount = await this.addProductLink().count().catch(() => 0);
        throw new Error(
          `"Add a product" could not be clicked (adder elements found: ${adderCount})` +
          (blocking ? ` - a blocking dialog is open: "${blocking.substring(0, 160)}"` : ' - no blocking dialog on screen')
        );
      }
      console.log('  - Clicked "Add a product"');

      // Target the product_id input of the new empty row (last order line row)
      const newRowInput = this.orderLineRows().last().locator('[name="product_id"] input');
      await newRowInput.click();
      await this.wait(1000);

      // Escape regex special characters so product names like "[A2145B]" match literally
      const escapedName = productName.replace(/[[\]\\^$.|?*+(){}]/g, '\\$&');
      const option = this.dropdownOption().filter({ hasText: new RegExp(escapedName, 'i') }).first();
      const productVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
      
      if (productVisible) {
        await option.click();
        console.log(`  - Selected product: ${productName}`);
        return true;
      } else {
        console.log('  - Product dropdown not visible, trying to type product name');
        await newRowInput.fill(productName);
        await this.wait(1000);
        await this.page.keyboard.press('Enter');
        // Quoc Anh: Wait for product to be added to the order lines after pressing Enter
        await this.wait(CommonUtils.waitTimes.standard);
        console.log(`  - Typed product name and pressed Enter: ${productName}`);
        return true;
      }
    } catch (error) {
      console.log(`  - Add product error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Add ONE order line by SKU and set its Ordered Qty, in a single pass.
   *
   * Why this exists next to `addProduct`: that one CLICKS the empty product input and then waits up
   * to `abnormalWait` (30 s) for a dropdown option carrying the full product name. An unfiltered
   * Odoo m2o dropdown only offers the first few products, so for a SKU like `CP-NC-PM-ENT` the
   * option can never appear - the wait always burns its full 30 s before falling through to the
   * type-and-Enter branch. On screen that reads as "it picked some other product first", because the
   * unfiltered list is what is showing for those 30 seconds.
   *
   * Here the SKU is TYPED FIRST, so the dropdown is already filtered to it, and the wait is short
   * and meaningful: if the filtered option does not appear the SKU is genuinely not selectable, and
   * that is worth failing on rather than hiding behind a blind Enter.
   *
   * `addProduct` is left exactly as it is - the existing specs that call it keep their behaviour.
   *
   * @param sku      - the SKU or search term, e.g. "CP-NC-PM-ENT"
   * @param quantity - Ordered Qty to set on the row; omit to leave it at the default
   * @returns the product label the row ended up carrying
   */
  async addProductBySku(sku: string, quantity?: number): Promise<string> {
    let clicked = await this.addProductButton()
      .click({ timeout: CommonUtils.waitTimes.abnormalWait })
      .then(() => true)
      .catch(() => false);
    if (!clicked) {
      clicked = await this.addProductLink()
        .click({ timeout: CommonUtils.waitTimes.abnormalWait })
        .then(() => true)
        .catch(() => false);
    }
    if (!clicked) {
      const blocking = (await this.getBlockingPopupText().catch(() => '') || '').replace(/\s+/g, ' ').trim();
      throw new Error(
        '"Add a product" could not be clicked' +
        (blocking ? ` - a blocking dialog is open: "${blocking.substring(0, 160)}"` : ' - no blocking dialog on screen')
      );
    }

    const row = this.orderLineRows().last();
    const input = row.locator('[name="product_id"] input');
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill(sku);

    const escaped = sku.replace(/[[\]\\^$.|?*+(){}]/g, '\\$&');
    const option = this.dropdownOption().filter({ hasText: new RegExp(escaped, 'i') }).first();
    const picked = await option
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.long })
      .then(() => true)
      .catch(() => false);
    if (picked) {
      await option.click();
      console.log(`  - Product: "${sku}" picked from the filtered dropdown`);
    } else {
      await this.page.keyboard.press('Enter');
      console.log(`  - Product: "${sku}" - no filtered option appeared, fell back to Enter`);
    }
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});

    if (quantity !== undefined) {
      await this.setLastRowQty(quantity);
    }

    const label = await this.getFirstProductName().catch(() => '');
    return label;
  }

  /**
   * Set product quantity for the first product in Order Lines
   * @param quantity - Quantity to set
   * @param waitTime - Wait time after setting quantity (default: 2000ms)
   */
  async setProductQuantity(quantity: number, waitTime: number = 2000): Promise<void> {
    console.log(`  - Setting Ordered Qty to ${quantity}...`);
    
    // Wait for product to be added and fields to populate
    await this.wait(waitTime);
    
    const qtyInput = this.qtyInput();
    await qtyInput.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await qtyInput.click();
    await qtyInput.fill(String(quantity));
    await this.page.keyboard.press('Enter');
    console.log(`  - Ordered Qty: Set to ${quantity}`);
    
    // Wait for price calculations to update
    await this.wait(waitTime);
  }

  /**
   * Set the Ordered Qty on the last order line row
   * @param quantity - Quantity to set (default: 1)
   */
  async setLastRowQty(quantity: number = 1): Promise<void> {
    console.log(`  - Setting last row Ordered Qty to ${quantity}...`);
    const input = this.lastRowQtyInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill(String(quantity));
    await this.page.keyboard.press('Tab');
    console.log(`  - Last row Ordered Qty: ${quantity}`);
  }

  /**
   * Set the Discount (%) on the last order line row.
   * Targets the discount input on the active edit row directly (no product-name span lookup), so it
   * works while the just-added row is in edit mode - unlike changeDiscountInRow (which needs the
   * readonly product span).
   * @param discount - Discount percentage to set
   */
  async setLastRowDiscount(discount: number): Promise<void> {
    console.log(`  - Setting last row Discount % to ${discount}...`);
    const input = this.orderLineRows().last().locator('xpath=//input[@name="discount"]').first();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ clickCount: 3 });
    await input.fill(String(discount));
    await this.page.keyboard.press('Tab');
    console.log(`  - Last row Discount %: ${discount}`);
  }

  /**
   * Position of an order-line column, resolved from its HEADER text.
   *
   * Readonly cells carry no `name` attribute, so a saved row can only be addressed positionally.
   * THROWS with the headers it actually read rather than returning -1, so a renamed or missing
   * column fails loudly instead of silently reading the wrong cell.
   */
  private async orderLineColumnIndex(headerText: string): Promise<number> {
    const headers = await this.page
      .locator('[name="order_line"] thead th')
      .allTextContents()
      .catch(() => [] as string[]);
    const index = headers.findIndex((h) => h.trim().toLowerCase() === headerText.trim().toLowerCase());
    if (index < 0) {
      throw new Error(
        `Order line "${headerText}" column not found. Headers read: ` +
          headers.map((h) => `"${h.trim()}"`).join(' | ')
      );
    }
    return index;
  }

  /**
   * Set "End Date" on the last order line row.
   *
   * The Deal Element order line renders both a wrapper `div[name="end_date"]` and the editable
   * `input[name="end_date"]` (column 3, between "Start Date" and "Description") - measured on
   * pre-production 2026-10-16. The row is an EDITABLE LIST row, so the value is committed with
   * Tab, never Escape: Escape inside an Odoo editable row discards the whole row edit.
   *
   * @param mmddyyyy - date in the UI's MM/DD/YYYY format
   * @returns the value the field holds after the edit, so the caller can verify it stuck
   */
  async setLastRowEndDate(mmddyyyy: string): Promise<string> {
    console.log(`  - Setting last row End Date to ${mmddyyyy}...`);
    const row = this.orderLineRows().last();
    let input = row.locator('xpath=//input[@name="end_date"]').first();
    if (!(await input.isVisible({ timeout: CommonUtils.waitTimes.standard }).catch(() => false))) {
      // A row that was SAVED renders readonly cells; form-level EDIT alone does not turn them into
      // inputs - the ROW itself must be put into inline-edit mode by clicking the cell. A freshly
      // added row is already in edit mode, which is why this was not needed at first. Measured
      // 2026-10-16: without this click the input never appears and the wait burns its budget.
      const index = await this.orderLineColumnIndex('End Date');
      console.log('  - the row is readonly - clicking the "End Date" cell to enter inline edit mode');
      await row.locator('td').nth(index).click();
      await this.wait(CommonUtils.waitTimes.standard);
      input = row.locator('xpath=//input[@name="end_date"]').first();
    }
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ clickCount: 3 });
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.standard);
    await input.fill(mmddyyyy);
    await this.wait(CommonUtils.waitTimes.standard);
    await this.page.keyboard.press('Tab');
    await this.wait(CommonUtils.waitTimes.standard);
    const readBack = (await input.inputValue().catch(() => '')) || '';
    console.log(`  - Last row End Date: requested "${mmddyyyy}", field now reads "${readBack}"`);
    return readBack;
  }

  /**
   * Read "End Date" from the last order line row (empty string when the cell is blank).
   *
   * The cell renders TWO different ways and both must be handled: while the row is in EDIT mode it
   * is an `input[name="end_date"]` (an Odoo datepicker, `data-target="#datepicker<n>"`); once the
   * record is saved the row goes readonly and the input is gone, leaving only the cell's text.
   * Reading only the input made a saved 12/16/2026 come back as "" - measured 2026-10-16.
   */
  async getLastRowEndDate(): Promise<string> {
    const row = this.orderLineRows().last();
    const input = row.locator('xpath=//input[@name="end_date"]').first();
    if (await input.isVisible({ timeout: CommonUtils.waitTimes.standard }).catch(() => false)) {
      const edited = (await input.inputValue().catch(() => '')) || '';
      console.log(`  - Last row End Date reads (edit mode): "${edited}"`);
      return edited.trim();
    }
    // Readonly rows render the cell as a plain <td class="o_data_cell"> that carries NO name
    // attribute, so the field cannot be addressed by name - resolve the column by its HEADER text
    // instead (measured 2026-10-16: a saved 12/16/2026 read as "" through [name="end_date"]).
    const index = await this.orderLineColumnIndex('End Date');
    const text = ((await row.locator('td').nth(index).textContent().catch(() => '')) || '').trim();
    console.log(`  - Last row End Date reads (readonly, column ${index} "End Date"): "${text}"`);
    return text;
  }

  /**
   * Set the Unit of Measure on the last order line row
   * @param uom - UoM value to select (e.g. "Socket")
   */
  async setLastRowUoM(uom: string): Promise<void> {
    console.log(`  - Setting last row UoM to "${uom}"...`);
    const input = this.lastRowUoMInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill(uom);
    await this.wait(800);
    const option = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]')
      .filter({ hasText: new RegExp(`^${uom}$`, 'i') }).first();
    const optionVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (optionVisible) {
      await option.click();
      console.log(`  - Last row UoM: "${uom}" selected from dropdown`);
    } else {
      await this.page.keyboard.press('Enter');
      console.log(`  - Last row UoM: "${uom}" entered via keyboard`);
    }
  }

  /**
   * Add a product line and set Ordered Qty and Unit of Measure in one call
   * @param productName - Product name or code to search (e.g. "[A2144B]")
   * @param quantity    - Ordered Qty to set (default: 1)
   * @param uom         - Unit of Measure to select (e.g. "Socket"; omit to skip)
   */
  async addProductLine(productName: string, quantity: number = 1, uom?: string): Promise<void> {
    await this.addProduct(productName);
    console.log(`  \u2713 Product "${productName}" added`);
    await this.setLastRowQty(quantity);
    if (uom) {
      await this.setLastRowUoM(uom);
    }
    console.log(`  \u2713 Order line set: product="${productName}", qty=${quantity}${uom ? `, uom="${uom}"` : ''}`);
  }

  /**
   * Click the product cell in the order line row matching oldProductName and change it to newProductName.
   * @param oldProductName - Text to identify the row (e.g. "[A2144B]")
   * @param newProductName - New product to select (e.g. "[A2146C]")
   */
  async changeProductInRow(oldProductName: string, newProductName: string): Promise<void> {
    console.log(`  - Changing product "${oldProductName}" → "${newProductName}"...`);
    const row = this.page.locator(`xpath=//*[@name="order_line"]//*[contains(@class,'o_data_row') and contains(.,'${oldProductName}')]`).first();
    //await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

    // Step 1: Click the <td> cell with force:true to bypass the intercepting <a> link inside
    const productTd = this.page.locator(`xpath=//span[@name="product_id" and contains(text(),'${oldProductName}')]`).first();
    await productTd.click({ force: true });
    await this.wait(500);

    // Step 2: Delete the current value in the now-visible input
    const input = this.page.locator('xpath=//div[@name="product_id"]//input').first();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.press('Control+a');
    await input.press('Delete');

    // Step 3: Enter the new product name and select from dropdown
    await input.fill(newProductName);
    await this.wait(800);
    const option = this.page.locator("xpath=//*[contains(@class,'ui-menu-item') or contains(@class,'o_m2o_dropdown_option') or (self::li and @role='option')]")
      .filter({ hasText: new RegExp(newProductName.replace(/[\[\]]/g, '\\$&'), 'i') }).first();
    const optionVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (optionVisible) {
      await option.click();
      console.log(`  \u2713 Product changed to "${newProductName}" (dropdown)`);
    } else {
      await this.page.keyboard.press('Enter');
      console.log(`  \u2713 Product changed to "${newProductName}" (keyboard)`);
    }
  }

  /**
   * Check whether any order line row contains a given product name.
   * @param productName - Text to search for (e.g. "[A2144B]")
   * @returns true if found, false otherwise
   */
  async isProductInOrderLines(productName: string): Promise<boolean> {
    const row = this.orderLineRows().filter({ hasText: productName }).first();
    const found = await row.isVisible().catch(() => false);
    console.log(`  \u2713 Product "${productName}" in order lines: ${found}`);
    return found;
  }

  /**
   * Change the description of the order line row that matches the given product name.
   * Requires the form to already be in edit mode.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param description - New description text to set
   */
  async changeDescriptionInRow(productName: string, description: string): Promise<void> {
    console.log(`  - Setting description for row "${productName}" → "${description}"...`);

    // Step 1: Click the product name cell to activate/select the row
    const productCell = this.page.locator(
      `xpath=//span[@name="product_id" and contains(text(),'${productName}')]`
    ).first();
    await productCell.click({ force: true });
    await this.wait(500);
    console.log(`  - Clicked product cell "${productName}"`);

    // Step 2: Click the Description field on the same row
    const descCell = this.page.locator(
      `xpath=//textarea[@name="name"]`
    ).first();
    await descCell.click();
    await this.wait(500);
    console.log(`  - Clicked Description cell`);

    // Step 3 & 4: Clear current value and enter new description
    // descCell IS the textarea — triple-click selects all, then fill replaces it
    await descCell.click({ clickCount: 3 }); // triple-click to select all existing text
    await descCell.fill(description);
    console.log(`  \u2713 Description set to "${description}"`);
  }

  /**
   * Change the Ordered Qty field for a specific product row in the Order Lines.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param qty - New quantity value (as number)
   */
  async changeQtyInRow(productName: string, qty: number): Promise<void> {
    console.log(`  - Setting Ordered Qty for row "${productName}" → "${qty}"...`);

    // Step 1: Click the product name cell to activate/select the row
    const productCell = this.page.locator(
      `xpath=//span[@name="product_id" and contains(text(),'${productName}')]`
    ).first();
    await productCell.click({ force: true });
    await this.wait(500);
    console.log(`  - Clicked product cell "${productName}"`);

    // Step 2: Click the Ordered Qty input on the same row
    const qtyCell = this.page.locator(
      `xpath=//input[@name="product_uom_qty"]`
    ).first();
    await qtyCell.click();
    await this.wait(500);
    console.log(`  - Clicked Ordered Qty cell`);

    // Step 3 & 4: Clear current value and enter new qty
    await qtyCell.click({ clickCount: 3 }); // triple-click to select all existing text
    await qtyCell.fill(String(qty));
    console.log(`  \u2713 Ordered Qty set to "${qty}"`);
  }

  /**
   * Check whether the Ordered Qty cell of the order line row matching the given product
   * contains the expected quantity value.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param qty - Expected quantity value
   * @returns true if found, false otherwise
   */
  async isQtyInOrderLine(productName: string, qty: number): Promise<boolean> {
    const qtyCell = this.page.locator(
      `xpath=//td/span[@name="product_id" and contains(text(),'${productName}')]/ancestor::td/following-sibling::td[4]`
    ).first();
    const text = await qtyCell.innerText().catch(() => '');
    const found = text.trim() === String(qty);
    console.log(`  \u2713 Ordered Qty "${qty}" in row "${productName}": ${found} (got: "${text.trim()}")`);
    return found;
  }

  /**
   * Change the Unit of Measure field for a specific product row in the Order Lines.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param uom - New Unit of Measure value (e.g. "Database")
   */
  async changeUoMInRow(productName: string, uom: string): Promise<void> {
    console.log(`  - Setting Unit of Measure for row "${productName}" → "${uom}"...`);

    // Step 1: Click the product name cell to activate/select the row
    const productCell = this.page.locator(
      `xpath=//span[@name="product_id" and contains(text(),'${productName}')]`
    ).first();
    await productCell.click({ force: true });
    await this.wait(500);
    console.log(`  - Clicked product cell "${productName}"`);

    // Step 2: Click the Unit of Measure input on the same row
    const uomInput = this.page.locator(
      `xpath=//div[@name="product_uom"]//input`
    ).first();
    await uomInput.click();
    await this.wait(500);
    console.log(`  - Clicked Unit of Measure field`);

    // Step 3: Clear and type new UoM to trigger dropdown
    await uomInput.click({ clickCount: 3 });
    await uomInput.fill(uom);
    await this.wait(500);

    // Step 4: Select the matching option from the dropdown
    const uomOption = this.page.locator(
      `xpath=//ul[contains(@class,"ui-autocomplete") or contains(@class,"o_dropdown_menu")]//li[normalize-space()="${uom}"] | //div[contains(@class,"o_field_widget")]//li[normalize-space()="${uom}"]`
    ).first();
    await uomOption.click();
    console.log(`  \u2713 Unit of Measure set to "${uom}"`);
  }

  /**
   * Check whether the Unit of Measure cell of the order line row matching the given product
   * contains the expected UoM value.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param uom - Expected Unit of Measure value
   * @returns true if found, false otherwise
   */
  async isUoMInOrderLine(productName: string, uom: string): Promise<boolean> {
    const uomCell = this.page.locator(
      `xpath=//td/span[@name="product_id" and contains(text(),'${productName}')]/ancestor::td/following-sibling::td/span[@name="product_uom"]`
    ).first();
    const text = await uomCell.innerText().catch(() => '');
    const found = text.trim() === uom;
    console.log(`  \u2713 Unit of Measure "${uom}" in row "${productName}": ${found} (got: "${text.trim()}")`);
    return found;
  }

  /**
   * Change the Unit Price field for a specific product row in the Order Lines.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param price - New unit price value (as number)
   */
  async changeUnitPriceInRow(productName: string, price: number): Promise<void> {
    console.log(`  - Setting Unit Price for row "${productName}" → "${price}"...`);

    // Step 1: Click the product name cell to activate/select the row
    const productCell = this.page.locator(
      `xpath=//span[@name="product_id" and contains(text(),'${productName}')]`
    ).first();
    // bounded: the cell is a <span> only once the row has committed - on a row still in edit mode it is an
    // input and this locator matches nothing (an unbounded click then waits out the test timeout)
    await productCell.click({ force: true, timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(500);
    console.log(`  - Clicked product cell "${productName}"`);

    // Step 2: Click the Unit Price input on the same row
    const priceInput = this.page.locator(
      `xpath=//input[@name="price_unit"]`
    ).first();
    await priceInput.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(500);
    console.log(`  - Clicked Unit Price cell`);

    // Step 3 & 4: Clear current value and enter new price
    await priceInput.click({ clickCount: 3 }); // triple-click to select all existing text
    await priceInput.fill(String(price));
    console.log(`  \u2713 Unit Price set to "${price}"`);
  }

  /**
   * Set "End Date" on the Order Line row matching the given product.
   *
   * ADDRESSED BY HEADER TEXT, NOT BY FIELD NAME - and that is not a preference. Measured on
   * crm-mig (Odoo 12 CE, 2026-10-16): `sale.order.line.end_date` exists (type date, label
   * "End Date", writable), the Order Lines list renders START DATE and END DATE as its 3rd and 4th
   * columns, but an Odoo 12 list `<td>` carries NO `name` attribute, so `[name="end_date"]` cannot
   * reach the cell while the row is read-only. The column index is therefore resolved from the
   * `<th>` text, and the input is only addressed by name once the row is in edit mode, where the
   * datepicker widget does render one.
   *
   * THROWS RATHER THAN NO-OPS. The END DATE column carries `o_invisible_modifier` on this form, so
   * a setter that quietly did nothing when the column was hidden would hand the caller a green tick
   * for a date that was never set - the exact failure mode CRM-11806_1.5 already has. If the column
   * is absent or hidden, this says so and names what it saw.
   *
   * @param productName - product code identifying the row, e.g. "[CP-NC-O365]"
   * @param date - the date as the form renders it (MM/DD/YYYY on this instance)
   */
  async setEndDateOnOrderLine(productName: string, date: string): Promise<void> {
    console.log(`  - Setting End Date for row "${productName}" → "${date}"...`);
    await this.setOrderLineDateColumn(productName, 'End Date', date, 'end_date');
  }

  /**
   * Set "Start Date" on the Order Line row matching the given product.
   * Same mechanics and the same measurements as {@link setEndDateOnOrderLine}.
   */
  async setStartDateOnOrderLine(productName: string, date: string): Promise<void> {
    console.log(`  - Setting Start Date for row "${productName}" → "${date}"...`);
    await this.setOrderLineDateColumn(productName, 'Start Date', date, 'start_date');
  }

  /**
   * The shared mechanics behind the two Order Line date setters.
   *
   * @param productName  - product code identifying the row
   * @param headerText   - the column header exactly as the list prints it
   * @param date         - the value to type
   * @param fieldName    - the field the edit-mode input carries, used only as a fallback locator
   */
  private async setOrderLineDateColumn(
    productName: string,
    headerText: string,
    date: string,
    fieldName: string,
  ): Promise<void> {
    const table = this.page.locator('.o_field_x2many_list table, table.o_list_view').first();
    await table.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

    // 1. the column index, from the header row. Odoo 12 prints the label uppercased by CSS, so the
    //    comparison is case-insensitive and whitespace-tolerant.
    const headers = table.locator('thead th');
    const count = await headers.count();
    let columnIndex = -1;
    const seen: string[] = [];
    for (let i = 0; i < count; i++) {
      const label = (await headers.nth(i).innerText({ timeout: CommonUtils.waitTimes.long }).catch(() => '')).trim();
      seen.push(label);
      if (label.toLowerCase() === headerText.toLowerCase()) { columnIndex = i; break; }
    }
    if (columnIndex === -1) {
      throw new Error(
        `The Order Lines list has no "${headerText}" column, so nothing was set. ` +
        `Columns actually present: ${seen.filter(Boolean).map((s) => `"${s}"`).join(', ')}. ` +
        'On crm-mig this column carries o_invisible_modifier - check whether the form hid it rather ' +
        'than treating this as a selector problem.',
      );
    }
    console.log(`  - "${headerText}" is column ${columnIndex + 1} of ${count}`);

    // 2. activate the row, exactly as changeUnitPriceInRow does
    const productCell = this.page.locator(
      `xpath=//span[@name="product_id" and contains(text(),'${productName}')]`
    ).first();
    await productCell.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await productCell.click({ force: true });
    await this.wait(500);

    const row = this.page.locator('tr.o_data_row.o_selected_row').first();
    const hasSelectedRow = await row.count().catch(() => 0);
    if (!hasSelectedRow) {
      throw new Error(
        `Clicking "${productName}" did not put the Order Line row into edit mode, so "${headerText}" ` +
        'could not be typed. The form is most likely still in read mode - click EDIT first.',
      );
    }

    // 3. the cell in that row, at the index the header gave us
    const cell = row.locator('td.o_data_cell').nth(columnIndex - await this.leadingNonDataCells(row));
    if (!(await cell.count().catch(() => 0))) {
      throw new Error(`Row "${productName}" has no cell under "${headerText}" (column ${columnIndex + 1}).`);
    }
    const hidden = await cell.evaluate(
      (el) => el.classList.contains('o_invisible_modifier') ||
              getComputedStyle(el).display === 'none',
    ).catch(() => false);
    if (hidden) {
      throw new Error(
        `The "${headerText}" cell on row "${productName}" is hidden (o_invisible_modifier), so the ` +
        'date cannot be typed into the form. This is a finding about the view, not a wait to extend.',
      );
    }
    await cell.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(300);

    // 4. the input the datepicker widget renders once the cell is active; by name when it has one
    const input = cell.locator(`input[name="${fieldName}"], input.o_datepicker_input, input`).first();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ clickCount: 3 });
    await input.fill(date, { timeout: CommonUtils.waitTimes.abnormalWait });
    // close the datepicker without letting it overwrite what was typed
    await input.press('Escape');
    await this.wait(300);

    const readBack = await input.inputValue({ timeout: CommonUtils.waitTimes.long }).catch(() => '');
    if (readBack.trim() !== date.trim()) {
      throw new Error(
        `"${headerText}" on row "${productName}" did not keep the typed value: asked for "${date}", ` +
        `the cell now reads "${readBack}". Check the instance's date format before widening this.`,
      );
    }
    console.log(`  ✓ ${headerText} set to "${date}" on row "${productName}"`);
  }

  /**
   * How many leading `<td>`s of a row are NOT data cells (Odoo 12 puts a handle/checkbox column in
   * front), so a header index can be mapped onto `td.o_data_cell` positions.
   */
  private async leadingNonDataCells(row: Locator): Promise<number> {
    return await row.evaluate((tr: HTMLElement) => {
      let n = 0;
      for (const td of Array.from(tr.children)) {
        if ((td as HTMLElement).classList.contains('o_data_cell')) break;
        n++;
      }
      return n;
    }).catch(() => 0);
  }

  /**
   * Check whether the Unit Price cell of the order line row matching the given product
   * contains the expected price value.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param price - Expected unit price value
   * @returns true if found, false otherwise
   */
  async isUnitPriceInOrderLine(productName: string, price: number): Promise<boolean> {
    const priceCell = this.page.locator(
      `xpath=//td/span[@name="product_id" and contains(text(),'${productName}')]/ancestor::td/following-sibling::td[6]`
    ).first();
    const text = await priceCell.innerText().catch(() => '');
    const found = parseFloat(text.trim().replace(/,/g, '')) === price;
    console.log(`  \u2713 Unit Price "${price}" in row "${productName}": ${found} (got: "${text.trim()}")`);
    return found;
  }

  /**
   * Change the Taxes field for a specific product row in the Order Lines.
   * Clears existing tags and selects a new tax by name.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param taxName - New tax value to select (e.g. "Tax 15.00%")
   */
  async changeTaxInRow(productName: string, taxName: string): Promise<void> {
    console.log(`  - Setting Taxes for row "${productName}" → "${taxName}"...`);

    // Step 1: Click the product name cell to activate/select the row
    const productCell = this.page.locator(
      `xpath=//span[@name="product_id" and contains(text(),'${productName}')]`
    ).first();
    await productCell.click({ force: true });
    await this.wait(500);
    console.log(`  - Clicked product cell "${productName}"`);

    // Step 2: Remove existing tax tags by clicking their delete buttons
    // const deleteTags = this.page.locator(`xpath=//div[@name="tax_id"]//span[contains(@class,"o_delete")]`);
    // const tagCount = await deleteTags.count().catch(() => 0);
    // for (let i = 0; i < tagCount; i++) {
    //   await deleteTags.first().click().catch(() => {});
    //   await this.wait(200);
    // }
    // console.log(`  - Cleared ${tagCount} existing tax tag(s)`);

    // Step 3: Click the Taxes input and type to search
    const taxInput = this.page.locator(`xpath=//div[@name="tax_id"]//input`).first();
    await taxInput.click();
    await this.wait(300);
    await taxInput.fill(taxName);
    await this.wait(500);

    // Step 4: Select the matching option from the dropdown
    const taxOption = this.page.locator(
      `xpath=//ul[contains(@class,"ui-autocomplete") or contains(@class,"o_dropdown_menu")]//li[contains(normalize-space(),"${taxName}")] | //div[contains(@class,"o_field_widget")]//li[contains(normalize-space(),"${taxName}")]`
    ).first();
    await taxOption.click();
    console.log(`  \u2713 Taxes set to "${taxName}"`);
  }

  /**
   * Check whether the Taxes cell of the order line row matching the given product
   * contains the expected tax name.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param taxName - Expected tax name (e.g. "Tax 15.00%")
   * @returns true if found, false otherwise
   */
  async isTaxInOrderLine(productName: string, taxName: string): Promise<boolean> {
    const taxCell = this.page.locator(
      `xpath=//td/span[@name="product_id" and contains(text(),'${productName}')]/ancestor::td/following-sibling::td//span[@title='${taxName}']`
    ).first();
    const text = await taxCell.innerText().catch(() => '');
    const found = text.includes(taxName);
    console.log(`  \u2713 Tax "${taxName}" in row "${productName}": ${found} (got: "${text.trim()}")`);
    return found;
  }

  /**
   * Change the Discount % field for a specific product row in the Order Lines.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param discount - New discount value (as number, e.g. 10 for 10%)
   */
  async changeDiscountInRow(productName: string, discount: number): Promise<void> {
    console.log(`  - Setting Discount % for row "${productName}" → "${discount}"...`);

    // Step 1: Click the product name cell to activate/select the row
    const productCell = this.page.locator(
      `xpath=//span[@name="product_id" and contains(text(),'${productName}')]`
    ).first();
    await productCell.click({ force: true, timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(500);
    console.log(`  - Clicked product cell "${productName}"`);

    // Step 2: Click the Discount input on the same row
    const discountInput = this.page.locator(
      `xpath=(//input[@name="discount"])[1]`
    ).first();
    await discountInput.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(500);
    console.log(`  - Clicked Discount % cell`);

    // Step 3 & 4: Clear current value and enter new discount
    await discountInput.click({ clickCount: 3 }); // triple-click to select all existing text
    await discountInput.fill(String(discount));
    console.log(`  \u2713 Discount % set to "${discount}"`);
  }

  /**
   * Check whether the Discount cell of the order line row matching the given product
   * contains the expected discount value.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param discount - Expected discount value (as number)
   * @returns true if found, false otherwise
   */
  async isDiscountInOrderLine(productName: string, discount: number): Promise<boolean> {
    const discountCell = this.page.locator(
      `xpath=//td/span[@name="product_id" and contains(text(),'${productName}')]/ancestor::td/following-sibling::td[9]`
    ).first();
    const text = await discountCell.innerText().catch(() => '');
    const found = parseFloat(text.trim().replace(/,/g, '')) === discount;
    console.log(`  \u2713 Discount "${discount}" in row "${productName}": ${found} (got: "${text.trim()}")`);
    return found;
  }

  /**
   * Get the Sub Total After All Discounts value displayed in the order line row for the given product.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @returns parsed numeric sub total, or 0 if not found
   */
  async getSubtotalAfterAllDiscountsForProduct(productName: string): Promise<number> {
    const subTotalAfterAllDiscountCell = this.page.locator(
      `xpath=//td/span[@name="product_id" and contains(text(),'${productName}')]/ancestor::td/following-sibling::td[14]`
    ).first();
    const text = await subTotalAfterAllDiscountCell.innerText({ timeout: 5000 }).catch(() => '0');
    const value = parseFloat(text.trim().replace(/[^0-9.,]/g, '').replace(/,/g, '')) || 0;
    console.log(`  - Sub Total After All Discounts for "${productName}": ${value} (got: "${text.trim()}")`);
    return value;
  }

  /**
   * Read the Unit Price ("Unit Price" column = price_unit) for the order line matching the given
   * product code. In readonly mode the value is bare text in following-sibling::td[6].
   * @param productName - product code to identify the row (e.g. "[A2149B]")
   * @returns parsed numeric unit price, or 0 if not found
   */
  async getUnitPriceForProduct(productName: string): Promise<number> {
    const cell = this.page.locator(
      `xpath=//td/span[@name="product_id" and contains(text(),'${productName}')]/ancestor::td/following-sibling::td[6]`
    ).first();
    const text = await cell.innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '0');
    const value = parseFloat(text.trim().replace(/[^0-9.,]/g, '').replace(/,/g, '')) || 0;
    console.log(`  - Unit Price for "${productName}": ${value} (got: "${text.trim()}")`);
    return value;
  }

  /**
   * Set the Ordered Qty on the order line matching the given product code. Clicks the product cell to
   * put the row into edit mode (so the qty input renders), then fills product_uom_qty and commits
   * with Tab. Mirrors changeUnitPriceInRow's row-activation pattern. Lets totals recompute (onchange).
   * @param productName - product code to identify the row (e.g. "[A2149B]")
   * @param quantity - the Ordered Qty to set
   */
  async changeQtyInRow(productName: string, quantity: number): Promise<void> {
    console.log(`  - Setting Ordered Qty for row "${productName}" -> ${quantity}...`);
    const productCell = this.page.locator(
      `xpath=//span[@name="product_id" and contains(text(),'${productName}')]`
    ).first();
    // Explicit timeout so a wrong (active-row) state fails fast instead of consuming the test budget.
    await productCell.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await productCell.click({ force: true, timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
    const qtyInput = this.page.locator('xpath=//input[@name="product_uom_qty"]').first();
    await qtyInput.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await qtyInput.click({ clickCount: 3 });
    await qtyInput.fill(String(quantity));
    await this.page.keyboard.press('Tab');
    await this.wait(CommonUtils.waitTimes.long); // let totals recompute (onchange)
    console.log(`  ✓ Ordered Qty for "${productName}" set to ${quantity}`);
  }

  /**
   * Get the total amount displayed at the bottom of the Order Lines section (Untaxed Amount / Total).
   * Reads the span[@name="amount_untaxed"] value. Falls back to span[@name="amount_total"] if not found.
   * @returns parsed numeric total, or 0 if not found
   */
  async getOrderLinesTotal(): Promise<number> {
    // Try untaxed amount first (sum of sub totals before tax)
    const untaxedLocator = this.page.locator(`xpath=//span[@name="amount_untaxed"]`).first();
    let text = await untaxedLocator.innerText().catch(() => '');
    if (!text.trim()) {
      // Fall back to grand total
      const totalLocator = this.page.locator(`xpath=//span[@name="amount_total"]`).first();
      text = await totalLocator.innerText().catch(() => '0');
    }
    const value = parseFloat(text.trim().replace(/[^0-9.,]/g, '').replace(/,/g, '')) || 0;
    console.log(`  - Order Lines Total: ${value} (got: "${text.trim()}")`);
    return value;
  }

  // --- Promotion fields on the Deal Element (sale.order) ---
  // CRM-10780 "Apply Promotion": an Automatically-Applied promo surfaces on the order as the computed
  // promo_discount_amount (and an applied promotion_id). These are read after the order qualifies/saves.
  private readonly promoDiscountAmount = () =>
    this.page.locator("xpath=//span[@name='promo_discount_amount'] | //*[@name='promo_discount_amount']").first();
  private readonly promotionIdField = () => this.page.locator("xpath=//div[@name='promotion_id']").first();
  private readonly promotionIdInput = () => this.page.locator("xpath=//div[@name='promotion_id']//input").first();

  /**
   * Read the computed promo discount amount (promo_discount_amount) on the order.
   * @returns the numeric discount, or 0 if the field is absent/empty.
   */
  async getPromoDiscountAmount(): Promise<number> {
    const loc = this.promoDiscountAmount();
    if ((await loc.count().catch(() => 0)) === 0) {
      console.log('  ⚠ promo_discount_amount field not found');
      return 0;
    }
    let text = (await loc.innerText().catch(() => '')) || '';
    if (!text.trim()) text = (await loc.inputValue().catch(() => '')) || '';
    const value = parseFloat(String(text).replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
    console.log(`  - promo_discount_amount: ${value} (got: "${String(text).trim()}")`);
    return value;
  }

  /**
   * Read the name of the applied promotion (promotion_id), if the field is present on the form.
   * @returns the applied promotion name, or '' if none.
   */
  async getAppliedPromotionName(): Promise<string> {
    const input = this.promotionIdInput();
    if (await input.count().catch(() => 0)) {
      const v = await input.inputValue().catch(() => '');
      if (v && v.trim()) { console.log(`  - promotion_id (input): "${v.trim()}"`); return v.trim(); }
    }
    // READ mode renders the field as <a>/<span name="promotion_id"> (an empty one as span.o_field_empty), not as
    // the edit-mode <div> - so address it by name whatever the tag, and bound the read: an unbounded innerText()
    // on a locator that matches nothing waits out the whole test timeout (Discount_1.11, 2026-10-20).
    let field = this.promotionIdField();
    if (!(await field.count().catch(() => 0))) field = this.page.locator('.o_form_sheet [name="promotion_id"]').first();
    if (!(await field.count().catch(() => 0))) {
      console.log('  - promotion_id: field not on the form');
      return '';
    }
    const t = ((await field.innerText({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`  - promotion_id (text): "${t}"`);
    return t;
  }

  /**
   * Apply a promotion: set the "Promotion" field (promotion_id, an editable Many2one while the form is
   * in edit mode) to the given promotion name, then pick it from the dropdown. After SAVE, the promo is
   * added as a discount line in Order Lines and the order total is reduced. (The form must be in edit
   * mode - e.g. right after adding a product line - because in readonly mode promotion_id is a <span>.)
   * @returns true if the field was found and set, false if its input is absent (form readonly).
   */
  async setPromotion(promoName: string): Promise<boolean> {
    const input = this.promotionIdInput();
    if ((await input.count().catch(() => 0)) === 0) {
      console.log('  ⚠ Promotion field input not found (form not in edit mode?)');
      return false;
    }
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.click();
    await input.fill(promoName);
    await this.wait(CommonUtils.waitTimes.long);
    const option = this.dropdownOption().filter({ hasText: promoName }).first();
    const optVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (optVisible) {
      await option.click();
      console.log(`  ✓ Promotion set to "${promoName}" (dropdown)`);
    } else {
      await this.page.keyboard.press('Enter');
      console.log(`  ✓ Promotion set to "${promoName}" (keyboard fallback)`);
    }
    await this.wait(CommonUtils.waitTimes.long); // let the discount line + totals recompute (onchange)
    return true;
  }

  /**
   * Read the grand total (amount_total) shown on the order.
   * @returns the numeric grand total, or 0 if not found.
   */
  async getAmountTotal(): Promise<number> {
    const loc = this.page.locator("xpath=//span[@name='amount_total']").first();
    const text = (await loc.innerText().catch(() => '0')) || '0';
    const value = parseFloat(text.trim().replace(/[^0-9.,]/g, '').replace(/,/g, '')) || 0;
    console.log(`  - amount_total: ${value} (got: "${text.trim()}")`);
    return value;
  }

  /**
   * Remove a product line row by clicking the trash bin icon on the row matching the given product name.
   * Must be in edit mode before calling this method.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   */
  async removeProductLineByName(productName: string): Promise<void> {
    console.log(`  - Removing product line "${productName}"...`);

    // Step 1: Click the trash bin icon on the line of productName
    const trashIcon = this.page.locator(
      `xpath=//td/span[@name="product_id" and contains(text(),'${productName}')]/ancestor::td/following-sibling::td/button[@name="delete"]`      
    ).first();
    await trashIcon.click();
    await this.wait(500);
    console.log(`  \u2713 Product line "${productName}" removed`);
  }

  /**
   * Check whether the description cell of the order line row matching the given product
   * contains the expected description text.
   * @param productName - Product name to identify the row (e.g. "[A2144B]")
   * @param description - Expected description text
   * @returns true if found, false otherwise
   */
  async isDescriptionInOrderLine(productName: string, description: string): Promise<boolean> {
    const descCell = this.page.locator(
      `xpath=//td/span[@name="product_id" and contains(text(),'${productName}')]/ancestor::td/following-sibling::td/span[@name="name"]`
    ).first();
    const text = await descCell.innerText().catch(() => '');
    const found = text.includes(description);
    console.log(`  \u2713 Description "${description}" in row "${productName}": ${found} (got: "${text.trim()}")`);
    return found;
  }

  /**
   * Get product name from the first added product
   * @returns Product name or 'first product' if not found
   */
  async getFirstProductName(): Promise<string> {
    try {
      const field = this.firstProductNameField();
      // Readonly row: the cell is a <span name="product_id"> that carries the product name as text.
      const text = ((await field.textContent().catch(() => '')) ?? '').trim();
      if (text) return text;
      // Edit mode: the cell is the many2one WIDGET (<div name="product_id"> wrapping an <input>), so
      // textContent() returns only the wrapper's whitespace - the name lives in the input's value.
      const value = ((await field.locator('input').first().inputValue().catch(() => '')) ?? '').trim();
      if (value) return value;
      return 'first product';
    } catch (error) {
      return 'first product';
    }
  }

  /**
   * Add a product line with quantity = 1
   * @param productName - Product name or pattern to search (empty string for first product)
   * @param waitTime - Wait time after adding product (default: CommonUtils.waitTimes.selectProductLine)
   * @returns Product name that was added
   */
  async addProductLineWithQuantity(productName: string = '', waitTime: number = 10000): Promise<string> {
    // Add product
    await this.addProduct(productName);
    const productText = await this.firstProductNameField().textContent().catch(() => 'first product');
    console.log(`  - Product added: ${productText}`);
    
    // Wait for product to be added and fields to populate
    await this.wait(waitTime);
    
    return productText || 'first product';
  }

  /**
   * Poll for proof that the Deal Element was written, using only NON-WAITING checks so the poll can
   * never outlive its budget.
   * @param budgetMs - hard time budget
   * @returns a short string naming the proof found, or '' when none appeared in time
   */
  private async waitForSavedProof(budgetMs: number): Promise<string> {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      if (await this.editButton().isVisible().catch(() => false)) return 'Edit button back';
      const recordId = this.getRecordIdFromUrl();
      if (recordId) return `record id ${recordId}`;
      const orderName = await this.readFieldTextByName('name').catch(() => '');
      if (/^[A-Z]{1,3}\d{3,}/.test(orderName)) return `sequence ${orderName}`;
      await this.wait(CommonUtils.waitTimes.standard);
    }
    return '';
  }

  /**
   * Save Deal Element
   * @param timeout - Maximum time to wait for save completion (default: 90000ms)
   */
  async save(timeout: number = 90000): Promise<void> {
    console.log('  - Looking for SAVE button');
    
    try {
      // Get button locator and wait for it to be visible within timeout
      const button = this.saveButton();
      await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear }).catch(() => {});
      
      // Check if button is now visible after waiting
      const buttonVisible = await button.isVisible().catch(() => false);
      
      if (buttonVisible) {
        console.log('  ✓ SAVE button found');
        await this.wait(500);
        await button.scrollIntoViewIfNeeded();
        // Quoc Anh: Save button is not stable, need to wait before clicking to avoid "Save failed" error
        await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear }).catch(() => {});
        await this.wait(CommonUtils.waitTimes.extraLong);
        // BOUNDED ON PURPOSE (2026-10-16). This was a bare `button.click()`, and `playwright.config.ts`
        // sets no `actionTimeout`, so Playwright's default (0 = forever) applied: when the button was
        // visible but not yet ACTIONABLE - still re-rendering, or covered by the sticky control panel -
        // the click never returned and the whole test died on its 900 s budget. That is how
        // CRM-11806_1.1 and 1.2 failed on 2026-10-16: the log reads "SAVE button found" and then
        // "Test timeout of 900000ms exceeded" at the click, with no error of its own. Bound it, settle
        // once, retry, and only then force - so an unclickable SAVE reports itself in seconds.
        await button.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(async (first: Error) => {
          console.log('  ⚠ SAVE was visible but not actionable; settling once and retrying');
          await this.wait(CommonUtils.waitTimes.standard * 5);
          await button.scrollIntoViewIfNeeded().catch(() => {});
          await button.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(async () => {
            console.log('  ⚠ still not actionable - clicking through whatever is covering it');
            await button.click({ force: true, timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {
              throw new Error(
                'The SAVE button is on the page but cannot be clicked, even forced. ' +
                `First attempt said: ${first.message.split('\n')[0]}`,
              );
            });
          });
        });
        await CommonUtils.waitForSpinnersToHide(this.page);
        console.log('  ✓ Clicked SAVE button successfully');

        // Quoc Anh: Check for Odoo server error/warning dialog after save (e.g. "Please create quotation from an Opportunity")
        const serverErrorDialog = this.page.locator('.o_dialog, .modal').filter({ hasText: /Odoo Server Error|Warning/i });
        const serverErrorVisible = await serverErrorDialog.isVisible({ timeout: 3000 }).catch(() => false);
        if (serverErrorVisible) {
          const errorText = await serverErrorDialog.textContent().catch(() => '');
          console.log(`  ✗ Odoo Server Error dialog detected: ${errorText?.trim()}`);
          await serverErrorDialog.getByRole('button', { name: /^OK$/i }).click().catch(() => {});
          throw new Error(`Odoo Server Error after Save: ${errorText?.trim()}`);
        }
        
        // Wait for Save button to disappear or become disabled
        await button.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.long }).catch(async () => {
          await this.saveButtonDisabled().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.long }).catch(() => {
            console.log('  ⚠ Save button did not disappear or become disabled - continuing');
          });
        });

        // Saved-signal, polled under a HARD budget. Three facts learned on the O12 CE Migration
        // server: (1) the form can stay in edit mode after a SUCCESSFUL write, so a hidden Edit
        // button proves nothing; (2) the hash can keep an EMPTY id=; (3) waiting on those signals
        // with waitFor()/waitForFunction() burned 13.6 min inside one step. So poll only with
        // NON-WAITING calls and give up on time, accepting whichever proof appears first:
        // Edit button back (pre-prod), a record id in the URL, or the sequence name Odoo assigns
        // on create (DE0200xx) - verified against DE020058 / DE020060 in the database.
        const savedProof = await this.waitForSavedProof(timeout);
        if (!savedProof) {
          // Capture WHAT the form is showing instead - on the O12 CE Migration server the record is
          // written server-side (verified: DE020058 / DE020060 / DE020072 exist with their order
          // line) while the client stays on the unsaved record: title "New", breadcrumb "/ New",
          // chatter "Creating a new record...". That is a finding for Dev, so state it precisely.
          const heading = (await this.page.locator('h1, .breadcrumb-item.active').first().textContent().catch(() => '') || '').trim();
          const chatter = (await this.getChatterText().catch(() => '')).slice(0, 120).replace(/\s+/g, ' ').trim();
          throw new Error(
            'SAVE did not complete in the UI: no Edit button, no record id in the URL and no sequence name. ' +
            `Form still shows "${heading}" (chatter: "${chatter}") - the record may exist server-side while the client stays on the unsaved form.`
          );
        }
        console.log(`  - Saved (proof: ${savedProof})`);
        await this.waitForFormSaved(10000);
        await CommonUtils.waitForSpinnersToHide(this.page);
      } else {
        console.log('  ✗ SAVE button not found or not visible');
        throw new Error('SAVE button not found or not visible on the page');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Error clicking SAVE button: ${errorMsg}`);
      throw error;
    }

    //Quoc Anh: Force to wait after press SAVE button to avoid quick click on other button. 
    await this.wait(CommonUtils.waitTimes.extraLong);
  }

  /**
   * Get Payment Term value from form
   * @returns Payment term value or null if not found
   */
  async getPaymentTermValue(): Promise<string | null> {
    try {
      const paymentTermRow = this.paymentTermRow();
      const paymentTermCell = paymentTermRow.locator('td').last();
      const exists = await paymentTermCell.count() > 0;

      if (exists) {
        const text = ((await paymentTermCell.textContent()) || '').trim();
        // A cell carrying only the label ("Payment Terms") is empty - the Mig sidebar theme keeps the
        // value in a sibling field span. Fall through to the field-name read in that case.
        if (text.replace(/^payment\s*terms?/i, '').trim()) return text;
      }
    } catch (error) {
      // fall through to the field-name read
    }
    const byFieldName = await this.readFieldTextByName('payment_term_id');
    return byFieldName || null;
  }

  /**
   * Click Edit button
   */
  async clickEdit(): Promise<void> {
    const button = this.editButtonLoc();
    await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await button.click();
    
    // Wait for form to become editable
    //await this.formEditable().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    //await this.wait(1000);
  }

  /**
   * Clear Payment Term field
   */
  async clearPaymentTerm(): Promise<void> {
    const input = this.paymentTermInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(500);
  }

  /**
   * Get the Payer field value from the Deal Element form
   * @returns The text content of the Payer field, or empty string if not found
   */
  async getPayerValue(): Promise<string> {
    try {
      const field = this.payerInput();
      const exists = await field.count() > 0;
      if (!exists) {
        console.log('  ⚠ Payer field not found');
        return '';
      }
      const value = await field.inputValue({ timeout: 10000 }).catch(() => '');
      console.log(`  ✓ Payer: "${value.trim()}"`);
      return value.trim();
    } catch {
      console.log('  ⚠ Payer field not visible or timed out');
      return '';
    }
  }

  /**
   * Set the End User (partner_end_user_id) on the Deal Element form.
   *
   * The field is REQUIRED and does NOT auto-fill from the Customer/Payer (CRM-4383 gotcha), so a
   * Deal Element left without it is refused by SAVE while the form stays on "New" - with no error
   * dialog, only a red field.
   *
   * THROWS when nothing was selected. A many2one that keeps text it never resolved looks filled on
   * screen but is invalid to Odoo; a silent return here is exactly what made an earlier
   * subscription-1.1 failure look like a CONFIRM defect when the record had simply never saved.
   *
   * @param searchText - partner to search for (must already exist; "Create ..." entries are skipped)
   * @returns the label of the option actually selected
   */
  async setEndUser(searchText: string): Promise<string> {
    const input = this.endUserInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(searchText);
    await this.wait(CommonUtils.waitTimes.long);

    // Scope to the VISIBLE autocomplete: Odoo 12 keeps one hidden <ul> per many2one in the DOM, and
    // an unscoped .first() resolves to a hidden list whose <a> never becomes clickable.
    const options = this.page.locator('.ui-autocomplete:visible li.ui-menu-item');
    await options.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});

    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const txt = ((await options.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (!txt || /^create\b/i.test(txt)) continue;
      await options.nth(i).click();
      await this.wait(CommonUtils.waitTimes.standard);
      console.log(`  ✓ End User set to "${txt}"`);
      return txt;
    }

    throw new Error(
      `End User "${searchText}" matched no existing partner (${count} autocomplete entries, all of them ` +
      '"Create ..." or empty). The Deal Element cannot be saved without a resolved End User.'
    );
  }

  /**
   * Get the End User field value from the Deal Element form
   * @returns The input value of the End User field, or empty string if not found
   */
  async getEndUserValue(): Promise<string> {
    try {
      const field = this.endUserInput();
      const exists = await field.count() > 0;
      if (!exists) {
        console.log('  ⚠ End User field not found');
        return '';
      }
      const value = await field.inputValue({ timeout: 10000 }).catch(() => '');
      console.log(`  ✓ End User: "${value.trim()}"`);
      return value.trim();
    } catch {
      console.log('  ⚠ End User field not visible or timed out');
      return '';
    }
  }

  /**
   * Get the Distributor field value from the Deal Element form
   * @returns The input value of the Distributor field, or empty string if not found
   */
  async getDistributorValue(): Promise<string> {
    try {
      const field = this.distributorInput();
      const exists = await field.count() > 0;
      if (!exists) {
        console.log('  ⚠ Distributor field not found');
        return '';
      }
      const value = await field.inputValue({ timeout: 10000 }).catch(() => '');
      console.log(`  ✓ Distributor: "${value.trim()}"`);
      return value.trim();
    } catch {
      console.log('  ⚠ Distributor field not visible or timed out');
      return '';
    }
  }

  /**
   * Get the Reseller field value from the Deal Element form
   * @returns The input value of the Reseller field, or empty string if not found
   */
  async getResellerValue(): Promise<string> {
    try {
      const field = this.resellerInput();
      const exists = await field.count() > 0;
      if (!exists) {
        console.log('  ⚠ Reseller field not found');
        return '';
      }
      const value = await field.inputValue({ timeout: 10000 }).catch(() => '');
      console.log(`  ✓ Reseller: "${value.trim()}"`);
      return value.trim();
    } catch {
      console.log('  ⚠ Reseller field not visible or timed out');
      return '';
    }
  }

  /**
   * Get the Invoice Address field value from the Deal Element form
   * @returns The input value of the Invoice Address field, or empty string if not found
   */
  async getInvoiceAddressValue(): Promise<string> {
    try {
      const field = this.invoiceAddressInput();
      const exists = await field.count() > 0;
      if (!exists) {
        console.log('  ⚠ Invoice Address field not found');
        return '';
      }
      const value = await field.inputValue({ timeout: 10000 }).catch(() => '');
      console.log(`  ✓ Invoice Address: "${value.trim()}"`);
      return value.trim();
    } catch {
      console.log('  ⚠ Invoice Address field not visible or timed out');
      return '';
    }
  }

  /**
   * Get the Pricelist field value from the Deal Element form
   * @returns The input value of the Pricelist field, or empty string if not found
   */
  async getPricelistValue(): Promise<string> {
    try {
      const field = this.pricelistInput();
      const exists = await field.count() > 0;
      if (!exists) {
        console.log('  ⚠ Pricelist field not found');
        return '';
      }
      const value = await field.inputValue({ timeout: 10000 }).catch(() => '');
      console.log(`  ✓ Pricelist: "${value.trim()}"`);
      return value.trim();
    } catch {
      console.log('  ⚠ Pricelist field not visible or timed out');
      return '';
    }
  }

  /**
   * Get the Delivery Address field value from the Deal Element form
   * @returns The input value of the Delivery Address field, or empty string if not found
   */
  async getDeliveryAddressValue(): Promise<string> {
    try {
      const field = this.deliveryAddressInput();
      const exists = await field.count() > 0;
      if (!exists) {
        console.log('  \u26a0 Delivery Address field not found');
        return '';
      }
      const value = await field.inputValue({ timeout: 10000 }).catch(() => '');
      console.log(`  \u2713 Delivery Address: "${value.trim()}"`);
      return value.trim();
    } catch {
      console.log('  \u26a0 Delivery Address field not visible or timed out');
      return '';
    }
  }

  /**
   * Clear the Payer (partner_id) field
   */
  async clearPayerField(): Promise<void> {
    const input = this.payerInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(300);
    await this.page.keyboard.press('Escape');
    await this.wait(300);
    console.log('  \u2713 Payer field cleared');
  }

  /**
   * Set the Payer (partner_id) Many2one field to the given partner/contact name.
   *
   * When the Deal Element opens, the Payer auto-populates with the Reseller (Assigned Partner).
   * This clears it and selects the given partner (e.g. the End User contact). The form must be in
   * edit mode (a freshly-opened/new Deal Element is). Uses the repo's canonical M2O pattern
   * (see OpportunityPage.setAssignedPartner / CLAUDE.md): clear, type, then press Enter PROMPTLY
   * while the autocomplete still holds the typed text + highlighted match - do NOT wait for / click
   * a rendered dropdown option (that races the autocomplete closed and Enter then clears the field).
   * Verifies the value took and retries once.
   * @param payerName - the partner/contact name to set as Payer (e.g. the End User contact name)
   */
  async setPayer(payerName: string): Promise<void> {
    console.log(`  - Setting Payer to "${payerName}"...`);
    const input = this.payerInput();
    for (let attempt = 1; attempt <= 2; attempt++) {
      await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await input.click();
      await input.fill('');
      await this.wait(CommonUtils.waitTimes.short);
      await input.fill(payerName);
      await this.wait(CommonUtils.waitTimes.long); // let the autocomplete fetch + highlight the match
      await this.page.keyboard.press('Enter');
      await this.wait(CommonUtils.waitTimes.long); // let the Payer onchange recompute (pricelist/addresses)
      const current = await input.inputValue().catch(() => '');
      if (current && current.includes(payerName)) {
        console.log(`  ✓ Payer set to "${current}" (attempt ${attempt})`);
        return;
      }
      console.log(`  ⚠ Payer not set on attempt ${attempt} (got "${current}") - retrying`);
    }
    console.log('  ⚠ Payer could not be set after 2 attempts');
  }

  /**
   * Set the Invoice Address (partner_invoice_id) Many2one to the given partner/contact name, using the
   * repo's canonical fill+Enter M2O pattern (robust variant of setInvoiceAddress, which uses the flaky
   * dropdown-click). When an invoice is created from the Sales Order, Odoo bills the SO's Invoice
   * Address - so to invoice the End User directly, this must point at the End User (not the Reseller).
   * Verifies and retries once. Form must be in edit mode.
   * @param name - the partner/contact name to set as Invoice Address
   */
  async setInvoiceAddressByName(name: string): Promise<void> {
    console.log(`  - Setting Invoice Address to "${name}"...`);
    const input = this.invoiceAddressInput();
    for (let attempt = 1; attempt <= 2; attempt++) {
      await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await input.scrollIntoViewIfNeeded().catch(() => {});
      await input.click();
      await input.fill('');
      await this.wait(CommonUtils.waitTimes.short);
      await input.fill(name);
      await this.wait(CommonUtils.waitTimes.long);
      await this.page.keyboard.press('Enter');
      await this.wait(CommonUtils.waitTimes.long);
      const current = await input.inputValue().catch(() => '');
      if (current && current.includes(name)) {
        console.log(`  ✓ Invoice Address set to "${current}" (attempt ${attempt})`);
        return;
      }
      console.log(`  ⚠ Invoice Address not set on attempt ${attempt} (got "${current}") - retrying`);
    }
    console.log('  ⚠ Invoice Address could not be set after 2 attempts');
  }

  /**
   * Clear the Pricelist (pricelist_id) field
   */
  async clearPricelistField(): Promise<void> {
    const input = this.pricelistInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ clickCount: 3 });
    await this.page.keyboard.press('Backspace');
    await this.wait(300);
    await this.page.keyboard.press('Escape');
    await this.wait(300);
    console.log('  \u2713 Pricelist field cleared');
  }

  /**
   * Clear the Invoice Address (partner_invoice_id) field
   */
  async clearInvoiceAddressField(): Promise<void> {
    const input = this.invoiceAddressInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(300);
    await this.page.keyboard.press('Escape');
    await this.wait(300);
    console.log('  \u2713 Invoice Address field cleared');
  }

  /**
   * Clear the Delivery Address (partner_shipping_id) field
   */
  async clearDeliveryAddressField(): Promise<void> {
    const input = this.deliveryAddressInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(300);
    await this.page.keyboard.press('Escape');
    await this.wait(300);
    console.log('  \u2713 Delivery Address field cleared');
  }

  /**
   * Set the Invoice Address field (partner_invoice_id)
   * @param address - Contact name to select from dropdown
   */
  async setInvoiceAddress(address: string): Promise<void> {
    const input = this.invoiceAddressInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(300);
    await input.fill(address);
    await this.wait(800);
    const option = this.dropdownOption().filter({ hasText: address }).first();
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await option.click().catch(async () => {
      await this.page.keyboard.press('Enter');
    });
    await this.wait(500);
    console.log(`  \u2713 Invoice Address set to "${address}"`);
  }

  /**
   * Set the Delivery Address field (partner_shipping_id)
   * @param address - Contact name to select from dropdown
   */
  async setDeliveryAddress(address: string): Promise<void> {
    const input = this.deliveryAddressInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    // Scroll into view and click to focus the field
    await input.scrollIntoViewIfNeeded();
    await input.click({ force: true });
    await this.wait(300);
    await input.fill('');
    await this.wait(300);
    await input.fill(address);
    await this.wait(1000);

    // Try clicking the first dropdown option that matches the address text
    const option = this.dropdownOption().filter({ hasText: address }).first();
    const optionVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (optionVisible) {
      await option.click({ force: true });
      await this.wait(500);
      console.log(`  \u2713 Delivery Address set to "${address}" (dropdown click)`);
      return;
    }

    // Fallback: ArrowDown to highlight first item, then Enter to select
    console.log('  \u26a0 Delivery Address dropdown option not found - trying ArrowDown+Enter');
    await this.page.keyboard.press('ArrowDown');
    await this.wait(300);
    await this.page.keyboard.press('Enter');
    await this.wait(500);
    console.log(`  \u2713 Delivery Address set to "${address}" (keyboard fallback)`);
  }

  /**
   * Type a Validity / Expiration date (validity_date) in the form's format, e.g. "12/10/2026" - edit mode. Enter commits
   * the typed value (the same way QuotationPage.setOrderDate commits Order Date).
   * @returns true when the input reads back the typed date
   */
  async setValidityDate(dateText: string): Promise<boolean> {
    console.log(`  - Setting Validity / Expiration = ${dateText}`);
    const input = this.validityInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ clickCount: 3 });
    await this.page.keyboard.press('Backspace');
    await input.fill(dateText, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.keyboard.press('Enter');
    await this.wait(CommonUtils.waitTimes.medium);
    const readBack = (await input.inputValue({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')).trim();
    console.log(`  - Validity / Expiration reads back as "${readBack}"`);
    return readBack === dateText;
  }

  /**
   * Clear the Validity date (validity_date) field
   */
  async clearValidityField(): Promise<void> {
    const input = this.validityInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ clickCount: 3 });
    await this.page.keyboard.press('Backspace');
    await this.wait(300);
    
    //Quoc Anh: Work around to make sure the field is cleared, because sometimes the datepicker widget can interfere with clearing the field and cause "Save failed" error due to invalid date format. Clicking the label will defocus the input and close the datepicker if it's open.
    const payerLabel = this.payerLabel();
    await payerLabel.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await payerLabel.click({ clickCount: 3 });
    
   
    //await this.page.keyboard.press('Escape');
    //await this.wait(800);
    console.log('  ✓ Validity field cleared');
  }

  /**
   * Get the Validity date field value from the Deal Element form
   * @returns The input value of the Validity field, or empty string if not found
   */
  async getValidityValue(): Promise<string> {
    try {
      const field = this.validityInput();
      const exists = await field.count() > 0;
      if (!exists) {
        console.log('  ⚠ Validity field not found');
        return '';
      }
      const value = await field.inputValue({ timeout: 10000 }).catch(() => '');
      console.log(`  ✓ Validity: "${value.trim()}"`);
      return value.trim();
    } catch {
      console.log('  ⚠ Validity field not visible or timed out');
      return '';
    }
  }

  /**
   * Get the number of product rows in the Order Lines section
   * @returns count of order line rows
   */
  async getOrderLineCount(): Promise<number> {
    try {
      await this.wait(1000);
      const count = await this.orderLineRows().count();
      console.log(`  ✓ Order line count: ${count}`);
      return count;
    } catch {
      console.log('  ⚠ Could not count order lines');
      return 0;
    }
  }

  /**
   * Click the breadcrumb link to navigate back to the parent Opportunity from a Sale Order form.
   * Waits for the CRM lead URL to load after clicking.
   */
  async clickBackToOpportunity(): Promise<void> {
    console.log('  - Clicking breadcrumb link back to Opportunity...');
    const link = this.breadcrumbOppLinkXPath();
    await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await link.click();
    await this.wait(2000);
    await this.waitForURL('**/web?*model=crm.lead*', CommonUtils.waitTimes.pageLoad).catch(() => {});
    console.log('  \u2713 Navigated back to Opportunity');
  }

  /**
   * Click SAVE button without waiting for form completion.
   * Use this when the save is expected to fail with a validation error.
   */
  async clickSaveForValidation(): Promise<void> {
    const button = this.saveButton();
    await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await button.click();
    await this.wait(2000);
    console.log('  \u2713 SAVE button clicked (validation scenario)');
  }

  /**
   * Get the validation error notification message text.
   * Returns the trimmed text of the first visible notification, or empty string if none.
   */
  async getValidationErrorMessage(): Promise<string> {
    try {
      const notification = this.validationErrorNotification();
      await notification.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      const text = await notification.textContent().catch(() => '');
      console.log(`  \u2713 Validation error message: "${text?.trim()}"`);
      return text?.trim() ?? '';
    } catch {
      console.log('  \u26a0 No validation error notification found');
      return '';
    }
  }

  /**
   * Read the full chatter / log thread text on the Deal Element form.
   * XPath primary, CSS fallback. Whitespace is normalised so multi-line log
   * messages match a single-space expected substring.
   */
  async getChatterText(): Promise<string> {
    const chatter = this.chatterThread();
    await chatter.first().waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const texts = await chatter.allTextContents().catch(() => [] as string[]);
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Verify the Quotation (Sale Order) was created after pressing "New quotation".
   *
   * On the Deal Element, "New quotation" creates the Sale Order in-place and logs it
   * in the chatter ("Sale Order created" plus the new record's "Status: Quotation")
   * instead of navigating to a separate page. Polls the chatter (no reload) until the
   * creation is logged or the timeout elapses.
   *
   * @param timeout - hard cap in ms for the polling (default: savingPage = 30s)
   * @returns { found, chatterText } - found=true once the creation is logged
   */
  async waitForQuotationCreatedInChatter(
    timeout: number = CommonUtils.waitTimes.savingPage
  ): Promise<{ found: boolean; chatterText: string }> {
    const attempts = Math.max(1, Math.floor(timeout / CommonUtils.waitTimes.standard));
    let chatterText = '';
    for (let attempt = 1; attempt <= attempts; attempt++) {
      chatterText = await this.getChatterText();
      if (/Sale Order created/i.test(chatterText) || /Status:\s*Quotation/i.test(chatterText)) {
        console.log(`  \u2713 Quotation creation logged in chatter after attempt ${attempt}`);
        return { found: true, chatterText };
      }
      await this.wait(CommonUtils.waitTimes.standard);
    }
    console.log('  \u26a0 Quotation creation not found in chatter within the timeout');
    return { found: false, chatterText };
  }

  // --------------------------------------------------------------------------
  // Structural readers - buttons, field labels, notebook tabs, order-line columns
  //
  // The CRM Deal Element test cases assert the SHAPE of the screen (which buttons
  // exist, which labels the information area carries and in which order, which
  // columns the Order Lines list has). Those reads live here because a .spec.ts
  // is not allowed to touch page.locator directly.
  // --------------------------------------------------------------------------

  /**
   * The control-panel buttons of the form, in screen order.
   * Read mode returns ["EDIT", "Action"]; edit mode returns ["SAVE", "DISCARD"].
   */
  async getControlPanelButtons(): Promise<string[]> {
    const panel = this.page.locator('.o_control_panel').first();
    await panel.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => {});
    return await panel
      .evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll('button, a.btn'))
          .filter((b) => !!((b as HTMLElement).offsetParent || b.getClientRects().length))
          .map((b) => ((b as HTMLElement).innerText || '').replace(/​/g, '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0)
      )
      .catch(() => [] as string[]);
  }

  /**
   * The buttons the form's own <header> renders above the sheet - on a saved Deal
   * Element that is the "NEW QUOTATION" action button.
   */
  async getStatusbarButtons(): Promise<string[]> {
    const bar = this.page.locator('.o_statusbar_buttons').first();
    await bar.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => {});
    if ((await bar.count()) === 0) return [];
    return await bar
      .evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll('button'))
          .filter((b) => !!((b as HTMLElement).offsetParent || b.getClientRects().length))
          .map((b) => ((b as HTMLElement).innerText || '').replace(/​/g, '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0)
      )
      .catch(() => [] as string[]);
  }

  /**
   * The VISIBLE field labels of the Deal Element information area, in form order.
   * Labels inside the notebook (Order Lines / Optional Products / Other Information)
   * are excluded, and so are the technical fields Odoo keeps hidden via attrs - the
   * result is exactly what a tester reads on the screen, top-left down then top-right
   * down.
   */
  async getVisibleFieldLabels(): Promise<string[]> {
    const sheet = this.page.locator('.o_form_sheet').first();
    await sheet.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await sheet
      .evaluate((el: HTMLElement) => {
        const notebook = el.querySelector('.o_notebook');
        return Array.from(el.querySelectorAll('label'))
          .filter((l) => !(notebook && notebook.contains(l)))
          .filter((l) => !!((l as HTMLElement).offsetParent || l.getClientRects().length))
          .map((l) => ((l as HTMLElement).innerText || '').replace(/​/g, '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0);
      })
      .catch(() => [] as string[]);
  }

  /** The notebook tab names, in order. */
  async getNotebookTabs(): Promise<string[]> {
    const notebook = this.page.locator('.o_notebook').first();
    await notebook.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await notebook
      .evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll('.nav-link'))
          .filter((a) => !!((a as HTMLElement).offsetParent || a.getClientRects().length))
          .map((a) => ((a as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0)
      )
      .catch(() => [] as string[]);
  }

  /** Bring the "Order Lines" notebook page to the front. */
  async clickOrderLinesTab(): Promise<void> {
    const tab = this.page.locator('.o_notebook .nav-link').filter({ hasText: /^Order Lines$/ }).first();
    if (await tab.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false)) {
      await tab.click().catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
    }
  }

  /**
   * The column headers of the Order Lines list, in order.
   * The leading drag-handle column carries no caption and is dropped, so the result
   * is the list of NAMED columns a tester reads on screen.
   */
  async getOrderLineColumns(): Promise<string[]> {
    const table = this.page.locator('.o_notebook .tab-pane.active table.o_list_view').first();
    await table.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await table
      .evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll('thead th'))
          .map((th) => ((th as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0)
      )
      .catch(() => [] as string[]);
  }

  /**
   * One Order Lines row read as { column caption -> cell text }.
   * Cells are zipped onto the header row, so a column that moved could not silently
   * shift a value onto its neighbour's assertion.
   */
  async getOrderLineRowCells(rowIndex: number = 0): Promise<Record<string, string>> {
    const table = this.page.locator('.o_notebook .tab-pane.active table.o_list_view').first();
    await table.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await table
      .evaluate((el: HTMLElement, index: number) => {
        const clean = (n: Element) => ((n as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
        const headers = Array.from(el.querySelectorAll('thead th')).map(clean);
        const row = el.querySelectorAll('tbody tr.o_data_row')[index];
        if (!row) return {} as Record<string, string>;
        const cells = Array.from(row.querySelectorAll('td')).map(clean);
        const out: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (h.length > 0) out[h] = cells[i] !== undefined ? cells[i] : '';
        });
        return out;
      }, rowIndex, { timeout: CommonUtils.waitTimes.elementVisibility })
      .catch(() => ({} as Record<string, string>));
  }

  /**
   * The horizontal alignment of one Order Lines row, read as
   * { column caption -> { header, cell } } where each value is the COMPUTED `text-align`.
   *
   * Two traps this normalises, so a reader never has to:
   *  - Chromium reports the INITIAL value of `text-align` as `start` / `end`, not as
   *    `left` / `right`. A cell the stylesheet never touched would therefore read `start`
   *    and could never be compared against a cell it styled `right`. Both are resolved
   *    against the element's own `direction` (LTR: start -> left, end -> right).
   *  - Odoo puts the alignment on the `<td>` / `<th>` itself (`.o_list_number` is what
   *    right-aligns a numeric column), so the computed style is read from the cell node,
   *    not from the widget inside it.
   *
   * Cells are zipped onto the header row by position, exactly as getOrderLineRowCells()
   * does, so a column that moved cannot silently shift an alignment onto its neighbour.
   * The leading drag-handle column carries no caption and is dropped.
   */
  async getOrderLineCellAlignments(
    rowIndex: number = 0
  ): Promise<Record<string, { header: string; cell: string }>> {
    const table = this.page.locator('.o_notebook .tab-pane.active table.o_list_view').first();
    await table.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await table
      .evaluate((el: HTMLElement, index: number) => {
        const clean = (n: Element) => ((n as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
        const align = (n: Element | undefined) => {
          if (!n) return '(missing)';
          const style = window.getComputedStyle(n as HTMLElement);
          const ltr = (style.direction || 'ltr') !== 'rtl';
          const value = (style.textAlign || '').trim();
          if (value === 'start') return ltr ? 'left' : 'right';
          if (value === 'end') return ltr ? 'right' : 'left';
          return value;
        };
        const headers = Array.from(el.querySelectorAll('thead th'));
        const row = el.querySelectorAll('tbody tr.o_data_row')[index];
        const cells = row ? Array.from(row.querySelectorAll('td')) : [];
        const out: Record<string, { header: string; cell: string }> = {};
        headers.forEach((th, i) => {
          const caption = clean(th);
          if (caption.length === 0) return;
          out[caption] = { header: align(th), cell: align(cells[i]) };
        });
        return out;
      }, rowIndex)
      .catch(() => ({} as Record<string, { header: string; cell: string }>));
  }

  /** How many data rows the Order Lines list currently renders. */
  async getOrderLineRowCount(): Promise<number> {
    const table = this.page.locator('.o_notebook .tab-pane.active table.o_list_view').first();
    await table.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await table
      .evaluate((el: HTMLElement) => el.querySelectorAll('tbody tr.o_data_row').length, undefined, { timeout: CommonUtils.waitTimes.elementVisibility })
      .catch(() => 0);
  }

  // --- Discount baseline (Discount_x.y): totals footer + settled order-line reads ---
  // The totals block under Order Lines (oe_subtotal_footer) carries discount = "Partner Discount(%)",
  // discount_money = "Partner Discount" and amount_total = "Total" (grounded on pre-prod 2026-10-20).
  private readonly subtotalFooterFieldXPath = (fieldName: string) =>
    this.page.locator(`xpath=//table[contains(@class,'oe_subtotal_footer')]//*[@name='${fieldName}']`).first();
  private readonly subtotalFooterFieldCss = (fieldName: string) =>
    this.page.locator(`.oe_subtotal_footer [name="${fieldName}"]`).first();

  /**
   * A field of the totals footer as the screen shows it (read mode: text; edit mode: the input's value).
   * @param fieldName - discount | discount_money | amount_total
   */
  async getSubtotalFooterValue(fieldName: string): Promise<string> {
    let field = this.subtotalFooterFieldXPath(fieldName);
    if ((await field.count()) === 0) field = this.subtotalFooterFieldCss(fieldName);
    if ((await field.count()) === 0) return '';
    return await field
      .evaluate((el: HTMLElement) => {
        const input = el.matches('input') ? (el as HTMLInputElement) : (el.querySelector('input') as HTMLInputElement | null);
        const raw = input ? input.value : el.innerText || el.textContent || '';
        return raw.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
      })
      .catch(() => '');
  }

  /**
   * Poll an order-line cell until it contains `expected` - the line's onchange settles only after the row
   * commits, so a read straight after typing the quantity still shows the qty-1 amount.
   * @returns the last value read (the caller asserts on it)
   */
  async waitForOrderLineCell(
    rowIndex: number,
    column: string,
    expected: string,
    timeout: number = CommonUtils.waitTimes.abnormalWait
  ): Promise<string> {
    const deadline = Date.now() + timeout;
    let last = '';
    while (Date.now() < deadline) {
      last = ((await this.getOrderLineRowCells(rowIndex))[column] ?? '').replace(/ /g, ' ');
      if (last.includes(expected)) return last;
      await this.wait(CommonUtils.waitTimes.medium);
    }
    return last;
  }

  /** Poll until the Order Lines list renders `expected` rows. @returns the last count read. */
  async waitForOrderLineRowCount(expected: number, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<number> {
    const deadline = Date.now() + timeout;
    let last = -1;
    while (Date.now() < deadline) {
      last = await this.getOrderLineRowCount();
      if (last === expected) return last;
      await this.wait(CommonUtils.waitTimes.medium);
    }
    return last;
  }

  /** Every Order Lines row as header -> cell text, top to bottom. */
  async getAllOrderLineRows(): Promise<Array<Record<string, string>>> {
    const n = await this.getOrderLineRowCount();
    const rows: Array<Record<string, string>> = [];
    for (let i = 0; i < n; i++) rows.push(await this.getOrderLineRowCells(i));
    return rows;
  }

  // ---------------- Discount baseline (Promotion list, partners, order date) ----------------

  private readonly promotionDropdownItemsCss = () => this.page.locator('ul.ui-autocomplete:visible li');
  private readonly formTitleXPath = () => this.page.locator('xpath=//div[contains(@class,"o_form_sheet")]//div[contains(@class,"oe_title")]').first();
  private readonly formTitleCss = () => this.page.locator('.o_form_sheet h1, .o_form_sheet .oe_title').first();

  /**
   * Open the Promotion list (promotion_id, edit mode, NO program picked yet - typing into a picked
   * field replaces its value) and read the programs it offers, in order.
   * The list holds only the programs the order is eligible for: on pre-production (2026-10-20) an
   * order with no eligible program shows the single placeholder "No results to show..." whatever is
   * typed - that placeholder (and "Search More...") is NOT a program and is not returned.
   * @param term - text typed into the field before reading ('' = the full eligible list)
   * @param opts.keepOpen - leave the list on screen for the verify-point shot; close it with closePromotionList()
   */
  async getPromotionOptions(term: string = '', opts: { keepOpen?: boolean } = {}): Promise<string[]> {
    const input = this.promotionIdInput();
    if ((await input.count().catch(() => 0)) === 0) throw new Error('Promotion field has no input - the form is not in edit mode');
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.click();
    await input.fill(term);
    await this.wait(CommonUtils.waitTimes.long * 2); // name_search round-trip
    const raw = (await this.promotionDropdownItemsCss().allTextContents().catch(() => [] as string[])).map((s) =>
      s.replace(/\s+/g, ' ').trim()
    );
    const options = raw.filter((s) => s && !/^No results to show/i.test(s) && !/^Search More/i.test(s) && !/^Create/i.test(s));
    console.log(`  - Promotion list (term "${term}") shows: ${JSON.stringify(raw)}`);
    if (!opts.keepOpen) await this.closePromotionList();
    return options;
  }

  /**
   * Every entry the Promotion dropdown shows, UNFILTERED - programs AND the widget's own entries ("No results to
   * show...", "Search More...", "Create ...", "Create and Edit..."). Leaves the list open; close with closePromotionList().
   */
  async getPromotionDropdownEntries(term: string = ''): Promise<string[]> {
    const input = this.promotionIdInput();
    if ((await input.count().catch(() => 0)) === 0) throw new Error('Promotion field has no input - the form is not in edit mode');
    await input.click();
    await input.fill(term);
    await this.wait(CommonUtils.waitTimes.long * 2);
    const raw = (await this.promotionDropdownItemsCss().allTextContents().catch(() => [] as string[])).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    console.log(`  - Promotion dropdown entries (term "${term}"): ${JSON.stringify(raw)}`);
    return raw;
  }

  /** Whether the Promotion field offers the "external link" button that opens the program's own form. */
  async hasPromotionExternalLink(): Promise<boolean> {
    return (await this.page.locator("xpath=//div[@name='promotion_id']//button[contains(@class,'o_external_button')]").count().catch(() => 0)) > 0;
  }

  /** Close the Promotion list opened by getPromotionOptions(.., { keepOpen: true }) without picking anything. */
  async closePromotionList(): Promise<void> {
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
    // Escape leaves a typed term in the input; nothing was picked, so empty it again before leaving
    // the field (a leftover term would open the "create a Promotion?" dialog on focus-out)
    const input = this.promotionIdInput();
    if ((await input.count().catch(() => 0)) && (await input.inputValue({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')) !== '') {
      await input.fill('', { timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => {});
    }
    await this.blurForm();
  }

  /** Click the record title so the cell being edited commits and the onchange runs. */
  async blurForm(): Promise<void> {
    let title = this.formTitleXPath();
    if (!(await title.count().catch(() => 0))) title = this.formTitleCss();
    await title.click({ position: { x: 5, y: 5 }, timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Add ONE order line for exactly this product and set its Ordered Qty - or throw. The SKU is typed first so the
   * dropdown is filtered to it, the option carrying the SKU is clicked, and the committed row is read back.
   * No Enter fallback: on 2026-10-20 addProductLine('[A2160B]', 10) found no option, pressed Enter and the row
   * became A2144B (Subtotal 3,290.00) - Discount_2.5 then "saw" Deal registration offered for an order it never had.
   * @param productName - the SKU as the product label starts, e.g. "[A2160B]"
   */
  async addOrderLineStrict(productName: string, quantity: number = 1): Promise<void> {
    let clicked = await this.addProductButton().click({ timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (!clicked) clicked = await this.addProductLink().click({ timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (!clicked) throw new Error('"Add a product" could not be clicked');
    const input = this.orderLineRows().last().locator('[name="product_id"] input');
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    const sku = productName.replace(/^\[|\]$/g, '');
    await input.fill(sku);
    const escaped = productName.replace(/[[\]\\^$.|?*+(){}]/g, '\\$&');
    const option = this.dropdownOption().filter({ hasText: new RegExp('^\\s*' + escaped) }).first();
    await this.waitForProductOption(input, sku, option);
    await option.click();
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.setLastRowQty(quantity);
    await this.blurForm();
    const rows = await this.getAllOrderLineRows();
    const landed = rows.some((r) => (r['Product'] ?? '').startsWith(productName));
    if (!landed) throw new Error(`No order line carries ${productName} after adding it - lines: ${rows.map((r) => (r['Product'] ?? '').slice(0, 20)).join(' | ')}`);
    console.log(`  ✓ Order line: ${productName} x ${quantity}`);
  }

  /** Wait for the dropdown option of the SKU just typed in the Product cell (DealElementPageMig adds one re-type). */
  protected async waitForProductOption(_input: Locator, _sku: string, option: Locator): Promise<void> {
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
  }

  /**
   * Set the Unit Price of an order line (edit mode). The line just added is still being edited - its product
   * cell is an input, not the <span> changeUnitPriceInRow() clicks - so commit it first, and commit again after
   * so the totals recompute.
   */
  async setLineUnitPrice(productName: string, price: number): Promise<void> {
    await this.blurForm();
    await this.changeUnitPriceInRow(productName, price);
    await this.blurForm();
  }

  /** Set the Discount (%) of an order line (edit mode) - same commit-before / commit-after as setLineUnitPrice. */
  async setLineDiscount(productName: string, discount: number): Promise<void> {
    await this.blurForm();
    await this.changeDiscountInRow(productName, discount);
    await this.blurForm();
  }

  /** Empty the Promotion field (edit mode) and let the onchange remove the reward line. */
  async clearPromotion(): Promise<void> {
    const input = this.promotionIdInput();
    if ((await input.count().catch(() => 0)) === 0) throw new Error('Promotion field has no input - the form is not in edit mode');
    await input.click();
    await input.fill('');
    await this.blurForm();
    console.log('  ✓ Promotion cleared');
  }

  /** Set a many2one partner field of the Deal Element (reseller_id / distributor_id) by picking it from its list. */
  private async setPartnerMany2one(field: 'reseller_id' | 'distributor_id', name: string): Promise<void> {
    const input = field === 'reseller_id' ? this.resellerInput() : this.distributorInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.click();
    await input.fill(name);
    // EXACT name: a substring match picks the first of several same-named partners (pre-prod has 4 "Data Sciences
    // Corporation" records, only one of them the Gold reseller) - the caller must pass a name that is unique
    const exact = new RegExp('^\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
    const option = this.dropdownOption().filter({ hasText: exact }).first();
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await option.click();
    await this.wait(CommonUtils.waitTimes.long); // partner onchange fills the partner discount %
    const readBack = (await input.inputValue({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')).trim();
    if (!readBack.includes(name)) throw new Error(`${field} reads "${readBack}" after picking "${name}"`);
    console.log(`  ✓ ${field} = ${readBack}`);
  }

  async setReseller(name: string): Promise<void> {
    await this.setPartnerMany2one('reseller_id', name);
  }

  async setDistributor(name: string): Promise<void> {
    await this.setPartnerMany2one('distributor_id', name);
  }

  /**
   * The value of a field as the user sees it, from its VISIBLE widget only. Some Deal Element fields
   * (reseller_discount, distributor_discount) are rendered twice, one copy hidden by o_invisible_modifier,
   * so a plain first() can read the hidden copy.
   */
  async getVisibleFieldValue(fieldName: string): Promise<string> {
    const fields = this.page.locator(`.o_form_sheet [name="${fieldName}"]:not(.o_invisible_modifier)`);
    const n = await fields.count();
    for (let i = 0; i < n; i++) {
      const f = fields.nth(i);
      if (!(await f.isVisible().catch(() => false))) continue;
      return await f
        .evaluate((el: HTMLElement) => {
          const input = el.matches('input') ? (el as HTMLInputElement) : (el.querySelector('input') as HTMLInputElement | null);
          return ((input ? input.value : el.innerText || el.textContent) || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
        })
        .catch(() => '');
    }
    return '';
  }

  private readonly orderDateInputXPath = () => this.page.locator('xpath=//input[@name="date_order"]').first();

  /** Order Date as the form shows it (edit mode: the input value). */
  async getOrderDate(): Promise<string> {
    await this.clickNotebookTab('Other Information');
    const input = this.orderDateInputXPath();
    const v = (await input.count().catch(() => 0)) ? await input.inputValue({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '') : '';
    const value = v.trim() || (await this.getVisibleFieldValue('date_order'));
    // back to Order Lines: every order-line read works on the ACTIVE tab (1.8 hung after Save on 2026-10-21)
    await this.clickOrderLinesTab();
    return value;
  }

  /**
   * Set the Deal Element's Order Date (edit mode).
   * @param dateText - exactly as the form renders it on this build, e.g. "10/20/2025 10:00:00"
   * @returns true when the input reads back the typed value
   */
  async setOrderDate(dateText: string): Promise<boolean> {
    const input = this.orderDateInputXPath();
    // the Deal Element keeps Order Date on its "Other Information" tab (pre-prod 2026-10-20), not on the sheet
    await this.clickNotebookTab('Other Information');
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Backspace');
    await input.fill(dateText);
    await this.page.keyboard.press('Escape'); // closes the picker, keeps the typed value
    await this.blurForm();
    const readBack = (await input.inputValue({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')).trim();
    console.log(`  - Order Date set to "${dateText}", reads back "${readBack}"`);
    await this.clickOrderLinesTab();
    return readBack === dateText.trim();
  }

  /** Open a notebook tab of the form by its exact caption (no-op when it is absent). */
  async clickNotebookTab(caption: string): Promise<void> {
    const escaped = caption.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tab = this.page.locator('.o_notebook .nav-link').filter({ hasText: new RegExp('^\\s*' + escaped + '\\s*$') }).first();
    if (await tab.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false)) {
      await tab.click({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.medium);
    }
  }

  /**
   * A field's value as the screen shows it, in READ mode as well as in EDIT mode
   * (read mode renders text, edit mode renders an <input>).
   */
  async getFieldDisplayValue(fieldName: string): Promise<string> {
    const field = this.page.locator('.o_form_sheet [name="' + fieldName + '"]').first();
    if ((await field.count()) === 0) return '';
    return await field
      .evaluate((el: HTMLElement) => {
        const input = el.matches('input, textarea')
          ? (el as HTMLInputElement)
          : (el.querySelector('input:not([type="hidden"]), textarea') as HTMLInputElement | null);
        if (input && input.type !== 'checkbox') return (input.value || '').replace(/\s+/g, ' ').trim();
        return (el.innerText || el.textContent || '').replace(/​/g, '').replace(/\s+/g, ' ').trim();
      })
      .catch(() => '');
  }

  /** Whether a boolean field's checkbox is ticked. */
  async isFieldChecked(fieldName: string): Promise<boolean> {
    const box = this.page.locator('.o_form_sheet [name="' + fieldName + '"] input[type="checkbox"]').first();
    if ((await box.count()) === 0) return false;
    return await box.isChecked().catch(() => false);
  }

  // --------------------------------------------------------------------------
  // Chatter / Log note
  // --------------------------------------------------------------------------

  /** One entry per chatter message, NEWEST FIRST, line breaks preserved. */
  async getChatterMessages(
    timeout: number = CommonUtils.waitTimes.checkingChatterLog
  ): Promise<string[]> {
    const messages = this.page.locator('.o_thread_message .o_thread_message_content');
    await messages.first().waitFor({ state: 'visible', timeout }).catch(() => {});
    const count = await messages.count();
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await messages
        .nth(i)
        .evaluate((el: HTMLElement) => el.innerText.replace(/ /g, ' ').trim())
        .catch(() => '');
      if (text) out.push(text);
    }
    return out;
  }

  /** The first chatter message matching, or null. */
  async findChatterMessage(pattern: string | RegExp, timeout?: number): Promise<string | null> {
    const messages = await this.getChatterMessages(timeout);
    const hit = messages.find((m) => (typeof pattern === 'string' ? m.includes(pattern) : pattern.test(m)));
    return hit ?? null;
  }

  /**
   * Poll the chatter (reloading the form) until a message matches. The creation
   * notes are written by the server as the record is stored, so a single read
   * straight after SAVE can land before they are rendered.
   */
  async waitForChatterMessage(
    pattern: string | RegExp,
    maxWaitTime: number = CommonUtils.waitTimes.savingPage,
    checkInterval: number = CommonUtils.waitTimes.checkingChatterLog
  ): Promise<string | null> {
    const deadline = Date.now() + maxWaitTime;
    let attempt = 1;
    let hit = await this.findChatterMessage(pattern);
    while (!hit && Date.now() < deadline) {
      console.log('  ... log note ' + pattern + ' not in the chatter yet - attempt #' + attempt + ', reloading');
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.wait(checkInterval);
      hit = await this.findChatterMessage(pattern);
      attempt++;
    }
    return hit;
  }

  /** Turn a "<key>: <value>" log note into a map. */
  parseLogNoteFields(note: string): Record<string, string> {
    const fields: Record<string, string> = {};
    note.split('\n').forEach((line) => {
      const m = line.match(/^\s*([^:]+?):\s*(.*)$/);
      if (m) fields[m[1].trim()] = m[2].trim();
    });
    return fields;
  }


  /**
   * Every VISIBLE label of the information area paired with the technical name and
   * the on-screen value of the field it captions, in form order. Used by the layout
   * test cases so an assertion names the field, not a DOM index.
   */
  async getFieldLabelMap(): Promise<Array<{ label: string; field: string; value: string }>> {
    const sheet = this.page.locator('.o_form_sheet').first();
    await sheet.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await sheet
      .evaluate((el: HTMLElement) => {
        const clean = (n: Element | null) =>
          n ? ((n as HTMLElement).innerText || n.textContent || '').replace(/​/g, '').replace(/\s+/g, ' ').trim() : '';
        const notebook = el.querySelector('.o_notebook');
        const out: Array<{ label: string; field: string; value: string }> = [];
        Array.from(el.querySelectorAll('label')).forEach((l) => {
          if (notebook && notebook.contains(l)) return;
          if (!((l as HTMLElement).offsetParent || l.getClientRects().length)) return;
          const label = clean(l);
          if (!label) return;
          const row = l.closest('tr');
          const widget = row ? row.querySelector('[name]') : null;
          const valueCell = row ? row.querySelector('td.o_td_label + td') : null;
          out.push({
            label,
            field: widget ? widget.getAttribute('name') || '' : '',
            value: clean(valueCell || (widget as Element | null)),
          });
        });
        return out;
      })
      .catch(() => [] as Array<{ label: string; field: string; value: string }>);
  }


  /**
   * The NAME a many2one field shows, without the address lines Odoo prints under it.
   * Read mode renders the name as a link followed by the partner's address, so a plain
   * innerText read of "Payer" returns "Acme Connecticut United States"; this returns
   * "Acme". Edit mode returns the input value.
   */
  async getFieldPartnerName(fieldName: string): Promise<string> {
    const field = this.page.locator('.o_form_sheet [name="' + fieldName + '"]').first();
    if ((await field.count()) === 0) return '';
    return await field
      .evaluate((el: HTMLElement) => {
        const clean = (s: string) => (s || '').replace(/​/g, '').replace(/\s+/g, ' ').trim();
        const input = el.querySelector('input:not([type="hidden"])') as HTMLInputElement | null;
        if (input) return clean(input.value);
        const link = el.querySelector('a');
        if (link) return clean((link as HTMLElement).innerText);
        return clean((el.innerText || '').split('\n')[0]);
      })
      .catch(() => '');
  }

  /** The numeric part of a monetary/percent field, e.g. "0.00 ( $ 0.00 )" -> 0. */
  async getFieldNumber(fieldName: string): Promise<number> {
    const raw = await this.getFieldDisplayValue(fieldName);
    const match = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : NaN;
  }



  /**
   * The value cell of the row a LABEL captions, as the screen shows it.
   *
   * Some rows carry two fields in one cell: "Distributor Discount (%)" renders the
   * percent next to the money it grants, so the tester reads "0.00 ( $ 0.00 )" while
   * the percent field alone reads "0.00". Keyed on the label rather than the field
   * name because the form carries hidden duplicate widgets under the same name.
   */
  async getFieldRowTextByLabel(label: string): Promise<string> {
    const map = await this.getFieldLabelMap();
    const hit = map.find((entry) => entry.label === label);
    return hit ? hit.value : '';
  }

}
