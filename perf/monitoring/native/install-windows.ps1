<#
  Native Windows install of the k6 aggregate-report stack: InfluxDB 1.8 + Grafana,
  each as a Windows service (via NSSM). No Docker / WSL required.

  Runs ON the Jenkins server (built-in node) via perf/Jenkinsfile.k6-monitoring-deploy,
  or manually in an elevated PowerShell. Idempotent + re-runnable.

  Config via env (all optional; defaults shown):
    ACTION            install | status | uninstall        (default install)
    INSTALL_DIR       E:\monitoring
    INFLUX_VER        1.8.10
    GRAFANA_VER       11.2.0
    NSSM_VER          2.24
    GF_ADMIN_PASSWORD nakivo-k6
    INFLUX_DB         k6
    REPO_MONITORING   <cwd>\perf\monitoring   (source of the Grafana dashboard JSON)

  Services created:  k6-influxdb (:8086)   k6-grafana (:3000)
#>
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---- config ----
$Action    = if ($env:ACTION)            { $env:ACTION }            else { 'install' }
$InstallDir= if ($env:INSTALL_DIR)       { $env:INSTALL_DIR }       else { 'E:\monitoring' }
$InfluxVer = if ($env:INFLUX_VER)        { $env:INFLUX_VER }        else { '1.8.10' }
$GrafVer   = if ($env:GRAFANA_VER)       { $env:GRAFANA_VER }       else { '11.2.0' }
$NssmVer   = if ($env:NSSM_VER)          { $env:NSSM_VER }          else { '2.24' }
$GfPass    = if ($env:GF_ADMIN_PASSWORD) { $env:GF_ADMIN_PASSWORD } else { 'nakivo-k6' }
$InfluxDb  = if ($env:INFLUX_DB)         { $env:INFLUX_DB }         else { 'k6' }
$RepoMon   = if ($env:REPO_MONITORING)   { $env:REPO_MONITORING }   else { (Join-Path (Get-Location) 'perf\monitoring') }

$Downloads = Join-Path $InstallDir 'downloads'
$InfluxDir = Join-Path $InstallDir 'influxdb'
$GAppDir   = Join-Path $InstallDir 'grafana-app'
$GData     = Join-Path $InstallDir 'grafana-data'
$NssmDir   = Join-Path $InstallDir 'nssm'
$LogDir    = Join-Path $InstallDir 'logs'
$Nssm      = Join-Path $NssmDir 'nssm.exe'
$fwd       = { param($p) $p -replace '\\','/' }   # backslash -> forward slash for ini/toml

$SVC_INFLUX = 'k6-influxdb'
$SVC_GRAF   = 'k6-grafana'

function Line($m){ Write-Host ("---- {0} ----" -f $m) }

# ---- status / uninstall short-circuits ----
if ($Action -eq 'status') {
  Line 'SERVICES'
  Get-Service $SVC_INFLUX,$SVC_GRAF -ErrorAction SilentlyContinue | Format-Table Name,Status,StartType -AutoSize | Out-String | Write-Host
  Line 'INFLUX ping';   curl.exe -s -o NUL -w "http %{http_code}`n" http://localhost:8086/ping
  Line 'GRAFANA health';curl.exe -s http://localhost:3000/api/health
  return
}
if ($Action -eq 'uninstall') {
  foreach ($s in @($SVC_GRAF,$SVC_INFLUX)) {
    if (Get-Service $s -ErrorAction SilentlyContinue) { & $Nssm stop $s; & $Nssm remove $s confirm }
  }
  Write-Host "Services removed. Data left in $InstallDir (delete manually if desired)."
  return
}

# ============================ INSTALL ============================
Line "INSTALL  dir=$InstallDir  influx=$InfluxVer  grafana=$GrafVer"
foreach ($d in @($InstallDir,$Downloads,$InfluxDir,$GAppDir,$GData,$NssmDir,$LogDir,
                 (Join-Path $InfluxDir 'meta'),(Join-Path $InfluxDir 'data'),(Join-Path $InfluxDir 'wal'),
                 (Join-Path $GData 'data'),(Join-Path $GData 'log'),(Join-Path $GData 'plugins'),
                 (Join-Path $GData 'provisioning\datasources'),(Join-Path $GData 'provisioning\dashboards'),
                 (Join-Path $GData 'dashboards'))) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}

