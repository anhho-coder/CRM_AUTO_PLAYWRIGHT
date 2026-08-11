import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createCompanyContact, CreatedContact } from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12060 - Merge keeps the ID-selected destination
 * =============================================================================================
 *  Test Case ID    : CRM-12060_3.1
 *  Jira            : CRM-12060  (Post-EA Support Ticket)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Picks the merge destination by its "(#ID)" among two same-named Company contacts and runs
 *    Merge Contacts. Verifies the merge completes and the OTHER contact is merged into the
 *    ID-selected destination (only the destination remains).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12060_3\.1:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (from the dev verification comment, Khang - "Test case 3"):
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. Two Company-type contacts share the same Company Name (different emails):
 *            - Contact #1 (destination) : Name = <shared name>, Email = <email #1>
 *            - Contact #2 (source)      : Name = <shared name>, Email = <email #2>
 *    Steps to reproduce (Test case 3 - merge keeps the ID-selected destination):
 *      1. Open Contacts, search the shared name, tick both.
 *      2. Action > Merge Contacts.
 *      3. Choose the destination by its ID (Contact #1) and run Merge Contacts.
 *    Verification / Expected Result:
 *      The merge completes and the other contact is merged into the ID-selected destination
 *      (searching the shared name now returns exactly ONE contact = Contact #1).
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

test.describe('CRM-12060_3.1 - Merge keeps the ID-selected destination', () => {
  let c1: CreatedContact | undefined; // destination (kept)
  let c2: CreatedContact | undefined; // source (merged away)

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12060_3.1: Verify merging two same-named contacts keeps the ID-selected destination', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-12060_3.1';
    const sharedName = `ZZ ${tcId} Merge ${CommonUtils.generateUniqueId()}`;
    const email1 = CommonUtils.generateContactEmail('crm12060-dst', 'merge-a');
    const email2 = CommonUtils.generateContactEmail('crm12060-src', 'merge-b');

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
      console.log(`  - Shared Company Name       : ${sharedName}`);
      console.log(`  - Contact #1 (destination)  : ${email1}`);
      console.log(`  - Contact #2 (source)       : ${email2}`);
      c1 = await createCompanyContact(page, contactPage, sharedName, email1);
      c2 = await createCompanyContact(page, contactPage, sharedName, email2);
      expect(c1.id).toMatch(/^\d+$/);
      expect(c2.id).toMatch(/^\d+$/);
      expect(c1.id).not.toBe(c2.id);
      console.log(`  - Destination (keep) = #${c1.id} ; Source (merge away) = #${c2.id}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - two same-named contacts created').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Steps to reproduce
    // ----------------------------------------------------------------------------------------
    let chosenOption = '';

    await test.step('Step 1: Open Contacts, search the shared name, tick both records', async () => {
      await contactPage.openContactsList();
      const rows = await contactPage.searchContactsByName(sharedName);
      expect(rows, 'exactly the two created contacts should match the shared name').toBe(2);
      await contactPage.clickSelectAllCheckbox();
    });

    await test.step('Step 2: Action > Merge Contacts', async () => {
      await contactPage.openMergeContactsWizard();
    });

    await test.step(`Step 3: Choose the destination by its ID (#${c1!.id}) and run Merge Contacts`, async () => {
      chosenOption = await contactPage.selectDestinationContactById(c1!.id);
      await contactPage.confirmMergeContacts();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - merge submitted').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Verification
    // ----------------------------------------------------------------------------------------
    await test.step('Verification: only the ID-selected destination remains', async () => {
      await contactPage.openContactsList();
      let remaining = -1;
      for (let attempt = 1; attempt <= 5; attempt++) {
        remaining = await contactPage.searchContactsByName(sharedName);
        if (remaining <= 1) break;
        await page.waitForTimeout(CommonUtils.waitTimes.standard);
      }

      let survivingId = '';
      if (remaining === 1) {
        await contactPage.openFirstListRecord();
        survivingId = contactPage.getCurrentRecordId();
      }

      const chosenIsDestination = chosenOption.includes(`(#${c1!.id})`);
      const exactlyOneRemains = remaining === 1;
      const survivorIsDestination = survivingId === c1!.id;
      const overallPass = chosenIsDestination && exactlyOneRemains && survivorIsDestination;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - destination was selected BY ITS ID in the wizard:');
      console.log(`     Expected : chosen option contains "(#${c1!.id})"`);
      console.log(`     Actual   : "${chosenOption}"`);
      console.log(`     Result   : ${chosenIsDestination ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - exactly ONE contact remains after the merge:');
      console.log(`     Expected : 1 contact matching "${sharedName}"`);
      console.log(`     Actual   : ${remaining}`);
      console.log(`     Result   : ${exactlyOneRemains ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the survivor IS the ID-selected destination:');
      console.log(`     Expected : surviving contact ID = ${c1!.id}`);
      console.log(`     Actual   : ${survivingId || 'N/A'}`);
      console.log(`     Result   : ${survivorIsDestination ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - the other contact ${overallPass ? 'was merged into the ID-selected destination' : 'was NOT merged as expected'}`);

      expect(chosenIsDestination, 'destination must have been chosen by its ID').toBe(true);
      expect(exactlyOneRemains, 'exactly one contact must remain after the merge').toBe(true);
      expect(survivorIsDestination, `the survivor must be the ID-selected destination (#${c1!.id})`).toBe(true);

      // The source contact (#c2) has been consumed by the merge.
      c2 = undefined;
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP_CONTACTS) {
      // Only the destination (#c1) survives a successful merge; c2 was consumed. If the merge
      // did NOT happen (failure), c2 still exists and is cleaned up too.
      for (const c of [c1, c2]) {
        if (!c?.url) continue;
        try {
          const cp = new ContactPage(page);
          await cp.deleteContactByURL(c.url);
          console.log(`  ✓ Cleaned up contact ${c.id}`);
        } catch (e) {
          console.log(`  ⚠ Cleanup skipped/failed for contact ${c?.id} (may have been merged away): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    c1 = undefined;
    c2 = undefined;
  });
});
