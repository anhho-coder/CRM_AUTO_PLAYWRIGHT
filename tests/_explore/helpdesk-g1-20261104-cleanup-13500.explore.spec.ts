import { test } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { deleteSupportProbeAsAdmin } from '@helpers/support-desk-cleanup.helper';

/**
 * CLEANUP (kept per the never-delete-explore rule) - 2026-11-04: TC-UI-046_B run left its closed probe 13500 because the
 * teardown deleted the Communication before the Email Queue row that links it. Deny-list: that ticket number, its marker
 * subject, its run-unique Raised By, rows created since its creation.
 */
test('CLEANUP-G1: leftover probe 13500 of TC-UI-046_B', async () => {
  const log = await deleteSupportProbeAsAdmin(baseUrl_support_mig, users.admin_support_mig, {
    ticketName: '13500', subject: 'QA-UI probe 3 AUTO-CRM-11859-TC-UI-046_B-mw2089kskvi', contactEmail: 'qa.ui3.mw2089kskvi@example.com', since: '2026-11-04 17:59:46',
  });
  for (const l of log) console.log(l);
});
