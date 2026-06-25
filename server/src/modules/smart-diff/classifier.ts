import type { SmartDiffRole } from '@devdigest/shared';
import { BOILERPLATE_PATTERNS, WIRING_PATTERNS } from './constants.js';

export function classifyFile(rawPath: string): SmartDiffRole {
  // Trim any whitespace / \r that may survive round-trips through GitHub API
  // responses or DB storage — trailing chars break $-anchored regexes.
  const path = rawPath.trim();
  if (BOILERPLATE_PATTERNS.some((p) => p.test(path))) return 'boilerplate';
  if (WIRING_PATTERNS.some((p) => p.test(path))) return 'wiring';
  return 'core';
}
