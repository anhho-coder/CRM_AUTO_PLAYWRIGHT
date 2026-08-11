import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createCompanyContact, CreatedContact } from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12060 - Cancelling the Merge Contacts wizard does NOT merge
 * =============================================================================================
 *  Test Case ID    : CRM-12060_3.3
 *  Jira            : CRM-12060  (Post-EA Support Ticket)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Verifies the safety path of the merge wizard: cancelling it performs NO merge - both
 *    same-named contacts still exist afterwards.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12060_3\.3:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC:
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. Two Company-type contacts share the same Company Name (different emails).
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, tick both.
 *      2. Action > Merge Contacts.
 *      3. Click Cancel (close the wizard without merging).
 *    Verification / Expected Result:
 *      No merge occurs; searching the shared name still returns BOTH contacts.
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

test.describe('CRM-12060_3.3 - Cancel merge wizard performs no merge', () => {
  let c1: CreatedContact | undefined;
  let c2: CreatedContact | undefined;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12060_3.3: Verify cancelling the Merge Contacts wizard leaves both same-named contacts intact', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-12060_3.3';
    const sharedName = `ZZ ${tcId} Merge ${CommonUtils.generateUniqueId()}`;
    const email1 = CommonUtils.generateContactEmail('crm12060-c1', 'merge-a');
    const email2 = CommonUtils.generateContactEmail('crm12060-c2', 'merge-b');

    await test.step('Pre-condition I: Login as Veronika (Sales Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.manager_veronika.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Veronika').catch(() => {});
    });

    await test.step('Pre-condition II: Create two Company-type contacts with the same Company Name', async () => {
      console.log('\n=== PRE-CONDITION II: Create two same-named Company contacts ===');
      console.log(`  - Shared Company Name : ${sharedName}`);
      c1 = await createCompanyContact(page, contactPage, sharedName, email1);
      c2 = await createCompanyContact(page, contactPage, sharedName, email2);
      expect(c1.id).toMatch(/^\d+$/);
      expect(c2.id).toMatch(/^\d+$/);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - two same-named contacts created').catch(() => {});
    });

    await test.step('Step 1: Open Contacts, search the shared name, tick both records', async () => {
      await contactPage.openContactsList();
      const rows = await contactPage.searchContactsByName(sharedName);
      expect(rows).toBe(2);
      await contactPage.clickSelectAllCheckbox();
    });

    await test.step('Step 2: Action > Merge Contacts', async () => {
      await contactPage.openMergeContactsWizard();
    });

    await test.step('Step 3: Click Cancel (close the wizard without merging)', async () => {
      await contactPage.cancelMergeWizard();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - wizard cancelled').catch(() => {});
    });

    await test.step('Verification: no merge occurred - both contacts still exist', async () => {
      await contactPage.openContactsList();
      const remaining = await contactPage.searchContactsByName(sharedName);
      const bothRemain = remaining === 2;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - both same-named contacts still exist after Cancel:');
      console.log(`     Expected : 2 contacts matching "${sharedName}"`);
      console.log(`     Actual   : ${remaining}`);
      console.log(`     Result   : ${bothRemain ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${bothRemain ? 'PASS' : 'FAIL'} - cancelling the wizard ${bothRemain ? 'performed NO merge' : 'unexpectedly changed the data'}`);

      expect(bothRemain, 'both same-named contacts must still exist after cancelling the wizard').toBe(true);
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP_CONTACTS) {
      for (const c of [c1, c2]) {
        if (!c?.url) continue;
        try {
          await new ContactPage(page).deleteContactByURL(c.url);
          console.log(`  ✓ Cleaned up contact ${c.id}`);
        } catch (e) {
          console.log(`  ⚠ Cleanup failed for contact ${c?.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    c1 = undefined;
    c2 = undefined;
  });
});
