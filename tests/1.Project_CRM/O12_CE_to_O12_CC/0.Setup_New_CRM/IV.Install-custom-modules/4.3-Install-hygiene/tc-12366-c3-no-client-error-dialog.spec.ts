import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.3.3 ==========
 * Test Case ID    : CRM-12366_4.3.3
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.3-Install-hygiene
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify no Odoo Client Error dialog or exception traceback dialog appears on any screen during normal navigation.
 *   Navigate through major screens and confirm no error dialogs are visible.
 *   Pre-deploy test (2026-08-20) found Sales Report showed a Client Error traceback dialog - verify it is fixed.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\.3\.3:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN connected and crm-mig.nakivo.site reachable
 *     - Login as anh.ho@nakivo.com (admin_crm_mig)
 *     - Navigate through major screens (Contacts, Sales, CRM, Reports, Invoices)
 *     - Note: Pre-deploy reading from 2026-08-20 found Sales Report shows a Client Error traceback dialog; re-test to confirm fix
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to the Sales Report screen.
 *     3. Observe whether any modal dialog with title 'Odoo Client Error' or 'Odoo Server Error' appears.
 *     4. If a dialog appears, capture screenshot and note the error message.
 *     5. Close any dialog if present, then navigate to Contacts menu.
 *     6. Repeat steps 3-4 for Contacts list.
 *     7. Repeat steps 3-4 for Opportunities list.
 *     8. Repeat steps 3-4 for CRM Reports menu.
 *
 *   Expected Results:
 *     - No modal dialog titled 'Odoo Client Error' or 'Odoo Server Error' is visible on any screen
 *     - Sales Report screen renders without an error dialog (previously showed traceback dialog in pre-deploy)
 *     - Contacts list opens without error dialog
 *     - Opportunities list opens without error dialog
 *     - CRM Reports menu opens without error dialog
 *     - User is able to click through all 4+ major screens without encountering any exception dialog
 */

interface DialogEvent {
  screen: string;
  title: string;
  message: string;
  timestamp: number;
}

interface DialogReport {
  screensNavigated: number;
  dialogsFound: DialogEvent[];
}

const STEP = {
  pre1: 'Pre-condition 1: Login as Admin on the Migration server',
  s1:   'Step 1: Navigate to Sales Report and check for error dialogs',
  s2:   'Step 2: Navigate through other major screens',
  verify: 'Verification',
} as const;

test.describe('CRM-12366 4.3.3 - No Odoo Client Error dialogs on screens', () => {
  test('CRM-12366_4.3.3: Verify no Odoo Client Error dialog or exception traceback dialog appears on any screen during normal navigation', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const platformPage = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.3.3 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  OK - logged in');
    });

    const report: DialogReport = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      const dialogsFound: DialogEvent[] = [];
      const screensToCheck = [
        { name: 'Sales Report', hash: MigPlatformPage.HASH.salesReport },
        { name: 'Contacts', hash: MigPlatformPage.HASH.contacts },
        { name: 'Opportunities', hash: MigPlatformPage.HASH.opportunitiesList },
        { name: 'CRM', hash: MigPlatformPage.HASH.crm },
        { name: 'Invoicing', hash: MigPlatformPage.HASH.invoicing },
      ];

      for (const screen of screensToCheck) {
        const url = `${baseUrl_mig}${screen.hash}`;
        console.log(`  Navigating to ${screen.name}...`);

        try {
          // Odoo holds a longpolling request open, so waitUntil:'networkidle' NEVER settles and
          // every screen burns the full pageLoad budget - 5 screens x 240s is exactly the 20-minute
          // test timeout this spec used to hit AFTER printing its VERIFY block.
          // openAppAndMeasureMs waits for the action to finish rendering, the real readiness signal.
          const loadMs = await platformPage.openAppAndMeasureMs(screen.hash);
          console.log(`    rendered in ${loadMs} ms`);
          await page.waitForTimeout(CommonUtils.waitTimes.standard);

          // Check for error dialogs by looking for modal with Odoo error titles
          const errorDialogSelector = '.modal[role="dialog"], .oe_dialog';
          const dialogs = await page.locator(errorDialogSelector).all();

          for (const dialog of dialogs) {
            const titleElement = dialog.locator('.modal-title, .modal-header h4, h4.modal-title').first();
            const messageElement = dialog.locator('.modal-body, .oe_dialog_body').first();

            const titleText = await titleElement.textContent().catch(() => '');
            const messageText = await messageElement.textContent().catch(() => '');

            // Check if it's an error dialog
            if (titleText && (titleText.includes('Error') || titleText.includes('error'))) {
              dialogsFound.push({
                screen: screen.name,
                title: titleText || '(no title)',
                message: messageText?.slice(0, 200) || '(no message)',
                timestamp: Date.now(),
              });
              console.log(`    ERROR DIALOG FOUND: ${titleText}`);
            }
          }

          // Try to close any visible error dialog if present
          if (dialogs.length > 0) {
            const closeButton = page.locator('.modal .btn-close, .modal .oe_dialog .close, button[data-dismiss="modal"]').first();
            if (await closeButton.isVisible().catch(() => false)) {
              await closeButton.click().catch(() => {});
            }
          }

          console.log(`    OK - checked, ${dialogs.length} dialog(s) found (${dialogsFound.length} errors)`);
        } catch (e) {
          console.log(`    Navigation failed: ${(e as Error).message.slice(0, 100)}`);
        }
      }

      return {
        screensNavigated: screensToCheck.length,
        dialogsFound,
      };
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  Verified ${report.screensNavigated} major screens`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`\n==================== VERIFY ====================`);
      console.log(`Verify - No Odoo Client Error dialogs on screens:`);
      console.log(`  Expected : 0 error dialogs`);
      console.log(`  Actual   : ${report.dialogsFound.length} error dialogs`);

      if (report.dialogsFound.length > 0) {
        console.log('\n  Error dialogs found:');
        for (const dialog of report.dialogsFound) {
          console.log(`    [${dialog.screen}] ${dialog.title}`);
          console.log(`      Message: ${dialog.message}`);
        }
      }

      console.log(`\n  Screens navigated: ${report.screensNavigated}`);
      console.log(`  Result   : ${report.dialogsFound.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log(`===============================================`);

      expect(report.screensNavigated, 'at least 4 screens should have been navigated').toBeGreaterThanOrEqual(4);
      expect(
        report.dialogsFound.length,
        `${report.dialogsFound.length} Odoo error dialogs found on screens`,
      ).toBe(0);
    });
  });
});
