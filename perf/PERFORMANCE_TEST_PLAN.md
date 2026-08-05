# NAKIVO CRM — Performance Test Plan (Pre-Production)

**Owner:** QA Automation · **Environment:** `pre-production.nakivo.site` (Odoo 12, VPN) ·
**Tooling:** k6 + Jenkins + InfluxDB / Grafana · **Status:** proposal (thresholds to be tuned with baselines)

---

## 0. Objectives / Mục tiêu

- Quantify **server-side latency & throughput** of the CRM's important flows under **concurrent load**, at the HTTP / Odoo JSON-RPC layer — measures Odoo + DB, **not the browser**.
- Establish a **per-feature baseline** and an **SLA gate** for each flow; catch **regressions across builds** via trend dashboards.
- Identify **scaling bottlenecks** — which flow degrades first, and why — to guide optimization.
- Non-goals: not a functional test, not browser/UX timing, not a production test.

## 1. Concurrency

- **Load model — Burst (default):** N virtual users each do the action **once, launched simultaneously** = "N users at the same instant" (k6 `per-vu-iterations`). Bursts run **sequentially** per level with a recovery `GAP` so levels don't overlap.
- **Standard ladder:** `1 → 10 → 30 → 50 → 100` (extensible). `1` = single-user floor latency; `100` = target peak. Stretch `200` for **cheap read/login** capacity probing only.
- **Write flows** capped at **100** by default (data-creation + cleanup cost + the intentional sequential assignment cron).
- **No think-time** (worst-case / stress). A later "realistic journey" profile can add think-time between steps.
- **Optional Phase 2 — Sustained / soak:** constant arrival rate (e.g. X req/s for 10–30 min) to expose leaks / queue growth; plus a **ramp break-point** run to find the knee.

| Level | Purpose |
|---|---|
| 1 | single-user baseline (floor latency) |
| 10 | light concurrency |
| 30 / 50 | moderate |
| 100 | target peak |
| 200 *(read/login only)* | capacity / break-point |

## 2. Scope

**In scope**
- Server-side performance of key CRM flows via HTTP + JSON-RPC (`/web/login`, `/web/dataset/call_kw`).
- Both **READ** (login, list/search, reports) and **WRITE** (create lead/opp…).
- Concurrency scaling 1–100 (extensible), burst model.

**Out of scope**
- Browser / UI rendering, client-side JS, real end-user network paths (use Playwright separately if needed).
- **Production** (`portal.nakivo.com`) — pre-prod only.
- **Async cron completion** (assignment / scoring) — runs after the request; measured separately if required, never inside the RPC.
- 3rd-party / email / integration latency.

**Environment & measurement**
- `pre-production.nakivo.site` → `10.220.222.100` (VPN required; k6 host-maps the name; TLS verify skipped for the internal cert).
- Each VU **logs in once** (not counted); the measured action is timed separately.
- Metric = k6 `http_req_duration` of the specific RPC (server processing + transfer). **Start/End defined per feature** (see §3).
- Success detection per feature (login = JS redirect to `/web`; create = `{"result": <id>}` with no `error`; read = result array).

**Data management (write flows)**
- All created records named `K6PERF-<RUN_ID>-*` (RUN_ID = `j<build#>`).
- Teardown **bulk-deletes by prefix as ADMIN** (a sales user can `create()` but not `unlink()`), via Jenkins credential `crm-admin-preprod`; **retry-loop + long timeout** to survive cron row-locks. Read/no-save flows write nothing → no cleanup.

**Initial SLA gates** (tune with baselines)
- Login p95 **< 3 s** · Reads p95 **< 3 s** · Create Lead p95 **< 20 s** (accepted — intentional sequential assignment cron) · other writes TBD after baseline.
- Success **> 99 %**, `http_req_failed` **< 1 %** (writes < 5 %).

## 3. Feature list

Priority **P1** (highest) → P3. Status: ✅ done · 🟡 in progress · ⬜ planned.

