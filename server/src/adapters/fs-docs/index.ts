import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve, sep, isAbsolute, relative } from 'node:path';
import type { FsDocs } from '@devdigest/shared';

/**
 * Clone-root-confined FsDocs implementation using node:fs.
 *
 * Security invariants (AC-12):
 *  - Reject absolute relPath or any containing `..` segments.
 *  - realpath-confine: after joining, resolve the real path and assert it
 *    starts with realpath(rootPath) + sep (or equals it exactly).
 *  - Walk is cycle-safe: track visited real directory paths and skip already-seen
 *    ones so symlink cycles inside the clone don't loop forever.
 *  - Skip `.git` and `node_modules` to bound walk depth.
 *  - readdir called with `withFileTypes: true, recursive: false` for portability.
 */
export class NodeFsDocs implements FsDocs {
  async walkMarkdown(rootPath: string, roots: string[]): Promise<{ path: string }[]> {
    // Resolve (and check existence of) the root.
    let realRoot: string;
    try {
      realRoot = await realpath(rootPath);
    } catch {
      // Clone not present — degrade to empty list (AC-3).
      return [];
    }

    const results: { path: string }[] = [];
    const visitedDirs = new Set<string>();

    for (const root of roots) {
      const dirAbs = join(realRoot, root);
      await this._walkDir(realRoot, dirAbs, visitedDirs, results);
    }

    return results;
  }

  async readWithinRoot(rootPath: string, relPath: string): Promise<string | null> {
    // Reject absolute paths or `..` traversal.
    if (isAbsolute(relPath)) return null;
    if (relPath.includes('..')) return null;

    let realRoot: string;
    try {
      realRoot = await realpath(rootPath);
    } catch {
      return null;
    }

    const candidate = resolve(realRoot, relPath);

    // Resolve any symlinks on the candidate.
    let realCandidate: string;
    try {
      realCandidate = await realpath(candidate);
    } catch {
      // Missing or unreadable.
      return null;
    }

    // Confine to clone root.
    if (!realCandidate.startsWith(realRoot + sep) && realCandidate !== realRoot) {
      return null;
    }

    try {
      const buf = await readFile(realCandidate, 'utf8');
      return buf;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------

  private async _walkDir(
    realRoot: string,
    dirAbs: string,
    visitedDirs: Set<string>,
    results: { path: string }[],
  ): Promise<void> {
    // Resolve the directory itself to detect symlinks / cycles.
    let realDir: string;
    try {
      realDir = await realpath(dirAbs);
    } catch {
      // Directory doesn't exist — skip.
      return;
    }

    // Confine: must be inside the clone root.
    if (!realDir.startsWith(realRoot + sep) && realDir !== realRoot) {
      return;
    }

    // Cycle guard.
    if (visitedDirs.has(realDir)) return;
    visitedDirs.add(realDir);

    let entries: Dirent[];
    try {
      entries = (await readdir(dirAbs, { withFileTypes: true })) as Dirent[];
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name as string;
      // Skip common noise dirs.
      if (name === '.git' || name === 'node_modules') continue;

      const childAbs = join(dirAbs, name);

      if (entry.isDirectory()) {
        await this._walkDir(realRoot, childAbs, visitedDirs, results);
      } else if (entry.isSymbolicLink()) {
        // Resolve the symlink target before deciding what to do.
        let realTarget: string;
        try {
          realTarget = await realpath(childAbs);
        } catch {
          continue; // Dangling symlink.
        }

        // Confine: symlink target must be inside the clone root.
        if (!realTarget.startsWith(realRoot + sep) && realTarget !== realRoot) {
          continue; // Escape attempt — skip.
        }

        // Check what the resolved target is.
        let targetStat;
        try {
          targetStat = await stat(realTarget);
        } catch {
          continue;
        }

        if (targetStat.isDirectory()) {
          await this._walkDir(realRoot, realTarget, visitedDirs, results);
        } else if (targetStat.isFile() && realTarget.endsWith('.md')) {
          const rel = relative(realRoot, realTarget);
          results.push({ path: rel });
        }
      } else if (entry.isFile() && name.endsWith('.md')) {
        const rel = relative(realRoot, childAbs);
        results.push({ path: rel });
      }
    }
  }
}
