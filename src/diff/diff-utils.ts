export interface DiffLine { kind: 'context' | 'add' | 'remove' | 'meta'; text: string; oldNumber?: number; newNumber?: number }
export interface DiffFile { oldPath: string; newPath: string; lines: DiffLine[]; additions: number; deletions: number }

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  let oldNumber = 0;
  let newNumber = 0;
  for (const text of diff.split('\n')) {
    if (text.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(text);
      current = { oldPath: match?.[1] ?? '', newPath: match?.[2] ?? '', lines: [], additions: 0, deletions: 0 };
      files.push(current);
    } else if (current && text.startsWith('@@')) {
      const hunk = /-(\d+)(?:,\d+)? \+(\d+)/.exec(text);
      oldNumber = Number(hunk?.[1] ?? 0); newNumber = Number(hunk?.[2] ?? 0);
      current.lines.push({ kind: 'meta', text });
    } else if (current && text.startsWith('+') && !text.startsWith('+++')) {
      current.lines.push({ kind: 'add', text: text.slice(1), newNumber: newNumber++ }); current.additions++;
    } else if (current && text.startsWith('-') && !text.startsWith('---')) {
      current.lines.push({ kind: 'remove', text: text.slice(1), oldNumber: oldNumber++ }); current.deletions++;
    } else if (current && !text.startsWith('index ') && !text.startsWith('---') && !text.startsWith('+++')) {
      current.lines.push({ kind: 'context', text: text.startsWith(' ') ? text.slice(1) : text, oldNumber: oldNumber++, newNumber: newNumber++ });
    }
  }
  return files;
}