| # | Feature | Type | RPC / endpoint | Measured window (start → end) | Cleanup | **Prod-safe?** | Gate p95 | Prio | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Login** | read/auth | `POST /web/login` | send credentials → JS redirect to `/web` | none | ⚠️ auth-load\* | 3 s | P1 | ✅ `CRM-K6-Login-LoadTest` / `-Scale` |
| 2 | **Create Lead** (save) | write | `call_kw crm.lead create` | click **Save** → returns id | admin unlink | ❌ writes rows | 20 s | P1 | ✅ `CRM-K6-CreateLead-Scale` |
| 3 | **Open Lead form** (no-save) | read | `call_kw crm.lead default_get + onchange` | click New → form computed (**0 rows**) | none | ✅ 0 rows | 4 s | P2 | 🟡 `create-lead-nosave.js` (wire up) |
| 4 | **List / Pipeline read** | read | `call_kw crm.lead web_search_read` | request → result page | none | ✅ read-only | 3 s | P1 | ⬜ |
| 5 | **Sales Report** | read | `read_group` / report RPC | request → aggregated result | none | ⚠️ heavy read\* | TBD | P2 | ⬜ (ties to CRM-11415 / `CRM_SalesReport_Perf`) |
| 6 | **Create Opportunity** | write | `call_kw crm.lead create` (type=opportunity) | Save → id | admin unlink | ❌ writes rows | TBD | P2 | ⬜ |
| 7 | **Create Contact / Partner** | write | `call_kw res.partner create` | Save → id | admin unlink | ❌ writes rows | TBD | P3 | ⬜ |
| 8 | **Create Deal Element** | write | multi-RPC (needs company + contact + opp) | Save → id | admin unlink + deps | ❌ writes rows | TBD | P3 | ⬜ (heavy setup) |
| 9 | **Approve Quotation** | write/state | `call_kw sale.order` workflow action | action sent → state changed | seed pool + reset | ❌ mutates real records | TBD | P3 | ⬜ (needs seeded quotations) |
| 10 | **Register Payment** | write/state | `call_kw account.*` | action → validated | seed + reset | ❌ mutates (financial) | TBD | P3 | ⬜ |

**Prod-safe? legend** — the criterion is *does the test write or mutate data*:
- ✅ **Yes** — writes/mutates **no data** → could be promoted to a controlled Production smoke / load check.
- ⚠️ **Caution** — read-only but a caveat: **Login** = repeated auth of a real account can trip lockout / rate-limit (use a dedicated low-privilege account); **Sales Report** = heavy aggregate queries load the live DB.
- ❌ **No** — writes or mutates real records (junk data, real salespeople notified, financial state) → **never on Production**.

\*Even ✅/⚠️ tests still add **load** to the live system → on Production run only at **reduced concurrency, off-peak, with team coordination**. Production is otherwise **out of scope** (§2); this column marks only what *could* safely be promoted.

Each feature = its own parameterized Jenkins job `CRM-K6-<Feature>-Scale`, sharing the same harness (`LEVELS`, `GAP_S`, gate `P95_MS`, `INFLUX_URL` streaming). Write features reuse the Create-Lead cleanup pattern.

## 4. Report — k6 + Jenkins + InfluxDB / Grafana

**Layer A — Per-run (immediate, in Jenkins)**
- Each job publishes a **self-contained HTML** (`publishHTML`): per-level table (success, avg / p90 / p95 / max in **ms + minutes**), pass/fail gate, and a **"what is measured" RPC-window** explainer.
- Console log + archived `raw-metrics.json` + `summary-export.json`.

**Layer B — Aggregate / trend (cross-build, Grafana)**
- k6 streams to **InfluxDB 1.8** (`http://10.8.81.44:8086/k6`), tagged `testid=<feature>` + `build=<build#>` (+ level). **Best-effort:** if InfluxDB is down the job still runs and the HTML is still produced (already wired in `Jenkinsfile.k6-scale` via the `INFLUX_URL` param).
- **Grafana** (`http://10.8.81.44:3000`, admin / nakivo-k6) dashboards:
  - p95 latency **trend per feature** across builds (regression detection).
  - **Concurrency scaling curve** (p95 vs users) per feature.
  - Success / error-rate trend; throughput.
  - **Cross-feature comparison** (login vs create-lead vs reads).
- Stack deployed by Jenkins job `CRM-K6-Monitoring-Deploy` (native Windows services on 10.8.81.44, `E:\monitoring`). Optional: k6's official Grafana dashboard (ID 2587) as a starting template.

**Cadence:** on-demand per change; a **nightly/weekly scheduled scaling run** per P1 feature to grow the trend; ad-hoc break-point runs.

---

## Appendix — Roadmap

- **Phase 0 (done):** Login + Create-Lead baselines; InfluxDB/Grafana stack; streaming from `login-scale`.
- **Phase 1:** wire **no-save** + **reads/pipeline** (P1); point the Login & Create-Lead jobs at InfluxDB; build Grafana dashboards per feature.
- **Phase 2:** Create Opportunity + Sales Report; add the sustained/soak profile.
- **Phase 3:** Deal Element, Approve Quotation, Register Payment (stateful — seeded data + reset).

## Appendix — Current baselines (burst, no think-time)

| Feature | 10u p95 | 30u p95 | 50u p95 | 100u p95 | Success |
|---|---|---|---|---|---|
| Login | 0.44 s | 0.54 s | 0.59 s | 0.91 s | 100 % |
| Create Lead (save) | 2.7 s | 6.1 s | 8.7 s | 14–15 s | 100 % |

Reads/login scale **sub-linear** (healthy); writes scale worse and are gated at 20 s due to the sequential assignment cron.
