// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'

// cy.realClick / cy.realType: real browser input events (Chromium only). Used to type into
// cross-origin iframes such as the Airwallex card fields, which normal cy.type() can't reach.
import 'cypress-real-events'

// Collects page URL and recent actions so failed tests get a draft bug report
// (cypress/bug-reports/, written by cypress/plugins/bug-report.js).
import './bug-report'