import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Square } from 'lucide-react';
import type { CiStatus } from '../../analytics/types';
import { useAnalyticsSync } from '../../hooks/useAnalyticsSync';
import './Analytics.css';

export function AnalyticsPage({ title, description, demo, controls, children }: { title: string; description: string; demo: boolean; controls?: ReactNode; children: ReactNode }) {
  const sync = useAnalyticsSync();
  const completed = sync.state ? JSON.parse(sync.state.completed_repositories_json || '[]').length : 0;
  const failed = sync.state ? JSON.parse(sync.state.failed_repositories_json || '[]').length : 0;
  const counts = sync.state ? JSON.parse(sync.state.counts_json || '{}') as Record<string, number> : {};
  const unsupported = [counts.release_unsupported ? 'Releases unavailable' : '', counts.deployment_unsupported ? 'Deployments unavailable' : ''].filter(Boolean).join(' · ');
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
        <div><strong>{sync.coverage === 'complete' ? 'Complete for configured retention window' : sync.coverage}</strong><span>Last synced: {sync.state?.last_successful_at ? new Date(sync.state.last_successful_at).toLocaleString() : 'Never'}</span></div>
        <div><span>{sync.state?.current_stage?.replace(/_/g, ' ') ?? 'Cache ready'}</span><span>{completed} repositories complete{failed ? `, ${failed} failed` : ''}</span><span>{sync.state?.coverage_start ? `${new Date(sync.state.coverage_start).toLocaleDateString()} - ${sync.state.coverage_end ? new Date(sync.state.coverage_end).toLocaleDateString() : 'Current'}` : 'No synchronized history yet'}</span></div>
        {sync.state?.error && <span className="analytics-sync__error">{sync.state.error.includes('rate_limited') ? 'GitHub rate limit reached; saved progress will resume safely.' : sync.state.error.includes('authentication_expired') ? 'GitHub authentication expired.' : 'Synchronization was interrupted.'}</span>}
        {!sync.state?.error && unsupported && <span className="analytics-sync__error">{unsupported}</span>}
        <div className="analytics-sync__actions">{sync.syncing ? <button type="button" onClick={sync.cancel}><Square size={11} /> Cancel</button> : <button type="button" onClick={() => void sync.sync()} disabled={!sync.available}><RefreshCw size={11} /> {sync.coverage === 'failed' ? 'Retry sync' : 'Sync new GitHub data'}</button>}</div>
      </section>}
      {children}
    </main>
  );
}

export function AnalyticsState({ loading, error, partialReasons, onRetry }: { loading: boolean; error: unknown; partialReasons: string[]; onRetry: () => void }) {
  if (loading) return <div className="analytics-state"><RefreshCw className="is-spinning" size={18} /> Loading delivery history...</div>;
  if (error) return <div className="analytics-state analytics-state--error" role="alert"><AlertTriangle size={18} /> Unable to load analytics history. <button type="button" onClick={onRetry}>Retry</button></div>;
  if (partialReasons.length > 0) return <div className="analytics-partial"><AlertTriangle size={15} /><span><strong>Partial history.</strong> {partialReasons.join(' ')}</span></div>;
  return null;
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <section className="analytics-metric-grid">{children}</section>;
}

export function MetricCard({ label, value, detail, tone = 'neutral' }: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'neutral' | 'good' | 'warning' | 'danger' | 'info' }) {
  return <article className={`analytics-metric analytics-tone--${tone}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}

export function StatusPill({ status }: { status: CiStatus }) {
  return <span className={`analytics-status analytics-status--${status}`}>{status}</span>;
}

export function SectionCard({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`analytics-card ${className}`}><header><h2>{title}</h2>{action}</header>{children}</section>;
}

export function RefreshButton({ refreshing, onClick }: { refreshing: boolean; onClick: () => void }) {
  return <button className="analytics-button" type="button" onClick={onClick} disabled={refreshing}><RefreshCw size={13} className={refreshing ? 'is-spinning' : ''} /> Recalculate cache</button>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="analytics-empty">{children}</div>;
}
