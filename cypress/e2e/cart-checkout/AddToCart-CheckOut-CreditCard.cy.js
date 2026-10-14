// Regression suite — Guest checkout with Credit Card (Airwallex).
// Site: BASE_URL in cypress/support/config.js
//
// Run (interactive — recommended):
//   npx cypress open  → select Chrome → run this spec
//
// Run (headless):
//   npx cypress run --browser chrome --spec cypress/e2e/cart-checkout/AddToCart-CheckOut-CreditCard.cy.js
//
// Guest email verification: entering an email at checkout makes the site
// send a 4-digit code to that inbox. In `cypress open` the test waits
// (up to 5 min) for you to type the code and click "Verify Email Address",
// then continues. Headless runs stop with an explanation at that point.
//
// testIsolation: false — each it() continues in the same browser tab/state
// as the previous one, so the cart and form data persist across steps.
//
// The test clicks "Complete Checkout", so every run places a real order on
// BASE_URL. Keep BASE_URL pointed at the dev site.
//
// ── Why the card step doesn't type into the Airwallex iframe ───────────────
// Airwallex renders #cardNumber/#expiry/#cvc as cross-origin hosted iframes.
// Cypress (even in Chrome with chromeWebSecurity:false) cannot read or type
// into their contentDocument — this is a hard Cypress limitation for
// cross-origin frames, not a config issue, and no flag reliably fixes it.
// See https://docs.cypress.io/guides/references/trade-offs#Iframes.
//
// So this spec never touches the iframe. Instead it fakes a successful
// payment at the two points the site's own front-end code depends on after
// you click Complete Checkout:
//   1. window.Airwallex.confirmPaymentIntent(...) — the Airwallex JS SDK
//      call the page makes to tokenize/confirm the card. It's stubbed with
//      cy.stub() so it resolves { status: 'SUCCEEDED' } without needing any
//      real card input.
//   2. PATCH **/cart/checkout/payment-summary-aw — SingaPrinting's own backend
//      call that marks the order paid. It's stubbed with cy.intercept() and
//      echoes the real order created by POST cart/checkout, so the order is
//      created on dev but never marked paid (it stays unpaid/pending).
// See stubAirwallexSuccess() below (flow taken from the site's checkout
// bundle — re-check DevTools → Network if the site's checkout code changes).
//
// LIMITATION: because the Airwallex confirm call is faked, this test never
// exercises real Airwallex card tokenization — a genuine break in that
// integration (e.g. Airwallex rejecting a real card, or Airwallex renaming/
// removing window.Airwallex.confirmPaymentIntent) would NOT be caught here.
// This spec only proves the surrounding checkout UI works: shipping, special
// instructions, terms, order summary, and the confirmation page.
//
// MANUAL TEST CHECKLIST (run before a release or after any Airwallex/payment
// changes — same idea as the one in Login-Google.cy.js / Login-Facebook.cy.js
// for the same reason: this is a path Cypress can't safely automate):
//   [ ] In a normal browser (not Cypress — Step 9 always stubs the payment),
//       check out as a guest on BASE_URL and choose Credit Card.
//   [ ] In the real #cardNumber / #expiry / #cvc iframe fields, type the
//       Airwallex sandbox test card from the CARD constant below
//       (4035 5010 0000 0008, expiry 03/30, CVC 555).
//   [ ] Click Complete Checkout and confirm it redirects to /order/complete
//       with an invoice_no in the URL — same outcome Step 9 asserts below.
//   [ ] Open DevTools → Network while doing this and confirm the real calls
//       still match what stubAirwallexSuccess() assumes:
//       window.Airwallex.confirmPaymentIntent resolving { status:
//       'SUCCEEDED' }, then a same-shape PATCH **/cart/checkout/payment-summary-aw.
//       If Airwallex or the site changed either one, update
//       stubAirwallexSuccess() below to match.
//
// FALLBACK (documented, not used): the alternative to stubbing is making
// Cypress type directly into the Airwallex iframe, which needs
// chromeWebSecurity:false plus Chrome flags that disable Site Isolation —
// see the commented-out block in cypress.config.js for the exact code and
// why it's off by default (it breaks CORS for dev-api.singaprinting.com
// suite-wide, and it's still an unofficial, version-dependent workaround that
// can crash Cypress if the in-iframe flow ever clicks something that
// redirects window.top — cypress-io/cypress#23772, #9447, #25934). The
// manual checklist above already covers the real-tokenization gap that
// fallback would otherwise close, so it's kept as reference only.

