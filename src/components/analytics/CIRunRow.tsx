import { useState, useMemo } from 'react';
import { CheckCircle2, CircleDotDashed, Clock, ExternalLink, GitCommit, GitBranch, GitMerge, GitPullRequest, Search, XCircle, AlertCircle, PlayCircle, Loader2 } from 'lucide-react';
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
  
  const title = run.subjectTitle || '';
  const msg = m?.commitMessage || '';
  let branchName = m?.headBranch;
  let isMerged = false;
  
  const pullRequestMatch = title.match(/Merge pull request #\d+ from [^/]+\/(.+)/) || msg.match(/Merge pull request #\d+ from [^/]+\/(.+)/);
  if (pullRequestMatch) {
    isMerged = true;
    branchName = pullRequestMatch[1];
  } else if (title.startsWith('Merge branch ') || msg.startsWith('Merge branch ')) {
    isMerged = true;
    const branchMatch = title.match(/Merge branch '([^']+)'/) || msg.match(/Merge branch '([^']+)'/);
    if (branchMatch) branchName = branchMatch[1];
  }

  const actorLogin = run.actor?.login || m?.actorName;
  const cleanLogin = actorLogin?.replace('[bot]', '');
  const avatarUrl = m?.actorAvatar || run.actor?.avatarUrl || (cleanLogin ? `https://github.com/${cleanLogin}.png?size=48` : undefined);

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
        <div className="ci-activity-row__status">
          <StatusIcon status={status} conclusion={conclusion} size={16} />
        </div>
        
        <div className="ci-activity-row__primary">
          <strong className="ci-title" title={run.subjectTitle}>{run.subjectTitle}</strong>
          {m?.commitMessage && <span className="ci-commit-msg" title={m.commitMessage}>{m.commitMessage.split('\n')[0]}</span>}
        </div>

        <div className="ci-activity-row__tags">
          <span className="ci-tag ci-tag--repo" title="Repository">{run.repositoryName}</span>
          <div className="ci-activity-row__git-tags">
            {branchName && (
              <span className="ci-tag ci-tag--branch" title="Branch">
                {isMerged ? (
                  <GitMerge size={12} color="#a371f7" />
                ) : (
                  <GitBranch size={12} color={
                    (status === 'in_progress' || status === 'queued' || status === 'pending') ? 'var(--warning)' : 
                    (conclusion === 'success') ? 'var(--success)' : 
                    (conclusion === 'failure' || conclusion === 'timed_out') ? 'var(--danger)' : 
                    'var(--text-muted)'
                  } />
                )} {branchName}
              </span>
            )}
            {m?.headSha && <span className="ci-tag ci-tag--commit" title="Commit"><GitCommit size={12} /> {m.headSha.substring(0, 7)}</span>}
            {m?.pullRequestNumber ? <span className="ci-tag ci-tag--pr">PR #{m.pullRequestNumber}</span> : <span className="ci-tag ci-tag--run">Run #{m?.runNumber}</span>}
          </div>
        </div>

        <div className="ci-activity-row__timing">
          <span className="ci-duration" title="Duration">{formatDurationCompact(m?.durationMs)}</span>
          <span className="ci-time-ago" title={run.occurredAt}>{timeAgo(run.occurredAt)}</span>
        </div>

        <div className="ci-activity-row__actor">
          {avatarUrl ? (
            <img src={avatarUrl} alt={actorLogin || 'Actor'} className="ci-avatar" title={actorLogin} loading="lazy" />
          ) : (
            <div className="ci-avatar-fallback" title={actorLogin}>
              {actorLogin?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
          )}
        </div>

        <div className="ci-activity-row__actions">
          {m?.htmlUrl && <a href={m.htmlUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="Open on GitHub" className="ci-action-btn"><ExternalLink size={14} /></a>}
          <button type="button" className="ci-activity-row__expand" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} aria-expanded={expanded}>
            <PlayCircle size={14} className={expanded ? 'is-expanded' : ''} />
          </button>
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
