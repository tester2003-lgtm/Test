import { BASE_URL, ADMIN_URL } from './config';

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
// Logs in as a Google member without touching accounts.google.com, by
// replaying what the site does after Google redirects back to it:
//   1. Refresh token → Google access token (oauth2.googleapis.com/token).
//   2. Access token → Google profile (googleapis.com/oauth2/v3/userinfo).
//   3. Site API POST /user/social/google/signIn { first_name, last_name, id, email, token }
//      → { status: 'SUCCESS', meta: { token } }. Sent through the site's own $axios so the
//      API base URL and its required `request-from: client-panel` header come from the site.
//   4. Site store action user/access/set { signed_in: true, token } saves the login.
// Cached with cy.session(), so this runs once per Cypress run.
//
// Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in cypress.env.json.
// Refresh token, one-time setup:
//   1. https://developers.google.com/oauthplayground → ⚙ → "Use your own OAuth credentials"
//      → enter the client ID/secret. Ask the developers whether the backend checks which
//      OAuth client issued the token: if it does, this must be the site's own Google client
//      (726978724188-…apps.googleusercontent.com) with the playground added to its
//      Authorized redirect URIs; if not, a QA-owned client works too.
//   2. Scopes: openid email profile → Authorize APIs → sign in as the test Google account.
//   3. Exchange authorization code for tokens → copy the Refresh token.
// ---------------------------------------------------------------------------

