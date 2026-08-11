import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createCompanyContact, CreatedContact } from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12060 - Merge Contacts wizard: THREE same-named contacts each show a distinct (#ID)
 * =============================================================================================
 *  Test Case ID    : CRM-12060_1.2
 *  Jira            : CRM-12060  (Post-EA Support Ticket)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Extends CRM-12060_1.1 to THREE same-named Company contacts. Verifies the Destination Contact
 *    selector renders all three options as "Name (#ID)" with three DIFFERENT IDs, so every
 *    same-named contact is individually identifiable.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12060_1\.2:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC:
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. THREE Company-type contacts share the same Company Name (different emails).
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, tick ALL THREE.
 *      2. Action > Merge Contacts.
 *      3. Open the Destination Contact dropdown.
 *    Verification / Expected Result:
 *      The dropdown lists three options, each "Name (#ID)", with three distinct IDs.
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

test.describe('CRM-12060_1.2 - Merge Contacts wizard: three same-named contacts show distinct IDs', () => {
  let contacts: CreatedContact[] = [];

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12060_1.2: Verify the Destination Contact selector shows a distinct (#ID) for each of three same-named contacts', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-12060_1.2';
    const sharedName = `ZZ ${tcId} Merge ${CommonUtils.generateUniqueId()}`;

    await test.step('Pre-condition I: Login as Veronika (Sales Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.manager_veronika.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Veronika').catch(() => {});
    });

    await test.step('Pre-condition II: Create THREE Company-type contacts with the same Company Name', async () => {
      console.log('\n=== PRE-CONDITION II: Create three same-named Company contacts ===');
      console.log(`  - Shared Company Name : ${sharedName}`);
      for (let i = 1; i <= 3; i++) {
        const email = CommonUtils.generateContactEmail(`crm12060-c${i}`, `merge-${i}`);
        const c = await createCompanyContact(page, contactPage, sharedName, email);
        expect(c.id).toMatch(/^\d+$/);
        contacts.push(c);
      }
      const ids = contacts.map((c) => c.id);
      expect(new Set(ids).size, 'the three contacts must have distinct IDs').toBe(3);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - three same-named contacts created').catch(() => {});
    });

    let options: string[] = [];

    await test.step('Step 1: Open Contacts, search the shared name, tick all three records', async () => {
      await contactPage.openContactsList();
      const rows = await contactPage.searchContactsByName(sharedName);
      expect(rows, 'exactly the three created contacts should match the shared name').toBe(3);
      await contactPage.clickSelectAllCheckbox();
    });

    await test.step('Step 2: Action > Merge Contacts', async () => {
      await contactPage.openMergeContactsWizard();
    });

    await test.step('Step 3: Open the Destination Contact dropdown', async () => {
      options = await contactPage.getDestinationContactOptions();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Destination Contact dropdown open').catch(() => {});
    });

    await test.step('Verification: all three same-named contacts show a distinct (#ID)', async () => {
      const contactOptions = options.filter((o) => !/create and edit/i.test(o));
      const idRegex = /\(#\d+\)/;
      const allHaveId = contactOptions.length >= 3 && contactOptions.every((o) => idRegex.test(o));
      const foundIds = contacts.map((c) => ({ id: c.id, found: contactOptions.some((o) => o.includes(`(#${c.id})`)) }));
      const allFound = foundIds.every((f) => f.found);
      const distinctIds = new Set(contactOptions.map((o) => (o.match(/\(#(\d+)\)/) || [])[1]).filter(Boolean));
      const threeDistinct = distinctIds.size >= 3;
      const overallPass = allHaveId && allFound && threeDistinct;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - three options each carry an ID:');
      console.log(`     Expected : >= 3 options all matching /\\(#\\d+\\)/`);
      console.log(`     Actual   : ${JSON.stringify(contactOptions)}`);
      console.log(`     Result   : ${allHaveId ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - each created contact appears by its own ID:');
      foundIds.forEach((f) => console.log(`     (#${f.id}) : ${f.found ? 'FOUND' : 'NOT FOUND'}`));
      console.log(`     Result   : ${allFound ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the three IDs are distinct:');
      console.log(`     Expected : 3 distinct IDs`);
      console.log(`     Actual   : ${distinctIds.size} distinct -> ${JSON.stringify([...distinctIds])}`);
      console.log(`     Result   : ${threeDistinct ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - three same-named contacts ${overallPass ? 'are each identifiable by ID' : 'are NOT all identifiable'}`);

      expect(allHaveId, 'all three options must show (#ID)').toBe(true);
      expect(allFound, 'each created contact must appear by its own (#ID)').toBe(true);
      expect(threeDistinct, 'the three IDs must be distinct').toBe(true);

      await contactPage.cancelMergeWizard();
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP_CONTACTS) {
      for (const c of contacts) {
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
    contacts = [];
  });
});
