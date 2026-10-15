// Customer messages on an order — a logged-in member opens My Orders, opens the most recent order,
// opens its Messages panel, then tests creating messages (positive and negative cases).
// Site: BASE_URL in cypress/support/config.js
// Run: npx cypress open
//      npx cypress run --spec cypress/e2e/orders/customer-messages.cy.js
//
// Starts logged in via cy.loginByEmail() (MEMBER_EMAIL / MEMBER_PASSWORD in cypress.env.json);
// the login form itself is tested in auth/login-email.cy.js. The account needs at least one order
// (the checkout specs create them). No order is placed.
//
// Rules (from the site's message panel code, Oct 2026): a message needs text that isn't only
// spaces, or at least one file. Files: .doc .docx .xls .xlsx .ppt .pptx .csv .eps .ai .psd .pdf
// .tif .tiff .zip .png .jpg .jpeg, max 4 files / 50 MB total. Blank lines split a message into
// paragraphs; single line breaks are kept.
//
// Every run sends real test messages (tagged with the run id) to that order on the dev site.
// There is no cleanup — they stay in the order's conversation.
//
// One it() per step. testIsolation: false keeps the same browser state across steps; if a step
// fails, the remaining steps are skipped.

import { BASE_URL } from '../../support/config';
import * as Messages from '../../support/pages/orderMessages';

// Tags this run's messages so they can be told apart from earlier runs on the same order.
const RUN = `cy-${Date.now().toString(36)}`;

const SHORT_MESSAGE = `Hello, this is a short test message. [${RUN}]`;
// Paragraphs are separated by a blank line; paragraph 2 also has a single line break.
const PARAGRAPHS = [
  [`Hi team, this is the first paragraph about my artwork. [${RUN}]`],
  ['Second paragraph, line one.', 'Second paragraph, line two.'],
  ['Third paragraph: thank you!'],
];
const SPECIAL_MESSAGE = `Special characters ~!@#$%^&*()_+-={}[]|\\:;"',.?/ é ñ ü € £ © [${RUN}]`;
// The server strips anything that looks like an HTML tag (Oct 2026), so only safety is checked.
const HTML_MESSAGE = `HTML check <b>bold</b> <script>window.__messageXss = true</script> [${RUN}]`;
const EMOJI_MESSAGE = `Emoji check 😀 🎉 👍 ❤️ [${RUN}]`;
const FILES_MESSAGE = `Applicable files attached. [${RUN}]`;

const FIXTURES = 'cypress/fixtures/messages/';
// 600x600 PNG, the same test artwork the cart specs upload.
const ARTWORK_IMAGE = 'cypress/fixtures/artwork/sticker-artwork.png';
const NOT_APPLICABLE_FILES = [
  { label: '.txt', file: FIXTURES + 'document.txt' },
  { label: '.exe', file: FIXTURES + 'malware.exe' },
  { label: '.gif', file: { contents: Cypress.Buffer.from('GIF89a'), fileName: 'animation.gif', mimeType: 'image/gif' } },
];

const firstOrderRow = () => cy.get('.order_list_row', { timeout: 30000 }).first();

// Close any open form, then start a fresh, empty message.
const startNewMessage = () => {
  Messages.panel().then(($panel) => {
    if ($panel.find('form.message-new__form').length) Messages.cancelButton().click();
  });
  Messages.newMessageButton().should('be.visible').click();
  Messages.messageForm().should('be.visible');
  Messages.messageInput().should('have.value', '');
  Messages.filePreviews().should('have.length', 0);
};

// Set the text the way the page's own input handler expects (cy.type can't type emoji).
const pasteMessage = (text) => {
  Messages.messageInput().invoke('val', text).trigger('input').should('have.value', text);
};

const watchSendRequests = () => cy.intercept({ method: 'POST', url: /\/api\/message\/send(\?|$)/ }).as('sendMessage');
const expectNothingSent = () => cy.get('@sendMessage.all').should('have.length', 0);

// Click Send, wait for the site to accept it, and yield the new message bubble.
const sendAndGetMessage = () => {
  watchSendRequests();
  Messages.sendButton().click();
  cy.wait('@sendMessage', { timeout: 60000 }).its('response.body.status').should('eq', 'SUCCESS');
  Messages.messageForm().should('not.exist');
  return Messages.lastSentMessage().should('not.have.class', 'message-pending');
};

