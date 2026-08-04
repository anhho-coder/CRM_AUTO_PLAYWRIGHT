# k6 CRM Load-Test Aggregate Report (InfluxDB + Grafana)

Turns the per-build k6 HTML reports into a **cross-build aggregate report**:

| Goal | Where in Grafana |
|---|---|
| 1. Concurrent run time at 10 / 30 / 50 / 100 users | Panel **"p95 latency by concurrency level"** (bar per level) |
| 2. Compare a build vs baseline (higher/lower) | Panel **"p95 trend across builds"** (point per run over time + baseline line) |
| 3. Which operation/function is slow (bottleneck) | Panel **"Bottleneck: latency by operation"** (table sorted by p95 desc, split by `step`/`rpc`/URL) |

The existing publishHTML k6 reports are **kept** — this runs alongside them.

## How it works

```
k6 run -o influxdb=http://10.8.81.44:8086/k6      Grafana (http://10.8.81.44:3000)
  --tag testid=<login-scale|create-lead-scale>       reads InfluxDB, renders the
  --tag build=<BUILD_NUMBER>                          dashboard, filtered by
      |                                               $testid / $build / $level
      v
  InfluxDB v1.8  (db "k6")
```

k6 v0.49 (pinned in `../k6/ensure-k6.ps1`) ships the built-in `influxdb` (v1) output, so
**no xk6 rebuild is needed** — hence InfluxDB **1.8**, not 2.x. Every metric point already
carries the tags the dashboard needs:

- `level` = 10/30/50/100 (scenario tag, on all samples in that burst)
- `step` = get/post (login-scale) &middot; `rpc` = create/search/unlink (create-lead-scale)
- `name` = the URL &middot; `build` + `testid` = added by the Jenkinsfiles

Low-cardinality tags only (`vu`/`iter` stay as InfluxDB fields), so no series explosion.

## One-time setup (on the Jenkins server 10.8.81.44)

> This host only has HTTP access to Jenkins — you must run these **at the server console via RDP**.

**Prerequisite:** Docker with **Linux containers** (Docker Desktop + WSL2 backend, or a Linux
Docker host). The images (`influxdb:1.8`, `grafana/grafana-oss`) are Linux images. Check with
`docker version` — if `OSType: windows`, switch to Linux containers first.

```powershell
# 1. Get this folder onto the server (git pull the repo, or copy perf\monitoring\).
cd <repo>\perf\monitoring

# 2. (optional) set the Grafana admin password; default is nakivo-k6
$env:GF_ADMIN_PASSWORD = "choose-a-password"

# 3. Bring the stack up
docker compose up -d

# 4. Verify
docker compose ps
curl http://localhost:8086/ping           # InfluxDB -> 204 No Content
Start-Process http://localhost:3000        # Grafana
```

- Grafana: **http://10.8.81.44:3000** — anonymous **view** is on; log in as `admin` to edit.
- The datasource **k6-InfluxDB** and the dashboard **"k6 CRM Load Tests"** auto-provision
  (folder *k6 CRM Load Tests*). No manual import.
- Data persists in the `influxdb-data` / `grafana-data` Docker volumes.

Firewall: allow inbound **8086** (from the k6 Jenkins agents) and **3000** (from viewers) on the server.

## Wiring is already done in the pipelines

`../Jenkinsfile.k6-scale` (login-scale) and `../Jenkinsfile.k6-create-lead` (create-lead-scale)
each gained a param **`INFLUX_URL`** (default `http://10.8.81.44:8086/k6`). On each run they:

1. TCP-probe `:8086`. Reachable -> stream to InfluxDB. Unreachable -> **skip streaming with a
   warning and still run** (the load test + HTML report never break because the metrics store is down).
2. Tag every point with `testid` + `build`.

To turn streaming off for a run, blank the `INFLUX_URL` param.

## Using the dashboard

1. Open Grafana -> folder *k6 CRM Load Tests* -> **k6 CRM Load Tests**.
2. Top of page: pick **Test** (`login-scale` / `create-lead-scale`), **Build** (defaults to latest),
   **Concurrency** (all levels by default).
3. Panel 2 (trend): widen the time range (top-right, e.g. *Last 30 days*) to see baseline history —
   each run is a cluster of points; a shift upward on the right = regression. Edit the red threshold
   line to your accepted baseline per test.

## Notes / gotchas

- If an **old** build's data doesn't show, widen the dashboard time range to cover when it ran
  (`$timeFilter` still applies even when you filter by build).
- Fallback dashboard: the community **k6 Load Testing Results** dashboard (Grafana.com ID `2587`)
  also works against this InfluxDB v1 datasource if you want the stock k6 panels too.
- Retention is unlimited (`autogen`). If storage grows too much over months, add a retention policy
  on the `k6` database.
