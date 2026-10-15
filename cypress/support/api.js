// Customer-side API helpers for setting up and verifying preconditions without the customer UI
// (so specs can use the UI only for the thing they actually test — e.g. the admin panel).
// All requests go to the dev API with the headers the customer site sends.

const API = 'https://dev-api.singaprinting.com/index.php/api/';
const HEADERS = {
  Origin: 'https://dev.singaprinting.com',
  Referer: 'https://dev.singaprinting.com/',
  'Request-From': 'client-panel',
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json',
};
const ADMIN_HEADERS = {
  Origin: 'https://dev-admin-panel.singaprinting.com',
  Referer: 'https://dev-admin-panel.singaprinting.com/',
  'Request-From': 'admin-panel',
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json',
};

// Log in a member and yield a Bearer token string.
export const customerLogin = () =>
  cy.env(['MEMBER_EMAIL', 'MEMBER_PASSWORD']).then(({ MEMBER_EMAIL, MEMBER_PASSWORD }) =>
    cy
      .request({ method: 'POST', url: API + 'user/signin', headers: HEADERS, body: { email: MEMBER_EMAIL, password: MEMBER_PASSWORD, remember_me: false } })
      .then((res) => {
        expect(res.body.status, 'member signin').to.equal('SUCCESS');
        return 'Bearer ' + res.body.meta.token;
      })
  );

// Yield the member's most recent order: { id, invoice }.
export const latestOrder = (token) =>
  cy.request({ method: 'GET', url: API + 'mypage/orders?page=1', headers: { ...HEADERS, Authorization: token } }).then((res) => {
    const order = res.body.data.data[0];
    expect(order, 'the member has at least one order').to.exist;
    return { id: order.order_master_id || order.id, invoice: order.invoice_no };
  });

// Yield one of the member's orders whose message thread is short: { id, invoice }.
// The admin panel shows only ~20 messages and returns a different window than the customer, so a
// busy thread hides a just-sent message. The member has many orders with no messages; this picks
// the first with fewer than `max` so the test's own message is reliably visible to admin. As an
// order fills up over many runs it moves on to the next clean one. Checks the first page of orders.
export const orderWithShortThread = (token, max = 12) =>
  cy.request({ method: 'GET', url: API + 'mypage/orders?page=1', headers: { ...HEADERS, Authorization: token } }).then((res) => {
    const orders = res.body.data.data.map((o) => ({ id: o.order_master_id || o.id, invoice: o.invoice_no }));
    expect(orders.length, 'the member has orders').to.be.greaterThan(0);
    const found = {};
    const check = (i) => {
      if (found.order || i >= orders.length) return;
      orderThread(token, orders[i].id).then((thread) => {
        if (thread.length < max) found.order = orders[i];
        else check(i + 1);
      });
    };
    check(0);
    return cy.then(() => {
      expect(found.order, `an order with fewer than ${max} messages`).to.exist;
      return found.order;
    });
  });

// Send a message on an order as the customer; yields nothing.
export const sendCustomerMessage = (token, orderId, text) => {
  const form = new FormData();
  form.append('message', text);
  form.append('order_master_id', orderId);
  return cy
    .request({ method: 'POST', url: API + 'message/send', headers: { ...HEADERS, Authorization: token }, body: form })
    .then((res) => expect(res.status, 'customer message sent').to.be.oneOf([200, 201]));
};

// Yield the order's message thread as an array of { id, content, origin, attachments, ... }.
export const orderThread = (token, orderId) =>
  cy
    .request({ method: 'GET', url: API + `message?order_master_id=${orderId}&minified=1&page=1`, headers: { ...HEADERS, Authorization: token } })
    .then((res) => res.body.data || []);

// Yield the order's message thread as the admin sees it. The admin side can serve a cached/stale
// window, so a cache-bust param is added to force a fresh read; the token is ADMIN_REMEMBER_TOKEN.
export const adminOrderThread = (orderId) =>
  cy.env(['ADMIN_REMEMBER_TOKEN']).then(({ ADMIN_REMEMBER_TOKEN }) =>
    cy
      .request({
        method: 'GET',
        url: API + `message?user_id=4020&order_master_id=${orderId}&minified=1&page=1&_cb=${new Date().getTime()}`,
        headers: { ...ADMIN_HEADERS, Authorization: 'Bearer ' + ADMIN_REMEMBER_TOKEN },
      })
      .then((res) => res.body.data || [])
  );

// Delete one of the customer's own messages.
export const deleteCustomerMessage = (token, messageId) =>
  cy.request({ method: 'PATCH', url: API + 'message/delete', headers: { ...HEADERS, Authorization: token }, body: { message_id: messageId }, failOnStatusCode: false });

// Delete the customer's messages on an order so a test starts from a clean, short thread.
// The admin panel only shows the latest 20 messages, so without this a long thread (built up by
// earlier runs) can hide the message a test just sent. Staff replies can't be deleted by the
// customer, so those remain; keep the suite from running many times against the same order.
export const clearCustomerMessages = (token, orderId) => {
  const pass = (remaining) => {
    if (remaining <= 0) return;
    orderThread(token, orderId).then((thread) => {
      const mine = thread.filter((m) => m.origin === 'client');
      if (!mine.length) return;
      cy.wrap(mine, { log: false }).each((m) => deleteCustomerMessage(token, m.id));
      pass(remaining - 1);
    });
  };
  pass(6); // the thread returns up to 20 at a time; 6 passes clears ~120
};
