import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from './diff-utils';

describe('diff normalization', () => {
  it('tracks files, line numbers, and totals', () => {
    const [file] = parseUnifiedDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n same');
    expect(file.newPath).toBe('a.ts'); expect(file.additions).toBe(1); expect(file.deletions).toBe(1);
    expect(file.lines[file.lines.length - 1]).toMatchObject({ oldNumber: 2, newNumber: 2 });
  });
});
