import { ScheduledActionPage } from '@pages';
import { CommonUtils } from '@/helpers/common.utils';
import { Page } from '@playwright/test';

/**
 * ScheduledActionPageMig - fork of ScheduledActionPage for the O12 CE migration server.
 *
 * The Mig instance uses a SIDEBAR backend theme (body class `mk_sidebar_type_large`) instead of the
 * standard top navbar. The base ScheduledActionPage works as-is on the sidebar theme - all navigation
 * is by action hash (model=ir.cron, action=11) which does not depend on the navbar menu being rendered.
 *
 * This fork exists for consistency with other Mig page objects and to provide a clear import path
 * (@pages/mig). All methods are inherited from the base class.
 *
 * VERIFIED on crm-mig 2026-10-05:
 * - Action 11 opens the Scheduled Actions list correctly
 * - The OCA cron "Currency Rates Update (OCA) daily" is found via search in the list
 * - The cron's form opens correctly with all fields readable
 * - The "RUN MANUALLY" button is visible and functional
 * - All inherited methods (openScheduledAction, readState, setNextExecutionDate, restoreState,
 *   clickRunManually) are ready to use on crm-mig
 */
export class ScheduledActionPageMig extends ScheduledActionPage {
  constructor(page: Page) {
    super(page);
  }
}
