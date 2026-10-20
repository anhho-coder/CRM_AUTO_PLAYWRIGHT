/**
 * User credentials configuration for multiple users
 */
export interface UserCredentials {
  username: string;
  password: string;
  displayName: string;
}

import * as fs from 'fs';
import * as path from 'path';

/**
 * Passwords are NOT kept in this file.
 *
 * They live in `config/users.secrets.json`, which is git-ignored, so no credential is ever
 * committed or pushed. Shape: a flat { "<account key>": "<password>" } map - see
 * `config/users.secrets.example.json`.
 *
 *   local  : copy users.secrets.example.json -> users.secrets.json and fill it in
 *   Jenkins: the "Secret file" credential `crm-users-secrets` is bound to CRM_SECRETS_FILE
 *            (see the Jenkinsfile), which overrides the default path below
 */
const secretsPath = process.env.CRM_SECRETS_FILE || path.resolve(__dirname, 'users.secrets.json');

let secrets: Record<string, string>;
try {
  secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as Record<string, string>;
} catch (err) {
  throw new Error(
    `Cannot read the credentials file "${secretsPath}". Copy ` +
    `config/users.secrets.example.json to config/users.secrets.json and fill in the passwords ` +
    `(that file is git-ignored), or point CRM_SECRETS_FILE at it. Cause: ${(err as Error).message}`
  );
}

/**
 * Look a password up by account key; fails loudly rather than logging in with an empty string.
 *
 * A miss is COLLECTED, not thrown on the spot, so one run reports EVERY key that is absent.
 * Throwing on the first miss cost four build cycles on 2026-09-22: the Jenkins credential was
 * four keys behind the code, and each build named only the next one. The throw still happens at
 * module load, right after the `users` object below - validation stays eager on purpose.
 */
const missingKeys: string[] = [];
const pw = (key: string): string => {
  const value = secrets[key];
  if (!value) {
    missingKeys.push(key);
    return '';          // never reaches a login: the check below throws before this file is usable
  }
  return value;
};

