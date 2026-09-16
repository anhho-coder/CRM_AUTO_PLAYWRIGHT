import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig/MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.6.4 ==========
 * Test Case ID    : CRM-12366_4.6.4
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.6 - Side effects of the install
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify that at least one company record exists with required fields populated by checking
 *   that res.company records exist and their name field is not empty.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.6\\.4:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN access required
 *     - crm-mig.nakivo.site must be reachable
 *     - Logged in as anh.ho@nakivo.com (admin_crm_mig)
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to Settings > Companies (res.company).
 *     3. Verify company records are listed.
 *     4. Open one company record and verify the name and core fields are filled.
 *
 *   Expected:
 *     - At least one res.company record exists
 *     - Company name field is not empty
 *     - At least one company record is read, confirming the check executed
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366 4.6.4 - Company record exists', () => {
  const STEP = {
    pre1:   'Pre-condition: login on the Migration server',
    s1:     'Step 1-4: [INTERNAL check, Call API] Read res.company records and verify name field is populated',
    verify: 'Verification',
  } as const;

  test('CRM-12366_4.6.4: Verify at least one company record exists with required fields populated', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPlatform = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.6.4 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    interface CompanyRecord {
      id: number;
      name: string;
      partner_id: Array<number> | boolean;
      country_id: Array<number> | boolean;
    }

    const result = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      // Read all company records
      const companies: CompanyRecord[] = await migPlatform.callKw(
        'res.company',
        'search_read',
        [[]],
        { fields: ['name', 'partner_id', 'country_id'], limit: 100 },
      );

      console.log(`  Total res.company records found: ${companies.length}`);
      expect(companies.length, 'no company records read - the query found nothing').toBeGreaterThan(0);

      // Verify the first company has a name
      if (companies.length > 0) {
        const firstCompany = companies[0];
        console.log(`  First company:`);
        console.log(`    - ID   : ${firstCompany.id}`);
        console.log(`    - Name : ${firstCompany.name}`);
        console.log(`    - Name is populated: ${firstCompany.name && firstCompany.name.length > 0}`);
      }

      // Count companies with non-empty names
      const companiesWithNames = companies.filter((c) => c.name && c.name.trim().length > 0).length;
      console.log(`  Companies with populated name field: ${companiesWithNames}`);

      return {
        companyCount: companies.length,
        companiesWithNames,
        firstCompany: companies[0] || null,
        allCompanies: companies,
      };
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`\n==================== VERIFY ====================`);

      console.log(`Verify #1 - at least one company record exists:`);
      console.log(`   Expected : >= 1`);
      console.log(`   Actual   : ${result.companyCount}`);
      console.log(`   Result   : ${result.companyCount >= 1 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #2 - company name field is not empty:`);
      if (result.firstCompany) {
        console.log(`   Expected : populated name`);
        console.log(`   Actual   : "${result.firstCompany.name}"`);
        console.log(`   Result   : ${result.firstCompany.name && result.firstCompany.name.trim().length > 0 ? 'PASS' : 'FAIL'}`);
      } else {
        console.log(`   Expected : populated name`);
        console.log(`   Actual   : (no company)`);
        console.log(`   Result   : FAIL`);
      }

      console.log(`\nVerify #3 - companies with name field populated:`);
      console.log(`   Expected : >= 1`);
      console.log(`   Actual   : ${result.companiesWithNames}`);
      console.log(`   Result   : ${result.companiesWithNames >= 1 ? 'PASS' : 'FAIL'}`);

      console.log(`===============================================`);
      console.log(
        `OVERALL: ${result.companyCount >= 1 && result.firstCompany?.name && result.firstCompany.name.trim().length > 0 ? 'PASS' : 'FAIL'} - company record exists with required fields populated`,
      );

      expect(result.companyCount, 'at least one company record should exist').toBeGreaterThanOrEqual(1);
      expect(result.firstCompany?.name, 'company name should be populated').toBeTruthy();
      expect(result.companiesWithNames, 'at least one company should have a populated name').toBeGreaterThanOrEqual(1);
    });
  });
});
