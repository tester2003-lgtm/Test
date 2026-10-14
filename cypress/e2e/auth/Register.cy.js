// Register a new account - validation errors + successful sign up. Site: BASE_URL in cypress/support/config.js
// Run: npx cypress open   (recommended - the successful sign-up test needs an emailed code)
//      npx cypress run --spec cypress/e2e/auth/Register.cy.js
//
// Registering sends a 4-digit verification code to the email address. The
// successful sign-up test waits (up to 5 min) in `cypress open` for you to type
// the code and click "Verify Email Address". In headless runs it is skipped.

import { BASE_URL } from '../../support/config';

// Gmail ignores the "+..." part, so every code lands in the trainee84 inbox while
// the site sees a brand new email each run.
const newEmail = () => `trainee84.glophics+reg${Date.now()}@gmail.com`;

// Registered through Google login.
const GOOGLE_EMAIL = 'trainee84.glophics@gmail.com';

const VALID = {
  firstName: 'QA',
  lastName: 'Automation',
  password: 'Test1234!',
};

const MESSAGES = {
  firstNameRequired: 'First name is required. Please try again.',
  lastNameRequired: 'Last name is required. Please try again.',
  emailRequired: 'Email address is required. Please try again.',
  emailInvalid: 'Please enter a valid email.',
  passwordRequired: 'Password is required. Please try again.',
  passwordTooShort: 'The Password must be 6 or more characters.',
  wrongCode: 'Please enter the verification code sent to your email.',
};

const field = (label) =>
  cy.contains('form.register_form .g-input label', label).closest('.g-input');

const fillForm = ({ firstName, lastName, email, password }) => {
  if (firstName) field('First Name').find('input').clear().type(firstName);
  if (lastName) field('Last Name').find('input').clear().type(lastName);
  if (email) field('Email Address').find('input').clear().type(email);
  if (password) field('Password').find('input').clear().type(password, { log: false });
};

const submit = () => cy.contains('form.register_form button[type="submit"]', 'Register').click();

const expectError = (label, message) =>
  field(label)
    .should('have.class', 'g-input--error')
    .find('.g-input-error-message')
    .should('have.text', message);

const expectNoError = (label) => field(label).should('not.have.class', 'g-input--error');

describe('Register a new account', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);

    // Third-party scripts (analytics, payment widgets) occasionally throw;
    // don't let those fail the test.
    cy.on('uncaught:exception', () => false);

    // Open the registration form from the My Account menu.
    cy.visit(BASE_URL);
    cy.get('a.icon_myaccount[aria-label="My Account"]').click({ force: true });
    cy.contains('.dropdown-item button', 'Register').click({ force: true });
    cy.get('form.register_form').should('be.visible');
    cy.contains('h2', 'New Member Registration').should('be.visible');
  });

  describe('Validation errors', () => {
    it('shows required errors when the form is empty', () => {
      submit();

      expectError('First Name', MESSAGES.firstNameRequired);
      expectError('Last Name', MESSAGES.lastNameRequired);
      expectError('Email Address', MESSAGES.emailRequired);
      expectError('Password', MESSAGES.passwordRequired);
    });

    it('shows a required error only for the missing field', () => {
      fillForm({ ...VALID, email: newEmail(), firstName: null });
      submit();

      expectError('First Name', MESSAGES.firstNameRequired);
      expectNoError('Last Name');
      expectNoError('Email Address');
      expectNoError('Password');
    });

    ['not-an-email', 'qa@', 'qa@domain', '@gmail.com', 'qa automation@gmail.com'].forEach((badEmail) => {
      it(`rejects an invalid email: "${badEmail}"`, () => {
        fillForm({ ...VALID, email: badEmail });
        submit();

        expectError('Email Address', MESSAGES.emailInvalid);
      });
    });

    it('rejects a password shorter than 6 characters', () => {
      fillForm({ ...VALID, email: newEmail(), password: '12345' });
      submit();

      expectError('Password', MESSAGES.passwordTooShort);
    });

    it('accepts a password of exactly 6 characters', () => {
      fillForm({ ...VALID, email: newEmail(), password: '123456' });
      submit();

      // Passing validation moves on to email verification.
      cy.get('.verification_form', { timeout: 20000 }).should('be.visible');
    });

    it('blocks an email that is registered through Google login', () => {
      fillForm({ ...VALID, email: GOOGLE_EMAIL });
      submit();

      cy.contains('.g-modal-header h3', 'Email already registered', { timeout: 20000 }).should('be.visible');
      cy.get('.email_registered_info')
        .should('contain', GOOGLE_EMAIL)
        .and('contain', 'registered in our system through social media login');
      cy.contains('button.google_bt', 'Login with Google').should('be.visible');

      // "Go Back" returns to the registration form.
      cy.contains('a.verif_go_back', 'Go Back').click();
      cy.get('form.register_form').should('be.visible');
    });

    it('rejects a wrong verification code', () => {
      const email = newEmail();
      fillForm({ ...VALID, email });
      submit();

      cy.get('.verification_form', { timeout: 20000 }).should('be.visible');
      cy.get('.verification_info').should('contain', email);

      cy.get('.verification_form input').type('0000');
      cy.contains('.verification_form button', 'Verify Email Address').click();

      cy.get('.verification_form .error_message', { timeout: 20000 }).should('have.text', MESSAGES.wrongCode);
      cy.get('.verification_form .code_fiield').should('have.class', 'error_field');
    });
  });

  describe('Successful registration', () => {
    it('registers a new account after verifying the email', function () {
      if (!Cypress.config('isInteractive')) {
        cy.log('Skipped in headless runs - needs the emailed verification code. Use `npx cypress open`.');
        this.skip();
      }

      const email = newEmail();
      fillForm({ ...VALID, email });

      // Optional marketing opt-in
      cy.get('form.register_form button.g-checkbox').click();

      submit();

      cy.get('.verification_form', { timeout: 20000 }).should('be.visible');
      cy.get('.verification_info').should('contain', email);

      cy.log(`**Type the code sent to ${email} and click "Verify Email Address"**`);
      cy.get('.verification_form', { timeout: 5 * 60 * 1000 }).should('not.exist');

    });
  });
});
