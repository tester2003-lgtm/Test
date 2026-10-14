import { BASE_URL } from './config';

// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })

// ---------------------------------------------------------------------------
// cy.loginByGoogle()
//
// Programmatic Google login for specs that need to start already logged in.
// Strategy:
//   1. POST to Google's token endpoint with the refresh token to get a fresh
//      access_token + id_token (no browser interaction, no bot detection).
//   2. POST the id_token to the site's Google auth callback endpoint to
//      establish a server session.
// Uses cy.session() so the token exchange only runs once per Cypress run.
//
// Requires in cypress.env.json:
//   GOOGLE_CLIENT_ID      — from Google Cloud Console → APIs & Services → Credentials
//   GOOGLE_CLIENT_SECRET  — same page (keep secret, never commit)
//   GOOGLE_REFRESH_TOKEN  — one-time generation via OAuth Playground (see below)
//
// HOW TO GENERATE THE REFRESH TOKEN (one-time setup):
//   1. Go to https://developers.google.com/oauthplayground
//   2. Click the ⚙ gear icon → check "Use your own OAuth credentials"
//      → enter your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
//   3. In "Step 1", enter scopes:
//        https://www.googleapis.com/auth/userinfo.email
//        https://www.googleapis.com/auth/userinfo.profile
//        openid
//   4. Click "Authorise APIs" → sign in as trainee84.glophics@gmail.com.
//   5. Click "Exchange authorisation code for tokens".
//   6. Copy the "Refresh token" value → paste as GOOGLE_REFRESH_TOKEN.
//   Note: set the OAuth client's "Authorized redirect URIs" to include
//   https://developers.google.com/oauthplayground for this to work.
//
// NOTE: Update GOOGLE_AUTH_CALLBACK_PATH below if the site's OAuth callback
// route changes (check Network tab while doing a real Google login).
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_CALLBACK_PATH = '/login/google/callback'; // ← update if needed

Cypress.Commands.add('loginByGoogle', () => {
  cy.session('google-login', () => {
    cy.env(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']).then(
      ({ GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN }) => {
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
          throw new Error(
            'cy.loginByGoogle() requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ' +
            'and GOOGLE_REFRESH_TOKEN in cypress.env.json. ' +
            'See the OAuth Playground instructions in commands.js.'
          );
        }

        // Step 1: Exchange the refresh token for a fresh access_token + id_token.
        // This is a direct API call — no browser, no bot detection, no CAPTCHA.
        cy.request({
          method: 'POST',
          url: 'https://oauth2.googleapis.com/token',
          body: {
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: GOOGLE_REFRESH_TOKEN,
            grant_type: 'refresh_token',
          },
        }).then((tokenResp) => {
          const { access_token, id_token } = tokenResp.body;

          // Step 2: Hand the token to the site's backend. It verifies the token
          // with Google, creates a session cookie and redirects back to BASE_URL.
          //
          // If this request fails, inspect the Network tab during a real Google
          // login to find the correct endpoint and body shape, then update
          // GOOGLE_AUTH_CALLBACK_PATH and the body below accordingly.
          cy.request({
            method: 'POST',
            url: BASE_URL + GOOGLE_AUTH_CALLBACK_PATH,
            body: { access_token, id_token },
            form: false,
            followRedirect: true,
            failOnStatusCode: false, // surface the error rather than crash the session
          }).then((authResp) => {
            if (authResp.status >= 400) {
              throw new Error(
                `cy.loginByGoogle(): backend returned ${authResp.status}. ` +
                `Check GOOGLE_AUTH_CALLBACK_PATH in commands.js ` +
                `(currently "${GOOGLE_AUTH_CALLBACK_PATH}").`
              );
            }
          });

          cy.visit(BASE_URL);
          cy.get('ul.menu_links', { timeout: 20000 }).should('contain', 'Sign Out');
        });
      }
    );
  });
});

