import { CommonUtils } from '@/helpers/common.utils';
import { Page } from '@playwright/test';

/**
 * Base Page Object
 * Contains common methods and properties shared across all pages
 */
export class BasePage {
  constructor(protected page: Page) {}

  // ---------------------------------------------------------------------------
  // Private XPath selector strings
  // ---------------------------------------------------------------------------

  private readonly DISCARD_CHANGES_DIALOG_XPATH =
    'xpath=//div//main[contains(text(),"The record has been modified, your changes will be discarded. Do you want to proceed?")]';

  private readonly DISCARD_CHANGES_OK_BUTTON_XPATH =
    'xpath=//button[normalize-space()="Ok"]';
// Applications menu link using XPath - updated to match the actual element
  private readonly applicationMenuLink_basePage = () => this.page.locator('//a[@title="Applications"]').or(this.page.locator('//button[contains(., "Applications")]')).first();
  // User menu link using XPath - updated to match the actual element
  private readonly userMenuLink_basePage = () => this.page.locator('//li[@class="o_user_menu"]').first();
  // Record form view container (XPath primary, CSS fallback)
  private readonly formView_basePage = () => this.page.locator('//div[contains(@class,"o_form_view")]').or(this.page.locator('.o_form_view')).first();
  // Loading mask / jQuery blockUI overlay that intercepts pointer events while Odoo is busy
  private readonly loadingOverlay_basePage = () => this.page.locator('.blockUI.blockOverlay, .o_blockUI, .o_loading, .oe_loading');
  // ---------------------------------------------------------------------------
  // Private locator methods
  // ---------------------------------------------------------------------------

  /**
   * Locator for Edit button (appears after saving a form)
   */
  protected editButton() {
    // XPath primary, role fallback: on the O12 CE Migration server's backend theme the toolbar Edit
    // control does not resolve through getByRole('button', {name: 'Edit'}) at all (clickEdit() then
    // reports "no Edit button" and the form never enters edit mode), while the class / text XPath -
    // the form used by LeadPage and DealElementPage, both proven on that host - does.
    return this.page.locator("xpath=//button[contains(@class,'o_form_button_edit') or normalize-space(.)='Edit' or normalize-space(.)='EDIT']")
      .or(this.page.getByRole('button', { name: /^\s*Edit\s*$/i }))
      .first();
  }

  /**
   * Locator for Discard button on the form toolbar
   */
  protected discardButton() {
    return this.page.locator(
      'xpath=(//button[normalize-space()="Discard" or normalize-space()="DISCARD"])[1]'
    ).first();
  }

  /**
   * Locator for readonly form state
   */
  protected readonlyForm() {
    return this.page.locator('.o_form_readonly');
  }

  /**
   * Locator for "record has been modified" discard-changes dialog
   */
  private discardChangesDialog() {
    return this.page.locator(this.DISCARD_CHANGES_DIALOG_XPATH).first();
  }

  /**
   * Locator for OK button searched from page root (not scoped inside dialog)
   */
  private discardChangesOkButton() {
    return this.page.locator(this.DISCARD_CHANGES_OK_BUTTON_XPATH).first();
  }

  /**
   * Locator for error dialog. Matches both the "Odoo Client Error" popup ("An error occurred")
   * and the "Odoo Server Error - Missing Record" popup ("Record does not exist or has been
   * deleted", e.g. a stale mail.followers chatter record). Both carry an OK button and must be
   * dismissed so they do not intercept clicks on the underlying form.
   */
  private errorDialog() {
    return this.page
      .locator('.modal, .o_dialog')
      .filter({ hasText: /error occurred|has been deleted|does not exist|Server Error|Missing Record/i });
  }

  /**
   * Locator for OK button inside the error dialog
   */
  private errorDialogOkButton() {
    return this.errorDialog().getByRole('button', { name: /^OK$/i });
  }

  /**
   * Navigate to a specific URL
   */
  async goto(url: string, options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }) {
    await this.page.goto(url, options);
  }
