/**
 * Redacting reporter - hides account secrets in the test report.
 *
 * Playwright puts the filled value into the TITLE of the `fill` action, so a login step shows up as
 *   Fill "W3lcome..." getByRole('textbox', { name: 'Password' })
 * in the HTML report, the JSON/JUnit files and Allure. This reporter masks every password from
 * config/users.secrets.json before those reporters read the step.
 *
 * MUST be FIRST in the reporter[] array of playwright.config.ts: reporters are called in array order
 * and they all share the same step objects, so the mutation done here propagates to every reporter
 * listed after it. Listed later = the html reporter has already read the raw title.
 *
 * NOT covered: trace.zip records the raw action params in the browser process, long before any
 * reporter runs - that is why LoginPage.fillPassword() sets the value without handing it to `fill`.
 */
const path = require('path');
const fs = require('fs');

function loadSecrets() {
  const values = [];

  // 1. The real password store (git-ignored, injected as a Jenkins secret file).
  try {
    const secrets = require(path.resolve(__dirname, 'users.secrets.json'));
    values.push(...Object.values(secrets).filter(v => typeof v === 'string'));
  } catch (e) {
    // No secrets file (fresh clone, CI before the secret file is injected) - nothing to add.
  }

  // 2. Passwords still hardcoded in config/test.config.ts (legacy login specs). Read as TEXT, not
  //    require(): this reporter is plain .js and the config is TypeScript.
  try {
    const source = fs.readFileSync(path.resolve(__dirname, 'test.config.ts'), 'utf8');
    const literal = /password\s*:\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = literal.exec(source)) !== null) values.push(match[1]);
  } catch (e) {
    // Config moved or renamed - the users.secrets.json values above still apply.
  }

  // Only real values: a 1-3 char password would mask half the report.
  return [...new Set(values.filter(v => typeof v === 'string' && v.length > 3))];
}

const SECRETS = loadSecrets();
const MASK = '********';

function mask(value) {
  if (typeof value !== 'string' || !SECRETS.length) return value;
  return SECRETS.reduce((acc, secret) => acc.split(secret).join(MASK), value);
}

class RedactReporter {
  onStepEnd(test, result, step) {
    step.title = mask(step.title);
    if (step.error) {
      step.error.message = mask(step.error.message);
      step.error.stack = mask(step.error.stack);
    }
  }

  onTestEnd(test, result) {
    (result.errors || []).forEach(error => {
      error.message = mask(error.message);
      error.stack = mask(error.stack);
      if (error.snippet) error.snippet = mask(error.snippet);
    });
    if (result.error) {
      result.error.message = mask(result.error.message);
      result.error.stack = mask(result.error.stack);
    }
    // console.log() output from the specs is embedded in the report too.
    result.stdout = (result.stdout || []).map(chunk => (typeof chunk === 'string' ? mask(chunk) : chunk));
    result.stderr = (result.stderr || []).map(chunk => (typeof chunk === 'string' ? mask(chunk) : chunk));
  }
}

module.exports = RedactReporter;
