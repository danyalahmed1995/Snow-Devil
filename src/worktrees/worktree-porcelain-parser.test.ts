import { describe, it, expect } from 'vitest';
import { parseWorktreePorcelain } from './worktree-porcelain-parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a porcelain block from named parts, joining with '\n'
 * and blocks separated by '\n\n'.
 */
function block(lines: string[]): string {
  return lines.join('\n');
}

function join(...blocks: string[]): string {
  return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MAIN_SHA = 'abc1234567890000000000000000000000000001';
const SECONDARY_SHA = 'def4567890000000000000000000000000000002';
const DETACHED_SHA = 'cafe0000000000000000000000000000000000ba';

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('parseWorktreePorcelain', () => {
  it('returns empty array for empty string', () => {
    expect(parseWorktreePorcelain('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseWorktreePorcelain('   \n  \n  ')).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Single main worktree
  // -------------------------------------------------------------------------

  it('parses a single main worktree with a branch', () => {
    const output = block([
      'worktree /home/user/my-app',
      `HEAD ${MAIN_SHA}`,
      'branch refs/heads/main',
    ]);
    const result = parseWorktreePorcelain(output);
    expect(result).toHaveLength(1);
    const [wt] = result;
    expect(wt.worktreeId).toBe('/home/user/my-app');
    expect(wt.canonicalPath).toBe('/home/user/my-app');
    expect(wt.displayPath).toBe('/home/user/my-app');
    expect(wt.headSha).toBe(MAIN_SHA);
    expect(wt.branchRef).toBe('refs/heads/main');
    expect(wt.branch).toBe('main');
    expect(wt.isMain).toBe(true);
    expect(wt.isDetached).toBe(false);
    expect(wt.isBare).toBe(false);
    expect(wt.isLocked).toBe(false);
    expect(wt.lockedReason).toBeNull();
    expect(wt.isPrunable).toBe(false);
    expect(wt.prunableReason).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Two worktrees: main + secondary
  // -------------------------------------------------------------------------

  it('parses two worktrees and marks only the first as isMain', () => {
    const output = join(
      block([
        'worktree /home/user/my-app',
        `HEAD ${MAIN_SHA}`,
        'branch refs/heads/main',
      ]),
      block([
        'worktree /home/user/my-app-feat',
        `HEAD ${SECONDARY_SHA}`,
        'branch refs/heads/feat/awesome',
      ]),
    );
    const result = parseWorktreePorcelain(output);
    expect(result).toHaveLength(2);
    expect(result[0].isMain).toBe(true);
    expect(result[0].branch).toBe('main');
    expect(result[1].isMain).toBe(false);
    expect(result[1].branch).toBe('feat/awesome');
    expect(result[1].branchRef).toBe('refs/heads/feat/awesome');
  });

  // -------------------------------------------------------------------------
  // Detached HEAD
  // -------------------------------------------------------------------------

  it('parses a detached HEAD worktree', () => {
    const output = block([
      'worktree /home/user/my-app-detached',
      `HEAD ${DETACHED_SHA}`,
      'detached',
    ]);
    const [wt] = parseWorktreePorcelain(output);
    expect(wt.isDetached).toBe(true);
    expect(wt.branchRef).toBeNull();
    expect(wt.branch).toBeNull();
    expect(wt.headSha).toBe(DETACHED_SHA);
  });

  // -------------------------------------------------------------------------
  // Bare worktree
  // -------------------------------------------------------------------------

  it('parses a bare worktree', () => {
    const output = block([
      'worktree /home/user/my-app.git',
      'HEAD 0000000000000000000000000000000000000000',
      'bare',
    ]);
    const [wt] = parseWorktreePorcelain(output);
    expect(wt.isBare).toBe(true);
    expect(wt.isDetached).toBe(false);
    expect(wt.branch).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Locked with reason
  // -------------------------------------------------------------------------

  it('parses a locked worktree with a reason', () => {
    const output = block([
      'worktree /home/user/my-app-locked',
      `HEAD ${SECONDARY_SHA}`,
      'branch refs/heads/hotfix',
      'locked Checked out on CI server',
    ]);
    const [wt] = parseWorktreePorcelain(output);
    expect(wt.isLocked).toBe(true);
    expect(wt.lockedReason).toBe('Checked out on CI server');
    expect(wt.branch).toBe('hotfix');
  });

  // -------------------------------------------------------------------------
  // Locked without reason
  // -------------------------------------------------------------------------

  it('parses a locked worktree without a reason', () => {
    const output = block([
      'worktree /home/user/my-app-locked',
      `HEAD ${SECONDARY_SHA}`,
      'branch refs/heads/hotfix',
      'locked',
    ]);
    const [wt] = parseWorktreePorcelain(output);
    expect(wt.isLocked).toBe(true);
    expect(wt.lockedReason).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Prunable with reason
  // -------------------------------------------------------------------------

  it('parses a prunable worktree with a reason', () => {
    const output = block([
      'worktree /home/user/my-app-old',
      `HEAD ${SECONDARY_SHA}`,
      'branch refs/heads/old-branch',
      'prunable gitdir file points to non-existent location',
    ]);
    const [wt] = parseWorktreePorcelain(output);
    expect(wt.isPrunable).toBe(true);
    expect(wt.prunableReason).toBe('gitdir file points to non-existent location');
  });

  // -------------------------------------------------------------------------
  // Prunable without reason
  // -------------------------------------------------------------------------

  it('parses a prunable worktree without a reason', () => {
    const output = block([
      'worktree /home/user/my-app-old',
      `HEAD ${SECONDARY_SHA}`,
      'branch refs/heads/old-branch',
      'prunable',
    ]);
    const [wt] = parseWorktreePorcelain(output);
    expect(wt.isPrunable).toBe(true);
    expect(wt.prunableReason).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Windows paths with spaces and backslashes
  // -------------------------------------------------------------------------

  it('handles Windows paths with spaces and backslashes', () => {
    // Rust will pass canonical Windows paths (backslash separators)
    const winPath = 'C:\\Users\\John Doe\\My Projects\\my-app';
    const output = block([
      `worktree ${winPath}`,
      `HEAD ${MAIN_SHA}`,
      'branch refs/heads/main',
    ]);
    const [wt] = parseWorktreePorcelain(output);
    expect(wt.worktreeId).toBe(winPath);
    expect(wt.canonicalPath).toBe(winPath);
    // Display path normalizes backslashes
    expect(wt.displayPath).toBe('C:/Users/John Doe/My Projects/my-app');
    expect(wt.branch).toBe('main');
  });

  it('handles Windows extended-length paths (\\\\?\\\\) with spaces', () => {
    const winPath = '\\\\?\\C:\\Users\\John Doe\\repos\\my-app';
    const output = block([
      `worktree ${winPath}`,
      `HEAD ${MAIN_SHA}`,
      'branch refs/heads/feature/x',
    ]);
    const [wt] = parseWorktreePorcelain(output);
    expect(wt.worktreeId).toBe(winPath);
    // Display path strips \\?\\ prefix
    expect(wt.displayPath).toBe('C:/Users/John Doe/repos/my-app');
    expect(wt.branch).toBe('feature/x');
  });

  // -------------------------------------------------------------------------
  // Unicode paths
  // -------------------------------------------------------------------------

  it('handles Unicode characters in paths and branch names', () => {
    const unicodePath = '/home/用户/仓库/我的应用';
    const output = block([
      `worktree ${unicodePath}`,
      `HEAD ${MAIN_SHA}`,
      'branch refs/heads/功能/新特性',
    ]);
    const [wt] = parseWorktreePorcelain(output);
    expect(wt.worktreeId).toBe(unicodePath);
    expect(wt.displayPath).toBe(unicodePath);
    expect(wt.branch).toBe('功能/新特性');
  });

  // -------------------------------------------------------------------------
  // isMain: only first block
  // -------------------------------------------------------------------------

  it('marks only the first block as isMain regardless of content', () => {
    const output = join(
      block([
        'worktree /repos/main',
        `HEAD ${MAIN_SHA}`,
        'branch refs/heads/main',
      ]),
      block([
        'worktree /repos/feat-a',
        `HEAD ${SECONDARY_SHA}`,
        'branch refs/heads/feat-a',
      ]),
      block([
        'worktree /repos/feat-b',
        `HEAD ${DETACHED_SHA}`,
        'detached',
      ]),
    );
    const result = parseWorktreePorcelain(output);
    expect(result).toHaveLength(3);
    expect(result[0].isMain).toBe(true);
    expect(result[1].isMain).toBe(false);
    expect(result[2].isMain).toBe(false);
  });

  // -------------------------------------------------------------------------
  // CRLF line endings
  // -------------------------------------------------------------------------

  it('handles CRLF line endings', () => {
    const output =
      `worktree /home/user/repo\r\nHEAD ${MAIN_SHA}\r\nbranch refs/heads/main\r\n\r\nworktree /home/user/repo-2\r\nHEAD ${SECONDARY_SHA}\r\nbranch refs/heads/dev\r\n`;
    const result = parseWorktreePorcelain(output);
    expect(result).toHaveLength(2);
    expect(result[0].branch).toBe('main');
    expect(result[1].branch).toBe('dev');
  });

  // -------------------------------------------------------------------------
  // Mixed flags: locked + prunable
  // -------------------------------------------------------------------------

  it('parses a worktree that is both locked and prunable', () => {
    const output = block([
      'worktree /home/user/my-app-weird',
      `HEAD ${SECONDARY_SHA}`,
      'branch refs/heads/temp',
      'locked manual lock',
      'prunable stale gitdir',
    ]);
    const [wt] = parseWorktreePorcelain(output);
    expect(wt.isLocked).toBe(true);
    expect(wt.lockedReason).toBe('manual lock');
    expect(wt.isPrunable).toBe(true);
    expect(wt.prunableReason).toBe('stale gitdir');
  });

  // -------------------------------------------------------------------------
  // Blocks with missing worktree line (should be skipped)
  // -------------------------------------------------------------------------

  it('skips malformed blocks that are missing the worktree line', () => {
    const output = join(
      block([
        `HEAD ${MAIN_SHA}`,
        'branch refs/heads/main',
      ]),
      block([
        'worktree /repos/good',
        `HEAD ${SECONDARY_SHA}`,
        'branch refs/heads/dev',
      ]),
    );
    const result = parseWorktreePorcelain(output);
    // The malformed block is skipped; only the good one survives
    expect(result).toHaveLength(1);
    expect(result[0].worktreeId).toBe('/repos/good');
    // The good block is now the first, so isMain === true
    expect(result[0].isMain).toBe(true);
  });

  // -------------------------------------------------------------------------
  // tags ref prefix
  // -------------------------------------------------------------------------

  it('strips refs/tags/ prefix for tag-based checkouts', () => {
    const output = block([
      'worktree /repos/tagged',
      `HEAD ${MAIN_SHA}`,
      'branch refs/tags/v2.0.0',
    ]);
    const [wt] = parseWorktreePorcelain(output);
    expect(wt.branch).toBe('v2.0.0');
    expect(wt.branchRef).toBe('refs/tags/v2.0.0');
  });
});
