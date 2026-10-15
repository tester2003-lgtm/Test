// Browser side of the automatic bug reports: records what each test does and, when a test
// fails, sends that context to cypress/plugins/bug-report.js, which writes the .txt report
// after the spec finishes.

// Commands worth listing as "steps to reproduce".
const ACTIONS = new Set([
  'visit', 'reload', 'go', 'click', 'dblclick', 'rightclick', 'type', 'clear', 'check', 'uncheck',
  'select', 'selectFile', 'trigger', 'scrollTo', 'submit', 'realClick', 'realType', 'realPress',
]);
// Commands that pick the element the next action works on.
const QUERIES = new Set(['get', 'contains', 'find', 'first', 'last', 'eq', 'filter', 'closest']);

let actions = [];
let lastTarget = '';

Cypress.on('test:before:run', () => {
  actions = [];
  lastTarget = '';
});

// Only what the Command Log shows: commands run with { log: false } (passwords) never get here.
Cypress.on('log:added', (attrs) => {
  if (attrs.instrument !== 'command') return;
  const message = String(attrs.message || '').replace(/\s+/g, ' ').trim();

  if (QUERIES.has(attrs.name)) {
    if (attrs.name === 'get' || attrs.name === 'contains') lastTarget = message;
    return;
  }
  if (!ACTIONS.has(attrs.name)) return;

  const onElement = !['visit', 'reload', 'go', 'realType', 'realPress'].includes(attrs.name);
  const step = [attrs.name, message, onElement && lastTarget ? `on ${lastTarget}` : ''].filter(Boolean).join(' ');
  actions.push(step.slice(0, 220));
});

const describeValue = (value) => {
  if (value === undefined) return null;
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
};

afterEach(function () {
  const test = this.currentTest;
  if (!test || test.state !== 'failed') return;
  const err = test.err || {};

  cy.window({ log: false }).then((win) => {
    let url;
    try {
      url = win.location.href;
    } catch (e) {
      url = 'unknown (the page was on another website)';
    }

    cy.task(
      'bugReport:context',
      {
        title: test.titlePath(),
        url,
        browser: `${Cypress.browser.displayName} ${Cypress.browser.majorVersion}${Cypress.browser.isHeadless ? ' (headless)' : ''}`,
        viewport: `${win.innerWidth}x${win.innerHeight}`,
        // Step-by-step specs (testIsolation: false) build on earlier tests, so those are steps too.
        journey: Cypress.config('testIsolation') === false,
        actions: actions.slice(-25),
        expected: describeValue(err.expected),
        actual: describeValue(err.actual),
      },
      { log: false }
    );
  });
});
