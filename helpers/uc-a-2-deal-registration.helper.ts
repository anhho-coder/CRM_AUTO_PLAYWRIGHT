import { Page, test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';

/**
 * Shared "Steps to reproduce #1" for the UC-A-2 family (Reseller views/updates an existing
 * registration): log in as Thomas and create the deal-registration Opportunity (Opp Name #1),
 * then return its saved form URL (Opp URL #1).
 *
 * This mirrors the manual create steps and emits one test.step per step so every UC-A-2 spec
 * keeps the same, traceable step labels (REQUIREMENT #1) without duplicating the block.
 */
export interface DealRegCreateInput {
  /** Opportunity name (Opp Name #1) - must be unique per run. */
  oppName: string;
  /** Contact name (Internal Note "Name"). */
  contactName: string;
  /** Company email (Internal Note "Email"). */
  companyEmail: string;
  /** The assembled deal-registration Internal Note text. */
  internalNote: string;
  /** Lead form marker; defaults to DEAL_REGISTRATION.leadFormMarker. */
  leadFormValue?: string;
  /**
   * Assigned Partner. Defaults to DEAL_REGISTRATION.partnerCompanyName (the Reseller).
   * Pass null to intentionally NOT assign the Reseller (access-control negative, TC.-A.2.11).
   */
  assignedPartner?: string | null;
  /** Step-label prefix; defaults to "Steps to reproduce #1". */
  stepPrefix?: string;
  /**
   * When true, assume Thomas is ALREADY logged in (an active session from a previous create in the
   * same test): skip the login step and return to the Opp list via the in-app CRM brand link instead
   * of the apps-home. Use for creating a 2nd+ Opportunity in one spec (e.g. sort / multiple / isolation).
   */
  continueSession?: boolean;
}

/**
 * Create the deal-registration Opportunity as Thomas. Returns the saved Opp form URL (Opp URL #1).
 */
export async function createDealRegistrationOpportunityAsThomas(
  page: Page,
  input: DealRegCreateInput
): Promise<string> {
  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);
  const opportunityPage = new OpportunityPage(page);

  const leadForm = input.leadFormValue ?? DEAL_REGISTRATION.leadFormMarker;
  const assignedPartner =
    input.assignedPartner === undefined ? DEAL_REGISTRATION.partnerCompanyName : input.assignedPartner;
  const p = input.stepPrefix ?? 'Steps to reproduce #1';
  let oppUrl = '';

  await test.step(`${p} - Step 1: Use the account of Thomas to login successful`, async () => {
    if (input.continueSession) {
      console.log(`${p} - Step 1: Reusing the active Thomas session (no re-login)`);
      return;
    }
    console.log(`${p} - Step 1: Logging in as Thomas`);
    await loginPage.navigateTo(baseUrl);
    await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
    await loginPage.dismissLocationPermissionDialog().catch(() => {});
    console.log('✓ Logged in as Thomas');
  });

  await test.step(`${p} - Step 2: Click "CRM" button; on "CRM" page, click "view list" button`, async () => {
    console.log(`${p} - Step 2: Opening CRM and switching to list view`);
    if (input.continueSession) {
      // Already in CRM from the previous create's saved form - return to the list via the brand link
      // (navigateToCRM's apps-home tile is absent inside a form view).
      await opportunityPage.clickCRMMenuLink();
    } else {
      await homePage.navigateToCRM();
    }
    await opportunityPage.switchToListView();
    console.log('✓ CRM opened in list view');
  });

  await test.step(`${p} - Step 3: On "Opp" page, click "CREATE" button`, async () => {
    console.log(`${p} - Step 3: Clicking CREATE button`);
    await opportunityPage.clickCreate();
    console.log('✓ Opportunity creation form opened');
  });

  await test.step(`${p} - Step 4: Enter Opp name, Contact/Company/Email, Country/State, IP; Create manually = FALSE; clear Sales Team and Salesperson`, async () => {
    console.log(`${p} - Step 4: Entering Opportunity details`);
    await opportunityPage.fillOpportunityName(input.oppName);
    await opportunityPage.fillContactName(input.contactName);
    await opportunityPage.fillCompanyName(DEAL_REGISTRATION.companyName);
    await opportunityPage.fillEmail(input.companyEmail);
    await opportunityPage.selectCountry(DEAL_REGISTRATION.country);
    await opportunityPage.selectState(DEAL_REGISTRATION.state);
    await opportunityPage.fillIP(DEAL_REGISTRATION.ip);
    const setFalse = await opportunityPage.setCreatedManually(false);
    console.log(`  - Contact: "${input.contactName}" | Company: "${DEAL_REGISTRATION.companyName}" | Email: "${input.companyEmail}"`);
    console.log(`  - Country: "${DEAL_REGISTRATION.country}" | State: "${DEAL_REGISTRATION.state}" | IP: "${DEAL_REGISTRATION.ip}" | Create manually FALSE: ${setFalse}`);
    await opportunityPage.clearSalesTeam();
    await opportunityPage.clearSalesperson();
    console.log('✓ Opportunity details entered; Create manually = FALSE; Sales Team and Salesperson cleared');
  });

  await test.step(`${p} - Step 5: Click "CRM Developer" tab; set Lead form = NAKIVO deal registration*`, async () => {
    console.log(`${p} - Step 5: Setting Lead form on the CRM Developer tab`);
    await opportunityPage.clickCRMDeveloperTab();
    await opportunityPage.fillLeadForm(leadForm);
    console.log(`✓ Lead form set to "${leadForm}"`);
  });

  await test.step(
    `${p} - Step 6: Click "Assigned Partner" tab; ${assignedPartner ? `set Assigned Partner = ${assignedPartner}` : 'intentionally NOT assigning to the Reseller (access-control negative)'}`,
    async () => {
      if (assignedPartner) {
        console.log(`${p} - Step 6: Setting Assigned Partner = ${assignedPartner}`);
        await opportunityPage.clickAssignedPartnerTab();
        await opportunityPage.setAssignedPartner(assignedPartner);
        console.log(`✓ Assigned Partner set to "${assignedPartner}"`);
      } else {
        console.log(`${p} - Step 6: Leaving Assigned Partner EMPTY (registration not assigned to the Reseller)`);
      }
    }
  );

  await test.step(`${p} - Step 7: Click "Internal Notes" tab; enter Internal Note #1`, async () => {
    console.log(`${p} - Step 7: Entering the deal-registration Internal Note`);
    await opportunityPage.clickInternalNotesTab();
    await opportunityPage.fillInternalNotes(input.internalNote);
    console.log('✓ Internal Note entered');
  });

  await test.step(`${p} - Step 8: Press "SAVE" button`, async () => {
    console.log(`${p} - Step 8: Saving the Opportunity`);
    await opportunityPage.setCreatedManually(false);
    await opportunityPage.saveAndWaitForCompletion();
    const savedUrl = page.url();
    const hasRecordId = /[#?&]id=\d+/.test(savedUrl ?? '');
    const savedOppName = await opportunityPage.getOpportunityNameValue();
    console.log(`  - Saved with record id: ${hasRecordId} | Opportunity name: "${savedOppName}"`);
    expect(hasRecordId, 'Pre-condition: the Opportunity should be saved (URL should contain a record id)').toBeTruthy();
    expect(savedOppName, 'Pre-condition: the Opportunity name should persist after save').toContain(input.oppName);
  });

  await test.step(`${p} - Step 9: Save the URL of Opp Name #1 as Opp URL #1`, async () => {
    oppUrl = page.url();
    console.log(`${p} - Step 9: Opp URL #1 captured = ${oppUrl}`);
    expect(oppUrl, 'Opp URL #1 should be captured').toBeTruthy();
  });

  return oppUrl;
}

/**
 * Shared teardown: delete the created Opportunity by URL, re-logging-in as an admin (delete rights)
 * because UC-A-2 tests typically end logged in as a portal Reseller or a non-admin salesperson.
 * No-op when skip is true or url is falsy. Mirrors the TC.-A.2.1 teardown.
 *
 * Cleanup is best-effort and TIME-BOUNDED: the shared deleteRecordByUrl occasionally cannot find the
 * Action > Delete option and retries with long waits, which would otherwise consume the whole test
 * timeout and spuriously FAIL an already-passed test. We race the delete against a budget well under
 * the test timeout; on budget-expiry we log and leave the record (a leftover Opp), never failing the
 * test. Any late rejection from the abandoned delete is swallowed.
 */
export async function deleteCreatedOpportunityAsAdmin(
  page: Page,
  url: string | null,
  skip: boolean,
  testInfo: import('@playwright/test').TestInfo
): Promise<void> {
  if (skip || !url) return;
  console.log('Tear down: deleting created Opportunity (re-login as admin, time-bounded best-effort)');

  const doDelete = (async () => {
    const loginPage = new LoginPage(page);
    await loginPage.logout(baseUrl);
    await page.context().clearCookies();
    await loginPage.navigateTo(baseUrl);
    await loginPage.login(users.admin_crm.username, users.admin_crm.password);
    await loginPage.dismissLocationPermissionDialog().catch(() => {});
    await CommonUtils.deleteRecordByUrl(page, url, testInfo);
    console.log('✓ Created Opportunity deleted');
  })().catch((e) => {
    console.log(`⚠ Tear down (delete Opportunity) failed: ${e instanceof Error ? e.message : String(e)}`);
  });

  // Budget for the whole re-login + delete (pageLoad = 4 min): generous for the happy path
  // (~2 min) but well under the 15-min test timeout, so a flaky delete can never time the test out.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.log(`⚠ Tear down (delete Opportunity) exceeded its ${CommonUtils.waitTimes.pageLoad / 1000}s budget - leaving the record as a leftover (URL: ${url})`);
      resolve();
    }, CommonUtils.waitTimes.pageLoad);
  });

  await Promise.race([doDelete, budget]);
  if (timer) clearTimeout(timer);
}
