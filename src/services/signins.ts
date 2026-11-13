/**
 * Where this person signs in, kept on this computer only.
 *
 * A list of site names and the fingerprint of each site's tab icon, nothing
 * else: no address, no username, no password, no time spent. It never leaves
 * the computer, and Options can switch it off and wipe it.
 */
import { copiedSignInSite, rememberSignIn, type SignInMemory } from '../core/familiar.js';

async function load(): Promise<SignInMemory> {
  const { signInMemory } = await chrome.storage.local.get('signInMemory');
  return (signInMemory ?? {}) as SignInMemory;
}

export async function noteSignIn(domain: string, icon: string): Promise<void> {
  const memory = await load();
  const next = rememberSignIn(memory, domain, icon, Date.now());
  if (next !== memory) await chrome.storage.local.set({ signInMemory: next });
}

export async function siteThisCopies(pageDomain: string, icon: string | null): Promise<string | null> {
  if (!icon) return null;
  return copiedSignInSite(await load(), pageDomain, icon);
}

export async function forgetSignIns(): Promise<void> {
  await chrome.storage.local.remove('signInMemory');
}

export async function signInCount(): Promise<number> {
  return Object.keys(await load()).length;
}
