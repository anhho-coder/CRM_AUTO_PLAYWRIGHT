import { Locator } from '@playwright/test';

/**
 * One row of an Odoo one2many list as { column caption -> cell text }, keyed on the caption AS AUTHORED.
 *
 * The crm-mig sidebar theme upper-cases list headers with CSS, so innerText reads "PRODUCT" / "SUBTOTAL" where the
 * field caption is "Product" / "Subtotal" (CRM-12144_2.1 pilot, 2026-10-21: every cell came back undefined). That
 * casing is a cosmetic theme difference the CRM-12127 smoke suite already reports as its own finding, so the base
 * page objects keep reading innerText; the Mig variants used by suites that assert on cell VALUES key on the
 * caption's textContent instead. Cell values keep innerText (what the user reads).
 */
export async function readRowByAuthoredCaption(table: Locator, rowIndex: number, timeout: number): Promise<Record<string, string>> {
  await table.waitFor({ state: 'visible', timeout }).catch(() => {});
  return await table
    .evaluate((el: HTMLElement, index: number) => {
      const caption = (n: Element) => (n.textContent || '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
      const clean = (n: Element) => ((n as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
      const headers = Array.from(el.querySelectorAll('thead th')).map(caption);
      const row = el.querySelectorAll('tbody tr.o_data_row')[index];
      if (!row) return {} as Record<string, string>;
      const cells = Array.from(row.querySelectorAll('td')).map(clean);
      const out: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (h.length > 0) out[h] = cells[i] !== undefined ? cells[i] : '';
      });
      return out;
    }, rowIndex)
    .catch(() => ({} as Record<string, string>));
}
