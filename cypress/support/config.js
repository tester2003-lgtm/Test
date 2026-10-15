// Site under test - every spec imports this. Change it here to test another environment.
// Note: the specs in cypress/e2e/checkout/ place real orders on this site.


// Test server
export const BASE_URL = 'https://dev.singaprinting.com';
// export const BASE_URL = 'https://dev.stickermarket.co.uk';



// Live Site
// export const BASE_URL = 'https://www.singaprinting.com';


// Admin panel for the same environment as BASE_URL (used by cypress/e2e/admin/).
export const ADMIN_URL = 'https://dev-admin-panel.singaprinting.com';
