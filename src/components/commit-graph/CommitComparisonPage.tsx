import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FileCode2, GitCompareArrows, Plus, Minus } from 'lucide-react';
import { useModeStore } from '../../stores/mode-store';
import { demoComparison, fetchComparison } from '../../commit-graph/data';
import './CommitGraphPage.css';

export function CommitComparisonPage({ repository, baseSha, targetSha }: { repository: string; baseSha: string; targetSha: string }) {
  const mode = useModeStore(state => state.mode);
  const query = useQuery({ queryKey: ['commit-graph', 'compare', repository.toLowerCase(), baseSha, targetSha], queryFn: () => mode === 'demo' ? demoComparison(baseSha, targetSha) : fetchComparison(repository, baseSha, targetSha), staleTime: 10 * 60 * 1000 });
  if (query.isLoading) return <div className="commit-compare-state">Loading comparison…</div>;
  if (query.error || !query.data) return <div className="commit-compare-state is-error"><strong>Comparison unavailable</strong><span>{String(query.error)}</span><button onClick={() => void query.refetch()}>Retry</button></div>;
  const value = query.data;
  return <div className="commit-compare"><header><div><span>Read-only commit comparison</span><h1><GitCompareArrows size={19}/>Compare {baseSha.slice(0, 7)}…{targetSha.slice(0, 7)}</h1><p>{repository}</p></div><div className="commit-compare__refs"><code>{baseSha.slice(0, 12)}</code><ArrowRight size={15}/><code>{targetSha.slice(0, 12)}</code></div></header><section className="commit-compare__metrics"><article><strong>{value.totalCommits}</strong><span>commits</span></article><article><strong>{value.files.length}</strong><span>files</span></article><article className="is-add"><Plus size={13}/><strong>{value.additions}</strong><span>additions</span></article><article className="is-delete"><Minus size={13}/><strong>{value.deletions}</strong><span>deletions</span></article><article><strong>{value.status}</strong><span>relationship</span></article></section><div className="commit-compare__body"><aside><h2>Commits between</h2>{value.commits.length ? value.commits.map(commit => <article key={commit.sha}><code>{commit.shortSha}</code><strong>{commit.message}</strong><span>{commit.author.name}</span></article>) : <p>No intervening commits were returned.</p>}</aside><main><h2>Changed files</h2>{value.files.map(file => <article key={file.filename}><header><FileCode2 size={14}/><strong>{file.filename}</strong><span>{file.status} · <b>+{file.additions}</b> <i>−{file.deletions}</i></span></header>{file.patch ? <pre>{file.patch}</pre> : <p>Patch preview unavailable for this file.</p>}</article>)}</main></div></div>;
}
