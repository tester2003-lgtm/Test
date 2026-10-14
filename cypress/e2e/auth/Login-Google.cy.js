// Login via Google OAuth. Site: BASE_URL in cypress/support/config.js
//
// ── Running ───────────────────────────────────────────────────────────────────
//
//  UI + popup tests (Electron, always):
//    npx cypress run --spec cypress/e2e/auth/Login-Google.cy.js
//
//  Redirect-to-Google test (Chrome headed only — Google blocks Electron):
//    npx cypress run --spec cypress/e2e/auth/Login-Google.cy.js --browser chrome --headed
//
//  Programmatic login tests (any browser, requires OAuth credentials):
//    Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN to
//    cypress.env.json — see commands.js → cy.loginByGoogle() for setup steps.
//
// ── Strategy ──────────────────────────────────────────────────────────────────
//
//  Google blocks automated browsers, so we do NOT type credentials into
//  accounts.google.com. Instead:
//
//  UI tests   — verify button and popup URL via window.open spy (Electron-safe).
//  Redirect   — stub window.open to navigate in-page; cy.origin checks the URL
//               at accounts.google.com. Stops there — no interaction with Google.
//  Logged-in  — cy.loginByGoogle() exchanges a refresh token for an access token
//               via the Google token API and passes it to the site's backend.
//               Fully programmatic: no browser, no bot detection, any browser.

import { BASE_URL } from '../../support/config';

// --- Selectors ---

// Google sign-in button (class confirmed from DOM: button.google_bt inside fieldset.social_buttons)
const googleSignInBtn = () => cy.get('button.google_bt');

// --- Helpers ---

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

// --- Tests ---

describe('Login - Google', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    // Third-party scripts (analytics, payment widgets) occasionally throw;
    // don't let those fail the test.
    cy.on('uncaught:exception', () => false);
  });

  // ─── UI ───────────────────────────────────────────────────────────────────

  it('shows the "Login with Google" button on the login modal', () => {
    openLoginModal();
    googleSignInBtn().should('be.visible').and('contain', 'Login with Google');
  });

  it('clicking "Login with Google" opens a Google OAuth popup', () => {
    openLoginModal();

    // Spy on window.open so we can verify the OAuth URL without actually navigating.
    // The button calls window.open('/login/google?app_id=...'); we capture that URL.
    let capturedUrl = '';
    cy.window().then((win) => {
      cy.stub(win, 'open').callsFake((url) => {
        capturedUrl = String(url);
        // Do NOT navigate — just capture the URL; we only need to check it.
      });
    });

    googleSignInBtn().click();

    // The site opens its own OAuth endpoint which then server-redirects to Google.
    // Verify window.open was called with the expected OAuth path.
    cy.wrap(null).should(() => {
      expect(capturedUrl, 'OAuth popup URL').to.match(/\/login\/google\?app_id=/);
    });
  });

  it('redirects to accounts.google.com when the popup is followed', function () {
    // Google blocks headless / Electron browsers — skip to avoid a hanging test.
    if (Cypress.browser.name === 'electron') this.skip();

    openLoginModal();

    // Force the popup to navigate in the main window so cy.origin() can take over.
    cy.window().then((win) => {
      cy.stub(win, 'open').callsFake((url) => {
        win.location.href = url; // /login/google?... → server redirects to accounts.google.com
      });
    });

    googleSignInBtn().click();

    // The site's backend redirects to accounts.google.com — just verify the URL.
    // We stop here: Google's bot detection blocks any further interaction.
    cy.origin('https://accounts.google.com', () => {
      cy.url().should('include', 'accounts.google.com');
    });
  });

  // ─── Programmatic login (requires Google OAuth credentials) ─────────────
  //
  // These three tests use cy.loginByGoogle() (commands.js) which exchanges a
  // refresh token for an access token via the Google API — no browser
  // interaction, no bot detection, works in Electron and headless.
  //
  // They are PENDING until the Google OAuth credentials are added to
  // cypress.env.json: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.
  //
  // HOW TO UNBLOCK:
  //   1. Google Cloud Console → APIs & Services → Credentials → create an
  //      OAuth 2.0 Client ID (type: Web application).
  //   2. Add https://developers.google.com/oauthplayground to Authorised
  //      redirect URIs.
  //   3. Go to https://developers.google.com/oauthplayground → ⚙ → check
  //      "Use your own OAuth credentials" → enter Client ID and Secret.
  //   4. Authorise scopes: openid, email, profile → sign in as
  //      trainee84.glophics@gmail.com → exchange code for tokens.
  //   5. Copy the Refresh token → paste as GOOGLE_REFRESH_TOKEN in cypress.env.json.
  //   See the full walkthrough in commands.js above cy.loginByGoogle().
  //
  // MANUAL TEST CHECKLIST (run before a release or after any auth changes):
  //   [ ] Click "Login with Google" on dev.singaprinting.com
  //   [ ] Google popup opens and shows the account chooser / sign-in prompt
  //   [ ] Sign in with trainee84.glophics@gmail.com
  //   [ ] Site redirects back and shows Profile / My Orders / Sign Out in the menu
  //   [ ] Reload the page — still logged in
  //   [ ] Visit /mypage/profile — shows correct name and email
  //   [ ] Click Sign Out — menu reverts to Sign In / Register
  //
  // NOTE: The post-login behaviour (Profile, My Orders, cart, sign-out) is
  // identical for Google and email/password members, so it is already
  // thoroughly covered by Login-member.cy.js, Cart.cy.js and SignOut.cy.js.
  // These tests exist to confirm the Google auth path specifically.

  describe('Programmatic login via refresh token', () => {
    beforeEach(function () {
      cy.env(['GOOGLE_CLIENT_ID']).then(({ GOOGLE_CLIENT_ID }) => {
        if (!GOOGLE_CLIENT_ID) this.skip();
      });

      // cy.loginByGoogle() uses cy.session() — the token exchange runs only
      // once per Cypress run; subsequent tests reuse the cached session.
      cy.loginByGoogle();
      cy.visit(BASE_URL);
    });

    it('logs in as a Google account member and the site recognises the member', () => {
      expectLoggedIn();
    });

    it('stays logged in after a page reload', () => {
      expectLoggedIn();
      cy.reload();
      expectLoggedIn();
    });

    it('can sign out after a Google login', () => {
      expectLoggedIn();

      cy.contains('ul.menu_links a', 'Sign Out').click({ force: true });
      cy.get('ul.menu_links', { timeout: 20000 }).should('not.exist');
      expectLoggedOut();
    });
  });
});
