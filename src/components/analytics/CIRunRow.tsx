import { memo, useState, type ReactNode } from 'react';
import { CheckCircle2, Clock, ExternalLink, GitCommit, GitBranch, GitMerge, XCircle, AlertCircle, Loader2, MinusCircle, ChevronRight } from 'lucide-react';
import { useWorkflowRunWatcher } from '../../hooks/useWorkflowRunWatcher';
import type { SimulatorEvent } from '../../simulator/simulator-types';

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
  let stateClass: string;
  let icon: ReactNode;
  if (status === 'queued' || status === 'waiting' || status === 'pending') {
    stateClass = 'state-queued';
    icon = <Clock size={size} className="status-icon-svg queued-svg" />;
  } else if (status === 'in_progress') {
    stateClass = 'state-running';
    icon = <div className="spinner-ring" style={{ width: size, height: size }} />;
  } else if (conclusion === 'success') {
    stateClass = 'state-success';
    icon = <CheckCircle2 size={size} className="status-icon-svg success-svg" />;
  } else if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') {
    stateClass = 'state-failure';
    icon = <XCircle size={size} className="status-icon-svg failure-svg" />;
  } else if (conclusion === 'cancelled' || conclusion === 'skipped') {
    stateClass = 'state-skipped';
    icon = <MinusCircle size={size} className="status-icon-svg skipped-svg" />;
  } else {
    stateClass = 'state-neutral';
    icon = <AlertCircle size={size} className="status-icon-svg neutral-svg" />;
  }

  return (
    <div className={`status-icon-wrapper ${stateClass}`} style={{ width: size, height: size }}>
      {icon}
    </div>
  );
}

export interface CIRunRowProps {
  run: SimulatorEvent;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onOpenRun?: (run: SimulatorEvent) => void;
  onOpenJob?: (run: SimulatorEvent, jobId: string) => void;
}

