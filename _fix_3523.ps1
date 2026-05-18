$path = "\\?\D:\II. Automation\CRM_AUTO\tests\1.Project_CRM\9.CRM_Module\CRM_3523_Phase1-Contacts-should-be-assigned-to-the-Company-they-worked-at\1.Manual-creates-a-new-Company-if-entering-a-new-Company-domain-at-Opp-page\tc-crm-3523-1-1-1-Verify-Company-contact-created-automatically-if-entering-Company-domain.spec.ts"
$lines = [System.IO.File]::ReadAllLines($path)
Write-Host "Total lines before: $($lines.Length)"
# Find the line with "CRM-3523_1.1.1 verification" which marks end of valid content
$endIdx = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match "CRM-3523_1\.1\.1 verification") {
        $endIdx = $i
        break
    }
}
if ($endIdx -eq -1) { Write-Host "ERROR: marker not found"; exit 1 }
# The valid content ends 7 lines after this marker (Final Summary close + test close + describe close)
$keepTo = $endIdx + 7
Write-Host "Marker at line $($endIdx+1), keeping to line $($keepTo+1)"
$keep = $lines[0..$keepTo]
[System.IO.File]::WriteAllLines($path, $keep, [System.Text.Encoding]::UTF8)
Write-Host "Done. File now has $($keep.Length) lines."
