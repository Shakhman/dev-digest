import type { SmartDiffRole } from '@devdigest/shared';
import { BOILERPLATE_PATTERNS, WIRING_PATTERNS } from './constants.js';

export function classifyFile(path: string): SmartDiffRole {
  if (BOILERPLATE_PATTERNS.some((p) => p.test(path))) return 'boilerplate';
  if (WIRING_PATTERNS.some((p) => p.test(path))) return 'wiring';
  return 'core';
}
