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
 *    Verifies the CRM-12059 FIX on real high-stage data. It uses a PINNED historical Contact that is
 *    the customer of MULTIPLE Opportunities and of a Stage >= Activated Opp (the reported trigger -
 *    legacy high-stage opps that predate the Qualification-info requirement), then merges a FRESH
 *    source Contact INTO that historical Contact and asserts the merge completes with NO
 *    "Qualification info" error. The historical destination Contact and its Opps are preserved (only
 *    the fresh source is consumed), so the test is repeatable.
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
 *  Source manual TC (the reported scenario + dev "Test case 1", adapted to a historical contact):
 *    Pre-condition(s):
 *      I.   Log in as a Sales Manager (Veronika).
 *      II.  Use the historical Contact "KooBra Software Enticklungs GmbH" (#348461) - a legacy
 *           high-stage customer carrying MULTIPLE Opportunities, mirroring the reported Loxodonta AB
 *           contact whose Won/Activated Opps have an empty Qualification info - and confirm every
 *           requirement on live data:
 *             - CRM > Archive > All ; filter Stage = "Activated" ; search that customer
 *               -> at least one Opportunity, so the high-stage pre-condition really holds
 *             - open the Contact; its "Opportunities" stat button must read MULTIPLE (>= 2)
 *             - SAVE ITS EMAIL DOMAIN (the merge-eligibility key); the domain must be a company
 *               domain, not a public / free one
 *             - the Contact's name must be exact-unique among Contacts, so the merge selection can
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
/**
 * PINNED historical destination Contact (pre-prod, confirmed 2026-08-13): customer of MULTIPLE
 * Stage=Activated Opportunities (3), real company email domain (@koobra.de), name exact-unique.
 *
 * Pinned rather than discovered: scanning the Activated Opportunities rejected most candidates on
 * duplicate company names (e.g. pre-prod holds TWO contacts named exactly "Zen Sistemi S.r.l.") or
 * a single opportunity, and burned minutes per run - in debug mode the loop looks hung - before
 * landing on this same contact. Pre-condition II still PROVES every requirement on live data, so a
 * data change fails loudly instead of silently testing the wrong record.
 */
const HISTORICAL_CONTACT = { name: 'KooBra Software Enticklungs GmbH', id: '348461' };

test.describe('CRM-12059_1.4 - Merge into a historical contact with MULTIPLE Stage>=Activated Opps (the fix)', () => {
  let source: CreatedContact | undefined; // fresh SOURCE contact (consumed by the merge)
  // Pre-existing DESTINATION - never deleted. `domain` is the merge key (shared email domain).
  let historical = { ...HISTORICAL_CONTACT, url: '', email: '', domain: '' };
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
    // email domain, so BOTH merge keys are shared. Built in Pre-condition III, once the pin is confirmed.
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
    // Pre-condition II: Confirm the pinned historical Contact (multi-opp, Stage >= Activated)
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition II: Confirm the pinned historical Contact has MULTIPLE Stage>=Activated Opportunities and save its email domain', async () => {
      console.log('\n=== PRE-CONDITION II: Pinned historical multi-opp customer + its EMAIL DOMAIN ===');
      console.log(`  - Pinned destination : "${HISTORICAL_CONTACT.name}" (#${HISTORICAL_CONTACT.id})`);

      // Prove the pre-condition on LIVE data instead of trusting the pin: filter the Opportunities
      // by Stage = Activated and search this customer - the rows are its legacy high-stage Opps.
      await opportunityPage.navigateToAllLeads();
      await applyActivatedFilter(opportunityPage);
      await opportunityPage.searchByName(HISTORICAL_CONTACT.name);
      const activatedOpps = await opportunityPage.countListRows();
      console.log(`  - Stage=Activated Opportunities for "${HISTORICAL_CONTACT.name}": ${activatedOpps}`);
      expect(activatedOpps, `"${HISTORICAL_CONTACT.name}" must be the customer of at least one Stage=Activated Opportunity`).toBeGreaterThanOrEqual(1);

      // Open the contact once and read BOTH requirements off its form: the MULTIPLE-opportunities
      // count (mirrors the reported Loxodonta AB contact) and the EMAIL DOMAIN (the merge key).
      // openContactFormByUrl gates on the record actually being rendered - a hash-route hop
      // otherwise reads the PREVIOUS form's fields.
      const custUrl = `${new URL(page.url()).origin}/web#id=${HISTORICAL_CONTACT.id}&model=res.partner&view_type=form`;
      const rendered = await contactPage.openContactFormByUrl(custUrl, HISTORICAL_CONTACT.name);
      expect(rendered, `the pinned contact form (#${HISTORICAL_CONTACT.id}) must render`).toBe(true);
      destOppCount = await contactPage.getOpportunityStatCount();
      const email = ((await contactPage.getEmailReadonly()) || '').trim();
      const domain = extractEmailDomain(email);
      console.log(`  - contact email="${email}" -> domain="${domain}" (opportunities: ${destOppCount})`);
      expect(destOppCount, 'The pinned historical destination must carry MULTIPLE high-stage opportunities').toBeGreaterThanOrEqual(2);
      expect(domain, 'the pinned contact must expose an email domain - it is the merge key').not.toBe('');
      expect(isPublicEmailDomain(domain), `"${domain}" must be a company domain, not a public/free one shared by unrelated contacts`).toBe(false);

      // The name must be exact-unique among contacts: the fresh source reuses it, so the name search
      // must return exactly these two records - this one now, plus the source created next.
      await contactPage.openContactsList();
      await contactPage.searchContactsByName(HISTORICAL_CONTACT.name);
      const exactByName = await contactPage.countRowsWithExactName(HISTORICAL_CONTACT.name);
      expect(exactByName, `"${HISTORICAL_CONTACT.name}" must be exact-unique among contacts so the merge selection is exactly two records`).toBe(1);

      historical = { name: HISTORICAL_CONTACT.name, id: HISTORICAL_CONTACT.id, url: custUrl, email, domain };
      console.log(`  ✓ Historical destination confirmed = "${historical.name}" (#${historical.id}), ${destOppCount} opportunities, email domain = "@${domain}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - historical customer + email domain confirmed').catch(() => {});
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
    historical = { ...HISTORICAL_CONTACT, url: '', email: '', domain: '' };
    destOppCount = 0;
  });
});

/** Local teardown helper - deletes a contact by URL via its own ContactPage instance. */
async function contactPage_delete(page: import('@playwright/test').Page, url: string): Promise<void> {
  const cp = new ContactPage(page);
  await cp.deleteContactByURL(url);
}
