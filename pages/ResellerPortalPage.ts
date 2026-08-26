import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Reseller / Partner Portal Page Object
 * Handles the NAKIVO Partner Portal (Odoo "/my" portal) that a Reseller user sees after login -
 * the portal home (/my) and the "My Opportunities" list (/my/opportunities).
 */
export class ResellerPortalPage extends BasePage {
  // Locators (XPath primary, CSS fallback)
  // "My Opportunities" control on the portal home (Overview). Rendered as a VISIBLE
  // <a href="/my/opportunities"> card. NOTE: the user navbar also has a HIDDEN
  // <a class="dropdown-item" href="/my/opportunities">; exclude it (XPath) / filter to visible (CSS)
  // so we never act on the hidden one.
  private readonly myOpportunitiesLinkXPath = () =>
    this.page.locator(
      "xpath=//a[@href='/my/opportunities' and not(contains(@class,'dropdown-item'))]"
    ).first();
  private readonly myOpportunitiesLinkCss = () =>
    this.page.locator("a[href='/my/opportunities']:visible").first();
  // Data rows on /my/opportunities. The Opp name is in the first cell (td[1]).
  private readonly opportunityRows = () =>
    this.page.locator("xpath=//tr[contains(@class,'opportunity_table_row')]");
  private readonly opportunityRowByName = (name: string) =>
    this.page.locator(
      `xpath=//tr[contains(@class,'opportunity_table_row')][.//td[contains(normalize-space(.),"${name}")]]`
    );

