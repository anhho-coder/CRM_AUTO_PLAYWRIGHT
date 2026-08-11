import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ContactPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createCompanyContact, CreatedContact } from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12060 - Regression: partner names OUTSIDE the merge wizard have NO "(#ID)" suffix
 * =============================================================================================
 *  Test Case ID    : CRM-12060_2.1
 *  Jira            : CRM-12060  (Post-EA Support Ticket)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Regression guard for the CRM-12060 fix: the "(#ID)" suffix must appear ONLY in the merge
 *    wizard's Destination Contact selector. Verifies that a Quotation's Customer selector still
 *    shows the same-named contacts as the plain Company Name, with NO "(#ID)".
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12060_2\.1:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (from the dev verification comment, Khang - "Test case 2", regression):
 *    Pre-condition(s):
 *      I.  Log in as a Sales Manager (Veronika).
 *      II. Two Company-type contacts share the same Company Name (different emails):
 *            - Contact #1 : Name = <shared name>, Email = <email #1>
 *            - Contact #2 : Name = <shared name>, Email = <email #2>
 *    Steps to reproduce (Test case 2 - names unchanged outside the wizard):
 *      1. Open a new Quotation.
 *      2. Type the shared name in the Customer field and open the dropdown.
 *    Verification / Expected Result:
 *      The Customer options show the name with NO ID (plain Company Name, no "(#123)").
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

test.describe('CRM-12060_2.1 - Regression: partner name shows without ID outside the merge wizard', () => {
  let c1: CreatedContact | undefined;
  let c2: CreatedContact | undefined;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12060_2.1: Verify a Quotation Customer selector shows the same-named contacts without the (#ID) suffix', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);
    const quotationPage = new QuotationPage(page);

    const tcId = 'CRM-12060_2.1';
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
      expect(c1.id).toMatch(/^\d+$/);
      expect(c2.id).toMatch(/^\d+$/);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - two same-named contacts created').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Steps to reproduce
    // ----------------------------------------------------------------------------------------
    let customerOptions: string[] = [];

    await test.step('Step 1: Open a new Quotation', async () => {
      await quotationPage.openNewQuotationForm();
    });

    await test.step('Step 2: Type the shared name in the Customer field and open the dropdown', async () => {
      customerOptions = await quotationPage.getCustomerDropdownOptions(sharedName);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Quotation Customer dropdown open').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Verification
    // ----------------------------------------------------------------------------------------
    await test.step('Verification: the Customer options show the plain name with NO (#ID)', async () => {
      // Real partner options (exclude the "Create and Edit..." entry).
      const partnerOptions = customerOptions.filter((o) => !/create and edit/i.test(o));
      const idRegex = /\(#\d+\)/;

      const anyWithId = partnerOptions.filter((o) => idRegex.test(o));
      const sharedNameShown = partnerOptions.some((o) => o.includes(sharedName));
      const noneHaveId = partnerOptions.length > 0 && anyWithId.length === 0;
      const overallPass = sharedNameShown && noneHaveId;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - the same-named contact appears in the Customer selector:');
      console.log(`     Expected : an option containing "${sharedName}"`);
      console.log(`     Actual   : ${sharedNameShown ? 'FOUND' : 'NOT FOUND'} (${JSON.stringify(partnerOptions)})`);
      console.log(`     Result   : ${sharedNameShown ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - NO Customer option carries the "(#ID)" suffix:');
      console.log(`     Expected : no option matches /\\(#\\d+\\)/`);
      console.log(`     Actual   : ${anyWithId.length === 0 ? 'none carry an ID' : `carry an ID -> ${JSON.stringify(anyWithId)}`}`);
      console.log(`     Result   : ${noneHaveId ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - partner names outside the merge wizard ${overallPass ? 'are shown WITHOUT the ID' : 'unexpectedly show an ID'}`);

      expect(sharedNameShown, 'the same-named contact must appear in the Customer selector').toBe(true);
      expect(noneHaveId, 'no Customer option may carry the (#ID) suffix (fix is wizard-only)').toBe(true);

      // Do NOT save the quotation - discard the draft form on teardown navigation.
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    // The draft Quotation is never saved. Cleanup opens contacts in NEW tabs, so the draft on the
    // main tab is simply discarded when the context closes - no explicit discard needed.
    if (!SKIP_CLEANUP_CONTACTS) {
      for (const c of [c1, c2]) {
        if (!c?.url) continue;
        try {
          const cp = new ContactPage(page);
          await cp.deleteContactByURL(c.url);
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
