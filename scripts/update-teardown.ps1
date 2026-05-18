# update-teardown.ps1
# Replaces verbose tear-down blocks in all 2.Re-assign-Leads spec files with
# the new CommonUtils.deleteRecordByUrl() helper pattern.
# Skips tc-crm-457-2-2-1-6 (already updated).

$basePath = 'd:\II. Automation\CRM_AUTO\tests\1.Project_CRM\9.CRM_Module\CRM-457_Automated-LeadsContact-re-assignation-upon-an-IC-quitting\2.Re-assign-Leads'

$files = Get-ChildItem -Path $basePath -Recurse -Filter '*.spec.ts' |
         Where-Object { $_.Name -notlike '*2-2-1-6*' }

# ──────────────────────────────────────────────────────────────────────────────
# Replacement string for single-lead files  (url_Lead1 only)
# ──────────────────────────────────────────────────────────────────────────────
$newSingle = (@"
    if (url_Lead1) {
      await test.step('IV. TEAR DOWN: Clean up test data', async () => {
        console.log('\n=== IV. TEAR DOWN ===');
        await test.step('IV.1: Delete Lead#1', async () => {
          await CommonUtils.deleteRecordByUrl(page, url_Lead1, testInfo);
        });
        await test.step('IV.2: Close all browsers', async () => {
          const allPages = page.context().pages();
          for (const p of allPages) { if (!p.isClosed()) await p.close(); }
          console.log('✓ IV.2: All browsers closed');
        });
        url_Lead1 = '';
      });
    }
"@).TrimEnd("`r`n")

# ──────────────────────────────────────────────────────────────────────────────
# Replacement string for two-lead files  (url_Lead1 || url_Lead2)
# ──────────────────────────────────────────────────────────────────────────────
$newDouble = (@"
    if (url_Lead1 || url_Lead2) {
      await test.step('IV. TEAR DOWN: Clean up test data', async () => {
        console.log('\n=== IV. TEAR DOWN ===');
        if (url_Lead1) {
          await test.step('IV.1: Delete Lead#1', async () => {
            await CommonUtils.deleteRecordByUrl(page, url_Lead1, testInfo);
          });
          url_Lead1 = '';
        }
        if (url_Lead2) {
          await test.step('IV.2: Delete Lead#2', async () => {
            await CommonUtils.deleteRecordByUrl(page, url_Lead2, testInfo);
          });
          url_Lead2 = '';
        }
        await test.step('IV.3: Close all browsers', async () => {
          const allPages = page.context().pages();
          for (const p of allPages) { if (!p.isClosed()) await p.close(); }
          console.log('✓ IV.3: All browsers closed');
        });
      });
    }
"@).TrimEnd("`r`n")

# ──────────────────────────────────────────────────────────────────────────────
# Regex patterns  (both handle CRLF and LF via \r?\n)
# ──────────────────────────────────────────────────────────────────────────────
$patternSingle = '    if \(url_Lead1\) \{[\s\S]*?\r?\n    \}(?=\r?\n  \}\);)'
$patternDouble = '    if \(url_Lead1 \|\| url_Lead2\) \{[\s\S]*?\r?\n    \}(?=\r?\n  \}\);)'

$updatedCount = 0
$noMatchCount = 0

foreach ($file in $files) {
    # Use \\?\ prefix to bypass Windows MAX_PATH (260-char) limitation
    $longPath = '\\?\' + $file.FullName

    $content = [System.IO.File]::ReadAllText($longPath, [System.Text.Encoding]::UTF8)

    $isDoubleFile = $content -match 'url_Lead1 \|\| url_Lead2'

    if ($isDoubleFile) {
        $newContent = [regex]::Replace($content, $patternDouble, $newDouble)
    }
    else {
        $newContent = [regex]::Replace($content, $patternSingle, $newSingle)
    }

    if ($newContent -ne $content) {
        # Write with UTF-8 WITHOUT BOM so TypeScript tooling is happy
        [System.IO.File]::WriteAllText($longPath, $newContent, (New-Object System.Text.UTF8Encoding $false))
        Write-Host "  [OK] Updated : $($file.Name)"
        $updatedCount++
    }
    else {
        Write-Host "  [--] No match : $($file.Name)"
        $noMatchCount++
    }
}

Write-Host ""
Write-Host "Done. Updated $updatedCount file(s), no match in $noMatchCount file(s)."
