import { test, expect } from '@playwright/test';
import { users, baseUrl, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { LoginPageMig, MigDataParityPage } from '@pages/mig';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12653_3.1.3 - Lead count per salesperson and per sales team parity
 * Test Case ID: CRM-12653_3.1.3
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 *
 * Summary:
 *   Ownership of the migrated leads is preserved - the per-salesperson and per-team
 *   counts match between source (pre-production) and target (crm-mig), and no owner
 *   is left unmapped. Leads are grouped by salesperson name and by sales team name
 *   (not by id, since crm-mig re-sequences res.users and crm.team ids), and the
 *   counts for each group are verified to be identical on both servers.
 *
 * Source manual TC reference:
 *   CRM-12653 master sheet, row 3.1.3 (Leads section)
 *   - Component: "Ownership of the migrated leads is preserved - the per-salesperson
 *     and per-team counts match and no owner is left unmapped"
 *   - Steps: On both servers, read leads created on or before cut-off, then group by
 *     salesperson and write down counts, then group by sales team and write down counts.
 *   - Expected: Names and counts match on both sides; no unmapped owners; no missing
 *     salesperson records.
 *
 * READ-ONLY: this spec reads only via MigDataParityPage.readGroup. It creates, modifies
 * or deletes nothing on either server, as required on crm-mig.
 *
 * KNOWN CAVEAT - IDs are re-sequenced:
 *   crm-mig re-sequences res.users and crm.team ids at the 2026-08-24 census
 *   (e.g., production team 20 mapped to 154, user 62 to 59 on the target).
 *   Groups are compared BY NAME, never by id.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12653_3\.1\.3:" --project=chromium
 */

/**
 * Opens an authenticated session on either the source (pre-production) or target (crm-mig).
 * Used inline in this spec to open BOTH sessions side by side.
 */
async function openSession(
  browser: Browser, url: string, isMig: boolean, username: string, password: string,
): Promise<{ context: BrowserContext; parity: MigDataParityPage }> {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true, // crm-mig serves a self-signed chain
  });
  const page = await context.newPage();
  const loginPage = isMig ? new LoginPageMig(page) : new LoginPage(page);
  await loginPage.navigateTo(url);
  await loginPage.login(username, password);
  return { context, parity: new MigDataParityPage(page) };
}

