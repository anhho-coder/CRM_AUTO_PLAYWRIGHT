# crm-mig leftover-test-data check

Daily 16:00 check for automation test data left un-cleaned on the O12 migration server
(`https://crm-mig.nakivo.site`, db `nakivoCE`).

Backs the house rule **"CRM Migration server needs to clean up test data"**:

1. every spec that creates data on crm-mig tears it down (deferred-verification specs delete in the
   deferred pass, not never);
2. at 16:00 on working days, something checks what is still lying around — **only while crm-mig is
   reachable**.

This script is part 2. It is **read-only**: it reports the leftovers, it never deletes them.

## What it does

1. **Probes** `https://crm-mig.nakivo.site/web/login` **once** (15 s timeout). Unreachable → prints
   `SKIPPED` with the reason and exits **3**. No retry loop, and a failed probe is never reported as
   "no leftover data" — an unreachable server and a clean server look identical.
2. Authenticates and, per model, `search_read`s what was created in the window:
   `crm.lead`, `res.partner`, `sale.order`, `account.invoice`.
   Bounded read: `create_date >= now-24h` **and** `create_uid = <the automation uid>`, `limit 500`.
3. Writes `logs/latest.txt` + `logs/leftover-<stamp>-<STATUS>.txt`, and raises a Windows reminder
   popup when there are leftovers.

| exit | meaning |
|-----:|---------|
| 0 | clean — nothing created in the window is still there |
| 2 | leftovers found (reminder popup raised) |
| 3 | SKIPPED — crm-mig unreachable, or auth failed |
| 1 | error / incomplete (a model could not be read) |

## Prerequisites

- Python 3 with `requests` (`/c/Python313/python` by default; override with `PY=<path>`).
- The Odoo MCP credentials store `~/.claude/mcp-odoo/credentials.json` with a **`crm_mig`** host
  entry (`url`, `db: nakivoCE`, `login`, `password`, `verify_ssl: false`). Register it with
  `D:\Automation_CRM\mcp-odoo-crm-mig\register-crm-mig.py`.
  **No credentials live in this repo.**
- VPN / office network — crm-mig is internal.

## Run it by hand

```bash
bash ci/crm_mig_cleanup_check/run_check.sh                 # the real check
bash ci/crm_mig_cleanup_check/run_check.sh --any-user      # every user, not just the automation uid
bash ci/crm_mig_cleanup_check/run_check.sh --since-hours 72 --no-notify
```

## Schedule it on your host (16:00, Mon-Fri)

Windows Task Scheduler, not a cloud cron — crm-mig is only reachable from the office network.
Run in PowerShell, adjusting the path to your checkout:

```powershell
$repo    = "D:\Automation_CRM\CRM_AUTO_PLAYWRIGHT"
$action  = New-ScheduledTaskAction -Execute "C:\Program Files\Git\usr\bin\bash.exe" `
             -Argument ('-lc "' + ($repo -replace '\\','/' -replace '^D:','/d') + '/ci/crm_mig_cleanup_check/run_check.sh"')
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 16:00
Register-ScheduledTask -TaskName "CRM_MIG_leftover_testdata_1600" -Action $action -Trigger $trigger -Force
```

Check it: `Get-ScheduledTaskInfo -TaskName CRM_MIG_leftover_testdata_1600`
(`LastTaskResult` = the exit code above). Fire it once: `Start-ScheduledTask -TaskName ...`.

**The task only runs while you are logged on** — registering it without a stored password is
deliberate (no secret on the command line), so a logged-off host simply does not run the check.

`logs/` is git-ignored.
