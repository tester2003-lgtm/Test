// Page object for the order "Messages" panel on /mypage/orders/<order_master_id>.
// Selectors and rules checked against the live dev site and its code, Oct 2026.
// Used by cypress/e2e/orders/customer-messages.cy.js.

// "Messages" link on the order summary page.
export const messageButton = () => cy.get('a[aria-label="Send a message"]', { timeout: 30000 }).first();

// Sliding panel that opens from the right; its title is "Messages - #<invoice number>".
export const panel = () => cy.get('.slider_container.slide_modal.active .message_slider', { timeout: 20000 });
export const panelTitle = () => panel().find('.slider_header h3');
export const closeButton = () => panel().find('a.slider_close');

// Opens the form. Its label depends on the conversation: "Create Message" (no messages yet),
// "Add Message" (last message was ours) or "Respond" (last message was from staff).
export const newMessageButton = () => panel().find('.message-new__toggle button', { timeout: 20000 });

export const messageForm = () => panel().find('form.message-new__form');
export const messageInput = () => messageForm().find('textarea.g-textarea-main');
// Shown under the text box when Send is clicked with no text (or only spaces) and no file.
export const messageRequiredError = () => messageForm().find('p.g-textarea-error');
export const sendButton = () => messageForm().contains('button[type="submit"]', 'Send Message');
export const cancelButton = () => messageForm().contains('button', 'Cancel');

// Files: .doc .docx .xls .xlsx .ppt .pptx .csv .eps .ai .psd .pdf .tif .tiff .zip .png .jpg .jpeg,
// max 4 files / 50 MB total. The first input is the big drop zone; after the first file a smaller
// "Select Files" input adds more, until there are 4.
export const fileInput = () => messageForm().find('.message-new__dropzone input[type="file"]');
export const addMoreFilesInput = () => messageForm().find('label.message-new__select-more input[type="file"]');
export const addMoreFilesButton = () => messageForm().find('label.message-new__select-more');
export const filePreviews = () => messageForm().find('.message-new__preview');
export const removeFileButtons = () => messageForm().find('button.message-new__preview-remove');
// File errors disappear after 4 seconds.
export const fileError = () => messageForm().find('p.message-new__error');

// Conversation: our messages are .message-sent, staff replies .message-received. A message being
// sent has .message-pending until the server answers.
export const sentMessages = () => panel().find('.messaging-layout .message-item.message-sent');
export const lastSentMessage = () => sentMessages().last();
