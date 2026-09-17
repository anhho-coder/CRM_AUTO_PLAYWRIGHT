import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig/MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.3.1 ==========
 * Test Case ID    : CRM-12366_4.3.1
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.3 Install hygiene, including prune
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : rewritten
 * Automation-Date : 2026-09-17
 *
 * Summary:
 *   Verify that exercising the instance records no NEW server-side failure in any error
 *   surface Odoo exposes over RPC - the asynchronous job queue, the outgoing-mail queue and
 *   the database log table.
 *
 * WHY THIS WAS REWRITTEN (2026-09-17):
 *   The original wording was "no traceback appears in the server log during the entire QA
 *   session". QA has no server-log access on this host, so the case could never be scored and
 *   sat BLOCKED. It now asserts the same intent - no server-side failure caused by this check -
 *   against the three failure surfaces that ARE readable over an authenticated JSON-RPC session.
 *
 *   The comparison is by RECORD ID SET, not by timestamp: the baseline is the set of already
 *   failing rows, and the assertion is that no id outside that set appears afterwards. That is
 *   immune to clock skew between the runner and the server.
 *
 * LIMIT OF THIS CHECK - do not over-read a green:
 *   This does NOT read the server log. A traceback that is written only to the log file and
 *   never reaches queue.job, mail.mail or ir.logging is invisible here. Scoring the raw log
 *   still needs either QA log access or a Dev-supplied export, and that ask stays on CRM-12126.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.3\\.1:" --project=O12
 *
 * Source manual TC (rewritten):
 *   Pre-conditions:
 *     - VPN connected and crm-mig.nakivo.site reachable
 *     - Login as anh.ho@nakivo.com (admin_crm_mig), db nakivoCE
 *     - crm-mig is read-only for this TC: it creates, modifies and deletes nothing
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Record the baseline: the ids of every queue.job in state failed, the ids of every
 *        mail.mail in state exception, and the total row count of ir.logging.
 *     3. Exercise the instance: build the form view of each core model over RPC, the same call
 *        the web client makes when a user opens that screen, and read the root menu list.
 *     4. Re-read the three surfaces.
 *     5. Compare by id: any id not present in the baseline is a failure this check caused.
 *     6. Report the pre-existing failures separately - they belong to their own triage.
 *
 *   Expected:
 *     - The exercise actually ran: every core model returned a non-empty view arch
 *     - Zero NEW queue.job rows in state failed
 *     - Zero NEW mail.mail rows in state exception
 *     - Zero NEW ir.logging rows at level ERROR or CRITICAL
 *     - If ir.logging holds no rows at all, log_db is disabled on this host and that leg is
 *       reported NOT SCORED - never counted as a pass
 *     - At least one surface was scored, so an all-unavailable run cannot read as a pass
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

/** Core models whose form view the exercise builds - the same RPC the web client issues. */
const EXERCISE_MODELS = [
  'crm.lead',
  'res.partner',
  'sale.order',
  'account.invoice',
  'product.template',
  'res.users',
] as const;

interface SurfaceSnapshot {
  available: boolean;
  ids: number[];
  detail: Array<{ id: number; when: string; what: string }>;
  note: string;
}

interface Outcome {
  viewsBuilt: number;
  emptyArchModels: string[];
  rootMenus: number;
  jobsBefore: SurfaceSnapshot;
  jobsAfter: SurfaceSnapshot;
  mailBefore: SurfaceSnapshot;
  mailAfter: SurfaceSnapshot;
  loggingTotal: number;
  loggingNewErrors: number;
  loggingScored: boolean;
  newJobIds: number[];
  newMailIds: number[];
  surfacesScored: number;
}