export const users = {
  reseller_basic: {
    username: 'Test-Reseller@Reseller-company-automation-basic.com',
    password: pw('reseller_basic'),
    displayName: 'TEST-Reseller#1_Automation_Basic',
    level: 'Basic',
  },
  reseller_bronze: {
    username: 'Test-Reseller-Automation-Jun10@Reseller-company2026-05-22-220038.com',
    password: pw('reseller_bronze'),
    displayName: 'TEST-Reseller#1_Automation_Test',
    level: 'Bronze',
  },
  reseller_silver: {
    username: 'Test-Reseller@Reseller-company-automation-silver.com',
    password: pw('reseller_silver'),
    displayName: 'TEST-Reseller#1_Automation_Silver',
    level: 'Silver',
  },
  reseller_gold: {
    username: 'Test-Reseller@Reseller-company-automation-gold.com',
    password: pw('reseller_gold'),
    displayName: 'TEST-Reseller#1_Automation_Gold',
    level: 'Gold',
  },
  distributor_partner: {
    username: 'Test-Distributor@Distributor-company.com',
    password: pw('distributor_partner'),
    displayName: 'TEST-Distributor#1_Automation',
    level: 'Distributor',
  },
  msp_partner: {
    username: 'Test-MSP@MSP-company.com',
    password: pw('msp_partner'),
    displayName: 'TEST-MSP#1_Automation',
    level: 'MSP',
  },
  accountance_ic_faye: {
    username: 'faye.nguyen@nakivo.com',
    password: pw('accountance_ic_faye'),
    displayName: 'Faye Nguyen',
  },
  accountance_ic_yulia: {
    username: 'yuliya.malihonova@nakivo.com',
    password: pw('accountance_ic_yulia'),
    displayName: 'Yulia Malihonova',
  },
  pre_sales_engineer: {
    username: 'nick.luchkov@nakivo.com',
    password: pw('pre_sales_engineer'),
    displayName: 'Nick Luchkov',
  },
  sale_ic_thomas: {
    username: 'thomas.semerich@nakivo.com',
    password: pw('sale_ic_thomas'),
    displayName: 'Thomas Semerich',
  },
  manager_veronika: {
    username: 'veronika@nakivo.com',
    password: pw('manager_veronika'),
    displayName: 'Veronika Stasinievych',
  },
  manager_max: {
    username: 'max.zaprykutenko@nakivo.com',
    password: pw('manager_max'),
    displayName: 'Max Zaprykutenko',
  },
  // Support L2 Manager. On pre-prod this user is `nam.pham@nakivo.com` / "Nam Pham" (res.users id
  // 262, groups After-Sales / Manager + After-Sales / User), which carries read+write+create on
  // helpdesk.ticket and NO unlink - so specs archive their tickets, they cannot delete them.
  // On crm-mig the SAME login is res.users 250 / partner 6376 and takes the SAME password key as
  // here - provisioned 2026-10-13 (password written and `is_2fa_enable` turned off; the account
  // had never been signed in to, login_date was empty). Its groups there are NOT the pre-prod
  // ones: 19 groups, NONE of them After-Sales - only Internal User, "Sales / User: Own Documents
  // Only" and Technical Settings. A helpdesk spec run against baseUrl_mig with this account does
  // not see the module at all; it needs the After-Sales groups granted first.
  support_l2_manager_nam: {
    username: 'nam.pham@nakivo.com',
    password: pw('support_l2_manager_nam'),
    displayName: 'Nam Pham',
  },
  admin_crm: {
    username: 'anh.ho@nakivo.com',
    password: pw('admin_crm'),
    displayName: 'Anh Ho',
    createdByName: 'Ho Quoc Anh',
  },
  // O12 Migration server (crm-mig.nakivo.site) - fresh Odoo 12 CE base (CRM-12124). Same username
  // as admin_crm but a DIFFERENT password on that instance, so it is a separate entry.
  admin_crm_mig: {
    username: 'anh.ho@nakivo.com',
    password: pw('admin_crm_mig'),
    displayName: 'Anh Ho',
    createdByName: 'Ho Quoc Anh',
  },
  accountance_ic_faye_crm_mig: {
    username: 'faye.nguyen@nakivo.com',
    password: pw('accountance_ic_faye_crm_mig'),
    displayName: 'Faye Nguyen',
  },
  accountance_ic_yulia_crm_mig: {
    username: 'yuliya.malihonova@nakivo.com',
    password: pw('accountance_ic_yulia_crm_mig'),
    displayName: 'Yulia Malihonova',
  },
  pre_sales_engineer_crm_mig: {
    username: 'nick.luchkov@nakivo.com',
    password: pw('pre_sales_engineer_crm_mig'),
    displayName: 'Nick Luchkov',
  },
  sale_ic_thomas_crm_mig: {
    username: 'thomas.semerich@nakivo.com',
    password: pw('sale_ic_thomas_crm_mig'),
    displayName: 'Thomas Semerich',
    // Default Sales Team of this account on crm-mig (res.users.sale_team_id -> crm.team 40 "BDEU").
    // O12 CE stamps it on every Quotation/Sales Order/Invoice this account creates, so TCs that
    // assert the inherited team read it from here instead of hardcoding the name.
    salesTeam: 'BDEU',
  },
  manager_veronika_crm_mig: {
    username: 'veronika@nakivo.com',
    password: pw('manager_veronika_crm_mig'),
    displayName: 'Veronika Stasinievych',
  },
  manager_max_crm_mig: {
    username: 'max.zaprykutenko@nakivo.com',
    password: pw('manager_max_crm_mig'),
    displayName: 'Max Zaprykutenko',
  },
  // ---- Pre-Sales Application (pre-sales-crm-mig.nakivo.site, Odoo 19 / db odoo19), CRM-12135.
  // The shared sign-in matches a person by LOGIN, so the same login reaches the same person on
  // both sites - that is why these entries repeat a username already used above.
  anh_ho_presales_mig: {
    username: 'anh.ho@nakivo.com',
    password: pw('anh_ho_presales_mig'),
    displayName: 'Ho Quoc Anh',
    createdByName: 'Ho Quoc Anh',
  },
  // The three accounts handed over in "Pre-sale Migration Instructions.pdf" (CRM-12135, section 6).
  // Every address is on yopmail.com - a PUBLIC inbox: never send anything confidential to one and
  // never point a real customer record at one.
  qa_se_manager_presales_mig: {
    username: 'qa.se.manager@yopmail.com',
    password: pw('qa_se_manager_presales_mig'),
    displayName: 'QA SE Manager',
  },
  qa_no_helpdesk_mig: {
    username: 'qa.no.helpdesk@yopmail.com',
    password: pw('qa_no_helpdesk_mig'),
    displayName: 'QA No Helpdesk Role',
  },
  qa_portal_presales_mig: {
    username: 'qa.portal@yopmail.com',
    password: pw('qa_portal_presales_mig'),
    displayName: 'QA Portal Customer',
  },
  // ---- Subscription service (subscription-crm-mig.nakivo.site, Odoo 19 / db odoo19). Same login
  // as admin_crm / admin_crm_mig / anh_ho_presales_mig but a DIFFERENT password on that instance,
  // so it is its own entry. Verified 2026-10-06 via /web/session/authenticate: uid 67,
  // name "Ho Quoc Anh" - the Odoo 19 form, NOT the "Anh Ho" that crm-mig shows for this login.
  admin_subscription_mig: {
    username: 'anh.ho@nakivo.com',
    password: pw('admin_subscription_mig'),
    displayName: 'Ho Quoc Anh',
    createdByName: 'Ho Quoc Anh',
  },
  // ---- Mailpit test mailbox of crm-mig (baseUrl_mailpit_mig below), handed over by the dev on
  // 2026-10-20: "Because email can be sent out, this can be used to test sending email". NOT an
  // Odoo login - it signs in to the Mailpit web UI / API, never to loginPage.
  mailpit_crm_mig: {
    username: 'tester',
    password: pw('mailpit_crm_mig'),
    displayName: 'Mailpit tester',
  },
} as const;

