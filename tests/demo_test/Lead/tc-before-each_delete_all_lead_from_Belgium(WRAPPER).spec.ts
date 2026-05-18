import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Before each - Delete all Leads by Country = Belgium
 *
 * Summary:
 * Standalone cleanup suite that deletes all active Leads matching:
 *   - Salesperson = Thomas Semerich
 *   - Country     = Belgium
 *   - State       = Flanders
 *   - Active      = true
 *
 * Command to run:
 * npx playwright test --grep "Before each - Delete all Leads" --project=chromium
 *
 * Steps:
 * 1.  Login as admin_crm and navigate to CRM
 * 2.  Navigate to Archive > All
 * 3.  Filter: Salesperson = Thomas Semerich
 * 4.  Filter: Country = Belgium
 * 5.  Filter: State = Flanders
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip
 * 8.  Click select-all checkbox
 * 9.  Press Action menu
 * 10. Select Delete option
 * 11. Confirm deletion dialog
 * 12. Close the browser
 */

test.describe('Before each - Delete all Leads by Country = Belgium', () => {

  test('Before each - Delete all Leads: Delete all active Belgium Leads for Thomas Semerich', async ({ browser }) => {
      // Create a dedicated browser context so step 12 can truly close all browsers
      const cleanupContext = await browser.newContext();
      const cleanupPage    = await cleanupContext.newPage();
  
      const loginPage       = new LoginPage(cleanupPage);
      const homePage        = new HomePage(cleanupPage);
      const opportunityPage = new OpportunityPage(cleanupPage);
  
      // Step 1: Login as admin_crm and navigate to CRM
      await test.step('beforeEach Step 1: Login as admin_crm and navigate to CRM', async () => {
        console.log('beforeEach Step 1: Logging in as admin_crm');
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(users.admin_crm.username, users.admin_crm.password);
        await loginPage.dismissLocationPermissionDialog();
        await homePage.navigateToCRM();
        await homePage.waitForPageReady();
        console.log('✓ beforeEach Step 1: Logged in and navigated to CRM');
      });
  
      // beforeEach Step 2: Navigate to Archive > All
      await test.step('beforeEach Step 2: Navigate to Archive > All', async () => {
        console.log('beforeEach Step 2: Navigating to Archive > All');
        await opportunityPage.navigateToAllLeads();
        console.log('✓ beforeEach Step 2: Archive > All leads page loaded');
      });
  
      // beforeEach Step 3: Filter by Salesperson = Thomas Semerich
      await test.step('beforeEach Step 3: Filter by Salesperson = Thomas Semerich', async () => {
        console.log('beforeEach Step 3: Adding filter Salesperson = Thomas Semerich');
        await opportunityPage.clickFilterButton();
        await opportunityPage.clickAddCustomFilter();
        await opportunityPage.selectCustomFilterField('Salesperson');
        await opportunityPage.selectCustomFilterOperator('is equal to');
        await opportunityPage.selectCustomFilterValue('Thomas Semerich');
        await opportunityPage.clickApplyFilter();
        await opportunityPage.clickFilterButton();
        console.log('✓ beforeEach Step 3: Salesperson filter applied');
      });
  
      // beforeEach Step 4: Filter by Country = Belgium
      await test.step('beforeEach Step 4: Filter by Country = Belgium', async () => {
        console.log('beforeEach Step 4: Adding filter Country = Belgium');
        await opportunityPage.clickFilterButton();
        await opportunityPage.clickAddCustomFilter();
        await opportunityPage.selectCustomFilterField('Country');
        await opportunityPage.selectCustomFilterOperator('is equal to');
        await opportunityPage.selectCustomFilterValue('Belgium');
        await opportunityPage.clickApplyFilter();
        await opportunityPage.clickFilterButton();
        console.log('✓ beforeEach Step 4: Country filter applied');
      });
  
      // beforeEach Step 5: Filter by State = Flanders
      await test.step('beforeEach Step 5: Filter by State = Flanders', async () => {
        console.log('beforeEach Step 5: Adding filter State = Flanders');
        await opportunityPage.clickFilterButton();
        await opportunityPage.clickAddCustomFilter();
        await opportunityPage.selectCustomFilterField('State');
        await opportunityPage.selectCustomFilterOperator('is equal to');
        await opportunityPage.selectCustomFilterValue('Flanders');
        await opportunityPage.clickApplyFilter();
        await opportunityPage.clickFilterButton();
        console.log('✓ beforeEach Step 5: State filter applied');
      });
  
      // beforeEach Step 6: Filter by Active = is true
      await test.step('beforeEach Step 6: Filter by Active = is true', async () => {
        console.log('beforeEach Step 6: Adding filter Active = is true');
        await opportunityPage.clickFilterButton();
        await opportunityPage.clickAddCustomFilter();
        await opportunityPage.selectCustomFilterField('Active');
        await opportunityPage.selectCustomFilterOperator('is true');
        await opportunityPage.clickApplyFilter();
        await opportunityPage.clickFilterButton();
        console.log('✓ beforeEach Step 6: Active filter applied');
      });
  
      // beforeEach Step 7: Check if any qualified items exist; skip cleanup if none
      await test.step('beforeEach Step 7: Check if list has records', async () => {
        console.log('beforeEach Step 7: Checking if any qualified leads exist...');
        const isEmpty = await opportunityPage.isListEmpty();
        if (isEmpty) {
          console.log('✓ beforeEach Step 7: No qualified leads found - skipping delete steps');
          return;
        }
        console.log('  ⚠ Qualified leads found - proceeding to delete');
  
        // beforeEach Step 8: Click the header "select all" checkbox
        await test.step('beforeEach Step 8: Click select-all checkbox', async () => {
          console.log('beforeEach Step 8: Clicking select-all checkbox');
          await opportunityPage.clickSelectAllCheckbox();
          console.log('✓ beforeEach Step 8: All records selected');
        });
  
        // beforeEach Step 9: Press Action menu
        await test.step('beforeEach Step 9: Press Action menu', async () => {
          console.log('beforeEach Step 9: Opening Action menu');
          await opportunityPage.clickListActionMenu();
          console.log('✓ beforeEach Step 9: Action menu opened');
        });
  
        // beforeEach Step 10: Select Delete option
        await test.step('beforeEach Step 10: Select Delete option', async () => {
          console.log('beforeEach Step 10: Clicking Delete option');
          await opportunityPage.clickListActionDelete();
          console.log('✓ beforeEach Step 10: Delete option selected');
        });
  
        // beforeEach Step 11: Confirm deletion
        await test.step('beforeEach Step 11: Confirm deletion dialog', async () => {
          console.log('beforeEach Step 11: Clicking OK on confirmation dialog');
          await opportunityPage.confirmDeleteDialog();
          console.log('✓ beforeEach Step 11: Records deleted successfully');
        });
      });
  
      // Step 12: Close all browsers (closes the entire cleanup context)
      await test.step('beforeEach Step 12: Close all browsers', async () => {
        console.log('beforeEach Step 12: Closing cleanup browser context');
        await cleanupContext.close();
        console.log('✓ beforeEach Step 12: All cleanup browsers closed');
      });
  });
});

