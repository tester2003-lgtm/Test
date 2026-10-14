// Cart - add items, cart count, edit quantity, delete (Yes / No) and the empty cart.
// Site: BASE_URL in cypress/support/config.js
// Run: npx cypress run --spec cypress/e2e/cart-checkout/Cart.cy.js
//
// Guest: every test starts with a fresh, empty cart.
// Logged-in member: uses the account in cypress.env.json; each test empties the
// account's saved cart first. Covers what differs for members: the cart is saved
// to the account, hidden on sign out, and a guest cart merges in on login.

import { BASE_URL } from '../../support/config';

const ART_PAPER = { name: 'Art Paper Stickers', path: '/stickers/paper/art' };
const CLASSIC_PAPER = { name: 'Classic Paper Stickers', path: '/stickers/paper/classic' };
const KRAFT_PAPER = { name: 'Kraft Paper Stickers', path: '/stickers/paper/kraft' };

const EMPTY_CART_MESSAGE = 'There are no items in the cart.';

const toNumber = (text) => Number(text.replace(/[^\d.]/g, ''));

// Open a product page and add it to the cart with its default options.
const addToCart = (product) => {
  cy.visit(BASE_URL + product.path);
  cy.get('h1.quote_title').should('contain', product.name);

  // Add to Cart stays disabled until the price has loaded.
  cy.contains('.quote_footer_price h2', /S\$\d/, { timeout: 30000 });
  cy.contains('.quote_footer_btns button.btn_default', 'Add to Cart')
    .should('be.enabled')
    .click();

  // "Upload Artwork" modal: skip it.
  // force: the link renders with display:contents, which Cypress treats as hidden.
  cy.get('.up_artwork_modal.active', { timeout: 20000 })
    .should('be.visible')
    .contains('a.high_text', 'Skip')
    .click({ force: true });

  cartItem(product).should('exist');
};

const cartCount = () => cy.get('#view_cart_item .cart_number');
const cartDrawer = () => cy.get('.cart_dropdown.active', { timeout: 30000 });
const cartItems = () => cartDrawer().find('figure.cart_drop_item:not(.no_cart_items)');
const cartItem = (product) =>
  cartDrawer().contains('.cart_drop_item .h5_heading', product.name, { timeout: 30000 }).closest('figure');

const openCart = () => {
  cy.get('#view_cart_item').click({ force: true });
  cartDrawer().should('be.visible');
};

const expectCartCount = (count) => {
  cartCount().should('have.text', String(count));
  if (count > 0) {
    cartItems().should('have.length', count);
    cartDrawer().contains('.cart_drop_buttons button', `View Cart (${count})`);
  }
};

const expectEmptyCart = () => {
  cartCount().should('have.text', '0');
  cartDrawer().find('.no_cart_items').should('be.visible').and('contain', EMPTY_CART_MESSAGE);
  cartDrawer().find('figure.cart_drop_item:not(.no_cart_items)').should('not.exist');
};

// Subtotal in the drawer equals the sum of the item prices.
// Retries, because the subtotal updates a moment after the items do.
const expectSubtotalMatchesItems = () => {
  cartDrawer().should(($drawer) => {
    const prices = $drawer.find('figure.cart_drop_item:not(.no_cart_items) .cart_drop_price');
    const sum = [...prices].reduce((total, el) => total + toNumber(el.innerText), 0);
    const subtotal = $drawer.find('.cart_drop_fees li:contains("Subtotal") span').text();

    expect(prices.length, 'items with a price').to.be.greaterThan(0);
    expect(toNumber(subtotal), 'subtotal').to.be.closeTo(sum, 0.001);
  });
};

const clickDelete = (product) => cartItem(product).find('a.cart2_delete').click();
const deletePopover = () => cartDrawer().find('.custom_popover').filter(':visible');

const deleteItem = (product) => {
  clickDelete(product);
  deletePopover().contains('a', 'Yes, Delete Item').click();
};

// --- Member helpers ---

// Log in through the UI. (cy.login() caches the session with cy.session, which
// would restore a token after these tests sign out.)
const loginViaUi = () => {
  cy.env(['SP_EMAIL', 'SP_PASSWORD']).then(({ SP_EMAIL, SP_PASSWORD }) => {
    cy.visit(BASE_URL);
    cy.get('a.icon_myaccount[aria-label="My Account"]').click({ force: true });
    cy.contains('.dropdown-item button', 'Sign in to Account').click({ force: true });
    cy.get('form.login_form input[type="text"]').type(SP_EMAIL);
    cy.get('form.login_form input[type="password"]').type(SP_PASSWORD, { log: false });
    cy.contains('form.login_form button[type="submit"]', 'Sign In').click();
    cy.get('ul.menu_links', { timeout: 20000 }).should('contain', 'Sign Out');
  });
};

