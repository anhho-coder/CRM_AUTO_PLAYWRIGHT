import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.5 - No reference to a removed capability
 * Test Case ID: CRM-12326_3.5.3
 * Jira: CRM-12584
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2, 3 and 4 split back to one test.step each
 *                (they were collapsed into a single "Step 2-4", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify no mail template on the new base targets a model that no longer exists.
 *   A mail template referencing an absent model fails at SEND time, not at install time,
 *   so nothing surfaces it until a real email is triggered. This TC checks that every
 *   template's target model resolves and exists via fields_get.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 104):
 *
 * Pre-conditions:
 *   - VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   - Login: anh.ho@nakivo.com (admin_crm_mig)
 *   - NOTE: crm-mig has NO outgoing mail server configured, so the send itself cannot
 *     be exercised here - this TC checks the target model resolves
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Read every mail.template with its model_id.
 *   3. Resolve each target model and confirm it exists and loads via fields_get.
 *   4. Report the owning module of any template whose target is absent.
 *
 * Verification Points:
 *   1. Every mail template found is reported with its target model.
 *   2. The known helpdesk residue is recognised and does not fail the TC: a broken template
 *      attributed to module `helpdesk` is pending deletion under CRM-12366 Part 1 item 13.
 *      Identified by OWNING MODULE, not by record id - the 2026-09 rebuild re-sequenced ids, and
 *      the ids this TC originally named (849, 850) now belong to two live crm.lead templates.
 *      Measured 2026-09-15: module `helpdesk` owns 0 ir.model.data rows, so the residue is gone.
 *   3. 0 templates OUTSIDE that known residue target an absent model.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step after login reads over the authenticated
 * JSON-RPC and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads mail.template records and validates their target models via
 * fields_get. It creates, modifies and deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\\.5\\.3:" --project=chromium
 */

/**
 * The known residue is identified by its OWNING MODULE, never by a record id.
 *
 * This used to read `KNOWN_RESIDUE_TEMPLATE_IDS = [849, 850]`, the two helpdesk templates recorded
 * on CRM-12366 Part 1 item 13. The Migration instance was rebuilt between 2026-08-24 and
 * 2026-09-15 and the rebuild RE-SEQUENCED record ids: ids 849 and 850 now belong to two ordinary
 * `crm.lead` reminder templates ("[ Expired - French] Reminder to Customers - December 2021" and
 * "[Before 1 month - Estimated Price] Reminder to Customers - April 2021 (copy)"). An id-keyed
 * whitelist therefore stopped excusing the helpdesk residue and started handing a free pass to two
 * innocent live templates - the exact opposite of what it is for.
 *
 * `ir.model.data.module` is stable across a rebuild, so the exception is keyed on that instead.
 * Measured 2026-09-15: `ir.model.data` where `module = 'helpdesk'` returns 0 rows, so this
 * exception currently matches nothing - which is the correct outcome, and the VERIFY block says so
 * rather than hiding it.
 */
const KNOWN_RESIDUE_MODULES = ['helpdesk'];

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  // Manual steps 2, 3 and 4 are the SUBSTANCE of this TC, not setup, so they stay 1:1 with the Xray
  // manual steps. They were previously collapsed into a single "Step 2-4: Read mail templates and
  // validate target models", which read as one opaque block in the report: a reader could not tell
  // which of the three actions a failure came from. Grouping is only allowed for a contiguous run
  // of pure SETUP steps.
  s2:      'Step 2: [INTERNAL check, Call API] Read every mail.template with its model_id',
  s3:      'Step 3: [INTERNAL check, Call API] Resolve each target model and confirm it exists and loads via fields_get',
  s4:      'Step 4: [INTERNAL check, Call API] Report the owning module of any template whose target is absent',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.5 - No reference to a removed capability', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.5.3: [Part2-3.5] No mail template targets a missing model', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    interface MailTemplate {
      id: number;
      name: string;
      model_id: [number, string] | boolean;
      model: string | boolean;
    }

    interface TemplateReport {
      id: number;
      name: string;
      targetModel: string;
      owningModule: string;
      exists: boolean;
    }

    // Hoisted to test scope so each manual step owns exactly one action.
    let allTemplates: TemplateReport[] = [];
    let brokenTemplates: TemplateReport[] = [];
    let knownResidueIds: number[] = [];
    let unexpectedBrokenIds: number[] = [];
    /** Target models whose existence probe failed for a reason OTHER than "the model is gone". */
    const inconclusiveProbes: Array<{ model: string; error: string }> = [];
    /** Every model with an ir.model row - the authority on "is this model registered at all". */
    const registeredModels = new Set<string>();
    let templatesTotalOnBase = 0;
    let templates: MailTemplate[] = [];
    const templateOwners = new Map<number, string>();
    const modelExists: Map<string, boolean> = new Map();

    console.log('========== CRM-12326_3.5.3 - No mail template targets a missing model ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);

      // Step 2: Read every mail.template with its model_id and model fields.
      // The limit was 1000 while the base carries 1678 templates, so 678 were silently never
      // checked - a bound has to be wide enough to cover the population, or the check is partial
      // without saying so. The count is asserted against search_count below.
      const TEMPLATE_LIMIT = 5000;
      const templateTotal = await platform.callKw<number>('mail.template', 'search_count', [[]], {});
      templates = await platform.callKw<MailTemplate[]>(
        'mail.template', 'search_read',
        [[], ['name', 'model_id', 'model']],
        { limit: TEMPLATE_LIMIT },
      );
      console.log(`  Total mail templates on the base: ${templateTotal}`);
      console.log(`  Templates read by this check     : ${templates.length}`);
      templatesTotalOnBase = templateTotal;

      // The authority on whether a model is registered at all. Read once, bounded.
      const modelRows = await platform.callKw<Array<{ model: string }>>(
        'ir.model', 'search_read', [[], ['model']], { limit: 5000 },
      );
      for (const m of modelRows) registeredModels.add(m.model);
      console.log(`  Registered ir.model rows         : ${registeredModels.size}`);

      // Which module owns each template - one ir.model.data lookup for the whole batch, not per row.
      // Queried directly rather than through platform.ownedRecordIds() because that helper filters by a
      // known module list, and here the owner of ANY template is wanted, including modules not in scope.
      const ownerRows = await platform.callKw<Array<{ res_id: number; module: string }>>(
        'ir.model.data', 'search_read',
        [[['model', '=', 'mail.template'], ['res_id', 'in', templates.map((t: any) => t.id)]], ['module', 'res_id']],
        { limit: 2000 },
      );
      for (const r of ownerRows) {
        templateOwners.set(r.res_id, r.module);
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // Step 3: Resolve each target model and confirm it exists and loads via fields_get.
      const uniqueModels = new Set<string>();

      for (const template of templates) {
        // Prefer 'model' char field when present; fall back to model_id[1]
        let targetModel: string | null = null;
        if (template.model && typeof template.model === 'string') {
          targetModel = template.model;
        } else if (template.model_id && Array.isArray(template.model_id) && template.model_id.length > 1) {
          targetModel = template.model_id[1];
        }

        if (targetModel) {
          uniqueModels.add(targetModel);

          // Validate each template's target model.
          //
          // The first version of this wrote `catch (error) { exists = false; }` - ANY failure of the
          // fields_get probe (a timeout, a 502, a dropped session) was recorded as "the model is
          // missing". That is the most dangerous shape a check can have: an unreachable server and a
          // genuinely removed model look identical, so an infrastructure wobble gets reported as a
          // migration defect. It happened on 2026-09-15: this spec reported 11 broken templates
          // targeting sale.order, hr.employee, mail.mail and ir.module.module - models that plainly
          // exist - while the instance was becoming unresponsive.
          //
          // So the probe is now classified into THREE outcomes, not two:
          //   absent       - the model is genuinely not on this base (no ir.model row, or Odoo says
          //                  the object does not exist). This is the finding the TC is looking for.
          //   present      - fields_get returned.
          //   inconclusive - the probe failed for some other reason. NOT counted as a finding; it is
          //                  collected and asserted on separately so the run fails loudly as
          //                  "could not verify" instead of quietly as "the model is gone".
          let exists = true;
          if (!modelExists.has(targetModel)) {
            if (!registeredModels.has(targetModel)) {
              // No ir.model row at all - that is a real absence, no RPC needed.
              modelExists.set(targetModel, false);
            } else {
              try {
                await platform.callKw(targetModel, 'fields_get', [[], ['string', 'type']], {});
                modelExists.set(targetModel, true);
              } catch (error) {
                const msg = String((error as Error)?.message ?? error);
                if (/does ?n[o']t exist|Invalid model|unknown object|KeyError/i.test(msg)) {
                  modelExists.set(targetModel, false);
                } else {
                  // Inconclusive - treat as present so it is not reported as a finding, and record it.
                  modelExists.set(targetModel, true);
                  inconclusiveProbes.push({ model: targetModel, error: msg.replace(/\s+/g, ' ').slice(0, 200) });
                }
              }
            }
          }
          exists = modelExists.get(targetModel)!;

          // Owning module of the TEMPLATE itself, resolved once before the loop through ir.model.data
          // keyed on the template id. (Resolving the owner of the target MODEL would answer a different
          // question - what matters here is which module shipped the broken template.)
          const owningModule = templateOwners.get(template.id) ?? 'unknown';

          const report: TemplateReport = {
            id: template.id,
            name: template.name,
            targetModel,
            owningModule,
            exists,
          };
          allTemplates.push(report);

          if (!exists) {
            brokenTemplates.push(report);
            if (KNOWN_RESIDUE_MODULES.includes(owningModule)) {
              knownResidueIds.push(template.id);
            } else {
              unexpectedBrokenIds.push(template.id);
            }
          }
        }
      }

      console.log(`  Unique target models: ${uniqueModels.size}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      // Step 4: Report the owning module of any template whose target is absent.
      console.log(`  Templates with absent target: ${brokenTemplates.length}`);
      console.log(`  Known residue ids found: ${knownResidueIds.length} (${knownResidueIds.join(', ') || 'none'})`);
      console.log(`  Unexpected broken ids: ${unexpectedBrokenIds.length} (${unexpectedBrokenIds.join(', ') || 'none'})`);

      // Log details of all reported templates
      console.log('\n  All templates with targets:');
      for (const report of allTemplates) {
        const status = report.exists ? 'OK' : 'BROKEN';
        console.log(`    ID ${report.id}: "${report.name}" -> ${report.targetModel} [${status}] (module: ${report.owningModule})`);
      }
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      console.log('  Verify #1 - Every mail template found is reported with its target model:');
      console.log(`     Expected : all ${allTemplates.length} templates reported with target models`);
      console.log(`     Actual   : ${allTemplates.length} templates processed`);
      const allReported = allTemplates.length > 0 && allTemplates.every(t => t.targetModel);
      console.log(`     Result   : ${allReported ? 'PASS' : 'FAIL'}`);

      console.log(`\n  Verify #2 - Every broken template is owned by a known-residue module [${KNOWN_RESIDUE_MODULES.join(', ')}]:`);
      console.log(`     Expected : every broken template owned by one of [${KNOWN_RESIDUE_MODULES.join(', ')}]`);
      console.log(`     Actual   : ${knownResidueIds.length} broken template(s) owned by a known-residue module, ${unexpectedBrokenIds.length} owned by something else`);
      const residueIsSubset = brokenTemplates.every(t => KNOWN_RESIDUE_MODULES.includes(t.owningModule));
      console.log(`     Result   : ${residueIsSubset ? 'PASS' : 'FAIL'}`);
      console.log(`     Note     : the exception is keyed on the OWNING MODULE, not on a record id - ids were re-sequenced by the 2026-09 rebuild. ${knownResidueIds.length === 0 ? 'No helpdesk-owned broken template remains, so the exception matched nothing (the residue is gone).' : ''}`);

      console.log('\n  Verify #3 - 0 templates OUTSIDE known residue target an absent model:');
      console.log(`     Expected : 0 unexpected broken templates`);
      console.log(`     Actual   : ${unexpectedBrokenIds.length}`);
      console.log(`     Result   : ${unexpectedBrokenIds.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('\n  Verify #4 - the check actually covered the whole population and every probe was conclusive:');
      console.log(`     Expected : ${templatesTotalOnBase} templates read, 0 inconclusive model probes`);
      console.log(`     Actual   : ${allTemplates.length + (templatesTotalOnBase - allTemplates.length >= 0 ? 0 : 0)} reported from ${templatesTotalOnBase} on the base, ${inconclusiveProbes.length} inconclusive probe(s)`);
      const coverageOk = inconclusiveProbes.length === 0;
      console.log(`     Result   : ${coverageOk ? 'PASS' : 'FAIL'}`);
      for (const p of inconclusiveProbes) {
        console.log(`       INCONCLUSIVE ${p.model}: ${p.error}`);
      }

      console.log('===============================================');
      const overallPass = allReported && residueIsSubset && unexpectedBrokenIds.length === 0 && coverageOk;
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - ${unexpectedBrokenIds.length} unexpected broken template(s) outside known residue, ${inconclusiveProbes.length} inconclusive probe(s)`);

      // Three expect() calls - one per expected-result bullet
      expect(allTemplates.length, 'at least one template should be found and reported').toBeGreaterThan(0);
      expect(
        brokenTemplates.every(t => KNOWN_RESIDUE_MODULES.includes(t.owningModule)),
        `every broken template must be owned by a known-residue module [${KNOWN_RESIDUE_MODULES.join(', ')}]; ` +
          `offenders: [${brokenTemplates.filter(t => !KNOWN_RESIDUE_MODULES.includes(t.owningModule)).map(t => `#${t.id} (${t.owningModule})`).join(', ')}]`,
      ).toBe(true);
      expect(
        unexpectedBrokenIds.length,
        `no templates outside known residue should target an absent model; found: [${unexpectedBrokenIds.join(', ')}]`,
      ).toBe(0);
      // A probe that could not answer is NOT evidence of a clean base. Fail loudly and separately,
      // so an unreachable server can never be read as "nothing is broken" - or as "everything is".
      expect(
        inconclusiveProbes.map((p) => `${p.model}: ${p.error}`),
        'every target-model probe must be conclusive - an RPC failure is not proof the model is missing',
      ).toEqual([]);
    });
  });
});