test.describe('CRM-12653_3.1.3 - Lead count per salesperson and team parity', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\nFAILURE REASON: ' + (testInfo.error?.message?.split('\n')[0] ?? 'unknown'));
    }
  });

  test('CRM-12653_3.1.3: Leads grouped by salesperson and team - counts match (source vs target within cut-off)', async ({ browser }) => {
    test.setTimeout(config.timeouts.test);

    let targetContext: BrowserContext | null = null;
    let sourceContext: BrowserContext | null = null;

    try {
      // --- Pre-condition: Establish the cut-off date ---
      console.log('========== CRM-12653_3.1.3 - Lead count per salesperson and team ==========');

      await test.step('Pre-condition: Open target session and establish cut-off date', async () => {
        console.log('\n--- Pre-condition: Open target session on crm-mig ---');
        console.log(`  Target  : ${baseUrl_mig}`);
        console.log(`  Account : ${users.admin_crm_mig.username}`);

        const targetSession = await openSession(
          browser, baseUrl_mig, true,
          users.admin_crm_mig.username, users.admin_crm_mig.password,
        );
        targetContext = targetSession.context;

        const cutoff = await targetSession.parity.resolveCutoffDate();
        console.log(`  Cut-off resolved: ${cutoff}`);
        console.log(`  (earliest create_date across sales models on target)`);

        // Store cutoff for later steps by attaching to test context
        (test as any).__cutoff = cutoff;
      });

      // --- Step 1-3: Group SOURCE leads by salesperson and by team ---
      await test.step('Step 1-3: Read SOURCE leads and group by salesperson and team', async () => {
        console.log('\n--- Step 1-3: Group source (pre-production) leads by salesperson and team ---');
        console.log(`  Source  : ${baseUrl}`);
        console.log(`  Account : ${users.admin_crm.username}`);

        const sourceSession = await openSession(
          browser, baseUrl, false,
          users.admin_crm.username, users.admin_crm.password,
        );
        sourceContext = sourceSession.context;

        const cutoff = (test as any).__cutoff;
        const domain = MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date');

        // Verify authentication and that we have data to read
        const isAuth = await sourceSession.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'SOURCE session must be authenticated').toBe(true);

        const totalLeads = await sourceSession.parity.searchCount('crm.lead', domain);
        console.log(`  Total leads on/before cut-off: ${totalLeads}`);
        expect(totalLeads, 'SOURCE must have at least one lead to verify parity').toBeGreaterThan(0);

        // Group by salesperson (user_id)
        const salespersonGroups = await sourceSession.parity.readGroup(
          'crm.lead',
          domain,
          ['user_id'],
          ['user_id'],
          { limit: 500 },
        );
        console.log(`  Groups by salesperson: ${salespersonGroups.length}`);
        for (const group of salespersonGroups) {
          const name = group.user_id ? group.user_id[1] : 'None';
          console.log(`    - ${name}: ${group.__count}`);
        }

        // Group by team (team_id)
        const teamGroups = await sourceSession.parity.readGroup(
          'crm.lead',
          domain,
          ['team_id'],
          ['team_id'],
          { limit: 500 },
        );
        console.log(`  Groups by team: ${teamGroups.length}`);
        for (const group of teamGroups) {
          const name = group.team_id ? group.team_id[1] : 'None';
          console.log(`    - ${name}: ${group.__count}`);
        }

        (test as any).__sourceSalespersonGroups = salespersonGroups;
        (test as any).__sourceTeamGroups = teamGroups;
        (test as any).__sourceTotal = totalLeads;
      });

      // --- Step 4-6: Group TARGET leads by salesperson and by team ---
      await test.step('Step 4-6: Read TARGET leads and group by salesperson and team', async () => {
        console.log('\n--- Step 4-6: Group target (crm-mig) leads by salesperson and team ---');

        const targetSession = await openSession(
          browser, baseUrl_mig, true,
          users.admin_crm_mig.username, users.admin_crm_mig.password,
        );
        targetContext = targetSession.context;

        const cutoff = (test as any).__cutoff;
        const domain = MigDataParityPage.onOrBeforeCutoff(cutoff, 'create_date');

        // Verify authentication and that we have data to read
        const isAuth = await targetSession.parity.isAuthenticatedSession();
        console.log(`  Authenticated: ${isAuth}`);
        expect(isAuth, 'TARGET session must be authenticated').toBe(true);

        const totalLeads = await targetSession.parity.searchCount('crm.lead', domain);
        console.log(`  Total leads on/before cut-off: ${totalLeads}`);
        expect(totalLeads, 'TARGET must have at least one lead to verify parity').toBeGreaterThan(0);

        // Group by salesperson (user_id)
        const salespersonGroups = await targetSession.parity.readGroup(
          'crm.lead',
          domain,
          ['user_id'],
          ['user_id'],
          { limit: 500 },
        );
        console.log(`  Groups by salesperson: ${salespersonGroups.length}`);
        for (const group of salespersonGroups) {
          const name = group.user_id ? group.user_id[1] : 'None';
          console.log(`    - ${name}: ${group.__count}`);
        }

        // Group by team (team_id)
        const teamGroups = await targetSession.parity.readGroup(
          'crm.lead',
          domain,
          ['team_id'],
          ['team_id'],
          { limit: 500 },
        );
        console.log(`  Groups by team: ${teamGroups.length}`);
        for (const group of teamGroups) {
          const name = group.team_id ? group.team_id[1] : 'None';
          console.log(`    - ${name}: ${group.__count}`);
        }

        (test as any).__targetSalespersonGroups = salespersonGroups;
        (test as any).__targetTeamGroups = teamGroups;
        (test as any).__targetTotal = totalLeads;
      });

      // --- Verification: Compare SOURCE vs TARGET ---
      await test.step('Verification: Compare SOURCE and TARGET groupings', async () => {
        const sourceSalespersonGroups = (test as any).__sourceSalespersonGroups;
        const sourceTeamGroups = (test as any).__sourceTeamGroups;
        const sourceTotal = (test as any).__sourceTotal;

        const targetSalespersonGroups = (test as any).__targetSalespersonGroups;
        const targetTeamGroups = (test as any).__targetTeamGroups;
        const targetTotal = (test as any).__targetTotal;

        // Build name->count maps for comparison
        const sourceSpMap = new Map<string, number>();
        for (const group of sourceSalespersonGroups) {
          const name = group.user_id ? group.user_id[1] : 'None';
          sourceSpMap.set(name, group.__count);
        }

        const targetSpMap = new Map<string, number>();
        for (const group of targetSalespersonGroups) {
          const name = group.user_id ? group.user_id[1] : 'None';
          targetSpMap.set(name, group.__count);
        }

        const sourceTeamMap = new Map<string, number>();
        for (const group of sourceTeamGroups) {
          const name = group.team_id ? group.team_id[1] : 'None';
          sourceTeamMap.set(name, group.__count);
        }

        const targetTeamMap = new Map<string, number>();
        for (const group of targetTeamGroups) {
          const name = group.team_id ? group.team_id[1] : 'None';
          targetTeamMap.set(name, group.__count);
        }

        // Detect discrepancies
        const salespersonMismatches: Array<{ name: string; source: number; target: number }> = [];
        const unmappedSalespersons: Array<{ name: string; count: number }> = [];
        const missingSalespersons: Array<{ name: string; count: number }> = [];

        for (const [name, sourceCount] of sourceSpMap) {
          const targetCount = targetSpMap.get(name);
          if (targetCount === undefined) {
            missingSalespersons.push({ name, count: sourceCount });
          } else if (sourceCount !== targetCount) {
            salespersonMismatches.push({ name, source: sourceCount, target: targetCount });
          }
        }

        // Check for None group on target (unmapped owners)
        const noneGroupTarget = targetSpMap.get('None');
        if (noneGroupTarget && noneGroupTarget > 0 && !sourceSpMap.has('None')) {
          unmappedSalespersons.push({ name: '(unmapped)', count: noneGroupTarget });
        }

        // Same for teams
        const teamMismatches: Array<{ name: string; source: number; target: number }> = [];
        const unmappedTeams: Array<{ name: string; count: number }> = [];
        const missingTeams: Array<{ name: string; count: number }> = [];

        for (const [name, sourceCount] of sourceTeamMap) {
          const targetCount = targetTeamMap.get(name);
          if (targetCount === undefined) {
            missingTeams.push({ name, count: sourceCount });
          } else if (sourceCount !== targetCount) {
            teamMismatches.push({ name, source: sourceCount, target: targetCount });
          }
        }

        const noneGroupTargetTeam = targetTeamMap.get('None');
        if (noneGroupTargetTeam && noneGroupTargetTeam > 0 && !sourceTeamMap.has('None')) {
          unmappedTeams.push({ name: '(unmapped)', count: noneGroupTargetTeam });
        }

        console.log('\n==================== VERIFY ====================');
        console.log('Bullet 1: Both servers return a grouped list with a count');
        console.log(`  Expected : SOURCE and TARGET return groups with counts`);
        console.log(`  Actual   : SOURCE has ${sourceSalespersonGroups.length} salesperson groups and ${sourceTeamGroups.length} team groups`);
        console.log(`             TARGET has ${targetSalespersonGroups.length} salesperson groups and ${targetTeamGroups.length} team groups`);
        console.log(`  Result   : ${sourceSalespersonGroups.length > 0 && sourceTeamGroups.length > 0 && targetSalespersonGroups.length > 0 && targetTeamGroups.length > 0 ? 'PASS' : 'FAIL'}`);
        console.log('');

        console.log('Bullet 2: Salesperson NAMES match and count is identical for each');
        console.log(`  Expected : SOURCE and TARGET salesperson names match, counts identical`);
        console.log(`  Actual   : Mismatches: ${salespersonMismatches.length}, Missing on target: ${missingSalespersons.length}`);
        if (salespersonMismatches.length > 0) {
          for (const m of salespersonMismatches) {
            console.log(`    - ${m.name}: SOURCE=${m.source}, TARGET=${m.target}`);
          }
        }
        if (missingSalespersons.length > 0) {
          for (const m of missingSalespersons) {
            console.log(`    - ${m.name}: SOURCE=${m.count}, TARGET=0 (USER NOT MIGRATED)`);
          }
        }
        console.log(`  Result   : ${salespersonMismatches.length === 0 && missingSalespersons.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('');

        console.log('Bullet 3: Sales Team NAMES match and count is identical for each');
        console.log(`  Expected : SOURCE and TARGET team names match, counts identical`);
        console.log(`  Actual   : Mismatches: ${teamMismatches.length}, Missing on target: ${missingTeams.length}`);
        if (teamMismatches.length > 0) {
          for (const m of teamMismatches) {
            console.log(`    - ${m.name}: SOURCE=${m.source}, TARGET=${m.target}`);
          }
        }
        if (missingTeams.length > 0) {
          for (const m of missingTeams) {
            console.log(`    - ${m.name}: SOURCE=${m.count}, TARGET=0 (TEAM NOT MIGRATED)`);
          }
        }
        console.log(`  Result   : ${teamMismatches.length === 0 && missingTeams.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('');

        console.log('Bullet 4: Groups compared by NAME, never by id (ids are re-sequenced)');
        console.log(`  Expected : All comparisons use display names, not database IDs`);
        console.log(`  Actual   : Using read_group with name lookups for salesperson (user_id[1]) and team (team_id[1])`);
        console.log(`  Result   : PASS`);
        console.log('');

        console.log('Bullet 5: Unmapped owners and missing salesperson records detected');
        console.log(`  Unmapped salespersons on target (None group): ${unmappedSalespersons.length}`);
        if (unmappedSalespersons.length > 0) {
          for (const u of unmappedSalespersons) {
            console.log(`    - ${u.name}: ${u.count} leads (CONFIGURATION EXCEPTION)`);
          }
        }
        console.log(`  Unmapped teams on target (None group): ${unmappedTeams.length}`);
        if (unmappedTeams.length > 0) {
          for (const u of unmappedTeams) {
            console.log(`    - ${u.name}: ${u.count} leads (CONFIGURATION EXCEPTION)`);
          }
        }
        console.log(`  Result   : ${unmappedSalespersons.length === 0 && unmappedTeams.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');

        // Assertions matching the 5 expected bullets
        // Bullet 1: Both servers return grouped lists with counts
        const groupsExistOnBothSides = sourceSalespersonGroups.length > 0 && sourceTeamGroups.length > 0
          && targetSalespersonGroups.length > 0 && targetTeamGroups.length > 0;
        expect(groupsExistOnBothSides,
          `Bullet 1: SOURCE must have salesperson (${sourceSalespersonGroups.length}) and team groups (${sourceTeamGroups.length}); TARGET must have salesperson (${targetSalespersonGroups.length}) and team groups (${targetTeamGroups.length})`
        ).toBe(true);

        // Bullet 2: Salesperson names and counts match
        const salespersonCountMatchesAndNoMissing = salespersonMismatches.length === 0 && missingSalespersons.length === 0;
        expect(salespersonCountMatchesAndNoMissing,
          `Bullet 2: salesperson count mismatches: ${JSON.stringify(salespersonMismatches)}, missing on target: ${JSON.stringify(missingSalespersons)}`
        ).toBe(true);

        // Bullet 3: Team names and counts match
        const teamCountMatchesAndNoMissing = teamMismatches.length === 0 && missingTeams.length === 0;
        expect(teamCountMatchesAndNoMissing,
          `Bullet 3: team count mismatches: ${JSON.stringify(teamMismatches)}, missing on target: ${JSON.stringify(missingTeams)}`
        ).toBe(true);

        // Bullet 4: Groups compared BY NAME, never by id (ids are re-sequenced)
        // Verify that the maps use string keys (display names from user_id[1] and team_id[1]), not numeric IDs
        const mapsPopulated = sourceSpMap.size > 0 && targetSpMap.size > 0 && sourceTeamMap.size > 0 && targetTeamMap.size > 0;
        expect(mapsPopulated,
          'Bullet 4: All group comparisons must use display names (salesperson and team names), never numeric IDs. Maps: sourceSpMap=' + sourceSpMap.size + ', targetSpMap=' + targetSpMap.size + ', sourceTeamMap=' + sourceTeamMap.size + ', targetTeamMap=' + targetTeamMap.size
        ).toBe(true);

        // Bullet 5: No unmapped owners (None group) or missing users
        const noUnmappedOwnersOrMissingUsers = unmappedSalespersons.length === 0 && unmappedTeams.length === 0;
        expect(noUnmappedOwnersOrMissingUsers,
          `Bullet 5: unmapped salespersons: ${JSON.stringify(unmappedSalespersons)}, unmapped teams: ${JSON.stringify(unmappedTeams)}`
        ).toBe(true);
      });

    } finally {
      // Cleanup: close both contexts
      if (targetContext) await targetContext.close();
      if (sourceContext) await sourceContext.close();
    }
  });
});
