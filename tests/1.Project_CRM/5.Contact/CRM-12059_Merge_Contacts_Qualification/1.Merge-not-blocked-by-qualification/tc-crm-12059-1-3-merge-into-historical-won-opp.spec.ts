import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createCompanyContact, CreatedContact } from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12059 - Cannot merge Contacts linking to Opp having no data in Qualification Info
 * =============================================================================================
 *  Test Case ID    : CRM-12059_1.3
 *  Jira            : CRM-12059  (Post-EA Support Ticket - Veronika's request)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Veronika Stasinievych (Sales Manager) - the ticket's actor and a role that
 *                    CAN merge contacts (verified: a normal sales role cannot complete the merge).
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Verifies the CRM-12059 FIX on real high-stage data. It FINDS a historical Contact that is the
 *    customer of an Opportunity at Stage >= Won (the reported trigger - legacy high-stage
 *    opps that predate the Qualification-info requirement), then merges a FRESH same-named source
 *    Contact INTO that historical Contact and asserts the merge completes with NO "Qualification
 *    info" error. The historical destination Contact and its Opps are preserved (only the fresh
 *    source is consumed), so the test is repeatable.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12059_1.3:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (the reported scenario + dev "Test case 1", adapted to a historical search):
 *    Pre-condition(s):
 *      I.   Log in as a Sales Manager (Veronika).
 *      II.  Find a historical Contact linked to an Opportunity at Stage >= Won:
 *             - CRM > Archive > All ; filter Stage = "Won"
 *             - open an Won Opportunity and read its Customer (Company) - this Contact has a
 *               legacy high-stage Opp (mirrors the reported Loxodonta AB contact with Won/Won
 *               Opps whose Qualification info is empty)
 *             - use the FIRST such Customer whose name is exact-unique among Contacts (so it can be
 *               selected safely alongside the fresh source)
 *      III. Create a FRESH source Company Contact (the merge SOURCE) with the SAME name (distinct
 *           email) so both co-list under one name search:
 *             - Name  = <historical customer name>
 *             - Email = <fresh unique email>
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, select BOTH the historical Contact and the fresh
 *         source (exactly two).
 *      2. Action > Merge Contacts.
 *      3. Select Destination Contact = the historical Contact (#ID) and confirm the merge.
 *    Verification / Expected Result:
 *      The merge completes with NO "Please fill in all necessary fields in \"Qualification info\""
 *      error (the fix); the wizard closes; the historical destination Contact survives and the
 *      fresh source is consumed.
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip source-contact cleanup
const QUAL_ERROR_RE = /necessary fields|Qualification info/i;
const MAX_DISCOVERY_TRIES = 5;

test.describe('CRM-12059_1.3 - Merge into a historical contact with a Stage>=Won Opp (the fix)', () => {
  let source: CreatedContact | undefined; // fresh SOURCE contact (consumed by the merge)
  let historical = { name: '', id: '', url: '' }; // pre-existing DESTINATION - never deleted

  async function applyWonFilter(opp: OpportunityPage): Promise<void> {
    await opp.clickFilterButton();
    await opp.clickAddCustomFilter();
    await opp.selectCustomFilterField('Stage');
    await opp.selectCustomFilterOperator('is equal to');
    await opp.selectCustomFilterValue('Won');
    await opp.clickApplyFilter();
  }

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12059_1.3: Verify merging a fresh contact into a historical contact with a Stage>=Won Opp completes with no Qualification-info error', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const contactPage = new ContactPage(page);

    const sourceEmail = CommonUtils.generateContactEmail('crm12059-c3', 'merge-src');

    // ----------------------------------------------------------------------------------------
    // Pre-condition I: Login as Veronika (Sales Manager - contact merge requires manager rights)
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition I: Login as Veronika (Sales Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.manager_veronika.displayName} (Sales Manager) ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('  ✓ Logged in and CRM ready');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Veronika').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Pre-condition II: Find a historical Contact linked to an Opp at Stage >= Won
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition II: Find a historical Contact linked to a Stage>=Won Opportunity', async () => {
      console.log('\n=== PRE-CONDITION II: Discover historical high-stage customer ===');
      for (let i = 0; i < MAX_DISCOVERY_TRIES; i++) {
        // Return to Home first, then into CRM (navigateToCRM needs the apps-home CRM tile, which is
        // NOT present from inside a module such as Contacts), so the Archive > All menu is reachable.
        await homePage.returnToHome().catch(() => {});
        await homePage.navigateToCRM();
        await homePage.waitForPageReady();
        await opportunityPage.navigateToAllLeads();
        await applyWonFilter(opportunityPage);
        if (await opportunityPage.isListEmpty().catch(() => true)) {
          console.log('  ⚠ No Won Opportunities found');
          break;
        }
        await opportunityPage.openListRowByIndex(i);
        const name = ((await opportunityPage.getCompanyFieldValue()) || '').replace(/\s+/g, ' ').trim();
        const custUrl = await opportunityPage.getCompanyFieldUrl();
        const idM = custUrl.match(/[#?&]id=(\d+)/);
        const id = idM ? idM[1] : '';
        console.log(`  - Won Opp #${i}: customer="${name}" id=${id}`);
        if (!name || !id) continue;
        await contactPage.openContactsList();
        await contactPage.searchContactsByName(name);
        const exact = await contactPage.countRowsWithExactName(name);
        if (exact === 1) {
          historical = { name, id, url: custUrl };
          console.log(`  ✓ Historical destination contact = "${name}" (#${id}) - exact-unique among contacts`);
          break;
        }
        console.log(`  ↷ "${name}" is not exact-unique among contacts (${exact} matches) - trying next Won Opp`);
      }
      expect(historical.id, 'A historical contact whose name is exact-unique among contacts must be found among the first Won Opps').toMatch(/^\d+$/);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - historical customer discovered').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Pre-condition III: Create a FRESH source Company Contact with the SAME name
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition III: Create a fresh source Company Contact with the same name', async () => {
      console.log('\n=== PRE-CONDITION III: Create fresh merge SOURCE ===');
      console.log(`  - Name  : ${historical.name}`);
      console.log(`  - Email : ${sourceEmail}`);
      source = await createCompanyContact(page, contactPage, historical.name, sourceEmail);
      expect(source.id, 'source contact must have an ID').toMatch(/^\d+$/);
      expect(source.id).not.toBe(historical.id);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - fresh source contact created').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Steps to reproduce
    // ----------------------------------------------------------------------------------------
    await test.step('Step 1: Open Contacts, search the shared name, select the historical + the fresh source', async () => {
      await contactPage.openContactsList();
      const rows = await contactPage.searchContactsByName(historical.name);
      console.log(`  - rows matching "${historical.name}": ${rows}`);
      const selected = await contactPage.selectContactRowsByExactName(historical.name);
      // Exactly two exact-name records must be selected: the historical destination + the fresh source.
      expect(selected, 'exactly the historical contact and the fresh source must be selected').toBe(2);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce I - historical + source selected').catch(() => {});
    });

    let destinationText = '';
    await test.step('Step 2-3: Action > Merge Contacts; set Destination = the historical contact (#ID) and confirm', async () => {
      await contactPage.openMergeContactsWizard();
      destinationText = await contactPage.selectDestinationContactById(historical.id);
      await contactPage.confirmMergeContacts();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce II - merge into historical confirmed').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Verification
    // ----------------------------------------------------------------------------------------
    await test.step('Verification: the merge completes with no Qualification-info error; historical contact survives', async () => {
      const popupText = await contactPage.getBlockingPopupText(CommonUtils.waitTimes.long);
      const noQualError = !QUAL_ERROR_RE.test(popupText);

      // After a successful merge, exactly ONE exact-name contact remains (the historical destination).
      await contactPage.openContactsList();
      await contactPage.searchContactsByName(historical.name);
      const remainingExact = await contactPage.countRowsWithExactName(historical.name);
      const mergedToOne = remainingExact === 1;
      const overall = noQualError && mergedToOne;

      console.log('==================== VERIFY ====================');
      console.log(`  Historical (destination) : "${historical.name}" (#${historical.id})`);
      console.log(`  Fresh source (consumed)  : "${source?.name}" (#${source?.id})`);
      console.log('  Verify #1 - no "Qualification info" validation blocked the merge:');
      console.log('     Expected : no popup text matching /necessary fields|Qualification info/i');
      console.log(`     Actual   : ${popupText ? `popup="${popupText.slice(0, 180)}"` : 'no blocking popup'}`);
      console.log(`     Result   : ${noQualError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the merge completed (one exact-name contact remains = the destination):');
      console.log('     Expected : exact-name matches = 1');
      console.log(`     Actual   : ${remainingExact}`);
      console.log(`     Result   : ${mergedToOne ? 'PASS' : 'FAIL'}`);
      console.log(`  Destination kept : ${destinationText}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - merging into a contact with a Stage>=Won Opp ${overall ? 'is no longer blocked by the qualification rule (fix verified)' : 'was blocked / did not complete'}`);

      expect(noQualError, `No Qualification-info error must appear. Popup was: "${popupText}"`).toBe(true);
      expect(mergedToOne, `Merge must leave exactly one exact-name contact (the destination); found ${remainingExact}`).toBe(true);

      // The fresh source has been consumed by the merge.
      source = undefined;
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    // Clean up ONLY the fresh source contact (never the historical destination). If the merge
    // succeeded, `source` is already undefined; if it failed, remove the leftover source (Veronika
    // has delete rights).
    if (!SKIP_CLEANUP_CONTACTS && source?.url) {
      try {
        await contactPage_delete(page, source.url);
        console.log(`  ✓ Cleaned up fresh source contact ${source.id}`);
      } catch (e) {
        console.log(`  ⚠ Cleanup skipped/failed for source ${source?.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    console.log(`  ℹ Historical destination contact "${historical.name}" (#${historical.id}) was intentionally NOT deleted.`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    source = undefined;
    historical = { name: '', id: '', url: '' };
  });
});

/** Local teardown helper - deletes a contact by URL via its own ContactPage instance. */
async function contactPage_delete(page: import('@playwright/test').Page, url: string): Promise<void> {
  const cp = new ContactPage(page);
  await cp.deleteContactByURL(url);
}
