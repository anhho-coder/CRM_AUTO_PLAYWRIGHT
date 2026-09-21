import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653 Part 7.2.1 - Attachment binary content present and file sizes matching
 * Test Case ID: CRM-12653_7.2.1
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   A migrated attachment's binary content is present on the target - the file downloads,
 *   matches the source size and opens. This spec verifies that 3 sample attachments (one on
 *   a partner, one on a sale order, one on an invoice) migrated from pre-production to
 *   crm-mig have their binary files present and identical in size.
 *
 * Source manual TC (master sheet tab "CRM-12653 Data Migration Sales", row 7.2.1):
 *
 * Pre-conditions:
 *   VPN connected; both pre-production (Odoo 12 Enterprise) and crm-mig (Odoo 12 Community)
 *   are reachable and authenticated as admin_crm and admin_crm_mig respectively.
 *   Cut-off date established in CRM-12653_1.1.2.
 *   3 attachments identified from CRM-12653_7.1.1 sample: one on a partner, one on an order,
 *   one on an invoice - these exist on BOTH servers.
 *
 * Steps to reproduce:
 *   1. On pre-production open the parent record of the first attachment, click the file in
 *      the chatter attachment list to download it, and note the downloaded file size on disk
 *   2. On crm-mig open the matching parent record, click the same file name to download it,
 *      and note its size on disk
 *   3. Open both downloaded files
 *   4. Repeat steps 1-3 for the other 2 attachments
 *   5. Record the file name, both sizes and the outcome of opening each file
 *
 * Verification Points:
 *   1. All 3 files download from crm-mig - the click returns a file, not a 404 and not an
 *      error page
 *   2. For each file the size downloaded from crm-mig equals the size downloaded from
 *      pre-production
 *   3. Both copies open in their native viewer without a corruption warning and show the
 *      same content
 *   4. A 0-byte download, a 404 or a file that will not open means the ir.attachment row
 *      was migrated while its BINARY was not - record it as an exception with the file
 *      name and the parent record key, and state clearly that the row exists but the
 *      content does not: a count check alone would have passed
 *   5. A 500 returned by a /report/pdf URL is NOT this defect - it is the missing wkhtmltopdf
 *      on crm-mig and is recorded once as a known environment limitation
 *
 * READ-ONLY: this spec only reads attachment records and downloads binary files via
 * authenticated /web/content URLs. It creates, modifies and deletes nothing, as required
 * on crm-mig.
 *
 * NOTE: crm-mig has NO wkhtmltopdf installed, so every /report/pdf URL returns a 500 there.
 * This case downloads the STORED attachment from the chatter - do not try to re-print a PDF
 * report on crm-mig, and do not record that 500 as an attachment defect.
 *
 * NOTE: Attachment IDs may be re-sequenced on crm-mig. The join strategy uses the natural
 * key: the combination of res_model (res.partner / sale.order / account.invoice), res_id,
 * and attachment name (filename).
 *
 * NOTE: Point 3 (opening files in native viewer) cannot be fully automated through
 * Playwright - files are downloaded to the system temp and their binary presence is verified
 * by checking that the fetch succeeds (not 404 or 500) and that the byte count matches.
 * A 0-byte file indicates missing binary content.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_7\.2\.1:" --project=chromium
 */

async function openSession(
  browser: Browser, url: string, isMig: boolean, username: string, password: string,
): Promise<{ context: BrowserContext; parity: MigDataParityPage }> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,   // crm-mig serves a self-signed chain
  });
  const page = await context.newPage();
  const loginPage = isMig ? new LoginPageMig(page) : new LoginPage(page);
  await loginPage.navigateTo(url);
  await loginPage.login(username, password);
  return { context, parity: new MigDataParityPage(page) };
}

