/**
 * Sign-in page fingerprints.
 *
 * Phishing kits copy the real page's HTML, and reverse-proxy kits (Evilginx,
 * Tycoon 2FA, EvilProxy) serve the real page itself. Either way the field names
 * and ids that a brand's own engineers chose survive the copy. Seeing Google's
 * `identifierId` box on a domain Google does not own is close to proof.
 *
 * Each entry needs `need` of its selectors to match, so one generic id
 * (`#password`, `#email`) can never fire on its own. Verified against the live
 * sign-in pages in November 2026, plus the older layouts kits still clone.
 */
export interface LoginFingerprint {
  /** Brand token from brands.ts. */
  brand: string;
  selectors: string[];
  /** How many selectors must match. */
  need: number;
}

export const LOGIN_FINGERPRINTS: LoginFingerprint[] = [
  // Microsoft: the converged sign-in page and its many clones.
  { brand: 'microsoft', selectors: ['input[name="loginfmt"]', '#i0116', '#i0118', '#idSIButton9', '#lightbox', '#displayName', 'input[name="passwd"]'], need: 2 },
  // Google: identifier-first flow with the hidden password box.
  { brand: 'google', selectors: ['#identifierId', 'input[name="hiddenPassword"]', '#identifierNext', '#passwordNext', 'input[name="Passwd"]'], need: 2 },
  // Apple Account.
  { brand: 'apple', selectors: ['#account_name_text_field', '#password_text_field', '#aid-auth-widget-iFrame', '#sign-in'], need: 2 },
  // PayPal.
  { brand: 'paypal', selectors: ['input[name="login_email"]', 'input[name="login_password"]', '#btnNext', '#btnLogin', '#splitEmail'], need: 2 },
  // Meta: Facebook and Instagram share the login form now.
  // (lsd and jazoest are Meta's own hidden anti-forgery fields; #login_form and
  // name="pass" alone are far too common on ordinary PHP sites to count.)
  { brand: 'facebook', selectors: ['input[name="lsd"]', 'input[name="jazoest"]', '[data-testid="royal_login_button"]', '[data-testid="royal_email"]', '[data-testid="royal_pass"]'], need: 2 },
  // Amazon.
  { brand: 'amazon', selectors: ['#ap_email', '#ap_password', 'form[name="signIn"]', '#ap_login_form', '#ap_email_login', '#signInSubmit'], need: 2 },
  // Netflix.
  { brand: 'netflix', selectors: ['input[name="userLoginId"]', '[data-uia="field-userLoginId"]', '[data-uia="login-field"]', '[data-uia="field-password"]', '[data-uia="password-field"]'], need: 2 },
  // LinkedIn.
  { brand: 'linkedin', selectors: ['input[name="session_key"]', 'input[name="session_password"]'], need: 2 },
  // Dropbox.
  { brand: 'dropbox', selectors: ['input[name="susi_email"]', '[data-testid="susi-email-input"]', '[data-testid="susi-email-continue-button"]'], need: 2 },
  // Adobe.
  { brand: 'adobe', selectors: ['#EmailPage-EmailField', '#EmailForm', '#PasswordPage-PasswordField'], need: 2 },
  // Australian banks.
  { brand: 'commbank', selectors: ['#clientNumber', '#rememberClientNumber', '#prefilledClientNumber', '#txtMyClientNumber_field', '#txtMyPassword_field'], need: 2 },
  { brand: 'anz', selectors: ['#customerRegistrationNumber', 'input[name="customerRegistrationNumber"]'], need: 1 },
  { brand: 'westpac', selectors: ['#fakeusername', 'form#login #password', '#rememberme', '#signin'], need: 3 },
  // Steam.
  { brand: 'steam', selectors: ['#twofactorcode_entry', '#authcode', '#friendlyname'], need: 2 },
];

/**
 * Hosts that serve a brand's own sign-in assets: styles, scripts, logos.
 * Kits hotlink these because it is easier than copying them. Font and
 * captcha hosts are deliberately absent: half the web loads Google Fonts and
 * reCAPTCHA from gstatic.com, and that says nothing about who the page is.
 */
export const BRAND_ASSET_HOSTS: Record<string, string> = {
  'aadcdn.msauth.net': 'microsoft',
  'aadcdn.msftauth.net': 'microsoft',
  'logincdn.msauth.net': 'microsoft',
  'logincdn.msftauth.net': 'microsoft',
  'acctcdn.msauth.net': 'microsoft',
  'acctcdn.msftauth.net': 'microsoft',
  'secure.aadcdn.microsoftonline-p.com': 'microsoft',
  'ssl.gstatic.com': 'google',
  'appleid.cdn-apple.com': 'apple',
  'www.paypalobjects.com': 'paypal',
  'static.xx.fbcdn.net': 'facebook',
  'static.cdninstagram.com': 'instagram',
  'm.media-amazon.com': 'amazon',
  'images-na.ssl-images-amazon.com': 'amazon',
  'assets.nflxext.com': 'netflix',
  'cfl.dropboxstatic.com': 'dropbox',
  'docucdn-a.akamaihd.net': 'docusign',
  'store.fastly.steamstatic.com': 'steam',
  'community.fastly.steamstatic.com': 'steam',
  'static.licdn.com': 'linkedin',
};

/**
 * Addresses written as text on the page where a sign-in pop-up would show its
 * address bar. Browser-in-the-browser kits draw a fake window with one of
 * these in a fake bar, because people check the address.
 */
export const BITB_HOSTS: ReadonlySet<string> = new Set([
  'accounts.google.com', 'login.microsoftonline.com', 'login.live.com', 'appleid.apple.com',
  'account.apple.com', 'www.facebook.com', 'facebook.com', 'www.paypal.com', 'steamcommunity.com',
  'discord.com', 'github.com', 'www.linkedin.com', 'id.atlassian.com', 'login.yahoo.com',
]);
