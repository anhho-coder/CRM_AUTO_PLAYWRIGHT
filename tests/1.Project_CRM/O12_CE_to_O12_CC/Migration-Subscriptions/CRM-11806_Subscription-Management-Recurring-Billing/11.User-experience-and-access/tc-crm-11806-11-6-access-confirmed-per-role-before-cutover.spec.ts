import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { SubscriptionPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { loginToMigCrm } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_11.6 - Access is confirmed per role before cut-over
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_11.6
 *  Spec ID:         IS-CRM-SEC-0013
 *                   Spec text  : "Access shall be confirmed per role before cutover, so that no
 *                   user has gained or lost access."
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring
 *                   Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-11806 (feature) / CRM-12140 (implementation)
 *  QA card         : NONE. The PDF "Subscription Test Cases" (CRM-12140) writes SEC-0013 off as
 *                   "out of the specification's own scope". The specification disagrees: SEC-0013
 *                   is typed Functional and sits in the testable section "User experience &
 *                   access", beside SEC-0012 and SEC-0014 which the PDF does card (SC-33, SC-17).
 *                   Written 2026-10-19 on the tester's instruction to follow the specification.
 *  Automation-Type: new
 *  Automation-Date: 2026-10-19
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription service https://pre-sales-crm-mig.nakivo.site (Odoo 19, db odoo19)
 * --------------------------------------------------------------------------------------------
 *  WHAT THIS CASE CAN AND CANNOT PROVE - read before trusting a green tick.
 *
 *  SEC-0013 has two halves. Only one of them is checkable from the target alone:
 *
 *    (a) CHECKABLE HERE - the per-role access picture on the target is well-formed and can be
 *        recorded as the pre-cutover confirmation artefact: both groups exist, Manage implies See,
 *        and the membership of each is read out and printed.
 *    (b) NOT CHECKABLE HERE - "no user has GAINED or LOST access" is a comparison against the
 *        CURRENT engine's role assignment. No such baseline is in this repository, and this suite
 *        has no access to the current engine. The case therefore RECORDS the target-side picture
 *        and states that the comparison is owed; it does not assert a diff it cannot compute.
 *
 *  Asserting (a) and calling it SEC-0013 would be the vacuous-pass pattern this suite already has
 *  one example of (CRM-11806_1.5). The VERIFY block says which half was proven.
 *
 *  WHY THIS FINDS SOMETHING TODAY (measured 2026-10-19):
 *    - the two CRM groups are `nakivo_subscription_integration.group_see_subscriptions` (id
 *      100000001) and `…group_manage_subscriptions` (id 100000002, implies 100000001);
 *    - the ids 115 / 116 this suite had hardcoded since 2026-10-09 are GONE: 115 no longer exists
 *      and 116 is now "Super User". That is why this case resolves by XML id and asserts the
 *      implication, instead of trusting a number;
 *    - on the PEER the mirror groups are "See Subscriptions" (id 46) with ZERO members and
 *      "Manage Subscriptions" (id 47). A CRM user granted See on the CRM is therefore not
 *      recognised on the peer - the finding CRM-11806_11.1 already hits from the other side.
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a user who can read res.groups (admin_crm_mig)
 *    No test data is created - this case only reads the delivered access configuration
 *
 *  Steps to reproduce:
 *   1. Resolve the two subscription groups from their XML ids and read their names and members
 *   2. Read "Manage Subscriptions" implied_ids and confirm it implies "See Subscriptions"
 *   3. Print the per-role membership as the pre-cutover confirmation record
 *
 *  Verification Points:
 *   VP1. Both XML ids resolve to a live res.groups record
 *   VP2. "Manage Subscriptions" implies "See Subscriptions" - a manager is never without read
 *   VP3. Neither group is empty, so the roles exist in fact and not only in configuration
 *   OWED: the gained/lost comparison against the current engine - no baseline available here
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_11\.6:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_11.6';

const STEP = {
  pre1: 'Pre-condition 1: Login to the CRM (crm-mig.nakivo.site) as a user who can read res.groups',
  s1: 'Step 1: Resolve the two subscription groups from their XML ids and read their names and members',
  s2: 'Step 2: Read "Manage Subscriptions" implied_ids and confirm it implies "See Subscriptions"',
  s3: 'Step 3: Print the per-role membership as the pre-cutover confirmation record',
  verify: 'Verification',
} as const;

test.describe(`${TC_ID} - Access is confirmed per role before cut-over`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test(`${TC_ID}: Both subscription roles exist on the CRM, Manage implies See, and the per-role membership is recorded @mig-live`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subs = new SubscriptionPageMig(page);
    let seeId = 0;
    let manageId = 0;
    let seeMembers: number[] = [];
    let manageMembers: number[] = [];
    let implies: number[] = [];
    let manageName = '';
    let seeName = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      await loginToMigCrm(page, users.admin_crm_mig);
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      seeId = await subs.subscriptionGroupId('see');
      manageId = await subs.subscriptionGroupId('manage');
      console.log(`  ${SubscriptionPageMig.GROUP_XMLID.see}    -> res.groups ${seeId}`);
      console.log(`  ${SubscriptionPageMig.GROUP_XMLID.manage} -> res.groups ${manageId}`);

      const rows = await subs.readKw<any[]>(
        'res.groups', 'read', [[seeId, manageId], ['name', 'users', 'implied_ids']],
      );
      const see = (rows || []).find((r: any) => r.id === seeId);
      const manage = (rows || []).find((r: any) => r.id === manageId);
      seeName = String(see?.name ?? '');
      manageName = String(manage?.name ?? '');
      seeMembers = Array.isArray(see?.users) ? see.users : [];
      manageMembers = Array.isArray(manage?.users) ? manage.users : [];
      implies = Array.isArray(manage?.implied_ids) ? manage.implied_ids : [];
      console.log(`  "${seeName}"    holds ${seeMembers.length} user(s)`);
      console.log(`  "${manageName}" holds ${manageMembers.length} user(s)`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  "${manageName}".implied_ids = [${implies.join(', ')}] (See is ${seeId})`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      // The record IS the deliverable of SEC-0013's first half. Name the users, not just count
      // them, so the pre-cutover confirmation can be re-checked against the same set later.
      const named = await subs.readKw<any[]>(
        'res.users', 'read', [[...new Set([...seeMembers, ...manageMembers])], ['login']],
      ).catch(() => [] as any[]);
      const loginOf = new Map<number, string>((named || []).map((u: any) => [u.id, String(u.login)]));
      console.log('  PRE-CUTOVER ACCESS RECORD (crm-mig):');
      for (const uid of manageMembers) console.log(`    manage : uid ${uid}  ${loginOf.get(uid) ?? '(login unreadable)'}`);
      for (const uid of seeMembers.filter((u) => !manageMembers.includes(u))) {
        console.log(`    see    : uid ${uid}  ${loginOf.get(uid) ?? '(login unreadable)'}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - access record read from the CRM').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n=============== VERIFY ${TC_ID} ===============`);
      console.log(`VP1 - both XML ids resolve`);
      console.log(`  Expected: a live res.groups id for each of the two XML ids`);
      console.log(`  Actual  : see=${seeId} ("${seeName}"), manage=${manageId} ("${manageName}")`);
      console.log(`VP2 - Manage implies See`);
      console.log(`  Expected: ${seeId} appears in "${manageName}".implied_ids`);
      console.log(`  Actual  : [${implies.join(', ')}]`);
      console.log(`VP3 - neither role is empty`);
      console.log(`  Expected: both groups hold at least one user`);
      console.log(`  Actual  : see=${seeMembers.length}, manage=${manageMembers.length}`);
      console.log('OWED - the other half of SEC-0013 ("no user has gained or lost access") is a');
      console.log('       comparison against the CURRENT engine. No baseline exists in this repo,');
      console.log('       so this case records the target picture and does not assert the diff.');
      console.log('==================================================');

      expect(seeId, 'VP1: group_see_subscriptions should resolve to a live res.groups id').toBeGreaterThan(0);
      expect(manageId, 'VP1: group_manage_subscriptions should resolve to a live res.groups id').toBeGreaterThan(0);
      expect(seeName, 'VP1: the resolved "see" group should be the Subscriptions one').toMatch(/see subscriptions/i);
      expect(manageName, 'VP1: the resolved "manage" group should be the Subscriptions one').toMatch(/manage subscriptions/i);
      expect(implies, `VP2: "${manageName}" must imply "${seeName}" (${seeId}) - a manager without read is a widened/tightened right`).toContain(seeId);
      expect(seeMembers.length, 'VP3: "See Subscriptions" should not be empty').toBeGreaterThan(0);
      expect(manageMembers.length, 'VP3: "Manage Subscriptions" should not be empty').toBeGreaterThan(0);
    });
  });
});