import { BASE_URL } from '../../support/config';

const PAPER_STICKERS = [
  { name: 'Art Paper Stickers', path: '/stickers/paper/art' },
];

const GUEST = {
  email:    Cypress.expose('CHECKOUT_EMAIL') || 'trainee84.glophics+cypress@gmail.com',
  fullName: 'QA Automation',
  company:  'Glophics QA',
  address:  '51 Changi Business Park Central 2',
  address2: '#04-05 The Signature',
  postcode: '486066',
  phone:    '91234567',
};

// Airwallex sandbox test card — for reference / manual (cypress open) runs
// only. The automated flow below never types this anywhere; see the
// network-interception note at the top of this file.
const CARD = {
  number: '4035501000000008',
  expiry: '03 / 30',
  cvc:    '555',
};

// Open a product page and add it to the cart with default options.
const addToCart = (product) => {
  cy.visit(BASE_URL + product.path);
  cy.get('h1.quote_title').should('contain', product.name);

  cy.contains('.quote_footer_price h2', /S\$\d/, { timeout: 30000 });
  cy.contains('.quote_footer_btns button.btn_default', 'Add to Cart')
    .should('be.enabled')
    .click();

  cy.get('.up_artwork_modal.active', { timeout: 20000 })
    .should('be.visible')
    .contains('a.high_text', 'Skip')
    .click({ force: true });

  cy.get('.cart_dropdown.active', { timeout: 30000 })
    .find('.cart_drop_item')
    .should('contain', product.name);
};

