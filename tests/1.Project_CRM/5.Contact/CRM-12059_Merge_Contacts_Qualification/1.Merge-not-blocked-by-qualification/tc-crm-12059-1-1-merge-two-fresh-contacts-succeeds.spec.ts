import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createCompanyContact, CreatedContact } from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12059 - Cannot merge Contacts linking to Opp having no data in Qualification Info
 * =============================================================================================
 *  Test Case ID    : CRM-12059_1.1
 *  Jira            : CRM-12059  (Post-EA Support Ticket - Veronika's request)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Positive baseline for the CRM-12059 fix. Two FRESH same-named Company contacts (no high-stage
 *    opportunities) are merged as Veronika. Asserts the merge COMPLETES with no spurious
 *    "Qualification info" validation and leaves exactly one (the destination) contact.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12059_1.1:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (positive baseline derived from the reported scenario + dev "Test case 1"):
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. Two fresh Company-type contacts share ONE identical Company Name (distinct emails):
 *            - Contact #1 (destination) : Name = <shared name>, Email = <email #1>
 *            - Contact #2 (source)      : Name = <shared name>, Email = <email #2>
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, select both records.
 *      2. Action > Merge Contacts.
 *      3. Select Destination Contact = Contact #1 (#ID) and confirm the merge.
 *    Verification / Expected Result:
 *      The merge completes with NO "Please fill in all necessary fields in \"Qualification info\""
 *      error; the wizard closes; only the destination contact remains (search now returns one).
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup
const QUAL_ERROR_RE = /necessary fields|Qualification info/i;

test.describe('CRM-12059_1.1 - Merging two fresh same-named contacts succeeds (no qualification error)', () => {
  let c1: CreatedContact | undefined; // destination (kept)
  let c2: CreatedContact | undefined; // source (consumed by merge)

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12059_1.1: Verify merging two fresh same-named contacts completes without any Qualification-info error', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-12059_1.1';
    const sharedName = `ZZ ${tcId} Merge ${CommonUtils.generateUniqueId()}`;
    const email1 = CommonUtils.generateContactEmail('crm12059-c1', 'merge-a');
    const email2 = CommonUtils.generateContactEmail('crm12059-c2', 'merge-b');

    // ----------------------------------------------------------------------------------------
    // Pre-condition I: Login as Veronika (Sales Manager)
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition I: Login as Veronika (Sales Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.manager_veronika.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Veronika').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Pre-condition II: Create two fresh Company-type contacts sharing the same Company Name
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition II: Create two same-named Company contacts (distinct emails)', async () => {
      console.log('\n=== PRE-CONDITION II: Two fresh same-named Company contacts ===');
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
    await test.step('Step 1: Open Contacts, search the shared name, select both records', async () => {
      await contactPage.openContactsList();
      const rows = await contactPage.searchContactsByName(sharedName);
      expect(rows, 'exactly the two created contacts should match the shared name').toBe(2);
      const selected = await contactPage.selectContactRowsByExactName(sharedName);
      expect(selected, 'both fresh contacts must be selected').toBe(2);
    });

    await test.step('Step 2: Action > Merge Contacts', async () => {
      await contactPage.openMergeContactsWizard();
    });

    let destinationText = '';
    await test.step('Step 3: Select Destination Contact = Contact #1 (#ID) and confirm the merge', async () => {
      destinationText = await contactPage.selectDestinationContactById(c1!.id);
      await contactPage.confirmMergeContacts();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce I - merge confirmed').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Verification
    // ----------------------------------------------------------------------------------------
    await test.step('Verification: the merge completes with no Qualification-info error and leaves one contact', async () => {
      const popupText = await contactPage.getBlockingPopupText(CommonUtils.waitTimes.long);
      const noQualError = !QUAL_ERROR_RE.test(popupText);

      // Re-search the shared name: a successful merge leaves exactly ONE contact (the destination).
      await contactPage.openContactsList();
      const remaining = await contactPage.searchContactsByName(sharedName);
      const mergedToOne = remaining === 1;
      const overall = noQualError && mergedToOne;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - no "Qualification info" validation blocked the merge:');
      console.log('     Expected : no popup text matching /necessary fields|Qualification info/i');
      console.log(`     Actual   : ${popupText ? `popup="${popupText.slice(0, 180)}"` : 'no blocking popup'}`);
      console.log(`     Result   : ${noQualError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the merge completed (only the destination remains):');
      console.log('     Expected : contacts matching the shared name = 1');
      console.log(`     Actual   : ${remaining}`);
      console.log(`     Result   : ${mergedToOne ? 'PASS' : 'FAIL'}`);
      console.log(`  Destination kept : ${destinationText}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - a legitimate contact merge ${overall ? 'is not blocked by the qualification rule' : 'was blocked or did not complete'}`);

      expect(noQualError, `No Qualification-info error must appear. Popup was: "${popupText}"`).toBe(true);
      expect(mergedToOne, `Merge must leave exactly one contact; found ${remaining}`).toBe(true);

      // After a successful merge only the destination (c1) survives; c2 is consumed.
      c2 = undefined;
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
          console.log(`  ⚠ Cleanup skipped/failed for contact ${c?.id}: ${e instanceof Error ? e.message : String(e)}`);
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
