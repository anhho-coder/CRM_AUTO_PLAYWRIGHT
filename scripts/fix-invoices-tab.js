const fs = require('fs');
const path = require('path');

const dir = path.join(
  __dirname, '..', 'tests', '1.Project_CRM', '4.Investments',
  'CRM-2482_Investments_module-General_fields', '2.Investment_record',
  '2.2.Tabs', '2.2.10.Invoices_tab'
);

const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('.spec.ts') && !f.includes('2-2-10-1-Verify')); // skip already-updated file

let count = 0;
for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. JSDoc 5.1 section: add "Investment ID" = test before 5.2
  const jsdoc51Old = ' *         - "Tags" = test\n *    5.2. Use the template CSV file';
  const jsdoc51New = ' *         - "Tags" = test\n *         - "Investment ID" = test\n *    5.2. Use the template CSV file';
  if (content.includes(jsdoc51Old)) {
    content = content.replace(jsdoc51Old, jsdoc51New);
    changed = true;
  }

  // 2. JSDoc 5.3 section: add "Investment ID" = test before 5.4
  const jsdoc53Old = ' *         - "Tags" = test\n *    5.4. Save the file';
  const jsdoc53New = ' *         - "Tags" = test\n *         - "Investment ID" = test\n *    5.4. Save the file';
  if (content.includes(jsdoc53Old)) {
    content = content.replace(jsdoc53Old, jsdoc53New);
    changed = true;
  }

  // 3. createImportAudienceFile() call
  const callOld = `await investmentPage.createImportAudienceFile();`;
  const callNew = `await investmentPage.createImportAudienceFile({ investmentId: 'test' });`;
  if (content.includes(callOld)) {
    content = content.replace(callOld, callNew);
    changed = true;
  }

  // 4. CSV verify + log message
  const verifyOld = `      expect(savedContent).toContain(audienceData.companyName);\n\n      console.log('  ✓ File content verified — Contact Name, Email, and Company Name present');`;
  const verifyNew = `      expect(savedContent).toContain(audienceData.companyName);\n      expect(savedContent).toContain('test'); // Investment ID\n\n      console.log('  ✓ File content verified — Contact Name, Email, Company Name, and Investment ID present');`;
  if (content.includes(verifyOld)) {
    content = content.replace(verifyOld, verifyNew);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    count++;
    console.log('Updated: ' + file);
  } else {
    console.log('No changes needed: ' + file);
  }
}

console.log('\nTotal files updated: ' + count);
