<#
  vpn-watchdog.ps1 — keep GlobalProtect (Palo Alto) connected on the Jenkins host.

  WHY: the crm-qa-report build (and its Odoo/Jira/GitHub access) needs the VPN up.
  When GlobalProtect drops, the box loses DNS/route and builds fail at checkout
  ("Could not resolve host: github.com") or at Odoo ("fetch failed"). A Jenkinsfile
  stage CANNOT fix this — the SCM checkout runs before any stage — so this watchdog
  runs at the OS level (Scheduled Task) and reconnects independently of any build.

  WHAT IT DOES: every run, test whether the box can actually REACH the resource the
  build needs (Odoo over VPN). If not, reconnect GlobalProtect (restart the PanGPS
  service, ensure the PanGPA agent is running), wait, and re-check. Logs to a file.
  NB: detection is reachability-based on purpose — gating on the GlobalProtect adapter
  name/status gave false negatives (adapter "not Up" while connectivity was fine),
  which caused needless GP restarts.

  PROPER fix for an unattended server: set this host's GlobalProtect *portal* Connect
  Method to "Pre-logon (Always On)" with a machine certificate (no MFA) — then GP stays
  up at boot system-wide and this watchdog is just a safety net.

  Run as SYSTEM via Task Scheduler (see the README / the schtasks command).
#>

$ErrorActionPreference = 'SilentlyContinue'
$LogFile   = 'C:\ops\vpn-watchdog.log'
$TestHost  = 'crm.nakivo.com'   # internal resource only reachable when the VPN is up
$TestPort  = 443
$GpService = 'PanGPS'           # GlobalProtect Windows service
$GpAgent   = 'C:\Program Files\Palo Alto Networks\GlobalProtect\PanGPA.exe'
$WaitSecs  = 25                 # time to allow the tunnel to come back after a reconnect

function Log($m) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  try { New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null } catch {}
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Test-Vpn {
  # "Up" = we can actually reach the build's resource over the tunnel. Do NOT gate on
  # the GP adapter name/status (varies by version; produced false negatives).
  $ok = $false
  try { $ok = Test-NetConnection -ComputerName $TestHost -Port $TestPort -InformationLevel Quiet -WarningAction SilentlyContinue } catch { $ok = $false }
  return [bool]$ok
}

if (Test-Vpn) { Log "OK (reachable ${TestHost}:${TestPort})"; exit 0 }

Log "DOWN (cannot reach ${TestHost}:${TestPort}) - reconnecting GlobalProtect..."

# 1) Bounce the GlobalProtect service — with saved creds / cert (no MFA) this
#    re-establishes the tunnel headlessly.
try {
  Restart-Service -Name $GpService -Force -ErrorAction Stop
  Log "Restarted service $GpService"
} catch {
  Log "Could not restart $GpService ($($_.Exception.Message)); trying start"
  Start-Service -Name $GpService
}

# 2) Make sure the GP agent is running (it drives the connect with saved creds).
if (Test-Path $GpAgent) {
  if (-not (Get-Process -Name 'PanGPA' -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $GpAgent
    Log 'Started PanGPA agent'
  }
  & $GpAgent rediscovernetwork 2>$null
}

# 3) Give it time, then re-check and log the outcome.
Start-Sleep -Seconds $WaitSecs
if (Test-Vpn) { Log 'Reconnect OK' } else { Log "STILL DOWN after reconnect (cannot reach ${TestHost}:${TestPort})" }
exit 0
