// Node side of the automatic bug reports. For every failed test it creates a folder in
// cypress/bug-reports/ holding a draft bug-report.txt and a copy of the failure screenshot,
// combining Cypress's results for the spec (error, screenshot, earlier steps) with the context
// sent by cypress/support/bug-report.js (page URL, actions). Registered in cypress.config.js.

const fs = require('fs');
const path = require('path');

const REPORT_DIR = path.join('cypress', 'bug-reports');

const pad = (n) => String(n).padStart(2, '0');
const timestamp = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
// Characters Cypress drops from screenshot file names.
const fileSafe = (text) => text.replace(/[<>:"/\\|?*]/g, '');

const siteUnderTest = () => {
  try {
    const source = fs.readFileSync(path.join('cypress', 'support', 'config.js'), 'utf8');
    const match = source.match(/^\s*export const BASE_URL = ['"]([^'"]+)['"]/m);
    return match ? match[1] : 'unknown';
  } catch (e) {
    return 'unknown';
  }
};

function registerBugReports(on, config) {
  const contexts = new Map();
  let runBrowser = '';

  // Values of secret-looking keys in cypress.env.json are blanked out of every report.
  const secrets = Object.entries(config.env || {})
    .filter(([key, value]) => /PASSWORD|SECRET|TOKEN|KEY/i.test(key) && typeof value === 'string' && value.length >= 4)
    .map(([, value]) => value);
  const redact = (text) => secrets.reduce((out, secret) => out.split(secret).join('******'), text);

  on('before:run', (details) => {
    if (details && details.browser) runBrowser = `${details.browser.displayName} ${details.browser.majorVersion}`;
  });

  on('task', {
    'bugReport:context'(context) {
      contexts.set(context.title.join(' '), context);
      return null;
    },
  });

  on('after:spec', (spec, results) => {
    if (!results || !results.tests) return;
    const specPath = spec.relative.replace(/\\/g, '/');
    const area = specPath.split('/').slice(-2, -1)[0] || 'e2e';

    results.tests.forEach((test, index) => {
      if (test.state !== 'failed') return;

      const testName = test.title[test.title.length - 1];
      const context = contexts.get(test.title.join(' ')) || {};
      const error = String(test.displayError || 'No error message recorded.');
      const errorLines = error.split('\n');
      const firstErrorLine = errorLines.find((line) => line.trim()) || 'failed';
      const now = new Date();

      // Step-by-step specs only: the earlier tests in the same describe block are the steps
      // already done. Independent tests don't build on each other, so they're not listed.
      const group = test.title.slice(0, -1).join(' > ');
      const earlierSteps = context.journey
        ? results.tests
            .slice(0, index)
            .filter((t) => t.title.slice(0, -1).join(' > ') === group)
            .map((t) => `  ${t.state === 'passed' ? 'PASS' : t.state === 'failed' ? 'FAIL' : 'SKIP'}  ${t.title[t.title.length - 1]}`)
        : [];

      // One folder per failure: the report plus copies of its screenshots (Cypress empties
      // cypress/screenshots at the start of every run, so the copies keep the evidence).
      const folder = path.join(
        REPORT_DIR,
        `${timestamp(now).replace(/[: ]/g, '-')}_${slug(path.basename(specPath, '.cy.js'))}_${slug(testName)}`
      );
      fs.mkdirSync(folder, { recursive: true });
      const screenshots = (results.screenshots || [])
        .filter((shot) => shot.path.includes(fileSafe(testName)) && fs.existsSync(shot.path))
        .map((shot) => {
          const copyName = path.basename(shot.path);
          fs.copyFileSync(shot.path, path.join(folder, copyName));
          return `  ${copyName}  (in this folder)`;
        });

      const lines = [
        'DRAFT BUG REPORT (written automatically by Cypress when a test failed)',
        'Check that it reproduces by hand first — a failure can be a test problem, not a site bug.',
        '==========================================================================================',
        '',
        `Title:        [${area}] ${testName} — ${firstErrorLine.trim().slice(0, 140)}`,
        `Date:         ${timestamp(now)}`,
        `Site:         ${siteUnderTest()}`,
        `Page at fail: ${context.url || 'unknown (the test failed before the page could be read)'}`,
        `Browser:      ${context.browser || runBrowser || 'unknown'}${context.viewport ? `, viewport ${context.viewport}` : ''}`,
        `Spec:         ${specPath}`,
        `Test:         ${test.title.join(' > ')}`,
        'Severity:     (set by tester)',
        'Priority:     (set by tester)',
        '',
        'STEPS TO REPRODUCE',
        ...(earlierSteps.length
          ? ['Earlier steps in this spec (the test names describe what was done):', ...earlierSteps, `  FAIL  ${testName}`, '']
          : []),
        'Actions in the failing test:',
        ...(context.actions && context.actions.length
          ? context.actions.map((action, i) => `  ${i + 1}. ${action}`)
          : ['  (not recorded — the failure happened before or outside the test body, e.g. in a before() hook)']),
        '',
        'EXPECTED RESULT',
        `  ${context.expected != null ? context.expected : 'See the error below (the assertion states what was expected).'}`,
        '',
        'ACTUAL RESULT',
        `  ${context.actual != null ? context.actual : firstErrorLine.trim()}`,
        '',
        'ERROR',
        ...errorLines.slice(0, 25).map((line) => `  ${line}`),
        '',
        'ATTACHMENTS',
        ...(screenshots.length ? screenshots : ['  (no screenshot — screenshots are taken in `npx cypress run`)']),
        '',
        `Attempts: ${(test.attempts || []).length || 1}   Duration: ${test.duration != null ? `${(test.duration / 1000).toFixed(1)}s` : 'unknown'}`,
      ].filter((line, i, all) => !(line === '' && all[i - 1] === ''));

      fs.writeFileSync(path.join(folder, 'bug-report.txt'), redact(lines.join('\n')) + '\n');
      console.log(`  Bug report written: ${folder}`);
    });

    results.tests.forEach((test) => contexts.delete(test.title.join(' ')));
  });
}

module.exports = { registerBugReports };
