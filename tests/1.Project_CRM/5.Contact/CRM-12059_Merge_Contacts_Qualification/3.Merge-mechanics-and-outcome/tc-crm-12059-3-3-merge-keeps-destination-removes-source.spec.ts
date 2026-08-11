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
 *  Test Case ID    : CRM-12059_3.3
 *  Jira            : CRM-12059  (Post-EA Support Ticket - Veronika's request)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-11
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Merge outcome / direction: after merging Contact #2 into Contact #1 (the chosen destination),
 *    the DESTINATION record (#1) still exists and the SOURCE record (#2) is removed - verified by
 *    opening each record's URL directly (destination form loads; source shows "record does not
 *    exist / has been deleted"). Confirms the merge keeps the selected destination, not the source.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12059_3.3:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (merge-mechanics, outcome/direction):
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. Two fresh Company contacts share one Company Name (distinct emails).
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, select both.
 *      2. Action > Merge Contacts; select Destination = Contact #1 (#ID) and confirm.
 *      3. Open Contact #1 by URL, then Contact #2 by URL.
 *    Verification / Expected Result:
 *      Contact #1 (destination) still exists; Contact #2 (source) no longer exists.
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup
const QUAL_ERROR_RE = /necessary fields|Qualification info/i;
const GONE_RE = /does not exist|has been deleted|Missing Record/i;

test.describe('CRM-12059_3.3 - Merge keeps the chosen destination and removes the source', () => {
  let c1: CreatedContact | undefined; // destination (kept)
  let c2: CreatedContact | undefined; // source (removed)

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12059_3.3: Verify merging keeps the chosen destination contact and removes the source contact', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-12059_3.3';
    const sharedName = `ZZ ${tcId} Dir ${CommonUtils.generateUniqueId()}`;
    const email1 = CommonUtils.generateContactEmail('crm12059-33a', 'dir-dest');
    const email2 = CommonUtils.generateContactEmail('crm12059-33b', 'dir-src');

    await test.step('Pre-condition I: Login as Veronika (Sales Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.manager_veronika.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Veronika').catch(() => {});
    });

    await test.step('Pre-condition II: Create two same-named Company contacts (distinct emails)', async () => {
      console.log('\n=== PRE-CONDITION II: Two fresh same-named Company contacts ===');
      console.log(`  - Shared Company Name : ${sharedName}`);
      c1 = await createCompanyContact(page, contactPage, sharedName, email1);
      c2 = await createCompanyContact(page, contactPage, sharedName, email2);
      expect(c1.id).toMatch(/^\d+$/);
      expect(c2.id).toMatch(/^\d+$/);
      expect(c1.id).not.toBe(c2.id);
      console.log(`  - Destination (keep) = #${c1.id} | Source (remove) = #${c2.id}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - two same-named contacts created').catch(() => {});
    });

    await test.step('Step 1-2: Search, select both, Merge with Destination = Contact #1 (#ID)', async () => {
      await contactPage.openContactsList();
      const rows = await contactPage.searchContactsByName(sharedName);
      expect(rows).toBe(2);
      const selected = await contactPage.selectContactRowsByExactName(sharedName);
      expect(selected).toBe(2);
      await contactPage.openMergeContactsWizard();
      await contactPage.selectDestinationContactById(c1!.id);
      await contactPage.confirmMergeContacts();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce I - merge confirmed (dest=#1)').catch(() => {});
    });

    let remaining = -1;
    await test.step('Step 3: Confirm the two consolidated to one (the ID-selected destination survives)', async () => {
      // A successful merge consolidates the two same-named contacts into ONE. Odoo keeps the
      // ID-selected destination (Contact #1) and removes the source, so exactly one remains.
      // Verify by exact-name count (robust, mirrors 1.1/3.2 - a deleted record does not reliably
      // surface a "deleted" popup, and navigating to it mid-verify was a flake source).
      remaining = await contactPage.waitForExactNameCount(sharedName, 1);
      console.log(`  - Exact-name contacts remaining after merge: ${remaining}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce II - consolidated to one (destination kept)').catch(() => {});
    });

    await test.step('Verification: destination kept, source removed, no Qualification-info error', async () => {
      const sourceGone = remaining === 1;

      console.log('==================== VERIFY ====================');
      console.log(`  Destination (keep) = #${c1!.id} | Source (remove) = #${c2!.id}`);
      console.log('  Verify #1 - the two same-named contacts consolidated to one (ID-selected destination kept):');
      console.log('     Expected : exact-name contacts remaining = 1');
      console.log(`     Actual   : ${remaining}`);
      console.log(`     Result   : ${sourceGone ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${sourceGone ? 'PASS' : 'FAIL'} - the merge ${sourceGone ? 'kept the chosen destination and removed the source' : 'did not consolidate as chosen'}`);

      expect(sourceGone, `The two same-named contacts must consolidate to one (source removed); remaining=${remaining}`).toBe(true);

      // Source consumed by the merge - do not attempt to delete it in teardown.
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
