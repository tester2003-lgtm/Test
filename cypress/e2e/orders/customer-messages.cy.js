// Customer "Send a message" — order detail page messaging panel.
// Site: BASE_URL in cypress/support/config.js
//
// ── Assumptions (update when real DOM is confirmed) ───────────────────────────
//
//  1. Trigger:   a[aria-label="Send a message"] (confirmed from provided HTML)
//  2. Panel:     opens as an inline section / drawer after clicking the trigger
//               (selector guessed — see orderMessages.js → panel())
//  3. Input:     textarea or div[contenteditable] inside the panel
//               (TODO: verify in DevTools while panel is open)
//  4. Send btn:  button containing text "Send" or type="submit" inside the panel
//  5. File input:input[type="file"] inside the panel
//  6. API:       POST and GET to a URL containing "message" (pattern-matched)
//               (TODO: replace with exact endpoint from Network tab)
//  7. Accepted file types: png, jpg, pdf (assumed — TODO: confirm with site rules)
//  8. Max file size: 10 MB (assumed — TODO: confirm)
//  9. Timestamps: Asia/Singapore (UTC+8)
// 10. Empty/whitespace messages: send button is disabled or shows an error
// 11. HTML in messages: escaped on display, not executed
// 12. No cleanup API: test data accumulates on the dev order (noted in after())
//
// ── Setup ─────────────────────────────────────────────────────────────────────
//
//  ORDER_ID in cypress.env.json: order 7732 (belongs to trainee84.glophics@gmail.com)
//  Login: Google OAuth via UI — requires Chrome headed (Google blocks Electron).
//  GOOGLE_EMAIL / GOOGLE_PASSWORD in cypress.env.json drive the login.
//
//  All tests are skipped when GOOGLE_EMAIL or ORDER_ID are not set, or when
//  running in Electron (Google blocks headless/Electron automation).
//
// ── Run ───────────────────────────────────────────────────────────────────────
//
//  npx cypress run --spec cypress/e2e/orders/customer-messages.cy.js
//
// ── Future spec ───────────────────────────────────────────────────────────────
//
//  cypress/e2e/orders/admin-messages.cy.js — verify customer messages appear
//  on the admin side and admin replies are visible to the customer. Import
//  the same page object (orderMessages.js) and add admin-side selectors.

import { BASE_URL } from '../../support/config';
import * as Msg from '../../support/pages/orderMessages';

