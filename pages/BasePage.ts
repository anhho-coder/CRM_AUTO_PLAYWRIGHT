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
  // ---------------------------------------------------------------------------
  // Private locator methods
  // ---------------------------------------------------------------------------

  /**
   * Locator for Edit button (appears after saving a form)
   */
  protected editButton() {
    return this.page.getByRole('button', { name: /^Edit$/i });
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
   * Locator for error dialog (Odoo Client Error or similar)
   */
  private errorDialog() {
    return this.page.locator('.modal, .o_dialog').filter({ hasText: /error occurred/i });
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
}
