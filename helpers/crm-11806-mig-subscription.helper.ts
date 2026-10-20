import { test, expect } from '@playwright/test';
import type { Frame, Page } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig, SubscriptionPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Shared setup for the crm-mig Subscriptions suite (CRM-11806 / CRM-12140).
 *
 * WHY THIS EXISTS
 * ---------------
 * The pre-production baseline builds its fixture with `Subscriptions > CREATE` + `SAVE` on a native
 * `sale.subscription` form. crm-mig has neither: the subscription lives on the peer and the CRM
 * renders it through an embed. The equivalent controls, measured on the live screen 2026-10-09, are
 * the embed's **New** button and the **cloud save icon** (`aria-label="Save manually"`).
 *
 * This helper is that substitution, in one place, so each spec states it once as a deviation instead
 * of carrying its own copy of the plumbing.
 *
 * WHAT EVERY CALLER MUST KNOW
 * ---------------------------
 *  - The bootstrap REUSES a peer session; `openSubscriptionsEmbed()` signs in to the peer in the
 *    same browser context first, or the iframe shows the peer's sign-in page.
 *  - Everything created here lives on the PEER and is invisible to the CRM-side teardown, so the
 *    returned `id` must be removed by the spec - `deleteSubscriptionOnPeer` does it.
 *  - Records are tagged through the Customer, so a sweep can find them by partner name.
 */

export interface MigSubscriptionFixture {
  /** The live embed frame, ready to drive. */
  frame: Frame;
  /** The Reference the saved record carries, e.g. "SUB00033". */
  reference: string;
  /** `sale.subscription` id on the peer - delete this in teardown. */
  id: number;
  /** The page object, so the caller keeps driving the same session. */
  subs: SubscriptionPageMig;
}

export interface MigSubscriptionOptions {
  /** Customer to put on the subscription (`remote_partner_id`). */
  customer: string;
  /** Subscription Template; omit to leave the instance default. */
  template?: string;
  /** Pricelist (`remote_pricelist_id`); omit to leave the default. */
  pricelist?: string;
  /** Start date, as the form renders it (MM/DD/YYYY). */
  startDate?: string;
  /** One subscription line: SKU + quantity. */
  line?: { sku: string; qty?: number };
  /** Move the saved record to this stage (e.g. "In Progress"). */
  stage?: string;
}

/** Sign in to crm-mig as the account the TC names. */
export async function loginToMigCrm(
  page: Page,
  account: { username: string; password: string; displayName?: string } = users.admin_crm_mig,
): Promise<void> {
  const login = new LoginPageMig(page);
  await login.navigateTo(baseUrl_mig);
  await login.login(account.username, account.password, CommonUtils.waitTimes.login);
  console.log(`  OK - signed in on crm-mig as ${account.username}`);
}

/**
 * The crm-mig stand-in for the baseline's `Subscriptions > CREATE` ... `SAVE`.
 *
 * Opens the Subscriptions embed, clicks **New**, fills the header (and one line when asked), saves
 * with the **cloud icon**, and reads the Reference back off the peer so the caller has a real id.
 */
