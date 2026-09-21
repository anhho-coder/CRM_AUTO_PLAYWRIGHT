import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12326 Part 2-3.7 - App list and UI parity
 * Test Case ID: CRM-12326_3.7.2
 * Jira: CRM-12591
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - Steps split back to individual test.step per manual step; RPC-only
 *                steps tagged [INTERNAL check, Call API]. Steps 3, 4, and 6 remain interleaved
 *                in one test.step (per-app loop: open, detect error, dismiss) because step 6
 *                dismissal must happen inside each app's processing before moving to the next;
 *                separation would require either 3 separate loops (changing behavior) or
 *                re-opening apps to re-find transient dialogs (also changing behavior).
 *
 * Summary:
 *   Verify every app on the new base opens without a client error after the cut-off.
 *   This is the end-user proof that removing the Enterprise dependencies did not break
 *   a screen anywhere in the product. Walks all 24 apps and detects Odoo Client Error dialogs.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 113):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable.
 *   Login: anh.ho@nakivo.com (admin_crm_mig).
 *   24 apps were present at the 2026-08-24 reading.
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Confirm every app URL in the map resolves to a live action before walking (an action id that no longer exists is an automation fault, not a product defect).
 *   3. Open each app in turn by its URL hash.
 *   4. For each app, record whether an Odoo Client Error dialog appeared, and any console or failed-request error.
 *   5. For every dialog, capture the FULL error text behind "Copy the full error to clipboard" / "See details", and group the failing apps by a normalised fingerprint of that text - not by the outer "An error occurred" shell.
 *   6. Dismiss any error dialog before moving to the next app.
 *
 * Verification Points:
 *   1. Every app is opened - none is skipped.
 *   2. 0 apps raise an Odoo Client Error dialog.
 *   3. Known open findings are reported but tracked elsewhere, not failed here.
 *
 * READ-ONLY: this spec only reads app states and navigates. It creates, modifies and deletes nothing,
 * as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\\.7\\.2:" --project=chromium
 */

/**
 * Known open findings that are NOT failures for this check.
 * These are tracked on CRM-12366 Part 1 item 12 and excluded from the error assertion.
 * Format: app hash name -> reason
 */
const KNOWN_OPEN_FINDINGS: Record<string, string> = {
  // Keyed on the MigPlatformPage.HASH KEY, not on the URL fragment - the loop compares against the key
  // name. Keying it on a path such as 'sale/report' would silently never match, and Sales Report would
  // then be scored as an unexpected failure instead of the known finding it is.
  salesReport: 'Sales Report errno 111 (connection reset)',
};

/**
 * App hashes that are expected to produce net::ERR_INVALID_URL requests.
 * These are not Odoo Client Error dialogs, so they do not fail the check.
 * Tracked on CRM-12366 Part 1 item 12.
 */
const KNOWN_ERR_INVALID_URL_APPS: string[] = [
  // DELIBERATELY EMPTY. This used to read ['pos/session', 'purchase'] - but the loop matches against
  // the MigPlatformPage.HASH KEY, and neither 'pos/session' nor 'purchase' is a key in that map (nor
  // an app on this base). So the list could never match anything: it looked like two findings were
  // being excused while in fact nothing was, which is the exact trap the KNOWN_OPEN_FINDINGS comment
  // above warns about, just in the other direction.
  // The 2026-08 reading that recorded "two net::ERR_INVALID_URL requests" was taken against the OLD
  // app-hash map, and 13 of those 25 action ids no longer exist - so that observation cannot be
  // carried forward. Left empty on purpose: any ERR_INVALID_URL seen from now on is REPORTED rather
  // than silently excused, and this list is only repopulated from a run against the live hash map,
  // keyed on a real HASH key.
];

/**
 * The instance-wide dialog already raised as CRM-12656 (NAKIVO Remote Instance has no browser
 * origin / "Odoo 19 URL" unset). Apps failing on THIS text are one config defect, not one defect
 * each - so the report separates them from apps that fail their own way.
 */
