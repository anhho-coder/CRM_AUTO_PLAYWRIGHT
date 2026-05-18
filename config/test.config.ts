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
    urlWait: 60000, // 60 seconds - waiting for URL changes
    loadingSpinner: 30000, // 30 seconds - waiting for loading spinner to disappear
    salesTeamAssignment: {
      maxWaitTime: 90000, // 1.5 minutes in milliseconds
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
