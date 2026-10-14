const { defineConfig } = require("cypress");

module.exports = defineConfig({
  projectId: '6g3c9a',
  // Do not set chromeWebSecurity:false — the browser then omits the Origin header and
  // dev-api.singaprinting.com rejects every XHR with 403 "Not allowed in CORS policy",
  // breaking every spec. (It also can't unlock Airwallex's cross-site card iframes because of
  // Chrome Site Isolation; AddToCart-CheckOut-CreditCard.cy.js stubs the payment instead.)
  e2e: {
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
});
