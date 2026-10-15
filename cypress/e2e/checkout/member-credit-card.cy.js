// Regression suite — Member checkout with Credit Card (Airwallex). Site: BASE_URL in cypress/support/config.js
// Run: npx cypress open
//      npx cypress run --spec cypress/e2e/checkout/member-credit-card.cy.js
// Chromium browsers only (Electron, Chrome, Edge) — not Firefox (card fields need cy.realType).
// Not headless Chrome: the site's bot check rejects Add to Cart ("Robot detected!").
// Use the default Electron run, `cypress open`, or --browser chrome --headed.
//
// Starts logged in via cy.loginByEmail() (commands.js), which needs MEMBER_EMAIL and
// MEMBER_PASSWORD in cypress.env.json. The login form itself is tested in auth/login-email.cy.js.
// A member's cart is saved on the account, so the spec empties it before adding the item.
// The shipping address is typed in only on the account's first checkout; after that the site
// shows it as a saved address and the spec selects it instead.
//
// Card fields: #cardNumber / #expiry / #cvc are iframes served by Airwallex, so cy.type()
// can't reach the inputs inside them. cy.realClick() / cy.realType() (cypress-real-events)
// send real browser input instead. Each field posts its state to the page
// ({ type, code: 'onReady' | 'onChange', complete }); the spec waits for 'onReady' before
// typing and requires complete:true afterwards.
//
// One it() per checkout step. testIsolation: false keeps the same browser state across
// steps; if a step fails, the remaining steps are skipped.
//
// The test clicks "Complete Checkout", so every run places a real order on the member's
// account and pays it with the Airwallex sandbox test card (test mode — no real money).
// Keep BASE_URL pointed at the dev site.

import { BASE_URL } from '../../support/config';

const PRODUCT = { name: 'Art Paper Stickers', path: '/stickers/paper/art' };

const SHIPPING = {
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

const cartDrawer = () => cy.get('.cart_dropdown.active', { timeout: 30000 });
const deletePopover = () => cartDrawer().find('.custom_popover').filter(':visible');

const openCart = () => {
  cy.get('body').then(($body) => {
    if (!$body.find('.cart_dropdown.active').length) cy.get('#view_cart_item').click({ force: true });
  });
  cartDrawer().should('be.visible');
};

// Delete `remaining` items from the drawer, one at a time, waiting for the count badge to
// drop after each. (The drawer lists up to 5 items at once, so it isn't checked for all of them.)
const deleteCartItems = (remaining) => {
  if (!remaining) return;

  openCart();
  cartDrawer()
    .find('figure.cart_drop_item:not(.no_cart_items)', { timeout: 30000 })
    .should('have.length.at.least', 1)
    .first()
    .find('a.cart2_delete')
    .click();
  deletePopover().contains('a', 'Yes, Delete Item').click();
  cy.get('#view_cart_item .cart_number').should('have.text', String(remaining - 1));
  deleteCartItems(remaining - 1);
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

describe('Regression - Singaprinting (Member Credit Card checkout)', { testIsolation: false }, () => {
  let stepFailed = false;

  // testIsolation:false also stops Cypress clearing cookies, so clear them, then log in once.
  // (Logging in before every step would restore the saved cookies mid-checkout.)
  before(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
    cy.clearAllSessionStorage();
    cy.loginByEmail();
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

  it('empties the cart left over from earlier runs', () => {
    // The page asks the API how many items the account's cart holds; use that as the truth
    // (the badge and drawer briefly show an empty cart before it answers).
    cy.intercept('GET', '**/cart-items/item-count*').as('itemCount');
    cy.visit(BASE_URL);
    // The page is server-rendered: buttons do nothing until the Nuxt app has mounted.
    cy.window().should((win) => {
      expect(win.$nuxt && win.$nuxt._isMounted, 'Nuxt app mounted').to.equal(true);
    });
    cy.wait('@itemCount', { timeout: 30000 })
      .its('response.body.data.item_count')
      .then((count) => deleteCartItems(Number(count)));
    cy.get('#view_cart_item .cart_number').should('have.text', '0');
  });

  it('adds Art Paper Stickers to the cart', () => {
    cy.visit(BASE_URL + PRODUCT.path);
    cy.get('h1.quote_title').should('contain', PRODUCT.name);
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

    // The member's saved shipping addresses load after the page; wait so the next step sees them.
    cy.intercept('GET', '**/user/get/address-book/shipping-address*').as('savedAddresses');

    cy.get('.cart_dropdown.active .cart_drop_buttons').contains('button', 'Checkout').click();
    cy.location('pathname', { timeout: 30000 }).should('eq', '/checkout');
    cy.wait('@savedAddresses', { timeout: 30000 });
    // Members have no email step.
    cy.get('#checkout_email').should('not.exist');
  });

  it('uses the saved shipping address, or fills one in if the account has none', () => {
    cy.get('form.shipping_address', { timeout: 30000 })
      .should(($form) => {
        const hasSavedAddress = $form.find('input[name="address_option"][value="old"]').length > 0;
        const hasAddressForm = $form.find('#checkout_shipping_full_name:visible').length > 0;
        expect(hasSavedAddress || hasAddressForm, 'saved address list or address form shown').to.equal(true);
      })
      .then(($form) => {
        const savedAddress = $form.find('input[name="address_option"][value="old"]');
        if (savedAddress.length) {
          cy.log('Using the saved shipping address');
          cy.wrap(savedAddress).check({ force: true }).should('be.checked');
          return;
        }

        // First checkout for this account: the address is saved to it after the order.
        // Full Name is pre-filled from the account; it is replaced like the other fields.
        cy.get('#checkout_shipping_full_name').should('be.enabled').clear().type(SHIPPING.fullName);
        cy.get('#checkout_shipping_company').should('be.enabled').clear().type(SHIPPING.company);
        cy.get('#checkout_shipping_address').should('be.enabled').clear().type(SHIPPING.address);
        cy.get('#checkout_shipping_address2').should('be.enabled').clear().type(SHIPPING.address2);
        cy.get('#checkout_shipping_postcode').should('be.enabled').clear().type(SHIPPING.postcode);
        cy.get('#checkout_shipping_phone_number').should('be.enabled').clear().type(SHIPPING.phone);
      });
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
    cy.wait('@confirmPayment', { timeout: 60000 }).then(({ response }) => {
      expect(response.body.message, 'payment recorded').to.equal('SUCCESS');
      // The order id is what /mypage/orders/<id> uses (e.g. ORDER_ID for customer-messages.cy.js).
      cy.log(`**Order id: ${response.body.data.order_master_id} — invoice ${response.body.data.invoice_no}**`);
    });

    // A failed order redirects to /order/failed instead.
    cy.location('pathname', { timeout: 60000 }).should('eq', '/order/complete');
    cy.location('search').should('match', /invoice_no=\w+/);
  });

  it('shows the thank-you message with the order number and member email', () => {
    cy.env(['MEMBER_EMAIL']).then(({ MEMBER_EMAIL }) => {
      cy.get('.cart_thankyou', { timeout: 30000 }).within(() => {
        cy.contains('h3', /^Thank you, .+!$/);
        cy.contains('p', 'Your Order number is')
          .find('.high_text')
          .invoke('text')
          .should('match', /\w+/)
          .then((orderNumber) => cy.log(`**Order number: ${orderNumber.trim()}**`));
        cy.contains('p', 'A copy of your order details has been sent to').should('contain', MEMBER_EMAIL);
      });
    });
  });
});