export async function createSubscriptionViaEmbed(
  page: Page,
  opts: MigSubscriptionOptions,
): Promise<MigSubscriptionFixture> {
  const subs = new SubscriptionPageMig(page);
  const frame = await subs.openSubscriptionsEmbed();

  await subs.clickNewInEmbed(frame);
  console.log('  - "New" clicked on the embedded Subscriptions list');

  await subs.fillEmbedMany2One(frame, 'remote_partner_id', opts.customer);
  console.log(`  - Customer              : ${opts.customer}`);
  if (opts.pricelist) {
    await subs.fillEmbedMany2One(frame, 'remote_pricelist_id', opts.pricelist);
    console.log(`  - Pricelist             : ${opts.pricelist}`);
  }
  if (opts.template) {
    await subs.fillEmbedMany2One(frame, 'template_id', opts.template);
    console.log(`  - Subscription Template : ${opts.template}`);
  }
  if (opts.startDate) {
    await subs.fillEmbedField(frame, 'date_start', opts.startDate);
    console.log(`  - Start date            : ${opts.startDate}`);
  }
  if (opts.line) {
    await subs.addEmbedSubscriptionLine(frame, opts.line.sku, opts.line.qty);
    console.log(`  - Subscription line     : ${opts.line.sku} x ${opts.line.qty ?? 1}`);
  }

  const reference = await subs.saveInEmbed(frame);

  // THE ID COMES FROM THE URL, NOT FROM A REFERENCE SEARCH (fixed 2026-10-16).
  // This used to be `search_read [('code','=',reference)]` and nothing else. When that came back
  // empty the fixture had no id, teardown had nothing to delete, and the run left the record on the
  // peer - SUB00074, SUB00075, SUB00077 and SUB00078 all went that way. Odoo 19 puts the id in the
  // frame path the moment the record is created, so capture it there FIRST: it needs no RPC and it
  // cannot be defeated by the Reference living in a field we did not expect.
  const id = await subs.waitForEmbedRecordId(frame);
  console.log(`  - Saved with the cloud icon - Reference = "${reference}", peer id = ${id ?? 'NOT IN THE URL'}`);

  if (id === null) {
    // Report what the form actually showed. A bare "could not read it back" sent the last session
    // looking for a write lag that was never there.
    throw new Error(
      'The embed saved but the peer id never appeared in the frame URL, so this run would leave an ' +
      'orphan on the peer. Nothing was handed back.\n' +
      `  frame URL  : ${frame.url()}\n` +
      `  Reference  : ${reference || '(the form carried none)'}\n` +
      '  Check first: did the save actually commit, or is the form still on /new with a validation ' +
      'error? `discardInEmbed()` leaves the same URL.',
    );
  }
  expect(reference, 'the subscription saved in the embed should carry a SUB reference').toMatch(/SUB\d+/i);

  if (opts.stage) {
    await subs.setEmbedStage(frame, opts.stage);
    console.log(`  - Stage                 : ${opts.stage}`);
  }

  // The RPC is now a VERIFICATION of the id we already hold, not the way we obtain it, so a failure
  // here is a real finding about the peer rather than a lost record. `code` and `name` are separate
  // fields on this model (measured 2026-10-16) - read both so the log shows which one the embed set.
  const rows = await subs.presalesCallKw<any[]>(
    'sale.subscription', 'read', [[id], ['code', 'name']], {},
  );
  const row = rows?.[0];
  expect(row, `the subscription this run created (peer id ${id}) should be readable back on the peer`)
    .toBeTruthy();
  if (row && String(row.code || '') !== reference) {
    console.log(
      `  - NOTE: the breadcrumb showed "${reference}" but peer id ${id} carries ` +
      `code="${row.code}" / name="${row.name}". The id is authoritative.`,
    );
  }

  return { frame, reference: String(row?.code || reference), id, subs };
}

/**
 * Remove a subscription this run created on the peer.
 *
 * Guarded on the id the run CREATED, never on reading it back - that guard is what left
 * SUB00009..SUB00013 behind on 2026-10-08.
 */
export async function deleteSubscriptionOnPeer(
  subs: SubscriptionPageMig,
  id: number | null,
  reference = '',
  skip = false,
): Promise<void> {
  if (skip) {
    console.log(`[peer teardown] SKIPPED - ${reference || id} left for inspection`);
    return;
  }
  if (!id) return;
  await subs.presalesCallKw('sale.subscription', 'unlink', [[id]], {})
    .then(() => console.log(`[peer teardown] removed ${reference || ''} (id ${id})`))
    .catch((e: any) => console.log(
      `[peer teardown] COULD NOT remove ${reference || ''} (id ${id}) - ` +
      `${String(e?.message ?? e).slice(0, 200)}. Report it; it is a leftover on the peer.`,
    ));
}

/** A unique, greppable customer name for a run, so a sweep can always find what it made. */
export function migRunCustomer(tcId: string): string {
  return `AUTO-${tcId}-${CommonUtils.generateUniqueId()}`;
}

/** The customer the suite borrows when a case does not need its own - already on the base. */
export const MIG_TEST_CUSTOMER = '0123456789';

export { SubscriptionPageMig };

