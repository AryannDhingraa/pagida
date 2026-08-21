/**
 * Brands that phishing kits impersonate, mapped to the domains that legitimately
 * serve them.
 *
 * Two rules use this list:
 *  1. Typosquat detection — is the domain one or two edits away from a brand?
 *  2. Brand-mismatch detection — does the page say "PayPal" while being served
 *     from somewhere that isn't PayPal?
 *
 * Australian brands are included deliberately: locally targeted phishing
 * (myGov, Australia Post, the big four banks) is the campaign type most likely
 * to actually reach an Australian user, and no global list covers it.
 */

export interface Brand {
  /** Lowercase token to look for in page text and in domain labels. */
  token: string;
  /** Registrable domains that are legitimately allowed to serve this brand. */
  domains: string[];
}

export const BRANDS: Brand[] = [
  // --- Australian government & post ---
  { token: 'mygov', domains: ['my.gov.au', 'servicesaustralia.gov.au'] },
  { token: 'medicare', domains: ['servicesaustralia.gov.au', 'medicare.gov'] },
  { token: 'centrelink', domains: ['servicesaustralia.gov.au'] },
  { token: 'auspost', domains: ['auspost.com.au'] },
  { token: 'australiapost', domains: ['auspost.com.au'] },
  { token: 'ato', domains: ['ato.gov.au'] },
  { token: 'linkt', domains: ['linkt.com.au'] },
  { token: 'citylink', domains: ['linkt.com.au', 'transurban.com'] },
  { token: 'myki', domains: ['ptv.vic.gov.au'] },

  // --- Australian banks & finance ---
  { token: 'commbank', domains: ['commbank.com.au'] },
  { token: 'commonwealthbank', domains: ['commbank.com.au'] },
  { token: 'westpac', domains: ['westpac.com.au'] },
  { token: 'nab', domains: ['nab.com.au'] },
  { token: 'anz', domains: ['anz.com', 'anz.com.au'] },
  { token: 'bendigobank', domains: ['bendigobank.com.au'] },
  { token: 'ing', domains: ['ing.com.au', 'ing.com'] },
  { token: 'afterpay', domains: ['afterpay.com'] },
  { token: 'zippay', domains: ['zip.co'] },

  // --- Australian telcos & retail ---
  { token: 'telstra', domains: ['telstra.com.au', 'telstra.com'] },
  { token: 'optus', domains: ['optus.com.au'] },
  { token: 'vodafone', domains: ['vodafone.com.au', 'vodafone.com'] },
  { token: 'coles', domains: ['coles.com.au'] },
  { token: 'woolworths', domains: ['woolworths.com.au'] },
  { token: 'bunnings', domains: ['bunnings.com.au'] },
  { token: 'jbhifi', domains: ['jbhifi.com.au'] },

  // --- Global tech ---
  { token: 'google', domains: ['google.com', 'google.com.au', 'googleapis.com', 'gstatic.com', 'youtube.com'] },
  { token: 'gmail', domains: ['google.com', 'gmail.com'] },
  { token: 'youtube', domains: ['youtube.com', 'google.com'] },
  { token: 'microsoft', domains: ['microsoft.com', 'microsoftonline.com', 'live.com', 'office.com', 'azure.com'] },
  { token: 'office365', domains: ['office.com', 'office365.com', 'microsoft.com', 'microsoftonline.com'] },
  { token: 'outlook', domains: ['live.com', 'outlook.com', 'microsoft.com', 'office.com'] },
  { token: 'onedrive', domains: ['live.com', 'microsoft.com', 'sharepoint.com'] },
  { token: 'sharepoint', domains: ['sharepoint.com', 'microsoft.com'] },
  { token: 'apple', domains: ['apple.com', 'apple.com.au', 'apple.com.cn', 'icloud.com'] },
  { token: 'icloud', domains: ['icloud.com', 'apple.com'] },
  { token: 'amazon', domains: ['amazon.com', 'amazon.com.au', 'amazon.co.uk', 'amazon.in', 'aws.amazon.com'] },
  { token: 'netflix', domains: ['netflix.com', 'netflix.net'] },
  { token: 'spotify', domains: ['spotify.com', 'spotifycdn.com'] },
  { token: 'adobe', domains: ['adobe.com'] },
  { token: 'dropbox', domains: ['dropbox.com', 'dropboxusercontent.com'] },
  { token: 'docusign', domains: ['docusign.com', 'docusign.net'] },
  { token: 'zoom', domains: ['zoom.us', 'zoom.com'] },
  { token: 'slack', domains: ['slack.com'] },
  { token: 'github', domains: ['github.com', 'githubusercontent.com'] },
  { token: 'gitlab', domains: ['gitlab.com'] },
  { token: 'openai', domains: ['openai.com', 'chatgpt.com'] },
  { token: 'chatgpt', domains: ['openai.com', 'chatgpt.com'] },
  { token: 'anthropic', domains: ['anthropic.com', 'claude.ai'] },

  // --- Social ---
  { token: 'facebook', domains: ['facebook.com', 'fb.com', 'meta.com'] },
  { token: 'instagram', domains: ['instagram.com', 'facebook.com'] },
  { token: 'whatsapp', domains: ['whatsapp.com', 'facebook.com'] },
  { token: 'linkedin', domains: ['linkedin.com', 'licdn.com'] },
  { token: 'twitter', domains: ['twitter.com', 'x.com'] },
  { token: 'tiktok', domains: ['tiktok.com', 'tiktokcdn.com'] },
  { token: 'snapchat', domains: ['snapchat.com'] },
  { token: 'discord', domains: ['discord.com', 'discord.gg', 'discordapp.com'] },
  { token: 'telegram', domains: ['telegram.org', 't.me'] },
  { token: 'reddit', domains: ['reddit.com'] },

  // --- Payments & finance (global) ---
  { token: 'paypal', domains: ['paypal.com', 'paypal.com.au'] },
  { token: 'stripe', domains: ['stripe.com'] },
  { token: 'wise', domains: ['wise.com', 'transferwise.com'] },
  { token: 'revolut', domains: ['revolut.com'] },
  { token: 'visa', domains: ['visa.com', 'visa.com.au'] },
  { token: 'mastercard', domains: ['mastercard.com', 'mastercard.com.au'] },
  { token: 'americanexpress', domains: ['americanexpress.com'] },
  { token: 'chase', domains: ['chase.com'] },
  { token: 'wellsfargo', domains: ['wellsfargo.com'] },
  { token: 'bankofamerica', domains: ['bankofamerica.com'] },
  { token: 'hsbc', domains: ['hsbc.com', 'hsbc.co.uk', 'hsbc.com.au'] },
  { token: 'barclays', domains: ['barclays.co.uk', 'barclays.com'] },
  { token: 'santander', domains: ['santander.com', 'santander.co.uk'] },

  // --- Crypto ---
  { token: 'binance', domains: ['binance.com'] },
  { token: 'coinbase', domains: ['coinbase.com'] },
  { token: 'metamask', domains: ['metamask.io'] },
  { token: 'ledger', domains: ['ledger.com'] },
  { token: 'trezor', domains: ['trezor.io'] },
  { token: 'kraken', domains: ['kraken.com'] },

  // --- Shipping & travel ---
  { token: 'dhl', domains: ['dhl.com', 'dhl.com.au'] },
  { token: 'fedex', domains: ['fedex.com'] },
  { token: 'ups', domains: ['ups.com'] },
  { token: 'usps', domains: ['usps.com'] },
  { token: 'royalmail', domains: ['royalmail.com'] },
  { token: 'booking', domains: ['booking.com'] },
  { token: 'airbnb', domains: ['airbnb.com', 'airbnb.com.au'] },
  { token: 'qantas', domains: ['qantas.com', 'qantas.com.au'] },
  { token: 'uber', domains: ['uber.com'] },

  // --- Marketplaces, gaming, misc ---
  { token: 'ebay', domains: ['ebay.com', 'ebay.com.au', 'ebay.co.uk', 'ebay.de', 'ebay.ca'] },
  { token: 'alibaba', domains: ['alibaba.com'] },
  { token: 'aliexpress', domains: ['aliexpress.com'] },
  { token: 'shopify', domains: ['shopify.com'] },
  { token: 'steam', domains: ['steampowered.com', 'steamcommunity.com', 'valvesoftware.com'] },
  { token: 'roblox', domains: ['roblox.com', 'rbxcdn.com'] },
  { token: 'epicgames', domains: ['epicgames.com'] },
  { token: 'playstation', domains: ['playstation.com', 'sonyentertainmentnetwork.com'] },
  { token: 'xbox', domains: ['xbox.com', 'microsoft.com'] },
  { token: 'nintendo', domains: ['nintendo.com'] },

  // --- Education (relevant to a student audience) ---
  { token: 'rmit', domains: ['rmit.edu.au'] },
  { token: 'canvas', domains: ['instructure.com', 'rmit.edu.au'] },
  { token: 'blackboard', domains: ['blackboard.com'] },
];

/** Every legitimate registrable domain across all brands, for fast lookup. */
export const BRAND_DOMAINS: ReadonlySet<string> = new Set(
  BRANDS.flatMap((b) => b.domains),
);

/** Brand tokens, longest first, so `commonwealthbank` matches before `bank`. */
export const BRAND_TOKENS: readonly string[] = BRANDS.map((b) => b.token).sort(
  (a, b) => b.length - a.length,
);

/** Look up which domains are allowed to serve a given brand token. */
export function domainsForToken(token: string): string[] {
  return BRANDS.find((b) => b.token === token)?.domains ?? [];
}