describe('Customer messages on an order', { testIsolation: false }, () => {
  let stepFailed = false;
  // Read from the first row of My Orders: { number, path }
  const order = {};

  // testIsolation:false also stops Cypress clearing cookies, so clear them, then log in once.
  before(() => {
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
    cy.clearAllSessionStorage();
    cy.loginByEmail();
  });

  beforeEach(function () {
    if (stepFailed) this.skip();
    cy.viewport(1440, 900);
    // Third-party scripts (analytics, chat widgets) occasionally throw;
    // don't let those fail the test.
    cy.on('uncaught:exception', () => false);
  });

  afterEach(function () {
    if (this.currentTest.state === 'failed') stepFailed = true;
  });

  // --- Open the order's messages ---

  it('opens My Orders and shows the most recent order first', () => {
    cy.visit(BASE_URL + '/mypage/orders');

    firstOrderRow().within(() => {
      cy.get('.order_number_column').invoke('text').should('match', /^\s*\d+\s*$/);
      cy.get('.order_date_column').invoke('text').should('match', /\d{4}\/\d{2}\/\d{2}/);
      cy.get('.order_total_price_column').invoke('text').should('match', /S\$\d/);
      cy.get('.order_status_column .order_list_status').invoke('text').should('match', /\S/);
      cy.get('.order_print_columns a.quote_action').should('have.attr', 'href').and('match', /^\/mypage\/orders\/\d+$/);
    });

    firstOrderRow().then(($row) => {
      order.number = $row.find('.order_number_column').text().trim();
      order.path = $row.find('.order_print_columns a.quote_action').attr('href');
      cy.log(`**First order: ${order.number} (${order.path})**`);
    });
  });

  it('opens the first order', () => {
    firstOrderRow().find('.order_print_columns a.quote_action').click();

    cy.location('pathname', { timeout: 30000 }).should('eq', order.path);
    Messages.messageButton().should('be.visible').and('contain', 'Messages');
  });

  it('clicks the message button and the Messages panel opens for that order', () => {
    Messages.messageButton().click();

    Messages.panel().should('be.visible');
    Messages.panelTitle().should('have.text', `Messages - #${order.number}`);
    Messages.newMessageButton().should('be.visible');
  });

  it('clicks "Create Message" and the message form opens', () => {
    // "Create Message" on a new conversation; "Add Message" / "Respond" once it has messages.
    Messages.newMessageButton().invoke('text').should('match', /^\s*(Create Message|Add Message|Respond)\s*$/);
    startNewMessage();
    Messages.sendButton().should('be.visible');
    Messages.cancelButton().should('be.visible');
  });

  // --- Negative: nothing should be sent ---

  it('does not send an empty message', () => {
    watchSendRequests();
    startNewMessage();
    Messages.sendButton().click();

    Messages.messageRequiredError().should('have.text', 'Your message is required. Please try again.');
    Messages.messageInput().should('have.class', 'g-textarea-main--error');
    expectNothingSent();
  });

  it('does not send a message of only spaces', () => {
    watchSendRequests();
    startNewMessage();
    Messages.messageInput().type('      ');
    Messages.sendButton().click();

    Messages.messageRequiredError().should('have.text', 'Your message is required. Please try again.');
    expectNothingSent();
  });

  NOT_APPLICABLE_FILES.forEach(({ label, file }) => {
    it(`rejects a ${label} file (not an applicable file type)`, () => {
      watchSendRequests();
      startNewMessage();
      Messages.fileInput().selectFile(file, { force: true });

      Messages.fileError().should('have.text', 'Upload failed. Unsupported filetype.');
      Messages.filePreviews().should('have.length', 0);
      expectNothingSent();
    });
  });

  it('rejects more than 4 files', () => {
    startNewMessage();
    Messages.fileInput().selectFile(Array(5).fill(FIXTURES + 'image.png'), { force: true });

    Messages.fileError().should('have.text', 'Maximum number of files exceeded. Only 4 files is allowed.');
    Messages.filePreviews().should('have.length', 0);
  });

  it('rejects files over 50 MB in total', () => {
    startNewMessage();
    // Generated in memory (50 MB + 1 byte) — rejected before anything is uploaded.
    Messages.fileInput().selectFile(
      { contents: Cypress.Buffer.alloc(50 * 1024 * 1024 + 1), fileName: 'oversized.pdf', mimeType: 'application/pdf' },
      { force: true }
    );

    Messages.fileError().should('have.text', 'Maximum total file size exceeded. Only 50 MB total is allowed.');
    Messages.filePreviews().should('have.length', 0);
  });

  it('cancels a message without sending it', () => {
    watchSendRequests();
    startNewMessage();
    Messages.messageInput().type(`This message is cancelled. [${RUN}]`);
    Messages.fileInput().selectFile(FIXTURES + 'image.png', { force: true });
    Messages.filePreviews().should('have.length', 1);

    Messages.cancelButton().click();

    Messages.messageForm().should('not.exist');
    Messages.newMessageButton().should('be.visible');
    expectNothingSent();
    Messages.panel().should('not.contain', 'This message is cancelled.');
  });

  // --- Positive: these are sent ---

  it('sends a short message', () => {
    startNewMessage();
    Messages.messageInput().type(SHORT_MESSAGE);

    sendAndGetMessage().find('.message-content p').should('have.length', 1).and('have.text', SHORT_MESSAGE);
    Messages.lastSentMessage().find('.message-date').invoke('text').should('match', /\S/);
  });

  it('sends a message in paragraphs and keeps its format', () => {
    startNewMessage();
    // {enter} = line break; a blank line between paragraphs.
    Messages.messageInput().type(PARAGRAPHS.map((lines) => lines.join('{enter}')).join('{enter}{enter}'));

    // Checks what the customer sees (innerText follows the displayed line breaks): a blank line
    // between paragraphs and the line break inside paragraph 2. The server stores line breaks as
    // \r\n, so the site shows the paragraphs in one <p>, not one <p> each.
    sendAndGetMessage()
      .find('.message-content')
      .should(($content) => {
        const shown = $content[0].innerText.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
        expect(shown, 'message as displayed').to.equal(PARAGRAPHS.map((lines) => lines.join('\n')).join('\n\n'));
      });
  });

  it('sends a message with special characters, kept exactly as typed', () => {
    startNewMessage();
    Messages.messageInput().type(SPECIAL_MESSAGE, { parseSpecialCharSequences: false });

    sendAndGetMessage().find('.message-content p').should('have.text', SPECIAL_MESSAGE);
  });

  it('sends a message containing HTML and script tags without running them', () => {
    startNewMessage();
    Messages.messageInput().type(HTML_MESSAGE, { parseSpecialCharSequences: false });

    sendAndGetMessage().within(() => {
      cy.get('.message-content').should('contain', 'bold').and('contain', RUN);
      cy.get('.message-content b, .message-content script').should('not.exist');
    });
    cy.window().its('__messageXss').should('be.undefined');
  });

  it('sends a message with emoji', () => {
    startNewMessage();
    pasteMessage(EMOJI_MESSAGE);

    sendAndGetMessage().find('.message-content p').should('have.text', EMOJI_MESSAGE);
  });

  it('sends applicable files, adding more with "Select Files" up to 4', () => {
    startNewMessage();
    Messages.fileInput().selectFile(ARTWORK_IMAGE, { force: true });
    Messages.filePreviews().should('have.length', 1);

    // After the first file, "Select Files" adds more.
    Messages.addMoreFilesButton().should('be.visible').and('contain', 'Select Files');
    Messages.addMoreFilesInput().selectFile(
      [FIXTURES + 'document.pdf', FIXTURES + 'spec-sheet.csv', FIXTURES + 'artwork-files.zip'],
      { force: true }
    );
    Messages.filePreviews().should('have.length', 4);
    Messages.filePreviews()
      .find('figure')
      .then(($figures) => [...$figures].map((f) => f.title))
      .should('deep.equal', ['sticker-artwork.png', 'document.pdf', 'spec-sheet.csv', 'artwork-files.zip']);
    // 4 is the maximum: no way to add more.
    Messages.addMoreFilesButton().should('not.exist');

    // Removing one brings "Select Files" back.
    Messages.removeFileButtons().last().click();
    Messages.filePreviews().should('have.length', 3);
    Messages.addMoreFilesButton().should('be.visible');
    Messages.addMoreFilesInput().selectFile(FIXTURES + 'artwork-files.zip', { force: true });
    Messages.filePreviews().should('have.length', 4);

    Messages.messageInput().type(FILES_MESSAGE);
    sendAndGetMessage().within(() => {
      cy.get('.message-content p').should('have.text', FILES_MESSAGE);
      cy.get('.message-attachments .message-attachment-item').should('have.length', 4);
      // The image is shown from storage, which can take a moment after the upload.
      cy.get('.message-attachment-image', { timeout: 15000 }).should(($img) => {
        expect($img[0].naturalWidth, 'image attachment displayed').to.equal(600);
      });
    });
  });

  it('keeps the sent messages after the page is reloaded', () => {
    cy.reload();
    Messages.messageButton().click();
    Messages.panel().should('be.visible');

    const sentTexts = [SHORT_MESSAGE, PARAGRAPHS[0][0], SPECIAL_MESSAGE, EMOJI_MESSAGE, FILES_MESSAGE];
    Messages.sentMessages().should(($messages) => {
      const all = $messages.text();
      sentTexts.forEach((text) => expect(all, 'conversation').to.contain(text));
    });
    // short, paragraphs, special characters, HTML, emoji, files
    Messages.sentMessages().filter(`:contains("${RUN}")`).should('have.length', 6);
  });
});
