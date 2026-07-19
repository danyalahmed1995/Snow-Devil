import { memo, useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronDown, ChevronRight, FileCode2, GitCompareArrows, Plus, Minus } from 'lucide-react';
import { useModeStore } from '../../stores/mode-store';
import { demoComparison, fetchComparison } from '../../commit-graph/data';
import type { CommitComparison, CommitGraphFile } from '../../commit-graph/types';
import './CommitGraphPage.css';
import './CommitComparisonPerformance.css';

export const COMPARE_PATCH_PREVIEW_LINE_LIMIT = 800;
export const COMPARE_PATCH_PREVIEW_CHAR_LIMIT = 120_000;

export function boundedPatchPreview(patch: string): { text: string; truncated: boolean } {
  const lines = patch.split('\n');
  const lineBounded = lines.length > COMPARE_PATCH_PREVIEW_LINE_LIMIT ? lines.slice(0, COMPARE_PATCH_PREVIEW_LINE_LIMIT).join('\n') : patch;
  const text = lineBounded.length > COMPARE_PATCH_PREVIEW_CHAR_LIMIT ? lineBounded.slice(0, COMPARE_PATCH_PREVIEW_CHAR_LIMIT) : lineBounded;
  return { text, truncated: text.length < patch.length };
}

export type DiffLineKind = 'addition' | 'removal' | 'hunk' | 'metadata' | 'context';

export function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('diff --git ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) return 'metadata';
  if (line.startsWith('+')) return 'addition';
  if (line.startsWith('-')) return 'removal';
  return 'context';
}

function PatchPreview({ text }: { text: string }) {
  const lines = useMemo(() => text.split('\n'), [text]);
  return <pre data-testid="compare-file-patch" className="commit-compare__patch"><code>{lines.map((line, index) => { const kind = diffLineKind(line); return <span key={index} className={`commit-compare__diff-line is-${kind}`}>{line || '\u00a0'}</span>; })}</code></pre>;
}

const FileComparison = memo(function FileComparison({ file, expanded, onToggle }: { file: CommitGraphFile; expanded: boolean; onToggle: (path: string) => void }) {
  const preview = useMemo(() => expanded && file.patch ? boundedPatchPreview(file.patch) : undefined, [expanded, file.patch]);
  return <article className={expanded ? 'is-expanded' : ''}>
    <button className="commit-compare__file-toggle" type="button" aria-expanded={expanded} onClick={() => onToggle(file.filename)}>
      {expanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<FileCode2 size={14}/><strong>{file.filename}</strong><span>{file.status} · <b>+{file.additions}</b> <i>−{file.deletions}</i></span>
    </button>
    {expanded && (preview ? <><PatchPreview text={preview.text}/>{preview.truncated && <p className="commit-compare__truncated">Preview limited to {COMPARE_PATCH_PREVIEW_LINE_LIMIT} lines or {Math.round(COMPARE_PATCH_PREVIEW_CHAR_LIMIT / 1000)}k characters for responsive scrolling.</p>}</> : <p>Patch preview unavailable for this file.</p>)}
  </article>;
});

function CommitComparisonContent({ value, repository, baseSha, targetSha }: { value: CommitComparison; repository: string; baseSha: string; targetSha: string }) {
  const [expandedPath, setExpandedPath] = useState<string | undefined>(() => value.files[0]?.filename);
  const togglePath = useCallback((path: string) => setExpandedPath(current => current === path ? undefined : path), []);
  return <div className="commit-compare"><header><div><span>Read-only commit comparison</span><h1><GitCompareArrows size={19}/>Compare {baseSha.slice(0, 7)}…{targetSha.slice(0, 7)}</h1><p>{repository}</p></div><div className="commit-compare__refs"><code>{baseSha.slice(0, 12)}</code><ArrowRight size={15}/><code>{targetSha.slice(0, 12)}</code></div></header><section className="commit-compare__metrics"><article><strong>{value.totalCommits}</strong><span>commits</span></article><article><strong>{value.files.length}</strong><span>files</span></article><article className="is-add"><Plus size={13}/><strong>{value.additions}</strong><span>additions</span></article><article className="is-delete"><Minus size={13}/><strong>{value.deletions}</strong><span>deletions</span></article><article><strong>{value.status}</strong><span>relationship</span></article></section><div className="commit-compare__body"><aside><h2>Commits between</h2>{value.commits.length ? value.commits.map(commit => <article key={commit.sha}><code>{commit.shortSha}</code><strong>{commit.message}</strong><span>{commit.author.name}</span></article>) : <p>No intervening commits were returned.</p>}</aside><main><h2>Changed files <small>· select a file to inspect its patch</small></h2>{value.files.map(file => <FileComparison key={file.filename} file={file} expanded={expandedPath === file.filename} onToggle={togglePath}/>)}</main></div></div>;
}

export function CommitComparisonPage({ repository, baseSha, targetSha }: { repository: string; baseSha: string; targetSha: string }) {
  const mode = useModeStore(state => state.mode);
  const query = useQuery({ queryKey: ['commit-graph', 'compare', repository.toLowerCase(), baseSha, targetSha], queryFn: () => mode === 'demo' ? demoComparison(baseSha, targetSha) : fetchComparison(repository, baseSha, targetSha), staleTime: 10 * 60 * 1000 });
  if (query.isLoading) return <div className="commit-compare-state">Loading comparison…</div>;
  if (query.error || !query.data) return <div className="commit-compare-state is-error"><strong>Comparison unavailable</strong><span>{String(query.error)}</span><button onClick={() => void query.refetch()}>Retry</button></div>;
  return <CommitComparisonContent key={`${repository}:${baseSha}:${targetSha}`} value={query.data} repository={repository} baseSha={baseSha} targetSha={targetSha}/>;
}