/* ===============================================================================================
 *  crm-mig-BOUND REPLACEMENTS for the pre-production helpers
 * -----------------------------------------------------------------------------------------------
 *  WHY THESE EXIST
 *  ---------------
 *  `helpers/crm-11806-subscription.helper.ts` is the PRE-PRODUCTION baseline's helper and it is
 *  SHARED with 35 baseline specs, so it cannot be re-pointed at crm-mig. Its `loginAsCrmAdmin()`
 *  and `createSubscription()` carry `baseUrl` = http://pre-production.nakivo.site/ inside them.
 *
 *  A crm-mig spec that merely imports `baseUrl_mig as baseUrl` and the Mig page objects therefore
 *  still runs on PRE-PRODUCTION the moment it calls one of those two - which is exactly what
 *  happened on 2026-10-12: CRM-11806_1.2.18 was un-skipped to see what it did, and it created a
 *  real Opportunity, Sales Order and subscription SUB1732 on pre-production, then passed, because
 *  on pre-production `sale.subscription` exists and the pre-prod page objects work.
 *
 *  These are the crm-mig twins, with the SAME SIGNATURES, so a call site is a one-identifier swap.
 * ============================================================================================= */

/** crm-mig twin of the baseline's `loginAsCrmAdmin` - same signature, crm-mig host. */
export async function loginAsCrmAdminMig(page: Page, stepPrefix = 'Pre-condition'): Promise<void> {
  const admin = users.admin_crm_mig;
  await test.step(`${stepPrefix}: Login to crm-mig as a CRM administrator (${admin.username})`, async () => {
    await loginToMigCrm(page, admin);
  });
  await assertOnMigHost(page);
}

/**
 * Fail fast when the browser is NOT on crm-mig.
 *
 * This is the guard the suite did not have. Every spec in the crm-mig suite calls it right after
 * sign-in, so a helper that silently carries a pre-production URL stops the run instead of quietly
 * writing to the wrong system. Reading the host is cheap; the alternative is finding out from the
 * record you created.
 */
export async function assertOnMigHost(page: Page): Promise<void> {
  const url = page.url();
  let host = '';
  try { host = new URL(url).host; } catch { host = url; }
  if (!/crm-mig\.nakivo\.site/i.test(host)) {
    throw new Error(
      `WRONG HOST: this spec belongs to the crm-mig suite but the browser is on "${host}" ` +
      `(${url}). Every CRM-11806_* spec must run on crm-mig.nakivo.site. A helper is carrying the ` +
      'pre-production baseUrl - see loginAsCrmAdminMig / createSubscriptionMig in this file.',
    );
  }
}

/** What `createSubscriptionMig` hands back - the baseline's shape plus the peer id for teardown. */
export interface MigSubscriptionSetupResult {
  /** The subscription Reference, e.g. "SUB00041". */
  reference: string;
  /** Whether "Date of Next Invoice" was rendered while the record was still in Draft. */
  dateVisibleInDraft: boolean;
  /** Whether a "Generate Invoice" control was rendered while the record was still in Draft. */
  linkVisibleInDraft: boolean;
  /** `sale.subscription` id ON THE PEER - the caller MUST delete this in teardown. */
  peerId: number;
  /** The customer the record actually carries (see the D5 deviation below). */
  customerUsed: string;
}

/**
 * crm-mig twin of the baseline's `createSubscription` - same option shape, built on the embed.
 *
 * DEVIATIONS the caller must declare in its docblock:
 *  D1. CREATE -> NEW. crm-mig has no `sale.subscription` model; the record is created with the
 *      embed's **New** button and the **cloud save** icon (`createSubscriptionViaEmbed`).
 *  D5. THE CUSTOMER IS BORROWED, NOT INVENTED. `remote_partner_id` resolves against partners that
 *      already exist on the peer, so a generated `opts.customerName` cannot be accepted. The
 *      borrowed contact is returned as `customerUsed` and the call LOGS the substitution - it is
 *      never silent, because a spec that believes it created its own customer would key its
 *      teardown on a name that was never used.
 */
