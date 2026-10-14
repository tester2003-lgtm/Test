// Navigation & general — Homepage loads (banner, menu, footer).
// Site: BASE_URL in cypress/support/config.js
// Run: npx cypress run --spec cypress/e2e/navigation/Homepage.cy.js

import { BASE_URL } from '../../support/config';

const NAV_LINKS = [
  { text: 'STICKERS' },
  { text: 'BUSINESS CARD' },
  { text: 'BADGES & MAGNETS' },
  { text: 'GET SAMPLES', href: '/sample-pack' },
];

const BANNER_USPS = [
  'Lowest Price Guarantee',
  'Free Shipping Singapore Wide',
  'Fast Turnaround Time',
];

const FOOTER_HEADINGS = ['My Account', 'Support', 'User Guide', 'Tools', 'Products'];

const FOOTER_LEGAL_LINKS = [
  { text: 'Terms of Service', href: '/terms-and-condition' },
  { text: 'Privacy Policy', href: '/privacy-policy' },
  { text: 'Site Map', href: '/sitemap' },
];

const expectImageLoaded = ($img) => {
  expect($img[0].naturalWidth, `${$img.attr('alt') || $img.attr('src')} naturalWidth`).to.be.greaterThan(0);
};

describe('Navigation & general - Homepage', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.on('uncaught:exception', () => false);
  });

  it('responds with HTTP 200 and has the expected page title', () => {
    cy.request(BASE_URL).its('status').should('eq', 200);
    cy.visit(BASE_URL);
    cy.title().should('contain', 'Sticker Printing');
  });

  it('shows the header menu: logo, nav links, search, account and cart', () => {
    cy.visit(BASE_URL);

    cy.get('header.header--').should('be.visible').within(() => {
      cy.get('a.logo_holder')
        .should('have.attr', 'href', '/')
        .find('img[alt="SingaPrinting"]')
        .should('be.visible')
        .and(expectImageLoaded);

      cy.get('nav.nav_menu').should('be.visible');
      NAV_LINKS.forEach(({ text, href }) => {
        cy.contains('nav.nav_menu a.nav_link', text)
          .should('be.visible')
          .then(($a) => {
            if (href) expect($a).to.have.attr('href', href);
          });
      });

      cy.get('a.icon_search[aria-label="Search"]').should('be.visible');
      cy.get('a.icon_myaccount[aria-label="My Account"]').should('be.visible');
      cy.get('#view_cart_item[aria-label="View Cart"]').should('be.visible');
    });
  });

  // Slides and their CTA wording ("View Details", "Learn More", ...) change with
  // promotions, so only structure is checked: a heading and an internal link per slide.
  it('shows the hero banner with a visible slide, a link on every slide and slide arrows', () => {
    cy.visit(BASE_URL);

    cy.get('section.banner_container').should('be.visible');

    cy.get('.banner_container .carousel_item').should('have.length.at.least', 1).each(($slide) => {
      cy.wrap($slide).find('h2').invoke('text').should('match', /\S/);
      cy.wrap($slide).find('a[href^="/"]').should('have.length.at.least', 1);
    });

    cy.get('.banner_container .carousel_item.active').should('have.length', 1).and('be.visible');

    cy.get('a.carousel_banner_prev[aria-label="Previous Slide"]').should('exist');
    cy.get('a.carousel_banner_next[aria-label="Next Slide"]').should('exist');

    BANNER_USPS.forEach((usp) => {
      cy.contains('.banner_bottom .bnr_content_title', usp).should('be.visible');
    });
  });

  it('shows the footer: logo, contact details, sitemap sections and legal links', () => {
    cy.visit(BASE_URL);

    cy.get('footer.footer').scrollIntoView().should('be.visible').within(() => {
      cy.get('.logo_container img[alt="SingaPrinting"]')
        .should('be.visible')
        .and(($img) => expectImageLoaded($img));

      cy.get('.address_container')
        .should('contain', '+65 3158 2800')
        .and('contain', 'Singapore 486066');
      cy.get('.address_container a[href="mailto:info@singaprinting.com"]').should('be.visible');

      FOOTER_HEADINGS.forEach((heading) => {
        cy.contains('.sitemap h3', heading).should('be.visible');
      });
      cy.get('.sitemap .product_links a').should('have.length.at.least', 10);

      cy.get('.copyright').should('contain', 'GLOPHICS LIMITED').and('contain', 'All Rights Reserved');
      FOOTER_LEGAL_LINKS.forEach(({ text, href }) => {
        cy.contains('.copyright_links a', text).should('have.attr', 'href', href);
      });
    });
  });
});
