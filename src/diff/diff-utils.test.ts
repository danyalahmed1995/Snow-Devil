import { describe, expect, it } from 'vitest';
import { collapseUnchanged, parseUnifiedDiff, syntaxParts } from './diff-utils';

describe('diff normalization', () => {
  it('tracks files, line numbers, and totals', () => {
    const [file] = parseUnifiedDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n same');
    expect(file.newPath).toBe('a.ts'); expect(file.additions).toBe(1); expect(file.deletions).toBe(1);
    expect(file.lines[file.lines.length - 1]).toMatchObject({ oldNumber: 2, newNumber: 2 });
  });
  it('recognizes rename, binary, generated, and vendored metadata',()=>{const files=parseUnifiedDiff('diff --git a/old.png b/dist/new.png\nsimilarity index 100%\nrename from old.png\nrename to dist/new.png\ndiff --git a/vendor/a.bin b/vendor/a.bin\nBinary files a/vendor/a.bin and b/vendor/a.bin differ');expect(files[0]).toMatchObject({status:'renamed',similarity:100,generated:true});expect(files[1]).toMatchObject({status:'binary',binary:true,vendored:true})});
  it('collapses long context and emits syntax parts',()=>{const lines=Array.from({length:12},(_,index)=>({kind:'context' as const,text:`const value = ${index};`}));expect(collapseUnchanged(lines).some(line=>line.collapsedCount===6)).toBe(true);expect(syntaxParts('const value = "snow";','a.ts').map(part=>part.kind).filter(Boolean)).toEqual(['keyword','string'])});
});
