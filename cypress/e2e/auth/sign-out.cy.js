// Sign out - via the header My Account menu and via the footer. Site: BASE_URL in cypress/support/config.js
// Run: npx cypress run --spec cypress/e2e/auth/sign-out.cy.js
//
// Needs a registered email/password account in cypress.env.json
// ({ "SP_EMAIL": "...", "SP_PASSWORD": "..." }); without it every test is skipped.

import { BASE_URL } from '../../support/config';

const PROFILE_PATH = '/mypage/profile';

// Log in through the UI. (cy.login() caches the session with cy.session, which
// would restore a token these tests have just signed out.)
const loginViaUi = (email, password) => {
  cy.visit(BASE_URL);
  cy.get('a.icon_myaccount[aria-label="My Account"]').click({ force: true });
  cy.contains('.dropdown-item button', 'Sign in to Account').click({ force: true });
  cy.get('form.login_form input[type="text"]').type(email);
  cy.get('form.login_form input[type="password"]').type(password, { log: false });
  cy.contains('form.login_form button[type="submit"]', 'Sign In').click();
  expectLoggedIn();
};

// The two ways to sign out.
// The header menu opens on hover, which Cypress can't trigger, so the click is forced.
const signOutViaHeader = () => cy.contains('ul.menu_links a', 'Sign Out').click({ force: true });
const signOutViaFooter = () => cy.contains('.sitemap_left a', 'Sign Out').scrollIntoView().click();

const footerMyAccount = () => cy.contains('.sitemap_left h3', 'My Account').next('.product_links');

const expectLoggedIn = () => {
  cy.get('ul.menu_links', { timeout: 20000 })
    .should('contain', 'Profile')
    .and('contain', 'My Orders')
    .and('contain', 'Sign Out');
  footerMyAccount().should('contain', 'Sign Out').and('not.contain', 'Sign In');
};

const expectLoggedOut = () => {
  // Header: member menu is gone, the account icon offers Sign in / Register again.
  cy.get('ul.menu_links', { timeout: 20000 }).should('not.exist');
  cy.get('a.icon_myaccount[aria-label="My Account"]').click({ force: true });
  cy.contains('.dropdown-item button', 'Sign in to Account').should('exist');
  cy.contains('.dropdown-item button', 'Register').should('exist');

  // Footer: My Account shows Sign In / Register instead of the member links.
  footerMyAccount()
    .should('contain', 'Sign In')
    .and('contain', 'Register')
    .and('not.contain', 'Sign Out')
    .and('not.contain', 'My Orders');
};

describe('Sign out', () => {
  beforeEach(function () {
    cy.viewport(1440, 900);

    // Third-party scripts (analytics, payment widgets) occasionally throw;
    // don't let those fail the test.
    cy.on('uncaught:exception', () => false);

    cy.env(['SP_EMAIL', 'SP_PASSWORD']).then(({ SP_EMAIL, SP_PASSWORD }) => {
      if (!SP_EMAIL || !SP_PASSWORD) this.skip();
      cy.wrap(SP_EMAIL).as('email');
      loginViaUi(SP_EMAIL, SP_PASSWORD);
    });
  });

  [
    { via: 'the header My Account menu', signOut: signOutViaHeader },
    { via: 'the footer', signOut: signOutViaFooter },
  ].forEach(({ via, signOut }) => {
    describe(`via ${via}`, () => {
      it('signs out and stays signed out after a reload', () => {
        signOut();
        expectLoggedOut();

        cy.reload();
        expectLoggedOut();
      });

      it('signs out from a My Account page', () => {
        cy.visit(BASE_URL + PROFILE_PATH);
        expectLoggedIn();

        signOut();
        expectLoggedOut();
      });

      it('can sign back in after signing out', () => {
        signOut();
        expectLoggedOut();

        cy.env(['SP_EMAIL', 'SP_PASSWORD']).then(({ SP_EMAIL, SP_PASSWORD }) => {
          loginViaUi(SP_EMAIL, SP_PASSWORD);
        });
      });
    });
  });

  // KNOWN BUG (dev, Oct 2026): after signing out on /mypage/profile the page stays
  // open and still shows the member's name and email. Expected to fail until fixed.
  it('hides personal details after signing out on the Profile page', function () {
    cy.visit(BASE_URL + PROFILE_PATH);
    cy.contains('Personal Details').should('be.visible');
    cy.contains(this.email).should('be.visible');

    signOutViaFooter();
    expectLoggedOut();

    cy.contains('Personal Details').should('not.exist');
    cy.contains(this.email).should('not.exist');
  });

  // KNOWN BUG (dev, Oct 2026): if a product page was opened after logging in,
  // Sign Out looks fine but the next reload logs the member back in (the
  // auth_client__token.local cookie is not cleared). Expected to fail until fixed.
  it('stays signed out after a reload when a product page was visited', () => {
    cy.visit(BASE_URL + '/stickers/paper/art');
    cy.get('h1.quote_title').should('be.visible');
    expectLoggedIn();

    signOutViaHeader();
    expectLoggedOut();

    cy.reload();
    expectLoggedOut();
  });
});
