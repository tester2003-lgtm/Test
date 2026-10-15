// Regression suite — Guest checkout with Credit Card (Airwallex). Site: BASE_URL in cypress/support/config.js
// Run: npx cypress open   (recommended - see "Guest email verification" below)
//      npx cypress run --spec cypress/e2e/checkout/guest-credit-card.cy.js
// Chromium browsers only (Electron, Chrome, Edge) — not Firefox. See "Card fields" below.
// Not headless Chrome: the site's bot check rejects Add to Cart ("Robot detected!").
// Use the default Electron run, `cypress open`, or --browser chrome --headed.
//
// Guest email verification: entering an email at checkout makes the site send a
// 4-digit code to that inbox. In `cypress open` the test waits (up to 5 min) for
// you to type the code into the page and click "Verify Email Address", then it
// continues by itself. Headless runs stop with an explanation at that point.
//
// Card fields: #cardNumber / #expiry / #cvc are iframes served by Airwallex
// (checkout-demo.airwallex.com), so cy.type() can't reach the inputs inside them.
// cy.realClick() / cy.realType() (cypress-real-events) send real browser mouse and
// keyboard events instead, which land in whichever field has focus — like a person
// typing. Each field reports its state to the page via postMessage
// ({ type, code: 'onReady' | 'onChange', complete }); the spec waits for 'onReady'
// before typing and requires complete:true afterwards.
//
// One it() per checkout step. testIsolation: false keeps the same browser state
// (cart, form) across steps; if a step fails, the remaining steps are skipped.
//
// The test clicks "Complete Checkout", so every run places a real order on BASE_URL
// and pays it with the Airwallex sandbox test card (test mode — no real money).
// Keep BASE_URL pointed at the dev site.

import { BASE_URL } from '../../support/config';

const PRODUCT = { name: 'Art Paper Stickers', path: '/stickers/paper/art' };

const GUEST = {
  email: Cypress.expose('CHECKOUT_EMAIL') || 'trainee84.glophics+cypress@gmail.com',
  fullName: 'QA Automation',
  company: 'Glophics QA',
  address: '51 Changi Business Park Central 2',
  address2: '#04-05 The Signature',
  postcode: '486066',
  phone: '91234567',
};

// Airwallex sandbox test card. Expiry is typed as digits — the field adds the " / ".
const CARD = {
  cardNumber: '4035501000000008',
  expiry: '0330',
  cvc: '555',
};

// Wait for the guest email verification dialog, if the site shows one.
const handleEmailVerification = () => {
  cy.wait(3000);
  cy.get('body').then(($body) => {
    if ($body.find('.g-modal-header:contains("Email already registered")').length) {
      throw new Error(
        `${GUEST.email} is registered through Google login, so the site blocks guest checkout with it. ` +
        'Use a different email, e.g. trainee84.glophics+cypress@gmail.com.'
      );
    }

    if (!$body.find('.verification_form').length) return;

    if (!Cypress.config('isInteractive')) {
      throw new Error(
        `Guest checkout needs the verification code emailed to ${GUEST.email}. ` +
        'Run with `npx cypress open` and type the code into the page when asked.'
      );
    }

    cy.log(`**Type the code sent to ${GUEST.email} and click "Verify Email Address"**`);
    cy.get('.verification_form', { timeout: 5 * 60 * 1000 }).should('not.exist');
  });
};

// Record the state messages Airwallex's card iframes post to the page.
const trackAirwallexFields = (win) => {
  if (win.__airwallex) return;
  win.__airwallex = { ready: {}, complete: {} };
  win.addEventListener('message', ({ origin, data }) => {
    if (!/^https:\/\/[\w.-]+\.airwallex\.com$/.test(origin) || !data || !data.type) return;
    if (data.code === 'onReady') win.__airwallex.ready[data.type] = true;
    if (data.code === 'onChange') win.__airwallex.complete[data.type] = data.complete;
  });
};

const typeIntoCardField = (field, value) => {
  cy.window().its(`__airwallex.ready.${field}`, { timeout: 30000 }).should('equal', true);
  cy.get(`#${field} iframe`).should('be.visible').realClick();
  cy.realType(value, { delay: 50 });
  cy.window().its(`__airwallex.complete.${field}`).should('equal', true);
};

