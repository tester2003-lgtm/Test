// Login with email and password - valid and invalid. Site: BASE_URL in cypress/support/config.js
// Run: npx cypress run --spec cypress/e2e/auth/Login.cy.js
//
// The valid-login tests need an email/password member account. Put it in
// cypress.env.json next to cypress.config.js (keep this file out of git):
//   { "SP_EMAIL": "you@example.com", "SP_PASSWORD": "secret" }
// or set CYPRESS_SP_EMAIL / CYPRESS_SP_PASSWORD. Without them those tests are skipped.

import { BASE_URL } from '../../support/config';

// Registered through Google login - has no site password.
const GOOGLE_EMAIL = 'trainee84.glophics@gmail.com';
const UNREGISTERED_EMAIL = 'trainee84.glophics+not-registered@gmail.com';

const MESSAGES = {
  emailRequired: 'Email address is required. Please try again.',
  emailInvalid: 'Please enter a valid email.',
  passwordRequired: 'Password is required. Please try again.',
  passwordTooShort: 'The password must be at least 6 characters.',
  noMatch: 'Your email address and password do not match.',
};

const field = (label) =>
  cy.contains('form.login_form .g-input label', label).closest('.g-input');

const openLogin = () => {
  cy.get('a.icon_myaccount[aria-label="My Account"]').click({ force: true });
  cy.contains('.dropdown-item button', 'Sign in to Account').click({ force: true });
  cy.get('form.login_form').should('be.visible');
  cy.contains('h3', 'Sign In to your account').should('be.visible');
};

const login = (email, password) => {
  if (email) field('Email Address').find('input').clear().type(email);
  if (password) field('Password').find('input').clear().type(password, { log: false });
  cy.contains('form.login_form button[type="submit"]', 'Sign In').click();
};

const expectFieldError = (label, message) =>
  field(label)
    .should('have.class', 'g-input--error')
    .find('.g-input-error-message')
    .should('have.text', message);

// Server-side errors appear below the password field.
const expectFormError = (message) =>
  cy.get('form.login_form .error_msg', { timeout: 20000 }).should('have.text', message);

const expectLoggedIn = () => {
  cy.get('form.login_form', { timeout: 20000 }).should('not.exist');
  cy.get('ul.menu_links')
    .should('contain', 'Profile')
    .and('contain', 'My Orders')
    .and('contain', 'Sign Out');
};

const expectLoggedOut = () => {
  cy.get('ul.menu_links').should('not.exist');
  cy.get('a.icon_myaccount').click({ force: true });
  cy.contains('.dropdown-item button', 'Sign in to Account').should('exist');
};

describe('Login with email and password', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);

    // Third-party scripts (analytics, payment widgets) occasionally throw;
    // don't let those fail the test.
    cy.on('uncaught:exception', () => false);

    cy.visit(BASE_URL);
    openLogin();
  });

  describe('Invalid login', () => {
    it('shows required errors when the form is empty', () => {
      login();

      expectFieldError('Email Address', MESSAGES.emailRequired);
      expectFieldError('Password', MESSAGES.passwordRequired);
    });

    it('requires a password', () => {
      login(UNREGISTERED_EMAIL);

      expectFieldError('Password', MESSAGES.passwordRequired);
      field('Email Address').should('not.have.class', 'g-input--error');
    });

    it('requires an email', () => {
      login(null, 'Test1234!');

      expectFieldError('Email Address', MESSAGES.emailRequired);
      field('Password').should('not.have.class', 'g-input--error');
    });

    ['not-an-email', 'qa@', 'qa@domain', '@gmail.com'].forEach((badEmail) => {
      it(`rejects an invalid email: "${badEmail}"`, () => {
        login(badEmail, 'Test1234!');

        expectFieldError('Email Address', MESSAGES.emailInvalid);
      });
    });

    it('rejects a password shorter than 6 characters', () => {
      login(UNREGISTERED_EMAIL, '12345');

      expectFormError(MESSAGES.passwordTooShort);
    });

    it('rejects an email that is not registered', () => {
      login(UNREGISTERED_EMAIL, 'Test1234!');

      expectFormError(MESSAGES.noMatch);
      cy.get('form.login_form').should('be.visible');
    });

    it('rejects a password login for a Google-only account', () => {
      login(GOOGLE_EMAIL, 'Test1234!');

      expectFormError(MESSAGES.noMatch);
    });

    it('rejects a wrong password for a registered account', function () {
      cy.env(['SP_EMAIL']).then(({ SP_EMAIL }) => {
        if (!SP_EMAIL) this.skip();

        login(SP_EMAIL, 'Wrong-Password-123');
        expectFormError(MESSAGES.noMatch);
      });
    });

    it('stays logged out after a failed login', () => {
      login(UNREGISTERED_EMAIL, 'Test1234!');
      expectFormError(MESSAGES.noMatch);

      cy.get('.g-modal-close').first().click({ force: true });
      expectLoggedOut();
    });
  });

  describe('Valid login', () => {
    it('logs in with a registered email and password, then signs out', function () {
      cy.env(['SP_EMAIL', 'SP_PASSWORD']).then(({ SP_EMAIL, SP_PASSWORD }) => {
        if (!SP_EMAIL || !SP_PASSWORD) this.skip();

        login(SP_EMAIL, SP_PASSWORD);
        expectLoggedIn();

        // Still logged in after a reload.
        cy.reload();
        expectLoggedIn();

        cy.contains('ul.menu_links a', 'Sign Out').click({ force: true });
        expectLoggedOut();
      });
    });

    it('accepts the email in upper case', function () {
      cy.env(['SP_EMAIL', 'SP_PASSWORD']).then(({ SP_EMAIL, SP_PASSWORD }) => {
        if (!SP_EMAIL || !SP_PASSWORD) this.skip();

        login(SP_EMAIL.toUpperCase(), SP_PASSWORD);
        expectLoggedIn();
      });
    });
  });
});
