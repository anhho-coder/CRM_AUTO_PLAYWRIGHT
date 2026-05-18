import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';
import { users, baseUrl } from '../../config/users.config';

/**
 * Login helper function
 * @param page - Playwright page object
 * @param username - User email
 * @param password - User password
 */
async function loginUser(page: Page, username: string, password: string): Promise<void> {
  // Navigate to login page
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  
  // Wait for login form to be visible
  await page.waitForSelector('input[name="login"]', { state: 'visible', timeout: 10000 });
  
  // Fill in credentials
  await page.fill('input[name="login"]', username);
  await page.fill('input[name="password"]', password);
  
  // Click login button and wait for navigation
  await Promise.all([
    page.waitForURL('**/web?*', { timeout: 30000 }),
    page.click('button:has-text("Log in")')
  ]);
  
  // Wait a bit for the page to settle
  await page.waitForTimeout(3000);
  
  console.log(`Logged in as: ${username}`);
}

test.describe('Multiple Browser Sessions', () => {
  test('Open 2 browsers with different users', async () => {
    test.setTimeout(120000); // Increase timeout to 2 minutes
    
    let browser1: Browser | null = null;
    let browser2: Browser | null = null;
    let context1: BrowserContext | null = null;
    let context2: BrowserContext | null = null;
    let page1: Page | null = null;
    let page2: Page | null = null;

    try {
      // Launch first browser
      browser1 = await chromium.launch({ headless: false });
      context1 = await browser1.newContext({
        viewport: { width: 1280, height: 720 }
      });
      page1 = await context1.newPage();
      
      // Launch second browser
      browser2 = await chromium.launch({ headless: false });
      context2 = await browser2.newContext({
        viewport: { width: 1280, height: 720 }
      });
      page2 = await context2.newPage();
      
      // Login User 1 in first browser
      console.log(`\n--- Logging in User 1: ${users.sale_ic_thomas.displayName} ---`);
      await loginUser(page1, users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      
      // Login User 2 in second browser
      console.log(`\n--- Logging in User 2: ${users.manager_veronika.displayName} ---`);
      await loginUser(page2, users.manager_veronika.username, users.manager_veronika.password);
      
      // Verify both users are logged in
      console.log('\n--- Verifying login status ---');
      
      // Verify User 1 - check URL contains 'web'
      expect(page1.url()).toContain('/web');
      console.log(`Browser 1 - Logged in, URL: ${page1.url()}`);
      
      // Verify User 2 - check URL contains 'web'
      expect(page2.url()).toContain('/web');
      console.log(`Browser 2 - Logged in, URL: ${page2.url()}`);
      
      // Both users can perform actions simultaneously
      console.log('\n--- Both users performing actions ---');
      
      // User 1: Try to navigate to CRM
      try {
        await page1.click('button:has-text("CRM")', { timeout: 5000 });
        await page1.waitForTimeout(2000);
        console.log('User 1: Navigated to CRM');
      } catch (e) {
        console.log('User 1: CRM navigation skipped (button not found)');
      }
      
      // User 2: Try to navigate to CRM
      try {
        await page2.click('button:has-text("CRM")', { timeout: 5000 });
        await page2.waitForTimeout(2000);
        console.log('User 2: Navigated to CRM');
      } catch (e) {
        console.log('User 2: CRM navigation skipped (button not found)');
      }
      
      // Keep browsers open for a few seconds to observe
      await page1.waitForTimeout(3000);
      
      console.log('\n--- Test completed successfully ---');
      
    } finally {
      // Clean up
      if (context1) await context1.close();
      if (context2) await context2.close();
      if (browser1) await browser1.close();
      if (browser2) await browser2.close();
    }
  });

 
});
