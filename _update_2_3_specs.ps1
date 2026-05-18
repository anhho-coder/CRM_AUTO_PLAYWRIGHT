$dir = "d:\II. Automation\CRM_AUTO\tests\demo_test\CRM_4001 _Email-field-validation\2.Manual-creates-a-new-Company-on-Lead-if-having\2.3.if-email-contains-reluctant-characters-like"

$charMap = @{
  "3"  = "+"
  "4"  = "*"
  "5"  = "&"
  "6"  = "!"
  "7"  = "@"
  "8"  = "#"
  "9"  = "$"
  "10" = "%"
  "11" = "^"
  "12" = "("
  "13" = ")"
  "14" = "_"
  "15" = "="
}

foreach ($num in @("3","4","5","6","7","8","9","10","11","12","13","14","15")) {
  $char = $charMap[$num]
  $oldId = "CRM-4001_1.3.1.$num"
  $newId = "CRM-4001_2.3.1.$num"
  
  $files = Get-ChildItem $dir | Where-Object { $_.Name -match "-$num-" }
  if (-not $files) { Write-Host "No file for $num"; continue }
  $file = $files[0]
  Write-Host "Processing: $($file.Name)"
  
  $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
  
  $content = $content.Replace("import { LoginPage, HomePage, OpportunityPage } from '@pages';",
    "import { LoginPage, HomePage, LeadPage } from '@pages';")
  
  $content = $content.Replace("'$oldId'", "'$newId'")
  
  $content = $content.Replace("$oldId - Verify Error message appears when email contains `"$char`" letter on Opp",
    "$newId - Verify Error message appears when email contains `"$char`" letter on Lead")
  
  $content = $content.Replace("${oldId}: Verify Error message appears when email contains `"$char`" letter on Opp @CRM-10450",
    "${newId}: Verify Error message appears when email contains `"$char`" letter on Lead")
  
  $content = $content -replace "    test\.skip\(true, 'Bug CRM-10450'\);\r?\n", ""
  
  $oldBlock = "    const loginPage       = new LoginPage(page);" + [char]13 + [char]10 + "    const homePage        = new HomePage(page);" + [char]13 + [char]10 + "    const opportunityPage = new OpportunityPage(page);"
  $newBlock = "    const loginPage = new LoginPage(page);" + [char]13 + [char]10 + "    const homePage  = new HomePage(page);" + [char]13 + [char]10 + "    const leadPage  = new LeadPage(page);"
  $content = $content.Replace($oldBlock, $newBlock)
  
  $content = $content.Replace("await opportunityPage.switchToListView();", "await homePage.navigateToLeads();")
  $content = $content.Replace("await opportunityPage.clickCreate();", "await leadPage.clickCreate();")
  $content = $content.Replace("await opportunityPage.fillOpportunityName(oppName);", "await leadPage.fillLeadOpportunity(oppName);")
  $content = $content.Replace("await opportunityPage.fillEmail(email_Contact1);", "await leadPage.fillEmail(email_Contact1);")
  $content = $content.Replace("await opportunityPage.clickSave();", "await leadPage.clickSave();")
  $content = $content.Replace("const dialogText = await opportunityPage.waitForServerErrorDialog();",
    "const dialogText = await leadPage.waitForServerErrorDialog();")
  
  $oldStep2 = "await test.step('Step 2: Click ""view list"" button', async () => {" + [char]13 + [char]10 + "      console.log('Step 2: Switching to list view');"
  $newStep2 = "await test.step('Step 2: Select ""Leads"" > ""Leads"" from top menu', async () => {" + [char]13 + [char]10 + "      console.log('Step 2: Navigating to Leads page');"
  $content = $content.Replace($oldStep2, $newStep2)
  
  $content = $content.Replace("console.log('\u2713 List view activated');", "console.log('\u2713 Leads page loaded');")
  $content = $content.Replace("'Step 2 - Opp list view'", "'Step 2 - Leads page'")
  $content = $content.Replace("console.log('\u2713 Opp creation form opened');", "console.log('\u2713 Lead creation form opened');")
  $content = $content.Replace("'Step 3 - Opp creation form'", "'Step 3 - Lead creation form'")
  
  $content = $content.Replace(" * Test Case ID: $oldId", " * Test Case ID: $newId")
  $content = $content.Replace(" * Summary: Verify an Error message appears when manual creating a new Company on Opp",
    " * Summary: Verify an Error message appears when manual creating a new Company on Lead")
  $content = $content.Replace(' * 2.  On "CRM" page, click at "view list" button',
    ' * 2.  On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item')
  $content = $content.Replace(' * 3.  On "Opp" page, click at "CREATE" button',
    ' * 3.  On "Leads" page, click at "CREATE" button')
  $content = $content.Replace(" *     - Opp name textbox = TEST Opp 1 $oldId",
    " *     - Opp name textbox = TEST Opp 1 $newId")
  
  $escapedOld = $oldId.Replace(".", "\.")
  $escapedNew = $newId.Replace(".", "\.")
  $content = $content.Replace("npx playwright test --grep ""$escapedOld`:"" ",
    "npx playwright test --grep ""$escapedNew`:"" ")
  
  $content = $content.Replace("TEST PASSED: $oldId", "TEST PASSED: $newId")
  
  [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.Encoding]::UTF8)
  Write-Host "  Done."
}

Write-Host "`nAll done."
