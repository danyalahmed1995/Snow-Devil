/**
 * Pure utility functions for worktree identity and path handling.
 * No imports from other modules — safe to use anywhere.
 */

/**
 * Produces a stable identity key from a raw canonical path.
 * Normalizes Windows extended prefix and case for reliable Map lookups.
 *
 * @example
 * canonicalWorktreeId('\\\\?\\C:\\Projects\\my-app') // => 'c:/projects/my-app'
 * canonicalWorktreeId('C:\\Projects\\my-app')       // => 'c:/projects/my-app'
 * canonicalWorktreeId('/home/user/repo')            // => '/home/user/repo'
 */
export function canonicalWorktreeId(rawPath: string): string {
  // Strip Windows \\?\ extended prefix
  let normalized = rawPath.startsWith('\\\\?\\') ? rawPath.slice(4) : rawPath;
  // Normalize separators to forward slash
  normalized = normalized.replace(/\\\\/g, '/').replace(/\\/g, '/');
  // Lowercase for case-insensitive comparison on Windows (harmless on Unix)
  return normalized.toLowerCase();
}

/**
 * Returns a readable display path (strips \\?\ prefix, normalizes separators to forward slashes).
 * Preserves original casing (unlike canonicalWorktreeId).
 *
 * @example
 * worktreeDisplayPath('\\\\?\\C:\\Projects\\my-app') // => 'C:/Projects/my-app'
 * worktreeDisplayPath('C:\\Projects\\my-app')        // => 'C:/Projects/my-app'
 */
export function worktreeDisplayPath(canonicalPath: string | undefined | null): string {
  if (!canonicalPath) return '';
  let normalized = canonicalPath.startsWith('\\\\?\\')
    ? canonicalPath.slice(4)
    : canonicalPath;
  return normalized.replace(/\\\\/g, '/').replace(/\\/g, '/');
}

/**
 * Extracts the short branch name from a full git ref.
 *
 * @example
 * branchShortName('refs/heads/main')     // => 'main'
 * branchShortName('refs/heads/feat/x')  // => 'feat/x'
 * branchShortName('refs/tags/v1.0.0')   // => 'v1.0.0'
 * branchShortName('main')               // => 'main'  (pass-through for bare names)
 * branchShortName(null)                 // => null
 * branchShortName(undefined)            // => null
 * branchShortName('')                   // => null
 */
export function branchShortName(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (ref.startsWith('refs/heads/')) return ref.slice('refs/heads/'.length);
  if (ref.startsWith('refs/tags/')) return ref.slice('refs/tags/'.length);
  return ref;
}

/**
 * Derives a friendly display name for a worktree.
 * Uses branch name if available, otherwise the last segment of the display path.
 *
 * @example
 * friendlyNameFromBranch('feat/my-feature', '/home/user/repos/my-app-feat') // => 'feat/my-feature'
 * friendlyNameFromBranch(null, 'C:/repos/my-app-worktree')                   // => 'my-app-worktree'
 * friendlyNameFromBranch(null, '')                                            // => ''
 */
export function friendlyNameFromBranch(
  branch: string | null,
  displayPath: string,
): string {
  if (branch) return branch;
  const segments = displayPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments[segments.length - 1] ?? displayPath;
}

/**
 * Checks that a *relative* path does not escape the worktree root via traversal.
 * Returns `true` if safe, `false` if the path attempts to escape.
 *
 * This is a client-side quick check; the Rust backend performs the authoritative check.
 *
 * @example
 * isRelativePathSafe('src/main.ts')   // => true
 * isRelativePathSafe('../secret')     // => false
 * isRelativePathSafe('a/../../b')     // => false
 * isRelativePathSafe('.')             // => true
 * isRelativePathSafe('')              // => true
 */
export function isRelativePathSafe(relativePath: string): boolean {
  if (!relativePath) return true;
  const parts = relativePath.replace(/\\/g, '/').split('/');
  let depth = 0;
  for (const part of parts) {
    if (part === '..') {
      depth--;
      if (depth < 0) return false;
    } else if (part !== '.' && part !== '') {
      depth++;
    }
  }
  return true;
}

/**
 * Returns true if two raw worktree paths refer to the same worktree
 * using case-insensitive canonical comparison.
 */
export function sameWorktree(a: string, b: string): boolean {
  return canonicalWorktreeId(a) === canonicalWorktreeId(b);
}
