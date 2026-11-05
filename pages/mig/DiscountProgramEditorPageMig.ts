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
 * STANDARD (tester, 2026-10-27, from the CRM-12144_5.3 review): a spec reads the Program editor on Discount Programs in
 * the KANBAN view (getKanbanCards) and on the PROGRAM PAGE a card opens (readProgramConditions / readProgramRewards /
 * getProgramRowCodes) - never on List or Graph > Edit Table, except where the manual TC names that screen (1.14 = QI
 * TC-13: "Then click Edit Table" and the version list on the left). The List / decision-table readers were removed
 * on 2026-10-27 with the last specs that used them (3.4, 5.2, 5.5).
 *
 * Exception (2026-10-26): the account methods and editOpenProgramName() below serve CRM-12144_1.14 = QI TC-13 only,
 * the one case QI p.3 lets QA save a version in (a name edit of an Ended program, saved and restored).
 *
 * WRITES (tester, 2026-10-27): "QA có quyền tạo Discount program test (rồi teardown). Ko sửa Discount program có sẵn" -
 * a spec may create its OWN test program (QA-Disc-<timestamp>), change it and delete it in teardown; it never edits an
 * existing program. createProgramOnKanban / editProgramRewardOnKanban / archiveProgramOnKanban / deleteProgramOnKanban
 * enforce that by name (TEST_PROGRAM_PREFIX). Before that rule (QI p.3 + p.28, Nathan's CRM-12467 comment of 2026-10-20:
 * QA runs only TC-13 and TC-19) the specs that need a write were skipped as manual-only (tester, 2026-10-22); the tester
 * un-skipped 1.4 / 1.6 on 2026-11-03 and 1.1 / 1.2 / 1.3 / 1.10 / 1.13 / 2.6 on 2026-11-05.
 * The site's certificate chain is self-signed: a spec that opens it needs test.use({ ignoreHTTPSErrors: true }).
 */
export class DiscountProgramEditorPageMig extends BasePage {
  static readonly MANUAL_REASON =
    'chỉ run manual - program-table edits in the Program editor are the development team\'s: QI p.3 (except TC-13) ' +
    'and p.28 (TC-14 to TC-18 at QA\'s request); Nathan, CRM-12467 2026-10-20: QA runs only TC-13 and TC-19';

  constructor(page: Page) {
    super(page);
  }

  // Locators - XPath primary, CSS fallback
  private readonly usernameInput = () => this.page.locator('xpath=//input[@id="u"]').or(this.page.locator('#u')).first();
  private readonly passwordInput = () => this.page.locator('xpath=//input[@id="p"]').or(this.page.locator('#p')).first();
  private readonly signInButton = () => this.page.locator('xpath=//button[@id="b"]').or(this.page.locator('#b')).first();
  private readonly viewToggle = (name: string) => this.page.getByRole('button', { name, exact: true }).first();
  private readonly versionButtons = () => this.page.locator('button').filter({ hasText: /^\s*Version \d+/ });
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

