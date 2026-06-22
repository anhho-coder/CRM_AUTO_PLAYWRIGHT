<#
  vpn-watchdog.ps1 — keep GlobalProtect (Palo Alto) connected on the Jenkins host.

  WHY: the crm-qa-report build (and its Odoo/Jira/GitHub access) needs the VPN up.
  When GlobalProtect drops, the box loses DNS/route and builds fail at checkout
  ("Could not resolve host: github.com") or at Odoo ("fetch failed"). A Jenkinsfile
  stage CANNOT fix this — the SCM checkout runs before any stage — so this watchdog
  runs at the OS level (Scheduled Task) and reconnects independently of any build.

  WHAT IT DOES: every run, check whether the GP tunnel is up (adapter Up + an
  internal host resolves). If not, reconnect GlobalProtect (restart the PanGPS
  service, ensure the PanGPA agent is running), wait, and re-check. Logs to a file.

  NOTE: this is best-effort. The PROPER fix for an unattended server is to have the
  GlobalProtect *portal* set this host's Connect Method to "Pre-logon (Always On)"
  with a machine certificate (no MFA) — then GP stays up at boot system-wide and
  reconnects natively, and this watchdog just becomes a safety net.

  Run as SYSTEM via Task Scheduler (see register-vpn-watchdog.cmd / the README).
#>

$ErrorActionPreference = 'SilentlyContinue'
$LogFile   = 'C:\ops\vpn-watchdog.log'
$TestHost  = 'crm.nakivo.com'   # a host that only resolves/reachable when VPN is up
$GpService = 'PanGPS'           # GlobalProtect Windows service
$GpAgent   = 'C:\Program Files\Palo Alto Networks\GlobalProtect\PanGPA.exe'
$WaitSecs  = 25                 # time to allow the tunnel to come back after a reconnect

function Log($m) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  try { New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null } catch {}
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Test-Vpn {
  # Up if the GlobalProtect virtual adapter is connected AND DNS resolves an internal host.
  $adapterUp = [bool](Get-NetAdapter | Where-Object { $_.InterfaceDescription -like '*PANGP*' -and $_.Status -eq 'Up' })
  $dnsOk = $false
  try { Resolve-DnsName -Name $TestHost -ErrorAction Stop | Out-Null; $dnsOk = $true } catch { $dnsOk = $false }
  return [pscustomobject]@{ AdapterUp = $adapterUp; DnsOk = $dnsOk; Ok = ($adapterUp -and $dnsOk) }
}

$state = Test-Vpn
if ($state.Ok) { Log "OK (adapter=$($state.AdapterUp) dns=$($state.DnsOk))"; exit 0 }

Log "DOWN (adapter=$($state.AdapterUp) dns=$($state.DnsOk)) — reconnecting GlobalProtect..."

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
  # Some GP versions accept a CLI re-evaluate/connect; harmless if unsupported.
  & $GpAgent rediscovernetwork 2>$null
}

# 3) Give it time, then re-check and log the outcome.
Start-Sleep -Seconds $WaitSecs
$after = Test-Vpn
if ($after.Ok) { Log 'Reconnect OK' } else { Log "STILL DOWN after reconnect (adapter=$($after.AdapterUp) dns=$($after.DnsOk))" }
exit 0
