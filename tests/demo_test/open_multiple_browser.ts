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
  await page.goto(baseUrl);
  
  // Wait for login form to be visible
  await page.waitForSelector('input[name="login"]', { timeout: 10000 });
  
  // Fill in credentials
  await page.fill('input[name="login"]', username);
  await page.fill('input[name="password"]', password);
  
  // Click login button
  await page.click('button:has-text("Log in")');
  
  // Wait for successful login (wait for main page to load)
  await page.waitForLoadState('networkidle');
  
  console.log(`Logged in as: ${username}`);
}

test.describe('Multiple Browser Sessions', () => {
  test('Open 2 browsers with different users', async () => {
    let browser1: Browser | null = null;
    let browser2: Browser | null = null;
    let context1: BrowserContext | null = null;
    let context2: BrowserContext | null = null;
    let page1: Page | null = null;
    let page2: Page | null = null;

    try {
      // Launch first browser
      browser1 = await chromium.launch({ headless: false });
      context1 = await browser1.newContext();
      page1 = await context1.newPage();
      
      // Launch second browser
      browser2 = await chromium.launch({ headless: false });
      context2 = await browser2.newContext();
      page2 = await context2.newPage();
      
      // Login User 1 in first browser
      console.log(`\n--- Logging in User 1: ${users.sale_ic_thomas.displayName} ---`);
        await loginUser(page1, users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      
      // Login User 2 in second browser
      console.log(`\n--- Logging in User 2: ${users.manager_veronika.displayName} ---`);
      await loginUser(page2, users.manager_veronika.username, users.manager_veronika.password);
      
      // Verify both users are logged in
      console.log('\n--- Verifying login status ---');
      
      // Verify User 1
      const user1Name = await page1.textContent('.o_user_menu button');
      console.log(`Browser 1 - Logged in user: ${user1Name}`);
      expect(user1Name).toContain(users.sale_ic_thomas.displayName);
      
      // Verify User 2
      const user2Name = await page2.textContent('.o_user_menu button');
      console.log(`Browser 2 - Logged in user: ${user2Name}`);
      expect(user2Name).toContain(users.manager_veronika.displayName);
      
      // Both users can perform actions simultaneously
      console.log('\n--- Both users performing actions ---');
      
      // User 1: Navigate to CRM
      await page1.click('button:has-text("CRM")');
      await page1.waitForTimeout(2000);
      console.log('User 1: Navigated to CRM');
      
      // User 2: Navigate to CRM
      await page2.click('button:has-text("CRM")');
      await page2.waitForTimeout(2000);
      console.log('User 2: Navigated to CRM');
      
      // Keep browsers open for a few seconds to observe
      await page1.waitForTimeout(5000);
      
      console.log('\n--- Test completed successfully ---');
      
    } finally {
      // Clean up
      if (context1) await context1.close();
      if (context2) await context2.close();
      if (browser1) await browser1.close();
      if (browser2) await browser2.close();
    }
  });

  test('Open 2 browsers and interact with different records', async () => {
    let browser1: Browser | null = null;
    let browser2: Browser | null = null;
    let context1: BrowserContext | null = null;
    let context2: BrowserContext | null = null;
    let page1: Page | null = null;
    let page2: Page | null = null;

    try {
      // Launch browsers
      browser1 = await chromium.launch({ headless: false });
      context1 = await browser1.newContext();
      page1 = await context1.newPage();
      
      browser2 = await chromium.launch({ headless: false });
      context2 = await browser2.newContext();
      page2 = await context2.newPage();
      
      // Login both users in parallel
      await Promise.all([
        loginUser(page1, users.sale_ic_thomas.username, users.sale_ic_thomas.password),
        loginUser(page2, users.manager_veronika.username, users.manager_veronika.password),
      ]);
      
      console.log('\n--- Both users logged in successfully ---');
      
      // Navigate both to CRM Pipeline
      await Promise.all([
        page1.goto(`${baseUrl}web#action=152&model=crm.lead&view_type=list&menu_id=111`),
        page2.goto(`${baseUrl}web#action=152&model=crm.lead&view_type=list&menu_id=111`),
      ]);
      
      await page1.waitForLoadState('networkidle');
      await page2.waitForLoadState('networkidle');
      
      console.log('Both users are on CRM Pipeline');
      
      // User 1: Create new lead
      await page1.click('button:has-text("New")');
      await page1.waitForTimeout(2000);
      console.log('User 1: Creating new lead');
      
      // User 2: Search for existing leads
      await page2.fill('input[placeholder="Search..."]', 'test');
      await page2.waitForTimeout(2000);
      console.log('User 2: Searching for leads');
      
      // Keep browsers open for observation
      await page1.waitForTimeout(5000);
      
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
