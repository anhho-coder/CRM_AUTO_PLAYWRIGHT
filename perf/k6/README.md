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
