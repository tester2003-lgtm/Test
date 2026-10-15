// Login via Google. Site: BASE_URL in cypress/support/config.js
// Run: npx cypress run --spec cypress/e2e/auth/login-google.cy.js   (any browser, Electron included)
//
// How the site's Google login works (from its Nuxt auth config):
//   - "Login with Google" (button.google_bt) opens a POPUP via window.open('/login/google?app_id=…').
//   - That page redirects to https://accounts.google.com/o/oauth2/auth (implicit flow:
//     response_type "token id_token", scope openid/profile/email, redirect_uri BASE_URL + '/').
//   - Google returns to the site with the token in the URL hash; the site reads the Google profile
//     and calls its API POST /user/social/google/signIn, which returns the site's own login token.
//
// What is automated:
//   - Button and popup wiring, and the OAuth request the site sends to Google. The navigation to
//     Google is intercepted and bounced back to the site, so Google's page is never loaded
//     (Google blocks automated browsers).
//   - Logged-in behaviour, via cy.loginByGoogle() (commands.js), which replays the site's
//     post-Google steps with a refresh token. Skipped until the Google credentials are in
//     cypress.env.json (see cypress.env.example.json).
// Typing a password into accounts.google.com is NOT automated — Google flags automated browsers
// ("This browser or app may not be secure"), so that part stays on the manual checklist below.
//
// MANUAL TEST CHECKLIST (before a release or after auth changes):
//   [ ] Click "Login with Google" — the Google popup opens with the account chooser
//   [ ] Sign in with the test Google account
//   [ ] Popup closes; the menu shows Profile / My Orders / Sign Out
//   [ ] Reload — still logged in; /mypage/profile shows the right name and email
//   [ ] Sign Out — the menu goes back to Sign In / Register

import { BASE_URL } from '../../support/config';

const googleSignInBtn = () => cy.get('button.google_bt');

const openLoginModal = () => {
  cy.visit(BASE_URL);
  cy.get('a.icon_myaccount[aria-label="My Account"]').click({ force: true });
  cy.contains('.dropdown-item button', 'Sign in to Account').click({ force: true });
  cy.get('form.login_form').should('be.visible');
};

// Click the Google button with window.open stubbed; yields the popup URL the site tried to open.
const clickGoogleAndCapturePopupUrl = () => {
  cy.window().then((win) => {
    cy.stub(win, 'open').as('windowOpen');
  });
  googleSignInBtn().click();
  return cy.get('@windowOpen').should('have.been.calledOnce').then((stub) => String(stub.firstCall.args[0]));
};

const expectLoggedIn = () => {
  cy.get('ul.menu_links', { timeout: 30000 })
    .should('contain', 'Profile')
    .and('contain', 'My Orders')
    .and('contain', 'Sign Out');
};

const expectLoggedOut = () => {
  cy.get('ul.menu_links').should('not.exist');
  cy.get('a.icon_myaccount[aria-label="My Account"]').click({ force: true });
  cy.contains('.dropdown-item button', 'Sign in to Account').should('exist');
};

describe('Login - Google', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.on('uncaught:exception', () => false);
  });

  it('shows the "Login with Google" button on the login modal', () => {
    openLoginModal();
    googleSignInBtn().should('be.visible').and('contain', 'Login with Google');
  });

  it('clicking "Login with Google" opens the /login/google popup', () => {
    openLoginModal();
    clickGoogleAndCapturePopupUrl().should('match', /^\/login\/google\?app_id=\w+/);
  });

  it("redirects to Google's sign-in with the site's OAuth settings", () => {
    openLoginModal();
    clickGoogleAndCapturePopupUrl().then((popupUrl) => {
      // Catch the navigation to Google and send the browser straight back to the site.
      cy.intercept({ hostname: 'accounts.google.com' }, (req) => {
        req.reply({ statusCode: 302, headers: { location: BASE_URL + '/' } });
      }).as('googleAuthorize');

      cy.visit(BASE_URL + popupUrl);
    });

    cy.wait('@googleAuthorize').then(({ request }) => {
      const url = new URL(request.url);
      const params = url.searchParams;

      expect(url.pathname, 'Google OAuth endpoint').to.equal('/o/oauth2/auth');
      expect(params.get('client_id'), 'client_id').to.match(/^[\w-]+\.apps\.googleusercontent\.com$/);
      expect(params.get('redirect_uri'), 'redirect_uri').to.equal(BASE_URL + '/');
      expect(params.get('response_type').split(' '), 'response_type').to.include.members(['token', 'id_token']);
      expect(params.get('scope').split(' '), 'scope').to.include.members(['openid', 'profile', 'email']);
      expect(params.get('state'), 'state (CSRF protection)').to.be.a('string').and.not.be.empty;
    });
  });

  describe('Logged-in session via cy.loginByGoogle()', () => {
    beforeEach(function () {
      cy.env(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']).then((env) => {
        if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) this.skip();
      });
      cy.loginByGoogle();
      cy.visit(BASE_URL);
    });

    it('is logged in as the Google member', () => {
      expectLoggedIn();
    });

    it('stays logged in after a reload', () => {
      expectLoggedIn();
      cy.reload();
      expectLoggedIn();
    });

    it('can sign out', () => {
      expectLoggedIn();
      cy.contains('ul.menu_links a', 'Sign Out').click({ force: true });
      cy.get('ul.menu_links', { timeout: 20000 }).should('not.exist');
      expectLoggedOut();
    });
  });
});