function Fetch($url,$out){
  if (Test-Path $out) { Write-Host "cached  $out"; return }
  Write-Host "download $url"
  curl.exe -sSL --fail -o $out $url
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $out)) { throw "download failed ($LASTEXITCODE): $url" }
}

# ---- 1. NSSM ----
Line 'NSSM'
$nssmZip = Join-Path $Downloads "nssm-$NssmVer.zip"
Fetch "https://nssm.cc/release/nssm-$NssmVer.zip" $nssmZip
if (-not (Test-Path $Nssm)) {
  $tmp = Join-Path $Downloads "nssm-extract"
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive $nssmZip -DestinationPath $tmp -Force
  $src = Get-ChildItem $tmp -Recurse -Filter 'nssm.exe' | Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1
  if (-not $src) { $src = Get-ChildItem $tmp -Recurse -Filter 'nssm.exe' | Select-Object -First 1 }
  Copy-Item $src.FullName $Nssm -Force
}
Write-Host "nssm: $Nssm"

# ---- 2. InfluxDB 1.8 ----
Line 'INFLUXDB'
$ixZip = Join-Path $Downloads "influxdb-$InfluxVer.zip"
Fetch "https://dl.influxdata.com/influxdb/releases/influxdb-${InfluxVer}_windows_amd64.zip" $ixZip
if (-not (Test-Path (Join-Path $InfluxDir 'influxd.exe'))) {
  $tmp = Join-Path $Downloads "influx-extract"
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive $ixZip -DestinationPath $tmp -Force
  $ixd = Get-ChildItem $tmp -Recurse -Filter 'influxd.exe' | Select-Object -First 1
  Copy-Item (Join-Path $ixd.Directory.FullName '*.exe') $InfluxDir -Force
}
$ixConf = Join-Path $InfluxDir 'influxdb.conf'
@"
reporting-disabled = true
[meta]
  dir = "$(& $fwd (Join-Path $InfluxDir 'meta'))"
[data]
  dir = "$(& $fwd (Join-Path $InfluxDir 'data'))"
  wal-dir = "$(& $fwd (Join-Path $InfluxDir 'wal'))"
[http]
  enabled = true
  bind-address = ":8086"
  auth-enabled = false
[monitor]
  store-enabled = false
"@ | Set-Content -Path $ixConf -Encoding ASCII
Write-Host "influx conf: $ixConf"

# ---- 3. Grafana ----
Line 'GRAFANA'
$gZip = Join-Path $Downloads "grafana-$GrafVer.zip"
Fetch "https://dl.grafana.com/oss/release/grafana-${GrafVer}.windows-amd64.zip" $gZip
$GHome = Get-ChildItem $GAppDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'grafana*' } | Select-Object -First 1
if (-not $GHome) {
  Expand-Archive $gZip -DestinationPath $GAppDir -Force
  $GHome = Get-ChildItem $GAppDir -Directory | Where-Object { $_.Name -like 'grafana*' } | Select-Object -First 1
}
$GHome = $GHome.FullName
$GBin  = Join-Path $GHome 'bin'
Write-Host "grafana home: $GHome"

# custom.ini (forward slashes so Grafana's ini parser is happy on Windows)
$GCustom = Join-Path $GData 'custom.ini'
@"
[paths]
data = $(& $fwd (Join-Path $GData 'data'))
logs = $(& $fwd (Join-Path $GData 'log'))
plugins = $(& $fwd (Join-Path $GData 'plugins'))
provisioning = $(& $fwd (Join-Path $GData 'provisioning'))

[server]
http_port = 3000

[security]
admin_user = admin
admin_password = $GfPass

[users]
allow_sign_up = false

[auth.anonymous]
enabled = true
org_role = Viewer
"@ | Set-Content -Path $GCustom -Encoding ASCII

# provisioning: datasource (localhost) + dashboards provider (native path)
@"
apiVersion: 1
datasources:
  - name: k6-InfluxDB
    uid: influxdb-k6
    type: influxdb
    access: proxy
    url: http://localhost:8086
    database: $InfluxDb
    isDefault: true
    editable: true
    jsonData:
      httpMode: GET
      dbName: $InfluxDb
"@ | Set-Content -Path (Join-Path $GData 'provisioning\datasources\influxdb.yml') -Encoding ASCII

