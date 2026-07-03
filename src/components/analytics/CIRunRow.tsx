import { useState, useMemo } from 'react';
import { CheckCircle2, CircleDotDashed, Clock, ExternalLink, GitCommit, GitPullRequest, Search, XCircle, AlertCircle, PlayCircle, Loader2 } from 'lucide-react';
import { useWorkflowJobs } from '../../hooks/useWorkflowJobs';
import type { SimulatorEvent } from '../../simulator/simulator-types';
import { formatDurationHours } from '../../analytics/math';

export function formatDurationCompact(ms?: number) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return 'Unknown';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m ${s}s`;
  return `${h}h ${m % 60}m`;
}

function timeAgo(dateString?: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${Math.max(0, seconds)}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function StatusIcon({ status, conclusion, size = 14 }: { status?: string; conclusion?: string | null; size?: number }) {
  if (status === 'queued' || status === 'waiting' || status === 'pending') return <Clock size={size} className="status-icon status-icon--queued" style={{ color: 'var(--warning)' }} />;
  if (status === 'in_progress') return <CircleDotDashed size={size} className="status-icon status-icon--running is-spinning" style={{ color: 'var(--accent-primary)' }} />;
  if (conclusion === 'success') return <CheckCircle2 size={size} className="status-icon status-icon--success" style={{ color: 'var(--success)' }} />;
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') return <XCircle size={size} className="status-icon status-icon--failure" style={{ color: 'var(--danger)' }} />;
  if (conclusion === 'cancelled') return <XCircle size={size} className="status-icon status-icon--cancelled" style={{ color: 'var(--text-muted)' }} />;
  return <AlertCircle size={size} className="status-icon status-icon--neutral" style={{ color: 'var(--text-secondary)' }} />;
}

export function CIRunRow({ run, isSelected, sparklineRuns, onSelect }: { run: SimulatorEvent; isSelected: boolean; sparklineRuns: number[]; onSelect: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data: jobs, isLoading, error } = useWorkflowJobs(run.repositoryId, run.metadata?.runId as string, expanded);

  const m = run.metadata as Record<string, any> | undefined;
  const status = m?.status as string | undefined;
  const conclusion = m?.conclusion as string | null | undefined;
  
  // Calculate sparkline points if we have >= 2 samples
  const hasSparkline = sparklineRuns.length >= 2;
  const maxDuration = hasSparkline ? Math.max(...sparklineRuns) : 0;
  const sparklinePts = hasSparkline ? sparklineRuns.map((dur, i) => {
    const x = (i / (sparklineRuns.length - 1)) * 40;
    const y = 14 - ((dur / maxDuration) * 12);
    return `${x},${y}`;
  }).join(' ') : '';
  
  return (
    <div className={`ci-activity-row ${isSelected ? 'is-selected' : ''} ${expanded ? 'is-expanded' : ''}`}>
      <div className="ci-activity-row__main" onClick={() => onSelect(run.id)}>
        <button type="button" className="ci-activity-row__expand" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} aria-expanded={expanded}>
          <PlayCircle size={12} className={expanded ? 'is-expanded' : ''} />
        </button>
        <div className="ci-activity-row__status">
          <StatusIcon status={status} conclusion={conclusion} size={16} />
        </div>
        <div className="ci-activity-row__info">
          <div className="ci-activity-row__title">
            <strong>{run.subjectTitle}</strong>
            <span className="ci-run-number">#{m?.runNumber}</span>
          </div>
          <div className="ci-activity-row__meta">
            <span className="ci-repo" title="Repository">{run.repositoryName}</span>
            {m?.headBranch && <span className="ci-branch" title="Branch"><GitCommit size={10} /> {m.headBranch}</span>}
            {m?.pullRequestNumber != null && <span className="ci-pr" title="Pull Request"><GitPullRequest size={10} /> #{m.pullRequestNumber}</span>}
            {m?.commitMessage && <span className="ci-commit-msg" title={m.commitMessage}>{m.commitMessage.split('\n')[0]}</span>}
          </div>
        </div>
        <div className="ci-activity-row__actor">
          {run.actor?.avatarUrl ? <img src={run.actor.avatarUrl} alt="" className="ci-avatar" /> : <div className="ci-avatar-fallback">{run.actor?.login?.charAt(0)?.toUpperCase() ?? '?'}</div>}
          <span title="Triggered by">{run.actor?.login ?? 'Unknown'}</span>
        </div>
        <div className="ci-activity-row__timing">
          <span className="ci-duration" title="Duration">{formatDurationCompact(m?.durationMs)}</span>
          <span className="ci-time-ago" title={run.occurredAt}>{timeAgo(run.occurredAt)}</span>
          {hasSparkline && (
            <svg width="40" height="14" className="ci-sparkline" aria-label="Duration trend">
              <polyline points={sparklinePts} fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="ci-activity-row__actions">
           {m?.htmlUrl && <a href={m.htmlUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="Open on GitHub" className="ci-action-btn"><ExternalLink size={12} /></a>}
        </div>
      </div>
      {expanded && (
        <div className="ci-activity-row__jobs">
          {isLoading && <div className="ci-jobs-loading"><Loader2 className="is-spinning" size={14} /> Loading jobs...</div>}
          {error && <div className="ci-jobs-error">Failed to load jobs</div>}
          {jobs?.length === 0 && <div className="ci-jobs-empty">No jobs found</div>}
          {jobs && jobs.length > 0 && (
            <ul className="ci-jobs-list">
              {jobs.map(job => (
                <li key={job.id} className="ci-job-item">
                  <StatusIcon status={job.status} conclusion={job.conclusion} size={14} />
                  <span className="ci-job-name">{job.name}</span>
                  {job.status === 'in_progress' && job.steps?.length > 0 && (
                    <span className="ci-job-steps">
                      {job.steps.filter(s => s.status === 'completed').length} / {job.steps.length} steps
                    </span>
                  )}
                  <span className="ci-job-duration">
                    {job.started_at && job.completed_at ? formatDurationCompact(new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) : ''}
                    {job.started_at && !job.completed_at ? 'Running...' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