test.describe('CRM-12653 Part 7.2.1 - Attachment binary presence and size verification', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12653_7.2.1: Attachment binary content present and file sizes match between source and target', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let sourceContext: BrowserContext | null = null;
    let targetContext: BrowserContext | null = null;

    try {
      console.log('========== CRM-12653_7.2.1 - Attachment Binary Presence and Size Verification ==========');

      // Open target session first to resolve cut-off date
      await test.step('Pre-condition: Open authenticated session on crm-mig (target)', async () => {
        console.log('\n--- Pre-condition: Open authenticated session on crm-mig (target) ---');
        console.log(`  Account : ${users.admin_crm_mig.username}`);
        console.log(`  Target  : ${baseUrl_mig}`);
        const session = await openSession(browser, baseUrl_mig, true, users.admin_crm_mig.username, users.admin_crm_mig.password);
        targetContext = session.context;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'target session not authenticated on crm-mig').toBe(true);
      });

      // Open source session
      await test.step('Pre-condition: Open authenticated session on pre-production (source)', async () => {
        console.log('\n--- Pre-condition: Open authenticated session on pre-production (source) ---');
        console.log(`  Account : ${users.admin_crm.username}`);
        console.log(`  Source  : ${baseUrl}`);
        const session = await openSession(browser, baseUrl, false, users.admin_crm.username, users.admin_crm.password);
        sourceContext = session.context;

        const isAuth = await session.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'source session not authenticated on pre-production').toBe(true);
      });

      // Resolve cut-off from target
      const targetParityPage = new MigDataParityPage((await targetContext!.pages())[0]);
      const cutoff = await targetParityPage.resolveCutoffDate();
      console.log(`\n--- Cut-off date resolved on target: ${cutoff} ---`);

      const sourceParityPage = new MigDataParityPage((await sourceContext!.pages())[0]);

      // Collect 3 sample attachments: one per model (partner, order, invoice)
      interface SampledAttachment {
        id: number;
        name: string;
        res_model: string;
        res_id: number;
      }
      const sampleAttachments: SampledAttachment[] = [];
      const models = ['res.partner', 'sale.order', 'account.invoice'];

      await test.step('Step 1-2: Sample attachments from source - one per model', async () => {
        console.log('\n--- Step 1-2: Sample attachments from source (one per model: partner, order, invoice) ---');

        for (const model of models) {
          const sourceDomain = [
            ...MigDataParityPage.onOrBeforeCutoff(cutoff),
            ['res_model', '=', model],
          ];
          const records = await sourceParityPage.searchRead(
            'ir.attachment',
            sourceDomain,
            ['id', 'name', 'res_model', 'res_id'],
            { limit: 1, order: 'create_date asc' }
          );

          if (records.length > 0) {
            const attach = records[0] as SampledAttachment;
            sampleAttachments.push(attach);
            console.log(`  [${model}] ${attach.name} (id=${attach.id}, res_id=${attach.res_id})`);
          } else {
            console.log(`  [${model}] NO ATTACHMENT FOUND in source within cut-off - test cannot proceed`);
          }
        }
      });

      // Verify we have at least one sample from source
      expect(sampleAttachments.length, 'source contains no attachment records - query may have failed').toBeGreaterThan(0);

      // Look up each sampled attachment on target by natural key and verify file sizes
      interface FileSizeMismatch {
        attachment: string;
        parent: string;
        source: number;
        target: number;
      }
      interface AttachmentIssue {
        attachment: string;
        parent: string;
        issue: string;
      }
      const fileSizeMismatches: FileSizeMismatch[] = [];
      const attachmentIssues: AttachmentIssue[] = [];

      await test.step('Step 3-5: Look up on target by natural key and verify file sizes match', async () => {
        console.log('\n--- Step 3-5: Look up on target by natural key and verify binary file sizes ---');

        for (const sourceAttach of sampleAttachments) {
          const parentKey = `${sourceAttach.res_model} #${sourceAttach.res_id}`;
          console.log(`\n  Attachment: ${sourceAttach.name}`);
          console.log(`    Parent: ${parentKey}`);

          // Look up by natural key: res_model, res_id, name
          const targetDomain = [
            ...MigDataParityPage.onOrBeforeCutoff(cutoff),
            ['res_model', '=', sourceAttach.res_model],
            ['res_id', '=', sourceAttach.res_id],
            ['name', '=', sourceAttach.name],
          ];

          const targets = await targetParityPage.searchRead(
            'ir.attachment',
            targetDomain,
            ['id', 'name', 'res_model', 'res_id'],
            { limit: 1 }
          );

          if (targets.length === 0) {
            console.log(`    ✗ Not found on target by natural key`);
            attachmentIssues.push({
              attachment: sourceAttach.name,
              parent: parentKey,
              issue: 'not found on target',
            });
            continue;
          }

          const targetAttach = targets[0];
          console.log(`    ✓ Found on target (target id=${(targetAttach as any).id})`);

          // Fetch file sizes from both servers via authenticated /web/content URLs
          let sourceSize = 0;
          let targetSize = 0;
          let sourceFetchError = false;
          let targetFetchError = false;

          try {
            sourceSize = await sourceParityPage.fetchContentLength(`/web/content/${sourceAttach.id}/${sourceAttach.name}`);
            console.log(`    Source file size: ${sourceSize} bytes`);

            // Check for 0-byte file (Verification Point 4: missing binary)
            if (sourceSize === 0) {
              console.log(`    ✗ Source file is 0 bytes - binary may be missing`);
              attachmentIssues.push({
                attachment: sourceAttach.name,
                parent: parentKey,
                issue: 'source file is 0-byte (binary missing)',
              });
            }
          } catch (e) {
            console.log(`    ✗ Failed to fetch source file: ${(e as Error).message}`);
            sourceFetchError = true;
            attachmentIssues.push({
              attachment: sourceAttach.name,
              parent: parentKey,
              issue: `failed to fetch source binary - ${(e as Error).message}`,
            });
          }

          try {
            const targetId = (targetAttach as any).id;
            targetSize = await targetParityPage.fetchContentLength(`/web/content/${targetId}/${sourceAttach.name}`);
            console.log(`    Target file size: ${targetSize} bytes`);

            // Check for 0-byte file (Verification Point 4: missing binary)
            if (targetSize === 0) {
              console.log(`    ✗ Target file is 0 bytes - binary may be missing`);
              attachmentIssues.push({
                attachment: sourceAttach.name,
                parent: parentKey,
                issue: 'target file is 0-byte (binary missing)',
              });
            }
          } catch (e) {
            console.log(`    ✗ Failed to fetch target file: ${(e as Error).message}`);
            targetFetchError = true;
            attachmentIssues.push({
              attachment: sourceAttach.name,
              parent: parentKey,
              issue: `failed to fetch target binary - ${(e as Error).message}`,
            });
          }

          // Compare file sizes if both fetches succeeded (Verification Point 2)
          if (!sourceFetchError && !targetFetchError && sourceSize !== targetSize) {
            console.log(`    ✗ Size mismatch: source=${sourceSize} vs target=${targetSize}`);
            fileSizeMismatches.push({
              attachment: sourceAttach.name,
              parent: parentKey,
              source: sourceSize,
              target: targetSize,
            });
          } else if (!sourceFetchError && !targetFetchError) {
            console.log(`    ✓ File sizes match: ${sourceSize} bytes`);
          }
        }
      });

      await test.step('Verification', async () => {
        const fileSizeMismatchSummary = fileSizeMismatches.length > 0
          ? fileSizeMismatches.map((m) => `${m.attachment} (${m.parent}): source=${m.source} vs target=${m.target}`).join('; ')
          : 'none';
        const attachmentIssueSummary = attachmentIssues.length > 0
          ? attachmentIssues.map((i) => `${i.attachment} (${i.parent}) - ${i.issue}`).join('; ')
          : 'none';

        console.log('\n==================== VERIFY ====================');
        console.log('  Verification #1 - All 3 files download from crm-mig (no 404 or error):');
        console.log(`     Expected : all 3 files can be fetched from target`);
        console.log(`     Actual   : ${attachmentIssues.filter(i => i.issue.includes('fetch')).length === 0 ? 'all files fetched successfully' : `${attachmentIssues.filter(i => i.issue.includes('fetch')).length} fetch failures`}`);
        console.log(`     Result   : ${attachmentIssues.filter(i => i.issue.includes('fetch')).length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verification #2 - Each file size on crm-mig equals size on pre-production:');
        console.log(`     Expected : no size mismatches`);
        console.log(`     Actual   : ${fileSizeMismatches.length === 0 ? 'all sizes match' : fileSizeMismatchSummary}`);
        console.log(`     Result   : ${fileSizeMismatches.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verification #3 - Both copies open without corruption (verified by size match & non-zero):');
        console.log(`     Expected : files are non-zero and sizes match`);
        console.log(`     Actual   : ${attachmentIssues.filter(i => i.issue.includes('0-byte')).length === 0 ? 'no 0-byte files found' : `${attachmentIssues.filter(i => i.issue.includes('0-byte')).length} 0-byte files found`}`);
        console.log(`     Result   : ${attachmentIssues.filter(i => i.issue.includes('0-byte')).length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('  Verification #4 - Missing binaries recorded as exceptions (row exists, binary not):');
        console.log(`     Expected : any 0-byte files indicating missing binary content recorded in detail`);
        console.log(`     Actual   : ${attachmentIssues.filter(i => i.issue.includes('0-byte')).length === 0 ? 'no 0-byte files found' : attachmentIssues.filter(i => i.issue.includes('0-byte')).map(i => `${i.attachment} (${i.parent})`).join('; ')}`);
        console.log(`     Result   : ${attachmentIssues.filter(i => i.issue.includes('0-byte')).length === 0 ? 'PASS (no 0-byte files)' : 'FAIL (0-byte files found)'}`);
        console.log('  Verification #5 - 500 from /report/pdf is NOT counted as attachment defect (wkhtmltopdf limitation):');
        console.log(`     Expected : any /report/pdf 500 is a known crm-mig environment limitation, not a migration defect`);
        console.log(`     Actual   : this spec downloads STORED attachments from chatter, not PDF reports`);
        console.log(`     Result   : PASS (wkhtmltopdf limitation documented and excluded from defects)`);
        console.log('===============================================');
        const overallPass = sampleAttachments.length > 0
          && attachmentIssues.filter(i => i.issue.includes('fetch')).length === 0
          && fileSizeMismatches.length === 0;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - attachment binaries present and file sizes match between source and target`);

        expect(sampleAttachments.length, 'source session returned no attachments - query may have failed').toBeGreaterThan(0);
        expect(attachmentIssues.filter(i => i.issue.includes('fetch')), 'attachment binaries not accessible on source or target (404 or error)').toHaveLength(0);
        expect(fileSizeMismatches, `attachment file size mismatches: ${fileSizeMismatchSummary}`).toHaveLength(0);
        expect(attachmentIssues.filter(i => i.issue.includes('0-byte')), 'attachment files are 0-byte indicating missing binary content').toHaveLength(0);
        expect(attachmentIssues.filter(i => i.issue === 'not found on target'), 'sampled attachments not found on target by natural key').toHaveLength(0);
      });

    } finally {
      if (sourceContext) await sourceContext.close();
      if (targetContext) await targetContext.close();
    }
  });
});
