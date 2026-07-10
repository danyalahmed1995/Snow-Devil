import { describe, it, expect } from 'vitest';
import type { WorktreeInfo } from './worktree-types';

describe('Rust to TypeScript serialization contract', () => {
  it('correctly matches a main worktree', () => {
    // Exact JSON string that the Rust backend would serialize
    const rustJson = `{
      "worktreeId": "\\\\\\\\?\\\\D:\\\\AI Work\\\\Snow-Devil",
      "canonicalPath": "\\\\\\\\?\\\\D:\\\\AI Work\\\\Snow-Devil",
      "displayPath": "D:/AI Work/Snow-Devil",
      "headSha": "a1b2c3d4e5f6",
      "branch": "main",
      "branchRef": "refs/heads/main",
      "isMain": true,
      "isDetached": false,
      "isBare": false,
      "isLocked": false,
      "lockedReason": null,
      "isPrunable": false,
      "prunableReason": null
    }`;

    const parsed: WorktreeInfo = JSON.parse(rustJson);

    expect(parsed.worktreeId).toBe('\\\\?\\D:\\AI Work\\Snow-Devil');
    expect(parsed.canonicalPath).toBe('\\\\?\\D:\\AI Work\\Snow-Devil');
    expect(parsed.displayPath).toBe('D:/AI Work/Snow-Devil');
    expect(parsed.headSha).toBe('a1b2c3d4e5f6');
    expect(parsed.branch).toBe('main');
    expect(parsed.isMain).toBe(true);
    expect(parsed.isDetached).toBe(false);
  });

  it('correctly matches a detached HEAD worktree', () => {
    const rustJson = `{
      "worktreeId": "\\\\\\\\?\\\\D:\\\\AI Work\\\\Snow-Devil-Detached",
      "canonicalPath": "\\\\\\\\?\\\\D:\\\\AI Work\\\\Snow-Devil-Detached",
      "displayPath": "D:/AI Work/Snow-Devil-Detached",
      "headSha": "abcdef123456",
      "branch": null,
      "branchRef": null,
      "isMain": false,
      "isDetached": true,
      "isBare": false,
      "isLocked": false,
      "lockedReason": null,
      "isPrunable": false,
      "prunableReason": null
    }`;

    const parsed: WorktreeInfo = JSON.parse(rustJson);
    expect(parsed.branch).toBeNull();
    expect(parsed.isDetached).toBe(true);
  });

  it('correctly matches locked and prunable worktrees', () => {
    const rustJson = `{
      "worktreeId": "/tmp/locked-worktree",
      "canonicalPath": "/tmp/locked-worktree",
      "displayPath": "/tmp/locked-worktree",
      "headSha": "123456",
      "branch": "feat/lock",
      "branchRef": "refs/heads/feat/lock",
      "isMain": false,
      "isDetached": false,
      "isBare": false,
      "isLocked": true,
      "lockedReason": "locked by admin",
      "isPrunable": true,
      "prunableReason": "gitdir points to non-existent location"
    }`;

    const parsed: WorktreeInfo = JSON.parse(rustJson);
    expect(parsed.isLocked).toBe(true);
    expect(parsed.lockedReason).toBe("locked by admin");
    expect(parsed.isPrunable).toBe(true);
    expect(parsed.prunableReason).toBe("gitdir points to non-existent location");
  });
});
