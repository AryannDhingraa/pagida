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
  { token: 'google', domains: ['google.com', 'google.com.au', 'google.co.uk', 'google.co.in', 'google.ca', 'google.de', 'google.fr', 'google.co.nz', 'google.co.jp', 'googleapis.com', 'gstatic.com', 'youtube.com', 'gmail.com', 'google.dev', 'blog.google', 'withgoogle.com', 'googleusercontent.com', 'android.com', 'gemini.google'] },
  { token: 'gmail', domains: ['google.com', 'gmail.com'] },
  { token: 'youtube', domains: ['youtube.com', 'google.com'] },
  { token: 'microsoft', domains: ['microsoft.com', 'microsoftonline.com', 'microsoftonline.us', 'live.com', 'office.com', 'office365.com', 'microsoft365.com', 'azure.com', 'windows.com', 'windows.net', 'bing.com', 'skype.com', 'xbox.com', 'outlook.com', 'onedrive.com', 'sharepoint.com', 'msn.com', 'msauth.net', 'msftauth.net', 'cloud.microsoft', 'microsoftstore.com', 'github.com', 'linkedin.com'] },
  { token: 'office365', domains: ['office.com', 'office365.com', 'microsoft.com', 'microsoftonline.com'] },
  { token: 'outlook', domains: ['live.com', 'outlook.com', 'microsoft.com', 'office.com'] },
  { token: 'onedrive', domains: ['live.com', 'microsoft.com', 'sharepoint.com'] },
  { token: 'sharepoint', domains: ['sharepoint.com', 'microsoft.com'] },
  { token: 'apple', domains: ['apple.com', 'apple.com.au', 'apple.com.cn', 'icloud.com', 'icloud.com.cn', 'me.com', 'mac.com', 'apple.co', 'cdn-apple.com', 'apple.news', 'applepay.com'] },
  { token: 'icloud', domains: ['icloud.com', 'apple.com'] },
  { token: 'amazon', domains: ['amazon.com', 'amazon.com.au', 'amazon.co.uk', 'amazon.in', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.ca', 'amazon.co.jp', 'amazon.com.mx', 'amazon.com.br', 'amazon.nl', 'amazon.se', 'amazon.pl', 'amazon.sg', 'amazon.ae', 'amazon.sa', 'amazon.com.tr', 'amazon.com.be', 'amazon.ie', 'amazon.eg', 'amazonaws.com', 'amazon.dev', 'primevideo.com', 'audible.com', 'audible.com.au', 'audible.co.uk', 'amazon.jobs', 'a2z.com'] },
  { token: 'netflix', domains: ['netflix.com', 'netflix.net', 'nflxext.com', 'nflxso.net', 'nflxvideo.net', 'netflix.ca'] },
  { token: 'spotify', domains: ['spotify.com', 'spotifycdn.com'] },
  { token: 'adobe', domains: ['adobe.com', 'adobe.io', 'adobelogin.com', 'acrobat.com', 'typekit.net', 'behance.net'] },
  { token: 'dropbox', domains: ['dropbox.com', 'dropboxusercontent.com', 'dropboxstatic.com', 'dropbox.tech', 'hellosign.com'] },
  { token: 'docusign', domains: ['docusign.com', 'docusign.net', 'docusign.com.au'] },
  { token: 'zoom', domains: ['zoom.us', 'zoom.com'] },
  { token: 'slack', domains: ['slack.com'] },
  { token: 'github', domains: ['github.com', 'githubusercontent.com'] },
  { token: 'gitlab', domains: ['gitlab.com'] },
  { token: 'openai', domains: ['openai.com', 'chatgpt.com'] },
  { token: 'chatgpt', domains: ['openai.com', 'chatgpt.com'] },
  { token: 'anthropic', domains: ['anthropic.com', 'claude.ai'] },

  // --- Social ---
  { token: 'facebook', domains: ['facebook.com', 'fb.com', 'meta.com', 'instagram.com', 'messenger.com', 'threads.net', 'threads.com', 'whatsapp.com', 'workplace.com', 'oculus.com'] },
  { token: 'instagram', domains: ['instagram.com', 'facebook.com', 'threads.net', 'threads.com', 'meta.com'] },
  { token: 'whatsapp', domains: ['whatsapp.com', 'facebook.com'] },
  { token: 'linkedin', domains: ['linkedin.com', 'licdn.com', 'lnkd.in'] },
  { token: 'twitter', domains: ['twitter.com', 'x.com'] },
  { token: 'tiktok', domains: ['tiktok.com', 'tiktokcdn.com'] },
  { token: 'snapchat', domains: ['snapchat.com'] },
  { token: 'discord', domains: ['discord.com', 'discord.gg', 'discordapp.com'] },
  { token: 'telegram', domains: ['telegram.org', 't.me'] },
  { token: 'reddit', domains: ['reddit.com'] },

  // --- Payments & finance (global) ---
  { token: 'paypal', domains: ['paypal.com', 'paypal.com.au', 'paypal.me', 'paypalobjects.com', 'venmo.com', 'xoom.com', 'braintreegateway.com'] },
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
  { token: 'uber', domains: ['uber.com', 'ubereats.com'] },

  // --- Marketplaces, gaming, misc ---
  { token: 'ebay', domains: ['ebay.com', 'ebay.com.au', 'ebay.co.uk', 'ebay.de', 'ebay.ca', 'ebay.fr', 'ebay.it', 'ebay.es', 'ebay.ie', 'ebay.us', 'ebaystatic.com'] },
  { token: 'alibaba', domains: ['alibaba.com', 'aliexpress.com', 'aliexpress.us', 'alibabacloud.com', 'alipay.com'] },
  { token: 'aliexpress', domains: ['aliexpress.com', 'aliexpress.us', 'aliexpress.ru'] },
  { token: 'shopify', domains: ['shopify.com'] },
  { token: 'steam', domains: ['steampowered.com', 'steamcommunity.com', 'valvesoftware.com', 'steamstatic.com', 'steamgames.com', 'steam.tv'] },
  { token: 'roblox', domains: ['roblox.com', 'rbxcdn.com'] },
  { token: 'epicgames', domains: ['epicgames.com'] },
  { token: 'playstation', domains: ['playstation.com', 'sonyentertainmentnetwork.com'] },
  { token: 'xbox', domains: ['xbox.com', 'microsoft.com'] },
  { token: 'nintendo', domains: ['nintendo.com'] },

  // --- Education (relevant to a student audience) ---
  { token: 'rmit', domains: ['rmit.edu.au'] },
  { token: 'canvas', domains: ['instructure.com', 'rmit.edu.au'] },
  { token: 'blackboard', domains: ['blackboard.com'] },
  // --- v5: more of the brands phishing actually targets (Nov 2026) ---
  // Australian banks, money and payments
  { token: 'bankwest', domains: ['bankwest.com.au'] },
  { token: 'suncorp', domains: ['suncorp.com.au', 'suncorpbank.com.au'] },
  { token: 'macquariebank', domains: ['macquarie.com.au', 'macquarie.com'] },
  { token: 'ubank', domains: ['ubank.com.au'] },
  { token: 'stgeorge', domains: ['stgeorge.com.au'] },
  { token: 'bankofmelbourne', domains: ['bankofmelbourne.com.au'] },
  { token: 'banksa', domains: ['banksa.com.au'] },
  { token: 'beyondbank', domains: ['beyondbank.com.au'] },
  { token: 'greatsouthernbank', domains: ['greatsouthernbank.com.au'] },
  { token: 'mebank', domains: ['mebank.com.au'] },
  { token: 'payid', domains: ['payid.com.au', 'auspayplus.com.au'] },
  { token: 'osko', domains: ['osko.com.au', 'auspayplus.com.au'] },
  { token: 'humm', domains: ['shophumm.com', 'shophumm.com.au'] },
  // Australian government, utilities, tolls, telcos, couriers
  { token: 'servicensw', domains: ['service.nsw.gov.au', 'nsw.gov.au'] },
  { token: 'vicroads', domains: ['vicroads.vic.gov.au', 'vic.gov.au'] },
  { token: 'transportvictoria', domains: ['transport.vic.gov.au', 'vic.gov.au'] },
  { token: 'eastlink', domains: ['eastlink.com.au'] },
  { token: 'agl', domains: ['agl.com.au'] },
  { token: 'energyaustralia', domains: ['energyaustralia.com.au'] },
  { token: 'aussiebroadband', domains: ['aussiebroadband.com.au'] },
  { token: 'iinet', domains: ['iinet.net.au'] },
  { token: 'amaysim', domains: ['amaysim.com.au'] },
  { token: 'startrack', domains: ['startrack.com.au', 'auspost.com.au'] },
  { token: 'couriersplease', domains: ['couriersplease.com.au'] },
  { token: 'aramex', domains: ['aramex.com', 'aramex.com.au'] },
  { token: 'sendle', domains: ['sendle.com'] },
  { token: 'kmart', domains: ['kmart.com.au', 'kmart.com'] },
  { token: 'bigw', domains: ['bigw.com.au'] },
  { token: 'officeworks', domains: ['officeworks.com.au'] },
  { token: 'harveynorman', domains: ['harveynorman.com.au'] },
  { token: 'chemistwarehouse', domains: ['chemistwarehouse.com.au'] },
  { token: 'menulog', domains: ['menulog.com.au'] },
  { token: 'foxtel', domains: ['foxtel.com.au'] },
  { token: 'kayo', domains: ['kayosports.com.au'] },
  { token: 'virginaustralia', domains: ['virginaustralia.com'] },
  { token: 'jetstar', domains: ['jetstar.com'] },
  // Global banks and money
  { token: 'capitalone', domains: ['capitalone.com', 'capitalone.ca', 'capitalone.co.uk'] },
  { token: 'citibank', domains: ['citi.com', 'citibank.com', 'citibank.com.au'] },
  { token: 'usbank', domains: ['usbank.com'] },
  { token: 'scotiabank', domains: ['scotiabank.com'] },
  { token: 'natwest', domains: ['natwest.com'] },
  { token: 'lloyds', domains: ['lloydsbank.com', 'lloydsbankinggroup.com'] },
  { token: 'monzo', domains: ['monzo.com'] },
  { token: 'starlingbank', domains: ['starlingbank.com'] },
  { token: 'venmo', domains: ['venmo.com', 'paypal.com'] },
  { token: 'cashapp', domains: ['cash.app', 'squareup.com'] },
  { token: 'zelle', domains: ['zellepay.com'] },
  { token: 'westernunion', domains: ['westernunion.com'] },
  { token: 'moneygram', domains: ['moneygram.com'] },
  { token: 'klarna', domains: ['klarna.com'] },
  // Crypto
  { token: 'trustwallet', domains: ['trustwallet.com'] },
  { token: 'bybit', domains: ['bybit.com'] },
  { token: 'kucoin', domains: ['kucoin.com'] },
  { token: 'opensea', domains: ['opensea.io'] },
  { token: 'uniswap', domains: ['uniswap.org', 'app.uniswap.org'] },
  { token: 'blockchaincom', domains: ['blockchain.com'] },
  { token: 'cryptocom', domains: ['crypto.com'] },
  { token: 'robinhood', domains: ['robinhood.com'] },
  { token: 'swyftx', domains: ['swyftx.com', 'swyftx.com.au'] },
  { token: 'coinspot', domains: ['coinspot.com.au'] },
  // Mail, cloud, work tools
  { token: 'yahoo', domains: ['yahoo.com', 'yahoo.co.jp', 'yimg.com', 'aol.com'] },
  { token: 'proton', domains: ['proton.me', 'protonmail.com'] },
  { token: 'zoho', domains: ['zoho.com', 'zoho.com.au', 'zoho.eu', 'zohopublic.com'] },
  { token: 'wetransfer', domains: ['wetransfer.com', 'we.tl'] },
  { token: 'webex', domains: ['webex.com', 'cisco.com'] },
  { token: 'okta', domains: ['okta.com', 'oktapreview.com'] },
  { token: 'salesforce', domains: ['salesforce.com', 'force.com', 'my.salesforce.com'] },
  { token: 'xero', domains: ['xero.com'] },
  { token: 'myob', domains: ['myob.com', 'myob.com.au'] },
  { token: 'quickbooks', domains: ['intuit.com', 'quickbooks.com'] },
  { token: 'intuit', domains: ['intuit.com'] },
  { token: 'godaddy', domains: ['godaddy.com'] },
  { token: 'namecheap', domains: ['namecheap.com'] },
  // (No 'cloudflare': its own error and challenge pages appear on millions of
  // customer sites, so its branding says nothing about who runs a page.)
  { token: 'mailchimp', domains: ['mailchimp.com', 'intuit.com'] },
  { token: 'sharefile', domains: ['sharefile.com', 'citrix.com'] },
  { token: 'notion', domains: ['notion.so', 'notion.com', 'notion.site'] },
  { token: 'atlassian', domains: ['atlassian.com', 'atlassian.net', 'jira.com', 'trello.com', 'bitbucket.org'] },
  // Shopping, delivery, travel
  { token: 'walmart', domains: ['walmart.com', 'walmart.ca'] },
  { token: 'bestbuy', domains: ['bestbuy.com', 'bestbuy.ca'] },
  { token: 'costco', domains: ['costco.com', 'costco.com.au', 'costco.ca'] },
  { token: 'etsy', domains: ['etsy.com'] },
  { token: 'temu', domains: ['temu.com'] },
  { token: 'shein', domains: ['shein.com', 'shein.com.au'] },
  { token: 'mercadolibre', domains: ['mercadolibre.com', 'mercadolibre.com.ar', 'mercadolibre.com.mx', 'mercadolibre.cl', 'mercadolivre.com.br'] },
  { token: 'rakuten', domains: ['rakuten.com', 'rakuten.co.jp'] },
  { token: 'flipkart', domains: ['flipkart.com'] },
  { token: 'gumtree', domains: ['gumtree.com.au', 'gumtree.com'] },
  { token: 'doordash', domains: ['doordash.com'] },
  { token: 'deliveroo', domains: ['deliveroo.com', 'deliveroo.co.uk', 'deliveroo.com.au'] },
  { token: 'expedia', domains: ['expedia.com', 'expedia.com.au', 'expedia.co.uk'] },
  { token: 'agoda', domains: ['agoda.com'] },
  { token: 'emirates', domains: ['emirates.com'] },
  { token: 'qatarairways', domains: ['qatarairways.com'] },
  { token: 'singaporeair', domains: ['singaporeair.com'] },
  // Couriers and post, global
  { token: 'canadapost', domains: ['canadapost-postescanada.ca', 'canadapost.ca'] },
  { token: 'nzpost', domains: ['nzpost.co.nz'] },
  { token: 'evri', domains: ['evri.com'] },
  { token: 'dpd', domains: ['dpd.com', 'dpd.co.uk', 'dpd.com.au'] },
  { token: 'postnl', domains: ['postnl.nl', 'postnl.com'] },
  // Government and tax, global
  { token: 'hmrc', domains: ['gov.uk', 'hmrc.gov.uk'] },
  { token: 'internalrevenueservice', domains: ['irs.gov'] },
  { token: 'govuk', domains: ['gov.uk'] },
  { token: 'mygovid', domains: ['mygovid.gov.au', 'myid.gov.au'] },
  { token: 'myid', domains: ['myid.gov.au', 'mygovid.gov.au'] },
  // Telcos, global
  { token: 'verizon', domains: ['verizon.com', 'verizonwireless.com'] },
  { token: 'tmobile', domains: ['t-mobile.com'] },
  // Games
  { token: 'riotgames', domains: ['riotgames.com', 'leagueoflegends.com', 'playvalorant.com'] },
  { token: 'battlenet', domains: ['battle.net', 'blizzard.com'] },
  { token: 'blizzard', domains: ['blizzard.com', 'battle.net'] },
  { token: 'minecraft', domains: ['minecraft.net', 'microsoft.com', 'mojang.com'] },
  { token: 'twitch', domains: ['twitch.tv'] },
  { token: 'eaplay', domains: ['ea.com'] },
  { token: 'ubisoft', domains: ['ubisoft.com', 'ubi.com'] },
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