  // --- Opportunity detail page (/my/opportunity/<id>) ---
  // Readiness signal: the "Contact" card heading.
  private readonly contactCardTitleXPath = () =>
    this.page.locator("xpath=//h4[contains(@class,'p-info__title') and normalize-space()='Contact']").first();
  // CONTACT card "Edit" icon - opens the Edit-contact modal (data-target=".modal_edit_contact").
  private readonly editContactIconXPath = () =>
    this.page.locator("xpath=//a[contains(@class,'p-info__title-icon') and @data-target='.modal_edit_contact']").first();
  private readonly editContactIconCss = () =>
    this.page.locator("a.p-info__title-icon[data-target='.modal_edit_contact']").first();
  // The Edit-contact modal and its Phone input + Confirm button.
  private readonly editContactModalXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'modal_edit_contact')]").first();
  private readonly editContactModalCss = () =>
    this.page.locator("div.modal_edit_contact").first();
  private readonly contactPhoneInputXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'modal_edit_contact')]//input[@name='phone']").first();
  private readonly contactPhoneInputCss = () =>
    this.page.locator("div.modal_edit_contact input[name='phone']").first();
  private readonly editContactConfirmXPath = () =>
    this.page.locator("xpath=//button[contains(@class,'nakivo_edit_contact_confirm')]").first();
  private readonly editContactConfirmCss = () =>
    this.page.locator("button.nakivo_edit_contact_confirm").first();
  // Contact card phone link (for in-portal evidence/logging) - <a href="tel:<value>"> in a .p-contact block.
  private readonly contactCardPhoneLink = () =>
    this.page.locator("xpath=//div[contains(@class,'p-contact')]//a[starts-with(@href,'tel:')]").first();
  // Contact card email link (for in-portal evidence/logging) - <a href="mailto:<value>"> in a .p-contact block.
  private readonly contactCardEmailLink = () =>
    this.page.locator("xpath=//div[contains(@class,'p-contact')]//a[starts-with(@href,'mailto:')]").first();
  // Edit-contact modal: a field input by its name attribute (partner_name | email_from | phone | mobile). XPath primary, CSS fallback.
  private readonly editContactFieldByNameXPath = (fieldName: string) =>
    this.page.locator(`xpath=//div[contains(@class,'modal_edit_contact')]//input[@name='${fieldName}']`).first();
  private readonly editContactFieldByNameCss = (fieldName: string) =>
    this.page.locator(`div.modal_edit_contact input[name='${fieldName}']`).first();
  // Edit-contact modal "Cancel" link (<a class="p-button p-button--back">Cancel</a>).
  private readonly editContactCancelXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'modal_edit_contact')]//a[contains(@class,'p-button--back')]").first();
  private readonly editContactCancelCss = () =>
    this.page.locator("div.modal_edit_contact a.p-button--back").first();

  // --- Edit-opportunity modal (detail page card "Edit" icon -> .modal_edit_opportunity) ---
  private readonly editOpportunityIconXPath = () =>
    this.page.locator("xpath=//a[contains(@class,'p-info__title-icon') and @data-target='.modal_edit_opportunity']").first();
  private readonly editOpportunityIconCss = () =>
    this.page.locator("a.p-info__title-icon[data-target='.modal_edit_opportunity']").first();
  private readonly editOpportunityModalXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'modal_edit_opportunity')]").first();
  private readonly editOpportunityModalCss = () =>
    this.page.locator("div.modal_edit_opportunity").first();
  // Expected closing date (date_deadline) - a text input wired to an mc-calendar datepicker.
  private readonly oppExpectedDateInputXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'modal_edit_opportunity')]//input[@name='date_deadline']").first();
  private readonly oppExpectedDateInputCss = () =>
    this.page.locator("div.modal_edit_opportunity input[name='date_deadline']").first();
  // Expected Revenue (planned_revenue) text input in the same modal (alternate editable field).
  private readonly oppPlannedRevenueInputXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'modal_edit_opportunity')]//input[@name='planned_revenue']").first();
  private readonly oppPlannedRevenueInputCss = () =>
    this.page.locator("div.modal_edit_opportunity input[name='planned_revenue']").first();
  private readonly editOpportunityConfirmXPath = () =>
    this.page.locator("xpath=//button[contains(@class,'nakivo_edit_opp_confirm')]").first();
  private readonly editOpportunityConfirmCss = () =>
    this.page.locator("button.nakivo_edit_opp_confirm").first();

  // Overview (/my) card "<label> <count>": <a class="p-list__item"> with .p-list__txt + .p-list__count.
  private readonly overviewCardCountByLabel = (label: string) =>
    this.page.locator(`xpath=//a[contains(@class,'p-list__item')][.//span[contains(@class,'p-list__txt') and normalize-space()='${label}']]//span[contains(@class,'p-list__count')]`).first();
  // A specific cell (1-based) of the My Opportunities row matching a name (td order: Name, Contact, Stage, Date, Expected Revenue).
  private readonly opportunityRowCell = (name: string, idx: number) =>
    this.opportunityRowByName(name).locator(`xpath=./td[${idx}]`).first();
  // My Opportunities Search box (shared portal <input name="search">). XPath primary, CSS fallback.
  private readonly opportunitySearchInputXPath = () =>
    this.page.locator("xpath=//input[@name='search']").first();
  private readonly opportunitySearchInputCss = () =>
    this.page.locator("input[name='search']").first();
  // Detail page (/my/opportunity/<slug>-<id>): Opportunity name heading + Expected Revenue.
  private readonly detailNameXPath = () => this.page.locator("xpath=//h1[contains(@class,'title')]").first();
  private readonly detailNameCss = () => this.page.locator("h1.title").first();
  private readonly detailExpectedRevenue = () =>
    this.page.locator("xpath=//span[contains(@class,'planned_revenue')]").first();

  // --- My Invoices (/my/invoices) ---
  // "My invoices" control on the portal home (Overview), rendered as a VISIBLE <a href="/my/invoices">.
  // The user navbar also carries a HIDDEN dropdown-item variant; exclude it (XPath) / filter to visible
  // (CSS) so we never act on the hidden one (same pattern as the "My Opportunities" link above).
  private readonly myInvoicesLinkXPath = () =>
    this.page.locator(
      "xpath=//a[@href='/my/invoices' and not(contains(@class,'dropdown-item'))]"
    ).first();
  private readonly myInvoicesLinkCss = () =>
    this.page.locator("a[href='/my/invoices']:visible").first();
  // Data rows on /my/invoices: <tr class="invoice_table_row" data-href="/my/invoices/<id>?...">.
  // The Invoice number is plain text in the first cell (td[1]); there is no <a> - clicking the row
  // navigates via its data-href (same pattern as the opportunity_table_row rows above).
  private readonly invoiceRows = () =>
    this.page.locator("xpath=//tr[contains(@class,'invoice_table_row')]");
  // A specific invoice row by its number text (e.g. "INV/2026/00001").
  private readonly invoiceRowByNumber = (num: string) =>
    this.page.locator(
      `xpath=//tr[contains(@class,'invoice_table_row')][.//td[contains(normalize-space(.),"${num}")]]`
    ).first();
  // Invoice detail page (/my/invoices/<id>) "top of page" number: the page title heading
  // (<h1 class="title title--mb">INV/2026/00001</h1>). XPath primary, CSS fallback.
  private readonly invoiceDetailNumberXPath = () =>
    this.page.locator("xpath=//h1[contains(@class,'title--mb')]").first();
  private readonly invoiceDetailNumberCss = () =>
    this.page.locator("h1.title").first();
  // A specific cell (1-based) of the invoice row matching a number (td order:
  // Invoice # | Invoice Date | Due Date | Status | Amount Due).
  private readonly invoiceRowCell = (num: string, idx: number) =>
    this.invoiceRowByNumber(num).locator(`xpath=./td[${idx}]`).first();
  // An invoice row by the backend invoice id embedded in its data-href (/my/invoices/<id>?...).
  // The trailing "?" anchors the match so id 1964 does not match 19640.
  private readonly invoiceRowById = (id: string) =>
    this.page.locator(`xpath=//tr[contains(@class,'invoice_table_row')][contains(@data-href,'/my/invoices/${id}?')]`);
  // "My invoices" Search box (<input name="search" placeholder="Search">). XPath primary, CSS fallback.
  private readonly invoiceSearchInputXPath = () =>
    this.page.locator("xpath=//input[@name='search']").first();
  private readonly invoiceSearchInputCss = () =>
    this.page.locator("input[name='search']").first();

  // --- Invoice detail page (/my/invoices/<id>) extras (UC-B-1) ---
  // "Pay now" control: an <a> styled as a button that opens the #pay_with modal. XPath primary, CSS fallback.
  private readonly payNowButtonXPath = () =>
    this.page.locator("xpath=//a[@data-toggle='modal' and @data-target='#pay_with']").first();
  private readonly payNowButtonCss = () => this.page.locator("a[data-target='#pay_with']").first();
  // --- Portal card payment (#pay_with block) - CRM-12373 ---
  // "Pay now" expands the #pay_with block ON THE SAME PAGE (Bootstrap collapse/modal); it does NOT
  // navigate to the acquirer's site. Inside it, each acquirer is a radio input[name="pm_id"] (value
  // "new_<acquirer id>", e.g. "new_8" for Stripe) and the card fields are Stripe.js v3 Elements
  // rendered as separate iframes from js.stripe.com. Submit is #o_payment_form_pay.
  private readonly payWithBlock = () => this.page.locator('#pay_with').first();
  private readonly acquirerRadios = () => this.page.locator("#pay_with input[name='pm_id']");
  private readonly acquirerRadioByValue = (value: string) =>
    this.page.locator(`#pay_with input[name='pm_id'][value='${value}']`).first();
  private readonly submitPaymentButton = () => this.page.locator('#o_payment_form_pay').first();
  // Left-side summary amount (the invoice Total / Amount Due, e.g. "$ 85.85"). XPath primary, CSS fallback.
  private readonly detailTotalBlockXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'q-page__price')]").first();
  private readonly detailTotalBlockCss = () => this.page.locator(".q-page__price").first();
  // The invoice line table is rendered INSIDE the #invoice_html iframe (report_type=html document).
  private readonly invoiceLineFrame = () => this.page.frameLocator('#invoice_html');
  private readonly invoiceLineTableInFrame = () =>
    this.invoiceLineFrame().locator("xpath=//table[@name='invoice_line_table']").first();
  // "This invoice is paid" success banner in the LEFT column (main document, NOT the iframe):
  // rendered as <h4 class="text-success">This invoice is paid</h4> inside the .q-page left panel for a
  // fully-paid invoice. XPath primary (matches the exact text), CSS fallback (any text-success heading).
  private readonly paidMessageXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'q-page')]//h4[contains(@class,'text-success') and contains(normalize-space(.),'This invoice is paid')]").first();
  private readonly paidMessageCss = () =>
    this.page.locator("h4.text-success").first();
  // "Amount Due" value cell INSIDE the #invoice_html iframe totals block, e.g.
  //   <tr class="border-black"><td><strong>Amount Due</strong></td><td class="text-right">$ 0.00</td></tr>
  // NOTE: this row is NOT an o_total row, so getDetailTotalsBreakdown does not surface it.
  private readonly detailAmountDueValueInFrame = () =>
    this.invoiceLineFrame().locator("xpath=//tr[./td/strong[normalize-space()='Amount Due']]/td[contains(@class,'text-right')]").first();

  // --- Opportunity detail page "Comment" section (Nakivo p-comments / o_portal_chatter) ---
  // The chatter widget wrapper: <div id="discussion" class="o_portal_chatter" data-res_model="crm.lead" data-res_id="<id>">.
  private readonly commentChatterWrapper = () =>
    this.page.locator("xpath=//div[@id='discussion' and contains(@class,'o_portal_chatter')]").first();
  // Composer textarea: <textarea name="message" class="p-form__field ..."> inside .p-comments__reply.
  private readonly commentTextareaXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'p-comments__reply')]//textarea[@name='message']").first();
  private readonly commentTextareaCss = () =>
    this.page.locator("div.p-comments__reply textarea[name='message']").first();
  // Submit button: <button type="submit" class="... add_message">Comment</button>.
  private readonly commentSubmitButtonXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'p-comments')]//button[contains(@class,'add_message')]").first();
  private readonly commentSubmitButtonCss = () =>
    this.page.locator("button.add_message").first();
  // Posted-comments list container: <div class="o_nakivo_portal_chatter_messages">.
  private readonly commentMessagesContainerXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'o_nakivo_portal_chatter_messages')]").first();
  private readonly commentMessagesContainerCss = () =>
    this.page.locator("div.o_nakivo_portal_chatter_messages").first();
  // Comment-count badge in the chatter header: <span class="o_message_count" count="N">.
  private readonly commentCountBadge = () =>
    this.page.locator("xpath=//span[contains(@class,'o_message_count')]").first();
  // "Click here to fetch lastest messages" refresh link: <p class="... fetch_last_message">.
  private readonly fetchLatestMessagesLinkXPath = () =>
    this.page.locator("xpath=//p[contains(@class,'fetch_last_message')]").first();
  private readonly fetchLatestMessagesLinkCss = () =>
    this.page.locator("p.fetch_last_message").first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Wait for the portal home (/my) to be ready - signalled by the "My Opportunities" link rendering.
   * Tolerates a slow portal login (uses the login-length wait budget).
   */
  async waitForPortalReady(): Promise<void> {
    let link = this.myOpportunitiesLinkXPath();
    const visibleByXPath = await link.isVisible({ timeout: CommonUtils.waitTimes.login }).catch(() => false);
    if (!visibleByXPath) {
      link = this.myOpportunitiesLinkCss();
      await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.login });
    }
  }

  /**
   * Click the "My Opportunities" button/link on the portal home; lands on /my/opportunities.
   */
  async clickMyOpportunities(): Promise<void> {
    let link = this.myOpportunitiesLinkXPath();
    const visibleByXPath = await link.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false);
    if (!visibleByXPath) link = this.myOpportunitiesLinkCss();
    await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await this.waitForURL('**/my/opportunities**', CommonUtils.waitTimes.pageLoad);
    await this.opportunityRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
  }

  /**
   * Verify an Opportunity with the given name is listed on the My Opportunities page.
   * The page is server-rendered, so a match is reliable per page load; reload-and-retry tolerates a
   * just-created Opp that needs a brief moment to surface.
   * @param name - the Opportunity name to look for
   * @param maxAttempts - number of (check + reload) attempts (default 5)
   * @param interval - wait between reload attempts (default waitTimes.long)
   * @returns true if a row containing the name is found
   */
  async isOpportunityListed(
    name: string,
    maxAttempts: number = 5,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const count = await this.opportunityRowByName(name).count().catch(() => 0);
      console.log(`  - My Opportunities check attempt ${attempt}/${maxAttempts}: row(s) matching "${name}" = ${count}`);
      if (count > 0) return true;
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.opportunityRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        await this.wait(interval);
      }
    }
    return false;
  }

  /**
   * Read the names of the Opportunities currently listed on the My Opportunities page.
   * @returns array of trimmed Opportunity names (first column)
   */
  async getListedOpportunityNames(): Promise<string[]> {
    const names = await this.page
      .locator("xpath=//tr[contains(@class,'opportunity_table_row')]/td[1]")
      .allTextContents()
      .catch(() => []);
    return names.map((s) => s.trim());
  }

  /**
   * Open an Opportunity's detail page (/my/opportunity/<id>) from the My Opportunities list by its
   * (unique) name. Clicking a row triggers a JS redirect to /my/opportunity/<data-id>.
   * Reload-and-retry tolerates a just-created Opp that needs a moment to surface in the list.
   * @param name - the Opportunity name (Opp Name #1) to open
   * @param maxAttempts - number of (find + reload) attempts (default 5)
   * @param interval - wait between reload attempts (default waitTimes.long)
   * @returns the detail page URL after navigation
   */
  async openOpportunityByName(
    name: string,
    maxAttempts: number = 5,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<string> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const row = this.opportunityRowByName(name).first();
      const count = await row.count().catch(() => 0);
      console.log(`  - Open Opportunity "${name}" attempt ${attempt}/${maxAttempts}: matching row(s) = ${count}`);
      if (count > 0) {
        await row.scrollIntoViewIfNeeded();
        await row.click();
        await this.waitForURL('**/my/opportunity/**', CommonUtils.waitTimes.pageLoad);
        await this.contactCardTitleXPath()
          .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear })
          .catch(() => {});
        return this.page.url();
      }
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.opportunityRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        await this.wait(interval);
      }
    }
    throw new Error(`Opportunity "${name}" was not found on the My Opportunities list`);
  }

  /**
   * Search the My Opportunities list via the portal Search box, then submit (Enter). Waits for the
   * list to re-render. Must already be on /my/opportunities. Mirrors searchInvoices().
   * @param text - the search text (e.g. an Opportunity name)
   */
  async searchOpportunities(text: string): Promise<void> {
    let input = this.opportunitySearchInputXPath();
    const visibleByXPath = await input.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false);
    if (!visibleByXPath) input = this.opportunitySearchInputCss();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await input.scrollIntoViewIfNeeded();
    await input.fill('');
    await input.fill(text);
    await this.page.keyboard.press('Enter');
    await this.waitForURL('**/my/opportunities**', CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.opportunityRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Whether an Opportunity with the given name is listed, located via the portal Search box.
   * Pagination-proof: the Search isolates the row from a large shared list (unlike reading a single
   * page), so it works even when the Reseller has hundreds of unrelated Opportunities. Each attempt
   * re-runs the search and re-queries. Must already be on /my/opportunities.
   * @param name - the Opportunity name to look for
   * @param maxAttempts - number of (search + find) attempts (default 6)
   * @param interval - wait between attempts (default waitTimes.searchOppWait)
   * @returns true if a row containing the name is found
   */
  async isOpportunityListedBySearch(
    name: string,
    maxAttempts: number = 6,
    interval: number = CommonUtils.waitTimes.searchOppWait
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.searchOpportunities(name).catch(() => {});
      const count = await this.opportunityRowByName(name).count().catch(() => 0);
      console.log(`  - Search Opportunity "${name}" attempt ${attempt}/${maxAttempts}: matching row(s) = ${count}`);
      if (count > 0) return true;
      if (attempt < maxAttempts) await this.wait(interval);
    }
    return false;
  }

  /**
   * On the Opportunity detail page, click the "Edit" icon on the CONTACT card to open the
   * "Edit contact" modal. XPath primary, CSS fallback; waits for the modal's Phone input to render.
   */
  async clickEditContact(): Promise<void> {
    let icon = this.editContactIconXPath();
    const visibleByXPath = await icon.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false);
    if (!visibleByXPath) icon = this.editContactIconCss();
    await icon.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await icon.scrollIntoViewIfNeeded();
    await icon.click();
    // Wait for the Bootstrap modal to finish showing - signalled by the Phone input becoming visible.
    let phone = this.contactPhoneInputXPath();
    if (!(await phone.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) phone = this.contactPhoneInputCss();
    await phone.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Fill the "Phone" field inside the open "Edit contact" modal. XPath primary, CSS fallback.
   * @param phone - the phone value to enter (Phone #1)
   */
  async fillContactPhone(phone: string): Promise<void> {
    let input = this.contactPhoneInputXPath();
    const visibleByXPath = await input.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) input = this.contactPhoneInputCss();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.scrollIntoViewIfNeeded();
    await input.fill('');
    await input.fill(phone);
    await this.wait(CommonUtils.waitTimes.short);
  }

  /**
   * Press the "CONFIRM" button in the "Edit contact" modal to save the change.
   * The modal submits via AJAX and the detail page refreshes; waits for the modal to close.
   * XPath primary, CSS fallback.
   */
  async confirmEditContact(): Promise<void> {
    let btn = this.editContactConfirmXPath();
    const visibleByXPath = await btn.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) btn = this.editContactConfirmCss();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    // The submit either reloads the page or hides the modal; tolerate both, then settle.
    let modal = this.editContactModalXPath();
    if (!(await modal.count() > 0)) modal = this.editContactModalCss();
    await modal.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Read the Phone shown on the CONTACT card of the detail page (in-portal evidence).
   * Reads the tel: link text / href; returns "" when blank.
   * @returns the phone string shown on the contact card, or "" if not present
   */
  async getContactCardPhone(): Promise<string> {
    const link = this.contactCardPhoneLink();
    if (!(await link.count() > 0)) return '';
    const text = (await link.textContent().catch(() => '') || '').trim();
    if (text && text !== '-' && text.toLowerCase() !== 'false') return text;
    const href = (await link.getAttribute('href').catch(() => '') || '').trim();
    if (href.toLowerCase().startsWith('tel:')) {
      const num = href.slice(4).trim();
      if (num && num.toLowerCase() !== 'false') return num;
    }
    return '';
  }

  /**
   * Fill a field in the open "Edit contact" modal by its input name. XPath primary, CSS fallback.
   * @param fieldName - the input name: 'partner_name' | 'email_from' | 'phone' | 'mobile'
   * @param value - the value to enter
   */
  private async fillEditContactFieldByName(fieldName: string, value: string): Promise<void> {
    let input = this.editContactFieldByNameXPath(fieldName);
    const visibleByXPath = await input.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) input = this.editContactFieldByNameCss(fieldName);
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.scrollIntoViewIfNeeded();
    await input.fill('');
    await input.fill(value);
    await this.wait(CommonUtils.waitTimes.short);
  }

  /**
   * Fill the "Email" (email_from) field inside the open "Edit contact" modal.
   * @param email - the email value to enter
   */
  async fillContactEmail(email: string): Promise<void> {
    await this.fillEditContactFieldByName('email_from', email);
  }

  /**
   * Fill the "Mobile" (mobile) field inside the open "Edit contact" modal.
   * @param mobile - the mobile value to enter
   */
  async fillContactMobile(mobile: string): Promise<void> {
    await this.fillEditContactFieldByName('mobile', mobile);
  }

  /**
   * Fill the "Customer name" (partner_name) field inside the open "Edit contact" modal.
   * @param name - the customer/company name to enter
   */
  async fillContactCustomerName(name: string): Promise<void> {
    await this.fillEditContactFieldByName('partner_name', name);
  }

  /**
   * Press the "Cancel" link in the "Edit contact" modal to dismiss WITHOUT saving.
   * Waits for the modal to close. XPath primary, CSS fallback.
   */
  async cancelEditContact(): Promise<void> {
    let btn = this.editContactCancelXPath();
    const visibleByXPath = await btn.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) btn = this.editContactCancelCss();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    let modal = this.editContactModalXPath();
    if (!(await modal.count() > 0)) modal = this.editContactModalCss();
    await modal.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Read the Email shown on the CONTACT card of the detail page (in-portal evidence).
   * Reads the mailto: link text / href; returns "" when blank.
   */
  async getContactCardEmail(): Promise<string> {
    const link = this.contactCardEmailLink();
    if (!(await link.count() > 0)) return '';
    const text = (await link.textContent().catch(() => '') || '').trim();
    if (text && text !== '-' && text.toLowerCase() !== 'false') return text;
    const href = (await link.getAttribute('href').catch(() => '') || '').trim();
    if (href.toLowerCase().startsWith('mailto:')) {
      const v = href.slice(7).trim();
      if (v && v.toLowerCase() !== 'false') return v;
    }
    return '';
  }

  /**
   * On the Opportunity detail page, click the "Edit" icon on the OPPORTUNITY card to open the
   * "Edit opportunity" modal. XPath primary, CSS fallback; waits for the Expected-date input to render.
   */
  async clickEditOpportunity(): Promise<void> {
    let icon = this.editOpportunityIconXPath();
    const visibleByXPath = await icon.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false);
    if (!visibleByXPath) icon = this.editOpportunityIconCss();
    await icon.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await icon.scrollIntoViewIfNeeded();
    await icon.click();
    // Wait for the modal to finish showing - signalled by the Expected-date input becoming visible.
    let dateInput = this.oppExpectedDateInputXPath();
    if (!(await dateInput.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) dateInput = this.oppExpectedDateInputCss();
    await dateInput.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Fill the "Expected closing date" (date_deadline) field in the open "Edit opportunity" modal.
   * The field is wired to an mc-calendar datepicker; we set the value directly, dispatch input/change,
   * and dismiss the calendar (Escape). XPath primary, CSS fallback.
   * @param dateStr - the date in the portal's display format (e.g. "08/15/2026", MM/DD/YYYY)
   */
  async fillOpportunityExpectedDate(dateStr: string): Promise<void> {
    let input = this.oppExpectedDateInputXPath();
    const visibleByXPath = await input.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) input = this.oppExpectedDateInputCss();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.fill('');
    await input.fill(dateStr);
    await input.evaluate((el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);
  }

  /**
   * Press the "CONFIRM" button in the "Edit opportunity" modal to save the change.
   * The modal submits via AJAX and the detail page refreshes; waits for the modal to close.
   * XPath primary, CSS fallback.
   */
  async confirmEditOpportunity(): Promise<void> {
    let btn = this.editOpportunityConfirmXPath();
    const visibleByXPath = await btn.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) btn = this.editOpportunityConfirmCss();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    let modal = this.editOpportunityModalXPath();
    if (!(await modal.count() > 0)) modal = this.editOpportunityModalCss();
    await modal.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Read the numeric count badge on a portal Overview (/my) card, e.g. "My Opportunities".
   * Must be on /my; call after waitForPortalReady(). Returns 0 if the card/count is not found.
   * @param label - the card label exactly as shown (e.g. "My Opportunities", "Quotations")
   */
  async getOverviewCount(label: string): Promise<number> {
    const countEl = this.overviewCardCountByLabel(label);
    if (!(await countEl.count() > 0)) return 0;
    const text = (await countEl.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '') || '').trim();
    const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
    return Number.isNaN(n) ? 0 : n;
  }

  /**
   * Read a portal Overview (/my) card count, reload-and-retrying until it reaches at least `target`
   * (or attempts are exhausted). The portal count badge surfaces asynchronously after a record is
   * created, so a single snapshot can lag; this polls. Must be on /my; returns the last value seen.
   * @param label - the card label exactly as shown (e.g. "Invoices")
   * @param target - the minimum count to wait for (e.g. C0 + 1)
   * @param maxAttempts - number of (read + reload) attempts (default 12)
   * @param interval - wait between reloads (default waitTimes.long)
   */
  async getOverviewCountWhenAtLeast(
    label: string,
    target: number,
    maxAttempts: number = 12,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<number> {
    let count = await this.getOverviewCount(label);
    for (let attempt = 1; attempt < maxAttempts && count < target; attempt++) {
      console.log(`  - Overview "${label}" count poll ${attempt}/${maxAttempts}: ${count} (waiting for >= ${target})`);
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.waitForPortalReady().catch(() => {});
      await this.wait(interval);
      count = await this.getOverviewCount(label);
    }
    console.log(`  - Overview "${label}" count settled at ${count} (target >= ${target})`);
    return count;
  }

  /**
   * Read a My Opportunities row's column values by Opportunity name. The list columns are
   * Name | Contact | Stage | Date | Expected Revenue.
   * @param name - the Opportunity name to read
   * @returns the row's column values (whitespace-normalised), or null if the row is not found
   */
  async getOpportunityRowData(
    name: string
  ): Promise<{ name: string; contact: string; stage: string; date: string; revenue: string } | null> {
    if (!(await this.opportunityRowByName(name).count() > 0)) return null;
    const cell = async (idx: number) =>
      ((await this.opportunityRowCell(name, idx).textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
        .replace(/\s+/g, ' ')
        .trim();
    return {
      name: await cell(1),
      contact: await cell(2),
      stage: await cell(3),
      date: await cell(4),
      revenue: await cell(5),
    };
  }

  /**
   * Read the Opportunity name shown on the detail page heading (/my/opportunity/...). XPath primary, CSS fallback.
   */
  async getDetailOpportunityName(): Promise<string> {
    let h = this.detailNameXPath();
    if (!(await h.count() > 0)) h = this.detailNameCss();
    if (!(await h.count() > 0)) return '';
    return ((await h.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Read the Expected Revenue shown on the detail page header. Returns the raw text (e.g. "$ 750.00").
   */
  async getDetailExpectedRevenue(): Promise<string> {
    const el = this.detailExpectedRevenue();
    if (!(await el.count() > 0)) return '';
    return ((await el.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Sort the My Opportunities list via the portal's own sort URL (the dropdown's sortby options).
   * @param key - one of: date | name | contact_name | revenue | probability | stage
   */
  async sortMyOpportunities(key: 'date' | 'name' | 'contact_name' | 'revenue' | 'probability' | 'stage'): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    await this.page.goto(`${origin}/my/opportunities?sortby=${key}`, { waitUntil: 'domcontentloaded' });
    await this.waitForURL(`**/my/opportunities?sortby=${key}**`, CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.opportunityRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
  }

  /**
   * Filter the My Opportunities list via the portal's own filter URL (the dropdown's filterby options).
   * @param key - one of: all | active | today | week | overdue | won | lost
   */
  async filterMyOpportunities(key: 'all' | 'active' | 'today' | 'week' | 'overdue' | 'won' | 'lost'): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    await this.page.goto(`${origin}/my/opportunities?filterby=${key}`, { waitUntil: 'domcontentloaded' });
    await this.waitForURL(`**/my/opportunities?filterby=${key}**`, CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.opportunityRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
  }

  // ─── My Invoices (/my/invoices) ───────────────────────────────────────────

  /**
   * Click the "My invoices" button/link on the portal home; lands on /my/invoices.
   * XPath primary, CSS fallback (mirrors clickMyOpportunities).
   */
  async clickMyInvoices(): Promise<void> {
    let link = this.myInvoicesLinkXPath();
    const visibleByXPath = await link.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false);
    if (!visibleByXPath) link = this.myInvoicesLinkCss();
    await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await this.waitForURL('**/my/invoices**', CommonUtils.waitTimes.pageLoad);
    await this.invoiceRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
  }

  /**
   * Navigate DIRECTLY to the My Invoices list by URL (works from anywhere, e.g. from an invoice detail
   * page where the "My invoices" nav card is not present). Use to reset the list to an unfiltered state.
   */
  async gotoMyInvoices(): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    await this.page.goto(`${origin}/my/invoices`, { waitUntil: 'domcontentloaded' });
    await this.waitForURL('**/my/invoices**', CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.invoiceRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Read the invoice numbers currently listed on the My Invoices page (for evidence/logging).
   * @returns array of trimmed text for each invoice row's detail link
   */
  async getListedInvoiceNumbers(): Promise<string[]> {
    const texts = await this.page
      .locator("xpath=//tr[contains(@class,'invoice_table_row')]/td[1]")
      .allTextContents()
      .catch(() => []);
    return texts.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 0);
  }

  /**
   * Verify an invoice with the given number is listed on the My Invoices page.
   * The page is server-rendered; reload-and-retry tolerates a just-validated invoice that needs a
   * brief moment to surface in the partner's portal.
   * @param number - the Invoice number to look for (e.g. "INV/2026/00001")
   * @param maxAttempts - number of (check + reload) attempts (default 5)
   * @param interval - wait between reload attempts (default waitTimes.long)
   * @returns true if a row containing the number is found
   */
  async isInvoiceListed(
    number: string,
    maxAttempts: number = 5,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const count = await this.invoiceRowByNumber(number).count().catch(() => 0);
      console.log(`  - My Invoices check attempt ${attempt}/${maxAttempts}: row(s) matching "${number}" = ${count}`);
      if (count > 0) return true;
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.invoiceRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        await this.wait(interval);
      }
    }
    return false;
  }

  /**
   * Open an invoice's detail page (/my/invoices/<id>) from the My Invoices list by its number.
   * Each attempt Search-filters the list by the number (pagination-proof) and re-queries the
   * server, tolerating a just-validated invoice that needs a moment to surface in the list.
   * @param number - the Invoice number (Invoice Number #1) to open
   * @param maxAttempts - number of (search + find) attempts (default 6)
   * @param interval - wait between attempts (default waitTimes.searchOppWait)
   * @returns the detail page URL after navigation
   */
  async openInvoiceByNumber(
    number: string,
    maxAttempts: number = 6,
    interval: number = CommonUtils.waitTimes.searchOppWait
  ): Promise<string> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Filter the list by the exact number each round. This is (a) pagination-proof - a
      // reseller accumulates many invoices, so a fresh one may not be on the first list page -
      // and (b) a fresh server query, giving a just-validated invoice a moment to surface.
      await this.searchInvoices(number).catch(() => {});
      const row = this.invoiceRowByNumber(number);
      const count = await row.count().catch(() => 0);
      console.log(`  - Open Invoice "${number}" attempt ${attempt}/${maxAttempts}: matching row(s) = ${count}`);
      if (count > 0) {
        await row.scrollIntoViewIfNeeded();
        // The row has no <a>; clicking it triggers a JS redirect to its data-href (/my/invoices/<id>).
        await row.click();
        await this.waitForURL('**/my/invoices/*', CommonUtils.waitTimes.pageLoad).catch(() => {});
        await this.invoiceDetailNumberXPath()
          .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear })
          .catch(() => {});
        await this.wait(CommonUtils.waitTimes.long);
        return this.page.url();
      }
      if (attempt < maxAttempts) await this.wait(interval);
    }
    throw new Error(`Invoice "${number}" was not found on the My Invoices list`);
  }

  /**
   * Read the Invoice number shown at the TOP of the invoice detail page (/my/invoices/<id>).
   * The portal renders it as the page title heading (<h1 class="title title--mb">INV/2026/00001</h1>).
   * XPath primary, CSS fallback; whitespace-normalised. Returns "" if not found.
   */
  async getDetailInvoiceNumber(): Promise<string> {
    let h = this.invoiceDetailNumberXPath();
    const visibleByXPath = await h.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false);
    if (!visibleByXPath) h = this.invoiceDetailNumberCss();
    if (!(await h.count() > 0)) return '';
    const value = ((await h.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
      .replace(/\s+/g, ' ')
      .trim();
    console.log(`  - Portal invoice detail number (top of page): "${value}"`);
    return value;
  }

  /**
   * Read a My Invoices row's column values by Invoice number. Columns are
   * Invoice # | Invoice Date | Due Date | Status | Amount Due.
   * @param number - the Invoice number to read (e.g. "INV/2026/00001")
   * @returns the row's column values (whitespace-normalised), or null if the row is not found
   */
  async getInvoiceRowData(
    number: string
  ): Promise<{ number: string; invoiceDate: string; dueDate: string; status: string; amountDue: string } | null> {
    if (!(await this.invoiceRowByNumber(number).count() > 0)) return null;
    const cell = async (idx: number) =>
      ((await this.invoiceRowCell(number, idx).textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
        .replace(/\s+/g, ' ')
        .trim();
    return {
      number: await cell(1),
      invoiceDate: await cell(2),
      dueDate: await cell(3),
      status: await cell(4),
      amountDue: await cell(5),
    };
  }

  /**
   * Verify whether an invoice with the given BACKEND id is listed on the My Invoices page (matches the
   * row's data-href = /my/invoices/<id>?...). Used for the negative case (a Draft invoice that should
   * NOT be listed): reload-and-retry a few times, then conclude absent.
   * @param backendId - the account.invoice record id (from the backend invoice form URL)
   * @param maxAttempts - number of (check + reload) attempts (default 4)
   * @param interval - wait between reload attempts (default waitTimes.long)
   * @returns true if a row whose data-href carries that id is found
   */
  async isInvoiceIdListed(
    backendId: string,
    maxAttempts: number = 4,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const count = await this.invoiceRowById(backendId).count().catch(() => 0);
      console.log(`  - My Invoices id-check attempt ${attempt}/${maxAttempts}: row(s) with data-href id "${backendId}" = ${count}`);
      if (count > 0) return true;
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.invoiceRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        await this.wait(interval);
      }
    }
    return false;
  }

  /**
   * Open an invoice's detail page directly by its portal URL (deep link with access token), as if the
   * Reseller followed a bookmarked/emailed link. Waits for the detail number heading to render.
   * @param url - the /my/invoices/<id>?access_token=... URL
   */
  async openInvoiceByUrl(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.invoiceDetailNumberXPath()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear })
      .catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Search the My Invoices list via the portal Search box, then submit (Enter). Waits for the list to
   * re-render. Must already be on /my/invoices.
   * @param text - the search text (e.g. an Invoice number)
   */
  async searchInvoices(text: string): Promise<void> {
    let input = this.invoiceSearchInputXPath();
    const visibleByXPath = await input.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false);
    if (!visibleByXPath) input = this.invoiceSearchInputCss();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await input.scrollIntoViewIfNeeded();
    await input.fill('');
    await input.fill(text);
    await this.page.keyboard.press('Enter');
    await this.waitForURL('**/my/invoices**', CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.invoiceRows().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  // ─── Invoice detail page extras (UC-B-1: multi-product invoice) ─────────────

  /**
   * Whether the "Pay now" button is present on the invoice detail page (left side).
   * @param timeout - how long to wait for the button (default: elementAppear)
   */
  async hasPayNowButton(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<boolean> {
    let btn = this.payNowButtonXPath();
    let visible = await btn.isVisible({ timeout }).catch(() => false);
    if (!visible) {
      btn = this.payNowButtonCss();
      visible = await btn.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    }
    console.log(`  - "Pay now" button present: ${visible}`);
    return visible;
  }

  /**
   * Read the left-side summary amount on the invoice detail page (the invoice Total / Amount Due).
   * Returns the trimmed text, e.g. "$ 85.85". XPath primary, CSS fallback.
   */
  async getDetailTotalAmount(): Promise<string> {
    let block = this.detailTotalBlockXPath();
    if (!(await block.count().catch(() => 0))) block = this.detailTotalBlockCss();
    await block.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear }).catch(() => {});
    const value = ((await block.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
      .replace(/\s+/g, ' ')
      .trim();
    console.log(`  - Portal invoice detail total (left side): "${value}"`);
    return value;
  }

  /**
   * Wait for the invoice-line table inside the #invoice_html iframe to render.
   * @param timeout - how long to wait (default: elementAppear)
   */
  async waitForDetailLineTable(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<void> {
    await this.invoiceLineTableInFrame().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Read a product line's Quantity and Amount from the invoice-line table inside the #invoice_html
   * iframe, identified by text in its Description cell (e.g. a product code like "[A2149B]").
   * The "Amount" is the GROSS line amount (before the order-level Partner Discount), matching the
   * invoice form's per-line Subtotal. Column order in the iframe row:
   *   1 Description (td[@name="account_invoice_line_name"]) | 2 Source Document (d-none) |
   *   3 Quantity ("<n> <uom>") | 4 Unit Price (d-none d-md-table-cell) | 5 Amount (td.o_price_total).
   * @param descriptionContains - text to match in the line Description (product code/name)
   * @returns { quantity, amount } trimmed strings, or null if the line is not found
   */
  async getDetailProductLine(
    descriptionContains: string
  ): Promise<{ quantity: string; amount: string } | null> {
    const code = descriptionContains.replace(/["]/g, '');
    const rowXp = `//table[@name='invoice_line_table']//tbody//tr[.//td[@name='account_invoice_line_name'][contains(.,"${code}")]]`;
    const row = this.invoiceLineFrame().locator(`xpath=${rowXp}`).first();
    const found = await row.count().catch(() => 0);
    if (!found) {
      console.log(`  - Portal invoice line "${descriptionContains}": NOT FOUND`);
      return null;
    }
    // Quantity is the 3rd td ("1 Socket"); take its full text (caller parses the leading number).
    const quantity = ((await this.invoiceLineFrame().locator(`xpath=${rowXp}/td[3]`).first()
      .textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
      .replace(/\s+/g, ' ').trim();
    // Amount is the o_price_total cell's currency value (gross line amount).
    const amount = ((await this.invoiceLineFrame()
      .locator(`xpath=${rowXp}//td[contains(@class,'o_price_total')]`).first()
      .textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
      .replace(/\s+/g, ' ').trim();
    console.log(`  - Portal invoice line "${descriptionContains}": quantity="${quantity}" amount="${amount}"`);
    return { quantity, amount };
  }

  /**
   * Read the totals breakdown rows (Subtotal / Partner Discount / Total) from the invoice-detail
   * iframe (#invoice_html). Each row is a <tr class="o_total"> with a <strong> label and a
   * right-aligned amount cell. Returns the rows in document order as { label, amount } pairs.
   */
  async getDetailTotalsBreakdown(): Promise<{ label: string; amount: string }[]> {
    await this.waitForDetailLineTable();
    const rows = this.invoiceLineFrame().locator("xpath=//div[@id='total']//tr[contains(@class,'o_total')]");
    const n = await rows.count().catch(() => 0);
    const out: { label: string; amount: string }[] = [];
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const label = ((await row.locator('xpath=./td[1]').textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
        .replace(/\s+/g, ' ').trim();
      const amount = ((await row.locator("xpath=./td[contains(@class,'text-right')]").textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
        .replace(/\s+/g, ' ').trim();
      if (label) out.push({ label, amount });
    }
    console.log(`  - Portal invoice totals breakdown: ${JSON.stringify(out)}`);
    return out;
  }

  /**
   * Whether the "This invoice is paid" success message is shown in the LEFT column of the invoice
   * detail page (rendered as <h4 class="text-success">This invoice is paid</h4> in the .q-page left
   * panel for a fully-paid invoice). XPath primary (exact text), CSS fallback (text-success heading
   * whose text matches). Used by UC-B.8.1.
   * @param timeout - how long to wait for the message (default: elementAppear)
   */
  async isInvoicePaidMessageShown(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<boolean> {
    let visible = await this.paidMessageXPath().isVisible({ timeout }).catch(() => false);
    if (!visible) {
      const txt = ((await this.paidMessageCss().textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
        .replace(/\s+/g, ' ')
        .trim();
      visible = /this invoice is paid/i.test(txt);
    }
    console.log(`  - "This invoice is paid" message shown (left column): ${visible}`);
    return visible;
  }

  /**
   * Read the "This invoice is paid" message text from the LEFT column (whitespace-normalised).
   * Returns "" when the message is absent.
   */
  async getInvoicePaidMessage(): Promise<string> {
    let el = this.paidMessageXPath();
    if (!(await el.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false))) el = this.paidMessageCss();
    if (!(await el.count() > 0)) return '';
    return ((await el.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Read the "Amount Due" value from the RIGHT-side invoice document (inside the #invoice_html iframe).
   * For a fully-paid invoice this reads "$ 0.00". Returns the trimmed text, or "" if the row is absent.
   * The Amount Due row is a border-black row in the totals block - distinct from the o_total rows that
   * getDetailTotalsBreakdown returns. Used by UC-B.8.1.
   */
  async getDetailAmountDue(): Promise<string> {
    await this.waitForDetailLineTable();
    const cell = this.detailAmountDueValueInFrame();
    if (!(await cell.count().catch(() => 0))) {
      console.log('  - Portal invoice detail "Amount Due" row: NOT FOUND');
      return '';
    }
    const value = ((await cell.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
      .replace(/\s+/g, ' ')
      .trim();
    console.log(`  - Portal invoice detail Amount Due (right side): "${value}"`);
    return value;
  }

  /**
   * Read EVERY row of the right-side totals block (#total) inside the #invoice_html iframe, in document
   * order, as { label, amount } pairs. Unlike getDetailTotalsBreakdown (which returns only the o_total
   * rows - Subtotal / Partner Discount / Total), this includes the payment rows too, e.g. a
   * "Paid on <date>" line and the "Amount Due" row. Used by UC-B.8 to assert a paid invoice shows its
   * payment. Label reads td[1] (covers <strong> and the <i class="oe_payment_label"> "Paid on ..." node).
   */
  async getDetailTotalsAllRows(): Promise<{ label: string; amount: string }[]> {
    await this.waitForDetailLineTable();
    const rows = this.invoiceLineFrame().locator("xpath=//div[@id='total']//tr");
    const n = await rows.count().catch(() => 0);
    const out: { label: string; amount: string }[] = [];
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const label = ((await row.locator('xpath=./td[1]').textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
        .replace(/\s+/g, ' ').trim();
      const amount = ((await row.locator("xpath=./td[contains(@class,'text-right')]").textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
        .replace(/\s+/g, ' ').trim();
      if (label) out.push({ label, amount });
    }
    console.log(`  - Portal invoice #total rows: ${JSON.stringify(out)}`);
    return out;
  }

  /**
   * Count the product lines rendered in the invoice-line table (#invoice_html iframe). A product row
   * carries a Description cell `td[@name="account_invoice_line_name"]`. Used by UC-B.8 to assert a paid
   * invoice still lists its product line(s). Returns 0 if the table/rows are absent.
   */
  async getDetailProductLineCount(): Promise<number> {
    await this.waitForDetailLineTable();
    const count = await this.invoiceLineFrame()
      .locator("xpath=//table[@name='invoice_line_table']//tbody//tr[.//td[@name='account_invoice_line_name']]")
      .count()
      .catch(() => 0);
    console.log(`  - Portal invoice detail product line count: ${count}`);
    return count;
  }

  // ─── Opportunity detail "Comment" section (UC-C: Reseller posts a customer-visible message) ──

  /**
   * Wait for the Opportunity detail "Comment" section to be ready - signalled by the composer
   * textarea rendering. Call after openOpportunityByName before posting a comment.
   */
  async waitForCommentSectionReady(): Promise<void> {
    await this.commentChatterWrapper()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear })
      .catch(() => {});
    let ta = this.commentTextareaXPath();
    if (!(await ta.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) ta = this.commentTextareaCss();
    await ta.scrollIntoViewIfNeeded().catch(() => {});
    await ta.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
  }

  /**
   * Read the comment-count badge's numeric `count` attribute from the chatter header (0 when none).
   */
  async getPortalCommentCount(): Promise<number> {
    const badge = this.commentCountBadge();
    if (!(await badge.count() > 0)) return 0;
    const attr = (await badge.getAttribute('count').catch(() => '')) || '';
    const n = parseInt(attr.replace(/[^0-9]/g, ''), 10);
    return Number.isNaN(n) ? 0 : n;
  }

  /**
   * Read the text of the posted-comments list container (in-portal evidence; whitespace-normalised).
   * Returns "" when the container is absent.
   */
  async getPortalCommentsText(): Promise<string> {
    let c = this.commentMessagesContainerXPath();
    if (!(await c.count() > 0)) c = this.commentMessagesContainerCss();
    if (!(await c.count() > 0)) return '';
    return ((await c.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Click the "Click here to fetch lastest messages" refresh link to load newly-posted comments
   * into the list. XPath primary, CSS fallback; best-effort (no-op if the link is absent).
   */
  async clickFetchLatestMessages(): Promise<void> {
    let link = this.fetchLatestMessagesLinkXPath();
    if (!(await link.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) link = this.fetchLatestMessagesLinkCss();
    if (!(await link.count() > 0)) return;
    await link.scrollIntoViewIfNeeded().catch(() => {});
    await link.click().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Fill the message textarea in the Opportunity detail "Comment" section (does NOT submit).
   * XPath primary, CSS fallback. Mirrors the manual "leave a test message" step.
   * @param message - the comment text to enter
   */
  async fillCommentMessage(message: string): Promise<void> {
    let ta = this.commentTextareaXPath();
    if (!(await ta.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) ta = this.commentTextareaCss();
    await ta.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await ta.scrollIntoViewIfNeeded();
    await ta.fill('');
    await ta.fill(message);
    await this.wait(CommonUtils.waitTimes.short);
  }

  /**
   * Press the "Comment" submit button to post the message currently in the composer textarea.
   * The portal posts via the p-form submit (a brief o_loader spinner shows); waits for the submit
   * to settle. XPath primary, CSS fallback. Mirrors the manual "Press COMMENT button" step.
   */
  async submitComment(): Promise<void> {
    let btn = this.commentSubmitButtonXPath();
    if (!(await btn.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) btn = this.commentSubmitButtonCss();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    // Let the submit/AJAX settle (the page either posts in place or reloads the detail).
    await this.wait(CommonUtils.waitTimes.extraLong);
  }

  /**
   * Convenience: fill the comment textarea and press "Comment" in one call. Does not assert the post
   * landed - use waitForPortalCommentContaining for in-portal evidence, or verify in the backend chatter.
   * @param message - the comment text to post
   */
  async postComment(message: string): Promise<void> {
    await this.fillCommentMessage(message);
    await this.submitComment();
  }

  /**
   * Verify a just-posted comment surfaces in the portal comments list. Clicks "fetch lastest messages"
   * and reloads the detail page between attempts (the list can lag the post). Returns true once the
   * comments-container text contains the message.
   * @param message - the comment text to look for
   * @param maxAttempts - number of (fetch + check, then reload) attempts (default 5)
   * @param interval - wait between attempts (default waitTimes.long)
   */
  async waitForPortalCommentContaining(
    message: string,
    maxAttempts: number = 5,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<boolean> {
    const needle = message.replace(/\s+/g, ' ').trim();
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.clickFetchLatestMessages().catch(() => {});
      const text = await this.getPortalCommentsText();
      const count = await this.getPortalCommentCount();
      console.log(`  - Portal comment check attempt ${attempt}/${maxAttempts}: count=${count}, contains message=${text.includes(needle)}`);
      if (text.includes(needle)) return true;
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.waitForCommentSectionReady().catch(() => {});
        await this.wait(interval);
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Portal CARD PAYMENT (#pay_with) - CRM-12373
  //   "Pay now" on the invoice detail expands the #pay_with block on the SAME page. The card fields
  //   are Stripe.js v3 Elements, each mounted in its own iframe served from js.stripe.com, so they
  //   are reachable from Playwright (they are NOT a provider-hosted page). Acquirer 8
  //   "Stripe (Credit Сard)" runs in `environment = test` on pre-prod, so Stripe test cards work.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Click "Pay now" on the invoice detail page and wait for the #pay_with payment block to render.
   * @param timeout - max time to wait for the block (default: elementAppear)
   */
  async clickPayNow(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<void> {
    let btn = this.payNowButtonXPath();
    if (!(await btn.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) {
      btn = this.payNowButtonCss();
    }
    await btn.click({ timeout });
    await this.payWithBlock().waitFor({ state: 'visible', timeout });
    await this.wait(CommonUtils.waitTimes.extraLong); // let Stripe mount its Elements iframes
    console.log('  - "Pay now" clicked; the #pay_with payment block is open');
  }

  /**
   * Read the acquirer radio values offered in the #pay_with block, e.g. ["new_8"].
   * The value encodes the payment.acquirer id ("new_<id>" = pay with a NEW card on that acquirer).
   */
  async getPaymentAcquirerValues(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string[]> {
    await this.acquirerRadios().first().waitFor({ state: 'attached', timeout }).catch(() => {});
    const values = await this.acquirerRadios().evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).value)
    ).catch(() => [] as string[]);
    console.log(`  - Acquirer options in #pay_with: ${values.length ? values.join(', ') : '(none)'}`);
    return values;
  }

  /**
   * Select an acquirer in the #pay_with block by its radio value ("new_<acquirer id>").
   * Idempotent - the block usually pre-selects the only published acquirer.
   * @param value - the radio value, e.g. "new_8" for Stripe on pre-prod
   */
  async selectPaymentAcquirer(value: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    const radio = this.acquirerRadioByValue(value);
    await radio.waitFor({ state: 'attached', timeout });
    // The radio is often visually replaced by a styled label, so check() can miss - click it via JS.
    await radio.evaluate((el) => (el as HTMLInputElement).click()).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    const checked = await radio.isChecked().catch(() => false);
    console.log(`  - Acquirer "${value}" selected: ${checked}`);
  }

  /**
   * Fill ONE Stripe Elements field. Each Element lives in its own js.stripe.com iframe and the inputs
   * carry Stripe's stable names (cardnumber / exp-date / cvc / postal), so the frame is located by
   * looking for that input rather than by iframe order (which is not stable).
   *
   * Stripe Elements ignore Locator.fill() (they need real key events), so the value is typed.
   *
   * The Elements re-format WHILE you type (the expiry Element inserts " / " after the month), and a
   * keystroke landing during that re-render is swallowed - "1229" then echoes back as "12 / 2" and
   * Stripe rejects the card with "Your expiration date is incomplete". So the value is typed, read
   * back, and retyped with a longer delay until the digits Stripe holds match the digits asked for.
   *
   * @returns the value Stripe echoes back in the input (formatted), or "" when the field was not found
   */
  private async fillStripeElement(
    inputName: string,
    value: string,
    timeout: number = CommonUtils.waitTimes.abnormalWait
  ): Promise<string> {
    const wantedDigits = value.replace(/\D/g, '');
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const frame of this.page.frames()) {
        if (!/js\.stripe\.com/.test(frame.url())) continue;
        const input = frame.locator(`input[name="${inputName}"]`).first();
        if (!(await input.count().catch(() => 0))) continue;

        let echoed = '';
        for (let attempt = 1; attempt <= 3; attempt++) {
          await input.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
          // Clear whatever a previous attempt left behind before retyping.
          await input.press('Control+a').catch(() => {});
          await input.press('Backspace').catch(() => {});
          await input.pressSequentially(value, { delay: attempt * 90 });
          echoed = (await input.inputValue().catch(() => '')) || '';
          if (echoed.replace(/\D/g, '') === wantedDigits) {
            console.log(`  - Stripe field "${inputName}" filled -> "${echoed}"`);
            return echoed;
          }
          console.log(`  - Stripe field "${inputName}" came back as "${echoed}", expected digits "${wantedDigits}" (attempt ${attempt}/3) - retyping slower`);
        }
        console.log(`  ⚠ Stripe field "${inputName}" would not accept "${value}"; last value "${echoed}"`);
        return echoed;
      }
      await this.wait(CommonUtils.waitTimes.standard);
    }
    console.log(`  ⚠ Stripe field "${inputName}" not found in any js.stripe.com frame`);
    return '';
  }

  /**
   * Fill the whole Stripe card form (number, expiry, CVC and - when the Element is mounted - ZIP).
   * ZIP is optional because Stripe only renders the postal Element for some account/country configs.
   * @returns what Stripe echoed back per field, so the caller can assert the form really took the data
   */
  async fillStripeCardDetails(card: {
    number: string;
    expiry: string;
    cvc: string;
    zip?: string;
  }): Promise<{ number: string; expiry: string; cvc: string; zip: string }> {
    const numberEcho = await this.fillStripeElement('cardnumber', card.number);
    const expiryEcho = await this.fillStripeElement('exp-date', card.expiry);
    const cvcEcho = await this.fillStripeElement('cvc', card.cvc);
    const zipEcho = card.zip ? await this.fillStripeElement('postal', card.zip) : '';
    return { number: numberEcho, expiry: expiryEcho, cvc: cvcEcho, zip: zipEcho };
  }

  /**
   * Press the "PAY NOW" submit button inside the #pay_with block. Does NOT wait for the outcome -
   * pair it with waitForPaymentToLeaveTheForm() / the paid-banner poll.
   */
  async submitPortalPayment(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<void> {
    const btn = this.submitPaymentButton();
    await btn.waitFor({ state: 'visible', timeout });
    await btn.click({ timeout });
    console.log('  - Submitted the portal card payment ("PAY NOW")');
  }

  /**
   * Wait for the browser to leave the invoice form after submitting - Odoo posts the s2s transaction
   * and then hands over to /payment/process (which polls the transaction) before returning to the
   * portal. Returns the URL it landed on; "" when it never navigated.
   * @param timeout - max time to wait (default: pageLoad)
   */
  async waitForPaymentToLeaveTheForm(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<string> {
    const startUrl = this.page.url();
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const url = this.page.url();
      if (url !== startUrl) {
        console.log(`  - Payment submitted; the portal navigated to: ${url}`);
        return url;
      }
      await this.wait(CommonUtils.waitTimes.standard);
    }
    console.log('  ⚠ The page never navigated after submitting the payment');
    return '';
  }

  /**
   * Read any Stripe / Odoo payment error surfaced in the #pay_with block (e.g. a declined card or a
   * validation message). Returns "" when the block is gone or carries no alert.
   */
  async getPortalPaymentError(timeout: number = CommonUtils.waitTimes.long): Promise<string> {
    const alert = this.page.locator('#pay_with .alert, #pay_with .o_payment_form_error, #pay_with .text-danger');
    await alert.first().waitFor({ state: 'attached', timeout }).catch(() => {});
    const texts = await alert.allTextContents().catch(() => [] as string[]);
    const joined = texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ');
    if (joined) console.log(`  - Portal payment error text: "${joined}"`);
    return joined;
  }

  /**
   * Reload the portal invoice page and poll until it shows the "This invoice is paid" banner.
   * The s2s transaction can still be in `/payment/process` when the browser first returns, so a
   * one-shot read is not enough.
   * @param invoiceUrl - the portal invoice detail URL (/my/invoices/<id>?access_token=...)
   * @param maxAttempts - how many reload/poll rounds (default 10)
   * @param interval - wait between rounds (default: extraLong)
   */
  async waitForPortalInvoicePaid(
    invoiceUrl: string,
    maxAttempts: number = 10,
    interval: number = CommonUtils.waitTimes.extraLong
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      const paid = await this.isInvoicePaidMessageShown(CommonUtils.waitTimes.abnormalWait).catch(() => false);
      console.log(`  - Portal "invoice is paid" poll ${attempt}/${maxAttempts}: ${paid}`);
      if (paid) return true;
      if (attempt < maxAttempts) await this.wait(interval);
    }
    return false;
  }
}
