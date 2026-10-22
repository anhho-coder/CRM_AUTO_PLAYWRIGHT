import { Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { CommonUtils } from '@helpers/common.utils';
import { users, baseUrl_discount_mig } from '@config/users.config';

/**
 * The "Program editor" of crm-mig: the Discount Service web app (baseUrl_discount_mig), NOT Odoo. It holds the
 * promotion programs as a versioned GoRules decision table; crm-mig asks it which programs an order may take.
 *
 * Screens (read 2026-10-21, version 10 active, 15 program rows):
 *  - root "/"             : Kanban of program cards (Active / Scheduled / Ended / ...), view toggles
 *                           Kanban | List | Graph | Edit Table, "New program", the account menu
 *  - List                 : table.program-table - # | Code | Name | Reward | Applies to | Conditions | Valid from |
 *                           Valid to | Status
 *  - a program card       : the program's detail - "When it applies" (Status, Validity, For reseller, For distributor,
 *                           Minimum amount, Minimum quantity, Products), "Rewards" (Reward, Applies to, For, Reward
 *                           line product, Promo code), "Advanced"
 *  - "?view=graph"        : the version list ("Version N Active <date> · <author> <n> program rows"), "Save as
 *                           version N+1", and the decision table "promotion_programs" (Edit Table): header row 1 =
 *                           Inputs | Outputs, header row 2 = the column titles, one CodeMirror cell per column.
 *                           The rows render only in a large viewport (1920x1080) - at 1280x720 the body stayed empty.
 *
 * READ-ONLY. Tester decision 2026-10-21: specs do not write to the program table (Add row / Save as version /
 * Delete) until the development team confirms QA may - QI p.3 gives program-table edits to Dev, except TC-13.
 * The two write methods below therefore refuse to run while PROGRAM_EDITOR_WRITES_CONFIRMED is false.
 * The site's certificate chain is self-signed: a spec that opens it needs test.use({ ignoreHTTPSErrors: true }).
 */
export class DiscountProgramEditorPageMig extends BasePage {
  /** Flip to true only after the development team confirms QA may save versions of the program table. */
  static readonly PROGRAM_EDITOR_WRITES_CONFIRMED = false;
  static readonly MANUAL_REASON =
    'MANUAL ONLY - QI p.3: program-table edits in the Program editor are the development team\'s (except TC-13); ' +
    'QA writes not confirmed by Dev yet (tester decision 2026-10-21)';

  constructor(page: Page) {
    super(page);
  }

  // Locators - XPath primary, CSS fallback
  private readonly usernameInput = () => this.page.locator('xpath=//input[@id="u"]').or(this.page.locator('#u')).first();
  private readonly passwordInput = () => this.page.locator('xpath=//input[@id="p"]').or(this.page.locator('#p')).first();
  private readonly signInButton = () => this.page.locator('xpath=//button[@id="b"]').or(this.page.locator('#b')).first();
  private readonly viewToggle = (name: string) => this.page.getByRole('button', { name, exact: true }).first();
  private readonly listTable = () => this.page.locator('xpath=//table[contains(@class,"program-table")]').or(this.page.locator('table.program-table')).first();
  private readonly versionButtons = () => this.page.locator('button').filter({ hasText: /^\s*Version \d+/ });
  private readonly decisionTable = () => this.page.locator('xpath=//table[.//th[normalize-space()="Inputs"]]').first();
  private readonly programCard = (name: string) => this.page.locator(`xpath=//button[contains(@class,"program-card") and @aria-label=${DiscountProgramEditorPageMig.xpathLiteral(name)}]`).first();
  private readonly detailHeading = (name: string) => this.page.getByRole('heading', { name, exact: true }).first();

  private static xpathLiteral(s: string): string {
    if (!s.includes('"')) return `"${s}"`;
    if (!s.includes("'")) return `'${s}'`;
    return `concat("${s.replace(/"/g, '", \'"\', "')}")`;
  }

  /** Sign in on the Program editor's own form (POST /login), then open the editor at the site root. */
  async signIn(account: { username: string; password: string } = users.admin_discount_mig): Promise<void> {
    await this.page.goto(`${baseUrl_discount_mig}login`, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
    await this.usernameInput().fill(account.username);
    await this.passwordInput().fill(account.password);
    await this.signInButton().click();
    // the login script lands on ?next= or /healthz - the editor itself is the site root
    await this.page.waitForURL((u) => !/\/login$/.test(u.pathname), { timeout: CommonUtils.waitTimes.pageLoad });
    await this.page.goto(baseUrl_discount_mig, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
    await this.viewToggle('Kanban').waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
  }

  /** List view: one row per program of the ACTIVE version, header -> cell text. */
  async getListRows(): Promise<Array<Record<string, string>>> {
    await this.viewToggle('List').click();
    await this.listTable().locator('tbody tr').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return await this.listTable().evaluate((t) => {
      const heads = Array.from(t.querySelectorAll('thead th')).map((th) => (th.textContent || '').replace(/\s+/g, ' ').trim());
      return Array.from(t.querySelectorAll('tbody tr')).map((tr) => {
        const row: Record<string, string> = {};
        Array.from(tr.querySelectorAll('td')).forEach((td, i) => { row[heads[i] || `col${i}`] = (td.textContent || '').replace(/\s+/g, ' ').trim(); });
        return row;
      });
    });
  }

  /** Graph view: the version list, newest first - { version, active, label }. */
  async getVersions(): Promise<Array<{ version: number; active: boolean; label: string }>> {
    if (!/[?&]view=graph/.test(this.page.url())) {
      await this.page.goto(`${baseUrl_discount_mig}?view=graph`, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
    }
    await this.versionButtons().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const labels = (await this.versionButtons().allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim());
    return labels.map((label) => ({ version: Number((label.match(/Version (\d+)/) || [])[1]), active: /Version \d+\s*Active/.test(label), label }));
  }

  /**
   * Graph view -> Edit Table: the decision table of the ACTIVE version. Returns the column titles split into
   * Inputs (conditions) and Outputs (results), and every row as title -> cell text. Reads only - no cell is focused.
   *
   * Two traps (read-only probe 2026-10-21): the table is TWO <table>s - one carries the header rows (Inputs /
   * Outputs, then the titles), the other the body rows - and the body is virtualised (11 rows rendered after the
   * click, 14 after a scroll, 15 programs in the version). So the titles come from the header table and the rows
   * are collected from the body table while scrolling it, keyed by their "#" cell, until no new row appears.
   */
  async readActiveDecisionTable(): Promise<{ inputs: string[]; outputs: string[]; extra: string[]; rows: Array<Record<string, string>> }> {
    await this.getVersions();
    await this.wait(CommonUtils.waitTimes.extraLong * 2); // the graph canvas settles before its node button answers
    await this.viewToggle('Edit Table').click();
    await this.decisionTable().waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    // probe 2026-10-21: each of the two tables carries ONE header row - the first table "Inputs | Outputs" (with
    // colspans), the second the column titles above the 16 body cells - so the two rows are read from the page
    await this.wait(CommonUtils.waitTimes.extraLong);
    const header = await this.page.evaluate(() => {
      const headRows = Array.from(document.querySelectorAll('table thead tr'));
      const isGroups = (tr: Element) => Array.from(tr.querySelectorAll('th')).some((th) => (th.textContent || '').trim() === 'Inputs');
      const groupsRow = headRows.find(isGroups);
      const titlesRow = headRows.filter((tr) => !isGroups(tr)).sort((x, y) => y.querySelectorAll('th').length - x.querySelectorAll('th').length)[0];
      const groups: Array<{ name: string; span: number }> = Array.from(groupsRow?.querySelectorAll('th') || []).map((th) => ({
        name: (th.textContent || '').replace(/\s+/g, ' ').trim(),
        span: Number(th.getAttribute('colspan') || '1'),
      }));
      const titles = Array.from(titlesRow?.querySelectorAll('th') || []).map((th) => {
        const text = (th as HTMLElement).innerText || th.textContent || '';
        return text.split(/\n/).map((x) => x.trim()).filter(Boolean)[0] || '';
      });
      const group: string[] = [];
      for (const g of groups) for (let i = 0; i < g.span; i++) group.push(g.name);
      const offset = group.length - titles.length; // row 2 may carry a leading index column
      const inputs: string[] = [];
      const outputs: string[] = [];
      const extra: string[] = [];
      titles.forEach((title, i) => {
        const g = group[i + offset] || '';
        if (!title) return;
        if (g === 'Inputs') inputs.push(title);
        else if (g === 'Outputs') outputs.push(title);
        else extra.push(title);
      });
      return { titles, inputs, outputs, extra };
    });
    // the body rows may sit in a second table (with a hidden copy of the header for column widths), so collect, page
    // wide, every row whose cell count matches the column titles
    const byIndex = new Map<string, Record<string, string>>();
    let idle = 0;
    const deadline = Date.now() + CommonUtils.waitTimes.abnormalWait * 3;
    while (Date.now() < deadline && idle < 3) {
      const batch: Array<Record<string, string>> = await this.page
        .evaluate((titles: string[]) => Array.from(document.querySelectorAll('table tbody tr'))
          .filter((tr) => tr.querySelectorAll(':scope > td').length === titles.length)
          .map((tr) => {
            const row: Record<string, string> = {};
            Array.from(tr.querySelectorAll(':scope > td')).forEach((td, i) => {
              const editor = td.querySelector('.cm-content') as HTMLElement | null;
              row[titles[i] || (i === 0 ? '#' : `col${i}`)] = ((editor ? editor.innerText : (td as HTMLElement).innerText) || '').replace(/\s+/g, ' ').trim();
            });
            return row;
          }), header.titles)
        .catch(() => [] as Array<Record<string, string>>);
      const before = byIndex.size;
      for (const r of batch) if (r['Name'] || r['Promo code']) byIndex.set(r['#'] || JSON.stringify(r), r);
      idle = byIndex.size === before ? idle + 1 : 0;
      const box = await this.decisionTable().boundingBox().catch(() => null);
      if (box) await this.page.mouse.move(box.x + box.width / 2, box.y + box.height + 120).catch(() => {});
      await this.page.mouse.wheel(0, 400).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
    }
    if (!byIndex.size) throw new Error('Program editor: the decision table of the active version rendered no rows (Graph > Edit Table)');
    const rows = [...byIndex.values()].sort((a, b) => Number(a['#'] || 0) - Number(b['#'] || 0));
    return { inputs: header.inputs, outputs: header.outputs, extra: header.extra, rows };
  }

  /** Kanban: open a program's card and return its detail as one line of text (nothing is edited). */
  async readProgramDetail(name: string): Promise<string> {
    if (/[?&]view=/.test(this.page.url())) {
      await this.page.goto(baseUrl_discount_mig, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
    }
    await this.viewToggle('Kanban').click();
    await this.programCard(name).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.detailHeading(name).waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
    const text = await this.page.locator('#root').evaluate((root) => {
      const clone = root.cloneNode(true) as HTMLElement;
      // product badges carry the full product description in their title; keep only their visible code
      clone.querySelectorAll('.badge').forEach((b) => { b.textContent = ` ${(b.textContent || '').trim()} `; });
      return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    });
    return text;
  }

  /** Close an open program detail (back to the Kanban). */
  async closeProgramDetail(): Promise<void> {
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * [NOT AUTHORISED - see MANUAL_REASON] Add a program row to the active version and Save as version N+1.
   * Refuses to run while PROGRAM_EDITOR_WRITES_CONFIRMED is false, so a spec can never write by accident.
   */
  async addProgramRowAndSaveVersion(_row: Record<string, string>): Promise<never> {
    throw new Error(DiscountProgramEditorPageMig.MANUAL_REASON);
  }

  /** [NOT AUTHORISED - see MANUAL_REASON] Delete a program row and Save as version N+1. Refuses to run. */
  async deleteProgramRowAndSaveVersion(_name: string): Promise<never> {
    throw new Error(DiscountProgramEditorPageMig.MANUAL_REASON);
  }
}
