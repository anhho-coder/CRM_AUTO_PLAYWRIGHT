# k6 Login Load Test (Pre-Production)

Load-tests **concurrent login** to the Nakivo Partner Portal CRM (Odoo) by hitting the
real `POST /web/login` endpoint at the HTTP layer - so it measures the **server's**
login handling under N simultaneous users, not Chrome. VPN to pre-prod is required.

## Files
| File | Purpose |
|---|---|
| `login-load.js` | The k6 script. GET `/web/login` (session + csrf) -> POST credentials; success = 303/302. Self-contained HTML/JSON report via `handleSummary`. |
| `users.csv` | `email,password` per line, one distinct user per VU. Default = Thomas ×10. |
| `ensure-k6.ps1` | Bootstraps `k6.exe` on the Jenkins agent if not already installed. |
| `../Jenkinsfile.k6-login` | Jenkins pipeline (route pre-check → ensure k6 → run → publishHTML). |

## Run locally
```bash
# VPN up first
k6 run perf/k6/login-load.js
k6 run -e VUS=10 -e LOOPS=1 perf/k6/login-load.js
k6 run -e VUS=25 -e P95_MS=4000 perf/k6/login-load.js
```

## Env knobs
| Env | Default | Meaning |
|---|---|---|
| `VUS` | 10 | Concurrent virtual users (simultaneous logins). |
| `LOOPS` | 1 | Logins per VU. 1 = a single VUS-user burst. |
| `BASE_URL` | https://pre-production.nakivo.site | Pre-prod base URL (site forces HTTPS; internal cert -> `insecureSkipTLSVerify`). |
| `MAP_IP` | 10.220.222.100 | Host→IP map (mirrors `HOST_RESOLVER_MAP`). Blank to disable. |
| `P95_MS` | 3000 | p95 login-duration gate (ms). Build fails if exceeded. |

## Thresholds (pass/fail gate)
- `login_success` rate > 99%
- `http_req_failed` rate < 1%
- `login_duration` p95 < `P95_MS` ms

k6 exits non-zero when any threshold fails → the Jenkins build goes red.

## Jenkins
Create a **Pipeline** job → *Pipeline script from SCM* → branch `now_code_on_Cursor`,
Script Path `perf/Jenkinsfile.k6-login`. Report shows under **k6-Login-LoadTest**.

---

## Create-Lead tests (JSON-RPC, `crm.lead`)

Two scaling siblings that log each user in once, then exercise the lead-creation workload at
increasing concurrency (default `LEVELS=10,30,50,100`, one burst per level, `GAP_S` between them).

| Script | Jenkinsfile | Report | What it does |
|---|---|---|---|
| `create-lead-scale.js`  | `../Jenkinsfile.k6-create-lead`        | **k6-CreateLead-Scale**  | Really `create()`s a lead per user, then **bulk-deletes** them in teardown as an admin account. Measures the true persist path (includes the sequential assignment/scoring cron → high p95, `P95_MS`=20000). Needs Jenkins credential `crm-admin-preprod` for cleanup. |
| `create-lead-nosave.js` | `../Jenkinsfile.k6-create-lead-nosave` | **k6-CreateLead-NoSave** | Opens the New-Lead form and fills it — `default_get` + a chain of `onchange()` (in-memory ORM `new()`/NewId) — but **never saves**. Same server-side lead-form compute, **0 rows written**: no cron lock, no cleanup, no admin account, no DB drift. `P95_MS`=4000 (pure compute). A `VERIFY_NOSAVE` step asserts 0 rows carry the run marker. |

**Why the no-save variant** — the Odoo developer's tip: to "create a lead but not save", assert the
in-memory `onchange` result (e.g. `held == {"1": ["x_studio_field_MPZM0"]}`) instead of persisting.
The web client does exactly this while a form is open. It lets us load-test lead creation **without**
polluting pre-prod or fighting the assignment cron that locks freshly-created leads.

```bash
# no-save, local (VPN up):
k6 run -e RUN_ID=local1 perf/k6/create-lead-nosave.js
k6 run -e LEVELS=5,10 -e GAP_S=5 perf/k6/create-lead-nosave.js
```

Extra env knobs (no-save): `PARTNER_ID` (customer to select in `onchange`; `0`=auto-pick a company),
`VERIFY_NOSAVE` (`1`=assert nothing persisted, default). Jenkins: **Pipeline from SCM**, branch
`now_code_on_Cursor`, Script Path `perf/Jenkinsfile.k6-create-lead-nosave` — no credentials required.

---

## Cleanup ceiling — `TEARDOWN_S`

Deleting freshly-created records is the slowest part of these jobs, not the load itself: the
intentional sequential assignment/scoring cron locks each new row, so `unlink` blocks until the
cron moves past it. Measured on `CRM-K6-CreateLead-Scale` build #6 (InfluxDB,
`testid=create-lead-scale`, grouped by `rpc`):

| rpc | avg | p95 | max | reqs |
|---|---|---|---|---|
| `create` (the measured workload) | 7,360ms | 14,128ms | 15,704ms | 187 |
| `search` | 682ms | 707ms | 715ms | 19 |
| **`unlink` (teardown)** | **62,729ms** | **92,387ms** | **121,100ms** | 18 |

