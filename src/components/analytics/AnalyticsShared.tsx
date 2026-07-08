import { useMemo, type ReactNode, useState, useEffect, useRef } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import type { CiStatus } from '../../analytics/types';
import { useAnalyticsSync } from '../../hooks/useAnalyticsSync';
import { useTabRefresh } from '../../hooks/useTabRefresh';
import './Analytics.css';
import { buildSyncCoverageSummary } from '../../analytics/sync-summary';
import { useCurrentTabId } from '../workspace/TabInstanceContext';
import { loadingMotionClass } from '../../lib/data-state';
import { useTabsStore } from '../../stores/tabs-store';

export function useAnalyticsTabRefresh(refetch: () => Promise<unknown> | unknown) {
  const activeTabId = useCurrentTabId();
  useTabRefresh(activeTabId, useMemo(() => ({ label: 'Refresh tab', refresh: async () => { await refetch(); } }), [refetch]));
}

function SyncStatusIcon({ state }: { state: 'running' | 'idle' | 'success' | 'failure' }) {
  const size = 11;
  const icon = state === 'running'
    ? <div className="spinner-ring" style={{ width: size, height: size }} />
    : state === 'success'
      ? <CheckCircle2 size={size} className="status-icon-svg success-svg" />
      : state === 'failure'
        ? <XCircle size={size} className="status-icon-svg failure-svg" />
        : <RefreshCw size={size} className="status-icon-svg idle-svg" />;
  return (
    <div className={`status-icon-wrapper state-${state}`} style={{ width: size, height: size, marginRight: 10 }}>
      {icon}
    </div>
  );
}

export function AnalyticsPage({ title, description, demo, controls, children, compactSync = false }: { title: string; description: string; demo: boolean; controls?: ReactNode; children: ReactNode; compactSync?: boolean }) {
  const activeTabId = useCurrentTabId();
  const isActiveTab = useTabsStore(state => state.activeTabId === activeTabId);
  const sync = useAnalyticsSync({ enabled: isActiveTab });
  const failedRepositories = sync.state ? safeArray(sync.state.failed_repositories_json) : [];
  const failed = failedRepositories.length;
  const counts = sync.state ? safeRecord(sync.state.counts_json) : {};
  const unsupported = [counts.release_unsupported ? 'Releases unavailable' : '', counts.deployment_unsupported ? 'Deployments unavailable' : ''].filter(Boolean).join(' · ');
  const fetchedRecords = Object.entries(counts).filter(([key]) => key !== 'repositories' && !key.endsWith('_unsupported')).reduce((sum, [, value]) => sum + value, 0);
  const syncSummary = buildSyncCoverageSummary(sync.state, counts.accessible_repositories ?? 0, counts.included_repositories ?? 0);

  const [lastSyncState, setLastSyncState] = useState<'idle' | 'success' | 'failure'>('idle');
  const wasSyncing = useRef(sync.syncing);

  useEffect(() => {
    if (wasSyncing.current && !sync.syncing) {
      if (sync.coverage === 'failed' || failed > 0) {
        setLastSyncState('failure');
      } else {
        setLastSyncState('success');
      }
      const timer = setTimeout(() => {
        setLastSyncState('idle');
      }, 3000);
      return () => clearTimeout(timer);
    }
    wasSyncing.current = sync.syncing;
  }, [sync.syncing, sync.coverage, failed]);

  return (
    <main className="analytics-page">
      <header className="analytics-header">
        <div>
          <div className="analytics-title-row"><h1>{title}</h1>{demo && <span className="analytics-demo-badge">Demo Mode</span>}</div>
          <p>{description}</p>
        </div>
        {controls && <div className="analytics-controls">{controls}</div>}
      </header>
      {!demo && <details className={`analytics-sync-shell${compactSync ? ' analytics-sync-shell--compact' : ''}`} open={compactSync ? undefined : true}><summary><span>{sync.syncing && syncSummary.currentJob ? `Updating delivery evidence · ${syncSummary.currentJob.completedRepositories} of ${syncSummary.currentJob.totalRepositories} repositories` : sync.state?.error?.includes('rate_limited') ? 'GitHub rate limit reached. Showing cached delivery risks.' : `Delivery evidence · ${sync.coverage}`}</span><small>Synchronization details</small></summary><section className={`analytics-sync analytics-sync--${sync.coverage}`} aria-label="Analytics synchronization and coverage">
        <div className="analytics-sync__content">
          <div className="analytics-sync__pulse-dot" />
          <div className="analytics-sync__info">
            <div className="analytics-sync__meta">
              <strong>{sync.coverage === 'complete' ? 'Complete for configured retention window' : sync.coverage}</strong>
              <span>Last completed: {syncSummary.snapshotCompletedAt ? new Date(syncSummary.snapshotCompletedAt).toLocaleString() : 'Never'}</span>
              {sync.syncing && syncSummary.snapshotCompletedAt && <span className="analytics-sync__previous-note">Displaying previous snapshot while refresh runs</span>}
            </div>
            <div className="analytics-sync__details">
              <span className="analytics-sync__stage">{sync.state?.current_stage?.replace(/_/g, ' ') ?? 'Cache ready'}</span>
              <span className="analytics-sync__stats">{syncSummary.accessibleNow} accessible · {syncSummary.includedBySettings} included · {syncSummary.eligibleForSync} eligible · {syncSummary.fullySynchronized} synchronized · {syncSummary.failed} failed</span>
              <span className="analytics-sync__records">{syncSummary.skippedOrUnsupported} skipped/unsupported · {fetchedRecords.toLocaleString()} normalized records</span>
              {syncSummary.currentJob && (
                <span className="analytics-sync__job">
                  Current job: repository {syncSummary.currentJob.completedRepositories + 1} of {syncSummary.currentJob.totalRepositories}
                  {syncSummary.currentJob.repository ? ` · ${syncSummary.currentJob.repository}` : ''}
                </span>
              )}
              <span className="analytics-sync__dates">{sync.state?.coverage_start ? `${new Date(sync.state.coverage_start).toLocaleDateString()} – ${sync.state.coverage_end ? new Date(sync.state.coverage_end).toLocaleDateString() : 'Current'}` : 'History unavailable'}</span>
            </div>
            {sync.state?.error && <span className="analytics-sync__error">{sync.state.error.includes('rate_limited') ? 'GitHub rate limit reached; saved progress will resume safely.' : sync.state.error.includes('authentication_expired') ? 'GitHub authentication expired.' : 'Synchronization was interrupted.'}</span>}
            {!sync.state?.error && unsupported && <span className="analytics-sync__error">{unsupported}</span>}
            {failedRepositories.length > 0 && <span className="analytics-sync__error" data-tooltip={failedRepositories.map(value => typeof value === 'string' ? value : String((value as Record<string, unknown>).repository ?? 'Unknown repository')).join(', ')}>{failed} repository source{failed === 1 ? '' : 's'} failed</span>}
          </div>
        </div>
        <div className="analytics-sync__actions">
          <button
            type="button"
            data-tooltip={sync.syncing ? "Cancel synchronization\nStop after the current safe checkpoint; the previous valid snapshot remains available." : "Synchronize GitHub data\nRefresh normalized delivery evidence while preserving the current snapshot during loading or failure."}
            onClick={sync.syncing ? sync.cancel : () => void sync.sync()}
            disabled={!sync.syncing && !sync.available}
          >
            <SyncStatusIcon state={sync.syncing ? 'running' : lastSyncState} />
            <span>{sync.syncing ? 'Cancel sync' : (failed || sync.coverage === 'failed' ? 'Retry failed sources' : 'Sync new GitHub data')}</span>
          </button>
        </div>
      </section></details>}
      {children}
    </main>
  );
}

