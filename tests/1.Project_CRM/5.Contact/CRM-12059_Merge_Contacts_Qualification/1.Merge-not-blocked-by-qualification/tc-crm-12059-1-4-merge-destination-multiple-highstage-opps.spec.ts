import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  createCompanyContact,
  CreatedContact,
  extractEmailDomain,
  isPublicEmailDomain,
  buildEmailInDomain,
} from '@helpers/crm12060-merge.helper';

/**
 * =============================================================================================
 *  CRM-12059 - Cannot merge Contacts linking to Opp having no data in Qualification Info
 * =============================================================================================
 *  Test Case ID    : CRM-12059_1.4
 *  Jira            : CRM-12059  (Post-EA Support Ticket - Veronika's request)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-13
 *  Actor           : Veronika Stasinievych (Sales Manager) - the ticket's actor and a role that
 *                    CAN merge contacts (verified: a normal sales role cannot complete the merge).
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Verifies the CRM-12059 FIX on real high-stage data. It FINDS a historical Contact that is the
 *    customer of MULTIPLE Opportunities at Stage >= Activated (the reported trigger - legacy
 *    high-stage opps that predate the Qualification-info requirement), then merges a FRESH source
 *    Contact INTO that historical Contact and asserts the merge completes with NO "Qualification
 *    info" error. The historical destination Contact and its Opps are preserved (only the fresh
 *    source is consumed), so the test is repeatable.
 *
 *    MERGE KEYS - SHARED EMAIL DOMAIN (+ shared Name): the merge-eligibility condition is a SHARED
 *    EMAIL DOMAIN, so the fresh source's email is built INSIDE the historical Contact's domain
 *    rather than in a domain of its own. The source also reuses the historical Company Name:
 *    measured on pre-prod (2026-08-13) the wizard only consumes the source when the two Contacts
 *    share the Name as well - a shared domain with different names leaves BOTH records standing
 *    ("There is no more contacts to merge for this request"). The source satisfies BOTH keys.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12059_1.4:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (the reported scenario + dev "Test case 1", adapted to a historical search):
 *    Pre-condition(s):
 *      I.   Log in as a Sales Manager (Veronika).
 *      II.  Find a historical Contact linked to an Opportunity at Stage >= Activated:
 *             - CRM > Archive > All ; filter Stage = "Activated"
 *             - open an Activated Opportunity and read its Customer (Company) - this Contact has a
 *               legacy high-stage Opp (mirrors the reported Loxodonta AB contact with Won/Activated
 *               Opps whose Qualification info is empty)
 *             - the Customer must carry MULTIPLE (>= 2) opportunities - read off its
 *               "Opportunities" stat button
 *             - open that Customer and SAVE ITS EMAIL DOMAIN (the merge-eligibility key)
 *             - the domain must be a company domain (public / free domains are skipped)
 *             - the Customer's name must be exact-unique among Contacts, so the merge selection can
 *               be exactly two records
 *      III. Create a FRESH source Company Contact (the merge SOURCE) that shares BOTH merge keys
 *           with the historical Contact:
 *             - Email = <fresh unique local-part>@<historical email domain>  (the shared domain)
 *             - Name  = <historical customer name>                          (the shared name)
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, select BOTH the historical Contact and the fresh
 *         source (exactly two).
 *      2. Action > Merge Contacts.
 *      3. Select Destination Contact = the historical Contact (#ID) and confirm the merge.
 *    Verification / Expected Result:
 *      The merge completes with NO "Please fill in all necessary fields in \"Qualification info\""
 *      error (the fix); the wizard closes. Each record is then checked by ITS OWN EMAIL, which is
 *      unique per contact: searching the fresh source's address returns NO contact (it was consumed)
 *      and searching the historical destination's address still returns it (it survives).
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip source-contact cleanup
const QUAL_ERROR_RE = /necessary fields|Qualification info/i;
// Candidates scanned before giving up. The email-domain guards (has an email / not a public domain),
// the name-uniqueness check and the ">= 2 opportunities" requirement all reject candidates.
const MAX_DISCOVERY_TRIES = 8;

test.describe('CRM-12059_1.4 - Merge into a historical contact with MULTIPLE Stage>=Activated Opps (the fix)', () => {
  let source: CreatedContact | undefined; // fresh SOURCE contact (consumed by the merge)
  // Pre-existing DESTINATION - never deleted. `domain` is the merge key (shared email domain).
  let historical = { name: '', id: '', url: '', email: '', domain: '' };
  let destOppCount = 0; // number of opportunities the chosen historical destination has (must be >= 2)

  async function applyActivatedFilter(opp: OpportunityPage): Promise<void> {
    await opp.clickFilterButton();
    await opp.clickAddCustomFilter();
    await opp.selectCustomFilterField('Stage');
    await opp.selectCustomFilterOperator('is equal to');
    await opp.selectCustomFilterValue('Activated');
    await opp.clickApplyFilter();
  }

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12059_1.4: Verify merging a fresh contact into a historical contact with MULTIPLE Stage>=Activated Opps completes with no Qualification-info error', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const contactPage = new ContactPage(page);

    // The merge SOURCE reuses the historical Company Name and takes an email inside the historical
    // email domain, so BOTH merge keys are shared. Built in Pre-condition III, after discovery.
    let sourceEmail = '';

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
    // Pre-condition II: Find a historical Contact linked to an Opp at Stage >= Activated
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition II: Find a historical Contact with MULTIPLE Stage>=Activated Opportunities and save its email domain', async () => {
      console.log('\n=== PRE-CONDITION II: Discover historical multi-opp customer + its EMAIL DOMAIN ===');
      for (let i = 0; i < MAX_DISCOVERY_TRIES; i++) {
        // Return to Home first, then into CRM (navigateToCRM needs the apps-home CRM tile, which is
        // NOT present from inside a module such as Contacts), so the Archive > All menu is reachable.
        await homePage.returnToHome().catch(() => {});
        await homePage.navigateToCRM();
        await homePage.waitForPageReady();
        await opportunityPage.navigateToAllLeads();
        await applyActivatedFilter(opportunityPage);
        if (await opportunityPage.isListEmpty().catch(() => true)) {
          console.log('  ⚠ No Activated Opportunities found');
          break;
        }
        await opportunityPage.openListRowByIndex(i);
        const name = ((await opportunityPage.getCompanyFieldValue()) || '').replace(/\s+/g, ' ').trim();
        const custUrl = await opportunityPage.getCompanyFieldUrl();
        const idM = custUrl.match(/[#?&]id=(\d+)/);
        const id = idM ? idM[1] : '';
        console.log(`  - Activated Opp #${i}: customer="${name}" id=${id}`);
        if (!name || !id) continue;

        // Open the customer once and read BOTH requirements off its form: the MULTIPLE-opportunities
        // count (mirrors the reported Loxodonta AB contact) and the EMAIL DOMAIN (the merge key).
        // openContactFormByUrl gates on the record actually being rendered - a hash-route hop
        // otherwise reads the PREVIOUS form's fields.
        const rendered = await contactPage.openContactFormByUrl(custUrl, name);
        if (!rendered) {
          console.log(`  ↷ Contact form for "${name}" did not render - trying next Activated Opp`);
          continue;
        }
        const oppCount = await contactPage.getOpportunityStatCount();
        if (oppCount < 2) {
          console.log(`  ↷ "${name}" (#${id}) has only ${oppCount} opportunit(y/ies) - need >= 2; trying next Activated Opp`);
          continue;
        }
        const email = ((await contactPage.getEmailReadonly()) || '').trim();
        const domain = extractEmailDomain(email);
        console.log(`  - customer email="${email}" -> domain="${domain}" (opportunities: ${oppCount})`);
        if (!domain) {
          console.log('  ↷ Customer has no usable email domain - trying next Activated Opp');
          continue;
        }
        if (isPublicEmailDomain(domain)) {
          console.log(`  ↷ "${domain}" is a public/free email domain (shared by unrelated contacts) - trying next Activated Opp`);
          continue;
        }

        // The name must be exact-unique among ALL contacts: the fresh source reuses it, so the name
        // search has to return exactly these two records - this one now, plus the source later.
        await contactPage.openContactsList();
        await contactPage.searchContactsByName(name);
        const exactByName = await contactPage.countRowsWithExactName(name);
        if (exactByName !== 1) {
          console.log(`  ↷ "${name}" is not exact-unique among contacts (${exactByName} matches) - trying next Activated Opp`);
          continue;
        }
        historical = { name, id, url: custUrl, email, domain };
        destOppCount = oppCount;
        console.log(`  ✓ Historical destination contact = "${name}" (#${id}), ${oppCount} opportunities, email domain = "@${domain}"`);
        break;
      }
      expect(historical.id, 'A historical contact with >= 2 opportunities AND a usable (non-public) email domain must be found among the Activated Opps').toMatch(/^\d+$/);
      expect(historical.domain, 'The historical contact must expose the email domain used as the merge key').not.toBe('');
      expect(destOppCount, 'The chosen historical destination must carry MULTIPLE high-stage opportunities').toBeGreaterThanOrEqual(2);
      console.log(`  ✓ Chosen historical destination has ${destOppCount} opportunities (multiple high-stage)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - historical customer + email domain discovered').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Pre-condition III: Create a FRESH source Company Contact in the SAME EMAIL DOMAIN
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition III: Create a fresh source Company Contact whose email is in the same email domain', async () => {
      console.log('\n=== PRE-CONDITION III: Create fresh merge SOURCE (same email domain + same name) ===');
      sourceEmail = buildEmailInDomain('crm12059-1-4-src', historical.domain);
      console.log(`  - Name  : ${historical.name}   (shared with the historical contact)`);
      console.log(`  - Email : ${sourceEmail}   (inside the shared domain "@${historical.domain}")`);
      source = await createCompanyContact(page, contactPage, historical.name, sourceEmail);
      expect(source.id, 'source contact must have an ID').toMatch(/^\d+$/);
      expect(source.id).not.toBe(historical.id);
      expect(extractEmailDomain(sourceEmail), 'the fresh source email must sit in the historical email domain').toBe(historical.domain);

      // Both merge keys must hold before the merge: the shared email domain now lists both contacts.
      await contactPage.openContactsList();
      const domainRows = await contactPage.searchContactsByEmailDomain(historical.domain);
      console.log(`  - contacts in the shared domain "@${historical.domain}": ${domainRows}`);
      expect(domainRows, 'the historical contact and the fresh source must both sit in the shared email domain').toBeGreaterThanOrEqual(2);
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

      // Completion is read off each record's OWN EMAIL, not an exact-name count: the address is
      // unique per contact, so "was the source consumed?" no longer depends on how many contacts
      // share the name. Polled, because the source drops out of the search index slightly after the
      // wizard closes. This runs BEFORE teardown - afterEach deletes a leftover source, so an
      // email search taken after the run would read 0 whether or not the merge did anything.
      const remainingSource = await contactPage.waitForEmailRowCount(sourceEmail, 0);
      const sourceConsumed = remainingSource === 0;
      const remainingDestination = await contactPage.searchContactsByEmail(historical.email);
      const destinationSurvives = remainingDestination >= 1;
      const overall = noQualError && sourceConsumed && destinationSurvives;

      console.log('==================== VERIFY ====================');
      console.log(`  Merge keys : shared email domain "@${historical.domain}" + shared Name "${historical.name}"`);
      console.log(`  Historical (destination) : "${historical.name}" (#${historical.id}) email="${historical.email}" opportunities=${destOppCount}`);
      console.log(`  Fresh source (consumed)  : "${historical.name}" (#${source?.id}) email="${sourceEmail}"`);
      console.log('  Verify #1 - no "Qualification info" validation blocked the merge:');
      console.log('     Expected : no popup text matching /necessary fields|Qualification info/i');
      console.log(`     Actual   : ${popupText ? `popup="${popupText.slice(0, 180)}"` : 'no blocking popup'}`);
      console.log(`     Result   : ${noQualError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the merge consumed the fresh source contact (searched by ITS OWN email):');
      console.log(`     Expected : contacts with email "${sourceEmail}" = 0`);
      console.log(`     Actual   : ${remainingSource}`);
      console.log(`     Result   : ${sourceConsumed ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the historical destination contact survives (searched by ITS OWN email):');
      console.log(`     Expected : contacts with email "${historical.email}" >= 1`);
      console.log(`     Actual   : ${remainingDestination}`);
      console.log(`     Result   : ${destinationSurvives ? 'PASS' : 'FAIL'}`);
      console.log(`  Destination kept : ${destinationText}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - merging into a contact with MULTIPLE Stage>=Activated Opps ${overall ? 'is no longer blocked by the qualification rule (fix verified)' : 'was blocked / did not complete'}`);

      expect(noQualError, `No Qualification-info error must appear. Popup was: "${popupText}"`).toBe(true);
      expect(sourceConsumed, `Merge must consume the fresh source contact - searching its email "${sourceEmail}" must return 0 contacts; found ${remainingSource}`).toBe(true);
      expect(destinationSurvives, `The historical destination "${historical.name}" must survive - searching its email "${historical.email}" returned ${remainingDestination}`).toBe(true);

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
    console.log(`  ℹ Historical destination contact "${historical.name}" (#${historical.id}, domain "@${historical.domain}") was intentionally NOT deleted.`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    source = undefined;
    historical = { name: '', id: '', url: '', email: '', domain: '' };
    destOppCount = 0;
  });
});

/** Local teardown helper - deletes a contact by URL via its own ContactPage instance. */
async function contactPage_delete(page: import('@playwright/test').Page, url: string): Promise<void> {
  const cp = new ContactPage(page);
  await cp.deleteContactByURL(url);
}
