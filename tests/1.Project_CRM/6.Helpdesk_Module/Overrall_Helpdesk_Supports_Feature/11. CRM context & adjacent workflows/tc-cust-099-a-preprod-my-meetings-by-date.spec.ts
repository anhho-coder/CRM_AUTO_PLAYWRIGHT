import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { readPreprodMeetingBaseline, MeetingBaseline } from '@helpers/support-meetings-baseline.helper';

/**
 * ================================================================================================
 *  TC-CUST-099_A - An agent lists the support meetings they created, by date (the day / overdue / upcoming) - side A: Odoo 12
 *                  pre-production (baseline "as today")
 * ================================================================================================
 * Test Case ID     : TC-CUST-099_A   (side B = tc-cust-099-b-support-my-meetings-by-date.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-03 (reworked 2026-11-04 on the tester's answers)
 * Jira             : CRM-14113 (Xray Test, created 2026-11-03; feature CRM-11859)
 * Requirement      : IS-CRM-FUNC-0289-1 (Confluence 231246777 v9, answer to CRM-13843): "An agent shall be able to list their own
 *                    support meetings by date - today's, overdue and upcoming - as today."
 * Tester 2026-11-04: "my meeting" = a meeting the signed-in account CREATED itself; narrow by date on OLD meetings instead of
 *                    creating test data and observing for days. On pre-production a scheduled support meeting is
 *                    support.meeting.info (Helpdesk > Configuration > Support meeting Info), create_uid = the engineer.
 *                    The reference day D stands for "today": D = the second-latest day (my time zone) holding a meeting of mine,
 *                    so D itself, the days before it ("overdue") and the days after it ("upcoming") all hold meetings.
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted) - she
 *                    created 643 support meetings (2026-11-04); Nam Pham, the tester's example, created none on pre-production
 * Data             : READ ONLY - old meetings; search facets of this session only
 * Folder           : "11. CRM context & adjacent workflows" = Confluence 231246777 spec area of IS-CRM-FUNC-0289
 *
 * Summary: Support meeting Info + Created by = me lists my N meetings; + Meeting Time on D / before D / after D lists exactly
 * the matching ones (counts from search_count, D computed at run time).
 * Command to run: npx playwright test tc-cust-099-a-preprod --grep "TC-CUST-099_A:" --project=chromium-headless
 *
 *  Source manual TC : written 2026-11-03 from Confluence 231246777 v9 (no CSV row), reworked 2026-11-04 - Xray CRM-14113; master tab
 *                     "Helpdesk module", TC ID CRM-11859_TC-CUST-099_A; 4 steps
 *  Source version   : Confluence 231246777 v9 - re-check the master row and the Xray steps before trusting this spec
 *  Pre-conditions   : Role: L1 agent who scheduled support meetings.
 *                     1. Logged in as L1 agent Giang Le on pre-production
 *                     2. [INTERNAL check, Call API] my meetings = support.meeting.info created by me -> N; D = the second-latest
 *                        day holding one; N(D), N(before D), N(after D) by search_count (D's bounds converted from my zone to UTC)
 *  Steps to reproduce #1
 *    1. Odoo: Helpdesk > Configuration > Support meeting Info; Filters > Add Custom Filter: Created by is equal to me; read the pager
 *    2. Odoo: Filters > Add Custom Filter: Meeting Time is between D 00:00:00 and D 23:59:59; read the pager
 *    3. Odoo: remove the Meeting Time facet; Add Custom Filter: Meeting Time is before D 00:00:00; read the pager
 *    4. Odoo: remove the Meeting Time facet; Add Custom Filter: Meeting Time is after D 23:59:59; read the pager
 *  Verification - A expected
 *    1. Pager total = N.   2. = N(D) (the day's meetings).   3. = N(before D) (overdue).   4. = N(after D) (upcoming).
 *
 * Evidence: Pre-condition end shot; verify shots Steps 1-4 (search facets + pager); end of Steps to reproduce #1; afterEach
 *           start + end.
 * ================================================================================================
 */

const TC = 'TC-CUST-099_A';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - pre-production (Odoo 12 EE) as L1 agent Giang Le; [INTERNAL check, Call API] Support Team = l1',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] my meetings = support.meeting.info created by me -> N; D = the second-latest day holding one; N(D), N(before D), N(after D)',
  s1: 'Step 1: Odoo: Helpdesk > Configuration > Support meeting Info; Filters > Add Custom Filter: Created by is equal to me; read the pager',
  s2: 'Step 2: Odoo: Filters > Add Custom Filter: Meeting Time is between D 00:00:00 and D 23:59:59; read the pager',
  s3: 'Step 3: Odoo: remove the Meeting Time facet; Add Custom Filter: Meeting Time is before D 00:00:00; read the pager',
  s4: 'Step 4: Odoo: remove the Meeting Time facet; Add Custom Filter: Meeting Time is after D 23:59:59; read the pager',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const EVIDENCE = [HelpdeskPage.SEARCH_FACETS, '.o_pager_counter'];

