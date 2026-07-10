/**
 * Parser for `git worktree list --porcelain` output.
 *
 * Porcelain format (one block per worktree, blocks separated by blank lines):
 *
 *   worktree <path>
 *   HEAD <sha>
 *   branch <ref>   |  detached  |  bare
 *   locked [reason]              (optional)
 *   prunable [reason]            (optional)
 *
 * The first block in the output is always the main (primary) worktree.
 *
 * References:
 *  - https://git-scm.com/docs/git-worktree#_porcelain_format
 */

import type { WorktreeInfo } from './worktree-types';
import { branchShortName, worktreeDisplayPath } from './worktree-identity';

/**
 * Parses the output of `git worktree list --porcelain` into an array of WorktreeInfo objects.
 *
 * @param output - Raw stdout string from `git worktree list --porcelain`
 * @returns Array of WorktreeInfo; empty array for empty/whitespace-only output.
 */
export function parseWorktreePorcelain(output: string): WorktreeInfo[] {
  if (!output || !output.trim()) return [];

  const results: WorktreeInfo[] = [];

  // Split into blocks separated by one or more blank lines (handles \r\n and \n)
  const blocks = output
    .split(/(?:\r?\n){2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  let isFirst = true;

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const info = parseBlock(lines, isFirst);
    if (info) {
      results.push(info);
      isFirst = false;
    }
  }

  return results;
}

function parseBlock(lines: string[], isMain: boolean): WorktreeInfo | null {
  let worktreePath: string | null = null;
  let headSha: string | null = null;
  let branchRef: string | null = null;
  let isDetached = false;
  let isBare = false;
  let isLocked = false;
  let lockedReason: string | null = null;
  let isPrunable = false;
  let prunableReason: string | null = null;

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      worktreePath = line.slice('worktree '.length).trim();
    } else if (line.startsWith('HEAD ')) {
      headSha = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ')) {
      branchRef = line.slice('branch '.length).trim();
    } else if (line === 'detached') {
      isDetached = true;
    } else if (line === 'bare') {
      isBare = true;
    } else if (line.startsWith('locked')) {
      isLocked = true;
      const reason = line.slice('locked'.length).trim();
      lockedReason = reason || null;
    } else if (line.startsWith('prunable')) {
      isPrunable = true;
      const reason = line.slice('prunable'.length).trim();
      prunableReason = reason || null;
    }
  }

  if (!worktreePath) return null;

  const displayPath = worktreeDisplayPath(worktreePath);
  const branch = branchShortName(branchRef);

  return {
    // Rust returns the canonical path; use it directly as the identity key.
    worktreeId: worktreePath,
    canonicalPath: worktreePath,
    displayPath,
    branch,
    branchRef,
    headSha,
    isMain,
    isDetached,
    isBare,
    isLocked,
    lockedReason,
    isPrunable,
    prunableReason,
  };
}
