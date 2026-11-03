import { test, expect, Frame } from '@playwright/test';
import { SubscriptionPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { loginAsCrmAdminMig } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * EXPLORE round 2 - measure how to COUNT records on the Subscriptions EMBED list.
 *
 * Round 1 (subs-mig-embed-list-search-dom-20261102) settled the search view: `.o_searchview`,
 * `input.o_searchview_input`, `.o_searchview_facet` (1 by default - "My Subscriptions") and
 * `.o_facet_remove` all match, and the list is SLOW, not broken - it needs a readiness poll, not a
 * fixed wait. It left two things unmeasured, and both are needed before
 * `SubscriptionPageEmbed.searchInList()` can return a number anyone should trust:
 *
 *   a) the KANBAN CARD selector - the default view is kanban, so `.o_data_row` is 0 while records
 *      are plainly on screen;
 *   b) the list/kanban VIEW SWITCHER.
 *
 * ------------------------------------------------------------------------------------------
 * ATTEMPT 1 (2026-11-03, 10:39) FAILED, AND MY FIRST DIAGNOSIS OF IT WAS WRONG. Both are kept,
 * because the wrong diagnosis is the more expensive mistake.
 *
 *   What I concluded: it had measured the CRM Pipeline, because the container carried class
 *   `o_opportunity_kanban` and the first card showed no SUBxxxxx code.
 *   What attempt 2 proved: the SUBSCRIPTIONS kanban carries `o_opportunity_kanban` TOO (the peer
 *   reuses that class), and attempt 2 read the identical 97 cards in 5 groups with the identical
 *   datapoint ids. Attempt 1 was on the RIGHT screen all along.
 *
 *   What actually broke in attempt 1:
 *     - `.innerText()` on the first card came back empty, so the SUBxxxxx term was never built
 *       and sections (e) and (f) had nothing to search for;
 *     - clicking `.o_facet_remove` DETACHED the frame handle, after which every count read -1
 *       (the locator threw) and the run timed out at 12 minutes.
 *
 *   The lesson that survives: a class name is not an identity check. Assert on the DATA
 *   (a SUBxxxxx code), not on a container class, and re-resolve the frame after any click.
 *
 * This version does that, and runs in 1.1 minutes instead of 12.
 *
 * ------------------------------------------------------------------------------------------
 * MEASURED 2026-11-03, attempt 2, frame https://pre-sales-crm-mig.nakivo.site/odoo/sale.subscription
 * (first card: "0123456789 $ 7.00 SUB00117 Sep 21")
 *
 *   .o_kanban_record:not(.o_kanban_ghost)   97   default view; GROUPED (o_kanban_grouped), 5 groups
 *   .o_kanban_ghost                          0
 *   button.o_switch_view.o_list              1   == [data-tooltip="List"]; the list view IS reachable
 *   .o_data_row (after switching)           97   same 97; table.o_list_table = 1
 *   .o_searchview_facet                      1   default ["My Subscriptions"]
 *   .o_facet_remove                          1   clearing all took 3 passes: 2 -> 1 -> 0
 *   search "SUB00117"                        1   row; facets ["My Subscriptions","NameSUB00117"]
 *   after clearing EVERY facet             161   rows
 *
 * THREE TRAPS, now encoded in SubscriptionPageEmbed.searchInList()/clearSearchFacets():
 *   1. THE PAGER COUNTS GROUPS. With 97 rows on screen it read "1-5 / 5" - five GROUPS. Never
 *      read a record total off the pager here.
 *   2. A FOLDED GROUP KEEPS ITS ROWS OUT OF THE DOM, so a count through one is too low. The port
 *      throws rather than return a number it cannot stand behind.
 *   3. THE DEFAULT "My Subscriptions" FACET HIDES RECORDS - 97 of 161. Any absolute count must
 *      clear the facets first.
 *
 * Read-only: it opens the list, switches view and types terms. It creates nothing.
 */

const SUBS_FRAME = /pre-sales-crm-mig/;

