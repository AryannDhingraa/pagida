/**
 * Rules that use context: this person's own history with a site, how they got
 * to it, and where the page lives. None of it leaves the computer.
 */
import type { Rule, Signal } from '../types.js';
import { asksForSecret } from '../identity.js';

const sig = (s: Signal): Signal => s;

/** Online form builders: anyone can make a form here in a minute. */
export const FORM_BUILDER = /^(?:docs\.google\.com\/forms|forms\.gle|forms\.office\.com|forms\.zohopublic\.com|(?:form\.|www\.)?jotform\.com|(?:www\.)?typeform\.com|tally\.so|(?:www\.)?formstack\.com|(?:[\w-]+\.)?wufoo\.com)/;

export function onFormBuilder(hostname: string, path: string): boolean {
  return FORM_BUILDER.test(`${hostname}${path}`);
}

/** A sign-in page you have never visited, opened from a link in an email. */
export const firstVisitFromEmail: Rule = (e) => {
  if (!e.arrival?.fromEmail || !e.history?.firstVisit || !asksForSecret(e)) return null;
  return sig({
    id: 'first_visit_from_email',
    title: 'Opened from an email, on a site you have never used',
    detail: 'You reached this page from a link in an email, it asks for something private, and you have not been here before. Real services rarely need you to sign in somewhere new from an email.',
    tier: 'dom',
    weight: 12,
  });
};

/** A password asked for in an online form, which is never what forms are for. */
export const passwordInForm: Rule = (e) => {
  if (!e.dom?.formAsksPassword || !e.dom.formAsksEmail) return null;
  if (!onFormBuilder(e.hostname, e.path)) return null;
  return sig({
    id: 'password_in_online_form',
    title: 'An online form asking for your password',
    detail: 'This is a form anyone can make in a minute, and it asks for your email and password. Google, Microsoft and every other form service tell you never to put a password in one.',
    tier: 'dom',
    weight: 40,
  });
};

export const CONTEXT_RULES: Rule[] = [firstVisitFromEmail, passwordInForm];
