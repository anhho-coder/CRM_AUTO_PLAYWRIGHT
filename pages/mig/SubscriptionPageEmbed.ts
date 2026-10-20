import { Frame, Page } from '@playwright/test';
import { SubscriptionPageMig } from './SubscriptionPageMig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Drop-in replacement for the PRE-PRODUCTION `SubscriptionPage`, driving the crm-mig EMBED.
 *
 * WHY THIS EXISTS
 * ---------------
 * 29 of the 31 blocked CRM-11806 specs import `SubscriptionPage` from `@pages` and drive the native
 * Odoo 12 `sale.subscription` screens. crm-mig does not have that module: the subscription lives on
 * the peer (`pre-sales-crm-mig.nakivo.site`, db `odoo19`) and the CRM renders it inside
 * `iframe.o_nakivo_embed_frame`. Measured 2026-10-16, two of those specs fail with exactly that:
 *
 *     BasePage.xmlId: "sale_subscription.sale_subscription_action" does not exist on
 *     crm-mig.nakivo.site. The module is not installed there.
 *
 * Their `@blocked-devrun` / `@blocked-mail` labels describe the SECOND blocker. This is the first.
 *
 * HOW TO USE IT
 * -------------
 * One line per spec, the same alias trick that fixed the pre-production leak - the body does not
 * change:
 *
 *     import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
 *
 * WHAT IS AND IS NOT PORTED
 * -------------------------
 * Every method below was measured on the live embed in this session. Everything else throws
 * `notPorted()` with the method name, **on purpose**: a stub that returned `''` or `0` would turn a
 * missing capability into a green tick. CRM-11806_1.5 already showed what that looks like - it
 * "passed" while every step was a placeholder. A loud failure naming the method is the only honest
 * default.
 */
export class SubscriptionPageEmbed {
  private readonly subs: SubscriptionPageMig;
  private frame: Frame | null = null;

  constructor(private readonly page: Page) {
    this.subs = new SubscriptionPageMig(page);
  }

  /** Pre-prod field name -> the peer's. Measured: the embed form uses `remote_*` for these two. */
  private static readonly FIELD_MAP: Record<string, string> = {
    partner_id: 'remote_partner_id',
    pricelist_id: 'remote_pricelist_id',
  };

  // Signatures accept anything and return `any` ON PURPOSE: a compile error here would block
  // the whole repo, not just this suite. The failure is deferred to run time, where it is LOUD and
  // names the method - never a silent '' that would turn a missing capability into a green tick.
  private notPorted(method: string): never {
    throw new Error(
      `SubscriptionPageEmbed.${method}() is NOT ported to the crm-mig embed yet.\n` +
      'The pre-production SubscriptionPage drives the native sale.subscription screens, which do ' +
      'not exist on crm-mig - the record lives on the peer behind iframe.o_nakivo_embed_frame.\n' +
      'Port this method against the embed (dump the control first, do not guess a selector) and ' +
      'add it here. Returning an empty value instead would make the spec pass without checking ' +
      'anything.',
    );
  }

  /** The live embed frame, opened on first use. */
  private async f(): Promise<Frame> {
    if (!this.frame) this.frame = await this.subs.openSubscriptionsEmbed();
    return this.frame;
  }

  // ---------------------------------------------------------------- navigation

  async openSubscriptionsList(): Promise<void> {
    this.frame = await this.subs.openSubscriptionsEmbed();
  }

  /** `_timeout` is accepted for signature compatibility with the pre-production page object. */
  async waitForLoaded(_timeout?: number): Promise<void> {
    const fr = await this.f();
    const ready = await this.subs.waitForEmbedFormReady(fr);
    if (!ready) {
      throw new Error(
        'SubscriptionPageEmbed.waitForLoaded(): the embed did not render a subscription form. ' +
        `Frame URL: ${fr.url()}. A /web/login there is the SC-31 finding, not a wait to extend.`,
      );
    }
  }

  /** Open a subscription by the peer's own record URL. */
  async openByUrl(url: string): Promise<void> {
    const fr = await this.f();
    await fr.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
  }

  // ---------------------------------------------------------------- create / edit

  async clickCreate(): Promise<void> {
    await this.subs.clickNewInEmbed(await this.f());
  }

  async fillMany2One(field: string, value: string, _createIfMissing = false): Promise<void> {
    const mapped = SubscriptionPageEmbed.FIELD_MAP[field] ?? field;
    await this.subs.fillEmbedMany2One(await this.f(), mapped, value);
  }

  async addSubscriptionLine(sku: string, quantity?: number): Promise<void> {
    await this.subs.addEmbedSubscriptionLine(await this.f(), sku, quantity);
  }

  async save(): Promise<string> {
    return await this.subs.saveInEmbed(await this.f());
  }

  async setStage(stage: string): Promise<void> {
    await this.subs.setEmbedStage(await this.f(), stage);
  }

  async setCheckbox(field: string, checked: boolean): Promise<void> {
    await this.subs.setEmbedCheckbox(await this.f(), field, checked);
  }

  // ---------------------------------------------------------------- readers

  async getCode(): Promise<string> {
    return await this.subs.getEmbedReference(await this.f());
  }

  async getState(): Promise<string> {
    return await this.subs.getEmbedStage(await this.f());
  }

