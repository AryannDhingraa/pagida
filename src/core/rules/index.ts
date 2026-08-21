import type { Rule } from '../types.js';
import { URL_RULES } from './url.js';
import { DOM_RULES } from './dom.js';
import { REPUTATION_RULES } from './reputation.js';
import { COMPOUND_RULES } from './compound.js';

export * from './url.js';
export * from './dom.js';
export * from './reputation.js';
export * from './compound.js';

/** Every rule the engine knows about, in evaluation order. */
export const ALL_RULES: Rule[] = [
  ...URL_RULES,
  ...DOM_RULES,
  ...REPUTATION_RULES,
  ...COMPOUND_RULES,
];

export { URL_RULES, DOM_RULES, REPUTATION_RULES, COMPOUND_RULES };