190 leads at 8 per batch = 24 batches, so cleanup needs ~37min at p95. The old hard-coded
`teardownTimeout: '1200s'` aborted it at round 18 → `k6` exit **101** → red build, even though
every load level had **PASSed**. Now `teardownTimeout` reads `TEARDOWN_S` (default **2700** = 45min)
and the pipeline `timeout` is **75 MINUTES** so Jenkins does not kill the build first.

- Raise `TEARDOWN_S` only together with the pipeline timeout — a teardown ceiling above the pipeline
  timeout just swaps a k6 timeout for a Jenkins abort.
- Applies to `create-lead-scale.js` and `create-record-scale.js` (contact/opp).
- The knob is guarded: an empty, non-numeric or non-positive `TEARDOWN_S` falls back to 2700
  rather than producing the invalid duration `'NaNs'` (the Jenkins param is a free-text string).

**Cleanup speed differs per model, so the levels do too.** Measured 2026-09-07, `unlink` per
batch of 8: `crm.lead` ~91s, `res.partner` ~**124s**. At 190 records that is ~25 batches for
lead/opportunity (both finished, `remaining=0`) but ~2976s for contacts - over the 2700s
ceiling. `CRM-K6-CreateContact-Scale` #2 therefore reported `Verdict: ALL PASS` for every load
level and still went red on `teardown() execution timed out`, leaving ~22 orphan
`K6PERF-j2-*` contacts behind. That job now defaults to `LEVELS=10,30,50` (90 records,
~12 batches, ~25min) instead of adding a fourth level. Contacts are the *fastest* to create
(p95 6,727ms at 100 users vs ~15,100ms for lead/opp) - the constraint is purely deletion.

| Job | records | levels | cleanup batches | fits 2700s |
|---|---|---|---|---|
| CreateLead-Scale | 190 | 10,30,50,100 | 25 @ ~91s = ~2280s | yes |
| CreateOpp-Scale | 190 | 10,30,50,100 | 25 @ ~91s = ~2280s | yes |
| CreateContact-Scale | 90 | 10,30,50 | ~12 @ ~124s = ~1490s | yes |

If a create-* build ever dies on `teardown() execution timed out`, records are left behind -
find them with a name filter of `K6PERF-<RUN_ID>-` (RUN_ID is `j<build number>`) and delete
them, because the next run uses a new RUN_ID and will not clean up the previous one's leftovers.

That is not hypothetical: `CreateLead-Scale` #6 (2026-08-04) left **38** `K6PERF-j6-*` leads
sitting on pre-prod for 34 days, and `CreateContact-Scale` #2 left **14** `K6PERF-j2-*`
contacts. Both sets were deleted 2026-09-07; #7 and `CreateOpp-Scale` #1 both finished with
`remaining=0` and left nothing.

**Why each model is slow differs.** For `crm.lead` it really is the assignment/scoring cron
holding freshly-created rows: the 34-day-old j6 leads deleted in 5 clean batches with no
timeout at all, while same-day leads needed ~91s per batch. For `res.partner` age makes no
difference - two-hour-old contacts still took over 90s per batch of 8 - so contact deletion is
intrinsically slow (cascading related-table checks), not cron-gated. Do not expect a wait or a
retry to speed contact cleanup up; reduce the record count instead, which is why that job runs
three levels.
- A red build here can mean *cleanup* failed while the perf result passed. Read the
  `=== k6 ... Scaling Report ===` verdict before treating it as a perf regression.

## Weekly schedule (Saturday evening)

Declared in each Jenkinsfile as `triggers { cron(...) }` — version-controlled, no Jenkins UI edit.
A declarative trigger only registers **after Jenkins has run that pipeline once** to read the new
Jenkinsfile, so each job needs one manual build after this change before its cron is live.

| Sat | Job | Jenkinsfile | Budget |
|---|---|---|---|
| 19:00 | CRM-K6-Login-Scale | `Jenkinsfile.k6-scale` | ~3min |
| 19:10 | CRM-K6-Login-LoadTest | `Jenkinsfile.k6-login` | ~1min |
| 19:20 | CRM-K6-LeadsList-Read | `Jenkinsfile.k6-leads-list` | ~2min |
| 19:30 | CRM-K6-SalesReport-Read | `Jenkinsfile.k6-sales-report` | ~3min |
| 19:40 | CRM-K6-CreateLead-NoSave | `Jenkinsfile.k6-create-lead-nosave` | ~2min |
| 19:50 | CRM-K6-CreateLead-Scale | `Jenkinsfile.k6-create-lead` | ~3min load + up to 45min cleanup |
| 21:00 | CRM-K6-CreateContact-Scale | `Jenkinsfile.k6-create-contact` | 60min budgeted |
| 22:10 | CRM-K6-CreateOpp-Scale | `Jenkinsfile.k6-create-opp` | 60min budgeted |

**Why staggered and not all at 19:00** — two k6 tests running at once against the same pre-prod each
become the other's background load, and every latency number in both reports is invalid.
`CRM-K6-Monitoring-Deploy` is deliberately left with **no** trigger: it installs the
InfluxDB/Grafana services and must stay manual.

Each run needs the **VPN route to pre-prod up on the Jenkins agent** — the `Route pre-check` stage
fails the build when `10.220.222.100:443` is unreachable, so a red Saturday build may simply mean
the route was down.
