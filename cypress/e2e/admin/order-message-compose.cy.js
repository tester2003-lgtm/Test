// Admin reply message form — positive and negative cases for composing a reply on an order.
// Site: ADMIN_URL / BASE_URL in cypress/support/config.js
// Run: npx cypress run --spec cypress/e2e/admin/order-message-compose.cy.js
//
// Admin login via cy.loginAsAdmin() (ADMIN_REMEMBER_TOKEN). An order with a short thread is used
// (support/api.js). Negative cases assert the admin form blocks the send (no request, error shown).
// Positive cases send via the admin UI and verify the result on the CUSTOMER side via API — the
// customer reliably sees staff replies, whereas the admin panel can render a stale thread (see the
// known issue noted in order-messages.cy.js).
//
// Rules (from the form): a message needs text that isn't only spaces, or a file. Files:
// .doc .docx .xls .xlsx .ppt .pptx .csv .eps .ai .psd .pdf .tif .tiff .zip .png .jpg .jpeg,
// max 4 files / 50 MB total. The server strips anything that looks like an HTML tag.
//
// One it() per case. testIsolation: false; if a step fails the rest are skipped. Every positive
// case sends a real staff reply (tagged with the run id) on a member order on dev — no cleanup.

import * as Admin from '../../support/pages/adminOrderMessages';
import { customerLogin, orderWithShortThread, orderThread } from '../../support/api';

const RUN = `cy-${new Date().getTime().toString(36)}`;
const FIXTURES = 'cypress/fixtures/messages/';
const ARTWORK = 'cypress/fixtures/artwork/sticker-artwork.png';

const convo = {}; // { token, order }

// Poll the customer's thread until a staff message containing `text` appears; yields it.
const waitForStaffReply = (text, attempt = 0) =>
  orderThread(convo.token, convo.order.id).then((thread) => {
    const found = thread.find((m) => (m.content || '').includes(text) && m.origin !== 'client');
    if (found) return found;
    if (attempt >= 10) throw new Error(`staff reply "${text}" did not reach the customer after ${attempt} tries.`);
    cy.wait(2000);
    return waitForStaffReply(text, attempt + 1);
  });

// Reload the order and open a fresh, empty compose form (avoids leftover state between cases).
const openComposer = () => {
  Admin.openOrder(convo.order.id);
  Admin.messagesTab().click();
  Admin.panel().should('be.visible');
  Admin.addMessageButton().click();
  Admin.composeForm().should('be.visible');
  Admin.messageInput().should('have.value', '');
};

// Type a message and send it; wait for the server to accept it.
const sendReply = (text, files) => {
  cy.intercept({ method: 'POST', url: /\/message\/(send|save)(\?|$)/ }).as('adminSend');
  if (text) Admin.messageInput().type(text, { parseSpecialCharSequences: false });
  if (files) Admin.fileInput().selectFile(files, { force: true });
  Admin.sendButton().click();
  cy.wait('@adminSend', { timeout: 30000 }).its('response.statusCode').should('be.oneOf', [200, 201]);
};

