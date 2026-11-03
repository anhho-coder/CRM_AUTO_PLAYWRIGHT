import { test } from '@playwright/test';
import { LeadPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { loginAndOpenLeadsOnMig } from '@helpers/lead-merging-mig.helper';

/**
 * THROWAWAY (2026-11-03): why does "More (N)" on a NEW, unsaved crm-mig Lead raise "The record has been modified"
 * (CRM-12370_9.3.3, LM-b1 2026-11-02)? Creates NOTHING - the form is discarded, never saved.
 */
test('EXPLORE-20261103_1: crm-mig Lead form More (N) dropdown (CRM-12370_9.3.3 Condition III)', async ({ page }) => {
  test.setTimeout(CommonUtils.waitTimes.leadMergeMigTest);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const lead = new LeadPageMig(page);
  await loginAndOpenLeadsOnMig(page);
  await lead.clickCreate();
  await lead.fillLeadOpportunity('EXPLORE more-dropdown 20261103 (never saved)');
  await lead.fillEmail('Lead#1@company1-explore-20261103.com');
  await lead.fillCompanyName('Company Name Lead 1');
  await lead.fillStreet('123street');
  await lead.selectCountry('United States');
  await lead.selectState('Texas');
  await lead.selectSalesTeam('CMR');
  await lead.clearSalesperson();
  await lead.uncheckCreatedManually();

  const dump = async (tag: string) => {
    const info = await page.evaluate(() => {
      const ul = document.querySelector('.o_form_view .o_notebook > ul.nav-tabs');
      const more = ul?.querySelector('a.dropdown-toggle') as HTMLAnchorElement | null;
      const folded = [...(ul?.querySelectorAll('li > a.nav-link') ?? [])]
        .filter((a) => /CRM Developer/.test(a.textContent || ''))
        .map((a) => ({ html: (a.parentElement as HTMLElement).outerHTML.slice(0, 300), visible: !!(a as HTMLElement).offsetParent }));
      const $ = (window as any).jQuery;
      const ev = more && $ ? Object.keys(($._data(more, 'events') || {})) : [];
      const docEv = $ ? Object.keys(($._data(document, 'events') || {})) : [];
      return { hash: location.hash, more: more?.outerHTML.slice(0, 400), moreEvents: ev, docEvents: docEv, folded, modal: !!document.querySelector('.modal.show') };
    });
    console.log(`\n[${tag}] ${JSON.stringify(info, null, 1)}`);
  };
  await dump('before More');
  await page.evaluate(() => { (window as any).__hashLog = []; window.addEventListener('hashchange', (e) => (window as any).__hashLog.push((e as HashChangeEvent).newURL)); });

  for (let i = 1; i <= 3; i++) {
    await page.locator('.o_form_view .o_notebook > ul.nav-tabs a.dropdown-toggle').first().click();
    await page.waitForTimeout(CommonUtils.waitTimes.long);
    const state = await page.evaluate(() => ({
      hashLog: (window as any).__hashLog,
      dropdownShown: !!document.querySelector('.dropdown-menu.show'),
      items: [...document.querySelectorAll('.dropdown-menu.show > a.dropdown-item')].map((a) => a.textContent?.trim()),
      modal: document.querySelector('.modal.show')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? null,
      hash: location.hash,
    }));
    console.log(`\n[More click ${i}] ${JSON.stringify(state, null, 1)}`);
    await CommonUtils.captureAndAttachScreenshot(page, test.info(), `explore - More click ${i}`);
    if (state.modal) await page.locator('.modal.show button', { hasText: /^\s*Cancel\s*$/ }).first().click();
    else if (state.dropdownShown) await page.keyboard.press('Escape');
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  }

  // alternative: activate the folded tab without the dropdown
  const res = await page.evaluate(() => {
    const ul = document.querySelector('.o_form_view .o_notebook > ul.nav-tabs')!;
    const a = [...ul.querySelectorAll('li > a.nav-link')].find((x) => /^\s*CRM Developer\s*$/.test(x.textContent || '')) as HTMLAnchorElement;
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { href: a.getAttribute('href'), dataToggle: a.getAttribute('data-toggle') };
  });
  await page.waitForTimeout(CommonUtils.waitTimes.long);
  const after = await page.evaluate(() => {
    const ul = document.querySelector('.o_form_view .o_notebook > ul.nav-tabs')!;
    const a = [...ul.querySelectorAll('li > a.nav-link')].find((x) => /^\s*CRM Developer\s*$/.test(x.textContent || '')) as HTMLAnchorElement;
    const pane = document.querySelector(a.getAttribute('href') || '#none') as HTMLElement | null;
    return { active: a.classList.contains('active'), paneShown: !!pane?.offsetParent, leadFormVisible: !!(document.querySelector('.o_form_view [name="lead_form"]') as HTMLElement | null)?.offsetParent, hashLog: (window as any).__hashLog, modal: !!document.querySelector('.modal.show') };
  });
  console.log(`\n[dispatch click on folded anchor] ${JSON.stringify({ ...res, ...after }, null, 1)}`);
  await CommonUtils.captureAndAttachScreenshot(page, test.info(), 'explore - after dispatch click');

  // never save: DISCARD + OK
  await page.locator('.o_form_button_cancel').first().click().catch(() => {});
  await page.locator('.modal.show button', { hasText: /^\s*Ok\s*$/i }).first().click({ timeout: CommonUtils.waitTimes.standard }).catch(() => {});
});
