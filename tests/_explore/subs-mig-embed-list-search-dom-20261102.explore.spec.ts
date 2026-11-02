import { test } from '@playwright/test';
import { SubscriptionPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { loginAsCrmAdminMig } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * EXPLORE - measure the Subscriptions EMBED list view on crm-mig (Odoo 19 peer in an iframe).
 *
 * Why: SubscriptionPageEmbed still stubs searchInList() / clearSearchFacets() with notPorted(),
 * which is what keeps CRM-11806_7.2 and 10.3 from asserting "exactly 1 subscription exists".
 * Porting them blind would be guesswork - Odoo 19's search view is not Odoo 12's - so this dumps
 * the real DOM: the search input, the facet chips and the row container.
 *
 * Read-only: it opens the list, types a term and reads the DOM. It creates nothing.
 *
 * ------------------------------------------------------------------------------------------
 * MEASURED 2026-11-02, four runs. Frame: https://pre-sales-crm-mig.nakivo.site/odoo/action-390
 *
 *  1. THE LIST IS SLOW, NOT BROKEN. Runs 1-2 waited CommonUtils.waitTimes.standard * 3 and read an
 *     EMPTY <body class="o_web_client mk_sidebar_type_large nakivo-embedded">, every selector 0.
 *     Polling for up to 60 s produced 2886 content nodes and real records (SUB00131 ... SUB00249).
 *     So a short wait reads the embed as empty - which looks exactly like a broken screen. Any
 *     port of the list methods needs a readiness poll, not a fixed wait.
 *
 *  2. SELECTORS THAT MATCH (count after the poll):
 *       .o_searchview                      1
 *       input.o_searchview_input           1
 *       .o_searchview_facet                1   <- NOT zero: a default "My Subscriptions" facet
 *       .o_facet_remove                    1
 *     After typing a term and pressing Enter: facets = 2,
 *       ["My Subscriptions", "Name<term>"], and .o_nocontent_help = 1 for a no-match search.
 *
 *  3. THE DEFAULT VIEW IS KANBAN, NOT LIST. .o_list_view / .o_data_row / table.o_list_table /
 *     .o_pager_* are all 0 while records are plainly on screen. So searchInList() cannot count
 *     .o_data_row here; it must either count kanban cards or switch the view first. Not yet
 *     measured: the kanban card selector and the list/kanban switcher.
 *
 *  4. CONSEQUENCE for SubscriptionPageEmbed: searchInList() and clearSearchFacets() CAN be ported -
 *     the search view is there and the default facet is exactly what clearSearchFacets() has to
 *     remove before any count is meaningful. They are still notPorted() as of this run.
 * ------------------------------------------------------------------------------------------
 */
test.describe('EXPLORE - subscriptions embed list/search DOM', () => {
  test('dump the embed list search view and row markup', async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await page.setViewportSize({ width: 1920, height: 1080 });

    await loginAsCrmAdminMig(page);
    const subs = new SubscriptionPageMig(page);
    const fr = await subs.openSubscriptionsEmbed();
    await page.waitForTimeout(CommonUtils.waitTimes.standard * 3);

    console.log(`frame url: ${fr.url()}`);

    const probe = async (label: string, sel: string) => {
      const n = await fr.locator(sel).count().catch(() => -1);
      let first = '';
      if (n > 0) {
        first = (await fr.locator(sel).first().evaluate((e) => (e as HTMLElement).outerHTML)
          .catch(() => '')).slice(0, 320);
      }
      console.log(`  ${label.padEnd(34)} count=${n}${first ? `\n      ${first}` : ''}`);
    };

    // 2026-11-02 runs 1-2: every selector below returned count=0 and the frame body was empty.
    // Run 3 tells "slow" apart from "broken": poll for up to 60 s, then reload the frame and poll
    // again. If it is still empty after both, the list action renders nothing - not a short wait.
    for (const phase of ['first load', 'after frame reload'] as const) {
      let n = 0;
      for (let i = 0; i < 12; i++) {
        n = await fr.locator('.o_list_view, .o_data_row, .o_searchview, .o_content *').count().catch(() => 0);
        if (n > 0) break;
        await page.waitForTimeout(5_000);
      }
      console.log(`  poll (${phase}): content nodes = ${n} after up to 60 s`);
      if (n > 0) break;
      if (phase === 'first load') {
        await fr.goto(fr.url(), { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
      }
    }


    // Run 3 proved the list DOES render - the body dump that used to sit here flooded the log with
    // every row, so it is gone. What matters is which selectors match, below.
    console.log(`--- all frames on the page ---`);
    for (const f of page.frames()) console.log(`    ${f.url()}`);

    console.log('--- search view candidates ---');
    await probe('.o_searchview', '.o_searchview');
    await probe('.o_searchview input', '.o_searchview input');
    await probe('input.o_searchview_input', 'input.o_searchview_input');
    await probe('.o_searchview_facet', '.o_searchview_facet');
    await probe('.o_facet_remove', '.o_facet_remove');
    await probe('.o_searchview_facet .o_facet_remove', '.o_searchview_facet .o_facet_remove');

    console.log('--- list candidates ---');
    await probe('.o_list_view', '.o_list_view');
    await probe('.o_data_row', '.o_data_row');
    await probe('table.o_list_table', 'table.o_list_table');
    await probe('.o_pager_counter', '.o_pager_counter');
    await probe('.o_pager_value', '.o_pager_value');
    await probe('.o_pager_limit', '.o_pager_limit');

    // Type a term that matches nothing, so the measurement cannot depend on live data.
    const term = `ZZ-NO-SUCH-CUSTOMER-${Date.now()}`;
    const input = fr.locator('.o_searchview input').or(fr.locator('input.o_searchview_input')).first();
    if (await input.count()) {
      await input.click();
      await input.fill(term);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
      console.log(`--- after searching "${term}" ---`);
      await probe('.o_searchview_facet', '.o_searchview_facet');
      await probe('.o_data_row', '.o_data_row');
      await probe('.o_pager_counter', '.o_pager_counter');
      await probe('.o_nocontent_help', '.o_nocontent_help');
      const facetText = await fr.locator('.o_searchview_facet').allTextContents().catch(() => []);
      console.log(`  facet texts: ${JSON.stringify(facetText)}`);
    } else {
      console.log('  !! no search input matched either candidate selector');
    }

    await CommonUtils.captureAndAttachScreenshot(page, test.info(), 'embed list after search').catch(() => {});
  });
});