  /** Graph view: the version list, newest first - { version, active, label }. */
  async getVersions(): Promise<Array<{ version: number; active: boolean; label: string }>> {
    if (!/[?&]view=graph/.test(this.page.url())) {
      await this.page.goto(`${baseUrl_discount_mig}?view=graph`, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
    }
    await this.versionButtons().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const labels = (await this.versionButtons().allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim());
    return labels.map((label) => ({ version: Number((label.match(/Version (\d+)/) || [])[1]), active: /Version \d+\s*Active/.test(label), label }));
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

  // ------------------------------------------------------------------------------------------------------------
  // Accounts and the TC-13 name edit (CRM-12144_1.14). QI p.3: "editing the program table and saving a version in
  // the Program editor [belongs to the development team], except in TC-13, which QA runs with its own account".
  // These methods exist for that case only: an account QA creates (and disables), and a one-character edit of an
  // ENDED program's name that is saved and then restored. They never add or delete a program-table row.
  // Screens read 2026-10-26 (read-only exploration): /users is server-rendered - table of Login | Status | Created |
  // actions, "Add account" opens <dialog id="add"> (#login, #password, .pw-label), Disable is a form posting
  // /users/<id>/archive behind a window.confirm. The account menu is button[aria-label="Account menu"] with
  // .user-who ("Signed in as <b>login</b>"), a Settings link (/tokens) and a "Sign out" menu item. The sign-in page
  // shows its refusal in #e (#etxt "Incorrect username or password.").
  // ------------------------------------------------------------------------------------------------------------

  private readonly accountMenuButton = () => this.page.locator('xpath=//button[@aria-label="Account menu"]').or(this.page.locator('button.user-btn')).first();
  private readonly accountWho = () => this.page.locator('xpath=//div[contains(@class,"user-who")]/b').or(this.page.locator('.user-who b')).first();
  private readonly signOutItem = () => this.page.locator('xpath=//*[@role="menuitem" and normalize-space()="Sign out"]').or(this.page.getByRole('menuitem', { name: 'Sign out' })).first();
  private readonly settingsItem = () => this.page.locator('xpath=//a[@role="menuitem" and normalize-space()="Settings"]').or(this.page.getByRole('menuitem', { name: 'Settings' })).first();
  private readonly usersNavLink = () => this.page.locator('xpath=//nav//a[@href="/users"]').or(this.page.locator('nav a[href="/users"]')).first();
  private readonly accountsHeading = () => this.page.locator('xpath=//h2[normalize-space()="Accounts"]').or(this.page.getByRole('heading', { name: 'Accounts', exact: true })).first();
  private readonly accountsTable = () => this.page.locator('xpath=//section[.//h2[normalize-space()="Accounts"]]//table').or(this.page.locator('section.card table')).first();
  private readonly addAccountButton = () => this.page.locator('xpath=//button[normalize-space()="Add account" and not(ancestor::dialog)]').or(this.page.locator('button[onclick*="add"]')).first();
  private readonly addDialog = () => this.page.locator('xpath=//dialog[@id="add"]').or(this.page.locator('dialog#add')).first();
  private readonly signInError = () => this.page.locator('xpath=//*[@id="e"]').or(this.page.locator('#e')).first();
  private readonly endedCards = () => this.page.locator('xpath=//section[@aria-label="Ended"]//button[contains(@class,"program-card")]').or(this.page.locator('section[aria-label="Ended"] button.program-card'));
  private readonly cardByCode = (code: string) => this.page.locator(`xpath=//button[contains(@class,"program-card")][.//span[contains(@class,"code-pill") and normalize-space()=${DiscountProgramEditorPageMig.xpathLiteral(code)}]]`).first();
  private readonly programTitle = () => this.page.locator('xpath=//h1[contains(@class,"program-title")]').or(this.page.locator('h1.program-title')).first();
  private readonly programNameInput = () => this.page.locator('xpath=//input[@aria-label="Program name"]').or(this.page.locator('input.title-input')).first();
  private readonly detailButton = (name: string) => this.page.locator(`xpath=//div[contains(@class,"detail-actions")]//button[normalize-space()="${name}"]`).or(this.page.locator('.detail-actions button').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) })).first();
  private readonly crumbPrograms = () => this.page.locator('xpath=//button[contains(@class,"crumb-link") and normalize-space()="Discount Programs"]').or(this.page.locator('button.crumb-link')).first();
  private readonly editProgramsButton = () => this.page.locator('xpath=//button[normalize-space()="Edit Programs"]').or(this.page.getByRole('button', { name: 'Edit Programs' })).first();
  private readonly saveProblems = () => this.page.locator('xpath=//*[contains(normalize-space(),"before saving:")]').or(this.page.getByText(/before saving:/)).first();

  /** Evidence hooks (read 2026-10-26): the sign-in card, its refusal text, the open account menu, the version list. */
  static readonly SIGN_IN_CARD = 'section#signin';
  static readonly SIGN_IN_ERROR = '#e';
  static readonly ACCOUNT_DROPDOWN = '.user-dropdown';
  static readonly VERSION_LIST = 'aside.version-sidebar';
  static readonly PAGE_HEADING = 'h1';
  static readonly PROGRAM_TITLE = 'h1.program-title';

  private readonly accountDropdown = () => this.page.locator('xpath=//div[contains(@class,"user-dropdown")]').or(this.page.locator('.user-dropdown')).first();

  /**
   * Open the Program editor address with NO session of this context (only the Program editor cookies are dropped):
   * where it lands, the sign-in card's heading, and how many program cards are on the page.
   */
  async openAddressWithoutSession(): Promise<{ url: string; signInHeading: string; programCards: number }> {
    await this.resetSession();
    await this.page.goto(baseUrl_discount_mig, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
    const card = this.page.locator('xpath=//section[@id="signin"]').or(this.page.locator(DiscountProgramEditorPageMig.SIGN_IN_CARD)).first();
    await card.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    const signInHeading = ((await card.locator('h2').first().textContent({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')) || '').trim();
    const programCards = await this.page.locator('xpath=//button[contains(@class,"program-card")]').or(this.page.locator('button.program-card')).count();
    return { url: this.page.url(), signInHeading, programCards };
  }

  /** The page's main heading (h1), e.g. "Discount Programs" on the editor root. */
  async getPageHeading(): Promise<string> {
    return ((await this.page.locator('xpath=(//h1)[1]').or(this.page.locator('h1')).first().textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
  }

  /** True while the sign-in form is on screen (the page "stays on Sign in"). */
  async isSignInShown(): Promise<boolean> {
    return this.usernameInput().isVisible().catch(() => false);
  }

  /**
   * Open the account menu (top right) and return the login under "Signed in as". The menu is closed again unless
   * `keepOpen` - then the caller captures it and calls closeAccountMenu().
   */
  async getSignedInAs(opts: { keepOpen?: boolean } = {}): Promise<string> {
    if (!(await this.accountDropdown().isVisible().catch(() => false))) await this.accountMenuButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const who = ((await this.accountWho().textContent({ timeout: CommonUtils.waitTimes.abnormalWait })) || '').trim();
    if (!opts.keepOpen) await this.closeAccountMenu();
    return who;
  }

  /** Close the account menu if it is open. */
  async closeAccountMenu(): Promise<void> {
    await this.page.keyboard.press('Escape').catch(() => {});
    if (await this.accountDropdown().isVisible().catch(() => false)) await this.accountMenuButton().click({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => {});
  }

  /** Drop the Program editor session of this browser context only (crm-mig's own cookies are left alone). */
  async resetSession(): Promise<void> {
    await this.page.context().clearCookies({ domain: /(^|\.)discount-crm-mig\.nakivo\.site$/ });
  }

  /** Account menu > Sign out; waits for the sign-in form. */
  async signOut(): Promise<void> {
    if (!(await this.signOutItem().isVisible().catch(() => false))) await this.accountMenuButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.signOutItem().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.usernameInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
  }

  /**
   * Sign in WITHOUT assuming it works: returns ok = true when the page leaves /login, or ok = false with the text
   * the sign-in page shows (e.g. "Incorrect username or password.").
   */
  async trySignIn(account: { username: string; password: string }): Promise<{ ok: boolean; message: string; url: string }> {
    await this.page.goto(`${baseUrl_discount_mig}login`, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
    await this.usernameInput().fill(account.username, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.passwordInput().fill(account.password, { timeout: CommonUtils.waitTimes.abnormalWait });
    await this.signInButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const left = this.page.waitForURL((u) => !/\/login$/.test(u.pathname), { timeout: CommonUtils.waitTimes.pageLoad }).then(() => 'left' as const);
    const refused = this.page.locator('#e.show, #e:visible').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).then(() => 'refused' as const);
    const outcome = await Promise.race([left, refused]).catch(() => 'timeout' as const);
    left.catch(() => {});
    refused.catch(() => {});
    if (outcome === 'left') {
      await this.page.goto(baseUrl_discount_mig, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
      await this.viewToggle('Kanban').waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
      return { ok: true, message: '', url: this.page.url() };
    }
    const message = ((await this.signInError().textContent({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    return { ok: false, message: message || `(no message - ${outcome})`, url: this.page.url() };
  }

  /** Account menu > Settings > Users (side menu); waits for the Accounts table. */
  async openUsers(): Promise<void> {
    await this.accountMenuButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.settingsItem().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.usersNavLink().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.usersNavLink().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.accountsHeading().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
  }

  /**
   * Settings > Users: one entry per account row - login, tags (Administrator / You), status, created + creator, and the
   * action buttons / notes of the row (Change password, Disable, Enable, "Administrator only").
   */
  async getAccountRows(): Promise<Array<{ login: string; tags: string[]; status: string; created: string; by: string; actions: string[]; note: string }>> {
    await this.accountsTable().locator('tbody tr').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return this.accountsTable().evaluate((t) => Array.from(t.querySelectorAll('tbody tr')).map((tr) => {
      const td = Array.from(tr.querySelectorAll(':scope > td'));
      const nameDiv = td[0]?.querySelector('.name');
      const tags = Array.from(nameDiv?.querySelectorAll('.tag') || []).map((x) => (x.textContent || '').trim());
      const login = Array.from(nameDiv?.childNodes || []).filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join('').trim();
      const by = ((td[2]?.querySelector('.desc')?.textContent) || '').replace(/^\s*by\s+/i, '').trim();
      const created = (td[2]?.firstChild?.textContent || '').trim();
      const actions = Array.from(td[3]?.querySelectorAll('button') || []).map((b) => (b.textContent || '').trim());
      const note = ((td[3]?.querySelector('.muted')?.textContent) || '').trim();
      return { login, tags, status: (td[1]?.textContent || '').trim(), created, by, actions, note };
    }));
  }

  /**
   * Settings > Users > Add account: Login + Password, then Add account. Returns the strength-bar label the dialog showed
   * for the password (Weak / Medium / Strong) and waits for the new row.
   */
  async addAccount(login: string, password: string): Promise<string> {
    await this.addAccountButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const dialog = this.addDialog();
    await dialog.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await dialog.locator('xpath=.//input[@id="login"]').or(dialog.locator('#login')).first().fill(login, { timeout: CommonUtils.waitTimes.abnormalWait });
    const pw = dialog.locator('xpath=.//input[@id="password"]').or(dialog.locator('#password')).first();
    await pw.fill(password, { timeout: CommonUtils.waitTimes.abnormalWait }); // fill fires "input" - the strength bar listens to it
    const strength = ((await dialog.locator('.pw-label').first().textContent({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')) || '').trim();
    await dialog.locator('xpath=.//button[@type="submit" and normalize-space()="Add account"]').or(dialog.locator('button[type="submit"]')).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.accountsTable().locator('tbody tr').filter({ hasText: login }).first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    return strength;
  }

  /** Settings > Users: Disable on the row of `login`, accepting "Disable this account? ..."; waits for status Disabled. */
  async disableAccount(login: string): Promise<{ confirmText: string; status: string }> {
    const row = this.accountsTable().locator('tbody tr').filter({ has: this.page.locator('.name', { hasText: new RegExp(`^\\s*${login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }) }).first();
    let confirmText = '';
    this.page.once('dialog', (d) => { confirmText = d.message(); d.accept().catch(() => {}); });
    await row.locator('xpath=.//button[normalize-space()="Disable"]').or(row.getByRole('button', { name: 'Disable' })).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.accountsHeading().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    const after = (await this.getAccountRows()).find((r) => r.login === login);
    return { confirmText, status: after?.status ?? '(row not found)' };
  }

  /** Back to the Discount Programs (Kanban) from anywhere in the editor. */
  async openProgramsKanban(): Promise<void> {
    await this.page.goto(baseUrl_discount_mig, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.pageLoad });
    await this.viewToggle('Kanban').waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.viewToggle('Kanban').click({ timeout: CommonUtils.waitTimes.abnormalWait });
  }

  /** Kanban: the first card of the Ended group - its promo code and name (nothing is opened). */
  async getFirstEndedProgram(): Promise<{ code: string; name: string }> {
    await this.endedCards().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return this.endedCards().first().evaluate((b) => ({
      code: (b.querySelector('.code-pill')?.textContent || '').trim(),
      name: (b.querySelector('.card-title')?.textContent || '').trim(),
    }));
  }

  /** Kanban: open the program whose card carries this promo code; returns its name as the read-only page shows it. */
  async openProgramByCode(code: string): Promise<string> {
    await this.cardByCode(code).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.programTitle().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return this.getOpenProgramName();
  }

  /** The open program's name, exactly as stored (textContent keeps double spaces). */
  async getOpenProgramName(): Promise<string> {
    return ((await this.programTitle().textContent({ timeout: CommonUtils.waitTimes.abnormalWait })) || '').trim();
  }

  // ------------------------------------------------------------------------------------------------------------
  // STANDARD (tester, 2026-10-27, from the CRM-12144_5.3 review): a spec that reads the Program editor reads it the way a
  // user does - Discount Programs in the KANBAN view (cards grouped Active / Scheduled / Ended / Needs the table) and
  // the PROGRAM PAGE a card opens ("When it applies", "Rewards", "Advanced"). Graph / Edit Table / List are used only
  // where the manual TC names them (CRM-12144_1.14 = QI TC-13: "Then click Edit Table", the version list on the left).
  // Read 2026-10-27 (rule v32): card = button.program-card[aria-label=<name>] > span.code-pill (class active|ended),
  // span.muted (scope label: "Specific products" | "Whole order"), span.card-reward ("-10%"), strong.card-title,
  // span.tag chips ("Min 1,400", "213 products", "Until 31 Dec 2099" | "01 Jul 2019 - 12 Dec 2019"); columns =
  // section[aria-label]. The "Version N / active" chip is a plain span (no version list behind it).
  // ------------------------------------------------------------------------------------------------------------

  /** Evidence hooks (read 2026-10-27): the top-bar version chip; the Kanban cards (each tagged by getKanbanCards() with
   *  data-pw-card="<code>"); the program-page rows tagged by readProgramConditions() / readProgramRewards(), and the two
   *  section headings - the place to outline a row that is ABSENT (no row of its own to mark). */
  static readonly VERSION_CHIP = '.version-chip';
  static readonly KANBAN_CARDS = '[data-pw-card]';
  static readonly PROGRAM_CONDITION_ROWS = '[data-pw-condition]';
  static readonly PROGRAM_CONDITIONS_HEADING = '[data-pw-verify="program-conditions-heading"]';
  static readonly PROGRAM_REWARD_ROWS = '[data-pw-reward]';
  static readonly PROGRAM_REWARDS_HEADING = '[data-pw-verify="program-rewards-heading"]';
  /** The program page's "Advanced" section - its heading and its body (tagged by readProgramConditions()). */
  static readonly PROGRAM_ADVANCED = '[data-pw-verify="program-advanced-heading"], [data-pw-verify="program-advanced"]';
  private static attrSelector(attr: string, value: string): string {
    return `[${attr}="${value.replace(/["\\]/g, '\\$&')}"]`;
  }
  static kanbanCardSelector(code: string): string {
    return DiscountProgramEditorPageMig.attrSelector('data-pw-card', code);
  }
  static conditionRowSelector(label: string): string {
    return DiscountProgramEditorPageMig.attrSelector('data-pw-condition', label);
  }
  static rewardRowSelector(label: string): string {
    return DiscountProgramEditorPageMig.attrSelector('data-pw-reward', label);
  }

  /**
   * Kanban: every program card of every column, in screen order - column (Active / Scheduled / Ended / Needs the
   * table), promo code, name, scope label, reward, and the tag chips. Each card is TAGGED data-pw-card="<code>" for a
   * verify-evidence shot (KANBAN_CARDS / kanbanCardSelector). Reads only - no card is opened.
   */
  async getKanbanCards(): Promise<Array<{ column: string; code: string; name: string; scope: string; reward: string; tags: string[] }>> {
    await this.page.locator('xpath=//button[contains(@class,"program-card")]').or(this.page.locator('button.program-card')).first()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return this.page.evaluate(() => {
      const t = (n: Element | null | undefined) => (n?.textContent || '').replace(/\s+/g, ' ').trim();
      return Array.from(document.querySelectorAll('section[aria-label]')).flatMap((sec) =>
        Array.from(sec.querySelectorAll('button.program-card')).map((b) => {
          const code = t(b.querySelector('.code-pill'));
          b.setAttribute('data-pw-card', code);
          return {
            column: sec.getAttribute('aria-label') || '',
            code,
            name: t(b.querySelector('.card-title')) || b.getAttribute('aria-label') || '',
            scope: t(b.querySelector('.muted')),
            reward: t(b.querySelector('.card-reward')),
            tags: Array.from(b.querySelectorAll('.tag')).map((x) => t(x)),
          };
        }));
    });
  }

  /** One section of the open program page: its rows, each TAGGED rowAttr="<label>", and its heading TAGGED headingTag. */
  private async readProgramSection(heading: string, rowAttr: string, headingTag: string): Promise<{
    sectionFound: boolean;
    rows: Array<{ label: string; hint: string; value: string; ticked: boolean | null }>;
    advanced: string;
    advancedFound: boolean;
  }> {
    await this.programTitle().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const form = this.page.locator('xpath=//section[contains(@class,"program-form")]').or(this.page.locator('section.program-form')).first();
    return form.evaluate((f, a) => {
      // text nodes joined with a space: the Products chips are adjacent spans ("Default Codeis any ofA2144B" otherwise),
      // and the "</> Show code" / "+N" / "Show less" buttons are not part of the value
      const text = (n: Element | null | undefined): string => {
        if (!n) return '';
        const parts: string[] = [];
        const walk = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
        for (let x = walk.nextNode(); x; x = walk.nextNode()) {
          if (!(x.parentElement?.closest('button.link-button, button.badge-more'))) parts.push(x.textContent || '');
        }
        return parts.join(' ').replace(/\s+/g, ' ').trim();
      };
      const start = Array.from(f.querySelectorAll('h2.section-head')).find((h) => text(h) === a.heading);
      start?.setAttribute('data-pw-verify', a.headingTag);
      const rows: Array<{ label: string; hint: string; value: string; ticked: boolean | null }> = [];
      for (let n = start?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
        if (!n.classList.contains('form-row')) continue;
        const label = text(n.querySelector('.form-label > span'));
        const box = n.querySelector('.form-value input[type="checkbox"]') as HTMLInputElement | null;
        const value = text(n.querySelector('.form-value'));
        n.setAttribute(a.rowAttr, label);
        rows.push({ label, hint: text(n.querySelector('.form-label > small')), value: value.length > 120 ? `${value.slice(0, 117)}...` : value, ticked: box ? box.checked : null });
      }
      // the "Advanced" section (heading "Advanced optional" + div.advanced-body) - TAGGED for a verify-evidence shot
      const advHead = Array.from(f.querySelectorAll('h2.section-head')).find((h) => text(h).startsWith('Advanced'));
      const advBody = f.querySelector('.advanced-body');
      advHead?.setAttribute('data-pw-verify', 'program-advanced-heading');
      advBody?.setAttribute('data-pw-verify', 'program-advanced');
      return { sectionFound: !!start, rows, advanced: text(advBody), advancedFound: !!advHead && !!advBody };
    }, { heading, rowAttr, headingTag });
  }

  /**
   * The open program page: the rows of its "When it applies" section (the conditions) - label, the grey hint under it,
   * the value as shown, and for a checkbox / switch row whether it is ticked (null when the row has none) - plus the text
   * of its "Advanced" section and whether that section is on the page. Each row is TAGGED data-pw-condition="<label>",
   * the heading PROGRAM_CONDITIONS_HEADING and the Advanced section PROGRAM_ADVANCED.
   * Page read 2026-10-27 (PROG1): section.program-form > h2.section-head "When it applies" then div.form-row
   * (div.form-label > span + small, div.form-value) up to the next h2 ("Rewards"); "Advanced" = div.advanced-body.
   * Read 2026-11-03 (rule v55): Advanced reads "No extra rules" on PROG1 and "Payer › Name is <name>" on a program limited
   * to one customer (NEW2) - the customer condition of spec v7 IS-CRM-FUNC-0074-02.
   * Reads only - every input on this page is disabled.
   */
  async readProgramConditions(): Promise<{
    sectionFound: boolean;
    rows: Array<{ label: string; hint: string; value: string; ticked: boolean | null }>;
    advanced: string;
    advancedFound: boolean;
  }> {
    return this.readProgramSection('When it applies', 'data-pw-condition', 'program-conditions-heading');
  }

  /**
   * The open program page: the rows of its "Rewards" section - read 2026-10-27 (PROG1): Reward ("10.00 % Applies to
   * Specific products" - the percentage and the scope), For (the lines that get the discount: "Products > Default Code is
   * any of A2144B A2145B A2212P", the rest folded behind "+N"), Reward line product, Promo code. Each row is TAGGED
   * data-pw-reward="<label>" and the heading PROGRAM_REWARDS_HEADING. Reads only.
   */
  async readProgramRewards(): Promise<{ sectionFound: boolean; rows: Array<{ label: string; hint: string; value: string; ticked: boolean | null }> }> {
    const { sectionFound, rows } = await this.readProgramSection('Rewards', 'data-pw-reward', 'program-rewards-heading');
    return { sectionFound, rows };
  }

  /**
   * The open program page: EVERY product code of one row (a condition row, e.g. "Products", or a reward row, e.g. "For").
   * The row shows three codes and folds the rest behind "+N" (button.badge-more, read 2026-10-27: "+210" -> all 213
   * codes, the button then reads "Show less") - "+N" is a view toggle, it is clicked when present. Nothing is edited.
   * @param rowSelector conditionRowSelector(label) or rewardRowSelector(label), after the matching read*() call
   */
  async getProgramRowCodes(rowSelector: string): Promise<string[]> {
    const row = this.page.locator(rowSelector).first();
    const more = row.locator('xpath=.//button[contains(@class,"badge-more")]').or(row.locator('button.badge-more')).first();
    const label = ((await more.textContent({ timeout: CommonUtils.waitTimes.standard }).catch(() => '')) || '').trim();
    if (/^\+\d+$/.test(label)) {
      await more.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await row.locator('xpath=.//button[contains(@class,"badge-more") and normalize-space()="Show less"]')
        .or(row.locator('button.badge-more', { hasText: 'Show less' })).first()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    }
    return row.evaluate((r) => Array.from(r.querySelectorAll('.badge')).map((b) => (b.textContent || '').trim()).filter(Boolean));
  }

  /** "Version N / active" in the top bar - the active version number (NaN when absent). */
  async getActiveVersionNumber(): Promise<number> {
    const t = (await this.page.locator('body').innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '';
    return Number((t.match(/Version (\d+) \/ active/i) || [])[1]);
  }

  /**
   * [TC-13 only - QI p.3] On the open program: Edit, change the name (append `suffix`, or remove `removeChars` characters
   * from its end), then Save - which saves the table as the next version. Waits for Edit to come back and for the top
   * bar to show the new active version. Throws with the page's "Fix ... before saving" text when Save is refused.
   * @returns the name typed and the active version before / after
   */
  async editOpenProgramName(change: { suffix?: string; removeChars?: number }): Promise<{ typed: string; versionBefore: number; versionAfter: number }> {
    const versionBefore = await this.getActiveVersionNumber();
    await this.detailButton('Edit').click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const input = this.programNameInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.page.keyboard.press('End');
    if (change.suffix) await this.page.keyboard.type(change.suffix);
    for (let i = 0; i < (change.removeChars ?? 0); i++) await this.page.keyboard.press('Backspace');
    const typed = await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.detailButton('Save').click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const back = await this.detailButton('Edit').waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).then(() => true, () => false);
    if (!back) {
      const problem = ((await this.saveProblems().textContent({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      throw new Error(`Program editor: Save did not complete${problem ? ` - "${problem}"` : ''}`);
    }
    let versionAfter = await this.getActiveVersionNumber();
    const deadline = Date.now() + CommonUtils.waitTimes.abnormalWait;
    while (!(versionAfter > versionBefore) && Date.now() < deadline) {
      await this.wait(CommonUtils.waitTimes.medium);
      versionAfter = await this.getActiveVersionNumber();
    }
    return { typed, versionBefore, versionAfter };
  }

  /** From the open program: back to Discount Programs, then Edit Table - the Versions list (newest first). */
  async openVersionListFromEditTable(): Promise<Array<{ version: number; active: boolean; label: string; author: string }>> {
    if (await this.crumbPrograms().isVisible().catch(() => false)) await this.crumbPrograms().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.viewToggle('Edit Table').click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.versionButtons().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    // innerText, not textContent: the button's parts are separate elements, and textContent runs the author into the
    // row count ("· qa-1792987934055" + "15 program rows" read as "qa-179298793405515 program rows", 2026-10-26)
    // so every TEXT NODE is read on its own
    const parts: string[][] = await this.versionButtons().evaluateAll((els) => els.map((e) => {
      const out: string[] = [];
      const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
      }
      return out;
    }));
    return parts.map((nodes) => {
      const label = nodes.join(' | ');
      const i = nodes.findIndex((t) => t.includes('·'));
      const rest = i >= 0 ? nodes[i].split('·').slice(1).join('·').trim() : '';
      const next = i >= 0 && nodes[i + 1] && !/program rows?$/i.test(nodes[i + 1]) ? nodes[i + 1] : '';
      return {
        version: Number((nodes.join(' ').match(/Version (\d+)/) || [])[1]), // "Version" and "12" are separate nodes
        active: nodes.some((t) => /^active$/i.test(t)),
        label,
        author: rest || next,
      };
    });
  }

  /** Edit Table -> Edit Programs (back to the programs). */
  async clickEditPrograms(): Promise<void> {
    await this.editProgramsButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.viewToggle('Kanban').waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.viewToggle('Kanban').click({ timeout: CommonUtils.waitTimes.abnormalWait });
  }

  // ------------------------------------------------------------------------------------------------------------
  // WRITES - the run's OWN test program only (tester, 2026-10-27: "QA có quyền tạo Discount program test (rồi teardown).
  // Ko sửa Discount program có sẵn"). Each method refuses a name that does not start with TEST_PROGRAM_PREFIX, so a spec
  // can never edit, archive or delete an existing program by accident. Every Save / Delete publishes the next rule
  // version. Screens read 2026-10-27 (explore discount-mig-editor-program-create-edit-delete-20261027): New program opens
  // section.program-form editing (Program name, Active, Valid from / to, For reseller / For distributor - disabled,
  // Minimum amount, Minimum quantity, Products "Add a rule", Reward percent, Applies to = Whole order | Specific products,
  // Reward line product (computed, "5.0% discount on total amount"), Promo code (left empty: the app gives NEW<n>),
  // Advanced "Add a rule" = Match ALL + Field / Operator / Value dropdowns); Save / Discard / Edit / Delete sit in
  // .detail-actions; Delete opens .confirm-dialog "Delete program?" with Cancel | Archive | Delete.
  // ------------------------------------------------------------------------------------------------------------

  /** The only programs a spec may write: its own, named `QA-Disc-<timestamp>`. */
  static readonly TEST_PROGRAM_PREFIX = 'QA-Disc-';

  private static assertTestProgram(name: string): void {
    if (!name.startsWith(DiscountProgramEditorPageMig.TEST_PROGRAM_PREFIX)) {
      throw new Error(`Program editor: refusing to write "${name}" - a spec writes only its own test program ` +
        `(${DiscountProgramEditorPageMig.TEST_PROGRAM_PREFIX}<timestamp>); existing programs are never edited (tester, 2026-10-27)`);
    }
  }

  private readonly newProgramButton = () => this.page.locator('xpath=//button[contains(normalize-space(),"New program")]').or(this.page.getByRole('button', { name: /New program/i })).first();
  private readonly programForm = () => this.page.locator('xpath=//section[contains(@class,"program-form")]').or(this.page.locator('section.program-form')).first();
  private readonly editingProgramForm = () => this.page.locator('xpath=//section[contains(@class,"program-form") and contains(@class,"editing")]').or(this.page.locator('section.program-form.editing')).first();
  private readonly programCardsNamed = (name: string) => this.page.locator(`xpath=//button[contains(@class,"program-card") and @aria-label=${DiscountProgramEditorPageMig.xpathLiteral(name)}]`);
  private readonly deleteDialog = () => this.page.locator('xpath=//div[contains(@class,"confirm-dialog") and @role="dialog"]').or(this.page.locator('.confirm-dialog[role="dialog"]')).first();
  private readonly openDropdownList = () => this.page.locator('xpath=//ul[@role="listbox" and contains(@class,"dropdown-list")]').or(this.page.locator('ul[role="listbox"].dropdown-list')).last();

  /** Program form: open one of the rule row's dropdowns (aria-label Field / Operator), narrow it, pick the option. */
  private async pickRuleDropdown(aria: 'Field' | 'Operator', option: string, search?: string): Promise<void> {
    await this.programForm().getByRole('button', { name: aria, exact: true }).last().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.openDropdownList().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const box = this.page.locator(`input[aria-label="Search ${aria.toLowerCase()}"]`).last();
    if (search && await box.isVisible().catch(() => false)) await box.fill(search);
    await this.openDropdownList().getByRole('option', { name: option, exact: true }).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
  }

  /** The top bar's active version, once it has moved past `before` (a Save publishes the next one) - NaN-safe. */
  private async waitForVersionAbove(before: number): Promise<number> {
    let v = await this.getActiveVersionNumber();
    const deadline = Date.now() + CommonUtils.waitTimes.abnormalWait * 2;
    while (!(v > before) && Date.now() < deadline) {
      await this.wait(CommonUtils.waitTimes.standard);
      v = await this.getActiveVersionNumber();
    }
    return v;
  }

  /** Click the detail-actions Save and wait for the editor to leave edit mode; throws with the page's own problem text. */
  private async saveProgramForm(): Promise<void> {
    await this.detailButton('Save').click({ timeout: CommonUtils.waitTimes.abnormalWait });
    // the read-only program page is a section.program-form too - only the EDITING one goes away on a completed Save
    const left = await this.editingProgramForm().waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true, () => false);
    if (!left) {
      const problem = ((await this.saveProblems().textContent({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      throw new Error(`Program editor: Save did not complete${problem ? ` - "${problem}"` : ''}`);
    }
  }

  /** Kanban: open the program card of this name; returns the name as its page shows it. */
  async openProgramByName(name: string): Promise<string> {
    await this.openProgramsKanban();
    await this.programCard(name).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.programTitle().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return this.getOpenProgramName();
  }

  /** Kanban: how many program cards carry this name (0 once it is deleted). */
  async countProgramCards(name: string): Promise<number> {
    await this.openProgramsKanban();
    await this.page.locator('xpath=//button[contains(@class,"program-card")]').or(this.page.locator('button.program-card')).first()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return this.programCardsNamed(name).count();
  }

  /** Program form, Products row: Add a rule (Products > Default Code / is any of - the defaults), Pick products, tick each
   *  code in the "Select products" dialog (search box "Search products", one table row per product, td.code), Apply.
   *  Read 2026-11-03 (explore discount-mig-editor-product-picker-20261103): the dialog lists "products the CRM sells";
   *  a row click toggles it (tr.on) and the footer counts "N picked". */
  private async pickProductsRule(codes: string[]): Promise<void> {
    await this.programForm().getByRole('button', { name: /^Add a rule$/ }).first().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.programForm().locator('xpath=.//button[contains(@class,"add-products")]').or(this.programForm().locator('button.add-products')).first()
      .click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const dialog = this.page.locator('xpath=//div[contains(@class,"product-dialog") and @role="dialog"]').or(this.page.locator('.product-dialog[role="dialog"]')).first();
    await dialog.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    for (const code of codes) {
      await dialog.getByRole('textbox', { name: 'Search products' }).fill(code);
      const row = dialog.locator(`xpath=.//tr[td[contains(@class,"code") and normalize-space()=${DiscountProgramEditorPageMig.xpathLiteral(code)}]]`).first();
      await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await row.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await dialog.locator(`xpath=.//tr[contains(@class,"on") and td[contains(@class,"code") and normalize-space()=${DiscountProgramEditorPageMig.xpathLiteral(code)}]]`).first()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    }
    const picked = ((await dialog.locator('xpath=.//footer//span[contains(normalize-space(),"picked")]').first().textContent().catch(() => '')) || '').trim();
    if (picked !== `${codes.length} picked`) throw new Error(`Program editor: the product picker reads "${picked}", expected "${codes.length} picked" (${codes.join(', ')})`);
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await dialog.waitFor({ state: 'detached', timeout: CommonUtils.waitTimes.abnormalWait });
  }

  /**
   * Program form, Validity: open the Valid from / Valid to picker (button.date-button, aria-haspopup="dialog") and click
   * the day. The picker is a month calendar of day buttons keyed data-cell="YYYY-MM-DD" with Previous / Next month,
   * Clear and Today - it has NO time input (read 2026-11-05, explore discount-mig-editor-date-picker-20261105), so only
   * the date part of `value` ("YYYY-MM-DD" or an Odoo "YYYY-MM-DD HH:mm:ss") is entered.
   * @returns the text the button shows after the pick
   */
  private async pickValidityDate(which: 'Valid from' | 'Valid to', value: string): Promise<string> {
    const day = (value.match(/^\d{4}-\d{2}-\d{2}/) || [])[0];
    if (!day) throw new Error(`Program editor: ${which} "${value}" is not a YYYY-MM-DD date`);
    const button = this.programForm().getByRole('button', { name: which, exact: true });
    await button.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const cell = this.page.locator(`button.calendar-day[data-cell="${day}"]:not(.outside)`).first();
    const months = (12 * Number(day.slice(0, 4)) + Number(day.slice(5, 7))) - (12 * new Date().getFullYear() + new Date().getMonth() + 1);
    for (let i = 0; i < Math.abs(months) && !(await cell.isVisible().catch(() => false)); i++) {
      await this.page.getByRole('button', { name: months > 0 ? 'Next month' : 'Previous month', exact: true }).last().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    }
    await cell.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    // Escape closes a picker left open without leaving the form (2026-11-05)
    if (await this.page.locator('button.calendar-day').first().isVisible().catch(() => false)) await this.page.keyboard.press('Escape');
    const shown = ((await button.textContent({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (!shown || /^(Any start|No end)$/.test(shown)) throw new Error(`Program editor: ${which} still reads "${shown}" after picking ${day}`);
    return shown;
  }

  /** Selector of the program form in edit mode - for verify-point outlines. */
  static readonly EDITING_FORM = 'section.program-form.editing';

  /**
   * Kanban path: Discount Programs > New program, then read the form WITHOUT saving: every row label (with the grey hint
   * under it), every control of the row (button / option / checkbox text, disabled or not) and the form's whole text.
   * Read only - discardProgramForm() leaves without publishing a version.
   */
  async readNewProgramForm(): Promise<{ text: string; rows: Array<{ label: string; hint: string; controls: string[]; disabled: string[] }> }> {
    await this.openProgramsKanban();
    await this.newProgramButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.editingProgramForm().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return this.editingProgramForm().first().evaluate((form) => {
      const t = (n: Element | null | undefined) => (n?.textContent || '').replace(/\s+/g, ' ').trim();
      const rows = Array.from(form.querySelectorAll('div.form-row')).map((row) => {
        const controls = Array.from(row.querySelectorAll('button, [role="option"], label, input[type="checkbox"]'));
        return {
          label: t(row.querySelector('div.form-label > span')),
          hint: t(row.querySelector('div.form-label > small')),
          controls: controls.map((c) => t(c) || (c as HTMLInputElement).getAttribute('aria-label') || c.tagName.toLowerCase()).filter(Boolean),
          disabled: controls.filter((c) => (c as HTMLInputElement).disabled).map((c) => t(c.closest('label') || c) || 'checkbox'),
        };
      });
      return { text: (form as HTMLElement).innerText.replace(/\s+/g, ' ').trim(), rows };
    });
  }

  /**
   * The open program form: try to tick a row's checkbox, then read its state. A disabled box is not clicked through
   * (the click times out after a few seconds and is reported as not ticked). Read 2026-11-05: For reseller / For
   * distributor are rendered disabled on New program.
   */
  async tryTickConditionRow(label: 'For reseller' | 'For distributor'): Promise<{ found: boolean; disabled: boolean; checked: boolean; text: string }> {
    const row = this.editingProgramForm().first().locator('div.form-row').filter({ has: this.page.locator('div.form-label > span', { hasText: new RegExp(`^\\s*${label}\\s*$`) }) }).first();
    const box = row.locator('input[type="checkbox"]').first();
    if (!(await box.count())) return { found: false, disabled: false, checked: false, text: '' };
    await box.click({ timeout: CommonUtils.waitTimes.medium * 2 }).catch(() => {});
    const text = ((await row.locator('div.form-value').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    return { found: true, disabled: await box.isDisabled(), checked: await box.isChecked(), text };
  }

  /** Discard the open program form (nothing is saved, no version is published). */
  async discardProgramForm(): Promise<void> {
    await this.detailButton('Discard').click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.editingProgramForm().first().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
  }

  /** Tick the checkbox of a "When it applies" row of the open program form (div.form-row > div.form-label > span). */
  private async tickConditionRow(label: 'For reseller' | 'For distributor'): Promise<void> {
    const row = this.programForm().locator('div.form-row').filter({ has: this.page.locator('div.form-label > span', { hasText: new RegExp(`^\\s*${label}\\s*$`) }) }).first();
    const box = row.locator('input[type="checkbox"]').first();
    await box.check({ timeout: CommonUtils.waitTimes.abnormalWait });
    if (!(await box.isChecked())) throw new Error(`Program editor: "${label}" is not ticked after check()`);
  }

  /**
   * Kanban path: Discount Programs > New program, fill the program form and Save (= the next version becomes the active
   * one). `fields` keyed on the form's labels: Program name (must start with TEST_PROGRAM_PREFIX), Reward (percent),
   * Applies to (Whole order | Specific products), For (accepted EMPTY only - the form shows it only for Specific
   * products), Promo code (the form pre-fills NEW<n>; typed over when given), Minimum quantity, Products (default codes -
   * the rule Products > Default Code is any of <codes>, picked in "Select products"), Valid from / Valid to (a day picked
   * in the calendar - see pickValidityDate), Advanced. Advanced accepts "customer name is <name>" only, entered as the
   * rule Payer > Name is <name> - crm-mig labels the order's customer (partner_id) "Payer", and the rule's code reads
   * partner_id.name == "<name>" (read 2026-10-27). For reseller / For distributor tick the row's checkbox ("Only orders
   * with a reseller / distributor") - spec v7 IS-CRM-FUNC-0087 drops that condition, the form still offers it (2026-11-05).
   * @returns the active version before / after the Save and the promo code the new card shows
   */
  async createProgramOnKanban(fields: {
    'Program name': string;
    Reward: string;
    'Applies to'?: 'Whole order' | 'Specific products';
    For?: '';
    'Promo code'?: string;
    'Minimum quantity'?: string;
    Products?: string[];
    'Valid from'?: string;
    'Valid to'?: string;
    'For reseller'?: boolean;
    'For distributor'?: boolean;
    Advanced?: string;
  }): Promise<{ versionBefore: number; versionAfter: number; code: string }> {
    const name = fields['Program name'];
    DiscountProgramEditorPageMig.assertTestProgram(name);
    const customer = fields.Advanced === undefined ? undefined : (fields.Advanced.match(/^customer name is (.+)$/i) || [])[1];
    if (fields.Advanced !== undefined && !customer) throw new Error(`Program editor: Advanced "${fields.Advanced}" is not supported - only "customer name is <name>"`);
    await this.openProgramsKanban();
    const versionBefore = await this.getActiveVersionNumber();
    await this.newProgramButton().click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.programForm().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.programNameInput().fill(name);
    const validFrom = fields['Valid from'] ? await this.pickValidityDate('Valid from', fields['Valid from']) : '';
    const validTo = fields['Valid to'] ? await this.pickValidityDate('Valid to', fields['Valid to']) : '';
    if (fields['For reseller']) await this.tickConditionRow('For reseller');
    if (fields['For distributor']) await this.tickConditionRow('For distributor');
    if (fields['Minimum quantity'] !== undefined) await this.programForm().getByRole('spinbutton', { name: 'Minimum quantity' }).fill(fields['Minimum quantity']);
    // Products before Advanced: the Products row owns the FIRST "Add a rule", Advanced the last one
    if (fields.Products?.length) await this.pickProductsRule(fields.Products);
    await this.programForm().getByRole('spinbutton', { name: 'Reward percent' }).fill(fields.Reward);
    if (fields['Applies to']) await this.programForm().getByRole('button', { name: fields['Applies to'], exact: true }).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    if (fields['Promo code'] !== undefined) await this.programForm().getByRole('textbox', { name: 'Promo code' }).fill(fields['Promo code']);
    if (customer) {
      // Advanced is the LAST "Add a rule" of the form (the first one belongs to Products)
      await this.programForm().getByRole('button', { name: /^Add a rule$/ }).last().click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await this.pickRuleDropdown('Field', 'Payer › Name', 'Name');
      await this.pickRuleDropdown('Operator', 'is');
      await this.programForm().getByRole('textbox', { name: 'Value' }).last().fill(customer);
    }
    console.log(`  - Program name        = ${name}`);
    console.log(`  - Valid from          = ${fields['Valid from'] ? `${fields['Valid from']} -> picked "${validFrom}" (the picker sets the day only)` : '(Any start)'}`);
    console.log(`  - Valid to            = ${fields['Valid to'] ? `${fields['Valid to']} -> picked "${validTo}" (the picker sets the day only)` : '(No end)'}`);
    if (fields['For reseller'] || fields['For distributor']) {
      console.log(`  - For reseller        = ${fields['For reseller'] ? 'ticked (Only orders with a reseller)' : 'not ticked'}`);
      console.log(`  - For distributor     = ${fields['For distributor'] ? 'ticked (Only orders with a distributor)' : 'not ticked'}`);
    }
    console.log(`  - Minimum quantity    = ${fields['Minimum quantity'] ?? '(empty)'}`);
    console.log(`  - Products            = ${fields.Products?.length ? `Products > Default Code is any of ${fields.Products.join(', ')}` : '(any product)'}`);
    console.log(`  - Reward              = ${fields.Reward} %`);
    console.log(`  - Applies to          = ${fields['Applies to'] ?? '(form default)'}`);
    console.log(`  - Promo code          = ${fields['Promo code'] ?? '(the form\'s NEW<n>)'}`);
    console.log(`  - Advanced            = ${customer ? `Payer > Name is ${customer}` : '(none)'}`);
    await this.saveProgramForm();
    const versionAfter = await this.waitForVersionAbove(versionBefore);
    await this.openProgramsKanban();
    const code = (await this.getKanbanCards()).find((c) => c.name === name)?.code ?? '';
    console.log(`  - Saved               : version ${versionBefore} -> ${versionAfter}, promo code ${code || '(card not found)'}`);
    return { versionBefore, versionAfter, code };
  }

  /**
   * Kanban path: open the card of the run's OWN test program, Edit, set Reward percent, Save (= the next version).
   * @returns the active version before / after the Save
   */
  async editProgramRewardOnKanban(name: string, percent: string): Promise<{ versionBefore: number; versionAfter: number }> {
    DiscountProgramEditorPageMig.assertTestProgram(name);
    await this.openProgramByName(name);
    const versionBefore = await this.getActiveVersionNumber();
    await this.detailButton('Edit').click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.programForm().getByRole('spinbutton', { name: 'Reward percent' }).fill(percent);
    console.log(`  - ${name}: Reward = ${percent} %`);
    await this.saveProgramForm();
    const versionAfter = await this.waitForVersionAbove(versionBefore);
    console.log(`  - Saved               : version ${versionBefore} -> ${versionAfter}`);
    return { versionBefore, versionAfter };
  }

  /**
   * Kanban path: open the card of the run's OWN test program, click Delete and confirm the deletion in the "Delete
   * program?" dialog (Cancel | Archive | Delete). No-op returning cardsLeft 0 when no card carries the name.
   * @returns the dialog text, the active version before / after, and how many cards still carry the name
   */
  async deleteProgramOnKanban(name: string): Promise<{ dialogText: string; versionBefore: number; versionAfter: number; cardsLeft: number }> {
    DiscountProgramEditorPageMig.assertTestProgram(name);
    if (!(await this.countProgramCards(name))) return { dialogText: '', versionBefore: NaN, versionAfter: NaN, cardsLeft: 0 };
    await this.openProgramByName(name);
    const versionBefore = await this.getActiveVersionNumber();
    await this.detailButton('Delete').click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.deleteDialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const dialogText = ((await this.deleteDialog().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    await this.deleteDialog().getByRole('button', { name: 'Delete', exact: true }).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const versionAfter = await this.waitForVersionAbove(versionBefore);
    const cardsLeft = await this.countProgramCards(name);
    console.log(`  - Deleted ${name}     : version ${versionBefore} -> ${versionAfter}, cards left ${cardsLeft}`);
    return { dialogText, versionBefore, versionAfter, cardsLeft };
  }

  /**
   * Kanban path: open the card of the run's OWN test program, click Delete, then ARCHIVE in the "Delete program?" dialog -
   * "Archive keeps it in the table but never offers it; you can switch it back on later" = IS-CRM-FUNC-0076 "disable-able
   * without deletion". Read 2026-11-05 (explore discount-mig-editor-validity-and-archive-20261105): Archive publishes the
   * next version, the program page shows the badge "Inactive" and the card moves to the Kanban column "Inactive"; the
   * archived card can still be opened and deleted (its dialog then offers Cancel | Delete only).
   * @returns the dialog text, the active version before / after, and the Kanban column the card sits in afterwards
   */
  async archiveProgramOnKanban(name: string): Promise<{ dialogText: string; versionBefore: number; versionAfter: number; column: string }> {
    DiscountProgramEditorPageMig.assertTestProgram(name);
    await this.openProgramByName(name);
    const versionBefore = await this.getActiveVersionNumber();
    await this.detailButton('Delete').click({ timeout: CommonUtils.waitTimes.abnormalWait });
    await this.deleteDialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const dialogText = ((await this.deleteDialog().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    await this.deleteDialog().getByRole('button', { name: 'Archive', exact: true }).click({ timeout: CommonUtils.waitTimes.abnormalWait });
    const versionAfter = await this.waitForVersionAbove(versionBefore);
    await this.openProgramsKanban();
    const column = (await this.getKanbanCards()).find((c) => c.name === name)?.column ?? '(card not found)';
    console.log(`  - Archived ${name}    : version ${versionBefore} -> ${versionAfter}, Kanban column "${column}"`);
    return { dialogText, versionBefore, versionAfter, column };
  }
}
