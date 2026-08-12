# NAKIVO CRM — Performance Test Plan (Pre-Production)

**Purpose:** measure how fast the CRM's key actions respond when many people use them at the same time, on the pre-production system. **Status:** proposal.

## 1. Objectives
- See how fast important CRM actions (log in, create a lead, open a form, view lists / reports) respond under **many simultaneous users**.
- Set a **response-time target** for each action and check we meet it.
- **Track results over time** to catch slowdowns (regressions) early.
- Find **which action struggles first** as load grows, so developers know where to optimize.

*We measure the server's response time — not how the web page looks or feels.*

## 2. Tools
| Tool | What it does |
|---|---|
| **k6** | The load-testing engine. Simulates many users doing an action at the same instant and records response times. |
| **Jenkins** | Runs each test (on demand or on a schedule) and publishes a per-run report: pass/fail + a table of numbers. |
| **InfluxDB** | A database that stores the numbers from every run. |
| **Grafana** | Dashboards that chart the stored results over time (trends and comparisons). |

## 3. Scope
**In scope:** server response time and success rate of key CRM actions, under many simultaneous users, on pre-production.

**Out of scope:** the look / feel of the web UI; the live Production system; background jobs that finish later on their own; third-party services (email, integrations).

### Environment & Data
- Runs against **pre-production** (VPN required) — never Production by default.
- **Read** actions (log in, view lists / reports): create no data.
- **Write** actions (create a lead, etc.): every test record is clearly tagged and **automatically deleted right after the run** — nothing is left behind.

## 4. Test Types
Today we run **Load testing**: increase the number of simultaneous users step by step and watch how response time and success rate hold up.

**Concurrency ladder (simultaneous users):**

| Users | Purpose |
|---|---|
| 1 | single-user baseline (best-case speed) |
| 10 | light load |
| 30 / 50 | medium load |
| 100 | target peak |

Each level runs as a **burst** — that many users do the action at the same instant; levels run one after another with a short recovery gap.

**Other test types we can add later:**
- **Stress test** — push past 100 users to find the breaking point.
- **Soak / endurance** — sustain load for a longer time to catch slow leaks.
- **Spike test** — a sudden surge of users.

## 5. Features to test
Priority P1 (highest) → P3. Status: Done / In progress / Planned. (p95 = 95% of requests are faster than this value.)

| # | Feature | What we time | Read / Write | Prod-safe? | Target p95 | Prio | Status |
|---|---|---|---|---|---|---|---|
| 1 | Log in | time to log in | Read | ⚠️ Caution | 3 s | P1 | Done |
| 2 | Create a lead (save) | from Save until the lead is saved | Write | ❌ No | 20 s | P1 | Done |
| 3 | Open the new-lead form | open + prepare a blank form (nothing saved) | Read | ✅ Yes | 4 s | P2 | In progress |
| 4 | View the leads list / pipeline | time to load the list | Read | ✅ Yes | 3 s | P1 | **Done** |
| 5 | Sales report | time to produce the report | Read | ⚠️ Caution | 8 s | P2 | **Done** |
| 6 | Create an opportunity | from Save until saved | Write | ❌ No | 20 s | P2 | **Done** |
| 7 | Create a contact | from Save until saved | Write | ❌ No | 20 s | P3 | **Done** |
| 8 | Create a deal element | from Save until saved (needs setup data) | Write | ❌ No | TBD | P3 | Deferred (UI-flow) |
| 9 | Approve a quotation | from click until the status changes | Write | ❌ No | TBD | P3 | Deferred (UI-flow) |
| 10 | Register a payment | from click until confirmed | Write | ❌ No | TBD | P3 | Deferred (UI-flow) |

> **#8/#9/#10 — Deferred (UI-flow-bound):** a Nakivo server guard blocks creating/approving/paying these directly via JSON-RPC (the action must go through the Odoo "from an Opportunity / wizard" UI flow), and each mutates real sales / financial data. They are **not suitable for k6 RPC load testing** — they would need a browser-based (Playwright) harness at low concurrency. Features 1-7 (every RPC-friendly action) are covered.

**Prod-safe? = can this test safely run on the live Production system?**
- ✅ **Yes** — creates / changes no data. Could run on Production as a careful check (keep the user count low, run off-peak).
- ⚠️ **Caution** — reads only, but: repeated logins can lock a real account (use a dedicated test account); the sales report is a heavy query that loads the live database.
- ❌ **No** — creates or changes real data (junk records, real salespeople notified, money / status changes) — never on Production.

## 6. Reports
- **Per run (Jenkins):** a report for each run — pass/fail against the target, a table of response times (average, p90, p95, max) and success rate, plus a note explaining exactly what was timed.
- **Over time (Grafana):** dashboards charting results across runs — response-time trend per feature, the load curve (response time vs number of users), success / error rate, and side-by-side feature comparison. Trends: http://10.8.81.44:3000

### Current results (so far)
| Feature | 10 users (p95) | 30 | 50 | 100 | Success |
|---|---|---|---|---|---|
| Log in | 0.44 s | 0.54 s | 0.59 s | 0.91 s | 100 % |
| Create a lead | 2.7 s | 6.1 s | 8.7 s | 14–15 s | 100 % |
| Leads list (read) | 0.43 s | 0.57 s | 0.83 s | — | 100 % |
| Sales report (read) | 2.5 s | 4.7 s | — | — | 100 % |
| Create opportunity | 2.9 s (5u) | — | — | — | 100 % |
| Create contact | 1.5 s (5u) | — | — | — | 100 % |

Log in / read actions scale well (under 1 s except the heavy Sales-report aggregate). Creating records is heavier and slows down under load (accepted target 20 s), because by design the system processes new records one at a time in a background cron.

*Note: Leads-list, Sales-report, Create-opportunity and Create-contact figures above are single-host local validations. Full Jenkins scaling runs (10/30/50/100) streaming to Grafana are pending the agent VPN being restored.*

### Roadmap
- **Done (7 features):** Login, Create-lead, Open-form (no-save), Leads-list, Sales-report, Create-opportunity, Create-contact — k6 tests + Jenkins jobs; results DB + Grafana dashboards set up (dashboard auto-adds each feature by its `testid`).
- **Deferred (UI-flow-bound):** Deal element, Approve quotation, Register payment — blocked from direct RPC by a server guard + mutate real data; browser-based measurement only.
- **Next:** full Jenkins scaling runs (10/30/50/100) + Grafana trends once the agent VPN is restored.
