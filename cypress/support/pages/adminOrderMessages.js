// Page object for the admin panel's order "Messages" panel, on /order-v2/<order id>.
// Selectors checked against the live dev admin panel, Oct 2026.
// Used by cypress/e2e/admin/order-messages.cy.js.

import { ADMIN_URL } from '../config';

export const openOrder = (orderId) => cy.visit(ADMIN_URL + '/order-v2/' + orderId);

// Tabs above the order: Details | History | Notes | Messages. The Messages tab is <h6 class="messages">.
export const messagesTab = () => cy.get('h6.messages', { timeout: 30000 });

// The sliding panel that opens from the right.
export const panel = () => cy.get('.sliding_modal.active .nm_panel', { timeout: 20000 });
export const panelTitle = () => panel().find('.nm_panel__title');

// Messages from the customer vs from staff (admin). Staff rows are any row that isn't a client row.
export const clientMessages = (opts) => panel().find('.nm_thread .nm_row--client', opts);
export const staffMessages = (opts) => panel().find('.nm_thread .nm_row', opts).not('.nm_row--client');
export const messageText = ($row) => Cypress.$($row).find('.nm_bubble__text').text();

// Reply: opens the compose form. The label is "RESPOND" when the customer sent the last message,
// "ADD MESSAGE" when staff did, and "CREATE MESSAGE" for a brand-new conversation.
export const addMessageButton = () => panel().contains('a, button', /respond|add message|create message/i);
export const composeForm = () => panel().find('.nm_compose form');
export const messageInput = () => composeForm().find('textarea.nm_textarea');
// Files: same types as the customer side, max 4 / 50 MB.
export const fileInput = () => composeForm().find('.nm_dropzone input[type="file"]');
export const sendButton = () => composeForm().contains('button.nm_btn--primary', 'SEND MESSAGE');
export const cancelButton = () => composeForm().contains('button.nm_btn--outline', 'CANCEL');

// Validation states on the compose form.
export const inputHasError = () => messageInput().should('have.class', 'has-error');
export const dropzoneError = () => composeForm().find('.nm_dropzone--error');
// Warning toast shown for file errors (appears ~3s, top-level, not inside the panel).
export const warningToast = () => cy.get('.toast_div.warning', { timeout: 10000 });
export const filePreviews = () => composeForm().find('.nm_thumb');
export const addMoreFilesInput = () => composeForm().find('.nm_compose__select-more input[type="file"], label.nm_select-more input[type="file"]');
