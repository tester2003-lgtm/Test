// Page object for the order "Send a message" messaging panel.
// Used by:
//   cypress/e2e/orders/customer-messages.cy.js  — customer side
//   cypress/e2e/orders/admin-messages.cy.js     — admin side (future)
//
// Selectors confirmed from DOM are noted.
// Selectors marked "TODO: verify" should be checked against the live DOM:
//   open DevTools while the messaging panel is open and inspect the input,
//   send button, file input, and message list elements.

import { BASE_URL } from '../config';

// ── Trigger ───────────────────────────────────────────────────────────────────
// Confirmed: <a aria-label="Send a message" class="odb_action message">
// TODO: suggest adding data-cy="btn-open-messages" to this element.
export const openMessages = () =>
  cy.get('a[aria-label="Send a message"]').click({ force: true });

// ── Panel container ───────────────────────────────────────────────────────────
// TODO: verify and replace with the actual panel/drawer selector.
// Common candidates: .message_panel, .odb_message_section, [class*="msg_panel"]
export const panel = () =>
  cy.get('.message_panel, [class*="message_panel"], [class*="msg_panel"]', { timeout: 10000 });

// ── Message input ─────────────────────────────────────────────────────────────
// TODO: verify — could be textarea, div[contenteditable], or input[type="text"].
// TODO: suggest adding data-cy="message-input".
export const messageInput = () =>
  panel().find('textarea, [contenteditable="true"], input[type="text"]').first();

// ── File attachment ───────────────────────────────────────────────────────────
// TODO: verify — hidden file input; trigger via cy.selectFile with force: true.
// TODO: suggest adding data-cy="file-input".
export const fileInput = () => panel().find('input[type="file"]');

// ── Send button ───────────────────────────────────────────────────────────────
// TODO: verify. Common: button.send_btn, button[type="submit"] inside panel.
// TODO: suggest adding data-cy="btn-send-message".
export const sendButton = () =>
  panel().find('button').filter(':contains("Send"), [class*="send"], [type="submit"]').first();

// ── Message list ──────────────────────────────────────────────────────────────
// TODO: verify — container holding individual message items.
// TODO: suggest adding data-cy="message-list" and data-cy="message-item".
export const messageItems = () =>
  panel().find('[class*="message_item"], [class*="msg_item"], [class*="chat_item"]');

// ── Error / validation ────────────────────────────────────────────────────────
// TODO: verify — inline error shown when a file is rejected or input is invalid.
export const errorMessage = () =>
  panel().find('[class*="error"], [class*="alert"], [class*="invalid"]').first();

// ── Helper: guess MIME type from extension ────────────────────────────────────
const guessMime = (filePath) => {
  const ext = filePath.split('.').pop().toLowerCase();
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    pdf: 'application/pdf',
    txt: 'text/plain',
    ai: 'application/postscript',
    psd: 'image/vnd.adobe.photoshop',
  };
  return map[ext] || 'application/octet-stream';
};

// ── Helper: type a message (works for textarea and contenteditable) ───────────
export const typeMessage = (text) => {
  messageInput().clear().type(text);
};

// ── Helper: attach one or more fixture files ──────────────────────────────────
// fixturePaths: string or string[] of paths relative to cypress/fixtures/
// Example: attachFiles('messages/image.png')
//          attachFiles(['messages/image.png', 'messages/document.pdf'])
export const attachFiles = (fixturePaths) => {
  const paths = Array.isArray(fixturePaths) ? fixturePaths : [fixturePaths];
  fileInput().selectFile(
    paths.map((p) => ({ contents: 'cypress/fixtures/' + p, mimeType: guessMime(p) })),
    { force: true }
  );
};

// ── Helper: type text (optional) then click Send ──────────────────────────────
// Intercept POST before calling this so cy.wait('@alias') works afterward.
export const sendMessage = (text) => {
  if (text) typeMessage(text);
  sendButton().click();
};

// ── Helper: visit an order and open the messaging panel ──────────────────────
export const visitOrderMessages = (orderId) => {
  cy.visit(BASE_URL + '/mypage/orders/' + orderId);
  openMessages();
  panel().should('be.visible');
};
