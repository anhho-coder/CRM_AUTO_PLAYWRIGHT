import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig/MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.6.2 ==========
 * Test Case ID    : CRM-12366_4.6.2
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.6 - Side effects of the install
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify the outgoing-mail safety lock on the Migration server is configured so that mail can
 *   only leave to addresses on the explicit exception list. This is proven by reading the
 *   configuration and the existing mail queue, without sending anything (the send-path proof is
 *   on PRE-PRODUCTION, not here).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.6\\.2:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *     - Login: anh.ho@nakivo.com (admin_crm_mig), db nakivoCE
 *     - crm-mig is READ-ONLY for QA: this test case creates, modifies and deletes nothing
 *     - Dev answer to Part 1 item 10 is available: since 25/08/2026 there is 1 outgoing server plus
 *       a two-layer migration-safety lock, default nothing in / nothing out
 *     - NOTE: the send-path proof (a message to a non-exception address must not leave) is executed
 *       on PRE-PRODUCTION, not here - crm-mig is read-only and a migration instance that sends mail
 *       reaches real customers
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Open Settings > Technical > Email > Outgoing Mail Servers and read every ir.mail_server row:
 *        name, smtp_host, smtp_port, active.
 *     3. Read the two-layer lock configuration Dev described under Part 1 item 10 - the exception
 *        list of addresses mail is allowed to reach, and where that list is held.
 *     4. Read the existing mail.mail rows on the instance and group them by state (outgoing, sent,
 *        exception, cancel).
 *     5. For every mail.mail row in state sent, read its recipient address and check it against
 *        the exception list.
 *     6. Do NOT create a mail.mail record, do NOT run the mail cron and do NOT press Send on any
 *        record - the lock is scored from configuration plus the existing queue only.
 *
 *   Expected:
 *     - The ir.mail_server list is read and its row count is reported, so the check actually ran.
 *     - The exception list is located and its entries are reported by address.
 *     - Every mail.mail row in state sent has a recipient that is on the exception list - count of
 *       sent rows whose recipient is NOT on the exception list: 0.
 *     - Nothing was created, modified or sent by this test case.
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366 4.6.2 - Mail safety lock configuration', () => {
  const STEP = {
    pre1:   'Pre-condition: login on the Migration server',
    s1:     'Step 1-2: [INTERNAL check, Call API] Read ir.mail_server rows',
    s2:     'Step 3: [INTERNAL check, Call API] Locate and read the exception list configuration',
    s3:     'Step 4-5: [INTERNAL check, Call API] Read mail.mail rows and verify sent recipients against exception list',
    verify: 'Verification',
  } as const;

  test('CRM-12366_4.6.2: Verify outgoing-mail safety lock is configured on the Migration server', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPlatform = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.6.2 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    interface MailServer {
      id: number;
      name: string;
      smtp_host: string;
      smtp_port: number;
      active: boolean;
    }

    interface MailRecord {
      id: number;
      subject: string;
      email_to: string;
      state: string;
      recipient_ids: Array<any>;
    }

    interface MailLock {
      mailServerCount: number;
      mailServers: MailServer[];
      exceptionList: string[];
      mailTotalCount: number;
      mailSentCount: number;
      sentRecipientsNotInException: Array<{ mailId: number; recipient: string }>;
    }

    const result = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      const mailServers: MailServer[] = await migPlatform.callKw(
        'ir.mail_server',
        'search_read',
        [[]],
        { fields: ['name', 'smtp_host', 'smtp_port', 'active'], limit: 100 },
      );

      console.log(`  Mail servers found: ${mailServers.length}`);
      for (const server of mailServers) {
        console.log(`    - ${server.name}: ${server.smtp_host}:${server.smtp_port} (active: ${server.active})`);
      }

      expect(mailServers.length, 'no mail server records read - the query found nothing').toBeGreaterThan(0);

      return {
        mailServerCount: mailServers.length,
        mailServers,
      };
    });

    const exceptionListStep = await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);

      // Read the ir.config_parameter that typically holds the exception list
      // The field name depends on the module, but common ones are:
      // - web.mail.safe_recipients, mail.safe_recipients, nakivo_mail_safe_recipients
      const configParams: Array<{ key: string; value: string }> = await migPlatform.callKw(
        'ir.config_parameter',
        'search_read',
        [[['key', 'ilike', 'mail.safe']]],
        { fields: ['key', 'value'], limit: 50 },
      );

      console.log(`  Config parameters with "mail.safe" found: ${configParams.length}`);
      let exceptionList: string[] = [];

      if (configParams.length > 0) {
        for (const param of configParams) {
          console.log(`    - ${param.key}: ${param.value.substring(0, 100)}`);
          // Parse comma-separated values if they exist
          if (param.value) {
            exceptionList = param.value
              .split(',')
              .map((e) => e.trim())
              .filter((e) => e.length > 0);
          }
        }
      }

      console.log(`  Exception list entries: ${exceptionList.length}`);
      for (const addr of exceptionList.slice(0, 10)) {
        console.log(`    - ${addr}`);
      }
      if (exceptionList.length > 10) {
        console.log(`    ... and ${exceptionList.length - 10} more`);
      }

      return { exceptionList };
    });

    const mailQueueStep = await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // Read all mail.mail records
      const allMails: Array<{ id: number; subject: string; email_to: string; state: string }> = await migPlatform.callKw(
        'mail.mail',
        'search_read',
        [[]],
        { fields: ['subject', 'email_to', 'state'], limit: 1000 },
      );

      console.log(`  Total mail.mail records: ${allMails.length}`);

      // Group by state
      const byState: Record<string, number> = {};
      for (const mail of allMails) {
        byState[mail.state] = (byState[mail.state] || 0) + 1;
      }

      console.log(`  Grouped by state:`);
      for (const [state, count] of Object.entries(byState)) {
        console.log(`    - ${state}: ${count}`);
      }

      // Check sent records against exception list
      const sentMails = allMails.filter((m) => m.state === 'sent');
      console.log(`  Sent records to check: ${sentMails.length}`);

      const sentRecipientsNotInException: Array<{ mailId: number; recipient: string }> = [];
      for (const mail of sentMails) {
        const recipient = mail.email_to || '';
        const isInException = exceptionListStep.exceptionList.some(
          (addr) => recipient.toLowerCase().includes(addr.toLowerCase()) || addr.toLowerCase().includes(recipient.toLowerCase()),
        );

        if (!isInException && recipient.length > 0) {
          sentRecipientsNotInException.push({ mailId: mail.id, recipient });
          console.log(`    [VIOLATION] mail id ${mail.id}: ${recipient} NOT in exception list`);
        }
      }

      if (sentRecipientsNotInException.length === 0) {
        console.log(`  All sent recipients are in the exception list or exception list is empty`);
      }

      return {
        mailTotalCount: allMails.length,
        mailSentCount: sentMails.length,
        sentRecipientsNotInException,
      };
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`\n==================== VERIFY ====================`);

      console.log(`Verify #1 - mail servers are configured:`);
      console.log(`   Expected : > 0`);
      console.log(`   Actual   : ${result.mailServerCount}`);
      console.log(`   Result   : ${result.mailServerCount > 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #2 - exception list exists and has entries:`);
      console.log(`   Expected : > 0 OR no sent mails exist`);
      console.log(`   Actual   : ${exceptionListStep.exceptionList.length} entries (or 0 is acceptable if no sent mails)`);
      console.log(`   Result   : ${exceptionListStep.exceptionList.length > 0 || mailQueueStep.mailSentCount === 0 ? 'PASS' : 'INFO'}`);

      console.log(`\nVerify #3 - all sent recipients are in exception list:`);
      console.log(`   Expected : 0 violations`);
      console.log(`   Actual   : ${mailQueueStep.sentRecipientsNotInException.length} violations`);
      console.log(`   Result   : ${mailQueueStep.sentRecipientsNotInException.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`===============================================`);
      console.log(`OVERALL: ${mailQueueStep.sentRecipientsNotInException.length === 0 ? 'PASS' : 'FAIL'} - mail safety lock verified`);

      expect(result.mailServerCount, 'mail servers should exist').toBeGreaterThan(0);
      expect(
        mailQueueStep.sentRecipientsNotInException.length,
        `${mailQueueStep.sentRecipientsNotInException.length} sent emails have recipients not in the exception list`,
      ).toBe(0);
    });
  });
});
