import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DiscountProgramEditorPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { Check, recordChecks, printVerifyAndAssertMig } from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.14 - Maintain programs with a new named Program editor account   (Program editor of crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.14
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 31, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Baseline         : none - written from the crm-mig manual TC (no pre-production baseline: the Program editor exists only
 *                    on crm-mig; not in helpers/discount-mig.baseline-map.ts)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-SEC-0010 (QI TC-13, p.28)
 * Source           : D:/Automation_CRM/[Migration] - memory/crm12144_new_scenarios_20261026/spec/NEW_AND_UNSPECCED_TCS.md
 *                    section "## CRM-12144_1.14" (REWRITTEN to QI TC-13, tester decision 2026-10-26)
 * Source version   : NEW_AND_UNSPECCED_TCS.md v2 - sha256 fe576981b359
 *                    (sha256 of the lines from "## CRM-12144_1.14 " up to, not including, the next line made only of
 *                    dashes, CRLF -> LF, joined with "\n", first 12 hex). Recompute before trusting this spec:
 *                    node -e "const s=require('fs').readFileSync(process.argv[1],'utf8').replace(/\r\n/g,'\n').split('\n');
 *                    const i=s.findIndex(l=>l.startsWith('## '+process.argv[2]+' '));let j=i+1;while(j<s.length&&!/^-{3,}\s*$/.test(s[j]))j++;
 *                    console.log(require('crypto').createHash('sha256').update(s.slice(i,j).join('\n')).digest('hex').slice(0,12))"
 *                    "<Source>" CRM-12144_1.14
 * Host             : Program editor of crm-mig = Discount Service (https://discount-crm-mig.nakivo.site) - not Odoo
 * Run as           : QA's Program editor account anh.ho@nakivo.com (users.admin_discount_mig), then the account
 *                    qa-<timestamp> this run creates. The role is asserted by Step 2 ("Signed in as" = your login) and
 *                    Step 4 (the sign-in as qa-<timestamp> succeeds).
 *
 * WRITES (sanctioned by QI p.3 for TC-13 only, Nathan 2026-10-20): one new account qa-<timestamp>, and two rule versions
 * (one character appended to an ENDED program's name, then removed). No program-table row is added or deleted. Accounts
 * cannot be deleted in the Program editor, so each run leaves ONE DISABLED account qa-<timestamp> and TWO versions (QI
 * TC-13 step 8) - expected, not a cleanup miss.
 * Teardown (afterEach, always runs): when the test stopped before Step 6 / Step 8 finished, (a) restore the program name
 * as anh.ho@nakivo.com, (b) disable qa-<timestamp> (this run's login only - deny-list) and read it back: status Disabled
 * AND a sign-in as qa-<timestamp> is refused with "Incorrect username or password.". (b) is armed before the Add account
 * submit and looks the login up by name, so a timeout after the submit still gets it disabled.
 *
 * Summary
 * -------
 * Signed out, the editor shows only Sign in; anh.ho adds qa-<ts>; qa-<ts> edits an Ended program's name (new active
 * version authored by qa-<ts>), restores it, and reads the Users rows; anh.ho disables qa-<ts>, whose sign-in is refused.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.14:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.14, NEW_AND_UNSPECCED_TCS.md v2, verbatim - "›" written as ">")
 * ------------------------------------------------------------------------------------------------
 *  Title: Maintain programs with a new named Program editor account (IS-CRM-SEC-0010)
 *  Priority: P2 | Spec Areas: SEC-0010 - named accounts
 *
 *  Pre-running conditions:
 *    * Pre-conditions:
 *      QA's Program editor account (anh.ho@nakivo.com), handed over with the environment - Nathan Do, CRM-12467
 *      2026-10-20: "TC-13 and TC-19 are now run by QA, with your Program editor account"
 *
 *  Executed Steps:
 *    1. Without signing in, open the Program editor address
 *    2. Sign in with your account
 *    3. Open the account menu > Settings > Users and click Add account. Enter the login qa-<timestamp> and a strong
 *       password, then click Add account
 *    4. Sign out, then sign in as qa-<timestamp>
 *    5. As qa-<timestamp>, open a program in the Ended group of Discount Programs, click Edit, add a character at the end
 *       of the program name and click Save. Then click Edit Table
 *    6. Click Edit Programs, open the same program, remove the character and click Save
 *    7. As qa-<timestamp>, open Settings > Users
 *    8. Sign out, sign in with your own account, click Disable on the qa-<timestamp> row and confirm. Sign out and try to
 *       sign in as qa-<timestamp>
 *
 *  Expected Results:
 *    1. The Sign in page opens; no program can be seen
 *    2. The Discount Programs page opens, and the account menu (top right) shows "Signed in as" with your login
 *    3. qa-<timestamp> is listed as Active, with your login under Created
 *    4. The sign-in succeeds
 *    5. In the list on the left, the new active version names qa-<timestamp>
 *    6. The name is as before
 *    7. The administrator account's row shows Administrator only and has no Disable button; the row of qa-<timestamp>
 *       is tagged You and has no Disable button; every other active account has a Disable button
 *    8. The page shows "Incorrect username or password." and stays on Sign in
 *
 *  Data:
 *    - Your account = anh.ho@nakivo.com (users.admin_discount_mig)
 *    - Login        = qa-<timestamp>
 *    - Password     = generated per run (>= 16 characters, 4 character classes - rated Strong by the dialog); never printed
 *    - Program      = the FIRST card of the Ended group (found again by its promo code - the name changes in between)
 *    - Character    = "." appended at the end of the name (Step 5), removed again (Step 6)
 *
 *  Port notes (automation notes of the source file):
 *    - Steps 1 and 8 drop the Program editor cookies of this browser context only (crm-mig's are left alone).
 *    - (guard) checks - not expected results of the TC, recorded so the scored checks start from a known state:
 *      Step 3 the dialog rates the password Strong; Step 5 Save made the next version the active one and the saved name
 *      carries the character; Step 6 a new version was saved and is the active one; Step 8 the row reads Disabled.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.14';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: QA\'s Program editor account (anh.ho@nakivo.com), handed over with the environment - Nathan Do, CRM-12467 2026-10-20: "TC-13 and TC-19 are now run by QA, with your Program editor account"',
  s1: 'Step 1: Without signing in, open the Program editor address [https://discount-crm-mig.nakivo.site; only this browser context\'s Program editor cookies are dropped]',
  s2: 'Step 2: Sign in with your account [anh.ho@nakivo.com]',
  s3: 'Step 3: Open the account menu > Settings > Users and click Add account. Enter the login qa-<timestamp> and a strong password, then click Add account',
  s4: 'Step 4: Sign out, then sign in as qa-<timestamp>',
  s5: 'Step 5: As qa-<timestamp>, open a program in the Ended group of Discount Programs, click Edit, add a character at the end of the program name and click Save. Then click Edit Table [the first card of the Ended group; the character is "."]',
  s6: 'Step 6: Click Edit Programs, open the same program, remove the character and click Save [the program is found again by its promo code]',
  s7: 'Step 7: As qa-<timestamp>, open Settings > Users [through the account menu]',
  s8: 'Step 8: Sign out, sign in with your own account, click Disable on the qa-<timestamp> row and confirm. Sign out and try to sign in as qa-<timestamp>',
  verify: 'Verification',
} as const;

const OWN_ACCOUNT = users.admin_discount_mig; // QA's named account anh.ho@nakivo.com - never the administrator account
const SUFFIX = '.';
const REFUSAL = 'Incorrect username or password.';
const EDITOR = DiscountProgramEditorPageMig;

test.use({ ignoreHTTPSErrors: true }); // the Discount Service certificate chain is self-signed

test.describe(`${TC} - Maintain programs with a new named Program editor account (Program editor of crm-mig)`, () => {
  let qa: { username: string; password: string } | undefined;
  let accountMayExist = false;
  let program: { code: string; name: string } | undefined;
  let nameChanged = false;

  test.beforeEach(async () => {
    const ts = `${Date.now()}`;
    qa = { username: `qa-${ts}`, password: `Qa!${ts}-Strong-Pass-${Math.floor(Math.random() * 900 + 100)}` };
    accountMayExist = false;
    program = undefined;
    nameChanged = false;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    const editor = new DiscountProgramEditorPageMig(page);
    const errors: string[] = [];
    if (nameChanged || accountMayExist) {
      console.log('\n--- afterEach (Program editor): restore the program name, disable this run\'s account ---');
      await editor.resetSession();
      await editor.signIn(OWN_ACCOUNT).catch((e: Error) => errors.push(`sign-in as ${OWN_ACCOUNT.username}: ${e.message.split('\n')[0]}`));
    } else {
      console.log('\n--- afterEach (Program editor): nothing left to undo - Step 6 restored the name, Step 8 disabled the account ---');
    }
    // (a) the name - only when this run changed it and Step 6 did not restore it
    if (nameChanged && program && !errors.length) {
      try {
        await editor.openProgramsKanban();
        const now = await editor.openProgramByCode(program.code);
        if (now === program.name + SUFFIX) {
          const r = await editor.editOpenProgramName({ removeChars: SUFFIX.length });
          console.log(`  - ${program.code} name restored (version ${r.versionBefore} -> ${r.versionAfter})`);
        } else {
          console.log(`  ⚠ ${program.code} name reads "${now}" - not this run's edit, left as is`);
        }
        const back = await editor.getOpenProgramName();
        console.log(`  - ${program.code} name now = "${back}" (original "${program.name}")`);
        if (back !== program.name) errors.push(`${program.code} name is "${back}", not the original "${program.name}"`);
        else nameChanged = false;
      } catch (e) {
        errors.push(`restore ${program.code}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
    }
    // (b) the account this run created - deny-list: exactly qa.username, nothing else
    if (accountMayExist && qa && !errors.some((x) => x.startsWith('sign-in'))) {
      try {
        await editor.openUsers();
        const row = (await editor.getAccountRows()).find((r) => r.login === qa!.username);
        if (row && /active/i.test(row.status)) {
          const d = await editor.disableAccount(qa.username);
          console.log(`  - confirm dialog : "${d.confirmText}"`);
          console.log(`  - ${qa.username} status : ${d.status}`);
        }
        const after = (await editor.getAccountRows()).find((r) => r.login === qa!.username);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - account disabled').catch(() => {});
        await editor.resetSession();
        const attempt = await editor.trySignIn(qa);
        console.log(`  - read-back: status = ${after?.status ?? '(row not found)'}; sign-in as ${qa.username} -> ${attempt.ok ? 'SUCCEEDED' : `refused: "${attempt.message}"`}`);
        // no row AND a refused sign-in = the add never reached the server (it failed before the submit): nothing to disable
        if (!after && !attempt.ok && attempt.message === REFUSAL) { accountMayExist = false; console.log(`  ✓ ${qa.username} was never created (no row, sign-in refused)`); }
        else if (!after || !/disabled/i.test(after.status)) errors.push(`${qa.username} status is ${after?.status ?? '(row not found)'}, not Disabled`);
        else if (attempt.ok || attempt.message !== REFUSAL) errors.push(`${qa.username} could still sign in, or the refusal read "${attempt.message}"`);
        else { accountMayExist = false; console.log(`  ✓ ${qa.username} is disabled and cannot sign in`); }
      } catch (e) {
        errors.push(`disable ${qa.username}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (errors.length) throw new Error(`Program editor teardown incomplete: ${errors.join(' | ')}`);
  });

  test(`${TC}: Maintain programs with a new named Program editor account`, {
    annotation: [
      { type: 'manual-tc', description: `${TC} (NEW_AND_UNSPECCED_TCS.md v2 - sha256 fe576981b359; master "Migration - Discount" row 31 to be updated to this text)` },
      { type: 'requirement', description: 'IS-CRM-SEC-0010 (QI TC-13)' },
      { type: 'leaves-by-design', description: 'one DISABLED account qa-<timestamp> and two rule versions per run (QI TC-13)' },
    ],
  }, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 }); // the editor renders its table rows only in a large viewport
    const editor = new DiscountProgramEditorPageMig(page);
    const checks: Check[] = [];
    if (!qa) throw new Error('no account data');
    const login = qa.username;
    let versionAfterEdit = NaN;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host         : Program editor (Discount Service of crm-mig)`);
      console.log(`  - Your account : ${OWN_ACCOUNT.username} (users.admin_discount_mig) - used from Step 2`);
      console.log(`  - No screen is opened here (the account is handed over, not created) - no screenshot`);
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const r = await editor.openAddressWithoutSession();
      console.log(`  - landed on        : ${r.url}`);
      console.log(`  - sign-in heading  : ${r.signInHeading || '(none)'}`);
      console.log(`  - program cards    : ${r.programCards}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 - the Sign in page opens', expected: 'heading "Sign in" on /login', actual: `heading "${r.signInHeading || '(none)'}" on ${new URL(r.url).pathname}`, passed: r.signInHeading === 'Sign in' && /\/login$/.test(new URL(r.url).pathname) },
        { what: 'Step 1 - no program can be seen (a card shown without a session would mean the programs are readable signed out)', expected: '0 program cards', actual: `${r.programCards} program cards`, passed: r.programCards === 0 },
      ], `${TC} - Step 1 Sign in page without a session`, [EDITOR.SIGN_IN_CARD]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Sign in page, no session');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  - Username = ${OWN_ACCOUNT.username}`);
      console.log(`  - Password = <users.admin_discount_mig, not printed>`);
      await editor.signIn(OWN_ACCOUNT);
      const heading = await editor.getPageHeading();
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the Discount Programs page opens', expected: 'Discount Programs', actual: heading || '(no heading)', passed: heading === 'Discount Programs' },
      ], `${TC} - Step 2 Discount Programs page`, [EDITOR.PAGE_HEADING]);
      const who = await editor.getSignedInAs({ keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the account menu (top right) shows "Signed in as" with your login', expected: OWN_ACCOUNT.username, actual: who || '(empty)', passed: who === OWN_ACCOUNT.username },
      ], `${TC} - Step 2 Signed in as`, [EDITOR.ACCOUNT_DROPDOWN]);
      await editor.closeAccountMenu();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - signed in with your account');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  - Login    = ${login}`);
      console.log(`  - Password = <generated, ${qa!.password.length} characters, not printed>`);
      await editor.openUsers();
      // armed BEFORE the submit: addAccount can time out waiting for the new row after the account was already created,
      // and the afterEach must then still look qa-<timestamp> up by login and disable it
      accountMayExist = true;
      const strength = await editor.addAccount(login, qa!.password);
      const row = (await editor.getAccountRows()).find((r) => r.login === login);
      console.log(`  - strength bar : ${strength}`);
      console.log(`  - new row      : ${JSON.stringify(row)}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 (guard) - the dialog rates the password Strong', expected: 'Strong', actual: strength || '(no label)', passed: strength === 'Strong' },
        { what: `Step 3 - ${login} is listed as Active, with your login under Created`, expected: `Active, by ${OWN_ACCOUNT.username}`, actual: row ? `${row.status}, by ${row.by || '(none)'}` : '(row not found)', passed: !!row && row.status === 'Active' && row.by === OWN_ACCOUNT.username },
      ], `${TC} - Step 3 account added`, ['section.card table']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - account added');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await editor.signOut();
      const attempt = await editor.trySignIn(qa!);
      const who = attempt.ok ? await editor.getSignedInAs({ keepOpen: true }) : '';
      console.log(`  - sign-in : ${attempt.ok ? 'succeeded' : `refused: "${attempt.message}"`} (${attempt.url})`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - the sign-in as qa-<timestamp> succeeds ("Signed in as" names the new login)', expected: `signed in as ${login}`, actual: attempt.ok ? `signed in as ${who}` : `refused: ${attempt.message}`, passed: attempt.ok && who === login },
      ], `${TC} - Step 4 signed in as the new account`, attempt.ok ? [EDITOR.ACCOUNT_DROPDOWN] : [EDITOR.SIGN_IN_CARD]);
      await editor.closeAccountMenu();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - signed in as the new account');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      program = await editor.getFirstEndedProgram();
      console.log(`  - Program (first of Ended) : ${program.code} - "${program.name}"`);
      const opened = await editor.openProgramByCode(program.code);
      program.name = opened; // the stored name, double spaces included
      console.log(`  - Name     = "${opened}" + "${SUFFIX}"`);
      nameChanged = true; // from here the afterEach restores it if this test stops before Step 6
      const r = await editor.editOpenProgramName({ suffix: SUFFIX });
      versionAfterEdit = r.versionAfter;
      const saved = await editor.getOpenProgramName();
      console.log(`  - active version : ${r.versionBefore} -> ${r.versionAfter}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 (guard) - Save made the next version the active one', expected: `version ${r.versionBefore + 1}`, actual: `version ${r.versionAfter}`, passed: r.versionAfter === r.versionBefore + 1 },
        { what: 'Step 5 (guard) - the saved name carries the added character', expected: `${opened}${SUFFIX}`, actual: saved, passed: saved === `${opened}${SUFFIX}` },
      ], `${TC} - Step 5 name changed and saved`, [EDITOR.PROGRAM_TITLE]);
      const versions = await editor.openVersionListFromEditTable();
      for (const v of versions.slice(0, 4)) console.log(`  - ${v.label}`);
      const active = versions.filter((v) => v.active);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 5 - in the list on the left, the new active version names qa-<timestamp>',
          expected: `exactly 1 active version: version ${versionAfterEdit}, ${login}`,
          actual: active.map((v) => `version ${v.version}, ${v.author || '(no author)'}`).join(' | ') || '(no active version)',
          passed: active.length === 1 && active[0].version === versionAfterEdit && active[0].author === login,
        },
      ], `${TC} - Step 5 version list`, [EDITOR.VERSION_LIST]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Edit Table, version list');
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await editor.clickEditPrograms();
      const now = await editor.openProgramByCode(program!.code);
      console.log(`  - ${program!.code} name before the change = "${now}"`);
      const r = await editor.editOpenProgramName({ removeChars: SUFFIX.length });
      const restored = await editor.getOpenProgramName();
      if (restored === program!.name) nameChanged = false;
      console.log(`  - active version : ${r.versionBefore} -> ${r.versionAfter}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 6 - the name is as before', expected: program!.name, actual: restored, passed: restored === program!.name },
        { what: 'Step 6 (guard) - Save made the next version the active one', expected: `version ${versionAfterEdit + 1}`, actual: `version ${r.versionAfter}`, passed: r.versionAfter === versionAfterEdit + 1 },
      ], `${TC} - Step 6 name restored`, [EDITOR.PROGRAM_TITLE]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - name restored');
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      await editor.openUsers();
      const rows = await editor.getAccountRows();
      for (const r of rows) console.log(`  - ${r.login.padEnd(32)} | tags ${r.tags.join('+') || '-'} | ${r.status} | actions ${r.actions.join(' + ') || '-'}${r.note ? ` | "${r.note}"` : ''}`);
      const admin = rows.filter((r) => r.tags.includes('Administrator'));
      const mine = rows.filter((r) => r.login === login);
      const others = rows.filter((r) => /^active$/i.test(r.status) && !r.tags.includes('Administrator') && r.login !== login);
      const othersWithout = others.filter((r) => !r.actions.includes('Disable'));
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 7 - the administrator account\'s row shows Administrator only and has no Disable button',
          expected: '1 administrator row: "Administrator only", no Disable',
          actual: admin.map((r) => `${r.login}: "${r.note || '(no note)'}", actions ${r.actions.join(' + ') || 'none'}`).join(' | ') || '(no administrator row)',
          passed: admin.length === 1 && admin[0].note === 'Administrator only' && !admin[0].actions.includes('Disable'),
        },
        {
          what: 'Step 7 - the row of qa-<timestamp> is tagged You and has no Disable button',
          expected: `${login}: tagged You, no Disable`,
          actual: mine.map((r) => `${r.login}: tags ${r.tags.join('+') || 'none'}, actions ${r.actions.join(' + ') || 'none'}`).join(' | ') || `(no row for ${login})`,
          passed: mine.length === 1 && mine[0].tags.includes('You') && !mine[0].actions.includes('Disable'),
        },
        {
          what: 'Step 7 - every other active account has a Disable button',
          expected: `${others.length} of ${others.length} with Disable (at least 1 such account)`,
          actual: othersWithout.length ? `without Disable: ${othersWithout.map((r) => r.login).join(', ')}` : `${others.length} of ${others.length} with Disable`,
          passed: others.length > 0 && othersWithout.length === 0,
        },
      ], `${TC} - Step 7 Users rows`, ['section.card table']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 7 - Settings > Users as qa-timestamp');
    });

    await test.step(STEP.s8, async () => {
      console.log(`\n--- ${STEP.s8} ---`);
      await editor.signOut();
      await editor.signIn(OWN_ACCOUNT);
      await editor.openUsers();
      const d = await editor.disableAccount(login);
      console.log(`  - confirm dialog : "${d.confirmText}"`);
      console.log(`  - ${login} status : ${d.status}`);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 8 (guard) - after Disable and confirm, the row of ${login} reads Disabled`, expected: 'Disabled', actual: d.status, passed: /^disabled$/i.test(d.status) },
      ], `${TC} - Step 8 account disabled`, ['section.card table']);
      await editor.signOut();
      const attempt = await editor.trySignIn(qa!);
      const stays = !attempt.ok && (await editor.isSignInShown()) && /\/login$/.test(new URL(attempt.url).pathname);
      console.log(`  - sign-in as ${login} : ${attempt.ok ? 'SUCCEEDED' : `refused: "${attempt.message}"`} (${attempt.url})`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 8 - the page shows "Incorrect username or password."', expected: REFUSAL, actual: attempt.ok ? '(signed in - no message)' : attempt.message, passed: !attempt.ok && attempt.message === REFUSAL },
        { what: 'Step 8 - the page stays on Sign in (a FAIL means the disabled account could still open the editor)', expected: 'Sign in form on /login', actual: stays ? 'Sign in form on /login' : `left Sign in: ${attempt.url}`, passed: stays },
      ], `${TC} - Step 8 sign-in refused`, [EDITOR.SIGN_IN_CARD]);
      if (!attempt.ok && attempt.message === REFUSAL && /^disabled$/i.test(d.status)) accountMayExist = false; // read back here - nothing left for the afterEach
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 8 - disabled account refused');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
