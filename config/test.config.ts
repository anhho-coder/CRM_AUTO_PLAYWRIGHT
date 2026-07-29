/**
 * Test environment configuration
 */
export const config = {
  baseUrl: 'http://10.220.222.100/web?debug=assets',
  credentials: {
    username: 'anh.ho@nakivo.com',
    password: 'W3lcome@VN012345678901234',
  },
  timeouts: {
    navigation: 15000,
    element: 10000,
    action: 5000,
    '5-minutes': 500000, // 5 minutes - overall test timeout (especially for tests with contact creation)
    test: 900000, // 10 minutes - overall test timeout (especially for tests with contact creation)
    seMeetingTest: 1800000, // 30 minutes - long multi-actor SE-meeting flow (pre-sale-7.2.3.1): create Opp as Thomas + Nick schedules a G2M meeting via the calendar + re-open ticket + poll the "L1 notes" write-back; needs headroom above the 15-min default for the slow first Helpdesk navigation (~4 min) plus the meeting re-open polls.
    urlWait: 60000, // 60 seconds - waiting for URL changes
    loadingSpinner: 30000, // 30 seconds - waiting for loading spinner to disappear
    salesTeamAssignment: {
      maxWaitTime: 480000, // 8 minutes - async assignment runs on a cron and can take minutes; 1.5 min was too short and caused empty-Team/Salesperson flakes. Stays within the 15-min per-test timeout (config.timeouts.test) with headroom for the create/navigate steps.
      checkInterval: 10000, // Check every 10 seconds
    },
  },
  crm: {
    leadFormUrl: 'http://10.220.222.100/web?debug=assets',
  },
} as const;

/**
 * Test data for CRM Lead
 */
export const testData = {
  lead: {
    name: 'TEST CRM Lead 001',
    state: 'Connecticut',
    country: 'United States',
    salesTeam: 'CMR',
    salesperson: 'Bear Lin',
    reseller: 'Reseller#1',
    distributor: 'Distributor#1',
  },
} as const;
