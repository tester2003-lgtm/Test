const { defineConfig } = require("cypress");
const { registerBugReports } = require("./cypress/plugins/bug-report");

module.exports = defineConfig({
  projectId: '6g3c9a',
  // Do not set chromeWebSecurity:false — the browser then omits the Origin header and
  // dev-api.singaprinting.com rejects every XHR with 403 "Not allowed in CORS policy",
  // breaking every spec. (It also can't unlock Airwallex's cross-site card iframes because of
  // Chrome Site Isolation; the checkout/*-credit-card.cy.js specs type the card with cy.realType instead.)
  // Lets the bug-report writer (after:spec) also run in `cypress open`, not only `cypress run`.
  experimentalInteractiveRunEvents: true,
  e2e: {
    setupNodeEvents(on, config) {
      // Writes a draft .txt bug report to cypress/bug-reports/ for every failed test.
      registerBugReports(on, config);
      return config;
    },
  },
});
