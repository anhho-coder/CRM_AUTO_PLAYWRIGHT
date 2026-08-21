import { Page, test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Shared setup for the CRM-11806 Subscription Management (Recurring Billing) suite.
 *
 * Every test case in the suite starts the same way: log in, create a fresh uniquely-named
 * subscription, add one line, save, and (usually) move it to In Progress so that the
 * "Date of Next Invoice" field and its "=> Generate Invoice" link become available.
 *
 * IMPORTANT Odoo behaviour this helper encodes:
 *   "Date of Next Invoice" and the "=> Generate Invoice" link carry
 *   attrs="{'invisible': [('in_progress', '=', False)]}", so they do NOT exist on the form
 *   while the subscription is in Draft. The date can only be set AFTER clicking IN PROGRESS.
 */

export const SUBSCRIPTION_PRICELIST_USD = 'Public Pricelist_USD (USD)';
export const SUBSCRIPTION_PRICELIST_EUR = 'Public Pricelist_EUR (EUR)';

/** Template names exactly as shown in Subscriptions > Configuration > Subscription Templates. */
export const TEMPLATE_MONTHLY_AUTOCHARGE = 'Monthly Subscription';
export const TEMPLATE_MONTHLY_INVOICE_ONLY = 'Monthly Sub/Invoice only';
export const TEMPLATE_QUARTERLY = 'Quarterly Subscription';
export const TEMPLATE_YEARLY = 'Yearly Subscription';
export const TEMPLATE_DAILY_TEST = 'Daily(test)';

/** Subscription product SKUs available on pre-production. */
export const SKU_ENT_MONTHLY = 'CP-NC-PM-ENT';
export const SKU_O365 = 'CP-NC-O365';
export const SKU_PRO_MONTHLY = 'CP-NC-PM-PRO';

/** Format a Date as MM/DD/YYYY - the format the Odoo date input expects. */
export function toMMDDYYYY(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Today as MM/DD/YYYY. */
export function todayMMDDYYYY(): string {
  return toMMDDYYYY(new Date());
}

/** Today shifted by a whole number of months, as MM/DD/YYYY. */
export function monthsFromTodayMMDDYYYY(months: number): string {
  const d = new Date();
  return toMMDDYYYY(new Date(d.getFullYear(), d.getMonth() + months, d.getDate()));
}

/** Parse a displayed "MM/DD/YYYY" date into a Date (local midnight). Returns null if unparseable. */
export function parseMMDDYYYY(raw: string): Date | null {
  const m = (raw || '').trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

/** Whole-day difference between two dates (a - b), ignoring time. */
export function dayDiff(a: Date, b: Date): number {
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da - db) / 86_400_000);
}

export interface SubscriptionSetupOptions {
  /** Unique customer name created on the fly, e.g. "Cust-OneInv-<unique>". */
  customerName: string;
  /** Subscription Template name shown in the dropdown. */
  template: string;
  /** Product SKU searched in the Subscription Lines product picker. */
  productSku: string;
  /** Quantity for that line. */
  quantity: number;
  /** Pricelist name. Defaults to the USD public pricelist. */
  pricelist?: string;
  /** Start Date as MM/DD/YYYY. Defaults to today. */
  startDate?: string;
  /**
   * When set, the subscription is moved to In Progress and this date is written into
   * "Date of Next Invoice". Leave undefined to keep the subscription in Draft.
   */
  nextInvoiceDate?: string;
  /** Prefix used on the test.step titles, e.g. "Pre-condition". */
  stepPrefix?: string;
}

export interface SubscriptionSetupResult {
  /** The subscription Reference, e.g. "SUB1425". */
  reference: string;
  /** Whether "Date of Next Invoice" was rendered while the record was still in Draft. */
  dateVisibleInDraft: boolean;
  /** Whether the "=> Generate Invoice" link was rendered while the record was still in Draft. */
  linkVisibleInDraft: boolean;
}

/** Log in to pre-production as the CRM administrator (Anh Ho). */
export async function loginAsCrmAdmin(page: Page, stepPrefix = 'Pre-condition'): Promise<void> {
  const admin = users.admin_crm;
  await test.step(`${stepPrefix}: Login to pre-production as a CRM administrator (${admin.username})`, async () => {
    console.log(`${stepPrefix}: Logging in as ${admin.username}`);
    const loginPage = new LoginPage(page);
    // login() only WAITS for the login URL - the browser must be taken there first,
    // exactly as every other spec in this repo does.
    await loginPage.navigateTo(baseUrl);
    await loginPage.login(admin.username, admin.password, CommonUtils.waitTimes.login);
    console.log('✓ Logged in');
  });
}

/**
 * Create a fresh subscription and optionally move it to In Progress with a due date.
 * Returns the Reference plus what was observed about the Draft-mode field visibility, so a
 * test case can assert on it without repeating the setup.
 */
export async function createSubscription(
  page: Page,
  opts: SubscriptionSetupOptions,
): Promise<SubscriptionSetupResult> {
  const subscriptionPage = new SubscriptionPage(page);
  const prefix = opts.stepPrefix ?? 'Pre-condition';
  const pricelist = opts.pricelist ?? SUBSCRIPTION_PRICELIST_USD;
  const startDate = opts.startDate ?? todayMMDDYYYY();
  const result: SubscriptionSetupResult = { reference: '', dateVisibleInDraft: true, linkVisibleInDraft: true };

  await test.step(`${prefix}: Open Subscriptions > Subscriptions and click "CREATE"`, async () => {
    await subscriptionPage.openSubscriptionsList();
    await subscriptionPage.clickCreate();
  });

  await test.step(`${prefix}: Fill the subscription header (Customer / Pricelist / Template / Start Date)`, async () => {
    console.log(`  - Customer              : ${opts.customerName}`);
    console.log(`  - Pricelist             : ${pricelist}`);
    console.log(`  - Subscription Template : ${opts.template}`);
    console.log(`  - Start Date            : ${startDate}`);
    await subscriptionPage.fillMany2One('partner_id', opts.customerName, true);
    await subscriptionPage.fillMany2One('pricelist_id', pricelist);
    await subscriptionPage.fillMany2One('template_id', opts.template);
    await subscriptionPage.setDateField('date_start', startDate);
  });

  await test.step(`${prefix}: Add the Subscription Line "${opts.productSku}" x ${opts.quantity}`, async () => {
    await subscriptionPage.addSubscriptionLine(opts.productSku, opts.quantity);
  });

  await test.step(`${prefix}: Click "SAVE" and note the Reference`, async () => {
    await subscriptionPage.save();
    await subscriptionPage.waitForLoaded();
    result.reference = await subscriptionPage.getCode();
    console.log(`✓ Subscription saved - Reference = "${result.reference}"`);
    expect(result.reference, `${prefix}: the saved subscription should have a Reference (SUBxxx)`).toMatch(/SUB\d+/i);
  });

  await test.step(`${prefix}: Record whether "Date of Next Invoice" is rendered while still in DRAFT`, async () => {
    result.dateVisibleInDraft = await subscriptionPage.isDateOfNextInvoiceVisible();
    result.linkVisibleInDraft = await subscriptionPage.isGenerateInvoiceVisible();
    console.log(`  - In DRAFT: "Date of Next Invoice" visible = ${result.dateVisibleInDraft}, "=> Generate Invoice" visible = ${result.linkVisibleInDraft}`);
  });

  if (opts.nextInvoiceDate) {
    await test.step(`${prefix}: Click "IN PROGRESS", then set "Date of Next Invoice" = ${opts.nextInvoiceDate}`, async () => {
      await subscriptionPage.setStage('In Progress');
      await subscriptionPage.clickEdit();
      await subscriptionPage.setDateOfNextInvoice(opts.nextInvoiceDate as string);
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();
      console.log(`✓ Subscription is In Progress and due on ${opts.nextInvoiceDate}`);
    });
  }

  return result;
}

/**
 * Standard VERIFY block (REQUIREMENT #4) - prints Expected / Actual / Result to stdout
 * before the expect() calls so a failed run is readable straight from the log.
 */
export function logVerify(label: string, expected: string, actual: string, pass: boolean): void {
  console.log(`VERIFY (${label}):`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual  : ${actual}`);
  console.log(`  Result  : ${pass ? 'PASS' : 'FAIL'}`);
}
