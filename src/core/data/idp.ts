/**
 * Sign-in providers that legitimately receive a password typed on someone
 * else's page. A form on acme.com posting to acme.okta.com or
 * acme.auth0.com is federated sign-in, not credential theft.
 *
 * Deliberately NOT here: form backends and messaging APIs (formspree.io,
 * getform.io, api.telegram.org, discord.com webhooks). Those are where
 * phishing kits send what they steal.
 */
export const IDENTITY_PROVIDERS: ReadonlySet<string> = new Set([
  'okta.com', 'oktapreview.com', 'okta-emea.com', 'auth0.com', 'onelogin.com',
  'microsoftonline.com', 'live.com', 'microsoft.com', 'azure.com', 'b2clogin.com', 'ciamlogin.com',
  'google.com', 'apple.com', 'amazoncognito.com', 'amazon.com', 'clerk.accounts.dev', 'clerk.com',
  'stytch.com', 'workos.com', 'authkit.app', 'pingidentity.com', 'pingone.com', 'duosecurity.com',
  'salesforce.com', 'force.com', 'my.salesforce.com', 'kinde.com', 'fusionauth.io', 'descope.com',
  'cloudflareaccess.com', 'jumpcloud.com', 'cyberark.cloud',
  'shopify.com', 'atlassian.com', 'github.com', 'gitlab.com', 'paypal.com', 'stripe.com',
]);

export function isIdentityProvider(registrableDomain: string): boolean {
  return IDENTITY_PROVIDERS.has(registrableDomain);
}