test.describe('EXPLORE - how to count records on the subscriptions embed list', () => {
  test('measure kanban cards, the view switcher and a matching search', async ({ page }) => {
    test.setTimeout(15 * 60_000);
    await page.setViewportSize({ width: 1920, height: 1080 });

    await loginAsCrmAdminMig(page);
    const subs = new SubscriptionPageMig(page);
    await subs.openSubscriptionsEmbed();

    /** Re-resolve the embed frame every time - a click can detach the old handle (attempt 1). */
    const frame = (): Frame | null =>
      page.frames().find((f) => SUBS_FRAME.test(f.url()) && f.url() !== 'about:blank') ?? null;

    /**
     * Wait until the SUBSCRIPTIONS list is really on screen: a frame on the peer host whose body
     * carries a SUBxxxxx code. Identity first, content second - that is attempt 1's lesson.
     */
    const waitForSubsList = async (): Promise<Frame> => {
      for (let i = 0; i < 18; i++) {
        const fr = frame();
        if (fr) {
          const text = await fr.locator('body').innerText().catch(() => '');
          if (/SUB\d{3,}/.test(text)) {
            console.log(`  ready: frame ${fr.url()} shows subscription codes`);
            return fr;
          }
        }
        await page.waitForTimeout(5_000);
      }
      const urls = page.frames().map((f) => f.url()).join('\n    ');
      throw new Error(
        'The Subscriptions embed never showed a SUBxxxxx code within 90 s. Frames on the page:\n    ' + urls +
        '\nMeasuring here would repeat attempt 1 and describe the wrong screen.',
      );
    };

    let fr = await waitForSubsList();

    const probe = async (label: string, sel: string) => {
      const n = await fr.locator(sel).count().catch(() => -1);
      let first = '';
      if (n > 0) {
        first = (await fr.locator(sel).first().evaluate((e) => (e as HTMLElement).outerHTML)
          .catch(() => '')).slice(0, 240).replace(/\s+/g, ' ');
      }
      console.log(`  ${label.padEnd(38)} count=${n}${first ? `\n      ${first}` : ''}`);
      return n;
    };

    console.log('--- (a) kanban card candidates (Subscriptions, identity-checked) ---');
    await probe('.o_kanban_view', '.o_kanban_view');
    await probe('.o_kanban_renderer', '.o_kanban_renderer');
    const cards = await probe('.o_kanban_record NOT ghost', '.o_kanban_record:not(.o_kanban_ghost)');
    await probe('.o_kanban_ghost', '.o_kanban_ghost');
    await probe('.o_kanban_group', '.o_kanban_group');
    // Attempt 1 saw `o_kanban_grouped` on the renderer; if the Subscriptions kanban is grouped
    // too, a card count is a count of the EXPANDED groups only - which a port must know.
    const rendererClass = await fr.locator('.o_kanban_renderer').first()
      .getAttribute('class').catch(() => '(none)');
    console.log(`  renderer class: ${rendererClass}`);
    const firstCard = await fr.locator('.o_kanban_record:not(.o_kanban_ghost)').first()
      .innerText().catch(() => '');
    console.log(`  first card text: ${JSON.stringify(firstCard.replace(/\s+/g, ' ').slice(0, 160))}`);

    console.log('--- (b) view switcher ---');
    await probe('.o_cp_switch_buttons', '.o_cp_switch_buttons');
    await probe('button.o_switch_view.o_list', 'button.o_switch_view.o_list');
    await probe('[data-tooltip="List"]', '[data-tooltip="List"]');

    console.log('--- (c) baseline, before any search ---');
    await probe('.o_searchview_facet', '.o_searchview_facet');
    await probe('.o_facet_remove', '.o_facet_remove');
    const facetsBefore = await fr.locator('.o_searchview_facet').allTextContents().catch(() => []);
    console.log(`  facet texts: ${JSON.stringify(facetsBefore.map((s) => s.replace(/\s+/g, ' ').trim()))}`);
    await probe('.o_pager_counter', '.o_pager_counter');

    // ---- the list view, measured BEFORE touching facets ---------------------------------------
    // Attempt 1 removed facets first and lost the frame, so (f) never ran. Order matters.
    console.log('--- (d) switch to the LIST view ---');
    const listBtn = fr.locator('button.o_switch_view.o_list').or(fr.locator('[data-tooltip="List"]')).first();
    if (await listBtn.count().catch(() => 0)) {
      await listBtn.click().catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
      fr = frame() ?? fr;
      await probe('.o_list_view', '.o_list_view');
      const rows = await probe('.o_data_row', '.o_data_row');
      await probe('table.o_list_table', 'table.o_list_table');
      const pager = await fr.locator('.o_pager_counter, .o_pager').first().innerText().catch(() => '(no pager)');
      console.log(`  pager text: ${pager.replace(/\s+/g, ' ')}`);
      console.log(`  CARDS(kanban) = ${cards} vs ROWS(list) = ${rows} - a port must count on the view it is on`);
    } else {
      console.log('  !! no list-view button matched - the kanban card count is the only option');
    }

    // ---- a search that MATCHES ----------------------------------------------------------------
    const code = (firstCard.match(/SUB\d+/) || [''])[0];
    console.log(`--- (e) matching search for "${code}" ---`);
    expect(code, 'a SUBxxxxx code must be readable from the first card before searching').not.toBe('');
    const input = fr.locator('input.o_searchview_input').or(fr.locator('.o_searchview input')).first();
    await input.click();
    await page.keyboard.type(code, { delay: 20 });
    await page.waitForTimeout(CommonUtils.waitTimes.short);
    const opts = await fr.locator('.o_searchview_autocomplete li, .o-dropdown--menu li')
      .allTextContents().catch(() => []);
    console.log(`  autocomplete options: ${JSON.stringify(opts.map((s) => s.replace(/\s+/g, ' ').trim()).slice(0, 10))}`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
    fr = frame() ?? fr;

    await probe('.o_data_row', '.o_data_row');
    await probe('.o_kanban_record NOT ghost', '.o_kanban_record:not(.o_kanban_ghost)');
    await probe('.o_nocontent_help', '.o_nocontent_help');
    const facetsAfter = await fr.locator('.o_searchview_facet').allTextContents().catch(() => []);
    console.log(`  facet texts: ${JSON.stringify(facetsAfter.map((s) => s.replace(/\s+/g, ' ').trim()))}`);

    // ---- clearing the facets, LAST, because attempt 1 lost the frame doing it -----------------
    console.log('--- (f) clear every facet (done last on purpose) ---');
    for (let i = 0; i < 6; i++) {
      const live = frame();
      if (!live) { console.log('  !! frame detached while clearing facets - stop'); break; }
      fr = live;
      const n = await fr.locator('.o_facet_remove').count().catch(() => -1);
      console.log(`  pass ${i + 1}: .o_facet_remove count = ${n}`);
      if (n <= 0) break;
      await fr.locator('.o_facet_remove').first().click().catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    }
    const live = frame();
    if (live) {
      fr = live;
      await probe('.o_searchview_facet', '.o_searchview_facet');
      await probe('.o_data_row', '.o_data_row');
      await probe('.o_kanban_record NOT ghost', '.o_kanban_record:not(.o_kanban_ghost)');
    }

    await CommonUtils.captureAndAttachScreenshot(page, test.info(), 'embed list - count measurement').catch(() => {});
  });
});
