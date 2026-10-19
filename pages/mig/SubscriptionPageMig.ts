import { MigPreSalePage } from './MigPreSalePage';
import { CommonUtils } from '@helpers/common.utils';
import { baseUrl_mig } from '@config/users.config';
import type { Frame, FrameLocator, Page } from '@playwright/test';

/**
 * Subscriptions on the O12 Migration server (crm-mig.nakivo.site) - CRM-11806 / CRM-12140.
 *
 * WHY THIS CLASS EXISTS, AND WHY IT IS NOT `SubscriptionPage`
 * ----------------------------------------------------------
 * On pre-production a subscription is a native `sale.subscription` record and `SubscriptionPage`
 * drives its form directly. **crm-mig has no such model.** Grounded over the MCP on 2026-10-08:
 *
 *   ir.model  ->  nakivo.embed.host (991), nakivo.subscription.config (992),
 *                 nakivo.subscription.client (1012)      ... and NO sale.subscription
 *   ir.module ->  nakivo_subscription_integration 12.0.1.20.1 (installed),
 *                 nakivo_portal_subscription, ib_subscription_notification,
 *                 sale_subscription = state "uninstallable"
 *
 * The subscription itself lives on a PEER Odoo instance, and the CRM renders its screens through a
 * client action. Resolving the menu's server action returns, verbatim:
 *
 *   { type: 'ir.actions.client', tag: 'nakivo_remote_embed.embed', target: 'current',
 *     params:  { embed_model: 'res.users', embed_id: <uid>, embed_target: 'sale.subscription' },
 *     context: { peer_origin: 'https://pre-sales-crm-mig.nakivo.site',
 *                embed_url:   'https://pre-sales-crm-mig.nakivo.site/nakivo/session-bootstrap/init?ret=...' } }
 *
 * >> The peer is **pre-sales-crm-mig.nakivo.site**, NOT the `subscription-crm-mig.nakivo.site` that
 *    the two hand-over guides name. That is why this class extends `MigPreSalePage`: the Pre-Sales
 *    sign-in and `presalesCallKw` it already owns address exactly that host, so the peer-side reads
 *    below reuse a session that is proven to work instead of opening a second one.
 *
 * WHAT IS VERIFIED AND WHAT IS NOT
 * --------------------------------
 * Everything under "CRM side" and "the embed action" was read off crm-mig on 2026-10-08 and is
 * grounded - the field names are the module's own (`ir.model.data` on
 * `nakivo_subscription_integration`).
 *
 * The embed-iframe block was explored live on 2026-10-09 and its selectors are measured too. The one
 * thing to know before using it: **the session bootstrap REUSES a peer session, it does not create
 * one**, so a browser with no peer cookie lands on `<peer>/web/login`. Sign in to the peer first in
 * the same context - `openSubscriptionsEmbed()` does it for you.
 */
export class SubscriptionPageMig extends MigPreSalePage {
  // ============================================================== what the delivery is (verified)

  /** CRM-side module that carries the whole integration. */
  static readonly INTEGRATION_MODULE = 'nakivo_subscription_integration';

  /** The client action the embed menus resolve to. */
  static readonly EMBED_ACTION_TAG = 'nakivo_remote_embed.embed';

  /** The peer that actually serves the subscription screens (NOT the host the guides name). */
  static readonly PEER_ORIGIN = 'https://pre-sales-crm-mig.nakivo.site';

  /**
   * XML ids of the Subscriptions menu tree - NOT numeric ids.
   *
   * The numeric ids this registry used to hold (root 1436, subscriptions 1437, section 1475,
   * toRenew 1476, products 1477, configuration 1478, stages 1480, closeReasons 1481, runs 1482)
   * were ALL re-issued by the crm-mig rebuild of 2026-10-13 and no longer exist: a read of
   * `ir.ui.menu` for those six ids returned 0 rows on 2026-10-15, and the menus now sit at
   * 430/431/615/616/617/618/620/621/622. A hardcoded id therefore either opens nothing or - worse -
   * opens whatever screen inherited that number.
   *
   * XML ids survive a rebuild, so the menu is resolved from one at run time via `BasePage.xmlId()`.
   */
  static readonly MENU_XMLID = {
    root: 'nakivo_subscription_integration.menu_subscriptions_root',
    subscriptionsSection: 'nakivo_subscription_integration.menu_subscriptions_section',
    subscriptions: 'nakivo_subscription_integration.menu_subscriptions_embed',
    toRenew: 'nakivo_subscription_integration.menu_subscriptions_to_renew',
    products: 'nakivo_subscription_integration.menu_subscription_products',
    configuration: 'nakivo_subscription_integration.menu_subscriptions_configuration',
    templates: 'nakivo_subscription_integration.menu_subscription_templates_embed',
    stages: 'nakivo_subscription_integration.menu_subscription_stages_embed',
    closeReasons: 'nakivo_subscription_integration.menu_close_reasons_embed',
    runs: 'nakivo_subscription_integration.menu_subscription_runs_embed',
  } as const;

  /** The `res.users` method behind each embed menu, as the menu's server action calls it. */
  static readonly EMBED_METHOD = {
    subscriptions: 'action_embed_subscriptions',
    toRenew: 'action_embed_subscriptions_to_renew',
    templates: 'action_embed_subscription_templates',
    stages: 'action_embed_subscription_stages',
    closeReasons: 'action_embed_close_reasons',
    runs: 'action_embed_subscription_runs',
  } as const;

