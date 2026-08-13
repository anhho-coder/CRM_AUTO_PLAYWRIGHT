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
 *  CRM-12059_1.2 - Merge a fresh Contact into a historical Contact with a Stage>=Activated Opp
 * =============================================================================================
 *  Test Case ID         : CRM-12059_1.2
 *  Jira                 : CRM-12118  (Xray Test Case)
 *  Source ticket        : CRM-12059  (Post-EA Support Ticket - Veronika's request)
 *  Test Repository Path : /CRM automation/Contact module/CRM-12059_Merge Contacts Qualification/
 *                         1.Merge-not-blocked-by-qualification
 *  Automation-Type      : new
 *  Automation-Date      : 2026-08-13
 *  Actor                : Veronika Stasinievych (Sales Manager) - the ticket's actor and a role
 *                         that CAN merge Contacts
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Merges a fresh Company Contact into the historical Contact "KooBra Software Enticklungs GmbH"
 *    (#348461), which owns legacy Stage>=Activated Opps whose Qualification info is empty, and
 *    verifies the merge is no longer blocked by the "Qualification info" rule - the CRM-12059 fix.
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "CRM-12059_1\.2:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC:
 *    Pre-condition(s):
 *      I.   Log in as a Sales Manager (Veronika).
 *      II.  Open the historical Contact and save its EMAIL DOMAIN - the merge-eligibility key:
 *             - Name         = KooBra Software Enticklungs GmbH  (#348461)
 *             - Email domain = read off the Contact form; must be a company domain, not a
 *                              public / free one
 *      III. Create a FRESH source Company Contact (the merge SOURCE) that shares BOTH merge keys
 *           with the historical Contact:
 *             - Name         = <historical customer name>
 *             - Email        = <fresh unique local-part>@<historical email domain>
 *    Steps to reproduce:
 *      1. Open Contacts, search the shared name, THEN apply Filters > "Companies", and select BOTH
 *         the historical Contact and the fresh source (exactly two).
 *      2. Action > Merge Contacts.
 *      3. Select Destination Contact = the historical Contact (#ID) and confirm the merge.
 *    Verification:
 *      No "Please fill in all necessary fields in \"Qualification info\"" error appears (the fix),
 *      and Odoo answers with its merge end screen:
 *        "There is no more contacts to merge for this request..."
 *        [DEDUPLICATE THE OTHER CONTACTS]   Maximum of Group of Contacts  0   [CLOSE]
 * =============================================================================================
 */

const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip source-contact cleanup
const QUAL_ERROR_RE = /necessary fields|Qualification info/i;
// Odoo's dialog after action_merge: "There is no more contacts to merge for this request..." with
// DEDUPLICATE THE OTHER CONTACTS / Maximum of Group of Contacts 0 / CLOSE. This dialog IS the expected
// result of this TC.
const MERGE_END_SCREEN_RE = /no more contacts to merge/i;
/**
 * PINNED historical destination Contact (pre-prod, confirmed 2026-08-13): customer of Stage=Activated
 * Opportunities, real company email domain (@koobra.de), and the only COMPANY contact under that name
 * (Contacts > Filters > "Companies" + the name returns exactly this record).
 *
 * Pinned rather than discovered: scanning the Activated Opportunities rejected most candidates on
 * duplicate company names (e.g. pre-prod holds TWO contacts named exactly "Zen Sistemi S.r.l.") and
 * burned minutes per run - in debug mode the loop looks hung - before landing on this same contact.
 *
 * The pre-conditions deliberately do NOT re-prove the record's Stage / name-uniqueness on live data:
 * they only open the form (it must render under this exact name) and read the email domain. The guard
 * that actually protects the merge is in Step 1 - the Companies-filtered name search must select
 * EXACTLY two rows, so a changed pin or a stray same-named company fails there instead of merging
 * the wrong records.
 */
const HISTORICAL_CONTACT = { name: 'KooBra Software Enticklungs GmbH', id: '348461' };

test.describe('CRM-12059_1.2 - Merge into a historical contact with a Stage>=Activated Opp (the fix)', () => {
  let source: CreatedContact | undefined; // fresh SOURCE contact (deleted in afterEach)
  // Pre-existing DESTINATION - never deleted. `domain` is the merge key (shared email domain).
  let historical = { ...HISTORICAL_CONTACT, url: '', email: '', domain: '' };

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12059_1.2: Verify merging a fresh contact into a historical contact with a Stage>=Activated Opp completes with no Qualification-info error', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
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
    // Pre-condition II: Open the PINNED historical Contact and save its email domain
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition II: Open the pinned historical Contact and save its email domain', async () => {
      console.log('\n=== PRE-CONDITION II: Pinned historical customer + its EMAIL DOMAIN ===');
      console.log(`  - Pinned destination : "${HISTORICAL_CONTACT.name}" (#${HISTORICAL_CONTACT.id})`);

      // Read the merge key (EMAIL DOMAIN) off the contact's own form. openContactFormByUrl (not
      // openContactByUrl) gates on the record actually being rendered - a hash-route hop otherwise
      // reads the PREVIOUS form's fields.
      const custUrl = `${new URL(page.url()).origin}/web#id=${HISTORICAL_CONTACT.id}&model=res.partner&view_type=form`;
      const rendered = await contactPage.openContactFormByUrl(custUrl, HISTORICAL_CONTACT.name);
      expect(rendered, `the pinned contact form (#${HISTORICAL_CONTACT.id}) must render`).toBe(true);
      const email = ((await contactPage.getEmailReadonly()) || '').trim();
      const domain = extractEmailDomain(email);
      console.log(`  - contact email="${email}" -> domain="${domain}"`);
      expect(domain, 'the pinned contact must expose an email domain - it is the merge key').not.toBe('');
      expect(isPublicEmailDomain(domain), `"${domain}" must be a company domain, not a public/free one shared by unrelated contacts`).toBe(false);

      historical = { name: HISTORICAL_CONTACT.name, id: HISTORICAL_CONTACT.id, url: custUrl, email, domain };
      console.log(`  ✓ Historical destination confirmed = "${historical.name}" (#${historical.id}), email domain = "@${domain}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - historical customer + email domain confirmed').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Pre-condition III: Create a FRESH source Company Contact in the SAME EMAIL DOMAIN
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition III: Create a fresh source Company Contact whose email is in the same email domain', async () => {
      console.log('\n=== PRE-CONDITION III: Create fresh merge SOURCE (same email domain + same name) ===');
      sourceEmail = buildEmailInDomain('crm12059-1-2-src', historical.domain);
      console.log(`  - Name  : ${historical.name}   (shared with the historical contact)`);
      console.log(`  - Email : ${sourceEmail}   (inside the shared domain "@${historical.domain}")`);
      source = await createCompanyContact(page, contactPage, historical.name, sourceEmail);
      expect(source.id, 'source contact must have an ID').toMatch(/^\d+$/);
      expect(source.id).not.toBe(historical.id);
      expect(extractEmailDomain(sourceEmail), 'the fresh source email must sit in the historical email domain').toBe(historical.domain);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - fresh source contact created').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Steps to reproduce
    // ----------------------------------------------------------------------------------------
    await test.step('Step 1: Open Contacts, search the shared name, filter Companies, select the historical + the fresh source', async () => {
      await contactPage.openContactsList();
      // ORDER MATTERS - name first, filter second. searchContactsByName() clears the search bar with
      // Ctrl+A + Backspace, and in Odoo's searchview that select-all also grabs the existing FACETS,
      // so Backspace deletes them: applying "Companies" first left the list unfiltered (the run showed
      // only a "Name" facet and individual contacts back in the rows). Adding the filter afterwards is
      // safe - it goes through the Filters dropdown and never touches the search input.
      const rows = await contactPage.searchContactsByName(historical.name);
      await contactPage.applyCompaniesFilter();
      // Re-count with the filter on: the row count returned above was still unfiltered.
      const companyRows = await contactPage.countRowsWithExactName(historical.name);
      console.log(`  - rows matching "${historical.name}": ${rows} unfiltered -> ${companyRows} company record(s)`);
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
    await test.step('Verification: no Qualification-info error and Odoo reports "There is no more contacts to merge for this request"', async () => {
      // The whole verification is read off the dialog Odoo raises after action_merge. Nothing else is
      // asserted: the records themselves are NOT re-checked, because this end screen is what the
      // scenario accepts as the outcome - see the header note.
      const popupText = await contactPage.getBlockingPopupText(CommonUtils.waitTimes.long);
      const noQualError = !QUAL_ERROR_RE.test(popupText);
      const endScreenShown = MERGE_END_SCREEN_RE.test(popupText);
      const overall = noQualError && endScreenShown;

      console.log('==================== VERIFY ====================');
      console.log(`  Merge keys : shared email domain "@${historical.domain}" + shared Name "${historical.name}"`);
      console.log(`  Destination : "${historical.name}" (#${historical.id}) email="${historical.email}"`);
      console.log(`  Fresh source: "${historical.name}" (#${source?.id}) email="${sourceEmail}"`);
      console.log(`  Destination kept in the wizard : ${destinationText}`);
      console.log('  Verify #1 - no "Qualification info" validation blocked the merge:');
      console.log('     Expected : no popup text matching /necessary fields|Qualification info/i');
      console.log(`     Actual   : ${popupText ? `popup="${popupText.slice(0, 180)}"` : 'no blocking popup'}`);
      console.log(`     Result   : ${noQualError ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Odoo shows its merge end screen:');
      console.log('     Expected : popup text matching /no more contacts to merge/i');
      console.log(`     Actual   : ${popupText ? `popup="${popupText.slice(0, 180)}"` : 'no blocking popup'}`);
      console.log(`     Result   : ${endScreenShown ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - merging into a contact with a Stage>=Activated Opp ${overall ? 'is no longer blocked by the qualification rule (fix verified)' : 'did not produce the expected dialog'}`);

      expect(noQualError, `No Qualification-info error must appear. Popup was: "${popupText}"`).toBe(true);
      expect(endScreenShown, `Odoo must report "There is no more contacts to merge for this request". Popup was: "${popupText}"`).toBe(true);

      // NOTE: `source` is deliberately left set - the merge does not consume it, so afterEach must
      // still delete it. Clearing it here would leak a same-named company contact into pre-prod and
      // break the "exactly two rows" selection on the next run.
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
