// Add to cart & cart item behaviour (guest): add one item, change its quantity, open the
// cart page, then upload artwork with a special instruction. Site: BASE_URL in cypress/support/config.js
// Run: npx cypress open
//      npx cypress run --spec cypress/e2e/cart/guest-add-to-cart.cy.js
// Not headless Chrome: the site's bot check rejects Add to Cart ("Robot detected!").
// Use the default Electron run, `cypress open`, or --browser chrome --headed.
//
// One it() per step. testIsolation: false keeps the same browser state (cart) across
// steps; if a step fails, the remaining steps are skipped. No order is placed, but the
// artwork file is uploaded to the dev site's storage.

import { BASE_URL } from '../../support/config';

const PRODUCT = { name: 'Art Paper Stickers', path: '/stickers/paper/art' };
const NEW_QUANTITY = '200';
const ARTWORK = { fixture: 'cypress/fixtures/artwork/sticker-artwork.png', fileName: 'sticker-artwork.png' };
// Kept short: the cart page truncates long instructions with "...".
const INSTRUCTION = 'FOR TESTING PURPOSES ONLY';

const cartDrawer = () => cy.get('.cart_dropdown.active', { timeout: 30000 });
const drawerItem = () => cartDrawer().find('figure.cart_drop_item:not(.no_cart_items)');
const cartPageItem = () => cy.contains('.cart_table_list', PRODUCT.name, { timeout: 30000 });
// The page has a second, hidden upload modal; always work inside the open one.
const uploadModal = () => cy.get('.up_artwork_modal.active', { timeout: 20000 });

describe('Add to cart & cart item behaviour', { testIsolation: false }, () => {
  let stepFailed = false;
  let originalPrice;

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

  it('adds 1 item to the cart', () => {
    cy.visit(BASE_URL + PRODUCT.path);
    cy.get('h1.quote_title').should('contain', PRODUCT.name);
    // The page is server-rendered: buttons do nothing until the Nuxt app has mounted.
    cy.window().should((win) => {
      expect(win.$nuxt && win.$nuxt._isMounted, 'Nuxt app mounted').to.equal(true);
    });

    // Add to Cart stays disabled until the price has loaded.
    cy.contains('.quote_footer_price h2', /S\$\d/, { timeout: 30000 });
    cy.contains('.quote_footer_btns button.btn_default', 'Add to Cart').should('be.enabled').click();

    // "Upload Artwork" modal after adding: skip it — the artwork is uploaded from the cart page later.
    // force: the link renders with display:contents, which Cypress treats as hidden.
    uploadModal().should('be.visible').contains('a.high_text', 'Skip').click({ force: true });

    cy.get('#view_cart_item .cart_number').should('have.text', '1');
    drawerItem().should('have.length', 1).and('contain', PRODUCT.name);
    drawerItem()
      .find('.cart_drop_price')
      .invoke('text')
      .should('match', /S\$\d/)
      .then((price) => {
        originalPrice = price.trim();
      });
  });

  it(`updates the quantity to ${NEW_QUANTITY} in the cart`, () => {
    drawerItem().find('.dropdown_quantity').contains('button.button_link', 'Edit').click();
    drawerItem()
      .find('.app-dropdown-list')
      .contains('button.app-dropdown__button', new RegExp(`^\\s*${NEW_QUANTITY}\\s*$`))
      .click();

    drawerItem().find('.dropdown_quantity p').should('have.text', `Quantity : ${NEW_QUANTITY}`);
    drawerItem()
      .find('.cart_drop_price')
      .invoke('text')
      .should((price) => {
        expect(price.trim(), 'price after the quantity change').to.match(/S\$\d/).and.not.equal(originalPrice);
      });
  });

  it('proceeds to the cart page', () => {
    cartDrawer().find('.cart_drop_buttons').contains('button', 'View Cart (1)').click();
    // Guests are offered a sign-in first.
    cy.contains('a.nonm_link', 'Continue as guest', { timeout: 20000 }).click();

    cy.location('pathname', { timeout: 30000 }).should('eq', '/cart');
    cartPageItem().should('contain', `Quantity : ${NEW_QUANTITY}`);
  });

  it('opens the Upload Artwork window', () => {
    cartPageItem().contains('button.up_artwork', 'Upload Artwork').click();
    uploadModal().should('be.visible');
    uploadModal().find('label.button-upload-full').should('contain', 'Drag and drop');
  });

  it('selects an artwork file', () => {
    uploadModal().find('input[type="file"]').selectFile(ARTWORK.fixture, { force: true });
    uploadModal().should('contain', ARTWORK.fileName);
  });

  it('adds a special instruction', () => {
    uploadModal().find('textarea').clear().type(INSTRUCTION).should('have.value', INSTRUCTION);
  });

  it('clicks "Upload Artwork" and the artwork is attached to the cart item', () => {
    cy.intercept('POST', '**/cart/create/artwork').as('uploadArtwork');

    uploadModal().contains('button.continue', 'Upload Artwork').click();

    cy.wait('@uploadArtwork', { timeout: 60000 }).its('response.body.status').should('eq', 'SUCCESS');
    cy.get('.up_artwork_modal.active').should('not.exist');

    cartPageItem().within(() => {
      cy.get('figure.cart_image.fileUpload img').should(($img) => {
        expect($img[0].naturalWidth, 'uploaded artwork thumbnail loaded').to.be.greaterThan(0);
      });
      cy.get('.cart_drop_attach').should('contain', ARTWORK.fileName);
      cy.get('.text_edit').should('contain', INSTRUCTION);
    });
  });
});
