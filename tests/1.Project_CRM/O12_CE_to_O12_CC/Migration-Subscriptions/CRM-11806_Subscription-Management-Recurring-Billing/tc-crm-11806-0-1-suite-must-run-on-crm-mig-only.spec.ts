import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ============================================================================================
 *  CRM-11806_0.1 - GUARD: every spec in this suite must run on crm-mig, never on pre-production
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_0.1
 *  Automation-Type: guard (static analysis of the suite's own source - opens no browser)
 *  Automation-Date: 2026-10-12
 * --------------------------------------------------------------------------------------------
 *  WHY THIS EXISTS
 *
 *  On 2026-10-12 CRM-11806_1.4 was un-skipped to see what a blocked spec does. It passed - on
 *  **pre-production**, where it created a real Opportunity, a confirmed Sales Order and the
 *  subscription SUB1732. The file imports `baseUrl_mig as baseUrl` and the Mig page objects, so it
 *  read as a crm-mig spec; the pre-production host was inside the HELPER it called
 *  (`createDealRegistrationOpportunityAsThomas`), exactly as it is inside `loginAsCrmAdmin` and
 *  `createSubscription` in helpers/crm-11806-subscription.helper.ts.
 *
 *  Reading a spec's own imports is therefore NOT enough to know which system it writes to, and
 *  22 of the 47 specs were in that state. This guard is the check that is enough: it reads every
 *  spec in the suite and fails if any of them can reach a pre-production-bound entry point.
 *
 *  The banned symbols are the ones that call `loginPage.navigateTo(baseUrl)` with the
 *  pre-production `baseUrl`:
 *    - `loginAsCrmAdmin`   -> use `loginAsCrmAdminMig`   (helpers/crm-11806-mig-subscription.helper)
 *    - `createSubscription`-> use `createSubscriptionMig` (same file; drives the embed's New button)
 *    - `createDealRegistrationOpportunityAsThomas` / `deleteCreatedOpportunityAsAdmin`
 *      -> pass `baseUrlOverride: baseUrl_mig` and the crm-mig account
 *
 *  Pure constants and pure functions from the pre-production helper (`SKU_*`, `TEMPLATE_*`,
 *  `logVerify`, `parseMMDDYYYY`, `dayDiff`, `todayMMDDYYYY`, ...) are fine - they navigate nowhere.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_0\.1:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_0.1';

/**
 * The check is on the IMPORT SOURCE, not on the call name.
 *
 * The call sites keep their original names on purpose - the fix was an alias import
 * (`loginAsCrmAdminMig as loginAsCrmAdmin`), which keeps the diff to one line per spec. So
 * `await loginAsCrmAdmin(...)` is correct when the identifier came from the MIG helper and wrong
 * when it came from the pre-production one. Only the import tells them apart.
 */
const BANNED_IMPORTS = ['loginAsCrmAdmin', 'createSubscription'];
const PREPROD_HELPER = "@helpers/crm-11806-subscription.helper";

/** These two are allowed ONLY when the call passes an explicit crm-mig host override. */
const NEEDS_OVERRIDE = [
  'createDealRegistrationOpportunityAsThomas',
  'deleteCreatedOpportunityAsAdmin',
];

function listSpecs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSpecs(full));
    else if (entry.name.endsWith('.spec.ts') && entry.name !== path.basename(__filename).replace(/\.js$/, '.ts')) out.push(full);
  }
  return out;
}

test.describe(`${TC_ID} - Every spec in this suite runs on crm-mig only`, () => {
  test(`${TC_ID}: No spec in the CRM-11806 crm-mig suite can reach pre-production @mig-guard`, async () => {
    const suiteRoot = __dirname;
    const specs = listSpecs(suiteRoot).filter((f) => !f.endsWith(path.basename(__filename).replace(/\.ts$/, '.ts')));
    const offenders: string[] = [];

    for (const file of specs) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(suiteRoot, file).replace(/\\/g, '/');

      const importMatch = src.match(
        /import\s*\{([^}]*)\}\s*from\s*'@helpers\/crm-11806-subscription\.helper'/,
      );
      if (importMatch) {
        const named = importMatch[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
        for (const bad of BANNED_IMPORTS) {
          if (named.includes(bad)) {
            offenders.push(`${rel}  imports ${bad} from '${PREPROD_HELPER}' (PRE-PRODUCTION) - use ${bad}Mig from '@helpers/crm-11806-mig-subscription.helper'`);
          }
        }
      }
      for (const fn of NEEDS_OVERRIDE) {
        const callRe = new RegExp(`await\\s+${fn}\\s*\\(`);
        if (callRe.test(src) && !/baseUrlOverride\s*:/.test(src)) {
          offenders.push(`${rel}  calls ${fn}() without baseUrlOverride - it defaults to pre-production`);
        }
      }
      // a spec that hardcodes the pre-production host is wrong whatever it imports
      if (/pre-production\.nakivo\.site/.test(src.replace(/^\s*\*.*$/gm, ''))) {
        offenders.push(`${rel}  mentions pre-production.nakivo.site outside a comment`);
      }
    }

    console.log('\n==================== VERIFY ====================');
    console.log(`  Verify #1 - no spec in this suite can reach pre-production:`);
    console.log(`     Expected : 0 offenders across ${specs.length} spec file(s)`);
    console.log(`     Actual   : ${offenders.length} offender(s)`);
    for (const o of offenders) console.log(`                ${o}`);
    console.log(`     Result   : ${offenders.length === 0 ? 'PASS' : 'FAIL'}`);
    console.log('===============================================');
    console.log(`OVERALL: ${offenders.length === 0 ? 'PASS' : 'FAIL'} - the CRM-11806 suite is crm-mig only`);

    expect(
      offenders,
      `These specs can still reach PRE-PRODUCTION:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
