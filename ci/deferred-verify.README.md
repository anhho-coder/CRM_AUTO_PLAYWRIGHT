# Lead-Assignment Deferred Re-Verify

Handles the flaky failure where the **async Sales-Team / Salesperson assignment cron**
has not run by the time a lead-assignment spec asserts, so the field is empty
(`Received: ""`) and round-1 fails — even though the lead is usually assigned correctly
**>30 min later**. Instead of blocking each test for 30–90 min, we record the lead URL and
re-verify it in one consolidated round ~1 hour later.

## Flow

```
ROUND 1 (normal runs)                         ROUND 2 (~1h later, authoritative)
─────────────────────                         ──────────────────────────────────
CRM_Leads_Assignment  ┐                        CRM_Leads_Assignment_DeferredVerify
CRM_O12 (UC-A-3)      ─┤ each spec appends      1. gather C:\deferred-verify\<day>\*.jsonl
CRM_..._THD_SlowLane  ┘ {leadUrl,field,          →  deferred-verify/gathered.jsonl (one cluster)
                        expected} to            2. login once, re-open each lead URL,
   deferred-verify/la.jsonl                        read Sales Team / Salesperson
        │  post{} stashes a dated copy →        3. PASS = cron caught up (field now set/correct)
   C:\deferred-verify\<yyyy-MM-dd>\<JOB>-<BUILD>.jsonl   FAIL = STILL wrong after 1h = real defect
```

`Received:""` in round-1 is no longer a hard verdict for assignment — **round-2 is the
source of truth**. Round-1 still measures the *immediate*-assignment rate; round-2 measures
the *eventual*-assignment rate.

## Pieces (all in-repo)

| Piece | File |
|---|---|
| Manifest emitter (env-gated, no-op unless `DEFERRED_MANIFEST` set) | `helpers/deferred-verify.helper.ts` |
| Round-1 emit chokepoints | `LeadPage.verifySalesTeamAssignment()` (exact team) + `LeadPage.waitForSalesTeamAssignment()` (non-empty sentinel) |
| Round-2 spec | `tests/1.Project_CRM/2.Leads_Assignment/_deferred-verify/deferred-verify-lead-assignment.spec.ts` |
| Round-1 emit + dated stash | `Jenkinsfile`, `ci/Jenkinsfile.slow` (env `DEFERRED_MANIFEST`, clean step, `post{}` stash) |
| Round-2 pipeline | `ci/Jenkinsfile.leads-assignment-deferred-verify` |
| Manual trigger driver | `../jenkins_deferred_verify/run_deferred_verify.sh` |

## Dedup / union semantics

- Round-2 dedups by `leadUrl + field`, keeping the **latest** record (by `runAtIso`). So when a
  spec calls `waitForSalesTeamAssignment` (records `<non-empty>`) and then
  `verifySalesTeamAssignment('THD')` (records `THD`), the exact-team record wins.
- The dated bucket unions **all** round-1 jobs/builds of the day (build-keyed filenames never
  overwrite), so chunked O12 runs and parallel section jobs all fold into one last round.
- `expected == "<non-empty>"` → round-2 checks the field is simply no longer empty (the core
  "async cron eventually ran" check). A real team name → exact match.

## Create Job B in Jenkins (one-time, outward-facing — do this manually)

New Pipeline job **`CRM_Leads_Assignment_DeferredVerify`**:
- Pipeline → *Pipeline script from SCM* → same repo/branch as the other jobs
  (`now_code_on_Cursor`) → **Script Path:** `ci/Jenkinsfile.leads-assignment-deferred-verify`.
- The pipeline declares its own parameters + a `cron('H 6 * * *')` trigger on first build.
  **Adjust the hour** to ~1h after your round-1 nightly finishes.
- First build registers the params/trigger (Jenkins quirk: SCM-declared params/triggers apply
  only after one build runs).

## Run manually

```bash
/d/Automation_CRM/jenkins_deferred_verify/run_deferred_verify.sh            # today's cluster
/d/Automation_CRM/jenkins_deferred_verify/run_deferred_verify.sh yesterday  # yesterday's
/d/Automation_CRM/jenkins_deferred_verify/run_deferred_verify.sh 2026-07-30 # exact day
```

## Local (dev) behaviour

Everything is a **no-op unless `DEFERRED_MANIFEST` is set**, so local `npx playwright test`
runs are unaffected. To exercise round-1 emit locally:
`DEFERRED_MANIFEST=deferred-verify/la.jsonl npx playwright test <assignment spec>`.
The round-2 spec self-skips unless BOTH `DEFERRED_VERIFY_RUN=1` and `DEFERRED_MANIFEST` are set.

## Phase-2 (not yet wired)

The 16 convert-lead-to-Opportunity specs (`O12 .../UC-A-4 .../TC.-A.4.3/4.4.*`) verify the
assigned Team/Salesperson on the **Opportunity** form via `OpportunityPage` getters. They are
NOT emitted yet: round-2 reads with `LeadPage` getters, whose readonly locators target the Lead
form. To include them, add an `OpportunityPage` read path to the round-2 spec (opps are
`crm.lead` records, so the URL re-opens fine — only the field-read locators differ).
