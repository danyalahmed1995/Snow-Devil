import { useState, useEffect, useMemo } from 'react';
import { useTabsStore } from '../../../stores/tabs-store';
import { useCurrentTabId } from '../TabInstanceContext';
import { useWorkflowRunWatcher } from '../../../hooks/useWorkflowRunWatcher';
import { useWorkflowJobLog } from '../../../hooks/useWorkflowJobLog';
import { formatDurationCompact, StatusIcon } from '../../analytics/CIRunRow';
import { AlertCircle, Loader2, RefreshCw, ChevronRight } from 'lucide-react';
import { Select } from '../../ui/Select';
import { CILogViewer, LogLineData } from './CILogViewer';
import './CIRunWatcher.css';

function getStatusIcon(status: string, conclusion: string | null) {
  return <StatusIcon status={status} conclusion={conclusion} size={14} />;
}

export function CIRunWatcher({ repositoryId, runId, initialAttempt, initialJobId }: { repositoryId: string, runId: string, initialAttempt?: number, initialJobId?: string }) {
  const activeTabId = useCurrentTabId();
  const isActive = useTabsStore(state => state.activeTabId === activeTabId);
  const isForeground = document.hasFocus() && isActive;
  
  const [selectedAttempt, setSelectedAttempt] = useState<number | undefined>(initialAttempt);
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(initialJobId);

  useEffect(() => {
    if (initialJobId) {
      setSelectedJobId(initialJobId);
    }
  }, [initialJobId]);

  useEffect(() => {
    if (initialAttempt) {
      setSelectedAttempt(initialAttempt);
    }
  }, [initialAttempt]);
  
  const { data: watcherState, error, isLoading, refetch, isFetching } = useWorkflowRunWatcher(repositoryId, runId, selectedAttempt, isForeground, isActive);
  
  // Safe default to current attempt if missing
  useEffect(() => {
    if (watcherState?.run && !selectedAttempt) {
      setSelectedAttempt(watcherState.run.run_attempt);
    }
  }, [watcherState?.run, selectedAttempt]);

  const jobs = watcherState?.jobs || [];
  
  useEffect(() => {
    if (!selectedJobId && jobs.length > 0) {
      const failedJob = jobs.find(j => j.conclusion === 'failure' || j.conclusion === 'timed_out');
      if (failedJob) setSelectedJobId(String(failedJob.id));
      else setSelectedJobId(String(jobs[0].id));
    }
  }, [jobs, selectedJobId]);

  const selectedJob = useMemo(() => jobs.find(j => String(j.id) === selectedJobId), [jobs, selectedJobId]);
  
  const isJobActive = selectedJob?.status === 'in_progress';
  const { data: logData, isLoading: isLogLoading, refetch: refetchLog, isFetching: isLogFetching } = useWorkflowJobLog(
    repositoryId, 
    selectedJobId || '', 
    Boolean(selectedJobId && (selectedJob?.status === 'completed' || isJobActive)),
    isJobActive
  );

  const [expandedStepNumber, setExpandedStepNumber] = useState<number | null>(null);

  const stepLogs = useMemo(() => {
     if (!logData?.text) return new Map<number, LogLineData[]>();
     
     // Note: Do NOT strip ANSI codes here, CILogViewer handles them
     const lines = logData.text.split(/\r?\n/);
     const parsedLines: { time: number, text: string, lineNumber: number }[] = [];
     let lastTime = 0;
     
     for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s(.*)/);
        if (match) {
           lastTime = new Date(match[1]).getTime();
           parsedLines.push({ time: lastTime, text: match[2], lineNumber: index + 1 });
        } else {
           parsedLines.push({ time: lastTime, text: line, lineNumber: index + 1 });
        }
     }

     const logsByStep = new Map<number, LogLineData[]>();
     const steps = selectedJob?.steps || [];
     
     // Filter out skipped steps
     const activeSteps = steps.filter(s => s.conclusion !== 'skipped');
     if (activeSteps.length === 0 || parsedLines.length === 0) return logsByStep;

     let currentStepIndex = 0;
     for (const line of parsedLines) {
        if (currentStepIndex < activeSteps.length - 1) {
          const nextStep = activeSteps[currentStepIndex + 1];
          let shouldTransition = false;
          
          const isPostRun = nextStep.name.startsWith('Post Run ') || nextStep.name.startsWith('Post job ');
          const isCompleteJob = nextStep.name === 'Complete job';
          
          if (isPostRun) {
            if (line.text.includes('Post job cleanup.')) {
              shouldTransition = true;
            }
          } else if (isCompleteJob) {
            if (line.text.includes('Cleaning up orphan processes') || line.text.includes('Complete job')) {
              shouldTransition = true;
            }
          } else {
            if (line.text.includes('##[group]Run ')) {
              shouldTransition = true;
            }
          }

          if (shouldTransition) {
            currentStepIndex++;
            // Skip adding the transition marker line if it's a ##[group]Run marker
            // so we don't display it inside the step logs
            if (line.text.includes('##[group]Run ')) {
              continue;
            }
          }
        }
        
        const step = activeSteps[currentStepIndex];
        if (!logsByStep.has(step.number)) {
          logsByStep.set(step.number, []);
        }
        const stepLogsArr = logsByStep.get(step.number)!;
        stepLogsArr.push({ lineNumber: stepLogsArr.length + 1, text: line.text });
     }
     
     return logsByStep;
  }, [logData, selectedJob]);

  // Reset expanded step when job changes
  useEffect(() => {
     setExpandedStepNumber(null);
  }, [selectedJobId]);

  if (isLoading && !watcherState) {
    return (
      <div className="ci-run-watcher home-loading-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
        <h2 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-primary)' }}>Loading workflow run...</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '300px' }}>
          <div className="home-skeleton-row home-skeleton" style={{ height: '20px', margin: 0, borderRadius: '4px' }} />
          <div className="home-skeleton-row home-skeleton" style={{ height: '20px', margin: 0, borderRadius: '4px', width: '80%' }} />
          <div className="home-skeleton-row home-skeleton" style={{ height: '20px', margin: 0, borderRadius: '4px', width: '60%' }} />
        </div>
      </div>
    );
  }

  if (error || !watcherState) {
    return <div className="ci-run-watcher error"><AlertCircle /> Error loading workflow run.</div>;
  }

  const { run } = watcherState;
  
  // Attempt selection options
  const attemptOptions = [];
  for (let i = run.run_attempt; i > 0; i--) {
    attemptOptions.push({ value: String(i), label: `Attempt ${i}` });
  }

  return (
    <div className="ci-run-watcher">
      <header className="ci-run-header">
        <div className="ci-run-header-title">
          {getStatusIcon(run.status, run.conclusion)}
          <h2>{run.name} · Run #{run.run_number}</h2>
        </div>
        <div className="ci-run-header-meta">
          <span>{repositoryId}</span>
          <span>·</span>
          <span>{run.head_branch}</span>
          <span>·</span>
          <a className="ci-run-link" onClick={() => useTabsStore.getState().openNativeTab(`native:commit:${repositoryId}:${run.head_sha}`, 'commitDiff', run.head_sha.substring(0, 7), false, true, { type: 'commit', repository: repositoryId, sha: run.head_sha })}>{run.head_sha.substring(0, 7)}</a>
          <span>·</span>
          <span>{run.event}</span>
        </div>
        <div className="ci-run-header-actions">
           {attemptOptions.length > 1 && <Select options={attemptOptions} value={String(selectedAttempt || run.run_attempt)} onChange={(v) => setSelectedAttempt(parseInt(v, 10))} ariaLabel="Run Attempt" />}
           <button className="ci-btn" onClick={() => refetch()}><RefreshCw size={14} className={isFetching ? 'is-spinning' : ''}/> Refresh</button>
           <a className="ci-btn" href={run.html_url} target="_blank" rel="noreferrer">Open in Browser</a>
        </div>
      </header>
      
      <div className="ci-run-layout">
        <aside className="ci-run-sidebar">
          <h3>Jobs</h3>
          <ul className="ci-job-list">
            {jobs.map(job => (
              <li key={job.id} className={`ci-job-item ${String(job.id) === selectedJobId ? 'selected' : ''}`} onClick={() => setSelectedJobId(String(job.id))}>
                {getStatusIcon(job.status, job.conclusion)}
                <span>{job.name}</span>
                {job.status === 'completed' && job.completed_at && job.started_at && <small>{formatDurationCompact(new Date(job.completed_at).getTime() - new Date(job.started_at).getTime())}</small>}
              </li>
            ))}
          </ul>
        </aside>
        
        <main className="ci-run-main">
          {selectedJob ? (
            <div className="ci-job-details">
               <div className="ci-job-details-header">
                  <h3>{selectedJob.name}</h3>
                  <div className="ci-job-meta">
                     {selectedJob.status === 'completed' && selectedJob.completed_at && selectedJob.started_at && <span>Elapsed: {formatDurationCompact(new Date(selectedJob.completed_at).getTime() - new Date(selectedJob.started_at).getTime())}</span>}
                  </div>
               </div>
               
               <div className="ci-job-steps">
                 <div className="ci-job-steps-header">
                   <h4>Steps</h4>
                   <button className="ci-btn" onClick={() => refetchLog()} disabled={isLogFetching}><RefreshCw size={12} className={isLogFetching ? 'is-spinning' : ''}/> {isLogFetching ? 'Loading Logs' : 'Refresh Logs'}</button>
                 </div>
                 <ul className="ci-step-list">
                   {selectedJob.steps.map(step => (
                     <li key={step.number} className={`ci-step-container ${expandedStepNumber === step.number ? 'expanded' : ''}`}>
                       <div className="ci-step-item" onClick={() => setExpandedStepNumber(expandedStepNumber === step.number ? null : step.number)}>
                         <ChevronRight size={14} className={`ci-step-chevron ${expandedStepNumber === step.number ? 'expanded' : ''}`} />
                         {getStatusIcon(step.status, step.conclusion)}
                         <span>{step.name}</span>
                         <span className="ci-step-time">
                           {step.status === 'completed' && step.completed_at && step.started_at ? formatDurationCompact(new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()) : step.status}
                         </span>
                       </div>
                       {expandedStepNumber === step.number && (
                         <div className="ci-job-logs-section">
                           <div className="ci-job-logs-viewer">
                             {isLogLoading && <div className="log-loading"><Loader2 className="is-spinning" /> Loading logs...</div>}
                             {stepLogs.has(step.number) ? (
                               <CILogViewer lines={stepLogs.get(step.number)!} />
                             ) : !isLogLoading && (
                               <div className="log-empty">
                                 {selectedJob.status === 'completed' ? (
                                    'No log output available for this step.'
                                 ) : (
                                    <div className="log-in-progress-info">
                                      <p>GitHub REST API does not provide log archives for in-progress steps until the job completes.</p>
                                      <a href={run.html_url} target="_blank" rel="noreferrer" className="ci-inline-browser-link">
                                        Open GitHub Live Stream ↗
                                      </a>
                                    </div>
                                 )}
                               </div>
                             )}
                           </div>
                         </div>
                       )}
                     </li>
                   ))}
                 </ul>
               </div>
            </div>
          ) : (
            <div className="ci-run-empty-job">Select a job to view details</div>
          )}
        </main>
      </div>
    </div>
  );
}