export function AnalyticsState({ loading, error, partialReasons, onRetry, label = 'Coverage' }: { loading: boolean; error: unknown; partialReasons: string[]; onRetry: () => void; label?: string }) {
  if (loading) { const reduced = document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; return <div className={`analytics-state ${loadingMotionClass(Boolean(reduced))}`} role="status"><RefreshCw className="is-spinning" size={18} /> Loading delivery history...</div>; }
  if (error) return <div className="analytics-state analytics-state--error" role="alert"><AlertTriangle size={18} /> Unable to load analytics history. <button type="button" onClick={onRetry}>Retry</button></div>;
  if (partialReasons.length > 0) return <div className="analytics-partial"><AlertTriangle size={15} /><span><strong>{label}: partial history.</strong> {partialReasons.join(' ')}</span></div>;
  return null;
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <section className="analytics-metric-grid">{children}</section>;
}

export function MetricCard({ label, value, detail, tone = 'neutral', title, onClick, active }: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'neutral' | 'good' | 'warning' | 'danger' | 'info'; title?: string; onClick?: () => void; active?: boolean }) {
  const content = <><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</>;
  const activeClass = active ? 'is-active' : '';
  return onClick ? <button type="button" className={`analytics-metric analytics-metric--action analytics-tone--${tone} ${activeClass}`} data-tooltip={title} onClick={onClick}>{content}</button> : <article className={`analytics-metric analytics-tone--${tone} ${activeClass}`} data-tooltip={title}>{content}</article>;
}

export function StatusPill({ status }: { status: CiStatus }) {
  return <span className={`analytics-status analytics-status--${status}`}>{status}</span>;
}

export function SectionCard({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`analytics-card ${className}`}><header><h2>{title}</h2>{action}</header>{children}</section>;
}

export function RefreshButton({ refreshing, onClick }: { refreshing: boolean; onClick: () => void }) {
  return <button className="analytics-button" type="button" data-tooltip="Refresh analytics\nFetch updated evidence while keeping the last valid analytics snapshot visible." onClick={onClick} disabled={refreshing}><RefreshCw size={13} className={refreshing ? 'is-spinning' : ''} /> Refresh analytics</button>;
}

export function EmptyState({ children, kind = 'zero' }: { children: ReactNode; kind?: 'zero' | 'no-data' | 'unavailable' | 'unsupported' | 'failed' | 'insufficient' | 'outside-range' | 'partial' }) {
  return <div className={`analytics-empty analytics-empty--${kind}`}>{children}</div>;
}

function safeArray(value: string): unknown[] {
  try { const parsed: unknown = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function safeRecord(value: string): Record<string, number> {
  try { const parsed: unknown = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, number> : {}; } catch { return {}; }
}