function CIRunRowComponent({ run, isSelected, onSelect, onOpenRun, onOpenJob }: CIRunRowProps) {
  if (import.meta.env.DEV) {
    (window as any).__SNOW_DEVIL_CI_ROW_RENDER_PROBE__?.(run.id);
  }
  const [expanded, setExpanded] = useState(false);
  const m = run.metadata as Record<string, any> | undefined;
  const status = m?.status as string | undefined;
  const conclusion = m?.conclusion as string | null | undefined;
  const isActiveRun = status !== 'completed' && conclusion === null;
  const attemptNumber = m?.runAttempt ? parseInt(m.runAttempt, 10) : undefined;
  const { data: watcherState, isLoading, error } = useWorkflowRunWatcher(
    run.repositoryId, 
    m?.runId as string, 
    attemptNumber, 
    expanded && isActiveRun, 
    expanded
  );
  const jobs = watcherState?.jobs;
  
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
  
  let branchState = 'grey';
  if (isMerged) {
    branchState = 'merged';
  } else if (status === 'in_progress' || status === 'queued' || status === 'pending') {
    branchState = 'running';
  } else if (conclusion === 'success') {
    branchState = 'success';
  } else if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') {
    branchState = 'failure';
  } else if (conclusion === 'cancelled' || conclusion === 'skipped') {
    branchState = 'skipped';
  }

  let rowStateClass = 'state-neutral';
  if (status === 'queued' || status === 'waiting' || status === 'pending') {
    rowStateClass = 'state-queued';
  } else if (status === 'in_progress') {
    rowStateClass = 'state-running';
  } else if (conclusion === 'success') {
    rowStateClass = 'state-success';
  } else if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') {
    rowStateClass = 'state-failure';
  } else if (conclusion === 'cancelled' || conclusion === 'skipped') {
    rowStateClass = 'state-skipped';
  }
  
  return (
    <div 
      className={`ci-activity-row ${isSelected ? 'is-selected' : ''} ${expanded ? 'is-expanded' : ''} ${rowStateClass}`}
      onDoubleClick={() => onOpenRun?.(run)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onOpenRun) {
           onOpenRun(run);
        }
      }}
      tabIndex={0}
    >
      <div className="ci-activity-row__main" onClick={() => onSelect(run.id)}>
        <div className="ci-activity-row__status">
          <StatusIcon status={status} conclusion={conclusion} size={16} />
        </div>
        
        <div className="ci-activity-row__primary">
          <strong className="ci-title" title={run.subjectTitle}>{run.subjectTitle}</strong>
          {m?.commitMessage && <span className="ci-commit-msg" title={m.commitMessage}>{m.commitMessage.split('\n')[0]}</span>}
        </div>

        <div className="ci-activity-row__tags">
          <span 
            role="button"
            tabIndex={0}
            className="ci-tag ci-tag--repo" 
            title="Open Repository"
            onClick={(e) => {
              e.stopPropagation();
              import('../../stores/tabs-store').then(({ useTabsStore }) => {
                useTabsStore.getState().openNativeTab(
                  `native:repo:${run.repositoryId}`, 
                  'repositoryExplorer', 
                  run.repositoryName, 
                  false, 
                  true, 
                  { type: 'repository', repository: run.repositoryId, ref: branchName || undefined }
                );
              });
            }}
          >
            {run.repositoryName}
          </span>
          <div className="ci-activity-row__git-tags">
            {branchName && (
              <span className={`ci-tag ci-tag--branch branch-state--${branchState}`} title="Branch">
                {isMerged ? (
                  <GitMerge size={12} />
                ) : (
                  <GitBranch size={12} />
                )} {branchName}
              </span>
            )}
            {m?.headSha && (
              <span 
                role="button"
                tabIndex={0}
                className="ci-tag ci-tag--commit" 
                title="View Commit Diff"
                onClick={(e) => {
                  e.stopPropagation();
                  import('../../stores/tabs-store').then(({ useTabsStore }) => {
                    useTabsStore.getState().openNativeTab(
                      `native:commit:${run.repositoryId}:${m.headSha}`, 
                      'commitDiff', 
                      m.headSha.substring(0, 7), 
                      false, 
                      true, 
                      { type: 'commit', repository: run.repositoryId, sha: m.headSha }
                    );
                  });
                }}
              >
                <GitCommit size={12} /> {m.headSha.substring(0, 7)}
              </span>
            )}
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
          {m?.htmlUrl && (
            <button 
              type="button"
              className="ci-action-btn"
              title="Open in Browser Tab"
              aria-label="Open workflow run in browser tab"
              onClick={(e) => {
                e.stopPropagation();
                import('../../stores/tabs-store').then(({ useTabsStore }) => {
                  useTabsStore.getState().openBrowserTab(
                    `github-workflow-run:${run.repositoryId}:${m.runId ?? run.id}`,
                    'githubPage',
                    `${title || 'CI'} · Run #${m.runNumber ?? '?'}`,
                    m.htmlUrl,
                    false,
                    true
                  );
                });
              }}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={14} />
            </button>
          )}
          <button type="button" className="ci-activity-row__expand" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} onDoubleClick={(e) => e.stopPropagation()} aria-expanded={expanded}>
            <ChevronRight size={14} className={expanded ? 'is-expanded' : ''} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="ci-activity-row__jobs">
          {isLoading && <div className="ci-jobs-loading"><Loader2 className="is-spinning" size={14} /> Loading jobs...</div>}
          {error && <div className="ci-jobs-error">{error.message === 'missing_workflow_scope' ? 'Missing workflow permission. Please reconnect GitHub in Settings.' : 'Failed to load jobs'}</div>}
          {jobs?.length === 0 && <div className="ci-jobs-empty">No jobs found</div>}
          {jobs && jobs.length > 0 && (
            <ul className="ci-jobs-list">
              {jobs.map(job => {
                const statusStr = job.status as string;
                const conclusionStr = job.conclusion as string | null;
                let jobState = 'state-neutral';
                if (statusStr === 'queued' || statusStr === 'waiting' || statusStr === 'pending') {
                  jobState = 'state-queued';
                } else if (statusStr === 'in_progress') {
                  jobState = 'state-running';
                } else if (conclusionStr === 'success') {
                  jobState = 'state-success';
                } else if (conclusionStr === 'failure' || conclusionStr === 'timed_out' || conclusionStr === 'startup_failure') {
                  jobState = 'state-failure';
                } else if (conclusionStr === 'cancelled' || conclusionStr === 'skipped') {
                  jobState = 'state-skipped';
                }
                return (
                  <li key={job.id} className={`ci-job-item ${jobState}`} onClick={(e) => { e.stopPropagation(); onOpenJob?.(run, String(job.id)); }}>
                    <div className="ci-job-item-header">
                      <StatusIcon status={job.status} conclusion={job.conclusion} size={14} />
                      <span className="ci-job-name" title={job.name}>{job.name}</span>
                    </div>
                    <div className="ci-job-item-footer">
                      {job.status === 'in_progress' && job.steps?.length > 0 && (
                        <span className="ci-job-steps">
                          {job.steps.filter(s => s.status === 'completed').length} / {job.steps.length} steps
                        </span>
                      )}
                      <span className="ci-job-duration">
                        {job.started_at && job.completed_at ? formatDurationCompact(new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) : ''}
                        {job.started_at && !job.completed_at ? (
                          <span className="ci-job-running-text">
                            Running<span className="ci-job-cursor" />
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export const CIRunRow = memo(CIRunRowComponent);