// Handle the guest email verification dialog if the site shows one.
const handleEmailVerification = () => {
  cy.wait(3000);
  cy.get('body').then(($body) => {
    if ($body.find('.g-modal-header:contains("Email already registered")').length) {
      throw new Error(
        `${GUEST.email} is registered through Google login — the site blocks guest checkout with it. ` +
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

// Fake a successful Airwallex payment without touching the card iframes.
// Site flow on Complete Checkout (from its checkout bundle):
//   1. POST cart/checkout            → real; creates the order, returns intent_id/client_secret/invoice_no
//   2. Airwallex.confirmPaymentIntent → stubbed; site requires { status: 'SUCCEEDED' }
//   3. PATCH cart/checkout/payment-summary-aw → stubbed; its `data` becomes the order_complete
//      cookie that the thank-you page reads (invoice_no, customer, email), so it echoes the
//      real order from step 1 rather than made-up values.
const stubAirwallexSuccess = () => {
  let createdOrder = {};

  cy.intercept('POST', '**/cart/checkout', (req) => {
    req.continue((res) => {
      createdOrder = { data: (res.body && res.body.data) || {}, meta: (res.body && res.body.meta) || {} };
    });
  }).as('createOrder');

  cy.intercept('PATCH', '**/cart/checkout/payment-summary-aw', (req) => {
    req.reply({
      statusCode: 200,
      // The site's API helper discards any response without a `status` field.
      body: {
        status: 'SUCCESS',
        message: 'SUCCESS',
        data: {
          order_master_id: req.body.order_master_id,
          invoice_no: createdOrder.data.invoice_no,
          customer: req.body.first_name,
          email: req.body.email,
        },
        meta: { guest_id: createdOrder.meta.guest_id },
      },
    });
  }).as('paymentSummaryAw');

  // The SDK script loads after Credit Card is selected — retry until it's there.
  cy.window().its('Airwallex.confirmPaymentIntent', { timeout: 20000 }).should('be.a', 'function');
  cy.window().then((win) => {
    cy.stub(win.Airwallex, 'confirmPaymentIntent')
      .as('confirmPaymentIntent')
      .callsFake((opts) => Promise.resolve({ id: opts.id, status: 'SUCCEEDED' }));
  });
};

// testIsolation: false keeps browser state (cart, cookies, form) between steps.
describe('Regression - Singaprinting (Credit Card checkout)', { testIsolation: false }, () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.on('uncaught:exception', () => false);
  });

  // ── Step 1: Add product to cart ───────────────────────────────────────────

  it('adds Art Paper Stickers to the cart', () => {
    cy.visit(BASE_URL);
    cy.get('.nav_menu').should('be.visible');

    PAPER_STICKERS.forEach(addToCart);

    cy.get('#view_cart_item .cart_number').should('have.text', String(PAPER_STICKERS.length));
    cy.get('.cart_dropdown.active .cart_drop_item').should('have.length', PAPER_STICKERS.length);
    PAPER_STICKERS.forEach((product) => {
      cy.get('.cart_dropdown.active').should('contain', product.name);
    });
  });

  // ── Step 2: Proceed to checkout ───────────────────────────────────────────

  it('proceeds to checkout from the cart', () => {
    cy.get('.cart_dropdown.active .cart_drop_buttons')
      .contains('button', 'Checkout')
      .click();
    cy.location('pathname', { timeout: 30000 }).should('eq', '/checkout');
  });

  // ── Step 3: Fill contact info and handle email verification ───────────────

  it('fills in guest email and handles email verification', () => {
    cy.get('#checkout_email', { timeout: 30000 }).should('be.visible').then(($el) => {
      if ($el.prop('readonly')) {
        // Site pre-filled the email from a previous session — already set.
        cy.log('Email pre-filled and locked by site: ' + $el.val());
      } else {
        cy.wrap($el).clear().type(GUEST.email).blur();
      }
    });
    handleEmailVerification();
  });

  // ── Step 4: Fill shipping address ─────────────────────────────────────────

  it('fills in the shipping address', () => {
    cy.get('#checkout_shipping_full_name').clear().type(GUEST.fullName);
    cy.get('#checkout_shipping_company').clear().type(GUEST.company);
    cy.get('#checkout_shipping_address').clear().type(GUEST.address);
    cy.get('#checkout_shipping_address2').clear().type(GUEST.address2);
    cy.get('#checkout_shipping_postcode').clear().type(GUEST.postcode);
    cy.get('#checkout_shipping_phone_number').clear().type(GUEST.phone);
  });

  // ── Step 5: Select shipping method and add special instructions ───────────

  it('selects Standard shipping and adds special instructions', () => {
    cy.get('input[name="delivery_option"][value="standard_shipping"]').check({ force: true });

    const testNote = Array(3).fill('FOR TESTING PURPOSES ONLY, DO NOT PROCESS !');
    cy.get('#special_instructions')
      .clear()
      .type(testNote.join('{enter}'))
      .should('have.value', testNote.join('\n'));
  });

  // ── Step 6: Select Credit Card payment ────────────────────────────────────

  it('selects Credit Card as the payment method', () => {
    cy.get('.standard_radio_box:not(.loader)', { timeout: 20000 }).should('have.length.at.least', 1);

    cy.get('input#payment-option\\#2').check({ force: true }).should('be.checked');

    cy.get('.airwallex_container', { timeout: 15000 }).should('be.visible');
  });

  // ── Step 7: Card fields render ────────────────────────────────────────────
  // Cypress can't type into these cross-origin iframes (see file header); the
  // payment itself is stubbed in Step 9.

  it('shows the Airwallex card number, expiry and CVC fields', () => {
    ['cardNumber', 'expiry', 'cvc'].forEach((id) => {
      cy.get(`#${id} iframe`, { timeout: 20000 })
        .should('be.visible')
        .and('have.attr', 'src')
        .and('match', /airwallex\.com/);
    });
  });

  // ── Step 8: Review order summary and agree to terms ───────────────────────

  it('reviews the order summary and agrees to the Terms of Service', () => {
    // Check the item summary section exists (text may vary by site version).
    cy.contains(/Item Summary/i).should('be.visible');
    PAPER_STICKERS.forEach((product) => {
      cy.contains(product.name).should('exist');
    });

    cy.get('#i_agree').check({ force: true }).should('be.checked');
  });

  // ── Step 9: Complete checkout and confirm order ───────────────────────────

  it('clicks Complete Checkout and lands on the order confirmation page', () => {
    // Intercepts and stubs are reset between tests, so they're set up here, right before the click.
    stubAirwallexSuccess();

    cy.contains('button.cart_submit:visible', 'Complete Checkout')
      .should('be.enabled')
      .click();

    // Real order created and routed to the Airwallex payment branch, then the stubbed payment ran.
    cy.wait('@createOrder', { timeout: 60000 }).its('response.body.message').should('eq', 'airwallex');
    cy.get('@confirmPaymentIntent').should('have.been.calledOnce');
    cy.wait('@paymentSummaryAw');

    cy.location('pathname', { timeout: 60000 }).should('eq', '/order/complete');
    cy.location('search').should('match', /invoice_no=\w+/);

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