  /**
   * The two CRM groups that gate the menu, addressed by XML id.
   *
   * THE NUMBERS MOVED (measured 2026-10-19). They were hardcoded as `{ see: 115, manage: 116 }`
   * from a 2026-10-09 reading. On crm-mig today:
   *     res.groups 115 - does not exist
   *     res.groups 116 - "Super User" (users 14, 48)
   *     nakivo_subscription_integration.group_see_subscriptions    -> 100000001
   *     nakivo_subscription_integration.group_manage_subscriptions -> 100000002 (implies 100000001)
   * So `hasSubscriptionGroup('manage')` was reading SUPER USER membership, and would have answered
   * "yes" for a super user who holds no subscription right at all - a negative case passing for the
   * wrong reason. Same failure mode as the menu and action ids after the 2026-10-13 rebuild; the
   * fix is the same, resolve from the XML id, which survives a rebuild.
   */
  static readonly GROUP_XMLID = {
    see: 'nakivo_subscription_integration.group_see_subscriptions',
    manage: 'nakivo_subscription_integration.group_manage_subscriptions',
  } as const;

  /** The remote models the embeds target, read off each action's `params.embed_target`. */
  static readonly REMOTE = {
    subscription: 'sale.subscription',
    template: 'sale.subscription.template',
  } as const;

  /** The Subscriptionable flag - a product shows under Subscriptions > Products when it is set. */
  static readonly SUBSCRIPTIONABLE_FIELD = 'nakivo_subscription_ok';

  /**
   * The Subscription smart button on a confirmed order, crm-mig shape (measured 2026-10-08).
   * Pre-production uses `action_open_subscriptions`; this instance does NOT.
   */
  static readonly SMART_BUTTON_SELECTOR = 'button[name="action_embed_remote_subscription"]';

  /** The five integration parameters, and the value each one carries today. */
  static readonly PARAM_KEYS: readonly string[] = [
    'nakivo_subscription_integration.invoice_mail_template',
    'nakivo_subscription_integration.reminder_mail_template',
    'nakivo_subscription_integration.payment_success_mail_template',
    'nakivo_subscription_integration.upsell_enabled',
    'nakivo_subscription_integration.settle_charge_at_once',
  ];

  constructor(page: Page) {
    super(page);
  }

  // ====================================================================== the embed action (verified)

  /**
   * Resolve one embed menu's action WITHOUT navigating, and hand back what it declares.
   *
   * This is the single call that proves where a screen really comes from, so a spec can assert the
   * peer and the target model instead of trusting the guides. It goes through the host's own
   * authenticated `call_kw` rather than `readKw`, because `readKw` is method-restricted by
   * construction and `action_embed_*` is not a read method.
   */
  async resolveEmbedAction(
    which: keyof typeof SubscriptionPageMig.EMBED_METHOD = 'subscriptions',
  ): Promise<{
    tag: string;
    peerOrigin: string;
    embedUrl: string;
    embedTarget: string;
    name: string;
  }> {
    const method = SubscriptionPageMig.EMBED_METHOD[which];
    const action = await this.page.evaluate(async (m) => {
      const r = await fetch('/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: { model: 'res.users', method: m, args: [], kwargs: {} },
        }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.data?.message || j.error.message);
      return j.result;
    }, method);