/** `difference` = REQUIREMENT #4c conclusion, printed on a FAIL only. */
type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length); const out: string[] = []; let cur = head;
    for (const word of text.split(' ')) { if (cur.length + word.length > width && cur.trim().length > head.trim().length) { out.push(cur.trimEnd()); cur = pad; } cur += `${word} `; }
    out.push(cur.trimEnd()); return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual),
    ...(!c.passed && c.difference ? wrap('   Difference : ', c.difference) : [])];
}
/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}
const countCheck = (what: string, expectedN: number, total: number, facets: string[], meaning: string): Check => ({
  what, expected: `pager total = ${expectedN} (${meaning})`, actual: `${total}; facets ${facets.join(' | ') || '(none)'}`, passed: total === expectedN,
  difference: `expected ${expectedN}, got ${total} (${total - expectedN >= 0 ? '+' : ''}${total - expectedN})`,
});
/** 'YYYY-MM-DD' -> 'MM/DD/YYYY' (the en_US date format the custom-filter datetime input takes). */
const us = (day: string): string => { const [y, m, d] = day.split('-'); return `${m}/${d}/${y}`; };

test.describe(`${TC} - My meetings by date on Odoo 12 pre-production`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version (REQUIREMENT #7) ---\n  - Source: Confluence 231246777 v9, IS-CRM-FUNC-0289-1 (no CSV row - nothing to fingerprint)');
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - Read-only case: nothing to clean up (search facets of this session only)');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: An agent lists the support meetings they created, by date - A: Support meeting Info + Created by + Meeting Time`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hd = new HelpdeskPage(page);
    const checks: Check[] = [];
    let b: MeetingBaseline | undefined;
    let me = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl}`);
      try {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(AGENT.username, AGENT.password, CommonUtils.waitTimes.pageLoad);
        await loginPage.dismissLocationPermissionDialog();
        const emp = await hd.getMyEmployeeSupportTeam();
        me = emp.employee;
        console.log(`  [INTERNAL check, Call API] support_team = ${emp.supportTeam || '(empty)'}; employee = ${emp.employee}`);
        expect(emp.supportTeam, 'the signed-in account is an L1 agent').toBe('l1');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 1 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre1}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      try {
        b = await readPreprodMeetingBaseline(AGENT.username, AGENT.password);
        console.log(`  [INTERNAL check, Call API] uid ${b.uid}, zone ${b.tz}: N = ${b.ids.length}; D = ${b.day} (UTC ${b.utc.dayStart} .. ${b.utc.dayEnd}); N(D) = ${b.counts.onDay}, N(before D) = ${b.counts.before}, N(after D) = ${b.counts.after}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-conditions - signed in, my meetings counted');
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 2 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre2}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
    });
    if (!b) throw new Error('no baseline');
    const base = b;
    const day = us(base.day);

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await hd.openSupportMeetingInfo();
      const facets = await hd.addCustomFilter('Created by', 'is equal to', { m2o: me });
      await recordChecks(page, testInfo, checks, [countCheck('Step 1 Created by = me lists my meetings', base.ids.length, await hd.getPagerTotal(), facets, 'N = the support meetings I created')], `${TC} - Step 1 my meetings`, EVIDENCE);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const facets = await hd.addCustomFilter('Meeting Time', 'is between', { dates: [`${day} 00:00:00`, `${day} 23:59:59`] });
      await recordChecks(page, testInfo, checks, [countCheck(`Step 2 my meetings on D = ${base.day} (the day's)`, base.counts.onDay, await hd.getPagerTotal(), facets, 'N(D)')], `${TC} - Step 2 on D`, EVIDENCE);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await hd.removeSearchFacet('Meeting Time');
      const facets = await hd.addCustomFilter('Meeting Time', 'is before', { dates: [`${day} 00:00:00`] });
      await recordChecks(page, testInfo, checks, [countCheck(`Step 3 my meetings before D = ${base.day} (overdue)`, base.counts.before, await hd.getPagerTotal(), facets, 'N(before D)')], `${TC} - Step 3 before D`, EVIDENCE);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await hd.removeSearchFacet('Meeting Time');
      const facets = await hd.addCustomFilter('Meeting Time', 'is after', { dates: [`${day} 23:59:59`] });
      await recordChecks(page, testInfo, checks, [countCheck(`Step 4 my meetings after D = ${base.day} (upcoming)`, base.counts.after, await hd.getPagerTotal(), facets, 'N(after D)')], `${TC} - Step 4 after D`, EVIDENCE);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - my meetings narrowed by date');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - my meetings are listed and narrowed to the day / overdue / upcoming');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'an agent lists the meetings they created by date').toEqual([]);
    });
  });
});
