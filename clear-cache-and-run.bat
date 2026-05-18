@echo off
echo ========================================
echo Clearing Playwright Cache (Keeping Report History)
echo ========================================

echo [1/2] Removing node_modules cache...
if exist node_modules\.cache (
    rmdir /s /q node_modules\.cache
    echo     - node_modules\.cache removed
) else (
    echo     - node_modules\.cache not found, skipping
)

echo [2/2] Running tests in BDEU_team/1.2. Country_Group folder...
echo.
call npx playwright test "tests/Leads_Assignment/BDEU_team/1.2. Country_Group" --project=chromium

echo.
echo ========================================
echo Opening latest test report...
echo ========================================
call npx playwright show-report

pause