Cypress.Commands.add('loginByGoogle', () => {
  cy.session(
    'google-login',
    () => {
      cy.env(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']).then(
        ({ GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN }) => {
          if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
            throw new Error(
              'cy.loginByGoogle() needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ' +
                'GOOGLE_REFRESH_TOKEN in cypress.env.json — see commands.js for setup.'
            );
          }

          cy.request({
            method: 'POST',
            url: 'https://oauth2.googleapis.com/token',
            form: true,
            log: false,
            body: {
              grant_type: 'refresh_token',
              client_id: GOOGLE_CLIENT_ID,
              client_secret: GOOGLE_CLIENT_SECRET,
              refresh_token: GOOGLE_REFRESH_TOKEN,
            },
          })
            .its('body.access_token')
            .then((accessToken) => {
              cy.request({
                url: 'https://www.googleapis.com/oauth2/v3/userinfo',
                headers: { Authorization: `Bearer ${accessToken}` },
              })
                .its('body')
                .then((profile) => {
                  cy.visit(BASE_URL);
                  cy.window().should((win) => {
                    expect(win.$nuxt && win.$nuxt._isMounted, 'Nuxt app mounted').to.equal(true);
                  });
                  cy.window()
                    .then((win) =>
                      win.$nuxt.$axios.$post('/user/social/google/signIn', {
                        first_name: profile.given_name,
                        last_name: profile.family_name,
                        id: profile.sub,
                        email: profile.email,
                        token: accessToken,
                      })
                    )
                    .then((res) => {
                      expect(res.status, `signIn response ${JSON.stringify(res)}`).to.equal('SUCCESS');
                      cy.window().then((win) =>
                        win.$nuxt.$store.dispatch('user/access/set', { signed_in: true, token: res.meta.token })
                      );
                    });
                });
            });
        }
      );
      cy.reload();
      cy.get('ul.menu_links', { timeout: 20000 }).should('contain', 'Sign Out');
    },
    {
      validate() {
        cy.visit(BASE_URL);
        cy.get('ul.menu_links', { timeout: 20000 }).should('contain', 'Sign Out');
      },
    }
  );
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
// cy.loginByEmail()
//
// Starts a spec logged in as the test member (MEMBER_EMAIL / MEMBER_PASSWORD in
// cypress.env.json) without using the login form — the form is tested in
// auth/login-email.cy.js. It calls the site's own login, $auth.loginWith('local'), which
// sends the same POST user/signin { email, password, remember_me } as the form and saves
// the token in the auth_client__token.local cookie. cy.session() caches that cookie across
// specs; validate() checks it still works and Cypress logs in again if it doesn't.
// ---------------------------------------------------------------------------

Cypress.Commands.add('loginByEmail', () => {
  cy.session(
    'member',
    () => {
      cy.env(['MEMBER_EMAIL', 'MEMBER_PASSWORD']).then(({ MEMBER_EMAIL, MEMBER_PASSWORD }) => {
        if (!MEMBER_EMAIL || !MEMBER_PASSWORD) {
          throw new Error('cy.loginByEmail() needs MEMBER_EMAIL and MEMBER_PASSWORD in cypress.env.json.');
        }

        cy.visit(BASE_URL);
        cy.window().should((win) => {
          expect(win.$nuxt && win.$nuxt._isMounted, 'Nuxt app mounted').to.equal(true);
        });
        // Runs inside the page and yields nothing, so the password never shows in the command log.
        cy.window().then((win) =>
          win.$nuxt.$auth
            .loginWith('local', { data: { email: MEMBER_EMAIL, password: MEMBER_PASSWORD, remember_me: false } })
            .then(() => undefined)
        );
      });
      cy.reload();
      cy.get('ul.menu_links', { timeout: 20000 }).should('contain', 'Sign Out');
    },
    {
      cacheAcrossSpecs: true,
      validate() {
        cy.visit(BASE_URL);
        cy.get('ul.menu_links', { timeout: 20000 }).should('contain', 'Sign Out');
      },
    }
  );
});

// ---------------------------------------------------------------------------
// cy.loginAsAdmin()
//
// Starts a spec logged in to the admin panel (ADMIN_URL in config.js) as the QA admin account.
// The panel's normal login emails a one-time code, which tests can't read. But when its
// "Keep me signed in" cookies (auth.remember_me + auth.remember_token) are present it logs in
// by itself, for 30 days. ADMIN_REMEMBER_TOKEN in cypress.env.json holds that token.
//
// To get / renew the token: log in to the admin panel in Chrome with "Keep me signed in" ticked
// and the emailed code, then F12 → Application → Cookies → copy the value of
// auth.remember_token into ADMIN_REMEMBER_TOKEN.
// ---------------------------------------------------------------------------

Cypress.Commands.add('loginAsAdmin', () => {
  cy.session(
    'admin',
    () => {
      cy.env(['ADMIN_REMEMBER_TOKEN']).then(({ ADMIN_REMEMBER_TOKEN }) => {
        if (!ADMIN_REMEMBER_TOKEN) {
          throw new Error('cy.loginAsAdmin() needs ADMIN_REMEMBER_TOKEN in cypress.env.json — see commands.js.');
        }
        // "/" is the login page and loads without auth; then write the token the way the panel's
        // own auth module does (its $storage encodes the cookie + localStorage correctly). Setting
        // it as the active session token avoids the server-side "remember" re-mint, which 500s.
        cy.visit(ADMIN_URL + '/');
        cy.window().should((win) => expect(win.$nuxt && win.$nuxt.$auth, 'admin app ready').to.exist);
        cy.window({ log: false }).then((win) => {
          const auth = win.$nuxt.$auth;
          auth.$storage.setUniversal('strategy', 'local');
          auth.$storage.setUniversal('_token.local', 'Bearer ' + ADMIN_REMEMBER_TOKEN);
          // Far-future so the panel doesn't treat the session as expired; the API decides the real expiry.
          auth.$storage.setUniversal('_token_expiration.local', Date.now() + 29 * 24 * 60 * 60 * 1000);
        });
      });
      cy.visit(ADMIN_URL + '/dashboard');
      cy.location('pathname', { timeout: 30000 }).should((pathname) => {
        expect(
          pathname,
          'admin logged in (if not, ADMIN_REMEMBER_TOKEN has probably expired after 30 days — renew it, see commands.js)'
        ).to.equal('/dashboard');
      });
      cy.get('input[name="username"]').should('not.exist');
    },
    {
      cacheAcrossSpecs: true,
      validate() {
        cy.visit(ADMIN_URL + '/dashboard');
        cy.location('pathname', { timeout: 30000 }).should('eq', '/dashboard');
        cy.get('input[name="username"]').should('not.exist');
      },
    }
  );
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