// Eager validation, reported in one shot. Every pw() above has run by now, so `missingKeys` holds
// the COMPLETE set of absent account keys - fix them all in one edit instead of one per build.
if (missingKeys.length > 0) {
  throw new Error(
    `No password for ${missingKeys.length} account key(s) in "${secretsPath}":\n` +
    missingKeys.map(k => `  - ${k}`).join('\n') +
    `\n\nAdd EVERY key listed above in one go.\n` +
    `  local  : add them to config/users.secrets.json\n` +
    `  Jenkins: re-upload the "Secret file" credential \`crm-users-secrets\`, which the ` +
    `Jenkinsfile binds to CRM_SECRETS_FILE - the workspace has no copy to edit.\n` +
    `config/users.secrets.example.json lists every key this suite needs.`
  );
}
// Base URL of the CRM Pre-production environment
// IMPORTANT: Need to connect to VPN before accessing this URL http://10.220.222.100/
//export const baseUrl = 'http://pre-production.nakivo.site/';
//export const baseUrl = 'http://10.220.222.100/'
export const baseUrl = 'http://pre-production.nakivo.site/';

// O12 Migration server - fresh Odoo 12 Community base (CRM-12124). Different UI (CE theme + custom
// screens re-created under new naming). Pass this explicitly to loginPage.navigateTo(...) in Mig
// specs; the default baseUrl (pre-prod) above is unchanged, so existing specs are unaffected.
export const baseUrl_mig = 'https://crm-mig.nakivo.site/';

// Mailpit test mailbox of crm-mig - catches the email the CRM sends out, so a spec can assert on
// it. HTTP Basic auth with users.mailpit_crm_mig (401 without it) - pass it as the context's
// httpCredentials, there is no login form. REST API under <this URL>api/v1/. Verified 2026-10-20:
// Mailpit v1.31.6, GET api/v1/info -> 200. The host's cert chain is self-signed (curl needs -k).
export const baseUrl_mailpit_mig = 'https://crm-mig.nakivo.site/mailpit/';

// Pre-Sales Application (CRM-12135) - the NEW helpdesk the pre-sale requests are worked on, a
// SEPARATE Odoo 19 instance from the CRM above. A pre-sale spec drives BOTH hosts in one run:
// the request is raised on baseUrl_mig and lands on this one.
export const baseUrl_presales_mig = 'https://pre-sales-crm-mig.nakivo.site/';

// The Pre-Sales instance answers /web/session/authenticate only when the database is named
// explicitly - every other value returns "Database not found", so this is not optional.
export const presalesDb_mig = 'odoo19';

// Subscription service - a SEPARATE Odoo 19 instance, same pattern as the Pre-Sales application
// above: pass it explicitly to loginPage.navigateTo(...); the default baseUrl stays pre-prod, so
// existing specs are unaffected.
export const baseUrl_subscription_mig = 'https://subscription-crm-mig.nakivo.site/';

// Customer portal of that same instance - the /my front-end a portal user lands on after sign-in,
// as opposed to the /web backend above. Unauthenticated it 303s to
// /web/login?redirect=%2Fmy%3F, so a spec must sign in before asserting anything here.
export const baseUrl_subscription_portal_mig = 'https://subscription-crm-mig.nakivo.site/my';

// Like the Pre-Sales instance, Subscription answers /web/session/authenticate only with the
// database named explicitly - /web/database/list is blocked by nginx (403), so the name cannot be
// discovered at run time and has to live here. Verified 2026-10-06.
export const subscriptionDb_mig = 'odoo19';
