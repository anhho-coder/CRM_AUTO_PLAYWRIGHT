@echo off
REM ============================================================================
REM Professional Test Execution Script
REM This script runs multiple test files and generates comprehensive reports
REM ============================================================================

echo.
echo ============================================================================
echo   CRM AUTOMATION TEST SUITE
echo   Starting Test Execution...
echo ============================================================================
echo.

REM Clean previous test results (DISABLED to preserve report history)
REM if exist playwright-report rmdir /s /q playwright-report
REM if exist test-results rmdir /s /q test-results

echo [INFO] Report history preserved - timestamped folders will be created
echo.

REM Run all tests in Leads_Assignment folder
echo [INFO] Running Lead Assignment Tests...
call npx playwright test tests/Leads_Assignment --project=chromium

REM Run performance tests (optional - uncomment if needed)
REM echo.
REM echo [INFO] Running Performance Tests...
REM call npx playwright test tests/SalesReport_Performance --project=chromium

echo.
echo ============================================================================
echo   TEST EXECUTION COMPLETED
echo ============================================================================
echo.

REM Open the HTML report
echo [INFO] Opening test report...
call npx playwright show-report

echo.
echo [INFO] Test results saved in:
echo   - HTML Report: playwright-report\index.html
echo   - JSON Results: test-results\test-results.json
echo   - JUnit XML: test-results\junit-results.xml
echo.
pause