const signOut = () => {
  cy.contains('ul.menu_links a', 'Sign Out').click({ force: true });
  cy.get('ul.menu_links', { timeout: 20000 }).should('not.exist');
};

// Like opening a new browser: no cookies or storage from earlier steps.
const freshBrowser = () => {
  cy.clearAllCookies();
  cy.clearAllLocalStorage();
  cy.clearAllSessionStorage();
};

// A member's cart is saved on the server, so leftovers from earlier runs stay
// in it. Delete every item until the cart is empty.
const emptyCart = () => {
  openCart();
  // Give the server cart time to load before deciding it is empty.
  cy.wait(3000);
  cartDrawer().then(($drawer) => {
    const deleteButtons = $drawer.find('figure.cart_drop_item:not(.no_cart_items) a.cart2_delete');
    if (!deleteButtons.length) return;

    cy.wrap(deleteButtons.first()).click();
    deletePopover().contains('a', 'Yes, Delete Item').click();
    emptyCart();
  });
};

describe('Cart', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);

    // Third-party scripts (analytics, payment widgets) occasionally throw;
    // don't let those fail the test.
    cy.on('uncaught:exception', () => false);
  });

  describe('Guest', () => {
    describe('Empty cart', () => {
      it('shows the empty-cart message for a new visitor', () => {
        cy.visit(BASE_URL);
        cartCount().should('have.text', '0');

        openCart();
        expectEmptyCart();
      });
    });

    describe('Add to cart', () => {
      it('adds one product and updates the cart count', () => {
        cy.visit(BASE_URL);
        cartCount().should('have.text', '0');

        addToCart(ART_PAPER);

        expectCartCount(1);
        cartDrawer().find('.cart_drop_toast').should('contain', 'Item added to Cart');
        cartItem(ART_PAPER).within(() => {
          cy.contains('Quantity : ').should('be.visible');
          cy.get('.cart_drop_price').invoke('text').should('match', /S\$\d/);
        });
        expectSubtotalMatchesItems();
      });

      it('adds several products and the count goes up with each one', () => {
        cy.visit(BASE_URL);

        addToCart(ART_PAPER);
        expectCartCount(1);

        addToCart(CLASSIC_PAPER);
        expectCartCount(2);

        addToCart(KRAFT_PAPER);
        expectCartCount(3);

        [ART_PAPER, CLASSIC_PAPER, KRAFT_PAPER].forEach((product) => cartItem(product).should('exist'));
        expectSubtotalMatchesItems();
      });

      it('keeps the cart after a page reload', () => {
        addToCart(ART_PAPER);
        addToCart(CLASSIC_PAPER);

        cy.reload();
        cartCount().should('have.text', '2');
        openCart();
        expectCartCount(2);
      });
    });

    describe('Edit quantity', () => {
      it('changes the quantity of an item and updates the price', () => {
        addToCart(ART_PAPER);

        // 'static' stores the value now; a normal alias would re-read the new price later.
        cartItem(ART_PAPER).find('.cart_drop_price').invoke('text').as('oldPrice', { type: 'static' });

        // Pick a different quantity from the Edit list.
        cartItem(ART_PAPER).contains('.dropdown_quantity button', 'Edit').click();
        cartItem(ART_PAPER)
          .find('.app-dropdown-item:not(.app-dropdown-item--active) .app-dropdown__button')
          .first()
          .invoke('text')
          .then((text) => text.trim())
          .as('newQuantity', { type: 'static' });

        cy.get('@newQuantity').then((newQuantity) => {
          cartItem(ART_PAPER).contains('.app-dropdown__button', new RegExp(`^\\s*${newQuantity}\\s*$`)).click();

          cartItem(ART_PAPER).find('.dropdown_quantity p', { timeout: 20000 })
            .should('have.text', `Quantity : ${newQuantity}`);
        });

        cy.get('@oldPrice').then((oldPrice) => {
          cartItem(ART_PAPER).find('.cart_drop_price', { timeout: 20000 })
            .invoke('text')
            .should('not.eq', oldPrice);
        });

        // Still one item - editing does not add a new line.
        expectCartCount(1);
        expectSubtotalMatchesItems();
      });
    });

    describe('Delete item', () => {
      it('"No, Keep Item" keeps the item in the cart', () => {
        addToCart(ART_PAPER);

        clickDelete(ART_PAPER);
        deletePopover().within(() => {
          cy.contains('Confirmation').should('be.visible');
          cy.contains('Are you sure you want to delete this item in your cart?').should('be.visible');
          cy.contains('a', 'No, Keep Item').click();
        });

        cartDrawer().find('.custom_popover').should('not.be.visible');
        cartItem(ART_PAPER).should('exist');
        expectCartCount(1);
      });

      it('"Yes, Delete Item" removes the item and shows the empty cart', () => {
        addToCart(ART_PAPER);

        clickDelete(ART_PAPER);
        deletePopover().contains('a', 'Yes, Delete Item').click();

        expectEmptyCart();

        // Still empty after a reload.
        cy.reload();
        openCart();
        expectEmptyCart();
      });

      it('deletes only the chosen item when there are several', () => {
        cy.visit(BASE_URL);
        addToCart(ART_PAPER);
        addToCart(CLASSIC_PAPER);
        expectCartCount(2);

        clickDelete(ART_PAPER);
        deletePopover().contains('a', 'Yes, Delete Item').click();

        expectCartCount(1);
        cartDrawer().contains('.cart_drop_item .h5_heading', ART_PAPER.name).should('not.exist');
        cartItem(CLASSIC_PAPER).should('exist');
        expectSubtotalMatchesItems();
      });
    });
  });

  // Needs a registered email/password account in cypress.env.json
  // ({ "SP_EMAIL": "...", "SP_PASSWORD": "..." }); without it these tests are skipped.
  // Only the behaviour that differs from a guest cart is tested here.
  describe('Logged-in member', () => {
    beforeEach(function () {
      cy.env(['SP_EMAIL', 'SP_PASSWORD']).then(({ SP_EMAIL, SP_PASSWORD }) => {
        if (!SP_EMAIL || !SP_PASSWORD) this.skip();
      });

      loginViaUi();
      emptyCart();
      expectEmptyCart();
    });

    after(() => {
      // Leave the account's cart empty for the next run.
      cy.env(['SP_EMAIL', 'SP_PASSWORD']).then(({ SP_EMAIL, SP_PASSWORD }) => {
        if (!SP_EMAIL || !SP_PASSWORD) return;
        cy.viewport(1440, 900);
        cy.on('uncaught:exception', () => false);

        // Reuse the session if the last test left the member logged in.
        cy.visit(BASE_URL);
        cy.get('body').then(($body) => {
          if (!$body.find('ul.menu_links').length) loginViaUi();
        });
        emptyCart();
      });
    });

    it('adds, edits and deletes an item', () => {
      addToCart(ART_PAPER);
      expectCartCount(1);
      expectSubtotalMatchesItems();

      cartItem(ART_PAPER).contains('.dropdown_quantity button', 'Edit').click();
      cartItem(ART_PAPER).contains('.app-dropdown__button', /^\s*200\s*$/).click();
      cartItem(ART_PAPER).find('.dropdown_quantity p', { timeout: 20000 })
        .should('have.text', 'Quantity : 200');
      expectSubtotalMatchesItems();

      deleteItem(ART_PAPER);
      expectEmptyCart();
    });

    it('saves the cart to the account (kept after signing out and logging in on a new browser)', () => {
      addToCart(ART_PAPER);
      addToCart(CLASSIC_PAPER);
      expectCartCount(2);

      signOut();
      freshBrowser();
      loginViaUi();

      openCart();
      expectCartCount(2);
      cartItem(ART_PAPER).should('exist');
      cartItem(CLASSIC_PAPER).should('exist');
    });

    it('hides the member cart after signing out', () => {
      addToCart(ART_PAPER);
      expectCartCount(1);

      signOut();

      // No reload here: after visiting a product page, a reload logs the member
      // back in (sign-out bug, see the KNOWN BUG test in auth/SignOut.cy.js).
      cartCount().should('have.text', '0');
      openCart();
      expectEmptyCart();
    });

    it('merges a guest cart into the account cart on login', () => {
      // Member already has Art Paper saved in the account.
      addToCart(ART_PAPER);
      signOut();

      // A guest adds Classic Paper, then logs in.
      freshBrowser();
      cy.visit(BASE_URL);
      addToCart(CLASSIC_PAPER);
      expectCartCount(1);

      loginViaUi();

      // Both items are in the cart, nothing duplicated or lost.
      openCart();
      expectCartCount(2);
      cartItem(ART_PAPER).should('exist');
      cartItem(CLASSIC_PAPER).should('exist');
      expectSubtotalMatchesItems();

      cy.reload();
      cartCount().should('have.text', '2');
    });
  });
});
