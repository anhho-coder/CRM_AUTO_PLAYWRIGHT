import { Page, Locator } from '@playwright/test';
import { ContactPage } from '../ContactPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Contacts on the O12 Migration server (crm-mig.nakivo.site).
 *
 * Why a Mig variant: ContactPage.createContact() hung on crm-mig (2026-10-21, CRM-12144_2.1 - 4 min without a
 * line of output) - its clicks are unbounded and its row locators are built for the pre-production form. The
 * crm-mig partner form (read 2026-10-21 as Thomas Semerich) carries the same FIELD NAMES, so this variant
 * addresses every field by its `name` attribute, takes the VISIBLE copy of a field the form renders twice
 * (user_id / team_id appear on the sheet and on Sales & Purchases), and bounds every action so a miss fails
 * at the field that broke, with its name in the error.
 */
export class ContactPageMig extends ContactPage {
  /** Evidence hook: the "Partner Discount" field of a company form (discount_id, read 2026-10-26 on Bailey Systems). */
  static readonly PARTNER_DISCOUNT = '.o_form_sheet [name="discount_id"]';

  constructor(page: Page) {
    super(page);
  }

  /** The open company form's "Partner Discount" (field discount_id) as the screen shows it, e.g. "15.0"; '' when absent. */
  async getPartnerDiscountMig(): Promise<string> {
    const field = this.page.locator('xpath=//div[contains(@class,"o_form_sheet")]//*[@name="discount_id"]').or(this.page.locator(ContactPageMig.PARTNER_DISCOUNT)).first();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return ((await field.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Bring the "Partner Discount" field (discount_id) of the open company form ON SCREEN: it sits on a notebook page,
   * not on the sheet's top block - the top block's "Discount" (15.00) is the float field `discount`, a different field
   * (ir.model.fields on crm-mig, read 2026-10-26: discount = "Discount" float, discount_id = "Partner Discount"
   * many2one nakivo_sale.discount). Without this, getPartnerDiscountMig() reads the hidden copy and the evidence shot
   * outlines nothing visible (CRM-12144_4.3 shots of 2026-10-26). Clicks only the notebook tab - nothing is edited.
   * @returns the caption of the tab opened ('' when the field is not on a notebook page), and whether it is visible
   */
  async revealPartnerDiscountMig(): Promise<{ tab: string; visible: boolean }> {
    const paneId = await this.page.evaluate(() => {
      const el = document.querySelector('.o_form_sheet .o_notebook [name="discount_id"]');
      return (el?.closest('.tab-pane') as HTMLElement | null)?.id || '';
    }).catch(() => '');
    let tab = '';
    if (paneId) {
      const link = this.page.locator(`xpath=//div[contains(@class,"o_notebook")]//a[@href="#${paneId}"]`).or(this.page.locator(`.o_notebook a[href="#${paneId}"]`)).first();
      tab = ((await link.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      await link.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    const field = this.page.locator('xpath=//div[contains(@class,"o_form_sheet")]//*[@name="discount_id"]').or(this.page.locator(ContactPageMig.PARTNER_DISCOUNT)).first();
    const visible = await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (visible) await field.scrollIntoViewIfNeeded({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    console.log(`    - Partner Discount field: notebook tab "${tab || '(none - on the sheet)'}", visible = ${visible}`);
    return { tab, visible };
  }

  /** Evidence hook: the VISIBLE "Discount" field of a company form (float `discount` - not "Partner Discount"). */
  static readonly DISCOUNT_FIELD = '.o_form_sheet [name="discount"]:not(.o_invisible_modifier)';

  /**
   * The open company form's "Discount" (float field `discount`) when it is ON SCREEN, e.g. "15.00"; '' when hidden.
   * Measured on Bailey Systems 2026-10-26 (tests/_explore/discount-mig-partner-discount-visibility-20261026e): a
   * Sales / User: Own Documents Only user (Thomas) sees "Discount" 15.00 and NOT "Partner Discount" (discount_id carries
   * o_invisible_modifier); a Sales / Editing Manager (Max) sees "Partner Discount" 15.0 and not "Discount".
   */
  async getVisibleDiscountMig(): Promise<string> {
    const field = this.page.locator('xpath=//div[contains(@class,"o_form_sheet")]//*[@name="discount" and not(contains(concat(" ",normalize-space(@class)," ")," o_invisible_modifier "))]')
      .or(this.page.locator(ContactPageMig.DISCOUNT_FIELD)).first();
    if (!(await field.isVisible().catch(() => false))) return '';
    return ((await field.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  // Locators - XPath primary, CSS fallback
  private readonly migCompanyTypeLabel = (label: string) =>
    this.page.locator(`xpath=//div[@name="company_type"]//label[normalize-space()="${label}"]`)
      .or(this.page.locator(`div[name="company_type"] label:text-is("${label}")`))
      .first();
  private readonly migFieldInputs = (name: string) =>
    this.page.locator(`xpath=//div[contains(@class,"o_form_view")]//*[@name="${name}"]//input | //div[contains(@class,"o_form_view")]//input[@name="${name}"]`)
      .or(this.page.locator(`.o_form_view [name="${name}"] input, .o_form_view input[name="${name}"]`));
  private readonly migAutocompleteOption = (text: RegExp) =>
    this.page.locator('xpath=//ul[contains(@class,"ui-autocomplete")]//li').filter({ hasText: text })
      .or(this.page.locator('ul.ui-autocomplete li').filter({ hasText: text }))
      .first();
  private readonly migNotebookTab = (caption: string) =>
    this.page.locator(`xpath=//div[contains(@class,"o_notebook")]//a[contains(@class,"nav-link") and normalize-space()="${caption}"]`)
      .or(this.page.locator('.o_notebook .nav-link').filter({ hasText: new RegExp(`^\\s*${caption}\\s*$`) }))
      .first();
  private readonly migModalButton = (text: RegExp) =>
    this.page.locator('xpath=//div[contains(@class,"modal") and contains(@class,"show")]//footer//button').filter({ hasText: text })
      .or(this.page.locator('.modal.show .modal-footer button').filter({ hasText: text }))
      .first();
  private readonly migSaveButton = () =>
    this.page.locator('xpath=//button[contains(@class,"o_form_button_save")]').or(this.page.locator('.o_form_button_save')).first();

  private static migExact(text: string): RegExp {
    return new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
  }

  /** The VISIBLE input of a field (a field rendered twice has one hidden copy). */
  private async migVisibleInput(name: string): Promise<Locator> {
    const all = this.migFieldInputs(name);
    const deadline = Date.now() + CommonUtils.waitTimes.abnormalWait;
    while (Date.now() < deadline) {
      const n = await all.count().catch(() => 0);
      for (let i = 0; i < n; i++) if (await all.nth(i).isVisible().catch(() => false)) return all.nth(i);
      await this.wait(CommonUtils.waitTimes.medium);
    }
    throw new Error(`crm-mig contact form: no visible input for field "${name}"`);
  }

  private async migFillChar(name: string, value: string): Promise<void> {
    const input = await this.migVisibleInput(name);
    await input.fill(value, { timeout: CommonUtils.waitTimes.abnormalWait });
  }

  /** Type into a many2one and pick the option matching `option`; throws when the field stays empty. */
  private async migSetMany2one(name: string, typed: string, option: RegExp): Promise<string> {
    const input = await this.migVisibleInput(name);
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill(typed, { timeout: CommonUtils.waitTimes.abnormalWait });
    const opt = this.migAutocompleteOption(option);
    await opt.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await opt.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long); // onchange
    const readBack = (await input.inputValue({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')).trim();
    if (!readBack) throw new Error(`crm-mig contact form: "${name}" is empty after picking "${typed}"`);
    return readBack;
  }

  /**
   * Contacts > Create (the form must be open): a Company with the given name, e-mail, address, Sales Team,
   * Salesperson and - on Sales & Purchases - Pricelist; then Save. No Reseller / Distributor is set.
   * @returns the new res.partner id (from the saved form's URL)
   */
  async createCompanyMig(data: {
    name: string;
    email: string;
    country: string;
    state: string;
    salesTeam: string;
    salesperson: string;
    pricelist: string;
  }): Promise<number> {
    await this.migCompanyTypeLabel('Company').click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.standard); // the form re-renders for a company
    await this.migFillChar('name', data.name);
    await this.migFillChar('email', data.email);
    const country = await this.migSetMany2one('country_id', data.country, ContactPageMig.migExact(data.country));
    const state = await this.migSetMany2one('state_id', data.state, new RegExp(`^\\s*${data.state}\\b`));
    const team = await this.migSetMany2one('team_id', data.salesTeam, ContactPageMig.migExact(data.salesTeam));
    const user = await this.migSetMany2one('user_id', data.salesperson, ContactPageMig.migExact(data.salesperson));
    console.log(`    form reads: Country = ${country} | State = ${state} | Sales Team = ${team} | Salesperson = ${user}`);
    // the tab click can land while the salesperson onchange re-renders the sheet (2026-10-21: the Pricelist input
    // never showed once) - click until the tab's field is on screen, at most three times
    for (let attempt = 1; attempt <= 3; attempt++) {
      // 2026-10-21 (CRM-12144_1.5 / 1.15): on crm-mig a real click on the tab anchor (href="#notebook_page_N") can
      // change the URL hash; the web client then reads it as LEAVING the dirty form and asks "The record has been
      // modified, your changes will be discarded. Do you want to proceed?". OK would throw the new company away, so
      // answer CANCEL (stay on the form), and switch the tab through Bootstrap's own tab API on the next attempts.
      const popup = (await this.getBlockingPopupText(CommonUtils.waitTimes.long).catch(() => '')).replace(/\s+/g, ' ').trim();
      if (popup) {
        if (/changes will be discarded/i.test(popup)) {
          console.log(`    ⚠ "${popup.slice(0, 140)}" - CANCEL (keep the unsaved company)`);
          await this.migModalButton(/^\s*cancel\s*$/i).click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        } else {
          console.log(`    ⚠ a dialog covered the partner form: "${popup.slice(0, 200)}" - dismissed`);
          await this.dismissErrorDialogWithRetry().catch(() => 0);
        }
        await this.wait(CommonUtils.waitTimes.standard);
      }
      const tab = this.migNotebookTab('Sales & Purchases');
      if (attempt === 1) {
        await tab.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      } else {
        await tab.evaluate((el) => {
          const jq = (window as unknown as { $?: (e: Element) => { tab: (cmd: string) => void } }).$;
          if (jq) jq(el).tab('show');
          else (el as HTMLElement).click();
        });
      }
      await this.wait(CommonUtils.waitTimes.long);
      const shown = await this.migFieldInputs('property_product_pricelist').first()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait / 2 }).then(() => true).catch(() => false);
      if (shown) break;
      console.log(`    Sales & Purchases: Pricelist not on screen after click ${attempt} - clicking the tab again`);
    }
    // Odoo shows a pricelist as "<name> (<currency>)": the exact name plus one currency suffix
    const pricelist = await this.migSetMany2one(
      'property_product_pricelist',
      data.pricelist,
      new RegExp(`^\\s*${data.pricelist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\([A-Z]{3}\\)\\s*$`)
    );
    console.log(`    form reads: Pricelist = ${pricelist}`);
    await this.migSaveButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const id = await this.waitForIdInUrlAndExtract(CommonUtils.waitTimes.pageLoad);
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    return Number(id);
  }

  /**
   * Added 2026-10-26: Contacts list > CREATE, bounded, with ONE retry. ContactPage.clickCreate() waits 240 s for the form
   * URL after a single click; on crm-mig 2026-10-26 15:17 (CRM-11857_4.6, repeat 2) the click right after the hash
   * navigation from the Currency Rates list landed before the Contacts list had taken over, no form opened, and the URL
   * stayed "#action=134&model=res.partner&view_type=list" for the whole 240 s. Here: wait for the loading overlay, click,
   * wait 45 s for the form; if it did not open, reload the list once and click again.
   */
  async clickCreateMig(): Promise<void> {
    const create = this.page.locator('xpath=//div[contains(@class,"o_control_panel")]//button[contains(@class,"o_list_button_add") or contains(@class,"o-kanban-button-new")]')
      .or(this.page.locator('.o_control_panel button.o_list_button_add, .o_control_panel button.o-kanban-button-new')).first();
    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await create.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await this.wait(CommonUtils.waitTimes.long);
      await create.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      const opened = await this.page.waitForURL('**/web?*view_type=form*', { timeout: CommonUtils.waitTimes.abnormalWait * 1.5 })
        .then(() => true, () => false);
      if (opened) {
        await this.wait(CommonUtils.waitTimes.standard);
        return;
      }
      console.log(`  ⚠ Contacts CREATE did not open the form (attempt ${attempt}, url ${this.page.url()}) - reloading the list`);
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.abnormalWait });
    }
    throw new Error('Contacts > CREATE did not open the contact form after 2 attempts');
  }

  /**
   * Added 2026-10-26 (CRM-11857_4.3 / 4.4 / 4.6 / 8.4). On the OPEN "Create" form: Name, Company Type = Company (the crm-mig
   * form has a Company Type radio group, no "Is a Company" checkbox - the 4.1 finding of 2026-10-22), Sales & Purchases >
   * Pricelist = `pricelistName` picked by its EXACT display "<name> (<CUR>)", then SAVE.
   *
   * Why exact: crm-mig holds a USD pricelist literally NAMED "Public Pricelist_EUR (EUR)" (id 100000000, created
   * 2026-10-21), which a substring pick or an Enter takes for the EUR list. Pass the bare name ("Public Pricelist_EUR").
   * Throws at the first control that does not take its value; returns once SAVE left no dialog on screen.
   */
  async createCompanyWithPricelistMig(name: string, pricelistName: string): Promise<void> {
    await this.fillContactName(name);
    const isCompany = await this.selectCompanyType();
    if (!isCompany) throw new Error('crm-mig contact form: no Company Type = Company radio');
    await this.clickSalesPurchasesTab();
    await this.selectPricelist(pricelistName, { exact: true });
    const shown = ((await this.migFieldInputs('property_product_pricelist').first()
      .inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    console.log(`    form reads: Pricelist = ${shown}`);
    if (!shown.startsWith(pricelistName)) throw new Error(`crm-mig contact form: Pricelist reads "${shown}" after picking "${pricelistName}"`);
    await this.clickSave();
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    const popup = (await this.getBlockingPopupText(CommonUtils.waitTimes.standard).catch(() => '')).replace(/\s+/g, ' ').trim();
    if (popup) throw new Error(`crm-mig contact form: a dialog is open after SAVE: "${popup.slice(0, 300)}"`);
  }
}
