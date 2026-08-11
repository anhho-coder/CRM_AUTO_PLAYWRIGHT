import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createCompanyContact, CreatedContact } from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12060 - The ID selection drives which record survives the merge
 * =============================================================================================
 *  Test Case ID    : CRM-12060_3.4
 *  Jira            : CRM-12060  (Post-EA Support Ticket)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Complements CRM-12060_3.1: choosing the SECOND contact's ID as the destination makes THAT
 *    record the survivor (Contact #1 is merged into Contact #2). Proves the ID selection - the
 *    whole point of the fix - actually controls the merge outcome.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12060_3\.4:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC:
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. Two Company-type contacts share the same Company Name (Contact #2 = intended destination).
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, tick both.
 *      2. Action > Merge Contacts.
 *      3. Pick Contact #2's ID as the Destination Contact, then click MERGE CONTACTS.
 *    Verification / Expected Result:
 *      Exactly one contact remains and it is Contact #2 (the ID-selected destination); Contact #1
 *      was merged away.
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

test.describe('CRM-12060_3.4 - ID selection drives which record survives the merge', () => {
  let c1: CreatedContact | undefined; // source (merged away)
  let c2: CreatedContact | undefined; // destination (kept, chosen by ID)

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12060_3.4: Verify choosing Contact #2 by its ID makes Contact #2 the survivor of the merge', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-12060_3.4';
    const sharedName = `ZZ ${tcId} Merge ${CommonUtils.generateUniqueId()}`;
    const email1 = CommonUtils.generateContactEmail('crm12060-src', 'merge-a');
    const email2 = CommonUtils.generateContactEmail('crm12060-dst', 'merge-b');

    await test.step('Pre-condition I: Login as Veronika (Sales Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.manager_veronika.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Veronika').catch(() => {});
    });

    await test.step('Pre-condition II: Create two Company-type contacts with the same Company Name', async () => {
      console.log('\n=== PRE-CONDITION II: Create two same-named Company contacts ===');
      console.log(`  - Shared Company Name  : ${sharedName}`);
      c1 = await createCompanyContact(page, contactPage, sharedName, email1);
      c2 = await createCompanyContact(page, contactPage, sharedName, email2);
      expect(c1.id).toMatch(/^\d+$/);
      expect(c2.id).toMatch(/^\d+$/);
      expect(c1.id).not.toBe(c2.id);
      console.log(`  - Source (merge away) = #${c1.id} ; Destination (keep, by ID) = #${c2.id}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - two same-named contacts created').catch(() => {});
    });

    let chosenOption = '';

    await test.step('Step 1: Open Contacts, search the shared name, tick both records', async () => {
      await contactPage.openContactsList();
      const rows = await contactPage.searchContactsByName(sharedName);
      expect(rows).toBe(2);
      await contactPage.clickSelectAllCheckbox();
    });

    await test.step('Step 2: Action > Merge Contacts', async () => {
      await contactPage.openMergeContactsWizard();
    });

    await test.step(`Step 3: Pick Contact #2's ID (#${c2!.id}) as destination and run Merge Contacts`, async () => {
      chosenOption = await contactPage.selectDestinationContactById(c2!.id);
      await contactPage.confirmMergeContacts();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - merge submitted (destination #2)').catch(() => {});
    });

    await test.step('Verification: only Contact #2 (the ID-selected destination) remains', async () => {
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

      const chosenIsC2 = chosenOption.includes(`(#${c2!.id})`);
      const exactlyOne = remaining === 1;
      const survivorIsC2 = survivingId === c2!.id;
      const overallPass = chosenIsC2 && exactlyOne && survivorIsC2;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - destination chosen was Contact #2 by its ID:');
      console.log(`     Expected : chosen option contains "(#${c2!.id})"`);
      console.log(`     Actual   : "${chosenOption}"`);
      console.log(`     Result   : ${chosenIsC2 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - exactly ONE contact remains:');
      console.log(`     Expected : 1`);
      console.log(`     Actual   : ${remaining}`);
      console.log(`     Result   : ${exactlyOne ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the survivor is Contact #2 (NOT Contact #1):');
      console.log(`     Expected : surviving ID = ${c2!.id} (and != ${c1!.id})`);
      console.log(`     Actual   : ${survivingId || 'N/A'}`);
      console.log(`     Result   : ${survivorIsC2 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - the ID selection ${overallPass ? 'controlled which record survived' : 'did NOT control the survivor'}`);

      expect(chosenIsC2, 'destination must have been chosen as Contact #2 by its ID').toBe(true);
      expect(exactlyOne, 'exactly one contact must remain').toBe(true);
      expect(survivorIsC2, `the survivor must be Contact #2 (#${c2!.id})`).toBe(true);

      // Contact #1 has been consumed by the merge.
      c1 = undefined;
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
          console.log(`  ⚠ Cleanup skipped/failed for contact ${c?.id} (may have been merged away): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    c1 = undefined;
    c2 = undefined;
  });
});