    return {
      tag: String(action?.tag ?? ''),
      peerOrigin: String(action?.context?.peer_origin ?? ''),
      embedUrl: String(action?.context?.embed_url ?? ''),
      embedTarget: String(action?.params?.embed_target ?? ''),
      name: String(action?.name ?? ''),
    };
  }

  // ============================================================================ CRM side (verified)

  /** Does the signed-in CRM user hold a subscription group? Drives the SC-33 / 1.4.3 negatives. */
  async hasSubscriptionGroup(which: 'see' | 'manage'): Promise<boolean> {
    const gid = await this.subscriptionGroupId(which);
    const rows = await this.readKw<any[]>('res.groups', 'read', [[gid], ['users']]);
    const uid = await this.page.evaluate(() => (window as any).odoo?.session_info?.uid);
    return Array.isArray(rows?.[0]?.users) && rows[0].users.includes(uid);
  }

  /** Resolve a subscription group's live id from its XML id - see GROUP_XMLID for why. */
  async subscriptionGroupId(which: 'see' | 'manage'): Promise<number> {
    return await this.xmlId(SubscriptionPageMig.GROUP_XMLID[which]);
  }

  /** The user ids a subscription group holds on the CRM, by XML id. */
  async subscriptionGroupMembers(which: 'see' | 'manage'): Promise<number[]> {
    const gid = await this.subscriptionGroupId(which);
    const rows = await this.readKw<any[]>('res.groups', 'read', [[gid], ['name', 'users', 'implied_ids']]);
    return Array.isArray(rows?.[0]?.users) ? rows[0].users as number[] : [];
  }

  /**
   * The Subscriptions menu ids this user may actually see - 0 rows means the menu is hidden.
   * Resolves each menu from its XML id first, so a rebuild that re-issues the numbers cannot turn
   * "the menu is hidden" and "the id no longer exists" into the same answer.
   */
  async visibleSubscriptionMenuIds(): Promise<number[]> {
    const ids: number[] = [];
    for (const xid of Object.values(SubscriptionPageMig.MENU_XMLID)) {
      const id = await this.xmlId(xid).catch(() => 0);
      if (id) ids.push(id);
    }
    if (!ids.length) return [];
    const rows = await this.readKw<any[]>('ir.ui.menu', 'search_read', [
      [['id', 'in', ids]], ['id', 'complete_name'],
    ], { limit: ids.length });
    return (rows || []).map((r) => r.id);
  }

  /**
   * What a confirmed order says about the subscription it pushed.
   *
   * `contract_remote_ref` is the SUB..... on the smart button, `contract_push_state` is the
   * "pending until the service accepts" state the guide describes, and `contract_push_message`
   * carries the reason the yellow banner shows on a refusal.
   */
  async getOrderSubscriptionLink(orderName: string): Promise<{
    ref: string | null;
    remoteId: number | null;
    pushState: string | null;
    pushMessage: string | null;
  } | null> {
    const rows = await this.readKw<any[]>('sale.order', 'search_read', [
      [['name', '=', orderName]],
      ['name', 'contract_remote_ref', 'contract_remote_id', 'contract_push_state', 'contract_push_message'],
    ], { limit: 1 });
    const r = rows?.[0];
    if (!r) return null;
    return {
      ref: r.contract_remote_ref || null,
      remoteId: r.contract_remote_id || null,
      pushState: r.contract_push_state || null,
      pushMessage: r.contract_push_message || null,
    };
  }

  /**
   * The Subscription smart button on a confirmed order - the crm-mig shape.
   *
   * Measured 2026-10-08 on SO217708: crm-mig renders
   * `button[name="action_embed_remote_subscription"]` with the text **"SUB00008 Subscription"** -
   * the REFERENCE and a SINGULAR label. Pre-production renders
   * `button[name="action_open_subscriptions"]` with a COUNT and the plural label, which is why
   * `QuotationPage.getSubscriptionsSmartButtonCount()` returns 0 here and makes a healthy order look
   * like a product defect. (It did exactly that for four runs on 2026-10-08.)
   *
   * @returns the reference shown on the button, or '' when the button is absent.
   */
  async getSubscriptionSmartButtonRef(): Promise<string> {
    const btn = this.page.locator(SubscriptionPageMig.SMART_BUTTON_SELECTOR).first();
    if (!(await btn.count().catch(() => 0))) return '';
    const raw = await btn.innerText().catch(() => '');
    const m = (raw || '').match(/SUB\d+/i);
    return m ? m[0].toUpperCase() : '';
  }

  /** Is the Subscription smart button on screen at all? */
  async hasSubscriptionSmartButton(): Promise<boolean> {
    const btn = this.page.locator(SubscriptionPageMig.SMART_BUTTON_SELECTOR).first();
    return (await btn.count().catch(() => 0)) > 0 && (await btn.isVisible().catch(() => false));
  }

  /**
   * The same read as `getOrderSubscriptionLink`, but keyed on the order's **id**.
   *
   * Prefer this. The by-name variant is only as good as the name it is handed, and
   * `pressNewQuotationOnO12CE` can resolve the quotation's id while leaving its name empty - which
   * silently turns the lookup into `[['name','=','']]`, i.e. no rows, i.e. "no subscription", for
   * as long as you are willing to poll.
   */
  async getOrderSubscriptionLinkById(orderId: number | string): Promise<{
    ref: string | null;
    remoteId: number | null;
    pushState: string | null;
    pushMessage: string | null;
    name: string | null;
  } | null> {
    const rows = await this.readKw<any[]>('sale.order', 'read', [
      [Number(orderId)],
      ['name', 'contract_remote_ref', 'contract_remote_id', 'contract_push_state', 'contract_push_message'],
    ]);
    const r = rows?.[0];
    if (!r) return null;
    return {
      ref: r.contract_remote_ref || null,
      remoteId: r.contract_remote_id || null,
      pushState: r.contract_push_state || null,
      pushMessage: r.contract_push_message || null,
      name: r.name || null,
    };
  }

  /** `waitForSubscriptionPush`, keyed on the order id. Use this one. */
  async waitForSubscriptionPushById(
    orderId: number | string,
    timeout = CommonUtils.waitTimes.abnormalWait * 4,
  ): Promise<{ ref: string | null; pushState: string | null; pushMessage: string | null; waitedMs: number }> {
    const started = Date.now();
    let last: { ref: string | null; pushState: string | null; pushMessage: string | null } = {
      ref: null, pushState: null, pushMessage: null,
    };
    while (Date.now() - started < timeout) {
      const link = await this.getOrderSubscriptionLinkById(orderId);
      if (link) {
        last = { ref: link.ref, pushState: link.pushState, pushMessage: link.pushMessage };
        if (link.ref) break;
      }
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
    }
    return { ...last, waitedMs: Date.now() - started };
  }

  /**
   * Wait until the CRM has finished pushing the order's subscription to the peer.
   *
   * Confirming an order does NOT create the subscription synchronously: the CRM queues the push as a
   * job, so `contract_remote_ref` is empty and `contract_push_state` reads *pending* for a while
   * after CONFIRM returns. Reading either one straight after the click is simply too early - that is
   * what the guides mean by "the order is confirmed at once, whether or not the subscription service
   * answers".
   *
   * Resolves as soon as a reference appears, or when the push reports a terminal failure state (so a
   * refusal is reported as a refusal, not as a timeout). Returns the last state it saw.
   */
  async waitForSubscriptionPush(
    orderName: string,
    timeout = CommonUtils.waitTimes.abnormalWait * 4,
  ): Promise<{ ref: string | null; pushState: string | null; pushMessage: string | null; waitedMs: number }> {
    const started = Date.now();
    let last: { ref: string | null; pushState: string | null; pushMessage: string | null } = {
      ref: null, pushState: null, pushMessage: null,
    };
    while (Date.now() - started < timeout) {
      const link = await this.getOrderSubscriptionLink(orderName);
      if (link) {
        last = { ref: link.ref, pushState: link.pushState, pushMessage: link.pushMessage };
        if (link.ref) break;
        if (link.pushState && !['pending', 'draft', 'queued', false as any].includes(link.pushState)) break;
      }
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
    }
    return { ...last, waitedMs: Date.now() - started };
  }

  /** The number behind a customer's "Subscriptions" smart button. */
  async getPartnerSubscriptionCount(partnerId: number): Promise<number> {
    const rows = await this.readKw<any[]>('res.partner', 'read', [[partnerId], ['subscription_count']]);
    return Number(rows?.[0]?.subscription_count ?? 0);
  }

  /**
   * Invoices the subscription service asked the CRM to raise.
   *
   * `subscription_request_key` is the idempotency key, shaped `SUB00008/<md5>` - ONE key per billed
   * period. That is what makes "one period, one invoice" assertable: two invoices for one period
   * would have to share a key.
   */
  async listSubscriptionInvoices(extraDomain: any[] = [], limit = 100): Promise<Array<{
    id: number; number: string | false; state: string;
    subscriptionRemoteId: number | null; requestKey: string; dateInvoice: string; amountTotal: number;
  }>> {
    const rows = await this.readKw<any[]>('account.invoice', 'search_read', [
      [['subscription_request_key', '!=', false], ...extraDomain],
      ['number', 'state', 'subscription_remote_id', 'subscription_request_key', 'date_invoice', 'amount_total'],
    ], { limit, order: 'id desc' });
    return (rows || []).map((r) => ({
      id: r.id,
      number: r.number,
      state: r.state,
      subscriptionRemoteId: r.subscription_remote_id || null,
      requestKey: String(r.subscription_request_key || ''),
      dateInvoice: String(r.date_invoice || ''),
      amountTotal: Number(r.amount_total ?? 0),
    }));
  }

  /** The period key of an invoice, i.e. everything after `SUB...../`. */
  static periodKeyOf(requestKey: string): string {
    const i = requestKey.indexOf('/');
    return i < 0 ? requestKey : requestKey.slice(i + 1);
  }

  /**
   * The order lines of a sale.order, each with its SKU and whether that product is Subscriptionable.
   *
   * Use it to PIN what a spec actually put on the order. The Deal Element's product picker reports
   * its own label rather than the product it resolved, so a spec that trusts the picker can assert
   * "no subscription was created" while quietly having added the wrong product - a negative case
   * that passes for the wrong reason.
   */
  async getOrderLineProductFlags(orderId: number | string): Promise<Array<{
    sku: string; name: string; subscriptionable: boolean; qty: number;
  }>> {
    const lines = await this.readKw<any[]>('sale.order.line', 'search_read', [
      [['order_id', '=', Number(orderId)]], ['product_id', 'product_uom_qty'],
    ], { limit: 50 });
    const ids = (lines || []).map((l) => l.product_id?.[0]).filter(Boolean);
    if (!ids.length) return [];
    const prods = await this.readKw<any[]>('product.product', 'read', [
      ids, ['default_code', 'name', SubscriptionPageMig.SUBSCRIPTIONABLE_FIELD],
    ]);
    const byId = new Map<number, any>((prods || []).map((p) => [p.id, p]));
    return (lines || []).map((l) => {
      const p = byId.get(l.product_id?.[0]) || {};
      return {
        sku: String(p.default_code ?? ''),
        name: String(p.name ?? l.product_id?.[1] ?? ''),
        subscriptionable: Boolean(p[SubscriptionPageMig.SUBSCRIPTIONABLE_FIELD]),
        qty: Number(l.product_uom_qty ?? 0),
      };
    });
  }

  /** Products carrying the Subscriptionable flag - exactly what Subscriptions > Products lists. */
  async listSubscriptionableProducts(limit = 100): Promise<Array<{ sku: string; name: string }>> {
    const rows = await this.readKw<any[]>('product.template', 'search_read', [
      [[SubscriptionPageMig.SUBSCRIPTIONABLE_FIELD, '=', true]],
      ['default_code', 'name'],
    ], { limit, order: 'default_code asc' });
    return (rows || []).map((r) => ({ sku: String(r.default_code || ''), name: String(r.name || '') }));
  }

  /** The five integration parameters as a key -> value map. */
  async getIntegrationParams(): Promise<Record<string, string>> {
    const rows = await this.readKw<any[]>('ir.config_parameter', 'search_read', [
      [['key', 'in', SubscriptionPageMig.PARAM_KEYS]], ['key', 'value'],
    ], { limit: SubscriptionPageMig.PARAM_KEYS.length });
    const out: Record<string, string> = {};
    for (const r of rows || []) out[String(r.key)] = String(r.value);
    return out;
  }

  // ========================================================================= peer side (verified RPC)

  /**
   * Read a subscription on the peer by its reference. Requires `loginPresales()` first - the peer
   * is the Pre-Sales Application host, so the session that class opens is the session used here.
   */
  async remoteSubscriptionByRef(ref: string, fields: string[] = []): Promise<any | null> {
    const rows = await this.presalesCallKw<any[]>(
      SubscriptionPageMig.REMOTE.subscription, 'search_read',
      [[['code', '=', ref]], fields],
      { limit: 1 },
    );
    return rows?.[0] ?? null;
  }

  /** Every active subscription template on the peer, with the settings SC-04 checks. */
  async remoteTemplates(fields: string[] = []): Promise<any[]> {
    return await this.presalesCallKw<any[]>(
      SubscriptionPageMig.REMOTE.template, 'search_read',
      [[], fields],
      { limit: 50, order: 'name asc' },
    );
  }

  // ======================================================== the embed iframe (explored 2026-10-08)
  //
  // Measured on the live screen, signed in to the CRM as anh.ho@nakivo.com:
  //   - the client action mounts ONE element, `iframe.o_nakivo_embed_frame`, whose src is the
  //     bootstrap init URL on the peer;
  //   - the peer frame appears in page.frames() within ~5s - NOT immediately, which is why
  //     `isEmbedMounted` waits for the FRAME and never for the element (waiting for the element
  //     returns true while the frame is still about:blank, a false positive);
  //   - with the bootstrap failing (see below) the frame lands on
  //     `<peer>/web/login?redirect=/nakivo/embed/open?model=...` and renders Odoo's login form.

  /** The element the client action mounts the peer screen into. */
  static readonly EMBED_FRAME_SELECTOR = 'iframe.o_nakivo_embed_frame';

  // ------------------------------------------------ driving the embed (explored 2026-10-09)
  //
  // The embed renders the PEER's Odoo 19 UI inside `iframe.o_nakivo_embed_frame`. Two things make
  // it drivable, and both were measured:
  //
  //  1. THE BOOTSTRAP REUSES A PEER SESSION, IT DOES NOT CREATE ONE. From a browser with no peer
  //     cookie the frame lands on `<peer>/web/login`. Sign in to the peer FIRST in the same context
  //     - `loginPresales()` authenticates through this context's own request object, so its
  //     `session_id` cookie is in the jar the iframe uses - and the frame then lands on the real
  //     screen (`/odoo/sale.subscription`). `openSubscriptionsEmbed()` does this for you.
  //  2. THE ROOT MENU HAS NO ACTION. `#menu_id=1436` loads nothing; use 1437 (`subscriptions`).
  //
  // Controls, read off the live screen:
  //   list : New  -> `button.o-kanban-button-new` (kanban) / `.o_list_button_add` (list)
  //   form : save -> `button.o_form_button_save`   (the CLOUD icon, aria-label "Save manually")
  //          discard -> `button.o_form_button_cancel`
  //   form fields: remote_partner_id (Customer), remote_pricelist_id (Pricelist), template_id,
  //          date_start, user_id, crm_team_id, recurring_next_date, to_renew,
  //          subscription_reminder, sale_subscription_line_ids, stage_id

  /** The New button on the embedded Subscriptions list - the crm-mig stand-in for pre-prod CREATE. */
  static readonly EMBED_NEW_SELECTOR = 'button.o-kanban-button-new, button.o_list_button_add, button.o_form_button_create';

  /** The cloud save icon on the embedded form - the crm-mig stand-in for pre-prod SAVE. */
  static readonly EMBED_SAVE_SELECTOR = 'button.o_form_button_save';

  /** Discard, for a form a spec decided not to keep. */
  static readonly EMBED_DISCARD_SELECTOR = 'button.o_form_button_cancel';

  /**
   * Open the Subscriptions embed and hand back the peer frame, ready to drive.
   *
   * Signs in to the peer first (see note 1 above) unless a session is already open.
   * @throws when the frame never leaves the peer's login page - that is a real finding, not a wait
   *         that should be extended.
   */
  async openSubscriptionsEmbed(
    which: keyof typeof SubscriptionPageMig.MENU_XMLID = 'subscriptions',
    timeout = CommonUtils.waitTimes.abnormalWait * 2,
  ): Promise<Frame> {
    try {
      this.presalesSessionUid();
    } catch {
      await this.loginPresales();
    }
    const deadline = Date.now() + timeout;
    let last = '';

    // Two attempts: the client action sometimes mounts the iframe element and never navigates it.
    // Re-applying the hash (second pass) is cheaper and more honest than stretching the wait.
    for (let attempt = 1; attempt <= 2 && Date.now() < deadline; attempt++) {
      await this.openEmbedMenu(which);
      // the element appears first, well before the frame joins the frame tree
      await this.page
        .locator(SubscriptionPageMig.EMBED_FRAME_SELECTOR)
        .first()
        .waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait })
        .catch(() => {});

      const attemptEnd = Math.min(deadline, Date.now() + timeout / 2);
      while (Date.now() < attemptEnd) {
        const f = this.page.frames().find((fr) => fr.url().includes('pre-sales-crm-mig'));
        if (f) {
          last = f.url();
          if (!last.includes('/web/login')) {
            await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
            return f;
          }
        }
        await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 2);
      }
      if (attempt === 1) {
        console.log('  - embed frame did not join the frame tree; re-applying the menu hash once');
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
      }
    }
    throw new Error(
      last.includes('/web/login')
        ? `The Subscriptions embed is showing the peer's SIGN-IN page (${last}). For a valid CRM user ` +
          'that is a finding worth reporting, not a timeout to extend.'
        : 'The Subscriptions embed never loaded a peer frame.',
    );
  }

  /** Click New on the embedded list (or form) - the stand-in for pre-prod CREATE. */
  async clickNewInEmbed(frame: Frame): Promise<void> {
    const btn = frame.locator(SubscriptionPageMig.EMBED_NEW_SELECTOR).first();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await frame.waitForURL(/sale\.subscription\/new|sale\.subscription\/\d+/, { timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 2);
  }

  /**
   * Save the embedded form with the CLOUD icon - the stand-in for pre-prod SAVE.
   * Returns the Reference the record ended up with, normalised to bare `SUB<digits>`.
   *
   * WAS A BUG (fixed 2026-10-16). This read `[name="name"]` and returned its `innerText()` raw.
   * Two things were wrong with that and together they are why `search_read code = <ref>` found
   * nothing straight afterwards:
   *  - `name` is NOT the Reference. Measured on the peer (`pre-sales-crm-mig`, db `odoo19`,
   *    2026-10-16): `code` is `string: "Reference"` and `name` is `string: "Name"`. They happen to
   *    carry the same text on the migrated corpus, which is exactly why the mistake survived.
   *  - the returned text was NOT normalised, so a wrapper that renders "SUB00077 - Customer Ltd"
   *    was passed verbatim into a `['code','=',ref]` domain, which matches nothing.
   * The reference now comes from `getEmbedReference()` (the breadcrumb, the one source measured to
   * carry it), with the two field wrappers as fallbacks, and every path goes through the same
   * `/SUB\d+/` extraction. See `embedRecordId()` for why the id no longer depends on this at all.
   */
  async saveInEmbed(frame: Frame): Promise<string> {
    const btn = frame.locator(SubscriptionPageMig.EMBED_SAVE_SELECTOR).first();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    // the save icon disappears once there is nothing dirty left to save
    await btn.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.savingPage }).catch(() => {});
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 2);
    return await this.readEmbedReference(frame);
  }

  /**
   * The Reference the embedded form is showing, from whichever of the three measured places has it.
   *
   * Every read is BOUNDED and every result goes through the same `/SUB\d+/` extraction, so a
   * breadcrumb like "SUB00077 - Customer Ltd" can never reach an `=` domain as-is. Returns '' when
   * the form carries no reference - that is a finding for the caller to report, not a value to
   * guess at.
   */
  async readEmbedReference(frame: Frame): Promise<string> {
    const fromCrumb = await this.getEmbedReference(frame);
    if (fromCrumb) return fromCrumb;

    // `[name="code"]` matched nothing on 2026-10-09, but it is the field that actually holds the
    // Reference, so try it before `name` rather than instead of it.
    for (const field of ['code', 'name']) {
      const wrapper = frame.locator(`[name="${field}"]`).first();
      if (!(await wrapper.count().catch(() => 0))) continue;
      // a Char field renders as an <input>: innerText() on its wrapper is '' - read the value too
      const text = await wrapper.innerText({ timeout: CommonUtils.waitTimes.long }).catch(() => '');
      const value = await wrapper.locator('input').first()
        .inputValue({ timeout: CommonUtils.waitTimes.long }).catch(() => '');
      const m = `${text} ${value}`.match(/SUB\d+/i);
      if (m) return m[0].toUpperCase();
    }
    return '';
  }

  /**
   * The `sale.subscription` id the embedded form is on, taken from the frame URL.
   *
   * THIS, NOT THE REFERENCE, IS HOW A CALLER SHOULD GET AN ID. Odoo 19 puts the id in the path
   * (`/odoo/sale.subscription/<id>`) the moment the record is created, so it is available without
   * an RPC, without a session of its own and without depending on which field carries the
   * Reference. `createSubscriptionViaEmbed` used to resolve the id by searching `code`, and when
   * that search came back empty the fixture had no id at all - which is how SUB00074/75/77/78 were
   * left on the peer with nothing to delete them by. Returns null while the form is still on
   * `/new`.
   */
  embedRecordId(frame: Frame): number | null {
    const m = frame.url().match(/sale\.subscription\/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  /**
   * Poll the frame URL until it carries a saved record's id. Bounded; returns null on expiry so the
   * caller can report what it saw instead of hanging to the test timeout.
   */
  async waitForEmbedRecordId(
    frame: Frame,
    timeout = CommonUtils.waitTimes.savingPage,
  ): Promise<number | null> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const id = this.embedRecordId(frame);
      if (id) return id;
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    return null;
  }

  /** Discard an embedded form the spec decided not to keep. */
  async discardInEmbed(frame: Frame): Promise<void> {
    const btn = frame.locator(SubscriptionPageMig.EMBED_DISCARD_SELECTOR).first();
    if (await btn.count().catch(() => 0)) {
      await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 2);
    }
  }

  /**
   * Fill a many2one on the embedded form by typing and picking the filtered option.
   *
   * SETTLE FIRST. Picking the Customer fires an onchange that re-draws the rest of the header, so
   * the NEXT many2one's input exists but keeps failing Playwright's "visible, enabled and stable"
   * check while the form re-renders. On 2026-10-09 that cost a 15-minute test timeout on
   * `template_id` (1614 stability retries) - and because `.click()` carried no timeout, it hung
   * instead of failing. Every action here is now bounded, and the click gets one retry after a
   * pause rather than one unbounded wait.
   */
  async fillEmbedMany2One(frame: Frame, fieldName: string, value: string): Promise<void> {
    const input = frame.locator(`[name="${fieldName}"] input`).first();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 2);
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(async () => {
      console.log(`  - "${fieldName}" was still re-rendering; settling once and retrying the click`);
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 5);
      await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    });
    await input.fill(value, { timeout: CommonUtils.waitTimes.abnormalWait });
    const option = frame.locator('.o-autocomplete--dropdown-item, .ui-menu-item, li.o_m2o_dropdown_option')
      .filter({ hasText: new RegExp(value.replace(/[[\]\\^$.|?*+(){}]/g, '\\$&'), 'i') }).first();
    const picked = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.long })
      .then(() => true).catch(() => false);
    if (picked) await option.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    else await frame.locator(`[name="${fieldName}"] input`).first().press('Enter', { timeout: CommonUtils.waitTimes.abnormalWait });
    // let the onchange this selection fires finish before the caller touches the next field
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
  }

  /** Read a field's rendered value off the embedded form. */
  async readEmbedField(frame: Frame, fieldName: string): Promise<string> {
    // EVERY call here carries an explicit timeout. This project sets no `actionTimeout` in
    // playwright.config.ts, so Playwright's default (0 = wait forever) applies: an unbounded
    // `innerText()` / `inputValue()` on a locator that never resolves does not return "" - it hangs
    // until the TEST timeout, and the run then reads as "step 4 is slow" instead of "that field is
    // not on this screen". Measured 2026-10-09 on `payment_token_id`.
    const t = CommonUtils.waitTimes.long * 2; // 4 s - a field that is on screen resolves at once
    const host = frame.locator(`[name="${fieldName}"]`).first();
    const text = (await host.innerText({ timeout: t }).catch(() => '')).trim();
    if (text) return text;
    // An EDITABLE field renders as <input>/<textarea>, whose innerText is always "" - read the
    // VALUE instead. Measured 2026-10-09: `template_id` on the embedded form is `input#template_id_0`,
    // so the innerText-only reader returned "" for a field the screenshot shows filled, and VP3 of
    // CRM-11806_1.5.3 would have gone red on the reader rather than on the product.
    const val = await host.locator('input, textarea').first().inputValue({ timeout: t }).catch(() => '');
    if (val.trim()) return val.trim();
    // a date renders as `button.o_daterange_start`, not an input
    return (await host.locator('button').first().innerText({ timeout: t }).catch(() => '')).trim();
  }

  /**
   * Type into a plain input or a DATE field on the embedded form.
   *
   * Odoo 19 renders a date as a `button.o_daterange_start` showing the formatted value, not as an
   * input - waiting for `[name="date_start"] input` times out on a field that is plainly on screen.
   * Click the button first; the input appears underneath it.
   */
  async fillEmbedField(frame: Frame, fieldName: string, value: string): Promise<void> {
    const field = frame.locator(`[name="${fieldName}"]`).first();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

    const dateBtn = field.locator('button.o_daterange_start, button.o_input').first();
    if (await dateBtn.count().catch(() => 0)) {
      await dateBtn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    }

    const input = field.locator('input').first();
    const ready = await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.long })
      .then(() => true).catch(() => false);
    if (!ready) {
      console.log(`  - "${fieldName}" exposes no input to type into - left as the form rendered it`);
      return;
    }
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill(value, { timeout: CommonUtils.waitTimes.abnormalWait });
    await input.press('Escape', { timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
  }

  /** Tick or untick a boolean on the embedded form (To Renew, Subscription Reminder, ...). */
  async setEmbedCheckbox(frame: Frame, fieldName: string, checked: boolean): Promise<void> {
    const box = frame.locator(`[name="${fieldName}"] input[type="checkbox"]`).first();
    await box.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    if ((await box.isChecked().catch(() => false)) !== checked) {
      await box.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
  }

  /**
   * The product many2one on a Subscription LINE is **`remote_product_id`**, not `product_id`.
   *
   * MEASURED, not guessed (2026-10-09, DOM dump of the row after "Add a line"): the editing row is
   * `tr.o_data_row.o_selected_row` and its first cell is
   * `td[name="remote_product_id"] > div.o_field_many2one_link > ... > input.o-autocomplete--input`.
   * The row's cells are `remote_product_id | name | product_uom_qty | product_uom_id | price_unit |
   * discount | price_subtotal`. **There is no `product_id` anywhere on the row** - which is why the
   * three earlier attempts all expired at 30 s on a field the screenshot showed blinking: they were
   * waiting for a field name this model does not use.
   */
  static readonly EMBED_LINE_PRODUCT_FIELD = 'remote_product_id';

  /**
   * Add one Subscription line inside the embed: open the tab, click "Add a line", pick the product
   * and set the quantity. Types the SKU first so the dropdown is already filtered - the same reason
   * `DealElementPage.addProductBySku` exists.
   */
  async addEmbedSubscriptionLine(frame: Frame, sku: string, quantity?: number): Promise<void> {
    await frame.locator('a.nav-link, button.nav-link').filter({ hasText: /Subscription lines/i })
      .first().click({ timeout: CommonUtils.waitTimes.long }).catch(() => {});
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);

    await frame.locator('.o_field_x2many_list_row_add a, a:has-text("Add a line")').first()
      .click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);

    // Scope to the row Odoo put into edit mode AND to the field name the peer actually uses.
    const row = frame.locator('tr.o_data_row.o_selected_row').first();
    await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const input = row.locator(`[name="${SubscriptionPageMig.EMBED_LINE_PRODUCT_FIELD}"] input`).first();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill(sku, { timeout: CommonUtils.waitTimes.abnormalWait });
    const escaped = sku.replace(/[[\]\\^$.|?*+(){}]/g, '\\$&');
    const option = frame.locator('.o-autocomplete--dropdown-item, .ui-menu-item, li.o_m2o_dropdown_option')
      .filter({ hasText: new RegExp(escaped, 'i') }).first();
    const picked = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.long })
      .then(() => true).catch(() => false);
    if (picked) await option.click({ timeout: CommonUtils.waitTimes.abnormalWait }); else await input.press('Enter', { timeout: CommonUtils.waitTimes.abnormalWait });
    // picking the product refills the row (description, uom, price), so let it settle before qty
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 2);

    if (quantity !== undefined) {
      const qty = row.locator('[name="product_uom_qty"] input').first();
      await qty.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await qty.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await qty.fill(String(quantity));
      await qty.press('Tab', { timeout: CommonUtils.waitTimes.abnormalWait });
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
  }

  /**
   * Wait until the embedded SUBSCRIPTION FORM has actually rendered, before any short-bounded read.
   *
   * The readers here are bounded at a few seconds on purpose (an unbounded read on the peer's
   * sign-in page hangs to the test timeout). That bound is too tight for the FIRST read after the
   * embed mounts: on 2026-10-09 `getEmbedStage` returned "" ten seconds after the smart button was
   * clicked, and the status bar was fine - the frame simply had not finished. Wait for the form,
   * then read. Returns false when the frame is showing the peer's sign-in page instead, which is a
   * finding to report, not a wait to extend.
   */
  async waitForEmbedFormReady(frame: Frame, timeout = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    if (/\/web\/login/.test(frame.url())) return false;
    const form = frame.locator('.o_statusbar_status, [name="remote_partner_id"], .o_form_renderer').first();
    return await form.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  /**
   * The Reference of the subscription the embed is showing.
   *
   * `code` is NOT a field on this form - measured 2026-10-09, `[name="code"]` matches nothing. The
   * reference lives in the breadcrumb, which reads "SUB00008 - 0123456789".
   */
  async getEmbedReference(frame: Frame): Promise<string> {
    const crumb = await frame.locator('.o_breadcrumb, .o_control_panel').first()
      .innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => '');
    const m = (crumb || '').match(/SUB\d+/i);
    return m ? m[0].toUpperCase() : '';
  }

  /** Click a stage on the embedded form's status bar (Draft / In Progress / To Upsell / Closed). */
  async setEmbedStage(frame: Frame, stage: string): Promise<void> {
    const btn = frame.locator('button.o_arrow_button').filter({ hasText: new RegExp(`^${stage}$`, 'i') }).first();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
  }

  /**
   * The stage the embedded form is currently on.
   *
   * BOUNDED on purpose. This repo sets no `actionTimeout`, so Playwright's default (0 = forever)
   * applies: called on a frame that is showing the peer's SIGN-IN page - which is what the embed
   * actually renders for a user with no peer session - an unbounded `innerText()` does not return
   * '', it hangs until the TEST timeout and the run reads as "slow embed" instead of "no stage bar
   * here". Measured 2026-10-09.
   */
  async getEmbedStage(frame: Frame): Promise<string> {
    const active = frame.locator('button.o_arrow_button.o_arrow_button_current, .o_statusbar_status button[aria-checked="true"]').first();
    return (await active.innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => '')).trim();
  }

  /**
   * Open an embed menu by its menu id.
   *
   * **Do not set `window.location.hash` and hope.** The Odoo web client picks up `hashchange`
   * unreliably here: the run either lands on the menu or sits on whatever the post-login landing app
   * was (Discuss), with no error and no iframe - which reads exactly like "the embed is flaky" and
   * cost a wrong diagnosis on 2026-10-09. Set the hash and RELOAD, so the client boots with the
   * menu already in the URL, then confirm the hash really is what we asked for.
   */
  async openEmbedMenu(which: keyof typeof SubscriptionPageMig.MENU_XMLID = 'subscriptions'): Promise<void> {
    const id = await this.xmlId(SubscriptionPageMig.MENU_XMLID[which]);
    const target = `${baseUrl_mig}web#menu_id=${id}`;

    await this.page.goto(target, { waitUntil: 'domcontentloaded' }).catch(() => {});
    if (!this.page.url().includes(`menu_id=${id}`)) {
      await this.page.evaluate((menuId) => { window.location.hash = `menu_id=${menuId}`; }, id);
    }
    // a hash-only change does not reload; boot the client WITH the hash in place
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);

    if (!this.page.url().includes(`menu_id=${id}`)) {
      console.log(`  - WARNING: the client did not keep menu_id=${id}; URL is ${this.page.url()}`);
    }
  }

  /** The cross-origin frame the client action mounts the peer screen into. */
  embedFrame(): FrameLocator {
    return this.page.frameLocator(SubscriptionPageMig.EMBED_FRAME_SELECTOR);
  }

  /**
   * Wait until the PEER frame really exists in the frame tree, and hand back its URL.
   *
   * Waiting for the iframe ELEMENT is not enough - it is attached long before it navigates, so an
   * element-only wait reports a mounted embed while the frame is still blank.
   */
  async waitForEmbedPeerFrame(timeout = CommonUtils.waitTimes.abnormalWait): Promise<string | null> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const f = this.page.frames().find((fr) => fr.url().includes('pre-sales-crm-mig'));
      if (f) return f.url();
      await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    return null;
  }

  /** Is the peer frame loaded at all? (Says nothing about whether it is authenticated.) */
  async isEmbedMounted(timeout = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    return (await this.waitForEmbedPeerFrame(timeout)) !== null;
  }

  /**
   * Does the embed ask for a second sign-in? **A login page inside the CRM page for a valid user is
   * a FAIL for SC-31 / CRM-11806_1.9.2** - the card says to report it, not to fix it.
   *
   * Measured 2026-10-08: this returns TRUE on crm-mig. The same bootstrap URL opened at TOP LEVEL in
   * the same browser lands on the same login page, so it is NOT a cross-site-cookie artifact of the
   * automation browser - the session bootstrap itself does not establish a peer session.
   */
  async embedShowsLoginPrompt(): Promise<boolean> {
    const url = await this.waitForEmbedPeerFrame();
    if (!url) return false;
    if (url.includes('/web/login')) return true;
    const frame = this.page.frames().find((fr) => fr.url() === url);
    if (!frame) return false;
    return await frame
      .evaluate(() => !!document.querySelector('form.oe_login_form, input[name="password"]'))
      .catch(() => false);
  }
}
