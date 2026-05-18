/**
 * User credentials configuration for multiple users
 */
export interface UserCredentials {
  username: string;
  password: string;
  displayName: string;
}

export const users = {
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
} as const;
// Base URL of the CRM Pre-production environment
// IMPORTANT: Need to connect to VPN before accessing this URL http://10.220.222.100/
//export const baseUrl = 'http://pre-production.nakivo.site/';
//export const baseUrl = 'http://10.220.222.100/'
export const baseUrl = 'http://pre-production.nakivo.site/';
