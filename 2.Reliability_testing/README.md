# 2. Reliability testing

Group 2 of the non-functional test plan; group 1 is [`1.Performance_testing/`](../1.Performance_testing/).
This group answers one question: after the link between two systems breaks and comes back, does every
record still arrive **complete, exact, and exactly once**?

## Scope: lead intake from web forms (B → A)

| | |
|---|---|
| **A** | the CRM on pre-production (`https://pre-production.nakivo.site`, db `nakivo`) |
| **B** | the web-form collector that pushes each submission into A as a Lead. In production that is Zapier calling Odoo's external API |
| **The test** | plays B. It sends each form through the same external API (the `/jsonrpc` `object.execute_kw` service; Zapier uses the XML-RPC encoding of the same service) as the integration account `sale_ic_thomas`. It checks the results and cleans up as `admin_crm` |

The outage is **emulated on the client side**:
- "outage" means B holds the forms and sends nothing;
- "connection drops before CRM answers" means B stops waiting after 0.3 s, while the create keeps running on the server for about 3 s.

The network between a real B and A is **not** cut. Cutting it needs devops, for example a Toxiproxy between B and A. These specs verify A's side of the recovery.

The Integration Hub endpoint `/nakivo_hub/create` is **not deployed on pre-production**. On 2026-11-03 it answered 404, the same as a made-up route. That is why the specs call the external API directly.

## Test cases

Manual source: `D:\Claude - ready to import to Xray\Reliability_lead-intake_outage-recovery_testcases.xlsx`.
They are not in Xray yet. Once they are, add the Jira key to each spec's header and title.

| TC | Scenario | Spec |
|---|---|---|
| Reliability_1.1.1 | 10 forms held during an outage are sent all at once after the reconnect, while 3 new forms arrive. Expect exactly 13 Leads with exactly the submitted data | [tc-reliability-1-1-1-…](1.Lead-intake-from-web-forms/1.1.Connection-outage-and-recovery/tc-reliability-1-1-1-backlog-replay-after-outage.spec.ts) |
| Reliability_1.1.2 | The answer to a send is lost, so B re-sends the same form. Expect exactly 1 Lead for it | [tc-reliability-1-1-2-…](1.Lead-intake-from-web-forms/1.1.Connection-outage-and-recovery/tc-reliability-1-1-2-lost-answer-resend-no-duplicate.spec.ts) |
| Reliability_1.1.3 | Delivery of a 10-form backlog is cut at S05, then B re-sends every unconfirmed form (S05..S10). Expect exactly 10 Leads: nothing lost, nothing duplicated | [tc-reliability-1-1-3-…](1.Lead-intake-from-web-forms/1.1.Connection-outage-and-recovery/tc-reliability-1-1-3-interrupted-flush-resend-unconfirmed.spec.ts) |

## Run

```bash
# VPN on. Point CRM_SECRETS_FILE at config/users.secrets.json if this checkout has none.
npx playwright test --project=Reliability --workers=1
npx playwright test --project=Reliability --grep "Reliability_1\.1\.2:"
```

The `Reliability` project lives outside `./tests` on purpose, so no section suite or regression job collects these specs. The specs are API-only: no browser opens, and stdout is the evidence (the VERIFY block).

## Test data and teardown

- Every record carries the run marker `AUTO-REL-<tc>-<runId>`: in the Lead name, and in the Company / email of the Customer that CRM generates from it.
- `afterEach` waits up to 5 minutes for CRM to finish creating those Customers. CRM creates them 40-90 s after the Lead. The hook then deletes the run's Leads and Customers, finding them only by this run's marker. If more records match than the run can own, it stops without deleting anything.
- On a gateway error (pre-prod answered 502 for several minutes during a run on 2026-11-03), the whole teardown retries for up to 5 minutes. It is safe to repeat because it looks the records up by marker each time.
- Customers are deleted one per call. On 2026-11-03 a 26-record batch overran 60 s; a single record takes about 1.2 s.
- A line `LEFTOVER - sweep by marker ...` in the log means the teardown missed something. Remove it by that marker only.

## Open questions

- **Who prevents the duplicate?** When B re-sends a form whose answer was lost, should the CRM, the Integration Hub or the lead-merge job stop the second Lead? Neither the FRD nor the tickets read so far say. The "exactly 1 Lead" expectations in 1.1.2 and 1.1.3 come from the test goal ("every form arrives complete and exact"). They need confirmation from Dev/PM.
- What does Zapier really do when a call times out: auto-replay, or mark the task as errored? The answer decides how realistic 1.1.2 and 1.1.3 are.