describe('Regression - Singaprinting (Credit Card checkout)', { testIsolation: false }, () => {
  let stepFailed = false;

  // testIsolation:false also stops Cypress clearing cookies, so in `cypress open` the guest
  // cart cookie survives between runs and items pile up. Start every run as a new guest.
  before(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
    cy.clearAllSessionStorage();
  });

  beforeEach(function () {
    if (stepFailed) this.skip();
    cy.viewport(1440, 900);
    // Third-party scripts (analytics, payment widgets) occasionally throw;
    // don't let those fail the test.
    cy.on('uncaught:exception', () => false);
  });

  afterEach(function () {
    if (this.currentTest.state === 'failed') stepFailed = true;
  });

  it('adds Art Paper Stickers to the cart', () => {
    cy.visit(BASE_URL + PRODUCT.path);
    cy.get('h1.quote_title').should('contain', PRODUCT.name);
    // The page is server-rendered: buttons do nothing until the Nuxt app has mounted.
    cy.window().should((win) => {
      expect(win.$nuxt && win.$nuxt._isMounted, 'Nuxt app mounted').to.equal(true);
    });

    // Add to Cart stays disabled until the price has loaded.
    cy.contains('.quote_footer_price h2', /S\$\d/, { timeout: 30000 });
    cy.contains('.quote_footer_btns button.btn_default', 'Add to Cart').should('be.enabled').click();

    // "Upload Artwork" modal: skip it (artwork can be uploaded later).
    // force: the link renders with display:contents, which Cypress treats as hidden.
    cy.get('.up_artwork_modal.active', { timeout: 20000 })
      .should('be.visible')
      .contains('a.high_text', 'Skip')
      .click({ force: true });

    cy.get('#view_cart_item .cart_number').should('have.text', '1');
    cy.get('.cart_dropdown.active .cart_drop_item', { timeout: 30000 })
      .should('have.length', 1)
      .and('contain', PRODUCT.name);
  });

  it('proceeds to checkout', () => {
    // Start listening before the checkout page mounts the Airwallex fields.
    cy.on('window:before:load', trackAirwallexFields);
    cy.window().then(trackAirwallexFields);

    cy.get('.cart_dropdown.active .cart_drop_buttons').contains('button', 'Checkout').click();
    cy.location('pathname', { timeout: 30000 }).should('eq', '/checkout');
  });

  it('fills in the guest email', () => {
    // The site pre-fills and locks the email if it remembers a verified guest.
    cy.get('#checkout_email', { timeout: 30000 }).should('be.visible').then(($email) => {
      if ($email.prop('readonly')) {
        cy.log('Email pre-filled and locked by the site: ' + $email.val());
      } else {
        cy.wrap($email).clear().type(GUEST.email).blur();
      }
    });
    handleEmailVerification();
  });

  it('fills in the shipping address', () => {
    cy.get('#checkout_shipping_full_name').should('be.enabled').clear().type(GUEST.fullName);
    cy.get('#checkout_shipping_company').should('be.enabled').clear().type(GUEST.company);
    cy.get('#checkout_shipping_address').should('be.enabled').clear().type(GUEST.address);
    cy.get('#checkout_shipping_address2').should('be.enabled').clear().type(GUEST.address2);
    cy.get('#checkout_shipping_postcode').should('be.enabled').clear().type(GUEST.postcode);
    cy.get('#checkout_shipping_phone_number').should('be.enabled').clear().type(GUEST.phone);
  });

  it('selects Standard shipping', () => {
    cy.get('input[name="delivery_option"][value="standard_shipping"]')
      .check({ force: true })
      .should('be.checked');
  });

  it('adds the special instruction', () => {
    // Flags the order as a test so it is not processed.
    const testNote = Array(3).fill('FOR TESTING PURPOSES ONLY, DO NOT PROCESS !');
    cy.get('#special_instructions')
      .clear()
      .type(testNote.join('{enter}'))
      .should('have.value', testNote.join('\n'));
  });

  it('selects Credit Card as the payment option', () => {
    cy.get('input[name="payment_method_id"][value="2"]', { timeout: 30000 })
      .check({ force: true })
      .should('be.checked');
    cy.get('.airwallex_container').should('be.visible');
  });

  it('fills in the card number, expiry and CVC', () => {
    typeIntoCardField('cardNumber', CARD.cardNumber);
    typeIntoCardField('expiry', CARD.expiry);
    typeIntoCardField('cvc', CARD.cvc);
  });

  it('shows the item in the order summary', () => {
    cy.contains('Item Summary (1)').should('be.visible');
    cy.contains(PRODUCT.name).should('exist');
  });

  it('checks the Terms of Service checkbox', () => {
    cy.get('#i_agree').check({ force: true }).should('be.checked');
  });

  it('clicks "Complete Checkout", pays with the card and lands on the order complete page', () => {
    cy.intercept('POST', '**/cart/checkout').as('createOrder');
    cy.intercept('PATCH', '**/cart/checkout/payment-summary-aw').as('confirmPayment');

    cy.contains('button.cart_submit:visible', 'Complete Checkout').should('be.enabled').click();

    // The order is created, Airwallex charges the card, then the site records the payment.
    cy.wait('@createOrder', { timeout: 60000 }).its('response.body.message').should('eq', 'airwallex');
    cy.wait('@confirmPayment', { timeout: 60000 }).its('response.body.message').should('eq', 'SUCCESS');

    // A failed order redirects to /order/failed instead.
    cy.location('pathname', { timeout: 60000 }).should('eq', '/order/complete');
    cy.location('search').should('match', /invoice_no=\w+/);
  });

  it('shows the thank-you message with the order number and email', () => {
    cy.get('.cart_thankyou', { timeout: 30000 }).within(() => {
      cy.contains('h3', /^Thank you, .+!$/);
      cy.contains('p', 'Your Order number is')
        .find('.high_text')
        .invoke('text')
        .should('match', /\w+/)
        .then((orderNumber) => cy.log(`**Order number: ${orderNumber.trim()}**`));
      cy.contains('p', 'A copy of your order details has been sent to').should('contain', GUEST.email);
    });
  });
});
