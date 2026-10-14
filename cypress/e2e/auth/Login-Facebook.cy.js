// Login via Facebook OAuth. Site: BASE_URL in cypress/support/config.js
//
// Assumptions (fill in if wrong):
//   • The "Login with Facebook" button is inside the login modal at
//     fieldset.social_buttons > button.fb_btn.
//   • Clicking it calls window.open('/login/facebook?app_id=<id>'), which the
//     site's backend server-side-redirects to facebook.com/dialog/oauth.
//   • After Facebook returns, the site sets a session cookie and shows ul.menu_links.
//   • The programmatic backend auth endpoint is POST /login/facebook/callback
//     (update FB_AUTH_CALLBACK_PATH in commands.js if this is wrong).
//
// ── Running ───────────────────────────────────────────────────────────────────
//
//  UI + popup tests (Electron, always):
//    npx cypress run --spec cypress/e2e/auth/Login-Facebook.cy.js
//
//  Full OAuth + programmatic tests (Chrome headed, requires credentials):
//    npx cypress run --spec cypress/e2e/auth/Login-Facebook.cy.js \
//      --browser chrome --headed
//
// ── Credentials ───────────────────────────────────────────────────────────────
//
//  Add to cypress.env.json (never commit this file):
//    "FB_APP_ID":          "<15-digit Meta app ID>",
//    "FB_APP_SECRET":      "<app secret from Meta App Dashboard → Settings → Basic>",
//    "FB_TEST_USER_TOKEN": "<optional — pre-generated access token for a test user>"
//
//  To create a test user:
//    Meta App Dashboard → App Roles → Test Users → Create test users.
//    Click "Edit" on the new user to obtain a pre-generated access token.
//    Paste it as FB_TEST_USER_TOKEN to skip the Graph API call.
//
// ── How cy.loginByFacebook() works ────────────────────────────────────────────
//  Defined in cypress/support/commands.js. It:
//    1. Uses FB_TEST_USER_TOKEN if set, otherwise calls the Graph API for one.
//    2. POSTs the token to the site's auth callback endpoint to create a session.
//    3. Wraps everything in cy.session() so the auth runs only once per run.

import { BASE_URL } from '../../support/config';

// ── Selectors (confirmed from DOM) ────────────────────────────────────────────
// Suggestion: add data-cy="btn-facebook-login" to this button for a stable selector.
const facebookSignInBtn = () => cy.get('button.fb_btn');

// ── Helpers ───────────────────────────────────────────────────────────────────

const openLoginModal = () => {
  cy.visit(BASE_URL);
  cy.get('a.icon_myaccount[aria-label="My Account"]').click({ force: true });
  cy.contains('.dropdown-item button', 'Sign in to Account').click({ force: true });
  cy.get('form.login_form').should('be.visible');
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Login - Facebook', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    // Third-party scripts (analytics, payment widgets) occasionally throw;
    // don't let those fail the test.
    cy.on('uncaught:exception', () => false);
  });

  // ─── UI (run in any browser, no credentials needed) ──────────────────────

  it('shows the "Login with Facebook" button on the login modal', () => {
    openLoginModal();
    facebookSignInBtn().should('be.visible').and('contain', 'Login with Facebook');
  });

  it('clicking "Login with Facebook" opens a Facebook OAuth popup', () => {
    openLoginModal();

    // The button calls window.open('/login/facebook?app_id=...');
    // Spy on it so we can verify the URL without actually opening a popup.
    let capturedUrl = '';
    cy.window().then((win) => {
      cy.stub(win, 'open').callsFake((url) => {
        capturedUrl = String(url);
      });
    });

    facebookSignInBtn().click();

    // Retries until window.open was called with the site's Facebook OAuth path.
    cy.wrap(null).should(() => {
      expect(capturedUrl, 'OAuth popup URL').to.match(/\/login\/facebook\?app_id=/);
    });
  });

  // ─── Full OAuth flow (Chrome headed, Facebook blocks Electron) ────────────

  it('redirects to facebook.com when the popup is followed', function () {
    // Facebook blocks headless / Electron browsers — skip to avoid a hanging test.
    if (Cypress.browser.name === 'electron') this.skip();

    openLoginModal();

    // Force the popup to navigate in the main window so cy.origin() can take over.
    cy.window().then((win) => {
      cy.stub(win, 'open').callsFake((url) => {
        win.location.href = url; // /login/facebook?... → server redirects to facebook.com
      });
    });

    facebookSignInBtn().click();

    // The site's backend redirects to facebook.com/dialog/oauth.
    cy.origin('https://www.facebook.com', () => {
      cy.url().should('include', 'facebook.com');
    });
  });

  // ─── Programmatic login (uses cy.loginByFacebook() custom command) ────────
  //
  // These tests skip automatically when FB credentials are absent.
  // They exercise behaviour that is only meaningful for a logged-in Facebook user:
  // • session persists after a reload
  // • sign-out works
  //
  // The custom command (commands.js) handles the Graph API call + session setup.

  // ─── Programmatic login (requires FB App credentials) ────────────────────
  //
  // These three tests verify post-login state via cy.loginByFacebook() (commands.js).
  // They are PENDING until FB_APP_ID + FB_APP_SECRET (or FB_TEST_USER_TOKEN)
  // are added to cypress.env.json.
  //
  // HOW TO UNBLOCK:
  //   Option A — ask the dev team for the Meta App credentials (fastest).
  //   Option B — create a Meta Developer account, link to the site's app,
  //              and create a test user under App Roles → Test Users.
  //
  // NOTE: The post-login behaviour (Profile, My Orders, cart, sign-out) is
  // identical for Facebook and email/password members, so it is already
  // thoroughly covered by Login-member.cy.js, Cart.cy.js and SignOut.cy.js.
  // These tests exist to confirm the Facebook auth path specifically.

  describe('Programmatic login via test user', () => {
    beforeEach(function () {
      cy.env(['FB_APP_ID']).then(({ FB_APP_ID }) => {
        if (!FB_APP_ID) this.skip();
      });

      // cy.loginByFacebook() uses cy.session() — the auth dance runs only once
      // per Cypress run; subsequent tests reuse the cached session.
      cy.loginByFacebook();
      cy.visit(BASE_URL);
    });

    it('logs in as a Facebook user and the site recognises the member', () => {
      expectLoggedIn();
    });

    it('stays logged in after a page reload', () => {
      expectLoggedIn();
      cy.reload();
      expectLoggedIn();
    });

    it('can sign out after a Facebook login', () => {
      expectLoggedIn();

      cy.contains('ul.menu_links a', 'Sign Out').click({ force: true });
      cy.get('ul.menu_links', { timeout: 20000 }).should('not.exist');
      expectLoggedOut();
    });
  });
});
