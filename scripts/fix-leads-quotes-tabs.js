const fs = require('fs');
const path = require('path');

const base = path.join(
  __dirname, '..', 'tests', '1.Project_CRM', '4.Investments',
  'CRM-2482_Investments_module-General_fields', '2.Investment_record',
  '2.2.Tabs'
);

// Recursively collect all .spec.ts files in a directory
function collectSpecs(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(collectSpecs(full));
    else if (entry.name.endsWith('.spec.ts')) results.push(full);
  }
  return results;
}

// ── Leads tab: same structure as Audience tab ──
const leadsDir = path.join(base, '2.2.8.Leads_tab');
const leadsFiles = collectSpecs(leadsDir);

let totalUpdated = 0;

for (const filePath of leadsFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  const file = path.basename(filePath);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  let changed = false;

  // JSDoc 5.1 (aligned spacing format, no quotes)
  const old51 = ' *         - Tags          = test' + eol + ' *    5.2. Read template CSV';
  const new51 = ' *         - Tags          = test' + eol + ' *         - Investment ID  = test' + eol + ' *    5.2. Read template CSV';
  if (content.includes(old51)) { content = content.replace(old51, new51); changed = true; console.log('  [Leads JSDoc 5.1] ' + file); }

  // Call site
  const callOld = `await investmentPage.createImportAudienceFile();`;
  const callNew = `await investmentPage.createImportAudienceFile({ investmentId: 'test' });`;
  if (content.includes(callOld)) { content = content.replace(callOld, callNew); changed = true; console.log('  [Leads Call]      ' + file); }

  // Verify block
  const verifyOld = `      expect(savedContent).toContain(audienceData.companyName);${eol}${eol}      console.log('  ✓ File content verified — Contact Name, Email, and Company Name present');`;
  const verifyNew = `      expect(savedContent).toContain(audienceData.companyName);${eol}      expect(savedContent).toContain('test'); // Investment ID${eol}${eol}      console.log('  ✓ File content verified — Contact Name, Email, Company Name, and Investment ID present');`;
  if (content.includes(verifyOld)) { content = content.replace(verifyOld, verifyNew); changed = true; console.log('  [Leads Verify]    ' + file); }

  if (changed) { fs.writeFileSync(filePath, content, 'utf8'); totalUpdated++; }
}

// ── Quotes tab: same structure as Invoices tab (5.1 + 5.3 JSDoc, quoted format) ──
const quotesDir = path.join(base, '2.2.9.Quotes_tab');
const quotesFiles = collectSpecs(quotesDir);

for (const filePath of quotesFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  const file = path.basename(filePath);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  let changed = false;

  // JSDoc 5.1 (quoted format, before 5.2)
  const old51 = ' *         - "Tags" = test' + eol + ' *    5.2. Use the template CSV file';
  const new51 = ' *         - "Tags" = test' + eol + ' *         - "Investment ID" = test' + eol + ' *    5.2. Use the template CSV file';
  if (content.includes(old51)) { content = content.replace(old51, new51); changed = true; console.log('  [Quotes JSDoc 5.1] ' + file); }

  // JSDoc 5.3 (quoted format, before 5.4)
  const old53 = ' *         - "Tags" = test' + eol + ' *    5.4. Save the file';
  const new53 = ' *         - "Tags" = test' + eol + ' *         - "Investment ID" = test' + eol + ' *    5.4. Save the file';
  if (content.includes(old53)) { content = content.replace(old53, new53); changed = true; console.log('  [Quotes JSDoc 5.3] ' + file); }

  // Call site
  const callOld = `await investmentPage.createImportAudienceFile();`;
  const callNew = `await investmentPage.createImportAudienceFile({ investmentId: 'test' });`;
  if (content.includes(callOld)) { content = content.replace(callOld, callNew); changed = true; console.log('  [Quotes Call]      ' + file); }

  // Verify block
  const verifyOld = `      expect(savedContent).toContain(audienceData.companyName);${eol}${eol}      console.log('  ✓ File content verified — Contact Name, Email, and Company Name present');`;
  const verifyNew = `      expect(savedContent).toContain(audienceData.companyName);${eol}      expect(savedContent).toContain('test'); // Investment ID${eol}${eol}      console.log('  ✓ File content verified — Contact Name, Email, Company Name, and Investment ID present');`;
  if (content.includes(verifyOld)) { content = content.replace(verifyOld, verifyNew); changed = true; console.log('  [Quotes Verify]    ' + file); }

  if (changed) { fs.writeFileSync(filePath, content, 'utf8'); totalUpdated++; }
}

console.log('\nTotal files updated: ' + totalUpdated);
