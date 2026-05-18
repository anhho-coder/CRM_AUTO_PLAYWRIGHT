import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * TC ID: Delete-Contact
 * Summary: Delete a Contact by URL
 *
 * Command to run:
 * npx playwright test --grep "Delete-Contact:" --project=chromium
 *
 * Pre-condition:
 * 1. Have URL_Contact#1 = http://10.220.222.100/web#id=615429&action=118&model=res.partner&view_type=form&menu_id=94
 *
 * Steps to reproduce:
 * 1. Have URL_Contact#1 = http://10.220.222.100/web#id=615429&action=118&model=res.partner&view_type=form&menu_id=94
 * 2. Have the variable: selected_Re-assignment_to#1 = "Alan Osseiran"
 * 3. Login as admin_crm, navigate to "Contacts" module and wait
 *
 * Verification points:
 * 1. Open new tab then launch the URL_Contact#1
 * 2. Verify the value of "Salesperson" = selected_Re-assignment_to#1
 *
 * Tear down (Clean up test data):
 * 1. Delete Contact has just created by doing the following steps:
 *    1.1. Open new tab then launch the URL_Contact#1
 *    1.2. Select "Action" dropdown list on header of page
 *    1.3. Select "Delete" option
 *    1.4. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 * 2. Close all browsers
 */

test.describe('Delete-Contact - Delete a Contact by URL', () => {

  const url_Contact1 = 'http://10.220.222.100/web#id=615429&action=118&model=res.partner&view_type=form&menu_id=94';

  test.afterEach(async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Save video reference BEFORE closing pages - the file is finalised on page.close()
    const mainVideo = page.video();

    // ==============================================================
    // TEAR DOWN: Clean up test data (runs always, pass or fail)
    // ==============================================================
    await test.step('Tear down: Delete Contact by URL_Contact#1', async () => {
      console.log('\n=== TEAR DOWN ===');

      await test.step('Tear down 1.1: Open new tab then launch URL_Contact#1', async () => {
        console.log(`  Opening new tab for URL: ${url_Contact1}`);
        const teardownTab = await page.context().newPage();
        teardownTab.on('dialog', async (dialog) => {
          console.log(`  Dialog: "${dialog.message()}" - accepting`);
          await dialog.accept();
        });
        const teardownContactPage = new ContactPage(teardownTab);
        await teardownContactPage.goto(url_Contact1, { waitUntil: 'networkidle' });
        await teardownContactPage.waitForPageReady();
        await teardownTab.waitForTimeout(CommonUtils.waitTimes.standard);
        console.log('  Contact#1 page opened in new tab');
        await CommonUtils.captureAndAttachScreenshot(teardownTab, testInfo, 'Tear down 1.1 - Contact#1 page opened');

        await test.step('Tear down 1.2: Select "Action" dropdown list', async () => {
          await teardownContactPage.clickActionMenu();
          console.log('  Action menu opened');
          await CommonUtils.captureAndAttachScreenshot(teardownTab, testInfo, 'Tear down 1.2 - Action menu opened');
        });

        await test.step('Tear down 1.3: Select "Delete" option', async () => {
          await teardownContactPage.clickActionDeleteOption();
          console.log('  Delete option selected');
          await CommonUtils.captureAndAttachScreenshot(teardownTab, testInfo, 'Tear down 1.3 - Delete option selected');
        });

        await test.step('Tear down 1.4: Press "OK" button on confirmation dialog and wait', async () => {
          await teardownContactPage.confirmDeleteDialog();
          console.log('  Contact#1 deleted successfully');
          await CommonUtils.captureAndAttachScreenshot(teardownTab, testInfo, 'Tear down 1.4 - Contact#1 deleted');
          await teardownTab.close();
          console.log('  Tear down tab closed');
        });
      });
    });

    await test.step('Tear down 2: Close all browsers', async () => {
      const allPages = page.context().pages();
      for (const p of allPages) { if (!p.isClosed()) await p.close(); }
      console.log('All browsers closed');
    });

    if (mainVideo) {
      await testInfo.attach('Delete-Contact - Steps to reproduce + Tear down', {
        path: await mainVideo.path(),
        contentType: 'video/webm',
      });
    }
  });

  test('Delete-Contact: Delete a Contact by URL', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage   = new LoginPage(page);
    const homePage    = new HomePage(page);
    const contactPage = new ContactPage(page);

    const selectedReAssignmentTo = 'Alan Osseiran';

    await test.step('Step 1: Have URL_Contact#1', async () => {
      console.log(`\n=== STEPS TO REPRODUCE ===`);
      console.log(`  URL_Contact#1 = ${url_Contact1}`);
    });

    await test.step('Step 2: Have the variable selected_Re-assignment_to#1', async () => {
      console.log(`  selected_Re-assignment_to#1 = "${selectedReAssignmentTo}"`);
    });

    await test.step('Step 3: Login as admin_crm and navigate to Contacts module', async () => {
      console.log(`Step 3: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`  Login successful as ${users.admin_crm.displayName}`);
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      console.log('  Navigated to Contacts module');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Contacts module');
    });

    // ==============================================================
    // VERIFICATION POINTS
    // ==============================================================

    await test.step('Verification 1: Open new tab then launch URL_Contact#1', async () => {
      console.log(`\n=== VERIFICATION POINTS ===`);
      console.log('Verification 1: Opening Contact#1 in new tab');
      const verifyTab = await page.context().newPage();
      verifyTab.on('dialog', async (dialog) => { await dialog.accept(); });

      const verifyContactPage = new ContactPage(verifyTab);
      await verifyContactPage.goto(url_Contact1, { waitUntil: 'networkidle' });
      await verifyContactPage.waitForPageReady();
      await verifyTab.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('  Contact#1 page opened in new tab');
      await CommonUtils.captureAndAttachScreenshot(verifyTab, testInfo, 'Verification 1 - Contact#1 opened');

      await test.step('Verification 2: Verify Salesperson = selected_Re-assignment_to#1', async () => {
        const actualSalesperson = await verifyContactPage.getSalespersonValue();
        console.log(`  Salesperson value received: "${actualSalesperson}"`);
        console.log(`  Expected (selected_Re-assignment_to#1): "${selectedReAssignmentTo}"`);

        expect(actualSalesperson).toBe(selectedReAssignmentTo);

        console.log(`  Salesperson = "${selectedReAssignmentTo}" - verified successfully`);
        await CommonUtils.captureAndAttachScreenshot(verifyTab, testInfo, 'Verification 2 - Salesperson verified');
      });

      await verifyTab.close();
      console.log('  Verification tab closed');
    });
  });
});