const KNOWN_INSTANCE_WIDE = /remote instance has no browser origin|NAKIVO Remote Instance|Odoo 19 URL/i;

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 *
 * Steps 3, 4, and 6 remain combined in one test.step because they interleave per-app: opening the app
 * (step 3), detecting and recording errors (step 4), and dismissing the dialog (step 6) happen in sequence
 * within each app's iteration. A faithful 1:1 split would require either three separate loops through all
 * apps (redundant navigation, changes behavior) or re-opening apps to find transient dialogs that have
 * already been dismissed (also changes behavior). This interleaving is permitted under the exception in
 * the specification's REQUIREMENT #1a.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: [INTERNAL check, Call API] Confirm every app URL in the map resolves to a live action before walking',
  // Manual steps 3, 4 and 6 are ONE indivisible per-app cycle and are deliberately NOT split.
  // An Odoo error dialog is MODAL and survives a hash navigation, so it must be dismissed (step 6)
  // before the next app is opened (step 3). Running them as three sequential passes would walk all
  // 29 apps three times AND re-detect the previous pass's sticky modal on every later app - which is
  // exactly the fault that once turned 1 real failure into 7 reported ones. The label keeps all
  // three numbers so the mapping back to the Xray steps stays visible.
  s346:    'Steps 3-4 + 6: Open each app in turn by its URL hash, record whether an Odoo Client Error dialog appeared and any console or failed-request error, and dismiss any dialog before moving to the next app',
  // Step 5 spans two places by its own wording: the CAPTURE ("copy the full error to clipboard" /
  // "See details") can only happen while that app's dialog is on screen, so it runs inside the walk
  // above; the GROUPING by normalised fingerprint runs here, once, over everything captured.
  s5:      'Step 5: [INTERNAL check, Call API] For every dialog, capture the FULL error text behind "Copy the full error to clipboard" / "See details", and group the failing apps by a normalised fingerprint of that text - not by the outer "An error occurred" shell',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.7 - App list and UI parity', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.7.2: [Part2-3.7] Every app opens without a client error', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000); // 20 minutes to walk 24 apps at ~30s per app budget
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    // State tracking
    // Typed as the HASH keys so indexing MigPlatformPage.HASH below stays type-safe.
    const appHashes = Object.keys(MigPlatformPage.HASH) as Array<keyof typeof MigPlatformPage.HASH>;
    const dialogTexts = new Map<string, string>();
    const appsWithErrors: string[] = [];
    /** Apps in HASH that have no live menu on this base - reported, never walked. */
    const appsAbsent: string[] = [];
    const appsOpened: string[] = [];
    const knownFindingsReported: string[] = [];
    let appCount = 0;

    console.log('========== CRM-12326_3.7.2 - Every app opens without a client error ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
      // Grant clipboard-read permission for capturing full error dialogs.
      await page.context().grantPermissions(['clipboard-read']).catch(() => {
        // Tolerate if permission cannot be granted - copyFullErrorToClipboard will fall back.
      });
      appCount = appHashes.length;
      console.log(`  Apps to verify: ${appCount}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  Total apps in MigPlatformPage.HASH: ${appHashes.length}`);
      console.log(`  Apps expected ABSENT on this base: ${MigPlatformPage.ABSENT_ON_MIG.length}`);
      if (MigPlatformPage.ABSENT_ON_MIG.length > 0) {
        console.log(`    ${MigPlatformPage.ABSENT_ON_MIG.join(', ')}`);
      }
      console.log(`  Apps expected to open: ${appHashes.length - MigPlatformPage.ABSENT_ON_MIG.length}`);
    });

    // Steps 3, 4, and 6 are interleaved in one test.step: open app (step 3), detect/record errors
    // (step 4), and dismiss dialog (step 6) per app. Step 6 must happen inside step 4's error handling
    // loop, before moving to the next app - dismissal cannot be deferred to a separate step without
    // either doing redundant page navigations or losing transient error dialogs. This is permitted by
    // the specification's exception for genuinely interleaved steps.
    await test.step(STEP.s346, async () => {
      console.log(`\n--- ${STEP.s346} ---`);
      console.log(`  Total apps to walk: ${appHashes.length}`);

      for (const appHash of appHashes) {
        // An app with NO live menu on this base cannot be walked - its hash points at an action that
        // no longer exists, and Odoo answers a missing action with the same generic dialog as a real
        // defect. Opening it would therefore manufacture a failure. Report it as ABSENT instead:
        // that is an app-list PARITY fact (recorded on CRM-12326_3.7.1), not a broken screen.
        if (MigPlatformPage.ABSENT_ON_MIG.includes(appHash)) {
          appsAbsent.push(appHash);
          console.log(`\n  Opening app: ${appHash}`);
          console.log('    SKIPPED - no live menu on this base; recorded as an app-list parity fact, not a failure');
          continue;
        }

        // Reset listeners for this app so errors are attributed to the correct source.
        const consoleErrors: string[] = [];
        const pageErrors: Error[] = [];
        const failedRequests: string[] = [];

        const consoleListener = (msg: any) => {
          if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
          }
        };

        const errorListener = (error: Error) => {
          pageErrors.push(error);
        };

        const responseListener = (response: any) => {
          if (response.status() >= 400) {
            failedRequests.push(`${response.url()} (${response.status()})`);
          }
        };

        page.on('console', consoleListener);
        page.on('pageerror', errorListener);
        page.on('response', responseListener);

        try {
          // THE STICKY-MODAL TRAP:
          // An Odoo client-error dialog is MODAL and survives a hash navigation.
          // If not dismissed, it is re-detected on every later app and inflates the count.
          // On a first run this turned 1 real failure into 7 reported ones.
          // We MUST dismiss any dialog before moving to the next app.
          await test.step(`App: ${appHash}`, async () => {
            const appUrl = MigPlatformPage.HASH[appHash];
            console.log(`\n  Opening app: ${appHash}`);
            console.log(`    Hash    : ${appUrl}`);

            const ms = await platform.openAppAndMeasureMs(appUrl);
            console.log(`    Load time: ${ms}ms (budget: ${MigPlatformPage.APP_RESPONSE_BUDGET_MS}ms)`);
            appsOpened.push(appHash);

            // Wait a brief moment for any error dialog to appear.
            await page.waitForTimeout(CommonUtils.waitTimes.short);

            // Check if an Odoo Client Error dialog is visible.
            const hasErrorDialog = await platform.isErrorDialogVisible();

            if (hasErrorDialog) {
              // Capture the FULL error text (not just the outer "An error occurred" shell) by
              // clicking "Copy the full error to clipboard" or falling back to "See details".
              // This extracts the exception class and stack frames so we can group apps by
              // the ROOT CAUSE (same error class/frames) rather than by the 19 identical outer
              // shells hiding 19 different defects.
              const fullErrorText = await platform.copyFullErrorToClipboard();
              dialogTexts.set(appHash, fullErrorText);
              console.log(`    ERROR: Odoo error dialog detected`);
              console.log(`    Full error text : ${fullErrorText.slice(0, 300)}`);
              console.log(`    Attributed  : ${KNOWN_INSTANCE_WIDE.test(fullErrorText)
                ? 'CRM-12656 - NAKIVO Remote Instance config, instance-wide'
                : 'not a known instance-wide error - needs its own triage'}`);

              // Check if this is a known finding.
              if (KNOWN_OPEN_FINDINGS[appHash]) {
                console.log(`    KNOWN FINDING (${KNOWN_OPEN_FINDINGS[appHash]}) - reported but not failed`);
                knownFindingsReported.push(appHash);
              } else {
                appsWithErrors.push(appHash);
                console.log(`    FAILED - unexpected error dialog`);
              }

              // Dismiss the error dialog so it does not re-appear on the next app.
              await page.keyboard.press('Escape').catch(() => {});
              await platform.dismissErrorDialog?.().catch(() => {});
              await page.waitForTimeout(CommonUtils.waitTimes.short);
            } else {
              console.log(`    OK - no error dialog`);
            }

            // Log any console errors (excluding known invalid-URL errors).
            if (consoleErrors.length > 0) {
              const unknownErrors = consoleErrors.filter(e => !e.includes('net::ERR_INVALID_URL'));
              if (unknownErrors.length > 0) {
                console.log(`    Console errors: ${unknownErrors.join('; ')}`);
              }
              // net::ERR_INVALID_URL errors are logged but not counted as failures if known.
              if (KNOWN_ERR_INVALID_URL_APPS.includes(appHash)) {
                const invalidUrlCount = consoleErrors.filter(e => e.includes('net::ERR_INVALID_URL')).length;
                if (invalidUrlCount > 0) {
                  console.log(`    Known net::ERR_INVALID_URL (${invalidUrlCount}) - reported but not failed`);
                  knownFindingsReported.push(`${appHash} (net::ERR_INVALID_URL x${invalidUrlCount})`);
                }
              }
            }

            // Log any page errors (network/load issues).
            if (pageErrors.length > 0) {
              console.log(`    Page errors: ${pageErrors.map(e => e.message).join('; ')}`);
            }

            // Log slow load (Reports screen ~13.8s known issue, tracked on CRM-12366 Part 1 item 12).
            // The slow screen is `reports`, NOT `salesReport` - salesReport is the errno 111 finding.
            if (appHash === 'reports' && ms > 13000) {
              console.log(`    Reports screen slow load (~${ms}ms) - known issue, tracked separately`);
              knownFindingsReported.push(`${appHash} (slow load ${ms}ms)`);
            }
          });
        } finally {
          // Always remove listeners after this app.
          page.off('console', consoleListener);
          page.off('pageerror', errorListener);
          page.off('response', responseListener);
        }
      }

      console.log(`\n  Apps opened: ${appsOpened.length}/${appCount}`);
      if (appsWithErrors.length > 0) {
        console.log(`  Apps with unexpected errors: ${appsWithErrors.join(', ')}`);
      }
      if (knownFindingsReported.length > 0) {
        console.log(`  Known findings (not failed): ${knownFindingsReported.join(', ')}`);
      }
    });

    // Step 5: Extract fingerprints and group errors by root cause (not by the identical outer shell)
    const byInstanceWide: string[] = [];
    const byFingerprint = new Map<string, string[]>();

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      // Extract a normalized fingerprint from each error's full text so we group by root cause
      // (exception class + last few stack frames) instead of by the identical outer shell
      // ("An error occurred") that hides distinct defects.
      function extractFingerprint(fullErrorText: string): string {
        // Try to extract the exception class name (e.g., "AttributeError", "KeyError").
        const exceptionMatch = fullErrorText.match(/\b(Error|Exception|Traceback|[A-Z][a-zA-Z]*Error)\b/);
        const exceptionClass = exceptionMatch ? exceptionMatch[1] : 'UnknownError';

        // Extract the last 2-3 frames of the traceback (the innermost frames that usually
        // show the actual defect location, not the middleware).
        const frameLines = fullErrorText.split('\n')
          .filter(line => line.includes('File ') || line.includes('at '))
          .slice(-3); // Last 3 frames
        const framesSummary = frameLines.length > 0
          ? frameLines.map(f => f.trim().slice(0, 60)).join(' | ')
          : '';

        // Combine class + frames into a normalized fingerprint.
        return `${exceptionClass}${framesSummary ? ` [${framesSummary}]` : ''}`;
      }

      // Group the failing apps by normalized error fingerprint.
      for (const [app, text] of dialogTexts.entries()) {
        if (KNOWN_INSTANCE_WIDE.test(text)) { byInstanceWide.push(app); continue; }
        const fingerprint = extractFingerprint(text);
        byFingerprint.set(fingerprint, [...(byFingerprint.get(fingerprint) ?? []), app]);
      }
      console.log('\n-------- error dialogs grouped by root cause fingerprint --------');
      console.log(`  CRM-12656 (NAKIVO Remote Instance / Odoo 19 URL unset): ${byInstanceWide.length} app(s)`);
      if (byInstanceWide.length) console.log(`     ${byInstanceWide.join(', ')}`);
      console.log(`  Other distinct root causes: ${byFingerprint.size}`);
      for (const [fingerprint, apps] of byFingerprint.entries()) {
        console.log(`     [${apps.length} app(s)] ${apps.join(', ')}`);
        console.log(`         ${fingerprint}`);
      }
      console.log('------------------------------------------------------------------');
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      // Verification #1: Every app is opened - none is skipped, except the ones with no live menu.
      const expectedOpened = appCount - appsAbsent.length;
      console.log('  Verify #1 - Every app that exists on this base is opened:');
      console.log(`     Expected : ${expectedOpened} apps opened (${appCount} in the map, ${appsAbsent.length} absent on this base)`);
      console.log(`     Actual   : ${appsOpened.length} apps opened`);
      console.log(`     Result   : ${appsOpened.length === expectedOpened ? 'PASS' : 'FAIL'}`);
      if (appsAbsent.length) console.log(`     Absent   : ${appsAbsent.join(', ')} - no live menu; app-list parity fact, tracked on CRM-12326_3.7.1`);

      // Verification #2: 0 apps raise an Odoo Client Error dialog.
      console.log('  Verify #2 - No unexpected Odoo Client Error dialogs:');
      console.log(`     Expected : 0 apps with errors`);
      console.log(`     Actual   : ${appsWithErrors.length} apps with errors`);
      console.log(`     Result   : ${appsWithErrors.length === 0 ? 'PASS' : 'FAIL'}`);

      // Verification #3: any known open finding that DOES occur is recognised rather than counted as
      // a new defect.
      //
      // This used to assert `knownFindingsReported >= Object.keys(KNOWN_OPEN_FINDINGS).length`, i.e.
      // "at least N known findings must appear". That is backwards: it fails when the PRODUCT GETS
      // BETTER. It fired on 2026-09-15 - salesReport was on the known list from a reading taken
      // against the stale app map, the map was corrected, salesReport now opens clean, and the spec
      // reported FAIL because a known finding had stopped happening. A known-findings list is an
      // exception register, never a quota. Only the reverse direction is a defect: something in the
      // list appearing that was NOT recognised, which Verify #2 already covers.
      const unrecognisedKnown = knownFindingsReported.filter((a) => !(a in KNOWN_OPEN_FINDINGS));
      console.log('  Verify #3 - Every known finding that occurred is recognised (not a quota):');
      console.log(`     Expected : 0 findings reported as known but absent from the register`);
      console.log(`     Actual   : ${knownFindingsReported.length} known finding(s) occurred, ${unrecognisedKnown.length} unrecognised`);
      console.log(`     Result   : ${unrecognisedKnown.length === 0 ? 'PASS' : 'FAIL'}`);
      if (knownFindingsReported.length === 0) {
        console.log('     Note     : 0 known findings occurred this run - the register is an exception list, so this is an improvement, not a failure.');
      }

      console.log('===============================================');
      const overallPass = (appsOpened.length === expectedOpened) && (appsWithErrors.length === 0) && (unrecognisedKnown.length === 0);
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - ${appsOpened.length} app(s) opened, ${appsWithErrors.length} with an unexpected error dialog, ${appsAbsent.length} absent on this base`);

      // Assertions
      expect(appsOpened.length, 'every app that exists on this base should be opened').toBe(expectedOpened);

      // SKIPPED BY BUG CRM-12656 - but ONLY when that bug is the sole thing left failing.
      //
      // Confirmed with the tester 2026-09-15: the Subscriptions capability is not supported on this
      // base yet, and every app that errors with the "NAKIVO Remote Instance / Odoo 19 URL" text is
      // that one already-raised config defect, not a broken screen of its own.
      //
      // The condition is deliberately "every erroring app is an instance-wide one". If ANY app fails
      // for a different reason the test still fails and names it, and when CRM-12656 is fixed the
      // skip stops firing by itself. A blanket test.skip() at the top of the file would have thrown
      // away the other 28 apps' coverage as well.
      const nonInstanceWideErrors = appsWithErrors.filter((a) => !byInstanceWide.includes(a));
      if (appsWithErrors.length > 0 && nonInstanceWideErrors.length === 0) {
        console.log(`\n  SKIP: the only error dialogs are CRM-12656 (${byInstanceWide.join(', ')}) - skipping by bug, not failing.`);
        test.skip(true, 'Skipped due to bug CRM-12656');
      }
      expect(
        appsWithErrors,
        `no unexpected Odoo Client Error dialogs should appear; offenders: [${appsWithErrors.join(', ')}]`,
      ).toEqual([]);
      expect(
        unrecognisedKnown,
        'every finding treated as "known" must be in the KNOWN_OPEN_FINDINGS register',
      ).toEqual([]);
    });
  });
});
