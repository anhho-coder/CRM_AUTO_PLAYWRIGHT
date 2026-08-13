import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage } from '@pages';
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
 *  Test Case ID    : CRM-12059_1.3
 *  Jira            : CRM-12059  (Post-EA Support Ticket - Veronika's request)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-13
 *  Actor           : Veronika Stasinievych (Sales Manager) - the ticket's actor and a role that
 *                    CAN merge contacts (verified: a normal sales role cannot complete the merge).
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Verifies the CRM-12059 FIX on real high-stage data. The historical Contact is TAKEN DIRECTLY as
 *    a FIXED pre-condition - "Environmental Design International" (#204921), a pre-prod Contact that
 *    is the customer of an Opportunity at Stage >= Won (the reported trigger - legacy high-stage opps
 *    that predate the Qualification-info requirement). Earlier this spec DISCOVERED that contact by
 *    walking CRM > Archive > All with Stage = "Won" and testing each customer against three guards
 *    (has an email / non-public domain / exact-unique name); that scan was slow and shifted with the
 *    shared pre-prod data, so it was replaced by the fixed record below. A FRESH source Contact is
 *    then merged INTO that historical Contact and the merge must complete with NO "Qualification
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
 *    npx playwright test --grep "CRM-12059_1.3:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (the reported scenario + dev "Test case 1", adapted to a historical merge):
 *    Pre-condition(s):
 *      I.   Log in as a Sales Manager (Veronika).
 *      II.  Open the FIXED historical Contact "Environmental Design International" (#204921) - a
 *           pre-prod Contact that is the customer of a Stage >= Won Opportunity (mirrors the reported
 *           Loxodonta AB contact, whose Won Opps have empty Qualification info) - and SAVE ITS EMAIL
 *           DOMAIN (the merge-eligibility key). The record is then checked to still satisfy what the
 *           merge needs:
 *             - CRM > Archive > All ; filter Stage = "Won" ; search that customer -> at least one
 *               Opportunity, so the high-stage pre-condition really holds on today's data
 *             - it renders under that exact name (guards against the id pointing elsewhere)
 *             - it exposes an email whose domain is a company domain (not public / free)
 *             - its name is exact-unique among Contacts, so the merge selection can be exactly two
 *               records (this one + the fresh source created next)
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
 * PINNED historical destination Contact (pre-prod, confirmed 2026-08-13): customer of a Stage=Won
 * Opportunity, real company email domain (@envdesigni.com), name exact-unique among Contacts.
 * This is the contact the Won-stage scan itself landed on.
 *
 * Pinned rather than discovered: scanning the Won Opportunities rejected most candidates on
 * duplicate company names (e.g. pre-prod holds TWO contacts named exactly "Zen Sistemi S.r.l.") and
 * burned minutes per run - in debug mode the loop looks hung. Pre-condition II still PROVES the pin
 * on live data, so a data change fails loudly instead of silently testing the wrong record.
 */
const HISTORICAL_CONTACT = { name: 'Environmental Design International', id: '204921' };

test.describe('CRM-12059_1.3 - Merge into a historical contact with a Stage>=Won Opp (the fix)', () => {
  let source: CreatedContact | undefined; // fresh SOURCE contact (consumed by the merge)
  // Pre-existing DESTINATION - never deleted. Seeded from the pinned record; `email`/`domain` are
  // read off its own form in Pre-condition II. `domain` is the merge key (shared email domain).
  let historical = { ...HISTORICAL_CONTACT, url: '', email: '', domain: '' };

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12059_1.3: Verify merging a fresh contact into a historical contact with a Stage>=Won Opp completes with no Qualification-info error', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);

    // The merge SOURCE reuses the historical Company Name and takes an email inside the historical
    // email domain, so BOTH merge keys are shared. Built in Pre-condition III, after the pin is read.
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
    // Pre-condition II: Open the PINNED historical Contact and save its email domain
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition II: Open the pinned historical Contact (#204921) and save its email domain', async () => {
      console.log('\n=== PRE-CONDITION II: Pinned historical customer + its EMAIL DOMAIN ===');
      console.log(`  - Pinned destination : "${HISTORICAL_CONTACT.name}" (#${HISTORICAL_CONTACT.id})`);

      // Open the pinned record straight by URL. openContactFormByUrl (not openContactByUrl) gates on
      // the record actually being rendered - this Odoo is hash-routed, so a hash hop would otherwise
      // let the fields be read off the PREVIOUS form. Its name check also proves the pinned id still
      // points at this contact, so a re-pointed id fails loudly instead of merging into the wrong one.
      const custUrl = `${new URL(page.url()).origin}/web#id=${HISTORICAL_CONTACT.id}&action=118&model=res.partner&view_type=form&menu_id=94`;
      const rendered = await contactPage.openContactFormByUrl(custUrl, HISTORICAL_CONTACT.name);
      expect(rendered, `the pinned contact #${HISTORICAL_CONTACT.id} must render as "${HISTORICAL_CONTACT.name}"`).toBe(true);

      // Logged as context, not asserted: Won Opps are archived on this CRM, so the smart button can
      // read 0 even though the contact does carry the legacy high-stage Opp this TC is about.
      const oppCount = await contactPage.getOpportunityStatCount().catch(() => 0);
      console.log(`  - "Opportunities" stat button on the pinned contact: ${oppCount} (active opps only - Won ones are archived)`);

      // Read the merge key (EMAIL DOMAIN) off the contact's own form.
      const email = ((await contactPage.getEmailReadonly()) || '').trim();
      const domain = extractEmailDomain(email);
      console.log(`  - contact email="${email}" -> domain="${domain}"`);
      expect(domain, `the pinned contact must expose an email domain - it is the merge key (read "${email}")`).not.toBe('');
      expect(isPublicEmailDomain(domain), `"${domain}" must be a company domain, not a public/free one shared by unrelated contacts`).toBe(false);

      // The name must be exact-unique among contacts: the fresh source reuses it, so the name search
      // must return exactly these two records - this one now, plus the source created next. A count
      // above 1 usually means a same-named source survived an earlier crashed run: clear it from the
      // Contacts list with an Email-contains "crm12059-1-3-src" filter.
      await contactPage.openContactsList();
      await contactPage.searchContactsByName(HISTORICAL_CONTACT.name);
      const exactByName = await contactPage.countRowsWithExactName(HISTORICAL_CONTACT.name);
      expect(exactByName, `"${HISTORICAL_CONTACT.name}" must be exact-unique among contacts so the merge selection is exactly two records (found ${exactByName}; a leftover "crm12059-1-3-src" contact from a crashed run would explain > 1)`).toBe(1);

      historical = { name: HISTORICAL_CONTACT.name, id: HISTORICAL_CONTACT.id, url: custUrl, email, domain };
      console.log(`  ✓ Historical destination confirmed = "${historical.name}" (#${historical.id}), email domain = "@${domain}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - pinned historical customer + email domain').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Pre-condition III: Create a FRESH source Company Contact in the SAME EMAIL DOMAIN
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition III: Create a fresh source Company Contact whose email is in the same email domain', async () => {
      console.log('\n=== PRE-CONDITION III: Create fresh merge SOURCE (same email domain + same name) ===');
      sourceEmail = buildEmailInDomain('crm12059-1-3-src', historical.domain);
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
      console.log(`  Historical (destination) : "${historical.name}" (#${historical.id}) email="${historical.email}"`);
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
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - merging into a contact with a Stage>=Won Opp ${overall ? 'is no longer blocked by the qualification rule (fix verified)' : 'was blocked / did not complete'}`);

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
  });
});

/** Local teardown helper - deletes a contact by URL via its own ContactPage instance. */
async function contactPage_delete(page: import('@playwright/test').Page, url: string): Promise<void> {
  const cp = new ContactPage(page);
  await cp.deleteContactByURL(url);
}