@"
apiVersion: 1
providers:
  - name: k6-crm
    orgId: 1
    folder: k6 CRM Load Tests
    type: file
    disableDeletion: false
    editable: true
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: $(& $fwd (Join-Path $GData 'dashboards'))
      foldersFromFilesStructure: false
"@ | Set-Content -Path (Join-Path $GData 'provisioning\dashboards\dashboards.yml') -Encoding ASCII

# dashboard JSON from the repo checkout
$dashSrc = Join-Path $RepoMon 'grafana\dashboards\k6-crm-load-tests.json'
if (Test-Path $dashSrc) { Copy-Item $dashSrc (Join-Path $GData 'dashboards\k6-crm-load-tests.json') -Force; Write-Host "dashboard copied from $dashSrc" }
else { Write-Warning "dashboard JSON not found at $dashSrc (Grafana will still start; import manually)" }

# ---- 4. Services via NSSM ----
function Install-Svc($name,$app,$appArgs,$appdir){
  if (Get-Service $name -ErrorAction SilentlyContinue) { & $Nssm stop $name | Out-Null; & $Nssm remove $name confirm | Out-Null }
  & $Nssm install $name $app | Out-Null
  & $Nssm set $name AppParameters $appArgs | Out-Null
  & $Nssm set $name AppDirectory $appdir | Out-Null
  & $Nssm set $name Start SERVICE_AUTO_START | Out-Null
  & $Nssm set $name AppStdout (Join-Path $LogDir "$name.out.log") | Out-Null
  & $Nssm set $name AppStderr (Join-Path $LogDir "$name.err.log") | Out-Null
  & $Nssm set $name AppExit Default Restart | Out-Null
  & $Nssm start $name | Out-Null
  Write-Host "service $name started"
}
Line 'SERVICES'
Install-Svc $SVC_INFLUX (Join-Path $InfluxDir 'influxd.exe') "-config `"$ixConf`"" $InfluxDir

# grafana exe: prefer unified grafana.exe (11.x), fall back to grafana-server.exe
$gUnified = Join-Path $GBin 'grafana.exe'
$gServer  = Join-Path $GBin 'grafana-server.exe'
if (Test-Path $gUnified)     { Install-Svc $SVC_GRAF $gUnified "server --homepath `"$GHome`" --config `"$GCustom`"" $GHome }
elseif (Test-Path $gServer)  { Install-Svc $SVC_GRAF $gServer  "--homepath `"$GHome`" --config `"$GCustom`"" $GHome }
else { throw "grafana exe not found under $GBin" }

# ---- 5. Firewall ----
Line 'FIREWALL'
foreach ($fw in @(@{n='k6-influxdb-8086';p=8086},@{n='k6-grafana-3000';p=3000})) {
  Get-NetFirewallRule -DisplayName $fw.n -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $fw.n -Direction Inbound -Action Allow -Protocol TCP -LocalPort $fw.p | Out-Null
  Write-Host "firewall allow TCP $($fw.p)"
}

# ---- 6. Wait + create DB + verify ----
Line 'VERIFY'
$ok = $false
foreach ($i in 1..30) {
  $code = (curl.exe -s -o NUL -w "%{http_code}" http://localhost:8086/ping)
  if ($code -eq '204') { $ok = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ok) { throw "InfluxDB did not become ready on :8086 (see $LogDir\$SVC_INFLUX.err.log)" }
Write-Host "InfluxDB up. Creating database '$InfluxDb'..."
curl.exe -sS -XPOST "http://localhost:8086/query" --data-urlencode "q=CREATE DATABASE $InfluxDb" | Out-Null
Write-Host "Databases:"; curl.exe -sS -G "http://localhost:8086/query" --data-urlencode "q=SHOW DATABASES"

$gok = $false
foreach ($i in 1..45) {
  $code = (curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/api/health)
  if ($code -eq '200') { $gok = $true; break }
  Start-Sleep -Seconds 2
}
Write-Host ""
if ($gok) { Write-Host "Grafana health:"; curl.exe -s http://localhost:3000/api/health }
else      { Write-Warning "Grafana not healthy yet on :3000 (see $GData\log\grafana.log)" }

Line 'DONE'
Write-Host "InfluxDB : http://10.8.81.44:8086  (db=$InfluxDb)   <- k6 -o influxdb=http://10.8.81.44:8086/$InfluxDb"
Write-Host "Grafana  : http://10.8.81.44:3000  (anon view on; admin/$GfPass to edit)"