// ---------------------------------------------------------------------------
// cy.loginByFacebook()
//
// Programmatic Facebook login for specs that need to start already logged in.
// Strategy:
//   1. If FB_TEST_USER_TOKEN is set in cypress.env.json, use it directly.
//   2. Otherwise, fetch the first test user's token from the Meta Graph API
//      using FB_APP_ID | FB_APP_SECRET as the app-level access token.
//   3. POST the user token to the site's Facebook auth callback endpoint to
//      establish a server session.
// Uses cy.session() so the auth dance only runs once per Cypress run.
//
// Requires in cypress.env.json:
//   FB_APP_ID          — from Meta App Dashboard → Settings → Basic
//   FB_APP_SECRET      — same page (keep secret, never commit)
//   FB_TEST_USER_TOKEN — optional pre-generated token (App Dashboard → Roles → Test Users)
//
// To create a test user:
//   Meta App Dashboard → App Roles → Test Users → Create test users → "Allow this
//   test user to create an account on my app" → click "Edit" for the new user to get
//   the pre-generated access token for use as FB_TEST_USER_TOKEN.
//
// NOTE: Update FB_AUTH_CALLBACK_PATH below if the site's OAuth callback route
// changes (check Network tab while doing a real Facebook login).
// ---------------------------------------------------------------------------

const FB_AUTH_CALLBACK_PATH = '/login/facebook/callback'; // ← update if needed

Cypress.Commands.add('loginByFacebook', () => {
  cy.session('facebook-login', () => {
    cy.env(['FB_APP_ID', 'FB_APP_SECRET', 'FB_TEST_USER_TOKEN']).then(
      ({ FB_APP_ID, FB_APP_SECRET, FB_TEST_USER_TOKEN }) => {
        if (!FB_APP_ID || (!FB_APP_SECRET && !FB_TEST_USER_TOKEN)) {
          throw new Error(
            'cy.loginByFacebook() requires FB_APP_ID and either FB_APP_SECRET ' +
            'or FB_TEST_USER_TOKEN in cypress.env.json'
          );
        }

        const getToken = FB_TEST_USER_TOKEN
          ? // Pre-generated token supplied — use it directly.
            cy.wrap(FB_TEST_USER_TOKEN)
          : // Fetch the first test user's token via the Graph API.
            cy
              .request({
                method: 'GET',
                url: 'https://graph.facebook.com/v19.0/' + FB_APP_ID + '/accounts/test-users',
                qs: {
                  access_token: FB_APP_ID + '|' + FB_APP_SECRET,
                  fields: 'access_token,email,name',
                },
              })
              .then((resp) => {
                const testUsers = resp.body.data;
                if (!testUsers || !testUsers.length) {
                  throw new Error(
                    'No test users found. Create one in Meta App Dashboard → App Roles → Test Users.'
                  );
                }
                return testUsers[0].access_token;
              });

        getToken.then((token) => {
          // Hand the token to the site's backend. It exchanges the token for a
          // session cookie and redirects the browser back to BASE_URL.
          //
          // If this request fails, inspect the Network tab during a real Facebook
          // login to find the correct endpoint and request body shape, then update
          // FB_AUTH_CALLBACK_PATH and the body below accordingly.
          cy.request({
            method: 'POST',
            url: BASE_URL + FB_AUTH_CALLBACK_PATH,
            body: { access_token: token },
            form: false,
            followRedirect: true,
          });

          cy.visit(BASE_URL);
          cy.get('ul.menu_links', { timeout: 20000 }).should('contain', 'Sign Out');
        });
      }
    );
  });
});

// ---------------------------------------------------------------------------
// cy.login(email, password)
// ---------------------------------------------------------------------------

// Log in to BASE_URL with an email/password member account.
// Uses cy.session so the login is cached across tests in the same run.
Cypress.Commands.add('login', (email, password) => {
  cy.session(['singaprinting-login', email], () => {
    cy.visit(BASE_URL);
    cy.get('a.icon_myaccount[aria-label="My Account"]').click({ force: true });
    cy.contains('button', 'Sign in to Account').click({ force: true });

    cy.get('form.login_form').should('be.visible').within(() => {
      cy.get('input[type="text"]').type(email);
      cy.get('input[type="password"]').type(password, { log: false });
      cy.contains('button[type="submit"]', 'Sign In').click();
    });

    cy.get('form.login_form').should('not.exist');
  });
});
