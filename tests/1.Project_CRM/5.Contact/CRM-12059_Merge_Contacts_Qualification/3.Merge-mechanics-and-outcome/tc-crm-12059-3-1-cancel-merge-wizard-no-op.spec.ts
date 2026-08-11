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
 *  Test Case ID    : CRM-12059_3.1
 *  Jira            : CRM-12059  (Post-EA Support Ticket - Veronika's request)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-11
 *  Actor           : Veronika Stasinievych (Sales Manager - can open the Merge Contacts wizard)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Merge mechanics: opening the Merge Contacts wizard and CANCELLING it is a no-op - both
 *    contacts remain and no error appears. Guards against a cancel accidentally merging/deleting.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12059_3.1:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (merge-mechanics, negative):
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. Two fresh Company contacts share one Company Name (distinct emails).
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, select both records.
 *      2. Action > Merge Contacts (open the wizard).
 *      3. Cancel the wizard.
 *    Verification / Expected Result:
 *      No merge happens and no error appears; both contacts still exist (search returns two).
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup
const QUAL_ERROR_RE = /necessary fields|Qualification info/i;

test.describe('CRM-12059_3.1 - Cancelling the Merge Contacts wizard is a no-op', () => {
  let c1: CreatedContact | undefined;
  let c2: CreatedContact | undefined;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12059_3.1: Verify cancelling the Merge Contacts wizard leaves both contacts and shows no error', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-12059_3.1';
    const sharedName = `ZZ ${tcId} Cancel ${CommonUtils.generateUniqueId()}`;
    const email1 = CommonUtils.generateContactEmail('crm12059-31a', 'cancel-a');
    const email2 = CommonUtils.generateContactEmail('crm12059-31b', 'cancel-b');

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
    // Pre-condition II: Create two fresh same-named Company contacts
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition II: Create two same-named Company contacts (distinct emails)', async () => {
      console.log('\n=== PRE-CONDITION II: Two fresh same-named Company contacts ===');
      console.log(`  - Shared Company Name : ${sharedName}`);
      console.log(`  - Contact #1 Email    : ${email1}`);
      console.log(`  - Contact #2 Email    : ${email2}`);
      c1 = await createCompanyContact(page, contactPage, sharedName, email1);
      c2 = await createCompanyContact(page, contactPage, sharedName, email2);
      expect(c1.id).toMatch(/^\d+$/);
      expect(c2.id).toMatch(/^\d+$/);
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

    await test.step('Step 2: Action > Merge Contacts (open the wizard)', async () => {
      await contactPage.openMergeContactsWizard();
    });

    await test.step('Step 3: Cancel the wizard', async () => {
      await contactPage.cancelMergeWizard();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce I - merge wizard cancelled').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Verification
    // ----------------------------------------------------------------------------------------
    await test.step('Verification: no merge happened, both contacts remain, no error', async () => {
      const popupText = await contactPage.getBlockingPopupText(CommonUtils.waitTimes.long);
      const noError = !QUAL_ERROR_RE.test(popupText) && !/error/i.test(popupText);

      await contactPage.openContactsList();
      const remaining = await contactPage.searchContactsByName(sharedName);
      const bothRemain = remaining === 2;
      const overall = noError && bothRemain;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - no error/validation popup after Cancel:');
      console.log(`     Expected : no error popup`);
      console.log(`     Actual   : ${popupText ? `popup="${popupText.slice(0, 160)}"` : 'no popup'}`);
      console.log(`     Result   : ${noError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - both contacts still exist (nothing merged):');
      console.log('     Expected : contacts matching the shared name = 2');
      console.log(`     Actual   : ${remaining}`);
      console.log(`     Result   : ${bothRemain ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - cancelling the merge wizard ${overall ? 'is a safe no-op' : 'did NOT behave as a no-op'}`);

      expect(noError, `Cancel must not raise an error. Popup was: "${popupText}"`).toBe(true);
      expect(bothRemain, `Both contacts must remain after Cancel; found ${remaining}`).toBe(true);
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