/**
   * Navigate to a specific URL
   */
  async goto2(url: string, options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }) {
    await this.page.evaluate(() => {
  // Force OWL/Odoo to think there are no unsaved changes
  window.onbeforeunload = null;
});
await this.page.goto(url, options);
  }
  /**
   * Navigate to a specific URL
   */
  async goto3(url: string, options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }) {
    await this.page.evaluate((url) => window.location.href = url, url);
  }
  /**
   * Navigate to a specific URL
   */
  async goto4(url: string, options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }) {
    const newPage = await this.page.context().newPage();
await newPage.goto(url);
// use newPage for teardown, then close it
await newPage.close();
  }
  /**
   * Wait for URL pattern
   */
  async waitForURL(pattern: string | RegExp, timeout: number = 60000) {
    await this.page.waitForURL(pattern, { timeout, waitUntil: 'domcontentloaded' });
  }

  /**
   * Wait for a specific amount of time
   */
  async wait(milliseconds: number) {
    if (milliseconds === undefined || milliseconds === null || typeof milliseconds !== 'number') {
      throw new Error(`BasePage.wait(): Invalid milliseconds parameter: ${milliseconds} (type: ${typeof milliseconds})`);
    }
    await this.page.waitForTimeout(milliseconds);
  }

  /**
   * Set browser viewport size
   */
  async setViewport(width: number, height: number) {
    await this.page.setViewportSize({ width, height });
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Take a screenshot
   */
  async screenshot(path: string) {
    await this.page.screenshot({ path });
  }

  /**
   * Wait for the loading spinner to disappear
   * Common loading indicator that appears when saving/loading data
   */
  async waitForLoadingSpinnerToHide(timeout: number = 30000) {
    await this.page.waitForSelector('text=Loading', { state: 'hidden', timeout });
  }

  /**
   * Wait for URL to include a valid ID parameter and extract it
   * Common pattern after saving entities (Leads, Contacts, Opportunities)
   * @param timeout - Maximum time to wait for ID in URL
   * @returns The extracted ID from URL, or empty string if not found
   */
  async waitForIdInUrlAndExtract(timeout: number = 30000): Promise<string> {
    // Wait for URL to include a valid ID (not empty)
    await this.page.waitForFunction(() => {
      const url = window.location.href;
      const match = url.match(/[?&#]id=(\d+)/);
      return match && match[1];
    }, { timeout });
    
    // Extract the ID from current URL
    const currentUrl = this.page.url();
    const idMatch = currentUrl.match(/[?&#]id=(\d+)/);
    return idMatch ? idMatch[1] : '';
  }

  /**
   * Readonly value of a field located by its Odoo FIELD NAME rather than by its on-screen label.
   * Label/row lookups (`td:has-text("Contact Name")`) depend on the theme's table markup and miss on
   * the O12 Migration server's sidebar theme; the `name` attribute Odoo puts on every rendered field
   * is identical on both hosts. XPath primary, CSS fallback.
   */
  protected fieldValueByName(field: string) {
    return this.page
      .locator(`xpath=//span[@name="${field}"] | //div[@name="${field}"] | //a[@name="${field}"]`)
      .or(this.page.locator(`span[name="${field}"], div[name="${field}"], a[name="${field}"]`));
  }

  /**
   * Text of a saved (readonly) field, located by its Odoo field name.
   *
   * Scans EVERY node carrying that field name and returns the first non-empty one: an Odoo form
   * regularly renders the same field more than once (invisible groups, lead-vs-opportunity view
   * variants), and the first copy in DOM order is often the empty one - taking `.first()` blindly
   * reports a saved value as missing.
   * @returns the trimmed text, or '' when no copy holds a value (Odoo's empty "false" counts as empty)
   */
  protected async readFieldTextByName(field: string): Promise<string> {
    const nodes = this.fieldValueByName(field);
    const total = Math.min(await nodes.count(), 8);
    for (let i = 0; i < total; i++) {
      const text = ((await nodes.nth(i).textContent().catch(() => '')) || '').trim();
      if (text && !/^false$/i.test(text)) return text;
    }
    return '';
  }

  /**
   * The saved Address as shown on the form, read robustly.
   *
   * Three traps this handles, all hit on the O12 CE Migration server:
   *  1. `td:has-text("Address")` also matches *"Address Type"* - a different field - and happily
   *     returns "Address TypeContact". Match the label EXACTLY instead.
   *  2. The Address row is rendered more than once; the copy that comes first in DOM order can hold
   *     the label only. Scan the matches for one that carries a value.
   *  3. Odoo re-renders the readonly form right AFTER save (a 0.4 s save is normal here), so a single
   *     read can land before the address exists. Poll for a few seconds before giving up.
   * @returns the address text, or '' when the form really shows no address
   */
  protected async readAddressText(): Promise<string> {
    const exactLabelRows = this.page.locator(
      'xpath=//tr[td[normalize-space()="Address"] or td/label[normalize-space()="Address"]]'
    );
    const attempts = 10;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const total = Math.min(await exactLabelRows.count().catch(() => 0), 8);
      for (let i = 0; i < total; i++) {
        const text = ((await exactLabelRows.nth(i).textContent().catch(() => '')) || '').trim();
        if (text.replace(/^address/i, '').trim()) return text;
      }
      const byFields = await this.readAddressByFieldNames();
      if (byFields) return byFields;
      if (attempt < attempts) await this.wait(CommonUtils.waitTimes.medium);
    }
    return '';
  }

  /**
   * Address text rebuilt from the individual address sub-fields (street / city / state / country).
   * Used as a fallback when the label-based "Address" row cannot be found (Mig sidebar theme).
   */
  protected async readAddressByFieldNames(): Promise<string> {
    const parts: string[] = [];
    for (const field of ['street', 'street2', 'city', 'zip', 'state_id', 'country_id']) {
      const value = await this.readFieldTextByName(field);
      if (value) parts.push(value);
    }
    return parts.join(' ').trim();
  }

  /**
   * Read the Odoo record id currently shown in the form URL (`?id=` or `#id=`), without waiting.
   * @returns the id as a string, or '' when the URL carries no numeric id (e.g. an unsaved "New" form)
   */
  getRecordIdFromUrl(): string {
    const match = this.page.url().match(/[?&#]id=(\d+)/);
    return match ? match[1] : '';
  }

  /**
   * Wait until the form URL shows a DIFFERENT record id than the given one - i.e. Odoo actually
   * switched records. Needed when the model in the URL cannot tell two screens apart (a Deal Element
   * and the Quotation it creates are both `sale.order`, so a model-only URL wait matches immediately).
   * @param previousId - the record id before the action ('' when the form was unsaved)
   * @param timeout - how long to wait for the id to change
   * @returns the new record id, or '' when it did not change within the timeout
   */
  async waitForRecordIdChange(previousId: string, timeout: number = 30000): Promise<string> {
    try {
      await this.page.waitForFunction(
        (prev) => {
          const match = window.location.href.match(/[?&#]id=(\d+)/);
          return !!match && match[1] !== prev;
        },
        previousId,
        { timeout }
      );
      return this.getRecordIdFromUrl();
    } catch {
      return '';
    }
  }

  /**
   * Wait for page to be fully loaded
   * Tries to wait for network idle, but falls back to a standard wait if it times out
   * @param waitTime - Time to wait after network idle or timeout (default: 3000ms)
   * @param networkIdleTimeout - Timeout for network idle state (default: 30000ms)
   */
  async TESTwaitForPageFullyLoaded(waitTime: number = 3000, networkIdleTimeout: number = 30000): Promise<void> {
    try {
      await this.page.waitForLoadState('networkidle', { timeout: networkIdleTimeout });
      await this.page.waitForTimeout(waitTime);
      console.log(`  ✓ Page fully loaded (network idle reached)`);
    } catch (error) {
      await this.page.waitForTimeout(waitTime);
      console.log(`  ⚠️ Network idle timeout - proceeding with ${waitTime}ms wait`);
    }
  }

  /**
   * Wait for Contact to be created in CRM
   * Standard wait time for backend to process contact creation from lead
   * @param timeout - Wait time in milliseconds (default: 10000ms)
   */
  async waitForContactCreated(timeout: number = 10000): Promise<void> {
    await this.page.waitForTimeout(timeout);
    console.log(`  ✓ Waited ${timeout}ms for Contact creation`);
  }

  /**
   * Wait for Edit button to be visible (confirms page is fully loaded in readonly mode)
   * Common pattern after saving/loading Opportunity, Deal Element, or other entities
   * @param timeout - Maximum time to wait for Edit button (default: 30000ms)
   * @param stabilizeWait - Additional time to wait after Edit button appears (default: 2000ms)
   */
  async waitForEditButton(timeout: number = 60000, stabilizeWait: number = 5000): Promise<void> {
    await this.editButton().waitFor({ state: 'visible', timeout });
    await this.page.waitForTimeout(stabilizeWait);
  }

  /**
   * Wait for form to be saved and page to stabilize
   * Checks for either Edit button or readonly form to appear after save
   * @param timeout - Maximum time to wait for page stabilization (default: 10000ms)
   */
  async waitForFormSaved(timeout: number = 10000): Promise<void> {
    await Promise.race([
      this.editButton().waitFor({ state: 'visible', timeout }),
      this.readonlyForm().waitFor({ state: 'visible', timeout }),
      this.page.waitForTimeout(CommonUtils.waitTimes.standard) // Fallback wait to ensure stability
    ]).catch(() => {
      console.log('  ⚠ Page stabilization check timed out - continuing');
    });
  }

  /**
   * Wait for page to be ready after reload/navigation.
   * Waits for either the Applications menu link or the User menu to become visible,
   * indicating the Odoo shell has fully loaded. Falls back to a fixed wait on timeout.
   * @param timeout - Maximum time to wait for the indicators (default: 10000ms)
   */
  async waitForPageReady(timeout: number = 10000): Promise<void> {
    try {
      await Promise.race([
        this.applicationMenuLink_basePage().waitFor({ state: 'visible', timeout }),
        this.userMenuLink_basePage().waitFor({ state: 'visible', timeout }),
      ]);
    } catch {
      await this.page.waitForTimeout(timeout);
    }
  }

  /**
   * Best-effort wait for the record form view to render. Non-throwing: resolves as
   * soon as the form is visible, and silently continues if it never appears (callers
   * that strictly need an element should wait on that element specifically).
   * @param timeout - Maximum time to wait (default: abnormalWait)
   */
  async waitForFormView(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    await this.formView_basePage().waitFor({ state: 'visible', timeout }).catch(() => {});
  }

  /**
   * Wait for Odoo's loading mask / jQuery blockUI overlay to disappear. The
   * `.blockUI.blockOverlay` mask (and `.o_loading` / `.o_blockUI`) sits on top of the page
   * while the backend is busy and silently intercepts pointer events, so a click issued
   * while it is up retries until the action times out (observed: a 900s timeout on a
   * "View list" click with "<div class=blockUI blockOverlay> intercepts pointer events").
   * Call this before clicking after a navigation / data load. Non-throwing: resolves as
   * soon as no overlay is present, or when the timeout lapses.
   * @param timeout - Maximum time to wait for the overlay to clear (default: abnormalWait)
   */
  async waitForLoadingOverlayHidden(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    await this.loadingOverlay_basePage().first().waitFor({ state: 'hidden', timeout }).catch(() => {});
  }

  /**
   * If the form is currently in edit mode (Discard button visible), click Discard
   * to return to readonly mode so the Action menu becomes available.
   * @param timeout - Time to check for Discard button (default: 3000ms)
   */
  async discardFormIfInEditMode(timeout: number = 3000): Promise<void> {
    const discardVisible = await this.discardButton().isVisible({ timeout }).catch(() => false);
    if (discardVisible) {
      console.log('  ⚠️ Form is in edit mode - clicking Discard to switch to readonly');
      await this.discardButton().click();
      await this.dismissDiscardChangesDialog();
      console.log('  ✓ Form switched to readonly mode');
    }
  }

  /**
   * Dismiss error dialog if it appears
   * Handles "Odoo Client Error" or similar error popups by clicking OK button
   * @param timeout - Maximum time to wait for dialog (default: 3000ms)
   * @param waitAfterDismiss - Time to wait after dismissing dialog (default: 1000ms)
   * @returns true if dialog was dismissed, false if no dialog appeared
   */
  async dismissErrorDialog(timeout: number = 3000, waitAfterDismiss: number = 1000): Promise<boolean> {
    const dialogVisible = await this.errorDialog().isVisible({ timeout }).catch(() => false);
    
    if (dialogVisible) {
      console.log('  ⚠️ Error dialog detected - clicking OK button');
      await this.errorDialogOkButton().click();
      console.log('  ✓ Error dialog dismissed');
      await this.page.waitForTimeout(waitAfterDismiss);
      return true;
    }

    return false;
  }

  /**
   * Robustly clear the "Odoo Client Error" popup, which can appear with a DELAY (or reappear)
   * after navigating to / acting on a record. Polls up to `maxAttempts` times, dismissing the
   * dialog each time it is found and waiting `interval` ms between checks, so a late-appearing
   * popup is still caught (a single dismissErrorDialog() can run before the popup renders).
   * @param maxAttempts - number of dismiss checks (default: 4)
   * @param interval - wait between checks (default: waitTimes.long)
   * @returns the number of error dialogs dismissed
   */
  async dismissErrorDialogWithRetry(
    maxAttempts: number = 4,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<number> {
    let dismissed = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const wasDismissed = await this.dismissErrorDialog();
      if (wasDismissed) {
        dismissed++;
      }
      if (attempt < maxAttempts) {
        await this.wait(interval);
      }
    }
    if (dismissed > 0) {
      console.log(`  ✓ Cleared ${dismissed} "Odoo Client Error" dialog(s) over ${maxAttempts} checks`);
    }
    return dismissed;
  }

  /**
   * A generic "blocking popup" locator: a modal dialog (UserError / ValidationError - e.g. the
   * "Please fill in all necessary fields in 'Qualification info'..." message) OR a sticky
   * notification / toast. Broader than errorDialog() (which only matches client/server-error text).
   */
  private blockingPopupNodes() {
    return this.page.locator('.modal.show, .modal.in, .o_dialog, .o_dialog_warning, .o_error_dialog, .o_technical_modal, .o_notification');
  }

  /**
   * Return the trimmed visible text of the first blocking popup (validation modal or notification),
   * or '' if none appears within `timeout`. Use to DETECT - or to assert the ABSENCE of - the
   * Qualification-info validation on opportunity stage changes / contact merges (CRM-12059).
   * @param timeout - how long to wait for a popup to appear (default: waitTimes.extraLong)
   */
  async getBlockingPopupText(timeout: number = CommonUtils.waitTimes.extraLong): Promise<string> {
    const nodes = this.blockingPopupNodes();
    const appeared = await nodes.first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!appeared) return '';
    const count = await nodes.count();
    for (let i = 0; i < count; i++) {
      const el = nodes.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const txt = ((await el.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (txt) return txt;
    }
    return '';
  }

  /**
   * Dismiss a visible blocking popup by clicking its Ok / Close / Discard / Cancel button
   * (best-effort; no-op if none is present).
   */
  async dismissBlockingPopup(): Promise<void> {
    const btn = this.page
      .locator('.modal.show .modal-footer button, .o_dialog .modal-footer button, .o_error_dialog button, .o_dialog_warning button')
      .filter({ hasText: /Ok|OK|Close|Discard|Cancel/i })
      .first();
    if (await btn.isVisible({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => false)) {
      await btn.click().catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
    }
  }

  /**
   * Dismiss the "record has been modified" discard-changes dialog if it appears.
   * Handles: "The record has been modified, your changes will be discarded. Do you want to proceed?"
   * @param timeout - Maximum time to wait for the dialog to appear (default: 3000ms)
   * @returns true if the dialog was dismissed, false if it did not appear
   */
  async dismissDiscardChangesDialog(timeout: number = 3000): Promise<boolean> {
    const dialog = this.discardChangesDialog();
    const dialogVisible = await dialog.isVisible({ timeout }).catch(() => false);
    if (dialogVisible) {
      console.log('  ⚠️ Discard-changes dialog detected - clicking OK to proceed');
      await this.discardChangesOkButton().click();
      console.log('  ✓ Discard-changes dialog dismissed');
      return true;
    }
    return false;
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  //  Chatter carrying characters PostgreSQL cannot store (CRM-12540)
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  //  Lives on BasePage because the scenario is model-agnostic: the same body has to be provable on a
  //  helpdesk ticket, a lead and an invoice.
  //
  //  A NUL byte (U+0000) and a lone UTF-16 surrogate (U+D800-U+DFFF) cannot be delivered through
  //  locator.fill() / keyboard.type() - Playwright's input pipeline drops them - so the composer is
  //  filled by simulating the PASTE the reporter actually performed. The payload crosses into the page
  //  as CODE POINTS: numbers survive the evaluate() JSON transport intact, whereas a lone surrogate
  //  inside a JSON string does not.

  private readonly chatterPanel_basePage = () => this.page.locator('.o_chatter, .oe_chatter').first();
  private readonly chatterLogNoteBtn_basePage = () => this.page.locator('.o_chatter_button_log_note').first();
  private readonly chatterNewMessageBtn_basePage = () => this.page.locator('.o_chatter_button_new_message').first();
  private readonly chatterComposerTextarea_basePage = () =>
    this.page.locator('.o_thread_composer textarea.o_composer_text_field, .o_chatter textarea.o_composer_text_field, .o_chatter textarea.o_input').first();
  private readonly chatterSendBtn_basePage = () => this.page.locator('.o_composer_button_send').first();
  private readonly chatterSuggestedRecipients_basePage = () =>
    this.page.locator('.o_thread_composer .o_composer_suggested_partners input[type=checkbox]');
  private readonly chatterMessages_basePage = () => this.page.locator('.o_thread_message');
  private readonly chatterMessageWithText_basePage = (text: string) =>
    this.page.locator('.o_thread_message', { hasText: text });
  private readonly chatterNotification_basePage = () =>
    this.page.locator('.o_notification_manager .o_notification, .o_notification, .o_dialog_warning, .modal-dialog .modal-title').first();

  /** Split a string into code points - a lone surrogate keeps its own value. */
  protected static toCodePoints(text: string): number[] {
    return Array.from(text).map((c) => c.codePointAt(0) as number);
  }

  /**
   * Open any record's form straight by model + id, with its chatter ready.
   * goto() on a hash route is a SAME-DOCUMENT navigation, so the previously open record can still be
   * on screen while every read silently comes off the wrong record - reload() forces a real load.
   */
  async openRecordFormById(baseUrl: string, model: string, recordId: number | string): Promise<void> {
    const url = `${baseUrl.replace(/\/$/, '')}/web#id=${recordId}&model=${model}&view_type=form`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForFormView(CommonUtils.waitTimes.pageLoad);
    await this.chatterPanel_basePage().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Opened ${model}#${recordId}`);
  }

  /** Number of messages currently rendered in the chatter. */
  async getChatterMessageCount(): Promise<number> {
    return this.chatterMessages_basePage().count();
  }

  /** Whether a chatter message containing `text` is rendered on the open record. */
  async isChatterMessageVisible(text: string): Promise<boolean> {
    return (await this.chatterMessageWithText_basePage(text).count()) > 0;
  }

  /** Text of any Odoo notification toast / warning dialog on screen ("Connection lost", ...). */
  async getNotificationText(): Promise<string> {
    const n = this.chatterNotification_basePage();
    if ((await n.count()) === 0) return '';
    if (!(await n.isVisible().catch(() => false))) return '';
    const t = await n.innerText().catch(() => '');
    return (t ?? '').replace(/\s+/g, ' ').trim();
  }

  /** Paste `text` into the currently open composer, preserving unstorable characters. */
  private async pasteIntoChatterComposer_basePage(text: string): Promise<{ nulHeld: boolean; surrogateHeld: boolean }> {
    const ta = this.chatterComposerTextarea_basePage();
    await ta.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return this.page.evaluate((codes: number[]) => {
      const el = document.querySelector(
        '.o_thread_composer textarea.o_composer_text_field, .o_chatter textarea.o_composer_text_field, .o_chatter textarea.o_input',
      ) as HTMLTextAreaElement | null;
      if (!el) throw new Error('chatter composer textarea not found');
      const payload = codes.map((c) => String.fromCodePoint(c)).join('');
      el.focus();
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', payload);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      } catch (e) {
        /* older Chrome - the direct value assignment below still reproduces the paste */
      }
      el.value = payload;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      let lone = false;
      for (let i = 0; i < el.value.length; i++) {
        const c = el.value.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
          const next = i + 1 < el.value.length ? el.value.charCodeAt(i + 1) : 0;
          if (next >= 0xdc00 && next <= 0xdfff) { i++; continue; }
          lone = true;
        } else if (c >= 0xdc00 && c <= 0xdfff) {
          lone = true;
        }
      }
      return { nulHeld: el.value.indexOf(String.fromCharCode(0)) >= 0, surrogateHeld: lone };
    }, BasePage.toCodePoints(text));
  }

  /** Click the composer's send button and wait until the thread grows or an error surfaces. */
  private async sendChatterComposer_basePage(before: number): Promise<{ posted: boolean; notification: string }> {
    const send = this.chatterSendBtn_basePage();
    await send.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await send.click();

    const deadline = Date.now() + CommonUtils.waitTimes.checkingChatterLog;
    let notification = '';
    while (Date.now() < deadline) {
      if ((await this.getChatterMessageCount()) > before) return { posted: true, notification: '' };
      notification = await this.getNotificationText();
      if (notification) break;
      await this.wait(CommonUtils.waitTimes.standard);
    }
    return { posted: (await this.getChatterMessageCount()) > before, notification };
  }

  /**
   * Paste `text` into the "Log note" composer and post it, preserving characters that
   * locator.fill() would drop. Reports what the composer actually held and what the UI answered.
   */
  async pasteAndPostLogNote(text: string): Promise<{
    posted: boolean;
    notification: string;
    nulHeld: boolean;
    surrogateHeld: boolean;
  }> {
    await this.dismissErrorDialog();
    const before = await this.getChatterMessageCount();
    const btn = this.chatterLogNoteBtn_basePage();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click();
    await this.wait(CommonUtils.waitTimes.medium);
    const held = await this.pasteIntoChatterComposer_basePage(text);
    const sent = await this.sendChatterComposer_basePage(before);
    console.log(`  - Log note posted=${sent.posted} notification="${sent.notification}"`);
    return { ...sent, ...held };
  }

  /**
   * Paste `text` into the customer-visible "Send message" composer and send it.
   * The auto-added customer-email recipient makes Send a silent no-op, so every suggested recipient
   * is unchecked first.
   */
  async pasteAndSendMessage(text: string): Promise<{
    posted: boolean;
    notification: string;
    nulHeld: boolean;
    surrogateHeld: boolean;
  }> {
    await this.dismissErrorDialog();
    const before = await this.getChatterMessageCount();
    const btn = this.chatterNewMessageBtn_basePage();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click();
    await this.wait(CommonUtils.waitTimes.medium);
    const held = await this.pasteIntoChatterComposer_basePage(text);

    const boxes = this.chatterSuggestedRecipients_basePage();
    const n = await boxes.count();
    for (let i = 0; i < n; i++) {
      const box = boxes.nth(i);
      if (await box.isChecked().catch(() => false)) await box.uncheck({ force: true }).catch(() => {});
    }

    const sent = await this.sendChatterComposer_basePage(before);
    console.log(`  - Send message posted=${sent.posted} notification="${sent.notification}"`);
    return { ...sent, ...held };
  }

  /**
   * Post a chatter message through the SERVER path (message_post) instead of the screen.
   * This is deliberate, not a shortcut: a NUL byte cannot be delivered from the browser at all - the
   * Odoo web client strips it before the request is built - so the mail-gateway / API path is the only
   * way to exercise it end to end. Returns the new message id; THROWS with the server error text when
   * the post is rejected.
   */
  async postChatterMessageViaServerPath(model: string, recordId: number | string, text: string): Promise<number> {
    const res = await this.page.evaluate(
      async ([model, id, codes]: [string, string, number[]]) => {
        const body = codes.map((c) => String.fromCodePoint(c)).join('');
        const r = await fetch('/web/dataset/call_kw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            params: {
              model,
              method: 'message_post',
              args: [[Number(id)]],
              kwargs: { body, message_type: 'comment', subtype: 'mail.mt_note' },
            },
          }),
        });
        const j = await r.json();
        if (j.error) {
          const d = j.error.data || {};
          return {
            error: `${d.name || ''} :: ${(d.message || j.error.message || '').toString()}`.replace(/\s+/g, ' ').trim(),
          };
        }
        return { id: j.result as number };
      },
      [model, String(recordId), BasePage.toCodePoints(text)] as [string, string, number[]],
    );
    const err = (res as { error?: string }).error;
    if (err) throw new Error(`message_post rejected: ${err}`);
    const newId = (res as { id: number }).id;
    console.log(`  - Server-path message_post created mail.message #${newId}`);
    return newId;
  }

  /**
   * Id of the newest record of `model` that the LOGGED-IN user can actually reach, or 0 when there is
   * none. Setup-only lookup, deliberately not a list-view walk: Odoo's own record rules already filter
   * a search to what this user may read, so this returns a record the actor is guaranteed to be able
   * to open - which a "click the first row" navigation cannot promise. The behaviour under test is
   * still driven through the screen.
   * THROWS when the model itself is not readable by this user, so a permission problem is reported as
   * a permission problem instead of an empty result.
   */
  async findFirstRecordId(model: string, domain: unknown[] = []): Promise<number> {
    return this.page.evaluate(async ([model, domain]: [string, unknown[]]) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: { model, method: 'search_read', args: [domain, ['id']], kwargs: { limit: 1, order: 'id desc' } },
        }),
      });
      const j = await r.json();
      if (j.error) {
        const d = j.error.data || {};
        throw new Error(`search_read on ${model} rejected: ${d.name || ''} :: ${d.message || j.error.message || ''}`);
      }
      const rows = j.result as { id: number }[];
      return rows && rows.length ? rows[0].id : 0;
    }, [model, domain] as [string, unknown[]]);
  }

  /**
   * PLAIN TEXT of the newest chatter message stored on the record, read back from the record so the
   * assertion is made against what actually landed in the database - not against the screen.
   */
  async getStoredChatterMessageText(model: string, recordId: number | string): Promise<string> {
    const html = await this.page.evaluate(async ([model, id]: [string, string]) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'mail.message',
            method: 'search_read',
            args: [
              [['model', '=', model], ['res_id', '=', Number(id)]],
              ['id', 'body'],
            ],
            kwargs: { limit: 1, order: 'id desc' },
          },
        }),
      });
      const j = await r.json();
      if (j.error) {
        const d = j.error.data || {};
        throw new Error(`mail.message read rejected: ${d.name || ''} :: ${d.message || j.error.message || ''}`);
      }
      const rows = j.result as { id: number; body: string }[];
      return rows && rows.length ? rows[0].body || '' : '';
    }, [model, String(recordId)] as [string, string]);

    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'");
  }
}
