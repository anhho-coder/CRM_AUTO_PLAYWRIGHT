import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createCompanyContact, CreatedContact } from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12060 - Merge Contacts wizard: Destination Contact shows "Name (#ID)"
 * =============================================================================================
 *  Test Case ID    : CRM-12060_1.1
 *  Jira            : CRM-12060  (Post-EA Support Ticket - "Should have the ID next to Company
 *                    Name when manual merging Contact")
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Two Company-type contacts that share ONE identical Company Name are created, then opened in
 *    the manual "Merge Contacts" wizard. Verifies the FIX: the Destination Contact selector now
 *    renders each same-named contact as "Name (#ID)" so the two are distinguishable.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12060_1\.1:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (from the dev verification comment, Khang - "Test case 1"):
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. Two contacts share the same Company Name (Company type = Company), different emails:
 *            - Contact #1 : Name = <shared name>, Email = <email #1>
 *            - Contact #2 : Name = <shared name>, Email = <email #2>
 *    Steps to reproduce (Test case 1 - Destination Contact options show the ID):
 *      1. Open Contacts, search the shared name (two contacts share this name), tick both.
 *      2. Action > Merge Contacts.
 *      3. Open the Destination Contact dropdown.
 *    Verification / Expected Result:
 *      The dropdown shows each option as "Name (#ID)" (e.g. "<name> (#669546)" and "(#669547)"),
 *      so the same-named contacts are distinguishable by ID.
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

test.describe('CRM-12060_1.1 - Merge Contacts wizard: Destination Contact shows Name (#ID)', () => {
  let c1: CreatedContact | undefined;
  let c2: CreatedContact | undefined;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12060_1.1: Verify the Destination Contact selector shows Name (#ID) for two same-named company contacts', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-12060_1.1';
    const sharedName = `ZZ ${tcId} Merge ${CommonUtils.generateUniqueId()}`;
    const email1 = CommonUtils.generateContactEmail('crm12060-c1', 'merge-a');
    const email2 = CommonUtils.generateContactEmail('crm12060-c2', 'merge-b');

    // ----------------------------------------------------------------------------------------
    // Pre-condition I: Login as Veronika (Sales Manager)
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition I: Login as Veronika (Sales Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.manager_veronika.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Veronika').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Pre-condition II: Create two Company-type contacts sharing the same Company Name
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition II: Create two Company-type contacts with the same Company Name', async () => {
      console.log('\n=== PRE-CONDITION II: Create two same-named Company contacts ===');
      console.log(`  - Shared Company Name : ${sharedName}`);
      console.log(`  - Contact #1 Email    : ${email1}`);
      console.log(`  - Contact #2 Email    : ${email2}`);
      c1 = await createCompanyContact(page, contactPage, sharedName, email1);
      c2 = await createCompanyContact(page, contactPage, sharedName, email2);
      expect(c1.id, 'Contact #1 must have an ID').toMatch(/^\d+$/);
      expect(c2.id, 'Contact #2 must have an ID').toMatch(/^\d+$/);
      expect(c1.id).not.toBe(c2.id);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - two same-named contacts created').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Steps to reproduce
    // ----------------------------------------------------------------------------------------
    let options: string[] = [];

    await test.step('Step 1: Open Contacts, search the shared name, tick both records', async () => {
      await contactPage.openContactsList();
      const rows = await contactPage.searchContactsByName(sharedName);
      expect(rows, 'exactly the two created contacts should match the shared name').toBe(2);
      await contactPage.clickSelectAllCheckbox();
    });

    await test.step('Step 2: Action > Merge Contacts', async () => {
      await contactPage.openMergeContactsWizard();
    });

    await test.step('Step 3: Open the Destination Contact dropdown', async () => {
      options = await contactPage.getDestinationContactOptions();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Destination Contact dropdown open').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Verification
    // ----------------------------------------------------------------------------------------
    await test.step('Verification: each same-named contact option shows its ID (Name (#ID))', async () => {
      // Real contact options (exclude the "Create and Edit..." entry).
      const contactOptions = options.filter((o) => !/create and edit/i.test(o));
      const idRegex = /\(#\d+\)/;

      const option1 = contactOptions.find((o) => o.includes(`(#${c1!.id})`));
      const option2 = contactOptions.find((o) => o.includes(`(#${c2!.id})`));
      const allHaveId = contactOptions.length > 0 && contactOptions.every((o) => idRegex.test(o));
      const distinguishable = !!option1 && !!option2 && option1 !== option2;

      const check1Actual = option1 ? `FOUND: "${option1}"` : 'NOT FOUND';
      const check2Actual = option2 ? `FOUND: "${option2}"` : 'NOT FOUND';
      const overallPass = !!option1 && !!option2 && allHaveId && distinguishable;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Contact #1 option carries its ID:');
      console.log(`     Expected : option containing "(#${c1!.id})"`);
      console.log(`     Actual   : ${check1Actual}`);
      console.log(`     Result   : ${option1 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Contact #2 option carries its ID:');
      console.log(`     Expected : option containing "(#${c2!.id})"`);
      console.log(`     Actual   : ${check2Actual}`);
      console.log(`     Result   : ${option2 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - every same-named option matches "Name (#ID)":');
      console.log(`     Expected : all contact options match /\\(#\\d+\\)/`);
      console.log(`     Actual   : ${JSON.stringify(contactOptions)}`);
      console.log(`     Result   : ${allHaveId ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - the two options are distinguishable (different IDs):');
      console.log(`     Expected : option(#${c1!.id}) !== option(#${c2!.id})`);
      console.log(`     Actual   : ${distinguishable ? 'DISTINCT' : 'NOT DISTINCT'}`);
      console.log(`     Result   : ${distinguishable ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - Destination Contact options ${overallPass ? 'show the ID and are distinguishable' : 'do NOT clearly show the ID'}`);

      expect(option1, `Contact #1 should appear as an option containing (#${c1!.id})`).toBeTruthy();
      expect(option2, `Contact #2 should appear as an option containing (#${c2!.id})`).toBeTruthy();
      expect(allHaveId, 'every same-named option must show its (#ID)').toBe(true);
      expect(distinguishable, 'the two options must be distinguishable by ID').toBe(true);

      // Close the wizard WITHOUT merging (this TC only inspects the selector).
      await contactPage.cancelMergeWizard();
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP_CONTACTS) {
      for (const c of [c1, c2]) {
        if (!c?.url) continue;
        try {
          await contactPageDelete(page, c.url);
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

/** Local teardown helper - deletes a contact by URL via its own ContactPage instance. */
async function contactPageDelete(page: import('@playwright/test').Page, url: string): Promise<void> {
  const cp = new ContactPage(page);
  await cp.deleteContactByURL(url);
}
