/**
 * User credentials configuration for multiple users
 */
export interface UserCredentials {
  username: string;
  password: string;
  displayName: string;
}

export const users = {
  reseller_basic: {
    username: 'Test-Reseller@Reseller-company-automation-basic.com',
    password: 'Test-Reseller@0123456789012',
    displayName: 'TEST-Reseller#1_Automation_Basic',
    level: 'Basic',
  },
  reseller_bronze: {
    username: 'Test-Reseller-Automation-Jun10@Reseller-company2026-05-22-220038.com',
    password: 'Test-Reseller@0123456789012',
    displayName: 'TEST-Reseller#1_Automation_Test',
    level: 'Bronze',
  },
  reseller_silver: {
    username: 'Test-Reseller@Reseller-company-automation-silver.com',
    password: 'Test-Reseller@0123456789012',
    displayName: 'TEST-Reseller#1_Automation_Silver',
    level: 'Silver',
  },
  reseller_gold: {
    username: 'Test-Reseller@Reseller-company-automation-gold.com',
    password: 'Test-Reseller@0123456789012',
    displayName: 'TEST-Reseller#1_Automation_Gold',
    level: 'Gold',
  },
  distributor_partner: {
    username: 'Test-Distributor@Distributor-company.com',
    password: 'Test-Distributor@0123456789012',
    displayName: 'TEST-Distributor#1_Automation',
    level: 'Distributor',
  },
  msp_partner: {
    username: 'Test-MSP@MSP-company.com',
    password: 'Test-MSP@0123456789012',
    displayName: 'TEST-MSP#1_Automation',
    level: 'MSP',
  },
  accountance_ic_faye: {
    username: 'faye.nguyen@nakivo.com',
    password: 'FNUaT@0123456789012',
    displayName: 'Faye Nguyen',
  },
  accountance_ic_yulia: {
    username: 'yuliya.malihonova@nakivo.com',
    password: 'YMUaT@0123456789012',
    displayName: 'Yulia Malihonova',
  },
  pre_sales_engineer: {
    username: 'nick.luchkov@nakivo.com',
    password: 'NLUaT@0123456789012',
    displayName: 'Nick Luchkov',
  },
  sale_ic_thomas: {
    username: 'thomas.semerich@nakivo.com',
    password: 'TSUaT@123456789012',
    displayName: 'Thomas Semerich',
  },
  manager_veronika: {
    username: 'veronika@nakivo.com',
    password: 'VSUaT@123456789012',
    displayName: 'Veronika Stasinievych',
  },
  manager_max: {
    username: 'max.zaprykutenko@nakivo.com',
    password: 'MZUaT@123456789012',
    displayName: 'Max Zaprykutenko',
  },
  admin_crm: {
    username: 'anh.ho@nakivo.com',
    password: 'W3lcomeVN?0123456789012',
    displayName: 'Anh Ho',
    createdByName: 'Ho Quoc Anh',
  },
  // O12 Migration server (crm-mig.nakivo.site) - fresh Odoo 12 CE base (CRM-12124). Same username
  // as admin_crm but a DIFFERENT password on that instance, so it is a separate entry.
  admin_crm_mig: {
    username: 'anh.ho@nakivo.com',
    password: 'AHUaT@098765',
    displayName: 'Anh Ho',
    createdByName: 'Ho Quoc Anh',
  },
  accountance_ic_faye_crm_mig: {
    username: 'faye.nguyen@nakivo.com',
    password: 'FNUaT@0123456789012',
    displayName: 'Faye Nguyen',
  },
  accountance_ic_yulia_crm_mig: {
    username: 'yuliya.malihonova@nakivo.com',
    password: 'YMUaT@0123456789012',
    displayName: 'Yulia Malihonova',
  },
  pre_sales_engineer_crm_mig: {
    username: 'nick.luchkov@nakivo.com',
    password: 'NLUaT@0123456789012',
    displayName: 'Nick Luchkov',
  },
  sale_ic_thomas_crm_mig: {
    username: 'thomas.semerich@nakivo.com',
    password: 'TSUaT@123456789012',
    displayName: 'Thomas Semerich',
  },
  manager_veronika_crm_mig: {
    username: 'veronika@nakivo.com',
    password: 'VSUaT@123456789012',
    displayName: 'Veronika Stasinievych',
  },
  manager_max_crm_mig: {
    username: 'max.zaprykutenko@nakivo.com',
    password: 'MZUaT@123456789012',
    displayName: 'Max Zaprykutenko',
  }
} as const;
// Base URL of the CRM Pre-production environment
// IMPORTANT: Need to connect to VPN before accessing this URL http://10.220.222.100/
//export const baseUrl = 'http://pre-production.nakivo.site/';
//export const baseUrl = 'http://10.220.222.100/'
export const baseUrl = 'http://pre-production.nakivo.site/';

// O12 Migration server - fresh Odoo 12 Community base (CRM-12124). Different UI (CE theme + custom
// screens re-created under new naming). Pass this explicitly to loginPage.navigateTo(...) in Mig
// specs; the default baseUrl (pre-prod) above is unchanged, so existing specs are unaffected.
export const baseUrl_mig = 'https://crm-mig.nakivo.site/';
