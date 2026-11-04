import { test } from '@playwright/test';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-CUST-099_B - An agent lists the support meetings they created, by date - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-CUST-099_B   (side A = tc-cust-099-a-preprod-my-meetings-by-date.spec.ts - reference for the intent only,
 *                    map in helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : MANUAL         Automation-Date : 2026-11-03 (reworked 2026-11-04 to the explored FF path, set MANUAL)
 * Jira             : CRM-14114 (Xray Test, Automation scope = No; feature CRM-11859)
 * Requirement      : IS-CRM-FUNC-0289-1 (Confluence 231246777 v9, answer to CRM-13843): "An agent shall be able to list their own
 *                    support meetings by date - today's, overdue and upcoming - as today."
 * Tester 2026-11-04: "my meeting" = a meeting the signed-in account CREATED itself. The Support service is a NEW system - the
 *                    pre-production baseline is reference only; the B path is the one explored on FF: create a ticket > a meeting
 *                    on it > back to the Meetings page and filter.
 *
 * MANUAL - why this spec is skipped (tester, 2026-11-04):
 *   An NK Meeting is saved only in a Meeting Room whose provider token is valid, and the rooms' tokens need updating regularly,
 *   so the case is run by hand. Measured 2026-11-04 as Giang Le (tests/_explore/helpdesk-v9-20261104-own-meeting-b.explore.spec.ts
 *   B11): Save in room "Zoom Link #2" -> HTTP 417 "Meeting was not created: Zoom room Zoom Link #2 has no credentials (NK Meeting
 *   Room)." - nothing created. Of the 6 active rooms only "Zoom Link #1" carries credentials, and it is a REAL Zoom account that
 *   automation must not book meetings on.
 *
 *  Source manual TC : Xray CRM-14114 (7 steps, rewritten 2026-11-04); master tab "Migration - Customer Support", TC ID
 *                     CRM-11859_TC-CUST-099_B
 *  Pre-conditions   : Role: L1 agent. Check the token of the Meeting Room you will use before the run.
 *                     Logged in as L1 agent Giang Le on the Support service (Frappe Helpdesk)
 *                     Ticket : Subject             = MANUAL-CRM-11859-TC-CUST-099_B-<date>
 *                              Raised By (Email)   = a test customer address
 *                              Description         = Manual check of CRM-11859 TC-CUST-099_B
 *                     Meeting: Start               = D 10:00, D = tomorrow
 *                              Meeting Type        = Regular meeting
 *                              Customer's Timezone = the customer's zone
 *                              Meeting Room        = a room with a valid token
 *                     After the run: delete the meeting on Zoom (by its Provider Meeting Id), then the meeting and the ticket.
 *  Steps to reproduce
 *    1. FF: All Tickets > Create: Subject, Raised By (Email) and Description as in the test data; Submit
 *    2. FF: on the new ticket: Assign to me; header Actions > Schedule meeting
 *    3. FF: in the drawer "Schedule meeting #<ticket>": Start = D 10:00, Meeting Type = Regular meeting, Customer's Timezone,
 *       Meeting Room = a room with a valid token; Save
 *    4. FF: sidebar Meetings; Filter: Created By = me
 *    5. FF: Meetings: Filter: Created By = me and Start between D and D
 *    6. FF: Meetings: Filter: Created By = me and Start before D 00:00:00
 *    7. FF: Meetings: Filter: Created By = me and Start after D 23:59:59
 *  Expected
 *    1. The ticket is created and opens with its number.
 *    2. The drawer opens the form New NK Meeting with Assignee = me, Ticket = the new ticket, Platform = Zoom, Duration (min) = 120,
 *       Attendees = me + the ticket's contact.
 *    3. Saved (the form leaves "Not Saved") with a Provider Meeting Id or a Join URL. The refusal above = the room has no token:
 *       update it and repeat the step.
 *    4. The meeting just created is listed.   5. Listed (the day's).   6. NOT listed (overdue).   7. NOT listed (upcoming).
 *
 * Re-enable: only once a Meeting Room with a token that automation may book on exists - then implement steps 1-7 here (helpers:
 * SupportDeskPageMig.assignToMeFromHeader / scheduleMeetingFromActions / openMeetingsList / filterMeetingsList /
 * clearMeetingsListFilters) with a deny-list teardown of the ticket, the meeting and the provider meeting.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-CUST-099_B';

const MANUAL_REASON =
  "MANUAL (tester, 2026-11-04): an NK Meeting is saved only in a Meeting Room whose provider token is valid and the rooms' tokens need updating regularly - run CRM-14114 by hand";

test.describe(`${TC} - My meetings by date on the Support service`, () => {
  test(`${TC}: An agent lists the support meetings they created, by date - B: Frappe Helpdesk Meetings list`, customerSupportBaselineDetails(TC), async () => {
    test.skip(true, MANUAL_REASON);
  });
});
