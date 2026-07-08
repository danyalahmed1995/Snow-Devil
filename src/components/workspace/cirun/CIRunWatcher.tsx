import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTabsStore } from '../../../stores/tabs-store';
import { useAuthStore } from '../../../stores/auth-store';
import { useCurrentTabId } from '../TabInstanceContext';
import { useWorkflowRunWatcher } from '../../../hooks/useWorkflowRunWatcher';
import { useWorkflowJobLog } from '../../../hooks/useWorkflowJobLog';
import { formatDurationCompact, StatusIcon } from '../../analytics/CIRunRow';
import { AlertCircle, Loader2, RefreshCw, ChevronRight, Download, Check, Copy } from 'lucide-react';
import { Select } from '../../ui/Select';
import { CILogViewer, LogLineData } from './CILogViewer';
import './CIRunWatcher.css';

function getStatusIcon(status: string, conclusion: string | null) {
  return <StatusIcon status={status} conclusion={conclusion} size={14} />;
}

export function CIRunWatcher({ repositoryId, runId, initialAttempt, initialJobId }: { repositoryId: string, runId: string, initialAttempt?: number, initialJobId?: string }) {
  const activeTabId = useCurrentTabId();
  const isActive = useTabsStore(state => state.activeTabId === activeTabId);
  const updateNativeTabContext = useTabsStore(state => state.updateNativeTabContext);
  const openNativeTab = useTabsStore(state => state.openNativeTab);
  const closeTab = useTabsStore(state => state.closeTab);
  const session = useAuthStore(state => state.session);
  const isForeground = document.hasFocus() && isActive;
  
  const [selectedAttempt, setSelectedAttempt] = useState<number | undefined>(initialAttempt);
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(initialJobId);

  const [isDownloadDropdownOpen, setIsDownloadDropdownOpen] = useState(false);
  const [downloadScope, setDownloadScope] = useState<'all' | 'failed'>('all');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedStepNumber, setCopiedStepNumber] = useState<number | null>(null);
  const [logsRequested, setLogsRequested] = useState(false);

  const { data: watcherState, error, isLoading, refetch, isFetching } = useWorkflowRunWatcher(repositoryId, runId, selectedAttempt, isForeground, isActive, session.status === 'connected');

  const hasCanonicalIdentity = Boolean(repositoryId.includes('/') && runId);

  const jobs = useMemo(() => watcherState?.jobs ?? [], [watcherState?.jobs]);

  const fallbackJobId = useMemo(() => {
    const failedJob = jobs.find(j => j.conclusion === 'failure' || j.conclusion === 'timed_out');
    if (failedJob) return String(failedJob.id);
    const runningJob = jobs.find(j => j.status === 'in_progress' || j.status === 'queued' || j.status === 'waiting');
    if (runningJob) return String(runningJob.id);
    return jobs[0] ? String(jobs[0].id) : undefined;
  }, [jobs]);

  const effectiveSelectedJobId = selectedJobId && jobs.some(j => String(j.id) === selectedJobId) ? selectedJobId : fallbackJobId;
  const selectedJob = useMemo(() => jobs.find(j => String(j.id) === effectiveSelectedJobId), [jobs, effectiveSelectedJobId]);

  useEffect(() => {
    if (!watcherState?.run || !activeTabId) return;
    updateNativeTabContext(activeTabId, {
      type: 'ciRun',
      repository: repositoryId,
      repositoryId: watcherState.run.repository?.id,
      runId,
      runNumber: watcherState.run.run_number,
      attempt: selectedAttempt ?? watcherState.run.run_attempt,
      selectedJobId: effectiveSelectedJobId,
      selectedJobName: selectedJob?.name,
      schemaVersion: 1,
    });
  }, [activeTabId, effectiveSelectedJobId, repositoryId, runId, selectedAttempt, selectedJob?.name, updateNativeTabContext, watcherState]);
  
  const isJobActive = selectedJob?.status === 'in_progress';
  const { data: logData, isLoading: isLogLoading, refetch: refetchLog, isFetching: isLogFetching } = useWorkflowJobLog(
    repositoryId, 
    effectiveSelectedJobId || '',
    Boolean(logsRequested && effectiveSelectedJobId && (selectedJob?.status === 'completed' || isJobActive)),
    isJobActive
  );

  const [expandedStepNumber, setExpandedStepNumber] = useState<number | null>(null);

  const failedJobsCount = useMemo(() => jobs.filter(j => j.conclusion === 'failure' || j.conclusion === 'timed_out').length, [jobs]);

  const stripAnsi = (text: string) => {
    return text.replace(new RegExp('\\x' + '1b' + '\\[[0-9;]*[a-zA-Z]', 'g'), '');
  };

  const handleDownloadLogs = async () => {
    if (!watcherState?.run || jobs.length === 0) return;
    setIsDownloading(true);
    setDownloadProgress('');

    const targetJobs = downloadScope === 'all'
      ? jobs
      : jobs.filter(j => j.conclusion === 'failure' || j.conclusion === 'timed_out');

    if (targetJobs.length === 0) {
      setIsDownloading(false);
      return;
    }

    const logs: string[] = [];
    for (let i = 0; i < targetJobs.length; i++) {
      const job = targetJobs[i];
      setDownloadProgress(` (${i + 1}/${targetJobs.length})`);
      try {
        const res = await invoke<{ text: string | null }>('analytics_fetch_job_log', {
          repository: repositoryId,
          jobId: job.id
        });
        const plainText = res.text ? stripAnsi(res.text) : 'No logs available.';
        logs.push(
          `======================================================================\n` +
          `JOB: ${job.name} (Status: ${job.status}, Conclusion: ${job.conclusion || 'N/A'})\n` +
          `======================================================================\n\n` +
          plainText + `\n\n`
        );
      } catch (err) {
        logs.push(
          `======================================================================\n` +
          `JOB: ${job.name} (Status: ${job.status}, Conclusion: ${job.conclusion || 'N/A'})\n` +
          `======================================================================\n\n` +
          `Error fetching logs: ${err instanceof Error ? err.message : String(err)}\n\n`
        );
      }
    }

    const header =
      `======================================================================\n` +
      `REPOSITORY: ${repositoryId}\n` +
      `WORKFLOW RUN: ${watcherState.run.name} (Run #${watcherState.run.run_number})\n` +
      `DOWNLOAD SCOPE: ${downloadScope === 'all' ? 'All Jobs' : 'Failed Jobs Only'}\n` +
      `DOWNLOADED AT: ${new Date().toLocaleString()}\n` +
      `======================================================================\n\n`;

    const fileContent = header + logs.join('\n');
    const safeRepo = repositoryId.replace(/\//g, '_');
    const suffix = downloadScope === 'all' ? 'all_logs' : 'failed_logs';
    const filename = `${safeRepo}_run_${watcherState.run.run_number}_${suffix}.txt`;

    try {
      const saved = await invoke<boolean>('save_log_file', {
        content: fileContent,
        defaultFilename: filename
      });
      if (!saved) {
        console.log('User cancelled the log file saving.');
      }
    } catch (err) {
      console.error('Tauri save_log_file failed, falling back:', err);
      const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    setIsDownloading(false);
    setIsDownloadDropdownOpen(false);
  };

  const handleCopyJobLogs = async () => {
    setLogsRequested(true);
    if (!logData?.text) {
      await refetchLog();
      return;
    }
    if (!logData?.text) return;
    const plainText = stripAnsi(logData.text);
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs to clipboard:', err);
    }
  };

  const handleCopyStepLogs = async (stepNumber: number, event: React.MouseEvent) => {
    event.stopPropagation();
    const lines = stepLogs.get(stepNumber);
    if (!lines || lines.length === 0) return;

    const rawText = lines.map(line => line.text).join('\n');
    const plainText = stripAnsi(rawText);
    try {
      await navigator.clipboard.writeText(plainText);
      setCopiedStepNumber(stepNumber);
      setTimeout(() => setCopiedStepNumber(null), 2000);
    } catch (err) {
      console.error('Failed to copy step logs:', err);
    }
  };

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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

  const selectJob = (jobId: string) => {
    setSelectedJobId(jobId);
    setExpandedStepNumber(null);
    setLogsRequested(false);
  };

  const toggleStep = (stepNumber: number) => {
    const next = expandedStepNumber === stepNumber ? null : stepNumber;
    setExpandedStepNumber(next);
    if (next !== null) setLogsRequested(true);
  };

  const retry = () => void refetch();

  if (!hasCanonicalIdentity) {
    return <div className="ci-run-watcher ci-run-state" role="alert"><AlertCircle /><h2>CI run tab could not be restored</h2><p>This saved tab is missing its repository or workflow run identity.</p><div className="ci-run-state-actions"><button className="ci-btn" onClick={retry}>Retry</button><button className="ci-btn" onClick={() => openNativeTab('native:ci-health', 'ciHealth', 'CI Activity', false, true)}>Open CI Activity</button><button className="ci-btn" onClick={() => closeTab(activeTabId)}>Close Tab</button></div></div>;
  }

  if (session.status === 'checking') {
    return <div className="ci-run-watcher ci-run-state" role="status"><Loader2 className="is-spinning" /><h2>Restoring CI run…</h2><p>Waiting for your GitHub session before loading run #{runId}.</p></div>;
  }

  if (session.status === 'disconnected' || session.status === 'error') {
    return <div className="ci-run-watcher ci-run-state" role="alert"><AlertCircle /><h2>Waiting for GitHub access</h2><p>{session.status === 'error' ? session.message : 'Reconnect GitHub to load this workflow run.'}</p><div className="ci-run-state-actions"><button className="ci-btn" onClick={retry}>Retry</button><button className="ci-btn" onClick={() => openNativeTab('native:ci-health', 'ciHealth', 'CI Activity', false, true)}>Open CI Activity</button><button className="ci-btn" onClick={() => closeTab(activeTabId)}>Close Tab</button></div></div>;
  }

  if (isLoading && !watcherState) {
    return (
      <div className="ci-run-watcher home-loading-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '24px' }}>
        <div className="global-spinner" />
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: 'var(--text-primary)', animation: 'fresh-fade-in 0.5s ease-out' }}>Loading workflow run…</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginTop: '12px', animation: 'fresh-fade-in 0.7s ease-out backwards' }}>{repositoryId} · run {runId}</p>
        </div>
      </div>
    );
  }

  if (error || !watcherState) {
    const message = String(error instanceof Error ? error.message : error ?? 'unknown_error');
    const friendly = message.includes('404') || message.includes('not_found') ? 'The workflow run was not found or is no longer available.'
      : message.includes('403') || message.includes('forbidden') ? 'GitHub denied access to this workflow run.'
        : message.includes('rate') ? 'GitHub rate limiting prevented the run from loading.'
          : 'Snow Devil could not load this workflow run.';
    return <div className="ci-run-watcher ci-run-state" role="alert"><AlertCircle /><h2>Workflow run unavailable</h2><p>{friendly}</p><small>{repositoryId} · run {runId}</small><div className="ci-run-state-actions"><button className="ci-btn" onClick={retry}>Retry</button><button className="ci-btn" onClick={() => openNativeTab('native:ci-health', 'ciHealth', 'CI Activity', false, true)}>Open CI Activity</button><button className="ci-btn" onClick={() => closeTab(activeTabId)}>Close Tab</button></div></div>;
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

           <div className="download-dropdown-container" style={{ position: 'relative', marginLeft: 'auto' }}>
             <button className="ci-btn" onClick={() => setIsDownloadDropdownOpen(!isDownloadDropdownOpen)} disabled={jobs.length === 0}>
               <Download size={14} /> Download Logs
             </button>
             {isDownloadDropdownOpen && (
               <>
                 <div className="download-dropdown-overlay" onClick={() => setIsDownloadDropdownOpen(false)} />
                 <div className="download-dropdown-menu">
                   <div className="download-dropdown-header">Log Download Scope</div>
                   <div 
                     className="download-dropdown-option"
                     onClick={() => setDownloadScope('all')}
                   >
                     <div className="download-dropdown-option-icon">
                       {downloadScope === 'all' && <Check size={12} />}
                     </div>
                     <span>All Jobs ({jobs.length})</span>
                   </div>
                   <div 
                     className={`download-dropdown-option ${failedJobsCount === 0 ? 'is-disabled' : ''}`}
                     onClick={() => failedJobsCount > 0 && setDownloadScope('failed')}
                   >
                     <div className="download-dropdown-option-icon">
                       {downloadScope === 'failed' && <Check size={12} />}
                     </div>
                     <span>Failed Jobs Only ({failedJobsCount})</span>
                   </div>
                   <button 
                     className="download-dropdown-action-btn"
                     onClick={handleDownloadLogs}
                     disabled={isDownloading || (downloadScope === 'failed' && failedJobsCount === 0)}
                   >
                     {isDownloading ? (
                       <>
                         <Loader2 size={12} className="is-spinning" />
                         Downloading{downloadProgress}...
                       </>
                     ) : (
                       'Start Download'
                     )}
                   </button>
                 </div>
               </>
             )}
           </div>
        </div>
      </header>
      
      <div className="ci-run-layout">
        <aside className="ci-run-sidebar">
          <h3>Jobs</h3>
          <ul className="ci-job-list">
            {jobs.map(job => (
              <li key={job.id} className={`ci-job-item ${String(job.id) === effectiveSelectedJobId ? 'selected' : ''}`} onClick={() => selectJob(String(job.id))}>
                {getStatusIcon(job.status, job.conclusion)}
                <span>{job.name}</span>
                {job.status === 'completed' && job.completed_at && job.started_at && <small>{formatDurationCompact(new Date(job.completed_at).getTime() - new Date(job.started_at).getTime())}</small>}
              </li>
            ))}
          </ul>
        </aside>
        
        <main className="ci-run-main">
          {selectedJob ? (
            <div className="ci-job-details" key={selectedJob.id}>
               <div className="ci-job-details-header">
                  <h3>{selectedJob.name}</h3>
                  <div className="ci-job-meta">
                     {selectedJob.status === 'completed' && selectedJob.completed_at && selectedJob.started_at && <span>Elapsed: {formatDurationCompact(new Date(selectedJob.completed_at).getTime() - new Date(selectedJob.started_at).getTime())}</span>}
                  </div>
               </div>
               
               <div className="ci-job-steps">
                 <div className="ci-job-steps-header">
                   <h4>Steps</h4>
                   <div style={{ display: 'flex', gap: '8px' }}>
                     <button
                       className="ci-btn" 
                       onClick={handleCopyJobLogs}
                       disabled={!logData?.text || isLogFetching}
                       title="Copy all logs of this job to clipboard"
                     >
                       {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied!' : 'Copy Logs'}
                     </button>
                     <button className="ci-btn" onClick={() => { setLogsRequested(true); void refetchLog(); }} disabled={isLogFetching}>
                       <RefreshCw size={12} className={isLogFetching ? 'is-spinning' : ''}/> {logData?.text ? 'Refresh Logs' : isLogFetching ? 'Loading Logs' : 'Load Logs'}
                     </button>
                   </div>
                 </div>
                 <ul className="ci-step-list">
                   {selectedJob.steps.map(step => (
                     <li key={step.number} className={`ci-step-container ${expandedStepNumber === step.number ? 'expanded' : ''}`}>
                        <div className="ci-step-item" onClick={() => toggleStep(step.number)}>
                          <ChevronRight size={14} className={`ci-step-chevron ${expandedStepNumber === step.number ? 'expanded' : ''}`} />
                          {getStatusIcon(step.status, step.conclusion)}
                          <span>{step.name}</span>
                          {expandedStepNumber === step.number && stepLogs.has(step.number) && (
                            <button
                              className="ci-step-copy-btn"
                              onClick={(e) => handleCopyStepLogs(step.number, e)}
                              title="Copy step logs to clipboard"
                              style={{ marginLeft: 'auto' }}
                            >
                              {copiedStepNumber === step.number ? (
                                <Check size={12} style={{ color: 'var(--success-color)' }} />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          )}
                          <span className="ci-step-time" style={expandedStepNumber === step.number && stepLogs.has(step.number) ? { marginLeft: 0 } : {}}>
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
