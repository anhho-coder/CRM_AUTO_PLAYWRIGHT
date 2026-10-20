import { test } from '@playwright/test';

/**
 * ============================================================================================
 *  pre-sale-7.12.1.2 - After cut-over, a request raised from an Opportunity is created in the
 *                      Pre-Sales application only, not in the current Helpdesk.
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.12.1.2
 *  Jira:             CRM-12230
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Salesperson Thomas Semerich - would run on PRE-PRODUCTION after cut-over
 *  Source manual TC: CRM-12230 (Xray Manual Steps, 5 steps)
 *  Source version:   updated 2026-09-18T10:26:00+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.12 Data, history & cut-over
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    POST-CUT-OVER validation: a newly raised request must land in the NEW Pre-Sales application and
 *    NOT in the current Helpdesk. Skipped - see BLOCKED below.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.12\.1\.2:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    (Run this as POST-CUT-OVER validation - cut-over to the new Pre-Sales application has completed.)
 *    Log in as a Salesperson - Thomas Semerich.
 *    Create an Opportunity ("Post-cutover deal <unique>", Company "Test Co <unique>", Country United
 *    States, Expected Revenue 50000); Save.
 *
 *  Steps to reproduce:
 *    1. [Manual - post-cut-over; run after the new app is live]                Expected: (EMPTY)
 *    2. Log in as the Salesperson; on the Opportunity click "Request SE Support"; fill Subject =
 *       "Post-cutover request <unique>", Support type = "Online deployment session"; press Tab and SAVE.
 *                                                                                Expected: (EMPTY)
 *    3. Confirm the linked request on the Opportunity (Tickets count).
 *         Expected: [Manual - post-cut-over] 2. The Opportunity Tickets count updates.
 *    4. Check WHERE the request was created.
 *         Expected: 3. The request is created in the NEW Pre-Sales application only.
 *    5. In the CURRENT Helpdesk, search "Post-cutover request <unique>".
 *         Expected: 4. The request is NOT found in the current Helpdesk (assert 0 rows) - post-cut-over
 *                   requests do not route to the current Helpdesk.
 *
 *  BLOCKED - MANUAL ONLY (post-cut-over): the cut-over has not happened on pre-production, so the
 *  raise still routes to the CURRENT Helpdesk (Sales Engineers) by design. Steps 4 and 5 - the substance
 *  of this TC - would fail on purpose, and asserting the opposite would invert the TC. The spec is
 *  therefore skipped at declaration level; un-skip and implement against the target Pre-Sales app
 *  once it is live. The step list below is kept so the 1:1 mapping to Jira stays visible.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in as the Salesperson Thomas Semerich; create an Opportunity (Name, Company, Country = United States, Expected Revenue = 50000) and Save',
  s1: 'Step 1: [MANUAL ONLY - post-cut-over] Run after the new app is live',
  s2: 'Step 2: On the Opportunity click "Request SE Support"; fill Subject = "Post-cutover request <unique>", Support type = "Online deployment session"; press Tab and SAVE',
  s3: 'Step 3: Confirm the linked request on the Opportunity (Tickets count)',
  s4: 'Step 4: [MANUAL ONLY - post-cut-over] Check WHERE the request was created',
  s5: 'Step 5: [MANUAL ONLY - post-cut-over] In the CURRENT Helpdesk, search "Post-cutover request <unique>"',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.12.1.2';

test.describe(`${TC} - Post-cut-over request routing`, () => {
  // MANUAL ONLY until cut-over: declaration-level skip so the browser fixture never spins up.
  test.skip(`${TC}: After cut-over, a request raised from an Opportunity is created in the Pre-Sales application only, not in the current Helpdesk.`, async () => {
    for (const label of Object.values(STEP)) console.log(`--- ${label} ---`);
  });
});
