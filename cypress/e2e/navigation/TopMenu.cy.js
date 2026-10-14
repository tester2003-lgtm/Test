// Navigation & general — Top menu dropdowns (Stickers, Business Card,
// Badges & Magnets, Get Samples).
// Site: BASE_URL in cypress/support/config.js
// Run: npx cypress run --spec cypress/e2e/navigation/TopMenu.cy.js
//
// The product lists below mirror the live menu (Oct 2026). Update them when the
// catalogue changes — a mismatch means a product was added, removed or renamed.

import { BASE_URL } from '../../support/config';

const DROPDOWNS = [
  {
    menu: 'STICKERS',
    viewAll: '/custom/stickers',
    tabs: [
      { tab: 'Paper Based', items: ['Art Paper', 'Classic Paper', 'Kraft Paper'] },
      {
        tab: 'Vinyl Based',
        items: ['Bumper', 'Standard Vinyl', 'PVC', 'Transparent', 'Gold Vinyl', 'Silver Vinyl', 'Custom Decals', 'Vinyl Lettering'],
      },
      { tab: 'Special Stickers', items: ['Foil Paper', 'Hologram', 'Embossed Paper', 'Dome'] },
      { tab: 'Supply', items: ['Die Cut', 'Kiss Cut', 'Sheet', 'Roll'] },
    ],
    clickThrough: { item: 'Art Paper', path: '/stickers/paper/art', h1: /Art Paper/i },
  },
  {
    menu: 'BUSINESS CARD',
    viewAll: '/business-cards',
    tabs: [
      { tab: 'Type', items: ['Standard', 'Premium', 'Hang Tags'] },
      { tab: 'Material', items: ['Standard Matte 250gsm', 'Royal Extra White 400gsm', 'Vintage Kraft 300gsm'] },
    ],
    clickThrough: { item: 'Premium', path: '/business-cards/premium-business-card', h1: /Premium/i },
  },
  {
    menu: 'BADGES & MAGNETS',
    viewAll: '/badges-and-magnets',
    tabs: [
      { tab: 'Badges', items: ['Button Badges', 'Mirror Badges', 'Magnetic Badges'] },
      { tab: 'Magnets', items: ['Custom Magnets'] },
    ],
    clickThrough: { item: 'Button Badges', path: '/badges/button-badge', h1: /Button Badge/i },
  },
];

// --- Selectors ---

const navLink = (text) => cy.contains('nav.nav_menu a.nav_link', text);
const dropdown = () => cy.get('.nav_modal_container');
const tabs = () => cy.get('.nav_modal_container .nav_head a');
const visibleItems = () => cy.get('.nav_modal_container .nav_sec > a:visible');
const itemName = (a) => Cypress.$(a).find('.nav_item_heading').text().trim();

// --- Helpers ---

const visitHome = () => {
  cy.visit(BASE_URL);
  // Nav links are javascript:; until the Nuxt app has mounted — clicking earlier does nothing.
  cy.window().should((win) => {
    expect(win.$nuxt && win.$nuxt._isMounted, 'Nuxt app mounted').to.equal(true);
  });
  cy.get('nav.nav_menu').should('be.visible');
};

const openDropdown = (menu) => {
  navLink(menu).click();
  dropdown().should('have.class', 'visible');
  cy.get('.nav_modal_container .nav_head').should('be.visible');
};

const expectDropdownClosed = () => {
  dropdown().should('not.have.class', 'visible');
  cy.get('.nav_modal_container .nav_head').should('not.be.visible');
};

describe('Navigation & general - Top menu dropdowns', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.on('uncaught:exception', () => false);
    visitHome();
  });

  DROPDOWNS.forEach(({ menu, viewAll, tabs: tabList, clickThrough }) => {
    describe(menu, () => {
      it('opens a dropdown with the expected tabs and a View All link', () => {
        openDropdown(menu);
        navLink(menu).should('have.class', 'active');

        tabs()
          .then(($tabs) => $tabs.map((i, a) => a.textContent.trim()).get())
          .should('deep.equal', [...tabList.map((t) => t.tab), 'View All']);
        tabs().first().should('have.class', 'active');
        cy.contains('.nav_modal_container .nav_head a', 'View All').should('have.attr', 'href', viewAll);
      });

      it('shows the expected products under each tab', () => {
        openDropdown(menu);

        tabList.forEach(({ tab, items }) => {
          cy.contains('.nav_modal_container .nav_head a', tab).click().should('have.class', 'active');

          visibleItems().should(($items) => {
            expect($items.map((i, a) => itemName(a)).get(), `${tab} products`).to.deep.equal(items);
          });

          visibleItems().each(($a) => {
            expect($a.attr('href'), `${itemName($a)} link`).to.match(/^\/[\w-]/);
            const price = $a.find('small').text().trim();
            if (price) expect(price, `${itemName($a)} price`).to.match(/^starts at S\$\d/);
            cy.wrap($a)
              .find('figure img')
              .should(($img) => {
                expect($img[0].naturalWidth, `${itemName($a)} thumbnail loaded`).to.be.greaterThan(0);
              });
          });
        });
      });

      it(`opens the product page when "${clickThrough.item}" is clicked`, () => {
        openDropdown(menu);

        visibleItems()
          .filter((i, a) => itemName(a) === clickThrough.item)
          .should('have.length', 1)
          .click();

        cy.location('pathname', { timeout: 30000 }).should('eq', clickThrough.path);
        cy.get('h1', { timeout: 30000 }).first().should('be.visible').invoke('text').should('match', clickThrough.h1);
      });

      it('closes the dropdown with the close button', () => {
        openDropdown(menu);

        cy.get('.nav_modal_container a.modal_close').click();
        expectDropdownClosed();
      });
    });
  });

  it('switches the dropdown content when another menu item is clicked', () => {
    openDropdown('STICKERS');
    cy.contains('.nav_modal_container .nav_head a', 'Paper Based').should('be.visible');

    openDropdown('BUSINESS CARD');
    navLink('BUSINESS CARD').should('have.class', 'active');
    navLink('STICKERS').should('not.have.class', 'active');
    cy.contains('.nav_modal_container .nav_head a', 'Type').should('be.visible');
    cy.contains('.nav_modal_container .nav_head a', 'Paper Based').should('not.exist');
  });

  it('GET SAMPLES has no dropdown and opens the sample pack page', () => {
    navLink('GET SAMPLES').should('have.attr', 'href', '/sample-pack').click();

    cy.location('pathname', { timeout: 30000 }).should('eq', '/sample-pack');
    cy.contains('h1', 'Sticker Sample Pack', { timeout: 30000 }).should('be.visible');
  });
});