test.describe('CRM-12366 4.3.1 - No server-side failure during the check', () => {
  const STEP = {
    pre1: 'Pre-condition: login on the Migration server',
    s1: 'Step 1-2: [INTERNAL check, Call API] Record the baseline of every readable failure surface',
    s2: 'Step 3: [INTERNAL check, Call API] Exercise the instance - build each core model form view',
    s3: 'Step 4-6: [INTERNAL check, Call API] Re-read the surfaces and diff them by record id',
    verify: 'Verification',
  } as const;

  test('CRM-12366_4.3.1: Verify exercising the instance records no new server-side failure', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPlatform = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.3.1 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    /** Read one failure surface. A model that does not exist on this base is reported, not passed. */
    const readSurface = async (
      model: string,
      domain: unknown[],
      whenField: string,
      whatFields: string[],
    ): Promise<SurfaceSnapshot> => {
      try {
        const rows: Array<Record<string, unknown>> = await migPlatform.callKw(
          model,
          'search_read',
          [domain],
          { fields: ['id', whenField, ...whatFields], limit: 500 },
        );
        return {
          available: true,
          ids: rows.map((r) => Number(r.id)),
          detail: rows.map((r) => ({
            id: Number(r.id),
            when: String(r[whenField] ?? ''),
            what: whatFields.map((f) => String(r[f] ?? '')).filter(Boolean).join(' '),
          })),
          note: '',
        };
      } catch (e) {
        return { available: false, ids: [], detail: [], note: String((e as Error).message).slice(0, 160) };
      }
    };

    const jobDomain = [['state', '=', 'failed']];
    const mailDomain = [['state', '=', 'exception']];

    const baseline = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      const jobsBefore = await readSurface('queue.job', jobDomain, 'date_created', ['model_name', 'method_name']);
      const mailBefore = await readSurface('mail.mail', mailDomain, 'write_date', ['subject']);

      let loggingTotal = -1;
      try {
        loggingTotal = await migPlatform.callKw('ir.logging', 'search_count', [[]], {});
      } catch (e) {
        console.log(`  ir.logging not readable: ${String((e as Error).message).slice(0, 120)}`);
      }

      console.log(`  queue.job  failed at baseline : ${jobsBefore.available ? jobsBefore.ids.length : 'model not available'}`);
      if (jobsBefore.available && jobsBefore.ids.length) {
        console.log(`    ids: ${jobsBefore.ids.join(', ')}`);
      }
      console.log(`  mail.mail  exception at baseline : ${mailBefore.available ? mailBefore.ids.length : 'model not available'}`);
      if (mailBefore.available && mailBefore.ids.length) {
        console.log(`    ids: ${mailBefore.ids.join(', ')}`);
      }
      console.log(`  ir.logging rows (all time)   : ${loggingTotal < 0 ? 'not readable' : loggingTotal}`);

      return { jobsBefore, mailBefore, loggingTotal };
    });

    const exercise = await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      let viewsBuilt = 0;
      const emptyArchModels: string[] = [];

      for (const model of EXERCISE_MODELS) {
        const view: { arch?: string } = await migPlatform.callKw(model, 'fields_view_get', [], { view_type: 'form' });
        const archLen = view && typeof view.arch === 'string' ? view.arch.length : 0;
        console.log(`  fields_view_get(${model}, form) -> arch ${archLen} bytes`);
        if (archLen > 0) viewsBuilt++;
        else emptyArchModels.push(model);
      }

      const rootMenus: Array<{ id: number }> = await migPlatform.callKw(
        'ir.ui.menu',
        'search_read',
        [[['parent_id', '=', false]]],
        { fields: ['id', 'name'], limit: 200 },
      );
      console.log(`  root menus read: ${rootMenus.length}`);

      return { viewsBuilt, emptyArchModels, rootMenus: rootMenus.length };
    });

    const result: Outcome = await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      const jobsAfter = await readSurface('queue.job', jobDomain, 'date_created', ['model_name', 'method_name']);
      const mailAfter = await readSurface('mail.mail', mailDomain, 'write_date', ['subject']);

      const beforeJobIds = new Set(baseline.jobsBefore.ids);
      const beforeMailIds = new Set(baseline.mailBefore.ids);
      const newJobIds = jobsAfter.ids.filter((id) => !beforeJobIds.has(id));
      const newMailIds = mailAfter.ids.filter((id) => !beforeMailIds.has(id));

      let loggingNewErrors = 0;
      const loggingScored = baseline.loggingTotal > 0;
      if (loggingScored) {
        loggingNewErrors = await migPlatform.callKw(
          'ir.logging',
          'search_count',
          [[['level', 'in', ['ERROR', 'CRITICAL']]]],
          {},
        );
      }

      console.log(`  NEW failed queue.job      : ${newJobIds.length}${newJobIds.length ? ' -> ' + newJobIds.join(', ') : ''}`);
      console.log(`  NEW mail.mail exception   : ${newMailIds.length}${newMailIds.length ? ' -> ' + newMailIds.join(', ') : ''}`);
      console.log(
        `  ir.logging ERROR/CRITICAL : ${loggingScored ? loggingNewErrors : 'NOT SCORED - log_db is disabled on this host (0 rows all time)'}`,
      );

      console.log('\n  Pre-existing failures - NOT scored by this TC, they have their own triage:');
      if (baseline.jobsBefore.detail.length === 0) {
        console.log('    queue.job : none');
      } else {
        baseline.jobsBefore.detail.forEach((d) => console.log(`    queue.job  #${d.id}  ${d.when}  ${d.what}`));
      }
      if (baseline.mailBefore.detail.length === 0) {
        console.log('    mail.mail : none');
      } else {
        baseline.mailBefore.detail.forEach((d) => console.log(`    mail.mail  #${d.id}  ${d.when}  ${d.what}`));
      }

      const surfacesScored =
        (baseline.jobsBefore.available ? 1 : 0) + (baseline.mailBefore.available ? 1 : 0) + (loggingScored ? 1 : 0);

      return {
        viewsBuilt: exercise.viewsBuilt,
        emptyArchModels: exercise.emptyArchModels,
        rootMenus: exercise.rootMenus,
        jobsBefore: baseline.jobsBefore,
        jobsAfter,
        mailBefore: baseline.mailBefore,
        mailAfter,
        loggingTotal: baseline.loggingTotal,
        loggingNewErrors,
        loggingScored,
        newJobIds,
        newMailIds,
        surfacesScored,
      };
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`\n==================== VERIFY ====================`);

      const exerciseRan = result.viewsBuilt === EXERCISE_MODELS.length && result.rootMenus > 0;
      console.log(`Verify #1 - the exercise actually ran:`);
      console.log(`   Expected : ${EXERCISE_MODELS.length} form views built, > 0 root menus read`);
      console.log(`   Actual   : ${result.viewsBuilt} views, ${result.rootMenus} root menus`);
      if (result.emptyArchModels.length) {
        console.log(`   Empty arch returned by: ${result.emptyArchModels.join(', ')}`);
      }
      console.log(`   Result   : ${exerciseRan ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #2 - no NEW failed asynchronous job:`);
      console.log(`   Expected : 0 queue.job ids outside the baseline set`);
      console.log(
        `   Actual   : ${result.jobsBefore.available ? result.newJobIds.length : 'queue.job not available on this base'}`,
      );
      console.log(`   Result   : ${!result.jobsBefore.available ? 'NOT SCORED' : result.newJobIds.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #3 - no NEW outgoing-mail exception:`);
      console.log(`   Expected : 0 mail.mail ids outside the baseline set`);
      console.log(
        `   Actual   : ${result.mailBefore.available ? result.newMailIds.length : 'mail.mail not available on this base'}`,
      );
      console.log(`   Result   : ${!result.mailBefore.available ? 'NOT SCORED' : result.newMailIds.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #4 - database log table:`);
      if (!result.loggingScored) {
        console.log(`   Expected : 0 rows at level ERROR or CRITICAL`);
        console.log(`   Actual   : ir.logging holds ${result.loggingTotal} rows across all time`);
        console.log(`   Result   : NOT SCORED - log_db is disabled, so an empty table is not evidence of a clean log`);
      } else {
        console.log(`   Expected : 0`);
        console.log(`   Actual   : ${result.loggingNewErrors}`);
        console.log(`   Result   : ${result.loggingNewErrors === 0 ? 'PASS' : 'FAIL'}`);
      }

      console.log(`\nVerify #5 - at least one surface was scored:`);
      console.log(`   Expected : >= 1 of { queue.job, mail.mail, ir.logging }`);
      console.log(`   Actual   : ${result.surfacesScored}`);
      console.log(`   Result   : ${result.surfacesScored >= 1 ? 'PASS' : 'FAIL'}`);

      console.log(`\nNOTE: this TC does not read the server log file. A traceback that never reaches`);
      console.log(`      queue.job / mail.mail / ir.logging is invisible here - scoring the raw log`);
      console.log(`      still needs QA log access or a Dev export, tracked on CRM-12126.`);
      console.log(`===============================================`);

      const overall =
        exerciseRan &&
        result.newJobIds.length === 0 &&
        result.newMailIds.length === 0 &&
        (!result.loggingScored || result.loggingNewErrors === 0) &&
        result.surfacesScored >= 1;
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - no new server-side failure recorded during this check`);

      expect(result.viewsBuilt, 'the exercise did not build every core form view - the check did not really run')
        .toBe(EXERCISE_MODELS.length);
      expect(result.rootMenus, 'no root menu was read - the check did not really run').toBeGreaterThan(0);
      expect(result.surfacesScored, 'no failure surface was readable - this run proves nothing').toBeGreaterThanOrEqual(1);
      expect(result.newJobIds, 'a new asynchronous job failed while this check ran').toEqual([]);
      expect(result.newMailIds, 'a new outgoing-mail exception appeared while this check ran').toEqual([]);
      if (result.loggingScored) {
        expect(result.loggingNewErrors, 'ir.logging carries rows at level ERROR or CRITICAL').toBe(0);
      }
    });
  });
});
