const fs = require('fs');
const path = require('path');

const dir = path.join(
  __dirname, '..', 'tests', '1.Project_CRM', '4.Investments',
  'CRM-2482_Investments_module-General_fields', '2.Investment_record',
  '2.2.Tabs', '2.2.4.Audience_tab'
);

const files = fs.readdirSync(dir).filter(f => f.endsWith('.spec.ts'));

let count = 0;
for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const eol = content.includes('\r\n') ? '\r\n' : '\n';

  // 1. JSDoc 5.1: add "Investment ID  = test" after "Tags          = test" (before "5.2. Read template CSV")
  const tagsLine  = ' *         - Tags          = test';
  const next52    = ' *    5.2. Read template CSV';
  const invIdLine = ' *         - Investment ID  = test';
  const old51 = tagsLine + eol + next52;
  const new51 = tagsLine + eol + invIdLine + eol + next52;
  if (content.includes(old51)) {
    content = content.replace(old51, new51);
    changed = true;
    console.log('  [JSDoc 5.1] Updated: ' + file);
  } else if (content.includes(invIdLine)) {
    console.log('  [JSDoc 5.1] Already updated: ' + file);
  } else {
    console.log('  [JSDoc 5.1] Pattern not found: ' + file);
  }

  // 2. Call site
  const callOld = `await investmentPage.createImportAudienceFile();`;
  const callNew = `await investmentPage.createImportAudienceFile({ investmentId: 'test' });`;
  if (content.includes(callOld)) {
    content = content.replace(callOld, callNew);
    changed = true;
    console.log('  [Call]     Updated: ' + file);
  } else {
    console.log('  [Call]     Already updated or not found: ' + file);
  }

  // 3. Verify block: add Investment ID expect + update log
  const verifyOld = `      expect(savedContent).toContain(audienceData.companyName);${eol}${eol}      console.log('  ✓ File content verified — Contact Name, Email, and Company Name present');`;
  const verifyNew = `      expect(savedContent).toContain(audienceData.companyName);${eol}      expect(savedContent).toContain('test'); // Investment ID${eol}${eol}      console.log('  ✓ File content verified — Contact Name, Email, Company Name, and Investment ID present');`;
  if (content.includes(verifyOld)) {
    content = content.replace(verifyOld, verifyNew);
    changed = true;
    console.log('  [Verify]   Updated: ' + file);
  } else {
    console.log('  [Verify]   Already updated or not found: ' + file);
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    count++;
  }
}

console.log('\nTotal files updated: ' + count);
