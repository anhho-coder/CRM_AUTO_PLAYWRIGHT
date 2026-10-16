<#
.SYNOPSIS
  Keep the Jenkins "Secret file" credential `crm-users-secrets` equal to the local
  config/users.secrets.json - upload only when the local file changed.

.DESCRIPTION
  The Jenkinsfile binds the credential `crm-users-secrets` to CRM_SECRETS_FILE; Jenkins never reads the
  local file. This script:
    1. validates config/users.secrets.json (must parse as JSON, every value a non-empty string);
    2. compares its SHA-256 with the hash of the last successful upload;
    3. if different (or -Force), POSTs a new config.xml for the credential through the Credentials plugin
       REST endpoint (base64 bytes in <secretBytes>; the content is never written to disk or log);
    4. records the new hash only after Jenkins answered 200.
  Jenkins URL / user / API token are read from "D:\Automation_CRM\jenkin token.txt" (outside git).

  Triggers: Windows Task Scheduler task `CRM_sync_secrets_to_jenkins` (every 15 min, logged-on only) and
  manually right before firing a Jenkins build:
    powershell -NoProfile -ExecutionPolicy Bypass -File ci\sync_secrets_to_jenkins.ps1

.PARAMETER Force   Upload even when the hash is unchanged.
.PARAMETER DryRun  Validate and compare only; never upload.

  Exit codes: 0 = uploaded or unchanged | 1 = error (nothing recorded).
#>
param([switch]$Force, [switch]$DryRun)
$ErrorActionPreference = 'Stop'

$RepoRoot   = Split-Path $PSScriptRoot -Parent
$SecretsFile = Join-Path $RepoRoot 'config\users.secrets.json'
$TokenFile  = 'D:\Automation_CRM\jenkin token.txt'
$CredPath   = 'credentials/store/system/domain/_/credential/crm-users-secrets'
$StateDir   = Join-Path $env:LOCALAPPDATA 'crm-jenkins-secrets-sync'
$HashFile   = Join-Path $StateDir 'last-uploaded.sha256'
$LogFile    = Join-Path $StateDir 'sync.log'

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
function Log([string]$msg) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  Write-Output $line
}

try {
  # 1) validate the local secrets file - never push a broken file to every CI run
  if (-not (Test-Path $SecretsFile)) { throw "secrets file not found: $SecretsFile" }
  $raw  = [IO.File]::ReadAllBytes($SecretsFile)
  $json = [Text.Encoding]::UTF8.GetString($raw) | ConvertFrom-Json
  $keys = @($json.PSObject.Properties.Name)
  $empty = @($json.PSObject.Properties | Where-Object { -not ($_.Value -is [string]) -or [string]::IsNullOrEmpty($_.Value) } | ForEach-Object Name)
  if ($keys.Count -eq 0) { throw 'secrets file has no keys' }
  if ($empty.Count -gt 0) { throw ("keys without a password: " + ($empty -join ', ')) }

  # 2) compare with the last successful upload
  $hash = (Get-FileHash -Path $SecretsFile -Algorithm SHA256).Hash
  $last = if (Test-Path $HashFile) { (Get-Content $HashFile -Raw).Trim() } else { '' }
  if (-not $Force -and $hash -eq $last) { Log ("unchanged ({0} keys, sha256 {1}...) - nothing to do" -f $keys.Count, $hash.Substring(0,12)); exit 0 }
  if ($DryRun) { Log ("DRY RUN: would upload {0} keys (sha256 {1}..., last {2})" -f $keys.Count, $hash.Substring(0,12), ($(if ($last) { $last.Substring(0,12) + '...' } else { 'none' }))); exit 0 }

  # 3) upload through the Credentials plugin REST endpoint
  $t = @{}
  Get-Content $TokenFile | ForEach-Object { if ($_ -match '^\s*([^:]+):\s*(.*)$') { $t[$Matches[1].Trim()] = $Matches[2].Trim() } }
  foreach ($k in 'Jenkins URL','username','token') { if (-not $t[$k]) { throw "'$k' missing in $TokenFile" } }
  $base = $t['Jenkins URL'].TrimEnd('/')
  $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($t['username']):$($t['token'])"))
  $headers = @{ Authorization = "Basic $auth" }

  $desc = "Playwright test-account passwords ($($keys.Count) accounts). Bound to CRM_SECRETS_FILE by the Jenkinsfile. Synced from the tester's local config/users.secrets.json by ci/sync_secrets_to_jenkins.ps1."
  $xml = @"
<org.jenkinsci.plugins.plaincredentials.impl.FileCredentialsImpl plugin="plain-credentials">
  <scope>GLOBAL</scope>
  <id>crm-users-secrets</id>
  <description>$([Security.SecurityElement]::Escape($desc))</description>
  <fileName>users.secrets.json</fileName>
  <secretBytes>$([Convert]::ToBase64String($raw))</secretBytes>
</org.jenkinsci.plugins.plaincredentials.impl.FileCredentialsImpl>
"@
  $resp = Invoke-WebRequest -Uri "$base/$CredPath/config.xml" -Method Post -Headers $headers `
            -ContentType 'application/xml; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($xml)) `
            -UseBasicParsing -TimeoutSec 20
  $xml = $null
  if ($resp.StatusCode -ne 200) { throw "Jenkins answered HTTP $($resp.StatusCode)" }

  # 4) record only after a confirmed upload
  Set-Content -Path $HashFile -Value $hash -Encoding ASCII
  Log ("uploaded {0} keys to {1} (sha256 {2}...)" -f $keys.Count, $CredPath, $hash.Substring(0,12))
  exit 0
}
catch {
  Log ("ERROR: " + $_.Exception.Message)
  exit 1
}
