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
 *  Test Case ID    : CRM-12059_3.2
 *  Jira            : CRM-12059  (Post-EA Support Ticket - Veronika's request)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-11
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Merge mechanics: merging THREE fresh same-named Company contacts at once consolidates them
 *    into ONE (the chosen destination), with no Qualification-info error. Confirms the multi-record
 *    merge path works end-to-end (a broader mechanics check than the two-contact baseline 1.1).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12059_3.2:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (merge-mechanics, multi-record):
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. Three fresh Company contacts share one Company Name (distinct emails).
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, select all three.
 *      2. Action > Merge Contacts.
 *      3. Select Destination Contact = Contact #1 (#ID) and confirm.
 *    Verification / Expected Result:
 *      The merge completes with no "Qualification info" error; only ONE contact remains.
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup
const QUAL_ERROR_RE = /necessary fields|Qualification info/i;

test.describe('CRM-12059_3.2 - Merging three fresh same-named contacts consolidates to one', () => {
  let c1: CreatedContact | undefined; // destination
  let c2: CreatedContact | undefined; // consumed
  let c3: CreatedContact | undefined; // consumed

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12059_3.2: Verify merging three fresh same-named contacts consolidates them into one with no Qualification-info error', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-12059_3.2';
    const sharedName = `ZZ ${tcId} Merge3 ${CommonUtils.generateUniqueId()}`;
    const email1 = CommonUtils.generateContactEmail('crm12059-32a', 'merge3-a');
    const email2 = CommonUtils.generateContactEmail('crm12059-32b', 'merge3-b');
    const email3 = CommonUtils.generateContactEmail('crm12059-32c', 'merge3-c');

    await test.step('Pre-condition I: Login as Veronika (Sales Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.manager_veronika.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Veronika').catch(() => {});
    });

    await test.step('Pre-condition II: Create three same-named Company contacts (distinct emails)', async () => {
      console.log('\n=== PRE-CONDITION II: Three fresh same-named Company contacts ===');
      console.log(`  - Shared Company Name : ${sharedName}`);
      c1 = await createCompanyContact(page, contactPage, sharedName, email1);
      c2 = await createCompanyContact(page, contactPage, sharedName, email2);
      c3 = await createCompanyContact(page, contactPage, sharedName, email3);
      for (const c of [c1, c2, c3]) expect(c.id).toMatch(/^\d+$/);
      expect(new Set([c1.id, c2.id, c3.id]).size, 'three distinct contacts').toBe(3);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - three same-named contacts created').catch(() => {});
    });

    await test.step('Step 1: Open Contacts, search the shared name, select all three', async () => {
      await contactPage.openContactsList();
      const rows = await contactPage.searchContactsByName(sharedName);
      expect(rows, 'exactly the three created contacts should match the shared name').toBe(3);
      const selected = await contactPage.selectContactRowsByExactName(sharedName);
      expect(selected, 'all three fresh contacts must be selected').toBe(3);
    });

    let destinationText = '';
    await test.step('Step 2-3: Action > Merge Contacts; set Destination = Contact #1 (#ID) and confirm', async () => {
      await contactPage.openMergeContactsWizard();
      destinationText = await contactPage.selectDestinationContactById(c1!.id);
      await contactPage.confirmMergeContacts();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce I - three-way merge confirmed').catch(() => {});
    });

    await test.step('Verification: the three merge into one with no Qualification-info error', async () => {
      const popupText = await contactPage.getBlockingPopupText(CommonUtils.waitTimes.long);
      const noQualError = !QUAL_ERROR_RE.test(popupText);

      await contactPage.openContactsList();
      const remaining = await contactPage.searchContactsByName(sharedName);
      const mergedToOne = remaining === 1;
      const overall = noQualError && mergedToOne;

      console.log('==================== VERIFY ====================');
      console.log(`  Destination kept : ${destinationText}`);
      console.log('  Verify #1 - no "Qualification info" validation blocked the merge:');
      console.log(`     Actual   : ${popupText ? `popup="${popupText.slice(0, 160)}"` : 'no blocking popup'}`);
      console.log(`     Result   : ${noQualError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the three consolidated into one:');
      console.log('     Expected : contacts matching the shared name = 1');
      console.log(`     Actual   : ${remaining}`);
      console.log(`     Result   : ${mergedToOne ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - the multi-record merge ${overall ? 'consolidated 3 -> 1 with no qualification error' : 'did not complete as expected'}`);

      expect(noQualError, `No Qualification-info error must appear. Popup was: "${popupText}"`).toBe(true);
      expect(mergedToOne, `Merge must leave exactly one contact; found ${remaining}`).toBe(true);

      c2 = undefined;
      c3 = undefined;
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP_CONTACTS) {
      for (const c of [c1, c2, c3]) {
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
    c3 = undefined;
  });
});

/** Local teardown helper - deletes a contact by URL via its own ContactPage instance. */
async function contactPageDelete(page: import('@playwright/test').Page, url: string): Promise<void> {
  const cp = new ContactPage(page);
  await cp.deleteContactByURL(url);
}