export async function createSubscriptionMig(
  page: Page,
  opts: {
    customerName: string;
    template: string;
    productSku: string;
    quantity: number;
    pricelist?: string;
    startDate?: string;
    nextInvoiceDate?: string;
    stepPrefix?: string;
  },
): Promise<MigSubscriptionSetupResult> {
  await assertOnMigHost(page);
  const customerUsed = MIG_TEST_CUSTOMER;
  if (opts.customerName && opts.customerName !== customerUsed) {
    console.log(
      `  [D5] crm-mig cannot create "${opts.customerName}" on the peer from this form - ` +
      `the subscription is created for the existing contact "${customerUsed}" instead. ` +
      'Key teardown on the subscription id, not on the customer name.',
    );
  }

  const subs = new SubscriptionPageMig(page);
  const frame = await subs.openSubscriptionsEmbed();
  await subs.clickNewInEmbed(frame);
  await subs.fillEmbedMany2One(frame, 'remote_partner_id', customerUsed);
  if (opts.pricelist) await subs.fillEmbedMany2One(frame, 'remote_pricelist_id', opts.pricelist);
  if (opts.template) await subs.fillEmbedMany2One(frame, 'template_id', opts.template);
  if (opts.startDate) await subs.fillEmbedField(frame, 'date_start', opts.startDate);
  await subs.addEmbedSubscriptionLine(frame, opts.productSku, opts.quantity);

  // Measured BEFORE the save, while the record is still a draft - the baseline reads the same two
  // things at the same moment. Both are reported, never assumed.
  const dateVisibleInDraft = (await frame.locator('[name="recurring_next_date"]').first()
    .isVisible({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => false));
  const linkVisibleInDraft = (await frame.locator('a:has-text("Generate Invoice"), button:has-text("Generate Invoice")')
    .first().isVisible({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => false));
  console.log(`  draft-state observations: Date of Next Invoice visible = ${dateVisibleInDraft}, "Generate Invoice" visible = ${linkVisibleInDraft}`);

  const reference = await subs.saveInEmbed(frame);

  // Same fix as createSubscriptionViaEmbed, and for the same reason: the id comes from the frame
  // URL, not from a `code` search. See that function for the measurement.
  const peerId = await subs.waitForEmbedRecordId(frame);
  if (peerId === null) {
    throw new Error(
      'The embed saved but the peer id never appeared in the frame URL, so this run would leave an ' +
      'orphan on the peer. Nothing was handed back.\n' +
      `  frame URL  : ${frame.url()}\n` +
      `  Reference  : ${reference || '(the form carried none)'}\n` +
      `  Customer   : ${customerUsed}`,
    );
  }
  expect(reference, 'the subscription saved in the embed should carry a SUB reference').toMatch(/SUB\d+/i);
  if (opts.nextInvoiceDate) await subs.setEmbedStage(frame, 'In Progress');

  const rows = await subs.presalesCallKw<any[]>(
    'sale.subscription', 'read', [[peerId], ['code', 'name']], {},
  );
  const code = String(rows?.[0]?.code || reference);
  expect(rows?.[0], `the subscription this run created (peer id ${peerId}) should be readable back on the peer`)
    .toBeTruthy();
  console.log(`  created on the peer: ${code} (id ${peerId}) for "${customerUsed}"`);

  return { reference: code, dateVisibleInDraft, linkVisibleInDraft, peerId, customerUsed };
}

/**
 * Print an OBSERVATION - a reading that is deliberately NOT scored.
 *
 * Two QA cards in "Subscription Test Cases" (CRM-12140) carry an explicit **DO NOT SCORE** rule
 * because the specification text and the delivered configuration disagree, and the disagreement is
 * the card's whole subject:
 *   - **SC-21** (CRM-11806_5.4): the spec says a Monthly subscription "shall not be terminated
 *     automatically", but the delivered Monthly template sets no closing limit, so the run applies
 *     the 15-day fallback and the subscription closes.
 *   - **SC-34** (CRM-11806_7.1): FUNC-0161 describes an upsell quotation, but the delivered
 *     configuration switches upsell off.
 * The document's own convention: *"Record as an observation" = a known difference between sources:
 * write down what you saw and do not score it.*
 *
 * So these two cases must not `expect()` their subject - a PASS would certify behaviour the
 * specification contradicts, and a FAIL would report a defect nobody has ruled on. This prints the
 * reading in the same shape as `logVerify` but with **OBSERVED** where the verdict would be, so a
 * reader of the run log cannot mistake it for a result. Awaiting the PM's ruling on CRM-11806.
 */
export function logObservation(label: string, specSays: string, observed: string): void {
  console.log(`OBSERVATION (${label}) - DO NOT SCORE:`);
  console.log(`  Specification: ${specSays}`);
  console.log(`  Observed     : ${observed}`);
  console.log('  Result       : OBSERVED (not scored - awaiting the PM ruling on CRM-11806)');
}
