@echo off
REM ============================================================================
REM CRM Automation - nightly metrics job (Windows Task Scheduler @ 21:00)
REM Register once:
REM   schtasks /Create /SC DAILY /ST 21:00 /TN "CRM Automation Metrics" ^
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
call npm run metrics:daily

:openreport
echo [%date% %time%] Opening master report
start "" "%~dp0metrics\master-report.html"
echo [%date% %time%] CRM Automation Metrics - nightly run finished
endlocal
