import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createContactOfType, CreatedContact } from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12060 - Merge Contacts wizard: Individual-type contacts also show (#ID)
 * =============================================================================================
 *  Test Case ID    : CRM-12060_1.3
 *  Jira            : CRM-12060  (Post-EA Support Ticket)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Verifies the CRM-12060 fix is NOT limited to Company-type contacts: two same-named
 *    INDIVIDUAL-type contacts also render as "Name (#ID)" in the Destination Contact selector.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12060_1\.3:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC:
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. Two INDIVIDUAL-type contacts share the same Name (different emails).
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, tick both.
 *      2. Action > Merge Contacts.
 *      3. Open the Destination Contact dropdown.
 *    Verification / Expected Result:
 *      Each option shows "Name (#ID)" with different IDs, exactly as for Company-type contacts.
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

test.describe('CRM-12060_1.3 - Merge Contacts wizard: Individual-type contacts show Name (#ID)', () => {
  let c1: CreatedContact | undefined;
  let c2: CreatedContact | undefined;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12060_1.3: Verify the Destination Contact selector shows Name (#ID) for same-named Individual-type contacts', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-12060_1.3';
    const sharedName = `ZZ ${tcId} Person ${CommonUtils.generateUniqueId()}`;
    const email1 = CommonUtils.generateContactEmail('crm12060-i1', 'merge-a');
    const email2 = CommonUtils.generateContactEmail('crm12060-i2', 'merge-b');

    await test.step('Pre-condition I: Login as Veronika (Sales Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.manager_veronika.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Veronika').catch(() => {});
    });

    await test.step('Pre-condition II: Create two Individual-type contacts with the same Name', async () => {
      console.log('\n=== PRE-CONDITION II: Create two same-named Individual contacts ===');
      console.log(`  - Shared Name      : ${sharedName}`);
      c1 = await createContactOfType(page, contactPage, 'Individual', sharedName, email1);
      c2 = await createContactOfType(page, contactPage, 'Individual', sharedName, email2);
      expect(c1.id).toMatch(/^\d+$/);
      expect(c2.id).toMatch(/^\d+$/);
      expect(c1.id).not.toBe(c2.id);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - two same-named Individual contacts created').catch(() => {});
    });

    let options: string[] = [];

    await test.step('Step 1: Open Contacts, search the shared name, tick both records', async () => {
      await contactPage.openContactsList();
      const rows = await contactPage.searchContactsByName(sharedName);
      expect(rows, 'exactly the two created Individual contacts should match the shared name').toBe(2);
      await contactPage.clickSelectAllCheckbox();
    });

    await test.step('Step 2: Action > Merge Contacts', async () => {
      await contactPage.openMergeContactsWizard();
    });

    await test.step('Step 3: Open the Destination Contact dropdown', async () => {
      options = await contactPage.getDestinationContactOptions();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Destination Contact dropdown open').catch(() => {});
    });

    await test.step('Verification: each Individual option shows its ID (Name (#ID))', async () => {
      const contactOptions = options.filter((o) => !/create and edit/i.test(o));
      const idRegex = /\(#\d+\)/;
      const option1 = contactOptions.find((o) => o.includes(`(#${c1!.id})`));
      const option2 = contactOptions.find((o) => o.includes(`(#${c2!.id})`));
      const allHaveId = contactOptions.length > 0 && contactOptions.every((o) => idRegex.test(o));
      const distinguishable = !!option1 && !!option2 && option1 !== option2;
      const overallPass = !!option1 && !!option2 && allHaveId && distinguishable;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Individual #1 option carries its ID:');
      console.log(`     Expected : option containing "(#${c1!.id})"`);
      console.log(`     Actual   : ${option1 ? `FOUND: "${option1}"` : 'NOT FOUND'}`);
      console.log(`     Result   : ${option1 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Individual #2 option carries its ID:');
      console.log(`     Expected : option containing "(#${c2!.id})"`);
      console.log(`     Actual   : ${option2 ? `FOUND: "${option2}"` : 'NOT FOUND'}`);
      console.log(`     Result   : ${option2 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - every option matches "Name (#ID)" and the two are distinct:');
      console.log(`     Actual   : ${JSON.stringify(contactOptions)}`);
      console.log(`     Result   : ${allHaveId && distinguishable ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - Individual-type contacts ${overallPass ? 'also show the ID (fix not limited to Company type)' : 'do NOT show the ID'}`);

      expect(option1, `Individual #1 should appear as an option containing (#${c1!.id})`).toBeTruthy();
      expect(option2, `Individual #2 should appear as an option containing (#${c2!.id})`).toBeTruthy();
      expect(allHaveId, 'every option must show its (#ID)').toBe(true);
      expect(distinguishable, 'the two options must be distinguishable by ID').toBe(true);

      await contactPage.cancelMergeWizard();
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
