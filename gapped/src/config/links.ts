/**
 * Every public web page the app links to, in one place.
 *
 * Hosted on GitHub Pages from the repo's gh-pages branch (built from
 * docs/PRIVACY.md, docs/TERMS.md and site/ by scripts/build-legal-pages.mjs).
 * gapped.app is not used: it is a password-protected WordPress, and App Review
 * rejects a privacy link that lands on a login page.
 *
 * Contact goes through SUPPORT_URL rather than a mailto: the support page
 * carries the contact address, so it can change without an app release.
 */

const SITE = 'https://tobymci71-netizen.github.io/gapped';

export const PRIVACY_URL = `${SITE}/privacy/`;
export const TERMS_URL = `${SITE}/terms/`;
export const SUPPORT_URL = `${SITE}/support/`;
export const ACKNOWLEDGEMENTS_URL = `${SITE}/acknowledgements/`;

/** The App Store listing, for the update-required screen. */
export const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6818595522';
