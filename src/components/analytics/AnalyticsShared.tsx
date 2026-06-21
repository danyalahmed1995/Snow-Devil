import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { CiStatus } from '../../analytics/types';
import './Analytics.css';

export function AnalyticsPage({ title, description, demo, controls, children }: { title: string; description: string; demo: boolean; controls?: ReactNode; children: ReactNode }) {
  return (
    <main className="analytics-page">
      <header className="analytics-header">
        <div>
          <div className="analytics-title-row"><h1>{title}</h1>{demo && <span className="analytics-demo-badge">Demo Mode</span>}</div>
          <p>{description}</p>
        </div>
        {controls && <div className="analytics-controls">{controls}</div>}
      </header>
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
  return <button className="analytics-button" type="button" onClick={onClick} disabled={refreshing}><RefreshCw size={13} className={refreshing ? 'is-spinning' : ''} /> Refresh</button>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="analytics-empty">{children}</div>;
}
