import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Square } from 'lucide-react';
import type { CiStatus } from '../../analytics/types';
import { useAnalyticsSync } from '../../hooks/useAnalyticsSync';
import { useTabsStore } from '../../stores/tabs-store';
import { useTabRefresh } from '../../hooks/useTabRefresh';
import './Analytics.css';

export function useAnalyticsTabRefresh(refetch: () => Promise<unknown> | unknown) {
  const activeTabId = useTabsStore(s => s.activeTabId);
  useTabRefresh(activeTabId, useMemo(() => ({ label: 'Refresh tab', refresh: async () => { await refetch(); } }), [refetch]));
}

export function AnalyticsPage({ title, description, demo, controls, children }: { title: string; description: string; demo: boolean; controls?: ReactNode; children: ReactNode }) {
  const sync = useAnalyticsSync();
  const completed = sync.state ? safeArray(sync.state.completed_repositories_json).length : 0;
  const failedRepositories = sync.state ? safeArray(sync.state.failed_repositories_json) : [];
  const failed = failedRepositories.length;
  const counts = sync.state ? safeRecord(sync.state.counts_json) : {};
  const unsupported = [counts.release_unsupported ? 'Releases unavailable' : '', counts.deployment_unsupported ? 'Deployments unavailable' : ''].filter(Boolean).join(' · ');
  const fetchedRecords = Object.entries(counts).filter(([key]) => key !== 'repositories' && !key.endsWith('_unsupported')).reduce((sum, [, value]) => sum + value, 0);
  return (
    <main className="analytics-page">
      <header className="analytics-header">
        <div>
          <div className="analytics-title-row"><h1>{title}</h1>{demo && <span className="analytics-demo-badge">Demo Mode</span>}</div>
          <p>{description}</p>
        </div>
        {controls && <div className="analytics-controls">{controls}</div>}
      </header>
      {!demo && <section className={`analytics-sync analytics-sync--${sync.coverage}`} aria-label="Analytics synchronization and coverage">
        <div><strong>{sync.coverage === 'complete' ? 'Complete for configured retention window' : sync.coverage}</strong><span>Last completed: {sync.state?.last_successful_at ? new Date(sync.state.last_successful_at).toLocaleString() : 'Never'}</span>{sync.syncing && sync.state?.last_successful_at && <span>Previous completed snapshot displayed</span>}</div>
        <div><span>{sync.state?.current_stage?.replace(/_/g, ' ') ?? 'Cache ready'}</span><span>{counts.accessible_repositories ?? counts.repositories ?? 0} accessible · {counts.included_repositories ?? counts.repositories ?? 0} included · {counts.eligible_repositories ?? counts.repositories ?? 0} eligible · {completed} synchronized · {failed} failed</span><span>{(counts.skipped_repositories ?? 0) + (counts.release_unsupported ?? 0) + (counts.deployment_unsupported ?? 0)} skipped/unsupported · {fetchedRecords.toLocaleString()} normalized records</span><span>{sync.state?.coverage_start ? `${new Date(sync.state.coverage_start).toLocaleDateString()} – ${sync.state.coverage_end ? new Date(sync.state.coverage_end).toLocaleDateString() : 'Current'}` : 'History unavailable'}</span></div>
        {sync.state?.error && <span className="analytics-sync__error">{sync.state.error.includes('rate_limited') ? 'GitHub rate limit reached; saved progress will resume safely.' : sync.state.error.includes('authentication_expired') ? 'GitHub authentication expired.' : 'Synchronization was interrupted.'}</span>}
        {!sync.state?.error && unsupported && <span className="analytics-sync__error">{unsupported}</span>}
        {failedRepositories.length > 0 && <span className="analytics-sync__error" title={failedRepositories.map(value => typeof value === 'string' ? value : String((value as Record<string, unknown>).repository ?? 'Unknown repository')).join(', ')}>{failed} repository source{failed === 1 ? '' : 's'} failed</span>}
        <div className="analytics-sync__actions">{sync.syncing ? <button type="button" onClick={sync.cancel}><Square size={11} /> Cancel sync</button> : <button type="button" onClick={() => void sync.sync()} disabled={!sync.available}><RefreshCw size={11} /> {failed || sync.coverage === 'failed' ? 'Retry failed sources' : 'Sync new GitHub data'}</button>}</div>
      </section>}
      {children}
    </main>
  );
}

export function AnalyticsState({ loading, error, partialReasons, onRetry, label = 'Coverage' }: { loading: boolean; error: unknown; partialReasons: string[]; onRetry: () => void; label?: string }) {
  if (loading) return <div className="analytics-state"><RefreshCw className="is-spinning" size={18} /> Loading delivery history...</div>;
  if (error) return <div className="analytics-state analytics-state--error" role="alert"><AlertTriangle size={18} /> Unable to load analytics history. <button type="button" onClick={onRetry}>Retry</button></div>;
  if (partialReasons.length > 0) return <div className="analytics-partial"><AlertTriangle size={15} /><span><strong>{label}: partial history.</strong> {partialReasons.join(' ')}</span></div>;
  return null;
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <section className="analytics-metric-grid">{children}</section>;
}

export function MetricCard({ label, value, detail, tone = 'neutral', title, onClick }: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'neutral' | 'good' | 'warning' | 'danger' | 'info'; title?: string; onClick?: () => void }) {
  const content = <><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</>;
  return onClick ? <button type="button" className={`analytics-metric analytics-metric--action analytics-tone--${tone}`} title={title} onClick={onClick}>{content}</button> : <article className={`analytics-metric analytics-tone--${tone}`} title={title}>{content}</article>;
}

export function StatusPill({ status }: { status: CiStatus }) {
  return <span className={`analytics-status analytics-status--${status}`}>{status}</span>;
}

export function SectionCard({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`analytics-card ${className}`}><header><h2>{title}</h2>{action}</header>{children}</section>;
}

export function RefreshButton({ refreshing, onClick }: { refreshing: boolean; onClick: () => void }) {
  return <button className="analytics-button" type="button" onClick={onClick} disabled={refreshing}><RefreshCw size={13} className={refreshing ? 'is-spinning' : ''} /> Refresh analytics</button>;
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
