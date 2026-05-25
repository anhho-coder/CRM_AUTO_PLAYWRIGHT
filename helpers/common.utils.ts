import { Page, test } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { compileFunction } from 'node:vm';

/**
 * Common utility functions for test automation
 */
export class CommonUtils {
  /**
   * Marks a test as expected to fail due to a known defect
   * @param testInfo - Playwright TestInfo object
   * @param defectId - Defect ID (e.g., "CRM-8618")
   */
  static markTestAsKnownDefect(testInfo: TestInfo, defectId: string): void {
    testInfo.annotations.push({ 
      type: 'defect', 
      description: defectId 
    });
    test.fail(); // Mark as expected to fail
    console.log(`⚠️ This test is linked to defect: ${defectId}`);
  }

  /**
   * Waits for a specific amount of time
   * Note: Use this sparingly - prefer Playwright's built-in waiting mechanisms
   * @param ms - Milliseconds to wait
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generates a random string
   * @param length - Length of the string
   * @returns Random string
   */
  static generateRandomString(length: number = 10): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  /**
   * Generates a timestamp-based unique identifier
   * @param prefix - Optional prefix for the identifier
   * @returns Unique identifier string
   */
  static generateUniqueId(prefix: string = ''): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
  }

  /**
   * Generates a timestamp string in format: YYYY-MM-DD-HHMMSS (24-hour format)
   * Useful for creating unique test data (lead names, emails, etc.)
   * @returns Timestamp string (e.g., "2025-12-10-143527")
   */
  static generateTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
  }

  /**
   * Generates a unique lead name with TEST prefix and timestamp
   * @returns Lead name string (e.g., "TEST2025-12-10-143527")
   */
  static generateLeadName(): string {
    return `TEST${this.generateTimestamp()}`;
  }

  /**
   * Generates a unique lead name with custom prefix and ISO timestamp format
   * Format: "prefix YYYYMMDD HHMMSS" (without milliseconds)
   * @param prefix - Prefix for the lead name (e.g., "TEST Lead 1")
   * @returns Lead name string (e.g., "TEST Lead 1 20251229 143045")
   */
  static generateLeadNameWithPrefix(prefix: string): string {
    const isoString = new Date().toISOString();
    const formattedTimestamp = isoString.replace(/[-:]/g, '').replace('T', ' ').slice(0, -5);
    return `${prefix} ${formattedTimestamp}`;
  }

  /**
   * Generates a unique lead name with TEST prefix, test case ID, and formatted timestamp
   * @param testCaseId - Test case ID (e.g., "TC.IBSA_1.1.1.1")
   * @returns Lead name string (e.g., "TEST-TC.IBSA_1.1.1.1-2025-12-17-14:30:45.123")
   */
  static generateLeadNameWithTestCase(testCaseId: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    
    return `TEST-${testCaseId}-${year}-${month}-${day}-${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  /**
   * Generates a unique contact name with TEST-Contact prefix, test case ID, and compact timestamp
   * @param testCaseId - Test case ID (e.g., "TC.IBSA_1.2.2.1")
   * @returns Contact name string (e.g., "TEST-ContactTC.IBSA_1.2.2.120251217143045123")
   */
  static generateContactNameWithTestCase(testCaseId: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    
    return `TEST-Contact${testCaseId}${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`;
  }

  /**
   * Generates a unique contact email address with compact timestamp format
   * @param prefix - Email prefix (default: "Test-Customer")
   * @param domain - Domain part (default: "Customer-company")
   * @returns Email address string (e.g., "Test-Customer@Customer-company20251217143045123.com")
   */
  static generateContactEmail(prefix: string = 'Test-Customer', domain: string = 'Customer-company'): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    
    return `${prefix}@${domain}${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}.com`;
  }

  /**
   * Generates a unique email address with timestamp
   * @param prefix - Email prefix (default: "Test")
   * @param domain - Domain part (default: "company")
   * @returns Email address string (e.g., "Test@company-2025-12-17-10-19-07-843.com")
   */
  static generateEmail(prefix: string = 'Test', domain: string = 'company'): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    
    return `${prefix}@${domain}-${year}-${month}-${day}-${hours}-${minutes}-${seconds}-${milliseconds}.com`;
  }

  /**
   * Takes a screenshot of the current page
   * @param page - Playwright page object
   * @param name - Name for the screenshot
   */
  static async takeScreenshot(page: Page, name: string): Promise<void> {
    await page.screenshot({ 
      path: `test-results/screenshots/${name}_${Date.now()}.png`,
      fullPage: true 
    });
  }

  /**
   * Captures a full-page screenshot and attaches it to the test report
   * @param page - Playwright page object
   * @param testInfo - Playwright TestInfo object
   * @param attachmentName - Name for the attachment in the report
   */
  static async captureAndAttachScreenshot(
    page: Page,
    testInfo: TestInfo,
    attachmentName: string
  ): Promise<void> {
    try {
      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(attachmentName, {
        body: screenshot,
        contentType: 'image/png'
      });
      console.log(`📸 Screenshot attached: ${attachmentName}`);
    } catch (err) {
      console.log(`⚠️ Screenshot skipped (${attachmentName}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Gets current timestamp in ISO format
   * @returns ISO formatted timestamp
   */
  static getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Formats a date to YYYY-MM-DD
   * @param date - Date object
   * @returns Formatted date string
   */
  static formatDate(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Scrolls to element on the page
   * @param page - Playwright page object
   * @param selector - CSS selector of element
   */
  static async scrollToElement(page: Page, selector: string): Promise<void> {
    await page.locator(selector).scrollIntoViewIfNeeded();
  }

  /**
   * Checks if element is visible on the page
   * @param page - Playwright page object
   * @param selector - CSS selector of element
   * @returns True if visible, false otherwise
   */
  static async isElementVisible(page: Page, selector: string): Promise<boolean> {
    try {
      await page.locator(selector).waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retries an async function multiple times on failure
   * @param fn - Async function to retry
   * @param retries - Number of retry attempts
   * @param delay - Delay between retries in milliseconds
   */
  static async retry<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) {
        throw error;
      }
      await this.wait(delay);
      return this.retry(fn, retries - 1, delay);
    }
  }

  /**
   * Maximum wait times for different test scenarios (in milliseconds)
   */
  static readonly waitTimes = {
    /** Wait time for login process (5 minutes) */
    login: 300000,
    /** Wait time for BDR team assignment (5 minutes) */
    bdrTeamAssignment: 300000,
    /** Wait time for CMR team assignment (5 minutes) */
    cmrTeamAssignment: 300000,
    /** Wait time for EAM team assignment (5 minutes) */
    eamTeamAssignment: 300000,
    /** Wait time for IBSA team assignment (5 minutes) */
    ibsaTeamAssignment: 300000,
    /** Default wait time for sales team assignment (5 minutes) */
    salesTeamAssignment: 300000,
    /** Wait time for lead merging NOT happen (90 seconds) */
    leadMergingNotHappen: 90000,
    /** Wait time for lead merging process (5 minutes) */
    leadMerging: 60000,
    /** Short wait - 300ms (for quick UI updates, dropdowns) */
    short: 300,
    /** Medium wait - 500ms (for standard UI interactions) */
    medium: 500,
    /** Standard wait - 1 second (for session cleanup, state changes) */
    standard: 1000,
    /** Long wait - 2 seconds (for page loads, navigation) */
    long: 2000,
    /** Extra long wait - 3 seconds (for complex operations) */
    extraLong: 3000,
    /** Search opportunity wait - 5 seconds (for complex operations) */
    searchOppWait: 5000,
    /** Abnormal wait - 30 seconds (for complex operations that need longer than standard wait) */
    abnormalWait: 30000,
    /** Re-assignation page operations - 60 seconds (for slow Odoo backend operations) */
    reAssignationWait: 60000,
    /** Element visibility wait - 30 seconds (for element visibility checks with retry) */
    elementVisibility: 30000,
    /** Element appear wait - 3 minutes (for complex operations) */
    elementAppear: 180000,
    /** Import Audience wait - 2 minutes */
    importAudience: 120000,
    /** Select Product Line wait - 4 seconds (for complex operations) */
    selectProductLine: 4000,
    /** Saving page long wait - 30 seconds (for complex operations) */
    savingPage: 30000,
    /** Page load wait - 4 minutes (for complex operations) */
    pageLoad: 240000,
    /** Contact showing wait - 30 seconds (for complex operations - increased from 10s) */
    contactShowing: 30000,
    /** Linking partner wait - 30 seconds (for complex operations - increased from 10s) */
    linkingPartner: 30000,
     /** Check on Chater Log wait - 30 seconds (for complex operations) */
    checkingChatterLog: 30000,
    /** Saving Deal Element long wait - 4 minutes (for complex operations) */
    savingDealElement: 240000,
    /** Timeout for running Test Script - 10 minutes (for complex operations) */
    runningTestScript: 600000,
  };

  /**
   * Configuration for lead merging retry logic
   */
  static readonly leadMergingRetry = {
    /** Maximum number of page refresh attempts to check for merge notification */
    maxAttempts: 10,
    /** Maximum timeout in milliseconds (3.3 minutes) */
    maxTimeout: 200000,
  };

  /**
   * Waits for a button or element to be visible with a specified timeout
   * @param locator - Playwright locator for the element
   * @param options - Optional configuration for wait
   * @param options.timeout - Timeout in milliseconds (default: 10000)
   * @param options.state - Element state to wait for (default: 'visible')
   * @returns Promise that resolves when element reaches the desired state
   */
  static async waitForElement(
    locator: any,
    options: { timeout?: number; state?: 'visible' | 'attached' | 'detached' | 'hidden' } = {}
  ): Promise<void> {
    const { timeout = CommonUtils.waitTimes.abnormalWait, state = 'visible' } = options;
    await locator.waitFor({ state, timeout });
  }

  /**
   * Waits for an element with retry logic for flaky elements.
   * Useful for elements that may not appear immediately due to server response times.
   * @param locator - Playwright locator for the element
   * @param options - Configuration for wait and retry
   * @param options.timeout - Timeout per attempt in ms (default: abnormalWait)
   * @param options.state - Element state to wait for (default: 'visible')
   * @param options.retries - Number of retry attempts (default: 3)
   * @param options.retryDelay - Delay between retries in ms (default: 2000)
   * @returns Promise that resolves when element reaches the desired state
   */
  static async waitForElementWithRetry(
    locator: any,
    options: {
      timeout?: number;
      state?: 'visible' | 'attached' | 'detached' | 'hidden';
      retries?: number;
      retryDelay?: number;
    } = {}
  ): Promise<void> {
    const {
      timeout = CommonUtils.waitTimes.abnormalWait,
      state = 'visible',
      retries = 3,
      retryDelay = 2000
    } = options;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        await locator.waitFor({ state, timeout });
        if (attempt > 1) {
          console.log(`  ✓ Element found on attempt ${attempt}`);
        }
        return;
      } catch (error) {
        lastError = error as Error;
        if (attempt <= retries) {
          console.log(`  ⚠ Element wait attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
          await CommonUtils.wait(retryDelay);
        }
      }
    }
    throw lastError;
  }

  /**
   * Waits for a button to be visible and ready for interaction
   * @param locator - Playwright locator for the button
   * @param timeout - Timeout in milliseconds (default: 20000)
   */
  static async waitForButton(locator: any, timeout: number = 20000): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for Odoo loading spinners to disappear.
   * Waits an initial period then polls until the spinner is hidden or timeout is reached.
   * @param page - Playwright Page object
   * @param initialWait - Initial wait before checking (default: 3000ms)
   * @param timeout - Max time to wait for spinner to hide (default: 10000ms)
   */
  static async waitForSpinnersToHide(
    page: Page,
    initialWait: number = 3000,
    timeout: number = 90000
  ): Promise<void> {
    console.log('  ℹ️ Found loading spinners, waiting for them to disappear...');
    const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
    await page.waitForTimeout(initialWait);
    try {
      await spinnerLocator.first().waitFor({ state: 'hidden', timeout });
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('  ✓ Loading spinners have disappeared');

    } catch (e) {
      console.log(`  ⚠️ Timeout waiting for spinners (${timeout / 1000}s), proceeding anyway`);
    }
  }

  /**
   * Deletes a record by navigating to its URL in a new tab, then using Action > Delete.
   * Steps:
   *   1. Opens a new tab and navigates to `url`
   *   2. Clicks the Action menu
   *   3. Clicks the Delete option
   *   4. Confirms the deletion dialog
   *   5. Closes the new tab
   *
   * @param page      - The current test page (used to get the browser context)
   * @param url       - URL of the record to delete
   * @param testInfo  - Playwright TestInfo for screenshot attachment
   */
  static async deleteRecordByUrl(
    page: Page,
    url: string,
    testInfo: TestInfo
  ): Promise<void> {
    const { LeadPage } = await import('@pages');

    await test.step('Tear down: Delete record by URL', async () => {
      let newTab: Page | null = null;

      await test.step('Open new tab and navigate to record URL', async () => {
        console.log(`  Opening new tab for URL: ${url}`);
        newTab = await page.context().newPage();
        newTab.on('dialog', async (dialog) => {
          console.log(`  ℹ️ Dialog: "${dialog.message()}" — accepting`);
          await dialog.accept();
        });
        const recordPage = new LeadPage(newTab);
        await recordPage.goto(url);
        await recordPage.waitForPageReady();
        await newTab.waitForTimeout(CommonUtils.waitTimes.standard);
        console.log('  ✓ Record page opened in new tab');
        await CommonUtils.captureAndAttachScreenshot(newTab, testInfo, 'Tear down - Record page opened');
      });

      await test.step('Click Action menu', async () => {
        const recordPage = new LeadPage(newTab!);
        await recordPage.clickActionMenu();
        console.log('  ✓ Action menu opened');
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'Tear down - Action menu opened');
      });

      await test.step('Click Delete option', async () => {
        const recordPage = new LeadPage(newTab!);
        await recordPage.clickActionDeleteOption();
        console.log('  ✓ Delete option selected');
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'Tear down - Delete confirmation dialog');
      });

      await test.step('Confirm deletion dialog', async () => {
        const recordPage = new LeadPage(newTab!);
        await recordPage.confirmDeleteDialog();
        console.log('  ✓ Record deleted successfully');
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'Tear down - Record deleted');
        await newTab!.close();
        console.log('  ✓ New tab closed');
      });
    });
  }
}
