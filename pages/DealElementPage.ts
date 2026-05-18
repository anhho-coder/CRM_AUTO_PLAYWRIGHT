import { Page } from '@playwright/test';
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
  private readonly productInput = () => this.page.locator('.o_data_cell > .o_field_widget > .o_input_dropdown > .o_input').first();
  private readonly dropdownOption = () => this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  private readonly qtyInput = () => this.page.locator('input[name="product_uom_qty"]').first();
  private readonly firstProductRow = () => this.page.locator('xpath=//tr[contains(@class,"o_data_row")][1]');
  private readonly firstProductNameField = () => this.firstProductRow().locator('xpath=//*[@name="product_id"]');
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
      await this.addProductButton().click();
      console.log('  - Clicked "Add a product" button');

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
    await productCell.click({ force: true });
    await this.wait(500);
    console.log(`  - Clicked product cell "${productName}"`);

    // Step 2: Click the Unit Price input on the same row
    const priceInput = this.page.locator(
      `xpath=//input[@name="price_unit"]`
    ).first();
    await priceInput.click();
    await this.wait(500);
    console.log(`  - Clicked Unit Price cell`);

    // Step 3 & 4: Clear current value and enter new price
    await priceInput.click({ clickCount: 3 }); // triple-click to select all existing text
    await priceInput.fill(String(price));
    console.log(`  \u2713 Unit Price set to "${price}"`);
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
    await productCell.click({ force: true });
    await this.wait(500);
    console.log(`  - Clicked product cell "${productName}"`);

    // Step 2: Click the Discount input on the same row
    const discountInput = this.page.locator(
      `xpath=(//input[@name="discount"])[1]`
    ).first();
    await discountInput.click();
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
      const text = await this.firstProductNameField().textContent();
      return text || 'first product';
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
        await button.click();
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

        // Quoc Anh: wait for Edit button to appear as indication that form is saved and back to non-editable mode
        await this.editButton().waitFor({ state: 'visible', timeout })
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
        return await paymentTermCell.textContent();
      }
      return null;
    } catch (error) {
      return null;
    }
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
}
