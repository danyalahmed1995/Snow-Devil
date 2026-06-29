import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDotDashed, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import type { CIWorkflowRun } from '../../ci/ci-watcher';
import { useCIWatcherStore } from '../../stores/ci-watcher-store';
import { useTabsStore } from '../../stores/tabs-store';
import './CIWatcher.css';

function relative(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  return minutes < 1 ? 'now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`;
}
function duration(value?: number): string { if (value == null) return '—'; const minutes = Math.max(1, Math.round(value / 60_000)); return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
function outcome(run: CIWorkflowRun) { return run.status === 'completed' ? run.conclusion ?? 'completed' : run.status.replace(/_/g, ' '); }

export function CIWatcherPanel({ repositoryId, compact = false }: { repositoryId?: string; compact?: boolean }) {
  const runsByRepository = useCIWatcherStore(state => state.runsByRepository);
  const repositoryState = useCIWatcherStore(state => state.repositoryState);
  const subscribe = useCIWatcherStore(state => state.subscribe);
  const unsubscribe = useCIWatcherStore(state => state.unsubscribe);
  const activeAccount = useCIWatcherStore(state => state.activeAccount);
  const [failedOnly, setFailedOnly] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (!repositoryId) return; subscribe(repositoryId); return () => unsubscribe(repositoryId); }, [activeAccount, repositoryId, subscribe, unsubscribe]);
  const runs = useMemo(() => {
    const values = repositoryId ? runsByRepository[repositoryId.toLowerCase()] ?? [] : Object.values(runsByRepository).flat();
    return values.filter(run => !failedOnly || run.conclusion === 'failure').sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [failedOnly, repositoryId, runsByRepository]);
  const shown = runs.slice(0, expanded ? 20 : compact ? 5 : 7);
  const running = runs.filter(run => run.status !== 'completed').length;
  const failed = runs.filter(run => run.conclusion === 'failure').length;
  const passed = runs.filter(run => run.conclusion === 'success').length;
  const scopedState = repositoryId ? repositoryState[repositoryId.toLowerCase()] : undefined;
  const open = (run: CIWorkflowRun) => useTabsStore.getState().openBrowserTab(`github:${run.id}`, 'githubPage', `${run.workflowName} #${run.runNumber}`, run.url, false, true);

  return <section className={`ci-watcher${compact ? ' ci-watcher--compact' : ''}`} aria-label={repositoryId ? `CI Watcher for ${repositoryId}` : 'Account CI Watcher'}>
    <header><div><h2>CI Watch</h2><p>{running} running · {failed} failed · {passed} passed recently</p></div><div><button className={failedOnly ? 'is-active' : ''} onClick={() => setFailedOnly(value => !value)} data-tooltip="Failed only\nFilter the current CI Watch snapshot to failed workflow runs.">Failed only</button><button aria-label="Refresh CI Watcher" data-tooltip="Refresh CI Watcher\nUpdates all currently subscribed repository scopes with one shared scheduler." onClick={() => window.dispatchEvent(new Event('snow-devil:ci-refresh'))}><RefreshCw size={12}/></button></div></header>
    {scopedState && scopedState.status !== 'ready' && runs.length === 0 && <div className="ci-watcher-state"><strong>{scopedState.status.replace(/_/g, ' ')}</strong><span>{scopedState.message ?? 'Workflow runs are loading.'}</span></div>}
    <div className="ci-watcher-list">{shown.map(run => <button key={run.id} className={`ci-run ci-run--${run.conclusion ?? run.status}`} onClick={() => open(run)} data-tooltip={`${run.workflowName} #${run.runNumber}\n${run.repositoryId} · Open the canonical GitHub Actions run in Snow Devil.`}><span className="ci-run-icon">{run.status !== 'completed' ? <CircleDotDashed size={14}/> : run.conclusion === 'success' ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}</span><span><strong>{run.workflowName} <small>#{run.runNumber}</small></strong><small>{run.repositoryId} · {run.pullRequestNumber ? `PR #${run.pullRequestNumber}` : run.branch ?? 'branch unavailable'} · {relative(run.updatedAt)}</small></span><em>{outcome(run)}<small>{duration(run.durationMs)}</small></em><ExternalLink size={11}/></button>)}{shown.length === 0 && (!scopedState || scopedState.status === 'ready') && <div className="ci-watcher-state"><strong>No recent workflow runs</strong><span>GitHub returned no Actions runs for this scope.</span></div>}</div>
    {runs.length > shown.length && <button className="ci-watcher-more" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : `View all ${runs.length}`}</button>}
  </section>;
}
