@echo off
REM ============================================================================
REM Run Specific Test Suites
REM Usage: Uncomment the tests you want to run
REM ============================================================================

echo.
echo ============================================================================
echo   CRM AUTOMATION - CUSTOM TEST EXECUTION
echo ============================================================================
echo.

REM Clean previous results
if exist playwright-report rmdir /s /q playwright-report
if exist test-results rmdir /s /q test-results

echo [INFO] Starting test execution...
echo.

REM ============================================================================
REM LEAD ASSIGNMENT TESTS
REM ============================================================================
echo [TEST SUITE] Lead Assignment Tests
call npx playwright test tests/Leads_Assignment/tc-bdeu-1-1-1-1-lead-assigned-to-bdeu.spec.ts --project=chromium
echo.

REM ============================================================================
REM PERFORMANCE TESTS (Uncomment to run)
REM ============================================================================
REM echo [TEST SUITE] Performance Tests
REM call npx playwright test tests/SalesReport_Performance/tc-performance-1-1-1-1-create-lead.spec.ts --project=chromium
REM call npx playwright test tests/SalesReport_Performance/tc-performance-1-1-1-2-edit-lead.spec.ts --project=chromium
REM echo.

REM ============================================================================
REM OPPORTUNITY TESTS (Uncomment to run)
REM ============================================================================
REM echo [TEST SUITE] Opportunity Tests
REM call npx playwright test tests/SalesReport_Performance/tc-performance-1-1-2-1-create-opp.spec.ts --project=chromium
REM call npx playwright test tests/SalesReport_Performance/tc-performance-1-1-2-2-edit-opp.spec.ts --project=chromium
REM echo.

echo.
echo ============================================================================
echo   EXECUTION COMPLETED
echo ============================================================================
echo.

REM Generate and open report
echo [INFO] Generating test report...
call npx playwright show-report

echo.
echo [SUCCESS] Test execution completed!
echo.
echo Report locations:
echo   - HTML: playwright-report\index.html
echo   - JSON: test-results\test-results.json
echo   - JUnit: test-results\junit-results.xml
echo.
pause
