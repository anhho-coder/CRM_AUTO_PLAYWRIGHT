import { Locator, Page } from '@playwright/test';
import { ScheduledActionPageMig } from './ScheduledActionPageMig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * crm-mig: Settings > Technical > Automation > Scheduled Actions in DEVELOPER MODE, for an ARCHIVED job, and
 * "Run Manually" with its outcome read back. Added 2026-10-26 for CRM-12144_7.5 (QI TC-22 step 1); the inherited
 * ScheduledActionPageMig methods are reused unchanged (countListedActionsNamed, openListedAction, readActiveMarker).
 *
 * Measured on crm-mig 2026-10-26 (tests/_explore/discount-mig-batchB-probe-20261026):
 *  - the job "NAKIVO Promotion: sync catalogue from Discount Service" is archived (active = false);
 *  - the ir.cron search view of this Odoo 12 build has NO "Archived" filter: its Filters menu offers "All"
 *    (domain active = False OR active = True) - that is the filter the QI's "add the Archived filter" means here;
 *  - RUN MANUALLY renders only in developer mode (group_no_one).
 */
export class ScheduledActionRunPageMig extends ScheduledActionPageMig {
  // ─── Locators (XPath primary, CSS fallback) ───────────────────────────────
  private readonly runListTable = (): Locator =>
    this.page.locator('xpath=//table[contains(@class,"o_list_view")]').or(this.page.locator('table.o_list_view')).first();
  private readonly runFiltersToggle = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_control_panel")]//button[contains(@class,"dropdown-toggle")][normalize-space()="Filters"]')
      .or(this.page.locator('.o_control_panel button.dropdown-toggle:has-text("Filters")')).first();
  private readonly runFilterItem = (label: string): Locator =>
    this.page.locator(`xpath=//div[contains(@class,"o_filters_menu")]//div[contains(@class,"o_menu_item")]/a[normalize-space()="${label}"]`)
      .or(this.page.locator('.o_filters_menu .o_menu_item > a').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) })).first();
  private readonly runManuallyButton = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_form_view")]//button[@name="method_direct_trigger"]')
      .or(this.page.locator('.o_form_view button[name="method_direct_trigger"]'))
      .or(this.page.locator('xpath=//button[contains(normalize-space(.),"RUN MANUALLY") or contains(normalize-space(.),"Run Manually")]')).first();
  private readonly runFacets = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"o_searchview_facet")]').or(this.page.locator('.o_searchview_facet'));
  /** The Scheduled Actions list (evidence hook for the "listed exactly once" check). */
  readonly listCss = 'table.o_list_view';
  /** The RUN MANUALLY button of the open job form (evidence hook for the "Run Manually" check). */
  readonly runManuallyCss = '.o_form_view button[name="method_direct_trigger"]';
  readonly errorDialogCss = '.modal.show .modal-content';
  private readonly runDialog = (): Locator =>
    this.page.locator('xpath=//div[contains(@class,"modal") and contains(@class,"show")]//div[contains(@class,"modal-content")]')
      .or(this.page.locator(this.errorDialogCss)).first();

  constructor(page: Page) {
    super(page);
  }

  /** Open the Scheduled Actions LIST in developer mode (XML id route). @returns true when the list is on screen */
  async openScheduledActionsListDebug(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    const origin = new URL(this.page.url()).origin;
    const action = await this.xmlId('base.ir_cron_act');
    const menu = await this.xmlId('base.menu_administration');
    console.log(`  - Opening Settings > Technical > Automation > Scheduled Actions (developer mode, action ${action})`);
    await this.discardFormIfInEditMode().catch(() => {});
    await this.dismissDiscardChangesDialog().catch(() => {});
    await this.page.goto(`${origin}/web?debug=1#action=${action}&model=ir.cron&view_type=list&menu_id=${menu}`, { waitUntil: 'domcontentloaded', timeout });
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout }).catch(() => {});
    await this.dismissErrorDialogWithRetry().catch(() => {});
    const ok = await this.runListTable().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ${ok ? 'OK' : '!'} Scheduled Actions list on screen: ${ok}`);
    return ok;
  }

  /**
   * Make sure the Filters menu entry `label` is SELECTED (aria-checked / class "selected"); click it only when it is not.
   * @returns true when the entry reads selected afterwards
   */
  async ensureFilterSelected(label: string): Promise<boolean> {
    // Selection is read from the SEARCH VIEW FACET (what the list is actually filtered by), not from the dropdown
    // item's class. The Scheduled Actions action opens with the "All" facet already set (search_default_all) - measured
    // in tests/_explore/discount-mig-batchB-cron-toggle-20261026c: facet "All", 80 rows, the archived job found by name.
    // (The 0 rows of CRM-12144_7.5 round 1 came from countListedActionsNamed pressing Backspace in the empty search box,
    // which deletes that facet - fixed there.)
    const isSelected = async (): Promise<boolean> => {
      const facets = await this.runFacets().allInnerTexts().catch(() => [] as string[]);
      return facets.some((f) => f.replace(/\s+/g, ' ').trim() === label);
    };
    if (await isSelected()) {
      console.log(`  - Filters > "${label}" selected: true (facet "${label}" already in the search view)`);
      return true;
    }
    await this.runFiltersToggle().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.standard);
    const item = this.runFilterItem(label);
    const there = await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (!there) {
      console.log(`  ! Filters menu has no entry "${label}"`);
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }
    let selected = await isSelected();
    if (!selected) {
      await item.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      selected = await isSelected();
    }
    console.log(`  - Filters > "${label}" selected: ${selected}`);
    await this.page.keyboard.press('Escape').catch(() => {}); // close the Filters menu without touching an entry
    await this.wait(CommonUtils.waitTimes.standard);
    return selected;
  }

  /**
   * Click RUN MANUALLY on the open job and wait for it to come back (the call is synchronous). A dialog that shows
   * afterwards is read and closed - it is returned, never swallowed.
   * @returns pressed = the button was clicked; dialogText = the text of a dialog shown after the run ('' = none)
   */
  async runManuallyAndReadOutcome(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<{ pressed: boolean; dialogText: string }> {
    const button = this.runManuallyButton();
    const visible = await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (!visible) {
      console.log('  ! RUN MANUALLY is not on this form (developer mode off?)');
      return { pressed: false, dialogText: '' };
    }
    console.log('  - Clicking RUN MANUALLY and waiting for the job to finish');
    await button.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
    let dialogText = '';
    if (await this.runDialog().isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      dialogText = ((await this.runDialog().innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 400);
      console.log(`  ! A dialog showed after RUN MANUALLY: "${dialogText}"`);
    }
    return { pressed: true, dialogText };
  }

  /** Close an open dialog left by RUN MANUALLY (after the evidence shot). */
  async closeDialogIfAny(): Promise<void> {
    await this.dismissErrorDialogWithRetry().catch(() => {});
  }
}
