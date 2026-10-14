// Forgot password flow - validation errors + sending reset instructions. Site: BASE_URL in cypress/support/config.js
// Run: npx cypress run --spec cypress/e2e/auth/ForgotPassword.cy.js
//
// The "sends reset instructions" tests need a registered email/password account in
// cypress.env.json ({ "SP_EMAIL": "...", "SP_PASSWORD": "..." }); without it they are
// skipped. Each run emails reset instructions to that account.
// Following the emailed reset link is not automated (it needs inbox access).

import { BASE_URL } from '../../support/config';

// Registered through Google login - has no site password.
const GOOGLE_EMAIL = 'trainee84.glophics@gmail.com';
const UNREGISTERED_EMAIL = 'trainee84.glophics+not-registered@gmail.com';

const MESSAGES = {
  emailRequired: 'Email address is required. Please try again.',
  emailInvalid: 'Please enter a valid email.',
  notRegistered: 'This email address has not been registered.',
  googleAccount: 'This email address is logged in with a Google account.',
  sent: 'Recovery instructions has been sent to your email.',
  resent: 'Email successfully sent.',
};

const forgotModal = () => cy.contains('.g-modal-header h3', 'Forgot Password').closest('.g-modal');

const emailField = () =>
  forgotModal().contains('.g-input label', 'Email Address').closest('.g-input');

const sendResetInstructions = (email) => {
  if (email) emailField().find('input').clear().type(email);
  forgotModal().contains('button[type="submit"]', 'Send me reset instructions').click();
};

const expectEmailError = (message) =>
  emailField()
    .should('have.class', 'g-input--error')
    .find('.g-input-error-message', { timeout: 20000 })
    .should('have.text', message);

describe('Forgot password', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);

    // Third-party scripts (analytics, payment widgets) occasionally throw;
    // don't let those fail the test.
    cy.on('uncaught:exception', () => false);

    // Login modal -> "Forgot Password?"
    cy.visit(BASE_URL);
    cy.get('a.icon_myaccount[aria-label="My Account"]').click({ force: true });
    cy.contains('.dropdown-item button', 'Sign in to Account').click({ force: true });
    cy.get('form.login_form').should('be.visible');
    cy.contains('form.login_form a', 'Forgot Password?').click();

    forgotModal()
      .should('be.visible')
      .and('contain', 'Please enter your email address and we will email you link to reset your password');
  });

  describe('Validation errors', () => {
    it('requires an email', () => {
      sendResetInstructions();

      expectEmailError(MESSAGES.emailRequired);
    });

    ['not-an-email', 'qa@', 'qa@domain', '@gmail.com'].forEach((badEmail) => {
      it(`rejects an invalid email: "${badEmail}"`, () => {
        sendResetInstructions(badEmail);

        expectEmailError(MESSAGES.emailInvalid);
      });
    });

    it('rejects an email that is not registered', () => {
      sendResetInstructions(UNREGISTERED_EMAIL);

      expectEmailError(MESSAGES.notRegistered);
      cy.contains('h2', 'Check your email').should('not.exist');
    });

    it('rejects an email registered through Google login', () => {
      sendResetInstructions(GOOGLE_EMAIL);

      expectEmailError(MESSAGES.googleAccount);
      cy.contains('h2', 'Check your email').should('not.exist');
    });
  });

  describe('Navigation', () => {
    it('"Go Back" returns to the login form', () => {
      forgotModal().contains('a', 'Go Back').click();

      cy.get('form.login_form').should('be.visible');
      cy.contains('.g-modal-header h3', 'Forgot Password').should('not.exist');
    });
  });

  describe('Sending reset instructions', () => {
    it('sends reset instructions to a registered email, then closes with "Done"', function () {
      cy.env(['SP_EMAIL']).then(({ SP_EMAIL }) => {
        if (!SP_EMAIL) this.skip();

        sendResetInstructions(SP_EMAIL);

        cy.get('.check_email_section', { timeout: 20000 }).within(() => {
          cy.contains('h2', 'Check your email').should('be.visible');
          cy.contains('p', MESSAGES.sent).should('be.visible');
          cy.contains('resend email instructions').should('be.visible');
          cy.contains('button', 'Done').click();
        });

        cy.get('.check_email_section').should('not.exist');
        cy.get('form.login_form').should('not.exist');
      });
    });

    it('resends the reset instructions', function () {
      cy.env(['SP_EMAIL']).then(({ SP_EMAIL }) => {
        if (!SP_EMAIL) this.skip();

        sendResetInstructions(SP_EMAIL);

        cy.get('.check_email_section', { timeout: 20000 }).within(() => {
          cy.contains('a', 'resend email instructions').click();
          cy.get('.success-msg', { timeout: 20000 }).should('have.text', MESSAGES.resent);
          cy.contains('A new email has successfully been sent.').should('be.visible');
        });
      });
    });
  });
});
