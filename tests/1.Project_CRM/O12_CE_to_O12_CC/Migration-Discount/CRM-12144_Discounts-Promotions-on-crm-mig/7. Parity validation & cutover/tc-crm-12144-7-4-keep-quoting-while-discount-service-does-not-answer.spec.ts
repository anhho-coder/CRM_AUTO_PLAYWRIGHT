import { test } from '@playwright/test';

/**
 * ================================================================================================
 *  CRM-12144_7.4 - Keep quoting while the Discount Service does not answer   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_7.4
 * Automation-Type  : MANUAL         Automation-Date : 2026-11-06 (spec created as a skipped stub, set MANUAL)
 * Jira             : CRM-12304 (Xray Test, Automation scope = Not automatable, Status Open; feature CRM-12144)
 * Spec             : [Migration] Discounts (Promotions), page 222532591 - IS-CRM-REL-0003
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 *
 * MANUAL - why this spec is skipped (tester, 2026-11-06: "7.4 se la not able to automation"):
 *   The case needs the connection from crm-mig to the Discount Service cut for the duration of the run (pre-condition 4) and
 *   restored at step 5. crm-mig is a shared environment, so every automated run would take promotions away from every other
 *   user of crm-mig while it runs. Development team's answer on CRM-12144 (Nathan Do, comment 716893, 2026-10-28): QA cuts the
 *   connection itself (Discount Service URL port or Maintenance mode) and announces the window. Run by hand on 2026-10-30 by
 *   Thuat Phung: PASS on Test Execution CRM-13537.
 *
 *  Source manual TC : Xray CRM-12304 (5 steps, read 2026-11-06; issue updated 2026-10-30); master tab "Migration - Discount",
 *                     TC ID CRM-12144_7.4 - verbatim, ASCII
 *  Pre-conditions   : Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *                     (e.g. Thomas Semerich)
 *                     Create a new company in Contacts with:
 *                       Name      = Disc-Cust-<timestamp>
 *                       Type      = end customer (no Reseller, no Distributor)
 *                       Pricelist = Public Pricelist (USD)
 *                     Create a new opportunity in CRM > Pipeline with:
 *                       Name      = Disc-Opp-<timestamp>
 *                       Customer  = Disc-Cust-<timestamp>
 *                     Open the opportunity, click DEAL ELEMENT, add A2144B with Ordered Qty 5, pick Deal registration and click
 *                     Save (Deal Element #1)
 *                     Ask the development team to cut the connection from crm-mig to the Discount Service and wait for their
 *                     confirmation
 *  Steps to reproduce
 *    1. Open a new quotation for the company and add A2144B with Ordered Qty 5
 *    2. Change Ordered Qty three times within 10 seconds
 *    3. Click Save
 *    4. On Deal Element #1, raise Ordered Qty by 1 and click Save
 *    5. Ask the development team to restore the connection, wait 10 seconds, change Ordered Qty on Deal Element #1 and click Save
 *  Expected
 *    1. After about 3 seconds the warning Promotions unavailable appears; its text starts with "The Discount Service did not
 *       answer" and says an administrator can switch on maintenance mode in Settings > Discount Service
 *    2. Each change answers at once
 *    3. The quotation is saved
 *    4. The warning appears, the Deal Element is saved, Promotion is still Deal registration and the reward line keeps its
 *       previous amount
 *    5. The reward line is recomputed for the new quantity, with no warning
 *
 * Re-enable: only if the tester reverses the decision - e.g. a crm-mig instance of its own where cutting the Discount Service
 * touches no other user; then implement steps 1-5 here with a deny-list teardown of the company, the opportunity and the
 * quotation.
 * ================================================================================================
 */

const TC = 'CRM-12144_7.4';

const MANUAL_REASON =
  'MANUAL (tester, 2026-11-06): not automatable - the case cuts the crm-mig connection to the Discount Service, which takes promotions away from every user of the shared crm-mig while it runs - run CRM-12304 by hand in an announced window';

test.describe(`${TC} - Keep quoting while the Discount Service does not answer (crm-mig)`, () => {
  test(`${TC}: Keep quoting while the Discount Service does not answer`, async () => {
    test.skip(true, MANUAL_REASON);
  });
});
