import { useEffect, useMemo, useState, type RefObject } from 'react';
import { CheckCircle2, CircleDotDashed, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import type { SimulatorEntityState } from '../../../simulator/simulator-types';

export function HistoryCIActivity({ entities, selectedId, onSelect, onOpen, scrollRef, revealId, flashId, state, onRefresh, registerRow }: {
  entities: SimulatorEntityState[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onOpen: (entity: SimulatorEntityState) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  revealId?: string;
  flashId?: string;
  state?: { status: string; message?: string };
  onRefresh: () => void;
  registerRow?: (key: string, node: HTMLButtonElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? 20 : 4;
  const visible = useMemo(() => entities.slice(0, limit), [entities, limit]);
  useEffect(() => {
    if (revealId && entities.findIndex(entity => entity.id === revealId) >= limit) setExpanded(true);
  }, [entities, limit, revealId]);
  const initialLoading = entities.length === 0 && (state?.status === 'idle' || state?.status === 'loading');

  return <section className="simulator-panel history-ci-activity" aria-label="CI activity by selected date" data-testid="history-ci-activity">
    <header className="simulator-panel__header"><div><h3>CI activity by selected date <span>({entities.length})</span></h3><small>Recorded on or before this cutoff</small></div><button type="button" aria-label="Refresh CI activity" data-tooltip="Refresh CI activity\nRefresh the shared CI snapshot without changing the historical date." onClick={onRefresh}><RefreshCw size={12}/></button></header>
    {state && state.status !== 'ready' && entities.length > 0 && <div className="history-ci-state" role="status">{state.message ?? `${state.status.replace(/_/g, ' ')} · Displaying recorded evidence`}</div>}
    <div ref={scrollRef} className="simulator-panel__scroll">
      {initialLoading ? <div className="simulator-empty" role="status">Loading CI evidence…</div> : visible.length ? visible.map(entity => {
        const running = entity.status === 'running' || entity.checkState === 'running' || entity.checkState === 'queued';
        const failed = entity.checkState === 'failure';
        return <div key={entity.id} className={`history-ci-row${selectedId === entity.id ? ' is-selected' : ''}${flashId === entity.id ? ' is-revealed' : ''}`}>
          <button type="button" ref={node => registerRow?.(entity.id, node)} className={`history-ci-row__select${flashId === entity.id ? ' is-revealed' : ''}`} data-entity-id={entity.id} data-history-target-key={entity.id} onClick={() => onSelect(entity.id)} data-tooltip={`${entity.title}\n${entity.repositoryId} · ${entity.status}. Select to inspect this canonical workflow run.`}>
            <span className={`history-ci-row__status history-ci-row__status--${failed ? 'failure' : running ? 'running' : 'success'}`} data-tooltip={`CI status\n${entity.status}`}>{running ? <CircleDotDashed size={13}/> : failed ? <XCircle size={13}/> : <CheckCircle2 size={13}/>}</span>
            <span><strong data-tooltip={`Run name\n${entity.title}`}>{entity.title}</strong><small data-tooltip={`Repository\n${entity.repositoryId}`}>{entity.repositoryId}{entity.number != null ? ` · #${entity.number}` : ''}</small></span>
          </button>
          <button type="button" className="history-ci-row__open" aria-label={`Open ${entity.title}`} data-tooltip={`Open workflow run\nOpen the repository-qualified GitHub Actions URL.`} onClick={() => onOpen(entity)} disabled={!entity.url}><ExternalLink size={11}/></button>
        </div>;
      }) : <div className="simulator-empty"><strong>{state && state.status !== 'ready' ? state.status.replace(/_/g, ' ') : 'No CI evidence by this date'}</strong>{state?.message && <span>{state.message}</span>}</div>}
    </div>
    {entities.length > 4 && <button type="button" className="simulator-list-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : `View all ${entities.length}`}</button>}
  </section>;
}