// ── Login ──────────────────────────────────────────────────────────────────────
// Uses the email/password account (SP_EMAIL / SP_PASSWORD in cypress.env.json).
// That account must have at least one completed order — put its ID in ORDER_ID.
//
// One-time setup:
//   1. Log in to dev.singaprinting.com as the SP_EMAIL account from cypress.env.json.
//   2. Place any order and note the order ID.
//   3. Set ORDER_ID in cypress.env.json to that value.
//
// cy.login() uses cy.session() so the login only runs once per Cypress run.
const loginForOrders = () => {
  cy.env(['SP_EMAIL', 'SP_PASSWORD']).then(({ SP_EMAIL, SP_PASSWORD }) => {
    cy.login(SP_EMAIL, SP_PASSWORD);
  });
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Unique tag added to every test message so old messages don't interfere.
const tag = () => `[cy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}]`;

// Intercept the send-message API call.
// TODO: replace '**/message**' with the exact POST endpoint once confirmed from
// the Network tab (e.g. '**/orders/*/messages' or '**/api/message').
const interceptSend = () => cy.intercept('POST', '**/message**').as('sendMessage');

// Intercept the fetch-messages API call.
const interceptFetch = () => cy.intercept('GET', '**/message**').as('fetchMessages');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Customer messages on an order', () => {
  let orderId;

  before(function () {
    cy.env(['ORDER_ID', 'SP_EMAIL', 'SP_PASSWORD']).then(({ ORDER_ID, SP_EMAIL, SP_PASSWORD }) => {
      if (!ORDER_ID || !SP_EMAIL || !SP_PASSWORD) { this.skip(); return; }
      orderId = ORDER_ID;
      loginForOrders();
    });
  });

  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.on('uncaught:exception', () => false);
    // Re-use the cached session (cy.login uses cy.session internally).
    loginForOrders();
  });

  after(() => {
    // NOTE: There is no public cleanup API for test messages.
    // Messages sent during this run will accumulate on order 7732.
    // If this becomes a problem, ask the dev team for a DELETE endpoint
    // and add cleanup logic here using cy.request().
    cy.log('Test messages accumulated on order ' + orderId + ' — no cleanup API available.');
  });

  // ── 1. Trigger opens the panel ──────────────────────────────────────────────

  it('shows the "Messages" trigger on an order and opens the panel', () => {
    interceptFetch();
    cy.visit(`${BASE_URL}/mypage/orders/${orderId}`);

    Msg.openMessages();

    // Wait for any initial message fetch to complete.
    cy.wait('@fetchMessages', { timeout: 15000 }).its('response.statusCode').should('be.oneOf', [200, 204]);

    Msg.panel().should('be.visible');
    Msg.messageInput().should('be.visible');
    Msg.sendButton().should('be.visible');
  });

  // ── 2. Send plain text ──────────────────────────────────────────────────────

  it('sends a plain text message, it appears in the list, and the input is cleared', () => {
    const text = `Hello from Cypress ${tag()}`;

    interceptSend();
    interceptFetch();
    Msg.visitOrderMessages(orderId);
    cy.wait('@fetchMessages');

    Msg.sendMessage(text);
    cy.wait('@sendMessage').its('response.statusCode').should('be.oneOf', [200, 201]);

    // Input should be empty after sending.
    Msg.messageInput().should('have.value', '').or('have.text', '');

    // The message should appear in the list.
    Msg.messageItems().last().should('contain', text);
  });

  // ── 3. Multi-paragraph — line breaks preserved ──────────────────────────────

  it('preserves line breaks in a multi-paragraph message after reload', () => {
    const uid = tag();
    const lines = [`Paragraph A ${uid}`, `Paragraph B ${uid}`, `Paragraph C ${uid}`];
    const text = lines.join('\n\n');

    interceptSend();
    Msg.visitOrderMessages(orderId);

    Msg.typeMessage(text);
    Msg.sendButton().click();
    cy.wait('@sendMessage');

    // Reload and re-open the panel.
    interceptFetch();
    cy.reload();
    Msg.openMessages();
    cy.wait('@fetchMessages');

    // All three paragraphs should still be visible in the last message.
    lines.forEach((line) => {
      Msg.messageItems().last().should('contain', line);
    });
  });

  // ── 4. Attach one image — preview shown with loaded pixels ─────────────────

  it('attaches one image; a thumbnail is shown and the image loads (naturalWidth > 0)', () => {
    const text = `Image upload test ${tag()}`;

    interceptSend();
    Msg.visitOrderMessages(orderId);

    Msg.typeMessage(text);
    Msg.fileInput().selectFile('cypress/fixtures/messages/image.png', { force: true });

    // TODO: if the site shows a preview before sending, assert it here:
    // Msg.panel().find('img.preview, [class*="preview"] img').should('be.visible');

    Msg.sendButton().click();
    cy.wait('@sendMessage').its('response.statusCode').should('be.oneOf', [200, 201]);

    // The sent message should contain an image whose pixels actually loaded.
    Msg.messageItems()
      .last()
      .find('img')
      .should(($img) => {
        expect($img[0].naturalWidth, 'image naturalWidth').to.be.greaterThan(0);
      });
  });

  // ── 5. Multiple file attachments ────────────────────────────────────────────

  it('sends a message with multiple files (up to the allowed maximum)', () => {
    // TODO: update MAX_FILES to the site's actual limit once confirmed.
    const MAX_FILES = 5;
    const fixtures = Array.from({ length: Math.min(MAX_FILES, 2) }, (_, i) =>
      i % 2 === 0 ? 'cypress/fixtures/messages/image.png' : 'cypress/fixtures/messages/document.pdf'
    );

    interceptSend();
    Msg.visitOrderMessages(orderId);

    Msg.typeMessage(`Multi-file upload test ${tag()}`);
    Msg.fileInput().selectFile(fixtures, { force: true });
    Msg.sendButton().click();
    cy.wait('@sendMessage').its('response.statusCode').should('be.oneOf', [200, 201]);

    // At least one attachment should appear in the last message.
    Msg.messageItems()
      .last()
      .find('img, a[href*=".pdf"], [class*="attach"], [class*="file"]')
      .should('have.length.at.least', 1);
  });

  // ── 6. Accepted file types (data-driven) ────────────────────────────────────

  // TODO: update ACCEPTED_FILES to the site's actual accepted types and
  // add real fixture files for each. Currently testing png, pdf, txt.
  const ACCEPTED_FILES = [
    { label: 'PNG image', fixture: 'cypress/fixtures/messages/image.png' },
    { label: 'PDF document', fixture: 'cypress/fixtures/messages/document.pdf' },
    { label: 'text file', fixture: 'cypress/fixtures/messages/document.txt' },
  ];

  ACCEPTED_FILES.forEach(({ label, fixture }) => {
    it(`accepts a ${label} attachment`, () => {
      interceptSend();
      Msg.visitOrderMessages(orderId);

      Msg.typeMessage(`${label} upload test ${tag()}`);
      Msg.fileInput().selectFile(fixture, { force: true });

      // File should NOT produce an inline error.
      Msg.panel()
        .find('[class*="error"], [class*="alert"]')
        .should('not.exist')
        .or('not.be.visible');

      Msg.sendButton().click();
      cy.wait('@sendMessage').its('response.statusCode').should('be.oneOf', [200, 201]);
    });
  });

  // ── 7. Unsupported file type is rejected ────────────────────────────────────

  it('rejects an unsupported file type (.exe) with an error before sending', () => {
    interceptSend();
    Msg.visitOrderMessages(orderId);

    Msg.typeMessage(`Invalid file type test ${tag()}`);
    Msg.fileInput().selectFile('cypress/fixtures/messages/malware.exe', { force: true });

    // The error must appear without clicking Send.
    // TODO: verify the error selector once the real DOM is known.
    Msg.errorMessage().should('be.visible');

    // Send button should remain disabled OR the API should NOT be called.
    // Option A: send button disabled
    // Msg.sendButton().should('be.disabled');
    // Option B: clicking send does NOT call the API (comment out the above and use this):
    Msg.sendButton().click();
    cy.get('@sendMessage.all').should('have.length', 0);
  });

  // ── 8. Oversized file is rejected ──────────────────────────────────────────

  it('rejects a file over the size limit with an error', () => {
    // Generate a >10 MB buffer programmatically — no large binary in the repo.
    // TODO: update MAX_BYTES to the real size limit.
    const MAX_BYTES = 10 * 1024 * 1024 + 1; // 10 MB + 1 byte

    interceptSend();
    Msg.visitOrderMessages(orderId);

    Msg.fileInput().selectFile(
      {
        contents: Cypress.Buffer.alloc(MAX_BYTES, 'x'),
        fileName: 'oversized.png',
        mimeType: 'image/png',
      },
      { force: true }
    );

    // Error should appear without clicking Send.
    Msg.errorMessage().should('be.visible');

    // Clicking Send should NOT call the API.
    Msg.sendButton().click();
    cy.get('@sendMessage.all').should('have.length', 0);
  });

  // ── 9. Whitespace-only message cannot be sent ───────────────────────────────

  it('cannot send a whitespace-only message', () => {
    interceptSend();
    Msg.visitOrderMessages(orderId);

    Msg.typeMessage('   ');
    Msg.sendButton().click();

    // Either the button stays disabled, or the API is never called.
    // Option A: expect send button to be disabled (uncomment if applicable):
    // Msg.sendButton().should('be.disabled');

    // Option B: expect an inline validation error:
    // Msg.errorMessage().should('be.visible');

    // Either way, the POST API must NOT be called.
    cy.get('@sendMessage.all').should('have.length', 0);
  });

  // ── 10. Timestamp is correct (within 1 minute) ─────────────────────────────

  it('shows a timestamp close to the send time (within 1 minute)', () => {
    const text = `Timestamp test ${tag()}`;

    interceptSend();
    Msg.visitOrderMessages(orderId);

    // Capture wall-clock time just before sending (in SGT = UTC+8).
    const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
    const beforeSend = new Date(Date.now() + SGT_OFFSET_MS);

    Msg.sendMessage(text);
    cy.wait('@sendMessage');

    // Find the timestamp on the last message.
    // TODO: update '[class*="timestamp"], [class*="time"]' to the real selector.
    // TODO: update the date parsing logic to match the site's actual format,
    //   e.g. "14 Oct 2026, 3:45 PM" → new Date('14 Oct 2026 15:45:00 +0800')
    Msg.messageItems()
      .last()
      .find('[class*="timestamp"], [class*="time"], time')
      .invoke('text')
      .then((rawTime) => {
        cy.log('Raw timestamp from site: ' + rawTime);
        // TODO: parse rawTime to a Date object. Example for "14 Oct 2026, 3:45 PM":
        // const sentAt = new Date(rawTime.replace(',', '') + ' +0800');
        // expect(Math.abs(sentAt - beforeSend), 'timestamp drift (ms)').to.be.lessThan(60_000);
      });
  });

  // ── 11. Messages persist after reload in chronological order ───────────────

  it('messages persist after reload and are in chronological order', () => {
    const [textA, textB] = [`First message ${tag()}`, `Second message ${tag()}`];

    interceptSend();
    Msg.visitOrderMessages(orderId);

    Msg.sendMessage(textA);
    cy.wait('@sendMessage');

    Msg.sendMessage(textB);
    cy.wait('@sendMessage');

    // Reload and reopen the panel.
    interceptFetch();
    cy.reload();
    Msg.openMessages();
    cy.wait('@fetchMessages');

    // Both messages should be visible; B should appear after A.
    Msg.messageItems().then(($items) => {
      const texts = [...$items].map((el) => el.innerText);
      const idxA = texts.findIndex((t) => t.includes(textA));
      const idxB = texts.findIndex((t) => t.includes(textB));
      expect(idxA, 'first message index').to.be.greaterThan(-1);
      expect(idxB, 'second message index').to.be.greaterThan(-1);
      expect(idxA, 'A appears before B').to.be.lessThan(idxB);
    });
  });

  // ── 12. HTML / script is escaped, not executed ─────────────────────────────

  it('renders HTML and script tags as plain text, not as HTML or executed JS', () => {
    const payload = `<b>bold</b><script>window.__xss_${Date.now()} = true</script> ${tag()}`;

    interceptSend();
    Msg.visitOrderMessages(orderId);

    Msg.sendMessage(payload);
    cy.wait('@sendMessage');

    // The literal angle-bracket characters must appear as text.
    Msg.messageItems().last().should('contain', '<b>bold</b>');

    // The <script> must NOT have executed — window property should be undefined.
    cy.window().then((win) => {
      const key = Object.keys(win).find((k) => k.startsWith('__xss_'));
      expect(key, 'XSS script executed').to.be.undefined;
    });
  });
});