  async getCustomer(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'remote_partner_id');
  }

  async getPricelist(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'remote_pricelist_id');
  }

  async getSubscriptionTemplate(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'template_id');
  }

  async getDateOfNextInvoice(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'recurring_next_date');
  }

  async getStartDate(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'date_start');
  }

  async getPaymentToken(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'payment_token_id');
  }

  async getSalesperson(): Promise<string> {
    return await this.subs.readEmbedField(await this.f(), 'user_id');
  }

  /**
   * The "Invoices" smart button count. Measured: the embed renders
   * `button[name="action_open_source_invoices"]` with text like "2 Invoices"; those invoices are
   * CRM-side (`sale.subscription.source_invoice_count`), the peer's own account.move is empty.
   */
  async getInvoiceCount(): Promise<number> {
    const fr = await this.f();
    const btn = fr.locator('button[name="action_open_source_invoices"]').first();
    if (!(await btn.count().catch(() => 0))) {
      throw new Error(
        'SubscriptionPageEmbed.getInvoiceCount(): no action_open_source_invoices button on the ' +
        'embedded form. Do not read that as 0 - the control is missing, which is a different fact.',
      );
    }
    const raw = (await btn.innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => '')).replace(/\s+/g, ' ');
    const m = raw.match(/\d+/);
    if (!m) throw new Error(`SubscriptionPageEmbed.getInvoiceCount(): button text carries no number ("${raw}").`);
    return Number(m[0]);
  }

  async openInvoices(): Promise<void> {
    const fr = await this.f();
    await fr.locator('button[name="action_open_source_invoices"]').first()
      .click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
  }

  /** The "Sales" smart button - measured as `action_open_source_order`, labelled "1 Sales". */
  async getSalesCount(): Promise<number> {
    const fr = await this.f();
    const btn = fr.locator('button[name="action_open_source_order"]').first();
    if (!(await btn.count().catch(() => 0))) {
      throw new Error('SubscriptionPageEmbed.getSalesCount(): no action_open_source_order button on the embedded form.');
    }
    const raw = (await btn.innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => '')).replace(/\s+/g, ' ');
    const m = raw.match(/\d+/);
    if (!m) throw new Error(`SubscriptionPageEmbed.getSalesCount(): button text carries no number ("${raw}").`);
    return Number(m[0]);
  }

  // ------------------------------------------------- NOT PORTED - fail, never fake
  // Each of these drives a native pre-production control that has no measured embed equivalent yet.
  async clickGenerateInvoice(..._args: any[]): Promise<any> { return this.notPorted('clickGenerateInvoice'); }
  async isGenerateInvoiceVisible(..._args: any[]): Promise<any> { return this.notPorted('isGenerateInvoiceVisible'); }
  async isDateOfNextInvoiceVisible(..._args: any[]): Promise<any> { return this.notPorted('isDateOfNextInvoiceVisible'); }
  async setDateField(..._args: any[]): Promise<any> { return this.notPorted('setDateField'); }
  async setDateOfNextInvoice(..._args: any[]): Promise<any> { return this.notPorted('setDateOfNextInvoice'); }
  async getEndDate(..._args: any[]): Promise<any> { return this.notPorted('getEndDate'); }
  async getRecurringPrice(..._args: any[]): Promise<any> { return this.notPorted('getRecurringPrice'); }
  async openTab(..._args: any[]): Promise<any> { return this.notPorted('openTab'); }
  async getChatterText(..._args: any[]): Promise<any> { return this.notPorted('getChatterText'); }
  async hasChatter(..._args: any[]): Promise<any> { return this.notPorted('hasChatter'); }
  async clickEdit(..._args: any[]): Promise<any> { return this.notPorted('clickEdit'); }
  async searchInList(..._args: any[]): Promise<any> { return this.notPorted('searchInList'); }
  async clearSearchFacets(..._args: any[]): Promise<any> { return this.notPorted('clearSearchFacets'); }
  async closeSubscription(..._args: any[]): Promise<any> { return this.notPorted('closeSubscription'); }
  async clickHeaderButton(..._args: any[]): Promise<any> { return this.notPorted('clickHeaderButton'); }
  async isHeaderButtonVisible(..._args: any[]): Promise<any> { return this.notPorted('isHeaderButtonVisible'); }
  async getSubscriptionReminder(..._args: any[]): Promise<any> { return this.notPorted('getSubscriptionReminder'); }
  async getToRenew(..._args: any[]): Promise<any> { return this.notPorted('getToRenew'); }
  async getCloseReason(..._args: any[]): Promise<any> { return this.notPorted('getCloseReason'); }
  async setPaymentToken(..._args: any[]): Promise<any> { return this.notPorted('setPaymentToken'); }
  async getMany2OneDropdownOptions(..._args: any[]): Promise<any> { return this.notPorted('getMany2OneDropdownOptions'); }
  async getActivityCount(..._args: any[]): Promise<any> { return this.notPorted('getActivityCount'); }
  async getContentText(..._args: any[]): Promise<any> { return this.notPorted('getContentText'); }
  async getName(..._args: any[]): Promise<any> { return this.notPorted('getName'); }
  async openSubscriptionTemplatesList(..._args: any[]): Promise<any> { return this.notPorted('openSubscriptionTemplatesList'); }
  async getLineCount(..._args: any[]): Promise<any> { return this.notPorted('getLineCount'); }
  async getLineProduct(..._args: any[]): Promise<any> { return this.notPorted('getLineProduct'); }
  async getAllLineProducts(..._args: any[]): Promise<any> { return this.notPorted('getAllLineProducts'); }
  async getLineQuantity(..._args: any[]): Promise<any> { return this.notPorted('getLineQuantity'); }
  async getLineUoM(..._args: any[]): Promise<any> { return this.notPorted('getLineUoM'); }
  async getLineUnitPrice(..._args: any[]): Promise<any> { return this.notPorted('getLineUnitPrice'); }
  async getLineSubTotal(..._args: any[]): Promise<any> { return this.notPorted('getLineSubTotal'); }
  async getLineDiscount(..._args: any[]): Promise<any> { return this.notPorted('getLineDiscount'); }
}
