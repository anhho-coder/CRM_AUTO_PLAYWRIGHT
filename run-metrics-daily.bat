@echo off
REM ============================================================================
REM CRM Automation - daily metrics job (Windows Task Scheduler @ 06:00, reports the prior day -
REM collected each morning). Pair with the "Anchor" task @ 06:15 which resets the baseline
REM AFTER this 06:00 run has read it.
REM Register once:
REM   schtasks /Create /SC DAILY /ST 06:00 /TN "CRM Automation Metrics" ^
REM     /TR "\"D:\II. Automation\CRM_AUTO\run-metrics-daily.bat\""
REM ============================================================================
setlocal
cd /d "%~dp0"
echo [%date% %time%] CRM Automation Metrics - nightly run started

REM 1) VPN / CRM reachability check (internal host). If down, only rebuild the report from last results.
ping -n 2 10.220.222.100 >nul
if errorlevel 1 (
  echo [WARN] CRM host 10.220.222.100 not reachable - VPN down? Skipping test run, rebuilding report only.
  call node scripts\metrics\aggregate.js
  call node scripts\metrics\build-report.js
  goto openreport
)

REM 2) Run today's created/updated specs, then aggregate + rebuild the HTML master report.
REM    Output is logged to metrics\last-run.log so watch-metrics-progress.bat can show a live bar.
call npm run metrics:daily > "%~dp0metrics\last-run.log" 2>&1
type "%~dp0metrics\last-run.log"

:openreport
echo [%date% %time%] Opening master report
start "" "%~dp0metrics\master-report.html"
echo [%date% %time%] CRM Automation Metrics - nightly run finished
endlocal
