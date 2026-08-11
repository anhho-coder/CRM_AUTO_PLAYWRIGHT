import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createCompanyContact, CreatedContact } from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12060 - Regression: Contacts LIST and FORM show the name WITHOUT (#ID)
 * =============================================================================================
 *  Test Case ID    : CRM-12060_2.2
 *  Jira            : CRM-12060  (Post-EA Support Ticket)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Regression guard: the "(#ID)" suffix must appear ONLY in the merge wizard's Destination
 *    Contact selector. Verifies the Contacts LIST Name column and the contact FORM name show the
 *    plain Company Name with NO "(#ID)".
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12060_2\.2:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC:
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. Two Company-type contacts share the same Company Name (different emails).
 *    Steps to reproduce:
 *      1. Open the Contacts list and locate the two same-named contacts; read the Name column.
 *      2. Open one contact's form and read its Name / breadcrumb.
 *    Verification / Expected Result:
 *      The list Name column and the contact form show the plain Company Name (no "(#ID)").
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

test.describe('CRM-12060_2.2 - Regression: Contacts list and form show no (#ID)', () => {
  let c1: CreatedContact | undefined;
  let c2: CreatedContact | undefined;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12060_2.2: Verify the Contacts list Name column and the contact form show the name without the (#ID) suffix', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-12060_2.2';
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

    let listNames: string[] = [];
    let formName = '';

    await test.step('Step 1: Open the Contacts list, locate the two contacts, and read the Name column', async () => {
      await contactPage.openContactsList();
      const rows = await contactPage.searchContactsByName(sharedName);
      expect(rows, 'both created contacts should be listed').toBe(2);
      listNames = await contactPage.getListRowNames();
    });

    await test.step('Step 2: Open one contact form and read its Name / breadcrumb', async () => {
      await contactPage.openFirstListRecord();
      formName = (await contactPage.getContactNameReadonly()).replace(/\s+/g, ' ').trim();
      console.log(`  - Contact form Name: "${formName}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - contact form name shown').catch(() => {});
    });

    await test.step('Verification: neither the list Name column nor the form name carries (#ID)', async () => {
      const idRegex = /\(#\d+\)/;
      const listMatches = listNames.filter((n) => n.includes(sharedName));
      const listHasName = listMatches.length >= 1;
      const listNoId = listNames.length > 0 && listNames.every((n) => !idRegex.test(n));
      const formHasName = formName.includes(sharedName);
      const formNoId = !!formName && !idRegex.test(formName);
      const overallPass = listHasName && listNoId && formHasName && formNoId;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - the list Name column shows the plain Company Name (no ID):');
      console.log(`     Expected : Name cells contain "${sharedName}" and NONE match /\\(#\\d+\\)/`);
      console.log(`     Actual   : ${JSON.stringify(listNames)}`);
      console.log(`     Result   : ${listHasName && listNoId ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the contact form shows the plain Company Name (no ID):');
      console.log(`     Expected : form name contains "${sharedName}" and no "(#ID)"`);
      console.log(`     Actual   : "${formName}"`);
      console.log(`     Result   : ${formHasName && formNoId ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - names outside the merge wizard ${overallPass ? 'are shown WITHOUT the ID' : 'unexpectedly show an ID'}`);

      expect(listHasName, 'the shared name must appear in the list').toBe(true);
      expect(listNoId, 'no list Name cell may carry (#ID)').toBe(true);
      expect(formHasName, 'the contact form must show the shared name').toBe(true);
      expect(formNoId, 'the contact form name must not carry (#ID)').toBe(true);
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
