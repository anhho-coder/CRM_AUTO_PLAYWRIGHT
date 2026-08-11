import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ContactPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createCompanyContact, CreatedContact } from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12060 - Documents linked to the source are redirected to the ID-selected destination
 * =============================================================================================
 *  Test Case ID    : CRM-12060_3.2
 *  Jira            : CRM-12060  (Post-EA Support Ticket)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Veronika Stasinievych (Sales Manager)
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Gives the SOURCE contact a linked Opportunity, then merges by picking the destination's ID.
 *    Verifies the wizard's stated behaviour - "All documents linked to one of these contacts will
 *    be redirected to the destination contact" - the Opportunity now belongs to the destination.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12060_3\.2:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC:
 *    Pre-condition(s):
 *      I.   Log in as a Sales Manager (Veronika).
 *      II.  Two Company-type contacts share the same Company Name (Contact #1 = destination).
 *      III. Contact #2 (source) has at least one linked document: an Opportunity whose Customer = Contact #2.
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, tick both.
 *      2. Action > Merge Contacts.
 *      3. Pick Contact #1 (#<id1>) as the Destination Contact, then click MERGE CONTACTS.
 *      4. Open the surviving destination contact and check its linked Opportunities.
 *    Verification / Expected Result:
 *      The merge completes; the Opportunity previously linked to Contact #2 now appears under
 *      Contact #1 (the destination). No linked document is lost.
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup
const SKIP_CLEANUP_OPPS = false;     // Toggle to true to skip Opportunity cleanup

test.describe('CRM-12060_3.2 - Linked documents are redirected to the ID-selected destination', () => {
  let c1: CreatedContact | undefined; // destination (kept)
  let c2: CreatedContact | undefined; // source (merged away, owns the Opportunity)
  let oppUrl = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12060_3.2: Verify an Opportunity linked to the source contact is redirected to the ID-selected destination after merge', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const contactPage = new ContactPage(page);
    const opportunityPage = new OpportunityPage(page);

    const tcId = 'CRM-12060_3.2';
    const sharedName = `ZZ ${tcId} Merge ${CommonUtils.generateUniqueId()}`;
    const email1 = CommonUtils.generateContactEmail('crm12060-dst', 'merge-a');
    const email2 = CommonUtils.generateContactEmail('crm12060-src', 'merge-b');
    const oppName = `ZZ ${tcId} Opp ${CommonUtils.generateUniqueId()}`;

    await test.step('Pre-condition I: Login as Veronika (Sales Manager)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.manager_veronika.displayName} ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      console.log('  ✓ Logged in');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - logged in as Veronika').catch(() => {});
    });

    await test.step('Pre-condition II: Create two Company-type contacts with the same Company Name', async () => {
      console.log('\n=== PRE-CONDITION II: Create two same-named Company contacts ===');
      console.log(`  - Shared Company Name       : ${sharedName}`);
      c1 = await createCompanyContact(page, contactPage, sharedName, email1);
      c2 = await createCompanyContact(page, contactPage, sharedName, email2);
      expect(c1.id).toMatch(/^\d+$/);
      expect(c2.id).toMatch(/^\d+$/);
      expect(c1.id).not.toBe(c2.id);
      console.log(`  - Destination (keep) = #${c1.id} ; Source (owns Opp, merged away) = #${c2.id}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - two same-named contacts created').catch(() => {});
    });

    await test.step('Pre-condition III: Create an Opportunity linked to Contact #2 (the source)', async () => {
      console.log('\n=== PRE-CONDITION III: Create an Opportunity owned by Contact #2 ===');
      await contactPage.openContactByUrl(c2!.url);
      await contactPage.clickOpportunitiesSmartButton();
      // The scoped kanban's CREATE opens a quick-create card; the Opp links to Contact #2 via context.
      await opportunityPage.quickCreateOpportunity(oppName);
      oppUrl = await opportunityPage.openKanbanCardByText(oppName);
      console.log(`  - Opportunity "${oppName}" created and linked to Contact #2`);
      console.log(`      opp url = ${oppUrl}`);
      expect(oppUrl, 'the Opportunity must be saved (id in URL)').toMatch(/[#?&]id=\d+/);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - Opportunity linked to Contact #2 created').catch(() => {});
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

    await test.step(`Step 3: Pick Contact #1 (#${c1!.id}) as destination and run Merge Contacts`, async () => {
      chosenOption = await contactPage.selectDestinationContactById(c1!.id);
      await contactPage.confirmMergeContacts();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - merge submitted').catch(() => {});
    });

    await test.step('Step 4 + Verification: the destination now owns the Opportunity (redirected)', async () => {
      // Only one contact should remain (the destination).
      await contactPage.openContactsList();
      let remaining = -1;
      for (let attempt = 1; attempt <= 5; attempt++) {
        remaining = await contactPage.searchContactsByName(sharedName);
        if (remaining <= 1) break;
        await page.waitForTimeout(CommonUtils.waitTimes.standard);
      }
      // The destination contact's Opportunities count should now include the redirected Opp.
      await contactPage.openContactByUrl(c1!.url);
      const destOppCount = await contactPage.getOpportunitiesCount();

      const chosenIsDestination = chosenOption.includes(`(#${c1!.id})`);
      const exactlyOneRemains = remaining === 1;
      const oppRedirected = destOppCount >= 1;
      const overallPass = chosenIsDestination && exactlyOneRemains && oppRedirected;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - destination was selected by its ID:');
      console.log(`     Expected : chosen option contains "(#${c1!.id})"`);
      console.log(`     Actual   : "${chosenOption}"`);
      console.log(`     Result   : ${chosenIsDestination ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - exactly ONE contact remains after the merge:');
      console.log(`     Expected : 1`);
      console.log(`     Actual   : ${remaining}`);
      console.log(`     Result   : ${exactlyOneRemains ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the Opportunity is now linked to the destination (redirected):');
      console.log(`     Expected : destination "Opportunities" count >= 1`);
      console.log(`     Actual   : ${destOppCount}`);
      console.log(`     Result   : ${oppRedirected ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - the source's linked Opportunity ${overallPass ? 'was redirected to the ID-selected destination' : 'was NOT redirected as expected'}`);

      expect(chosenIsDestination, 'destination must have been chosen by its ID').toBe(true);
      expect(exactlyOneRemains, 'exactly one contact must remain after the merge').toBe(true);
      expect(oppRedirected, 'the destination must own the redirected Opportunity').toBe(true);

      // Contact #2 has been consumed by the merge.
      c2 = undefined;
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    // Delete the Opportunity first (so the destination contact becomes deletable), then the contacts.
    if (!SKIP_CLEANUP_OPPS && oppUrl) {
      try {
        await CommonUtils.deleteRecordByUrl(page, oppUrl, testInfo);
        console.log('  ✓ Cleaned up Opportunity');
      } catch (e) {
        console.log(`  ⚠ Opportunity cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
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
    oppUrl = '';
  });
});
