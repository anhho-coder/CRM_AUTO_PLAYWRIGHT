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
