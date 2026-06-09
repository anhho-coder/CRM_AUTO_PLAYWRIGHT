@echo off
setlocal
REM ============================================================================
REM Live progress bar for a CRM metrics test run. Passive (only READS the log).
REM
REM Usage:
REM   watch-metrics-progress.bat                  - watches metrics\last-run.log (the nightly job)
REM   watch-metrics-progress.bat <path-to-log>    - watch a specific run's log
REM
REM For the current ad-hoc full-folder run, pass its log:
REM   watch-metrics-progress.bat metrics\full-o12-run.log
REM ============================================================================
set "PROGRESS_LOG=%~1"
if "%PROGRESS_LOG%"=="" (
  if exist "%~dp0metrics\last-run.log" (
    set "PROGRESS_LOG=%~dp0metrics\last-run.log"
  ) else (
    REM no nightly log yet - fall back to the newest .log in metrics\ (e.g. an ad-hoc run)
    for /f "delims=" %%F in ('dir /b /o-d "%~dp0metrics\*.log" 2^>nul') do if not defined PROGRESS_LOG set "PROGRESS_LOG=%~dp0metrics\%%F"
  )
)
if "%PROGRESS_LOG%"=="" (
  echo No run log found in metrics\. Start a run first, or pass a log path.
  pause
  exit /b 1
)
echo Watching: %PROGRESS_LOG%
echo (close this window any time - it does not affect the test run)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $log=$env:PROGRESS_LOG; if(-not (Test-Path $log)){Write-Host ('Log not found yet: '+$log); Start-Sleep 4; exit}; $total=0; while($true){ $c=Get-Content $log; if($total -eq 0){$m=$c|Select-String 'Running (\d+) test'|Select-Object -First 1; if($m){$total=[int]$m.Matches[0].Groups[1].Value}}; $done=($c|ForEach-Object{ if($_ -match '^\s*(\d+)[\.\)]\s'){[int]$Matches[1]} elseif($_ -match '^\s*ok\s+(\d+)\s'){[int]$Matches[1]} }|Measure-Object -Maximum).Maximum; if(-not $done){$done=0}; $cur=(($c|Select-String 'spec\.ts'|Select-Object -Last 1).Line) -replace '.*UC-A','UC-A' -replace ' .*',''; if($total -gt 0){$pct=[int]([math]::Min(100,$done/$total*100))}else{$pct=0}; Write-Progress -Activity 'CRM metrics test run' -Status (('test {0}/{1}   {2}') -f $done,$total,$cur) -PercentComplete $pct; if($total -gt 0 -and $done -ge $total){break}; if(((Get-Date)-(Get-Item $log).LastWriteTime).TotalSeconds -gt 180){break}; Start-Sleep -Seconds 12 }; Write-Progress -Activity 'CRM metrics test run' -Completed; Write-Host (('Finished: reached test {0}/{1}') -f $done,$total)"
echo.
pause
endlocal
