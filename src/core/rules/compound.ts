/**
 * Compound rules — combinations that mean much more together than apart.
 *
 * A brand-new domain is mildly interesting. A password box is completely normal.
 * A password box on a domain registered last Tuesday is the phishing archetype,
 * and the engine should say so louder than the sum of the two parts.
 */
import type { Rule, Signal } from '../types.js';
import { parseHost } from '../util/domain.js';
import { BRAND_DOMAINS } from '../data/index.js';

const sig = (s: Signal): Signal => s;

export const newDomainAskingForPassword: Rule = (e) => {
  const age = e.domainAgeDays;
  if (age === undefined || age === null || age > 30) return null;
  if (!e.dom?.hasPasswordField) return null;
  return sig({
    id: 'compound_new_domain_credential_form',
    title: 'Brand-new site asking for a password',
    detail: `This domain is ${age} days old and it wants your credentials. That combination is the single most reliable phishing pattern there is.`,
    tier: 'dom',
    weight: 20,
  });
};

export const impersonationWithCredentialForm: Rule = (e) => {
  if (!e.dom?.hasPasswordField) return null;
  const tokens = e.dom.brandTokens;
  if (tokens.length === 0) return null;
  const { registrableDomain } = parseHost(e.hostname);
  if (BRAND_DOMAINS.has(registrableDomain)) return null;
  return sig({
    id: 'compound_impersonation_credential_form',
    title: 'Sign-in page for a brand that does not own this site',
    detail: `A ${tokens[0]} sign-in form is being served from ${registrableDomain}. Do not enter your ${tokens[0]} password here.`,
    tier: 'dom',
    weight: 22,
  });
};

export const COMPOUND_RULES: Rule[] = [
  newDomainAskingForPassword,
  impersonationWithCredentialForm,
];
