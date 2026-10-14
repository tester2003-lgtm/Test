// Regression suite. Site: BASE_URL in cypress/support/config.js
// Run: npx cypress open   (recommended - see "Guest email verification" below)
//      npx cypress run --spec cypress/e2e/cart-checkout/AddToCart-CheckOut.cy.js
//
// Guest email verification: entering an email at checkout makes the site send a
// 4-digit code to that inbox. In `cypress open` the test waits (up to 5 min) for
// you to type the code into the page and click "Verify Email Address", then it
// continues by itself. Headless runs stop with an explanation at that point.
//
// The test clicks "Complete Checkout", so every run places a (Bank Transfer) order
// on BASE_URL. Keep BASE_URL pointed at the dev site.

import { BASE_URL } from '../../support/config';


const PAPER_STICKERS = [
  { name: 'Art Paper Stickers', path: '/stickers/paper/art' },
  { name: 'Classic Paper Stickers', path: '/stickers/paper/classic' },
  { name: 'Kraft Paper Stickers', path: '/stickers/paper/kraft' },
];

// trainee84.glophics@gmail.com itself is registered via Google login, which blocks
// guest checkout. Gmail ignores the "+..." part, so the code still arrives in the
// trainee84 inbox while the site treats it as a new guest email.
const GUEST = {
  email: Cypress.expose('CHECKOUT_EMAIL') || 'trainee84.glophics+cypress@gmail.com',
  fullName: 'QA Automation',
  company: 'Glophics QA',
  address: '51 Changi Business Park Central 2',
  address2: '#04-05 The Signature',
  postcode: '486066',
  phone: '91234567',
};

// Open a product page and add it to the cart with its default options
// (default size / quantity are pre-selected on the page).
const addToCart = (product) => {
  cy.visit(BASE_URL + product.path);
  cy.get('h1.quote_title').should('contain', product.name);

  // Add to Cart stays disabled until the price has loaded.
  cy.contains('.quote_footer_price h2', /S\$\d/, { timeout: 30000 });
  cy.contains('.quote_footer_btns button.btn_default', 'Add to Cart')
    .should('be.enabled')
    .click();

  // "Upload Artwork" modal: skip it (artwork can be uploaded later).
  // force: the link renders with display:contents, which Cypress treats as hidden.
  cy.get('.up_artwork_modal.active', { timeout: 20000 })
    .should('be.visible')
    .contains('a.high_text', 'Skip')
    .click({ force: true });

  // The cart drawer opens with the item in it.
  cy.get('.cart_dropdown.active', { timeout: 30000 })
    .find('.cart_drop_item')
    .should('contain', product.name);
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

describe('Regression - Singaprinting', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);

    // Third-party scripts (analytics, payment widgets) occasionally throw;
    // don't let those fail the test.
    cy.on('uncaught:exception', () => false);
  });

  it('adds Art, Classic and Kraft paper stickers to the cart and checks out as a guest', () => {
    // --- ADD TO CART ---
    cy.visit(BASE_URL);
    cy.get('.nav_menu').should('be.visible');

    PAPER_STICKERS.forEach(addToCart);

    // All three items are in the cart.
    cy.get('#view_cart_item .cart_number').should('have.text', String(PAPER_STICKERS.length));
    cy.get('.cart_dropdown.active .cart_drop_item').should('have.length', PAPER_STICKERS.length);
    PAPER_STICKERS.forEach((product) => {
      cy.get('.cart_dropdown.active').should('contain', product.name);
    });

    // --- CHECKOUT ---
    cy.get('.cart_dropdown.active .cart_drop_buttons')
      .contains('button', 'Checkout')
      .click();
    cy.location('pathname', { timeout: 30000 }).should('eq', '/checkout');

    // Contact info
    cy.get('#checkout_email', { timeout: 30000 }).should('be.visible').type(GUEST.email).blur();
    handleEmailVerification();

    // Shipping address
    cy.get('#checkout_shipping_full_name').clear().type(GUEST.fullName);
    cy.get('#checkout_shipping_company').clear().type(GUEST.company);
    cy.get('#checkout_shipping_address').clear().type(GUEST.address);
    cy.get('#checkout_shipping_address2').clear().type(GUEST.address2);
    cy.get('#checkout_shipping_postcode').clear().type(GUEST.postcode);
    cy.get('#checkout_shipping_phone_number').clear().type(GUEST.phone);

    // Shipping method: Standard
    cy.get('input[name="delivery_option"][value="standard_shipping"]').check({ force: true });

    // Special Instruction: flag the order as a test so it is not processed
    const testNote = Array(3).fill('FOR TESTING PURPOSES ONLY, DO NOT PROCESS !');
    cy.get('#special_instructions')
      .clear()
      .type(testNote.join('{enter}'))
      .should('have.value', testNote.join('\n'));

    // Payment: Bank Transfer (card fields live in cross-origin Airwallex iframes)
    cy.get('input#payment-option\\#3').check({ force: true }).should('be.checked');
    cy.get('.payment_description').should('contain', 'Bank');

    // Agree to Terms of Service & Privacy Policy
    cy.get('#i_agree').check({ force: true }).should('be.checked');

    // Order summary lists all three products
    cy.contains(`Item Summary (${PAPER_STICKERS.length})`).should('be.visible');
    PAPER_STICKERS.forEach((product) => {
      cy.contains(product.name).should('exist');
    });

    // --- COMPLETE CHECKOUT (places an order) ---
    cy.contains('button.cart_submit:visible', 'Complete Checkout')
      .should('be.enabled')
      .click();

    // --- SUCCESSFUL CHECKOUT ---
    // A failed order redirects to /order/failed instead.
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
