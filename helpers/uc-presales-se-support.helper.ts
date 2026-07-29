import { Page, test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { OpportunityPage, SESupportPage, LoginPage, HomePage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * Shared pre-condition for the UC-7.2 "Pre-Sales Engineer takes SE support ticket" family.
 *
 * Logs in as the salesperson Thomas, creates a deal-registration Opportunity, then requests an SE
 * support ticket from it ("REQUEST SE SUPPORT" -> "New Ticket" window: Subject / Description /
 * Support type = Online deployment session -> SAVE) and confirms the Opportunity Log note shows
 * "A new ticket has been opened by the customer: <Subject>".
 *
 * Returns the created Opportunity URL (Opp URL #1) and the ticket Subject (SE_Support_Subject#1),
 * both needed by the downstream Helpdesk verification.
 */
export interface CreatedSESupport {
  /** Opp URL #1 - the saved deal-registration Opportunity form URL. */
  oppUrl: string;
  /** SE_Support_Subject#1 - the unique Subject used for the SE support ticket. */
  subject: string;
  /** Opp_Name#1 - the Opportunity name used on the create form. */
  oppName: string;
  /** Reseller_Name#1 - the Assigned Partner / reseller company name. */
  resellerName: string;
  /** Country_Name#1 - the customer Country. */
  countryName: string;
}

export async function createOppAndRequestSESupportAsThomas(
  page: Page,
  tcId: string,
  testInfo: import('@playwright/test').TestInfo,
  supportType: string = 'Online deployment session'
): Promise<CreatedSESupport> {
  const opportunityPage = new OpportunityPage(page);
  const seSupportPage = new SESupportPage(page);

  // Fresh, unique deal-registration data each run (REQUIREMENT #2).
  const { companyEmail, leadName, currentDateTime, note: internalNote } = generateDealRegistrationNote();
  const oppName = `TEST Support SE - ${tcId} - ${currentDateTime}`;
  const subject = `TEST Support SE - ${tcId} ${currentDateTime}`;
  const description = `TEST Description Support SE - ${tcId} ${currentDateTime}`;

  // ===================== Pre-condition #1: build Internal Note #1 =====================
  await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1 (edit the <...> placeholders)', async () => {
    console.log('Pre-condition #1: Internal Note #1 prepared with fresh dynamic values');
    console.log(`  - Opp name      : ${oppName}`);
    console.log(`  - Name          : ${leadName}`);
    console.log(`  - Email         : ${companyEmail}`);
    console.log(`  - Company       : Company Name Lead 1`);
    console.log(`  - Partner       : TEST-Reseller#Automation-Jun10`);
  });

  // ============ Pre-condition #2 - create the Opp as Thomas (shared helper) ============
  const oppUrl = await createDealRegistrationOpportunityAsThomas(page, {
    oppName,
    contactName: leadName,
    companyEmail,
    internalNote,
    stepPrefix: 'Pre-condition #2',
  });

  await test.step('Pre-condition #2 - Step 9: Refresh until Company and Contact are populated in Opp #1', async () => {
    console.log('Pre-condition #2 - Step 9: Waiting for the async Company and Contact to populate on Opp #1');
    await opportunityPage.openByUrl(oppUrl);
    const populated = await opportunityPage.waitForCompanyAndContactPopulated();
    console.log(`  - Company: "${populated.companyValue}" | Contact: "${populated.contactValue}"`);
    expect(populated.populated, 'Company and Contact should both be populated on Opp #1 before requesting SE support').toBeTruthy();
  });

  // ============ Pre-condition #3 - request the SE support ticket ============
  await test.step('Pre-condition #3 - Step 1: Open Opp #1', async () => {
    console.log(`Pre-condition #3 - Step 1: Opening Opp #1 = ${oppUrl}`);
    await opportunityPage.openByUrl(oppUrl);
  });

  await test.step('Pre-condition #3 - Step 2: Click "REQUEST SE SUPPORT" button to create a new SE Support', async () => {
    console.log('Pre-condition #3 - Step 2: Clicking REQUEST SE SUPPORT');
    await opportunityPage.clickRequestSESupport();
    await seSupportPage.waitForWindowOpen();
  });

  await test.step(`Pre-condition #3 - Step 3: On the "New Ticket" window, set Subject / Description / Support type = ${supportType}`, async () => {
    console.log('Pre-condition #3 - Step 3: Filling the New Ticket window');
    console.log(`  - Subject (SE_Support_Subject#1) : ${subject}`);
    console.log(`  - Description                    : ${description}`);
    console.log(`  - Support type                   : ${supportType}`);
    await seSupportPage.fillSubject(subject);
    await seSupportPage.fillDescription(description);
    await seSupportPage.selectSupportType(supportType);
  });

  await test.step('Pre-condition #3 - Step 4: Press "SAVE" button', async () => {
    console.log('Pre-condition #3 - Step 4: Saving the New Ticket');
    await seSupportPage.save();
  });

  await test.step('Pre-condition #3 - Step 5: On the Opportunity Log note, wait for the "A new ticket has been opened by the customer" message', async () => {
    const expectedMessage = `A new ticket has been opened by the customer: ${subject}`;
    console.log(`Pre-condition #3 - Step 5: Waiting for the Opportunity Log note message: "${expectedMessage}"`);
    await opportunityPage.openByUrl(oppUrl);
    const result = await opportunityPage.waitForChatterContaining(
      expectedMessage,
      6,
      CommonUtils.waitTimes.long,
      CommonUtils.waitTimes.pageLoad
    );
    console.log(`  - Message found: ${result.found}`);
    expect(result.found, `Pre-condition: the Opportunity Log note should confirm the ticket was opened ("${expectedMessage}")`).toBeTruthy();
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - SE support ticket created').catch(() => {});
  });

  return {
    oppUrl,
    subject,
    oppName,
    resellerName: DEAL_REGISTRATION.partnerCompanyName,
    countryName: DEAL_REGISTRATION.country,
  };
}

/**
 * Shared UC-7.3 navigation (as the Pre-Sales Engineer Nick Luchkov): from a just-created SE support
 * ticket, log in as Nick, open the Sales Engineers TICKETS, find the ticket by Subject, select it,
 * press "ASSIGN TO ME", and open the "Opportunity Info" tab. Emits one test.step per manual step so
 * every UC-7.3 spec keeps identical, traceable step labels (steps 1-9).
 *
 * Returns the "Expected Revenue Deal" value captured from the ticket LIST column (used by 7.3.1.4 as
 * Expected_Revenue_Deal#1 for a list-vs-tab cross-check).
 */
export async function assignAndOpenOpportunityInfoTabAsNick(
  page: Page,
  subject: string,
  testInfo: import('@playwright/test').TestInfo
): Promise<{ expectedRevenueFromList: string }> {
  const loginPage = new LoginPage(page);
  const homePage = new HomePage(page);
  const helpdesk = new HelpdeskPage(page);
  let expectedRevenueFromList = '';

  await test.step('Step 1: Login as Pre-Sales Engineer = Nick Luchkov', async () => {
    console.log('Step 1: Logging in as Nick Luchkov (Pre-Sales Engineer)');
    await loginPage.logout(baseUrl).catch(() => {});
    await page.context().clearCookies();
    await loginPage.navigateTo(baseUrl);
    await loginPage.login(users.pre_sales_engineer.username, users.pre_sales_engineer.password);
    await loginPage.dismissLocationPermissionDialog().catch(() => {});
    console.log('✓ Logged in as Nick Luchkov');
  });

  await test.step('Step 2: Go to Helpdesk module at Homepage', async () => {
    console.log('Step 2: Opening the Helpdesk module');
    await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.pageLoad);
    await helpdesk.navigateToHelpdesk();
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Helpdesk opened').catch(() => {});
  });

  await test.step('Step 3-4: Find the "Sales Engineers" section and click its "TICKETS" button', async () => {
    console.log('Step 3-4: Opening the Sales Engineers team TICKETS');
    await helpdesk.openSalesEngineersTickets();
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3-4 - Sales Engineers TICKETS opened').catch(() => {});
  });

  await test.step('Step 5: Click at "view list"', async () => {
    console.log('Step 5: Switching to list view');
    await helpdesk.switchToListView();
  });

  await test.step('Step 6: Search SE_Support_Subject#1 that was created in the pre-condition', async () => {
    console.log(`Step 6: Searching for SE_Support_Subject#1 = "${subject}"`);
    await helpdesk.searchTicket(subject);
    const visible = await helpdesk.isTicketVisible(subject);
    expect(visible, `Step 6: the ticket "${subject}" should appear before opening it`).toBeTruthy();
    // Capture the "Expected Revenue Deal" from the list column (Expected_Revenue_Deal#1 for 7.3.1.4).
    expectedRevenueFromList = await helpdesk.getTicketListColumnValue(subject, 'Expected Revenue Deal');
    console.log(`  - Expected Revenue Deal (from list) = "${expectedRevenueFromList}"`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - Ticket searched').catch(() => {});
  });

  await test.step('Step 7: Select (open) the SE_Support_Subject#1 ticket', async () => {
    console.log('Step 7: Opening the ticket');
    await helpdesk.openTicket(subject);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 7 - Ticket opened').catch(() => {});
  });

  await test.step('Step 8: Press "ASSIGN TO ME" button', async () => {
    console.log('Step 8: Clicking ASSIGN TO ME');
    await helpdesk.clickAssignToMe();
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 8 - Assigned to me').catch(() => {});
  });

  await test.step('Step 9: Press "Opportunity Info" tab', async () => {
    console.log('Step 9: Opening the Opportunity Info tab');
    await helpdesk.openOpportunityInfoTab();
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 9 - Opportunity Info tab').catch(() => {});
  });

  return { expectedRevenueFromList };
}

/**
 * Shared UC-7.1 teardown: clean up BOTH the created SE Support ticket AND the Opportunity in a SINGLE
 * admin session, because the UC-7.1 tests end logged in as the salesperson Thomas (no delete rights).
 *
 * IMPORTANT: helpdesk tickets CANNOT be deleted (their Action menu has no "Delete", only "Archive"),
 * so the ticket is ARCHIVED, not deleted: navigate DIRECTLY to the Sales Engineers tickets list (fast,
 * skips the slow Overview kanban), search it by Subject, tick its row checkbox, and Action > Archive.
 * The Opportunity IS deletable, so it is removed via the shared CommonUtils.deleteRecordByUrl.
 *
 * One re-login as admin, then sequentially: archive the ticket, then delete the Opp - both in ONE
 * session (rather than two teardowns racing their own budget over the SAME page) to avoid page
 * contention. Best-effort and TIME-BOUNDED as the LAST teardown action: the whole session is raced
 * against a budget (seSupportTeardown = 6 min) under the test timeout, so a flaky Helpdesk load can
 * never time an already-passed test out; leftovers are logged, never fatal. A missing ticket Subject
 * (e.g. the test failed before saving it) is simply skipped.
 */
export async function deleteCreatedSESupportTicketAndOppAsAdmin(
  page: Page,
  records: { ticketSubject: string | null; oppUrl: string | null },
  skip: { ticket: boolean; opp: boolean },
  testInfo: import('@playwright/test').TestInfo
): Promise<void> {
  const wantTicket = !skip.ticket && !!records.ticketSubject;
  const wantOpp = !skip.opp && !!records.oppUrl;
  if (!wantTicket && !wantOpp) return;
  console.log('Tear down: archiving SE Support ticket + deleting Opportunity (single admin session, time-bounded best-effort)');

  const doCleanup = (async () => {
    const loginPage = new LoginPage(page);

    // Single re-login as admin (delete/archive rights) - Thomas cannot delete tickets/Opps.
    await loginPage.logout(baseUrl).catch(() => {});
    await page.context().clearCookies();
    await loginPage.navigateTo(baseUrl);
    await loginPage.login(users.admin_crm.username, users.admin_crm.password);
    await loginPage.dismissLocationPermissionDialog().catch(() => {});

    // 1) SE Support ticket - ARCHIVE from the Sales Engineers list (tickets can't be deleted).
    if (wantTicket) {
      const subject = records.ticketSubject as string;
      try {
        const helpdesk = new HelpdeskPage(page);
        await helpdesk.openSalesEngineersTicketsListDirect();
        await helpdesk.searchTicket(subject);
        const archived = await helpdesk.archiveTicketFromListBySubject(subject);
        console.log(archived ? '✓ Created SE Support ticket archived' : `⚠ Could not archive ticket "${subject}" (not found or not selectable)`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Tear down - SE Support ticket archived').catch(() => {});
      } catch (e) {
        console.log(`⚠ Archive SE Support ticket failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 2) Opportunity - direct form URL delete (Opps are deletable).
    if (wantOpp) {
      await CommonUtils.deleteRecordByUrl(page, records.oppUrl as string, testInfo);
      console.log('✓ Created Opportunity deleted');
    }
  })().catch((e) => {
    console.log(`⚠ Tear down (SE Support cleanup) failed: ${e instanceof Error ? e.message : String(e)}`);
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.log(`⚠ Tear down exceeded its ${CommonUtils.waitTimes.seSupportTeardown / 1000}s budget - leaving leftovers (ticket: ${records.ticketSubject}, opp: ${records.oppUrl})`);
      resolve();
    }, CommonUtils.waitTimes.seSupportTeardown);
  });

  await Promise.race([doCleanup, budget]);
  if (timer) clearTimeout(timer);
}
