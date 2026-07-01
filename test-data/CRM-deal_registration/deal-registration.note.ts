/**
 * Deal-registration "Internal Note #1" test data (UC-A-1 / TC.-A.1.1).
 *
 * Holds the deal-registration Internal Note TEMPLATE used when a Reseller submits a new product
 * registration. The static lines live here; the dynamic <...> placeholders are filled at run time:
 *   - random 4-digit number (deal registration suffix)
 *   - Name        = "TEST <current date time>"
 *   - Email       = "Test@company<compact date time>.com"
 *   - Created Date = "<current date time>"
 *   - phone       = random 9-digit number
 *
 * Use `generateDealRegistrationNote()` to get fresh dynamic values + the assembled note in one call,
 * or `buildDealRegistrationInternalNote(values)` to assemble the note from explicit values.
 */
import { CommonUtils } from '@helpers/common.utils';

/** Static partner / marker / customer data embedded in the deal-registration note (and reused on
 *  the Opportunity create form so the form fields and the note stay in sync). */
export const DEAL_REGISTRATION = {
  leadFormMarker: 'NAKIVO deal registration*',
  partnerCompanyName: 'TEST-Reseller#Automation-Jun10',
  partnerContactName: 'TEST-Reseller#Automation-Jun10',
  partnerBusinessEmail: 'Test-Reseller-Automation-Jun10@Reseller-company2026-05-22-220038.com',
  partnerPhone: '0256468451',
  // Backend res.partner id of the Reseller company on pre-prod (hard-configured contact URL, used by
  // Discount-1.1 Pre-condition #1 to read the reseller's Level). Its Level = "Bronze" (Discount % = 15).
  partnerContactId: '627556',
  // Customer / lead data (note "Company"/"IP"/"Country" lines + the Opp create-form fields)
  companyName: 'Company Name Lead 1',
  ip: '128.183.189.157',
  country: 'United States',
  state: 'Maryland', // Opp-form State only (not part of the note text)
} as const;

/** Dynamic values that fill the deal-registration note's <...> placeholders. */
export interface DealRegistrationNoteValues {
  /** random 4-digit number appended to the "NAKIVO deal registration*" line */
  random4: string;
  /** random 9-digit number for the "phone" line */
  random9: string;
  /** "YYYY-MM-DD HH:MM:SS" used for "Created Date" and inside "Name" */
  currentDateTime: string;
  /** company email, e.g. "Test@company20260623123045.com" */
  companyEmail: string;
  /** lead/contact name for the "Name" line, e.g. "TEST 2026-06-23 12:30:45" */
  leadName: string;
}

/**
 * Assemble the deal-registration Internal Note from the template, filling the dynamic placeholders
 * with the supplied values. Pure function (deterministic for given inputs).
 */
export function buildDealRegistrationInternalNote(v: DealRegistrationNoteValues): string {
  return [
    `NAKIVO deal registration* ${v.random4}`,
    `Name: ${v.leadName}`,
    `Email: ${v.companyEmail}`,
    `Created Date: ${v.currentDateTime}`,
    `Referer: 1)DIRECT|https://di1.nakivo.com/partner/register-a-deal/;2)DIRECT|https://di1.nakivo.com/partner/register-a-deal/;`,
    `phone: ${v.random9}`,
    `Company: ${DEAL_REGISTRATION.companyName}`,
    `distributor name: `,
    `Solution used: Acronis`,
    `Competitor: None`,
    `Language: en`,
    `Download Date: 2026-6-10`,
    `Expected date: 2026-08-01`,
    `qualification info: `,
    `IP: ${DEAL_REGISTRATION.ip}`,
    `Workstations: 0`,
    `Servers: 1`,
    `NAS Backup (TB): 1`,
    `Monitoring for VMware: 1`,
    `Real-Time Replication for VMware: 0`,
    `License Type: Perpetual`,
    `Support Level: Standard support`,
    `Edition: Enterprise`,
    `Number of Microsoft 365 users:  `,
    `Subscription duration: `,
    `Microsoft 365 users: 0`,
    `Amazon EC2 instances: 0`,
    `Sockets: 1`,
    `Oracle Databases: 0`,
    `Microsoft 365 users: 0`,
    `Support Years: 0`,
    `Partner Company Name: ${DEAL_REGISTRATION.partnerCompanyName}`,
    `Partner Contact Name: ${DEAL_REGISTRATION.partnerContactName}`,
    `Partner Business Email: ${DEAL_REGISTRATION.partnerBusinessEmail}`,
    `Partner phone: ${DEAL_REGISTRATION.partnerPhone}`,
    `customers address: `,
    `Country: ${DEAL_REGISTRATION.country}`,
    `Privacy Policy: agree`,
    `I agree that NAKIVO can contact me by email to promote their products and services: agree`,
    `I accept Terms: agree`,
    `I'm in touch with a NAKIVO distributor: disagree`,
  ].join('\n');
}

/** Fresh dynamic values + the assembled note (and a compact timestamp for unique record names). */
export interface GeneratedDealRegistrationNote extends DealRegistrationNoteValues {
  /** "YYYYMMDDHHMMSS" - handy for building unique Opp names that share the note's timestamp */
  compactDateTime: string;
  /** the assembled Internal Note text */
  note: string;
}

/**
 * Generate fresh dynamic values and the assembled deal-registration Internal Note in one call.
 * All timestamp-derived values (currentDateTime, companyEmail, leadName, compactDateTime) share the
 * same instant so the record name and note stay consistent.
 */
export function generateDealRegistrationNote(): GeneratedDealRegistrationNote {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const currentDateTime = `${dateStr} ${timeStr}`;
  const compactDateTime = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const random4 = CommonUtils.generateRandomDigits(4);
  const random9 = CommonUtils.generateRandomDigits(9);
  const companyEmail = `Test@company${compactDateTime}.com`;
  const leadName = `TEST ${currentDateTime}`;

  const values: DealRegistrationNoteValues = { random4, random9, currentDateTime, companyEmail, leadName };
  return { ...values, compactDateTime, note: buildDealRegistrationInternalNote(values) };
}