describe('Admin reply message form', { testIsolation: false }, () => {
  let stepFailed = false;

  before(() => {
    customerLogin().then((token) => {
      convo.token = token;
      orderWithShortThread(token).then((order) => {
        convo.order = order;
      });
    });
  });

  beforeEach(function () {
    if (stepFailed) this.skip();
    cy.viewport(1440, 900);
    cy.on('uncaught:exception', () => false);
  });

  afterEach(function () {
    if (this.currentTest.state === 'failed') stepFailed = true;
  });

  it('admin logs in, opens the order and the Messages panel', () => {
    cy.loginAsAdmin();
    Admin.openOrder(convo.order.id);
    Admin.messagesTab().click();
    Admin.panel().should('be.visible');
  });

  // ── Negative: the form blocks the send ──────────────────────────────────────

  it('does not send an empty message', () => {
    let sends = 0;
    cy.intercept({ method: 'POST', url: /\/message\/(send|save)/ }, () => { sends += 1; }).as('send');
    openComposer();
    Admin.sendButton().click();
    Admin.inputHasError();
    cy.wrap(null).should(() => expect(sends, 'no send request').to.equal(0));
  });

  it('does not send a message of only spaces', () => {
    let sends = 0;
    cy.intercept({ method: 'POST', url: /\/message\/(send|save)/ }, () => { sends += 1; }).as('send');
    openComposer();
    Admin.messageInput().type('     ');
    Admin.sendButton().click();
    Admin.inputHasError();
    cy.wrap(null).should(() => expect(sends, 'no send request').to.equal(0));
  });

  it('rejects an unsupported file type (.txt) with the right message', () => {
    openComposer();
    Admin.fileInput().selectFile(FIXTURES + 'document.txt', { force: true });
    Admin.warningToast().should('contain', 'Upload failed. Unsupported filetype.');
    Admin.dropzoneError().should('exist');
    Admin.filePreviews().should('have.length', 0);
  });

  it('rejects more than 4 files with the right message', () => {
    openComposer();
    Admin.fileInput().selectFile(Array(5).fill(ARTWORK), { force: true });
    Admin.warningToast().should('contain', 'Maximum number of files exceeded. Only 4 files is allowed.');
    Admin.dropzoneError().should('exist');
    Admin.filePreviews().should('have.length', 0);
  });

  it('rejects files over 50 MB in total with the right message', () => {
    openComposer();
    Admin.fileInput().selectFile(
      { contents: Cypress.Buffer.alloc(50 * 1024 * 1024 + 1), fileName: 'oversized.pdf', mimeType: 'application/pdf' },
      { force: true }
    );
    Admin.warningToast().should('contain', 'Maximum total file size exceeded. Only 50 MB total is allowed.');
    Admin.dropzoneError().should('exist');
    Admin.filePreviews().should('have.length', 0);
  });

  // ── Positive: sent, and the customer receives it correctly ──────────────────

  it('sends a short message', () => {
    const text = `Short admin reply. [${RUN}-short]`;
    openComposer();
    sendReply(text);
    waitForStaffReply(`${RUN}-short`).then((m) => expect(m.content).to.contain(text));
  });

  it('sends a message in paragraphs and keeps the format', () => {
    const uid = `${RUN}-para`;
    const text = `Paragraph one. [${uid}]{enter}{enter}Paragraph two, line A.{enter}Paragraph two, line B.`;
    openComposer();
    // Enter keys are interpreted here so real line breaks go into the message.
    cy.intercept({ method: 'POST', url: /\/message\/(send|save)(\?|$)/ }).as('adminSend');
    Admin.messageInput().type(text);
    Admin.sendButton().click();
    cy.wait('@adminSend', { timeout: 30000 }).its('response.statusCode').should('be.oneOf', [200, 201]);

    waitForStaffReply(uid).then((m) => {
      const shown = (m.content || '').replace(/\r\n?/g, '\n');
      expect(shown, 'blank line between paragraphs kept').to.contain('\n\n');
      expect(shown, 'single line break within a paragraph kept').to.contain('line A.\nParagraph two, line B.');
    });
  });

  it('sends a message with special characters, kept as typed', () => {
    const text = `Special ~!@#$%^&*()_+-={}[]|\\:;"',.?/ é ñ € £ © [${RUN}-special]`;
    openComposer();
    sendReply(text);
    waitForStaffReply(`${RUN}-special`).then((m) => expect(m.content).to.contain(text));
  });

  it('sends a message with HTML/script that is not executed and is stripped', () => {
    const uid = `${RUN}-html`;
    openComposer();
    sendReply(`HTML <b>bold</b> <script>window.__adminXss = true</script> [${uid}]`);
    waitForStaffReply(uid).then((m) => {
      expect(m.content, 'tags stripped').to.not.contain('<b>').and.to.not.contain('<script>');
    });
    cy.window().its('__adminXss').should('be.undefined');
  });

  it('sends a message with emoji', () => {
    const uid = `${RUN}-emoji`;
    const text = `Emoji from admin 😀 🎉 👍 [${uid}]`;
    openComposer();
    // cy.type can't enter emoji; set the value the way the field expects.
    Admin.messageInput().invoke('val', text).trigger('input').should('have.value', text);
    cy.intercept({ method: 'POST', url: /\/message\/(send|save)(\?|$)/ }).as('adminSend');
    Admin.sendButton().click();
    cy.wait('@adminSend', { timeout: 30000 }).its('response.statusCode').should('be.oneOf', [200, 201]);
    waitForStaffReply(uid).then((m) => expect(m.content).to.contain('😀'));
  });

  it('sends a message with applicable files (image + pdf)', () => {
    const uid = `${RUN}-files`;
    openComposer();
    sendReply(`Files from admin. [${uid}]`, [ARTWORK, FIXTURES + 'document.pdf']);
    waitForStaffReply(uid).then((m) => {
      expect(m.attachments, 'attachments reached the customer').to.have.length.of.at.least(2);
    });
  });
});
