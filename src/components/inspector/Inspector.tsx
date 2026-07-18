import type { ReactNode } from 'react';
import type { AnalyticsInspectable } from '../../analytics/types';
import { useMemo, useState } from 'react';
import { X, ArrowRightCircle, History, Workflow } from 'lucide-react';
import { useLayoutStore } from '../../stores/layout-store';
import { useQueryClient } from '@tanstack/react-query';
import { resolveEntityTabTarget } from '../../lib/entity-target';
import { githubLabelStyle } from '../../lib/color-contrast';
import { parseGitHubIssueOrPR, parseRelease } from '../../lib/flow-parser';
import { formatEntityTitle, formatEventTitle, formatSubjectType, humanizeSimulatorValue } from '../../simulator/simulator-presentation';
import { useFlowStore } from '../../stores/flow-store';
import { useModeStore } from '../../stores/mode-store';
import { isNativeTab, useTabsStore } from '../../stores/tabs-store';
import type { FlowItem } from '../../types/flow';
import { formatTimeInStage, normalizeWorkflowItem } from '../../lib/workflow-presentation';
import type { WorkItemOpenTarget, WorkSurface } from '../../lib/work-item-open-actions';
import { WorkItemOpenActions } from '../work-items/WorkItemOpenActions';
import { StatusIcon, formatDurationCompact, shouldUseDenseCIJobRendering } from '../analytics/CIRunRow';
import { useWorkflowRunWatcher } from '../../hooks/useWorkflowRunWatcher';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useArchitectureStore } from '../../architecture/architecture-store';
import { decisionFor, decisionLabel } from '../../architecture/decision-analysis';
import { incrementArchitectureDiagnostic } from '../../architecture/diagnostics';
import type { ArchitectureSnapshot, PullRequestArchitectureImpact } from '../../architecture/types';
import './Inspector.css';
import { SketchInspector } from '../sketch/SketchInspector';

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object'; }

function nodesFromPage(page: unknown): Record<string, unknown>[] {
  if (!record(page)) return [];
  for (const key of ['search', 'releases', 'pullRequests', 'issues']) {
    const connection = page[key];
    if (!record(connection) || !Array.isArray(connection.nodes)) continue;
    return connection.nodes.filter(record);
  }
  return [];
}

function useResolvedFlowItem(selectedItemId?: string): FlowItem | undefined {
  const queryClient = useQueryClient();
  return useMemo(() => {
    if (!selectedItemId) return undefined;
    for (const [key, data] of queryClient.getQueriesData<unknown>({ queryKey: ['flow'] })) {
      if (!record(data) || !Array.isArray(data.pages)) continue;
      for (const page of data.pages) {
        const node = nodesFromPage(page).find(item => item.id === selectedItemId);
        if (!node) continue;
        return key.includes('releases') ? parseRelease(node, '', '', '') : parseGitHubIssueOrPR(node, node.__typename === 'Issue' ? 'issue' : 'pull_request');
      }
    }
    for (const [, data] of queryClient.getQueriesData<unknown>({ queryKey: ['homeSummary'] })) {
      if (!record(data) || !record(data.previews)) continue;
      for (const items of Object.values(data.previews)) {
        if (!Array.isArray(items)) continue;
        const found = items.find(item => record(item) && item.id === selectedItemId);
        if (found) return found as FlowItem;
      }
    }
    return undefined;
  }, [selectedItemId, queryClient]);
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warning' | 'danger' | 'info' }) {
  return <span className={`inspector-entity-badge inspector-entity-badge--${tone}`}>{children}</span>;
}

function Meta({ label, children }: { label: string; children: ReactNode }) { return <div className="meta-row"><span className="meta-key">{label}</span><span className="meta-val">{children}</span></div>; }
type InspectorTab = 'details' | 'timeline' | 'architecture';

function ArchitectureDetails({ impact, selectedComponentId }: { impact: PullRequestArchitectureImpact; selectedComponentId?: string }) {
  const component = impact.snapshot.components.find(item => item.id === selectedComponentId) ?? impact.snapshot.components.find(item => item.id === impact.primaryComponentId);
  const affected = impact.affectedComponents.find(item => item.component.id === component?.id);
  const outgoing = impact.snapshot.dependencies.filter(item => item.fromComponentId === component?.id);
  const incoming = impact.snapshot.dependencies.filter(item => item.toComponentId === component?.id);
  const decision = component ? decisionFor(impact, component.id) : undefined;
  const name = (id: string) => impact.snapshot.components.find(item => item.id === id)?.name ?? id;
  if (!component) return <div className="inspector-details"><section className="inspector-section"><h5 className="section-title">Architecture Context</h5><p className="inspector-partial">No reliable component boundary was identified. Review the unmapped changed files in Architecture Context.</p></section></div>;
  return <div className="inspector-details">
    <section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge tone={component.id === impact.primaryComponentId ? 'good' : 'info'}>{component.id === impact.primaryComponentId ? 'Primary Component' : 'Architecture Component'}</Badge><span className="inspector-stage-badge">{component.kind}</span></div><h4 className="inspector-title">{component.name}</h4><p className="inspector-repository">{impact.repositoryId}</p></section>
    <section className="inspector-section"><h5 className="section-title">Component Summary</h5><div className="metadata"><Meta label="Root paths">{component.rootPaths.join(', ')}</Meta><Meta label="Changed files">{affected?.files.length ?? 0}</Meta><Meta label="Line changes">+{affected?.additions ?? 0} / −{affected?.deletions ?? 0}</Meta><Meta label="Direct dependencies">{outgoing.length}</Meta><Meta label="Direct dependents">{incoming.length}</Meta><Meta label="Owners">{component.owners.map(owner => owner.login).join(', ') || 'Not available'}</Meta><Meta label="Confidence">{component.confidence.level} ({Math.round(component.confidence.score * 100)}%)</Meta></div></section>
    {affected?.files.length ? <section className="inspector-section"><h5 className="section-title">Changed Files</h5>{affected.files.slice(0, 8).map(file => <p className="meta-val inspector-architecture-path" key={file.path}>{file.path}</p>)}{affected.files.length > 8 && <p className="inspector-partial">+{affected.files.length - 8} more files</p>}</section> : null}
    {(outgoing.length > 0 || incoming.length > 0) && <section className="inspector-section"><h5 className="section-title">Dependencies</h5>{outgoing.map(item => <p className="meta-val" key={`out:${item.toComponentId}`}>Uses {name(item.toComponentId)}</p>)}{incoming.map(item => <p className="meta-val" key={`in:${item.fromComponentId}`}>Used by {name(item.fromComponentId)}</p>)}</section>}
    {decision && <><section className="inspector-section"><h5 className="section-title">Change Impact</h5><Meta label="Classification">{decisionLabel(decision.impactTier)}</Meta><Meta label="Score / confidence">{decision.impactScore} · {decision.impactConfidence}</Meta>{decision.impactReasons.map(item => <p className="meta-val" key={`impact:${item.code}`}><strong>{item.label}</strong><br/><span>{item.evidenceRefs.join(' · ')}</span></p>)}</section><section className="inspector-section"><h5 className="section-title">Fix Strategy</h5><Meta label="Classification">{decisionLabel(decision.fixTier)}</Meta><Meta label="Score / confidence">{decision.fixScore} · {decision.fixConfidence}</Meta>{decision.fixReasons.map(item => <p className="meta-val" key={`fix:${item.code}`}><strong>{item.label}</strong><br/><span>{item.evidenceRefs.join(' · ')}</span></p>)}{decision.validationTargets.map(target => <p className="meta-val" key={`validation:${target.label}`}><strong>Validation:</strong> {target.label}</p>)}{decision.alternatives?.length ? <><h6 className="section-title inspector-subtitle">Alternative candidates</h6>{decision.alternatives.map(candidate => <p className="meta-val" key={`alternative:${candidate.componentId}`}><strong>#{candidate.rank} {name(candidate.componentId)} · {candidate.score} · {candidate.confidence}</strong><br/>{candidate.reason}. {candidate.riskTradeoff}. {candidate.validationTarget?.label ?? 'Validation target unavailable.'}</p>)}</> : null}</section></>}
    {impact.decisionContext && <section className="inspector-section"><h5 className="section-title">Context evidence</h5>{impact.decisionContext.ci ? <p className="meta-val"><strong>CI:</strong> {[impact.decisionContext.ci.workflow, impact.decisionContext.ci.job, impact.decisionContext.ci.failedStep, ...(impact.decisionContext.ci.testNames ?? []), ...(impact.decisionContext.ci.filePaths ?? []), impact.decisionContext.ci.headSha].filter(Boolean).join(' · ')}</p> : null}{impact.decisionContext.issue ? <p className="meta-val"><strong>Issue:</strong> {[impact.decisionContext.issue.number && `#${impact.decisionContext.issue.number}`, impact.decisionContext.issue.title, ...(impact.decisionContext.issue.filePaths ?? []), ...(impact.decisionContext.issue.labels ?? [])].filter(Boolean).join(' · ')}</p> : null}</section>}
    <section className="inspector-section"><h5 className="section-title">Mapping Evidence</h5>{affected?.files[0]?.reasons.map(item => <p className="meta-val" key={`${item.source}:${item.detail}`}><strong>{item.source}</strong><br/>{item.detail}</p>) ?? <p className="meta-val">No changed-file evidence is available.</p>}<p className="inspector-partial">Snapshot: {impact.snapshot.status} · algorithm v{impact.snapshot.algorithmVersion} · {impact.architectureSnapshotSha}</p></section>
  </div>;
}

function RepositoryArchitectureDetails({ snapshot, selectedComponentId }: { snapshot: ArchitectureSnapshot; selectedComponentId?: string }) {
  const component = snapshot.components.find(item => item.id === selectedComponentId) ?? snapshot.components[0];
  if (!component) return <p className="inspector-empty">No architecture component is available for this repository.</p>;
  const files = snapshot.files.filter(file => file.componentId === component.id);
  const outgoing = snapshot.dependencies.filter(item => item.fromComponentId === component.id);
  const incoming = snapshot.dependencies.filter(item => item.toComponentId === component.id);
  const name = (id: string) => snapshot.components.find(item => item.id === id)?.name ?? id;
  return <div className="inspector-details"><section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge tone="info">Architecture Component</Badge><span className="inspector-stage-badge">{component.kind}</span></div><h4 className="inspector-title">{component.name}</h4><p className="inspector-repository">{snapshot.repositoryId}</p></section><section className="inspector-section"><h5 className="section-title">Component Summary</h5><div className="metadata"><Meta label="Root paths">{component.rootPaths.join(', ')}</Meta><Meta label="Files mapped">{files.length}</Meta><Meta label="Manifests">{component.manifestPaths.join(', ') || 'None detected'}</Meta><Meta label="Direct dependencies">{outgoing.length}</Meta><Meta label="Direct dependents">{incoming.length}</Meta><Meta label="Owners">{component.owners.map(owner => owner.login).join(', ') || 'Not available'}</Meta><Meta label="Confidence">{component.confidence.level} ({Math.round(component.confidence.score * 100)}%)</Meta></div></section>{(outgoing.length>0||incoming.length>0)&&<section className="inspector-section"><h5 className="section-title">Dependencies</h5>{outgoing.map(edge=><p className="meta-val" key={`out:${edge.toComponentId}`}>Uses {name(edge.toComponentId)} · {edge.kind}</p>)}{incoming.map(edge=><p className="meta-val" key={`in:${edge.fromComponentId}`}>Used by {name(edge.fromComponentId)} · {edge.kind}</p>)}</section>}<section className="inspector-section"><h5 className="section-title">Snapshot Evidence</h5><p className="meta-val">{files[0]?.reasons[0]?.detail ?? 'No file mapping evidence is available.'}</p><p className="inspector-partial">{snapshot.status} · {snapshot.baseCommitSha} · {new Date(snapshot.generatedAt).toLocaleString()}</p></section></div>;
}

function AnalyticsDetails({ tab }: { tab: InspectorTab }) {
  const activeTabId = useTabsStore(state => state.activeTabId);
  const selected = useFlowStore(state => state.getTabState(activeTabId).selectedAnalyticsEntity);
  if (!selected) return <p className="inspector-empty">Select a delivery risk to understand why it appears.</p>;
  const isRisk = selected.kind === 'inventory';
  return <div className={`inspector-details inspector-details--${tab}`}>
    <section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge tone={isRisk ? 'warning' : selected.kind === 'ci_health' ? 'info' : 'good'}>{isRisk ? 'Delivery Risk' : selected.kind.replace(/_/g, ' ')}</Badge>{selected.state && <span className="inspector-stage-badge">{selected.state}</span>}</div><h4 className="inspector-title">{selected.title}</h4>{selected.repositoryId && <p className="inspector-repository">{selected.repositoryId}{selected.number ? ` #${selected.number}` : ''}</p>}</section>
    <section className="inspector-section"><h5 className="section-title">{isRisk ? 'Summary' : 'Why it appears'}</h5>{isRisk && <div className="metadata"><Meta label="Work item">{selected.title}</Meta><Meta label="Repository">{selected.repositoryId ?? 'Unknown'}</Meta><Meta label="Entity type">{selected.entityType?.replace(/_/g, ' ') ?? 'Unknown'}</Meta><Meta label="Current state">{selected.state ?? 'Unknown'}</Meta><Meta label="Primary risk">{selected.riskLabel ?? selected.riskCategory?.replace(/_/g, ' ') ?? 'Unknown'}</Meta><Meta label="Requested by">{selected.riskActor ?? 'Unknown actor'}</Meta><Meta label="Since">{selected.riskStartedAt ? new Date(selected.riskStartedAt).toLocaleString() : 'Source timestamp unavailable'}</Meta><Meta label="Secondary risks">{selected.secondaryRisks?.map(value => value.replace(/_/g, ' ')).join(', ') || 'None'}</Meta><Meta label="Age in risk state">{selected.riskAgeDays == null ? 'Unknown' : `${Math.ceil(selected.riskAgeDays)} business days`}</Meta>{selected.occurredAt && <Meta label="Last meaningful activity">{new Date(selected.occurredAt).toLocaleString()} · {selected.lastActivityLabel ?? 'activity'} · {selected.lastActivityActor ?? 'Unknown actor'}</Meta>}<Meta label="Review decision">{selected.reviewDecision?.replace(/_/g, ' ') ?? 'unknown'}</Meta><Meta label="Merge state">{selected.mergeStateStatus?.replace(/_/g, ' ') ?? 'unknown'}</Meta><Meta label="Required approvals">{selected.requiredApprovalCount ?? 'Unknown'}</Meta><Meta label="Qualifying approvals">{selected.qualifyingApprovalCount ?? 'Unknown'}</Meta><Meta label="Relevant owner">{selected.owner ?? 'Unassigned'}</Meta><Meta label="Confidence">{selected.confidence ?? 'unknown'}</Meta>{selected.latestSnapshotAt && <Meta label="Data freshness">GitHub data synchronized {new Date(selected.latestSnapshotAt).toLocaleString()}</Meta>}</div>}<h5 className="section-title inspector-subtitle">Why it is here</h5><p className="meta-val">{selected.reason ?? 'Selected from delivery analytics.'}</p>{!isRisk && <div className="metadata">{selected.confidence && <Meta label="Confidence">{selected.confidence}</Meta>}{selected.coverage && <Meta label="Coverage">{selected.coverage}</Meta>}{selected.sampleCount != null && <Meta label="Qualifying samples">{selected.sampleCount}</Meta>}{selected.excludedCount != null && <Meta label="Excluded / incomplete">{selected.excludedCount}</Meta>}{selected.occurredAt && <Meta label="Last activity">{new Date(selected.occurredAt).toLocaleString()}</Meta>}{selected.relatedEntityIds && <Meta label="Related entities">{selected.relatedEntityIds.length}</Meta>}</div>}{selected.definition && !isRisk && <p className="inspector-partial">{selected.definition}</p>}</section>
    {selected.lineage && <section className="inspector-section inspector-lineage"><h5 className="section-title">Metric lineage</h5><div className="metadata"><Meta label="Formula">{selected.lineage.formula}</Meta><Meta label="Numerator">{selected.lineage.numerator}</Meta><Meta label="Denominator">{selected.lineage.denominator}</Meta><Meta label="Time basis">{selected.lineage.timeBasis}</Meta><Meta label="Coverage">{selected.lineage.coverageStart ? new Date(selected.lineage.coverageStart).toLocaleDateString() : 'Unavailable'} – {selected.lineage.coverageEnd ? new Date(selected.lineage.coverageEnd).toLocaleDateString() : 'current'}</Meta><Meta label="Sample quality">{selected.lineage.sampleCount} included · {selected.lineage.excludedOrIncompleteCount} excluded/incomplete</Meta></div><div><strong className="meta-key">Included repositories</strong><p className="meta-val">{selected.lineage.repositoriesIncluded.join(', ') || 'None'}</p></div><div><strong className="meta-key">Included entity types</strong><p className="meta-val">{selected.lineage.includedEntityTypes.join(', ')}</p></div><div><strong className="meta-key">Evidence sources</strong><p className="meta-val">{selected.lineage.evidenceSources.join(' · ')}</p></div>{selected.lineage.failedOrSkipped.length>0&&<p className="inspector-partial">Failed, skipped, or partial: {selected.lineage.failedOrSkipped.join(' · ')}</p>}</section>}
    {selected.evidence && selected.evidence.length > 0 && <section className="inspector-section"><h5 className="section-title">Evidence</h5><p className="inspector-evidence-label">{selected.confidence === 'exact' ? 'Exact evidence' : 'Partial evidence'}</p><div className="metadata"><Meta label="Checks">{selected.checksState ?? 'unknown'}</Meta><Meta label="Review">{selected.reviewSummaryState ?? 'unknown'}</Meta><Meta label="Mergeability">{selected.mergeability ?? 'unknown'}</Meta><Meta label="Delivery">{selected.deliveryState ?? 'unknown'}</Meta></div><details className="inspector-technical"><summary>Technical details</summary>{selected.evidence.map(item => <p className="meta-val" key={item}>{item}</p>)}</details></section>}
    {selected.missingEvidence && selected.missingEvidence.length > 0 && <section className="inspector-section"><h5 className="section-title">Unknown evidence</h5>{selected.missingEvidence.map(item => <p className="meta-val" key={item}>{item}</p>)}</section>}
    {isRisk && <section className="inspector-section"><h5 className="section-title">Suggested next action</h5><p className="meta-val">{selected.suggestedAction ?? 'Inspect evidence'}</p></section>}
    {selected.timeline && selected.timeline.length > 0 && <section className="inspector-section inspector-timeline-section"><h5 className="section-title">Delivery timeline</h5><div className="inspector-timeline">{selected.timeline.map(item => <div key={`${item.label}-${item.occurredAt}`}><i /><span><strong>{item.label}</strong><small>{new Date(item.occurredAt).toLocaleString()} | {item.confidence}</small></span></div>)}</div></section>}
  </div>;
}

function WorkflowRunDetails({ selected, tab }: { selected: AnalyticsInspectable; tab: InspectorTab }) {
  const [loadJobs, setLoadJobs] = useState(false);
  const metadata = selected.metadata ?? (selected.evidence && selected.evidence.length > 0 ? JSON.parse(selected.evidence[0]) : null);
  const runId = String(selected.runId ?? metadata?.runId ?? '');
  
  const { data: watcherState, isLoading, error } = useWorkflowRunWatcher(
    selected.repositoryId || '',
    runId,
    metadata?.runAttempt ? parseInt(metadata.runAttempt, 10) : undefined,
    true,
    loadJobs
  );

  if (!metadata) return <p className="inspector-empty">No workflow data available.</p>;

  const runObj = watcherState?.run;
  const jobs = watcherState?.jobs;

  const durationMs = runObj 
    ? (runObj.status === 'completed' 
        ? new Date(runObj.updated_at).getTime() - new Date(runObj.run_started_at).getTime()
        // eslint-disable-next-line react-hooks/purity
        : Date.now() - new Date(runObj.run_started_at).getTime())
    : metadata.durationMs;

  const durationStr = formatDurationCompact(durationMs);
  const currentConclusion = runObj ? runObj.conclusion : (metadata.conclusion ?? selected.state);
  const currentStatusText = runObj 
    ? (runObj.conclusion ?? runObj.status) 
    : (metadata.conclusion ?? metadata.status ?? selected.state);

  const tone = currentConclusion === 'success' ? 'good' : currentConclusion === 'failure' || currentConclusion === 'timed_out' ? 'danger' : 'neutral';
  const completedTime = runObj ? (runObj.status === 'completed' ? runObj.updated_at : null) : metadata.completedAt;

  return <div className={`inspector-details inspector-details--${tab}`}>
    <section className="inspector-section inspector-header-section">
      <div className="inspector-entity-row">
        <Badge tone={tone}>Workflow Run</Badge>
        {currentStatusText && <span className="inspector-stage-badge">{currentStatusText.replace(/_/g, ' ')}</span>}
      </div>
      <h4 className="inspector-title">{selected.title}</h4>
      {selected.repositoryId && <p className="inspector-repository">{selected.repositoryId}{metadata.runNumber ? ` #${metadata.runNumber}` : ''}</p>}
    </section>
    
    <section className="inspector-section">
      <h5 className="section-title">Details</h5>
      <div className="metadata">
        <Meta label="Workflow">{metadata.workflowPath?.split('/').pop() || 'Unknown'}</Meta>
        <Meta label="Event">{metadata.event || 'Unknown'}</Meta>
        <Meta label="Started">{metadata.startedAt ? new Date(metadata.startedAt).toLocaleString() : 'Unknown'}</Meta>
        <Meta label="Completed">{completedTime ? new Date(completedTime).toLocaleString() : 'Running...'}</Meta>
        <Meta label="Duration">{durationStr}</Meta>
        {metadata.headBranch && <Meta label="Branch">{metadata.headBranch}</Meta>}
        {metadata.pullRequestNumber && <Meta label="Pull Request"><a href={`https://github.com/${selected.repositoryId}/pull/${metadata.pullRequestNumber}`} target="_blank" rel="noreferrer" className="open-link">#{metadata.pullRequestNumber}</a></Meta>}
        {metadata.headSha && <Meta label="Commit"><a role="button" tabIndex={0} className="open-link" onClick={() => useTabsStore.getState().openNativeTab(`native:commit:${selected.repositoryId}:${metadata.headSha}`, 'commitDiff', (metadata.headSha as string).substring(0, 7), false, true, { type: 'commit', repository: selected.repositoryId || '', sha: metadata.headSha as string })}>{(metadata.headSha as string).substring(0, 7)}</a></Meta>}
      </div>
      {metadata.commitMessage && <p className="inspector-partial">Message: {metadata.commitMessage}</p>}
    </section>

    <section className="inspector-section">
      <h5 className="section-title">Jobs</h5>
      {!loadJobs && (!jobs || jobs.length === 0) && <button className="inspector-load-jobs-btn" type="button" onClick={() => setLoadJobs(true)}>Load jobs</button>}
      {isLoading && <div className="ci-jobs-loading"><div className="status-icon-wrapper state-running" style={{ width: 14, height: 14 }}><div className="spinner-ring" style={{ width: 14, height: 14 }} /></div> Loading jobs...</div>}
      {error && <div className="ci-jobs-error">{error.message === 'missing_workflow_scope' ? 'Missing workflow permission. Please reconnect GitHub in Settings.' : 'Failed to load jobs'}</div>}
      {loadJobs && jobs?.length === 0 && <div className="ci-jobs-empty">No jobs found</div>}
      {jobs && jobs.length > 0 && (
        <ul className={`ci-jobs-list${shouldUseDenseCIJobRendering(jobs.length) ? ' ci-jobs-list--dense' : ''}`}>
          {jobs.map(job => (
            <li 
              key={job.id} 
              className="ci-job-item"
              onClick={() => {
                const runIdStr = metadata?.runId ?? selected.id;
                useTabsStore.getState().openNativeTab(
                  `ciRun:${selected.repositoryId}:${runIdStr}`,
                  'ciRun',
                  `CI #${metadata?.runNumber ?? '?'}`,
                  false,
                  true,
                  {
                    type: 'ciRun',
                    repository: selected.repositoryId || '',
                    runId: String(runIdStr),
                    jobId: String(job.id)
                  }
                );
              }}
            >
              <div className="ci-job-item-header">
                <StatusIcon status={job.status} conclusion={job.conclusion} size={14} />
                <span className="ci-job-name" title={job.name}>{job.name}</span>
              </div>
              <div className="ci-job-item-footer">
                {job.status === 'in_progress' && job.steps?.length > 0 && (
                  <span className="ci-job-step-count">{job.steps.filter(s => s.status === 'completed').length} / {job.steps.length}</span>
                )}
                {job.conclusion === 'failure' && job.steps?.find(s => s.conclusion === 'failure') && (
                  <span className="ci-job-failed-step" title={`Failed: ${job.steps.find(s => s.conclusion === 'failure')?.name}`}>
                    Failed: {job.steps.find(s => s.conclusion === 'failure')?.name}
                  </span>
                )}
                <span className={`ci-job-duration${job.started_at && job.completed_at ? ' ci-job-duration--finished' : ''}`}>
                  {job.started_at && job.completed_at ? formatDurationCompact(new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) : ''}
                  {job.started_at && !job.completed_at ? (
                    <span className="ci-job-running-text">
                      Running<span className="ci-job-cursor" />
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  </div>;
}

function FlowDetails({ item, mode, tab }: { item: FlowItem; mode: 'live' | 'demo'; tab: InspectorTab }) {
  const value = normalizeWorkflowItem(item, mode);
  const tone = value.status === 'failing' ? 'danger' : value.status === 'changes_requested' ? 'warning' : value.stage === 'ready' || value.stage === 'merged' || value.stage === 'released' || value.stage === 'deployed' ? 'good' : 'info';
  return <div className={`inspector-details inspector-details--${tab}`}>
    <section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge tone={tone}>{value.type === 'pull_request' ? 'Pull Request' : value.type}</Badge><span className="inspector-stage-badge">{value.stage.replace(/_/g, ' ')}</span>{value.isDraft && <Badge>Draft</Badge>}{value.isBot && <Badge>Bot</Badge>}</div><h4 className="inspector-title">{value.title}</h4><p className="inspector-repository">{value.repositoryName}{value.number ? ` #${value.number}` : ''}</p></section>
    <section className="inspector-section inspector-why"><h5 className="section-title">Why it's here</h5><p className="meta-val">{value.stageReason}</p>{value.attentionReasons && value.attentionReasons.length > 0 && <p className="inspector-partial">Attention: {value.attentionReasons.join(', ').replace(/_/g, ' ')}</p>}</section>
    <section className="inspector-section"><h5 className="section-title">Details</h5><div className="metadata"><Meta label="Author">{value.author?.login ?? 'Not reported'}</Meta><Meta label="Actor">{value.actorClassification ?? 'unknown'}</Meta><Meta label="Created">{new Date(value.createdAt).toLocaleString()}</Meta><Meta label="Updated">{new Date(value.updatedAt).toLocaleString()}</Meta><Meta label="Time in stage">{formatTimeInStage(value)}</Meta>{value.baseBranch && <Meta label="Base branch">{value.baseBranch}</Meta>}{value.headBranch && <Meta label="Head branch">{value.headBranch}</Meta>}<Meta label="Checks">{value.checksSummary?.state ?? 'Not reported'}</Meta><Meta label="Review">{value.reviewSummary?.state.replace(/_/g, ' ') ?? 'Not reported'}</Meta>{value.reviewSummary && <Meta label="Approval progress">{value.reviewSummary.reviews.filter(review => review.state === 'APPROVED').length} approvals</Meta>}{value.assignees && <Meta label="Assignees">{value.assignees.map(actor => actor.login).join(', ') || 'Unassigned'}</Meta>}{value.reviewSummary?.requestedReviewers && <Meta label="Requested reviewers">{value.reviewSummary.requestedReviewers.join(', ') || 'None'}</Meta>}{value.commentCount != null && <Meta label="Comments">{value.commentCount}</Meta>}{value.commitCount != null && <Meta label="Commits">{value.commitCount}</Meta>}{value.environment && <Meta label="Environment">{value.environment}</Meta>}<Meta label="Confidence">{value.confidence ?? 'unavailable'}</Meta><Meta label="Completeness">{value.completeness ?? 'unknown'}</Meta></div>{value.completenessReason && <p className="inspector-partial">{value.completenessReason}</p>}{value.missingEvidence && value.missingEvidence.length > 0 && <p className="inspector-partial">{value.missingEvidence.join('. ')}</p>}</section>
    {value.labels && value.labels.length > 0 && <section className="inspector-section"><h5 className="section-title">Labels</h5><div className="labels-container">{value.labels.map(label => <span key={label.name} className="label-badge" style={githubLabelStyle(label.color)} data-tooltip={label.name} aria-label={`Label: ${label.name}`}>{label.name}</span>)}</div></section>}
    <section className="inspector-section inspector-timeline-section"><h5 className="section-title">Stage History</h5>{value.stageHistory?.length ? <div className="inspector-timeline">{value.stageHistory.map(entry => <div key={entry.id}><i /><span><strong>{entry.label}</strong><small>{new Date(entry.occurredAt).toLocaleString()}{entry.inferred ? ' · inferred' : ''}</small></span></div>)}</div> : <p className="meta-val">No synchronized stage history is available.</p>}</section>
  </div>;
}

import { ENABLE_FLOW_ANALYTICS } from '../../config/features';

export function Inspector() {
  if (import.meta.env.DEV) incrementArchitectureDiagnostic('inspectorRenders');
  const [copyStatus, setCopyStatus] = useState('');
  const [inspectorTabState, setInspectorTabState] = useState<{ entityKey:string; tab:InspectorTab }>({ entityKey:'', tab:'details' });
  const appMode = useModeStore(state => state.mode);
  const analyticsSettings = useAnalyticsSettingsStore(state => state.settings);
  const updateAnalyticsSettings = useAnalyticsSettingsStore(state => state.updateSettings);
  const setInspectorOpen = useLayoutStore(state => state.setInspectorOpen);
  const { tabs, activeTabId, openNativeTab } = useTabsStore();
  const flowState = useFlowStore(state => state.getTabState(activeTabId));
  const architectureState = useArchitectureStore(state => state.states[activeTabId]);
  const activeTab = tabs.find(tab => tab.id === activeTabId);
  const isSketchBoard = activeTab && isNativeTab(activeTab) && activeTab.kind === 'sketchBoard';
  const resolvedItem = useResolvedFlowItem(flowState.selectedItemId);
  const selectedItem = flowState.selectedFlowItem ?? resolvedItem;
  const simulatorEntity = flowState.selectedSimulatorEntity;
  const mockFlowItemFromSimulator = simulatorEntity ? {
    id: simulatorEntity.id,
    type: simulatorEntity.subjectType,
    repositoryId: simulatorEntity.repositoryId,
    repositoryName: simulatorEntity.repositoryId,
    owner: simulatorEntity.repositoryId.split('/')[0] || '',
    number: simulatorEntity.number,
    title: simulatorEntity.title,
    stage: simulatorEntity.stage,
    status: simulatorEntity.status,
    createdAt: simulatorEntity.createdAt,
    updatedAt: simulatorEntity.updatedAt,
    inclusionReason: 'Opened from Inspector',
    _preservedStage: simulatorEntity.stage,
  } as any : undefined;
  const simulatorCurrentEntity = flowState.selectedSimulatorCurrentEntity;
  const simulatorEvent = flowState.selectedSimulatorEvent;
  if (isSketchBoard) return <SketchInspector />;
  const analyticsKinds = new Set(['ciHealth', 'inventory', ...(ENABLE_FLOW_ANALYTICS ? ['flowAnalytics'] : []), 'personalFocus']);
  const isAnalytics = activeTab && isNativeTab(activeTab) && analyticsKinds.has(activeTab.kind);
  const isSimulator = activeTab && isNativeTab(activeTab) && (activeTab.kind === 'accountSimulator' || activeTab.kind === 'repositorySimulator');
  const homeRepositoryContext = activeTab && isNativeTab(activeTab) && activeTab.kind === 'home' && !selectedItem ? flowState.selectedAnalyticsEntity : undefined;
  const targetSource = isAnalytics ? flowState.selectedAnalyticsEntity : isSimulator ? simulatorEntity : selectedItem ?? homeRepositoryContext;
  const target = resolveEntityTabTarget(targetSource, appMode);
  const analyticsEntity = flowState.selectedAnalyticsEntity;
  const workItemTarget: WorkItemOpenTarget | undefined = (() => {
    if (selectedItem && (selectedItem.type === 'pull_request' || selectedItem.type === 'issue')) return { id: selectedItem.id, kind: selectedItem.type, title: selectedItem.title, repository: selectedItem.repositoryName || selectedItem.repositoryId, number: selectedItem.number, url: target?.url, stage: selectedItem.stage };
    if (simulatorEntity && (simulatorEntity.subjectType === 'pull_request' || simulatorEntity.subjectType === 'issue')) return { id: simulatorEntity.id, kind: simulatorEntity.subjectType, title: simulatorEntity.title, repository: simulatorEntity.repositoryId, number: simulatorEntity.number, url: target?.url, stage: simulatorEntity.stage };
    if (analyticsEntity?.runId && analyticsEntity.repositoryId) return { id: analyticsEntity.id, kind: 'ci_run', title: analyticsEntity.title, repository: analyticsEntity.repositoryId, runId: String(analyticsEntity.runId), runNumber: Number(analyticsEntity.metadata?.runNumber) || undefined, url: target?.url };
    const analyticsKind = analyticsEntity?.entityType === 'pull_request' || analyticsEntity?.entityType === 'issue' ? analyticsEntity.entityType : analyticsEntity?.kind === 'pull_request' || analyticsEntity?.kind === 'issue' ? analyticsEntity.kind : undefined;
    if (analyticsKind && analyticsEntity) return { id: analyticsEntity.id, kind: analyticsKind, title: analyticsEntity.title, repository: analyticsEntity.repositoryId, number: analyticsEntity.number, url: target?.url };
    return undefined;
  })();
  const workSurface: WorkSurface = activeTab && isNativeTab(activeTab)
    ? activeTab.kind === 'home' ? 'home'
      : activeTab.kind === 'flow' ? 'flow'
      : activeTab.kind === 'ciHealth' ? 'ci_activity'
      : activeTab.kind === 'repositoryExplorer' ? 'repository'
      : activeTab.kind === 'pullRequestDiff' ? 'pull_requests'
      : 'other'
    : 'other';
  const demoUnavailableTarget = appMode === 'demo' && !!resolveEntityTabTarget(targetSource, 'live');
  const hasTimeline = Boolean(selectedItem?.stageHistory?.length || flowState.selectedAnalyticsEntity?.timeline?.length);
  const hasArchitecture = Boolean(activeTab && isNativeTab(activeTab) && (activeTab.kind === 'pullRequestDiff' && architectureState?.impact || activeTab.kind === 'repositoryExplorer' && architectureState?.snapshot));
  const entityKey = architectureState?.selectedComponentId ?? flowState.selectedItemId ?? flowState.selectedAnalyticsEntity?.id ?? simulatorEntity?.id ?? simulatorEvent?.id ?? (hasArchitecture ? 'architecture' : 'empty');
  const storedTabValid = inspectorTabState.tab === 'details' || inspectorTabState.tab === 'timeline' && hasTimeline || inspectorTabState.tab === 'architecture' && hasArchitecture;
  const inspectorTab: InspectorTab = inspectorTabState.entityKey === entityKey && storedTabValid ? inspectorTabState.tab : hasArchitecture ? 'architecture' : 'details';
  let content: ReactNode;

  if (inspectorTab === 'architecture' && architectureState?.impact) {
    content = <ArchitectureDetails impact={architectureState.impact} selectedComponentId={architectureState.selectedComponentId} />;
  } else if (inspectorTab === 'architecture' && architectureState?.snapshot) {
    content = <RepositoryArchitectureDetails snapshot={architectureState.snapshot} selectedComponentId={architectureState.selectedComponentId} />;
  } else if (isAnalytics || homeRepositoryContext) {
    if (flowState.selectedAnalyticsEntity?.kind === 'ci_health') {
      content = <WorkflowRunDetails selected={flowState.selectedAnalyticsEntity} tab={inspectorTab} />;
    } else {
      content = <AnalyticsDetails tab={inspectorTab} />;
    }
  } else if (simulatorEvent && isSimulator && !simulatorEntity) {
    content = <div className="inspector-details"><section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge>Event</Badge></div><h4 className="inspector-title">{humanizeSimulatorValue(simulatorEvent.eventType)}</h4><p className="inspector-repository">{formatEventTitle(simulatorEvent)}</p></section><section className="inspector-section"><h5 className="section-title">Event Details</h5><div className="metadata"><Meta label="Timestamp">{new Date(simulatorEvent.occurredAt).toLocaleString()}</Meta><Meta label="Actor">{simulatorEvent.actor?.login ?? 'Unknown'}</Meta><Meta label="Provenance">{simulatorEvent.metadata.nativeOrDerived === 'derived' ? 'Derived' : 'Native'}</Meta><Meta label="Source API">{simulatorEvent.source}</Meta></div></section>{!simulatorCurrentEntity && <section className="inspector-section"><h5 className="section-title">Historical entity unavailable</h5><p className="inspector-partial">Event evidence exists, but no canonical entity snapshot is available at this cutoff. The source may be historically limited or partial; Snow Devil will not guess a repository or navigate to a different item.</p></section>}</div>;
  } else if (simulatorEntity && isSimulator) {
    const tone = simulatorEntity.checkState === 'failure' ? 'danger' : simulatorEntity.reviewState === 'changes_requested' ? 'warning' : 'good';
    content = <div className="inspector-details"><section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge tone={tone}>{formatSubjectType(simulatorEntity.subjectType)}</Badge><span className="inspector-stage-badge">{humanizeSimulatorValue(simulatorEntity.stage)}</span></div><h4 className="inspector-title">{formatEntityTitle(simulatorEntity)}</h4><p className="inspector-repository">{simulatorEntity.repositoryId}{simulatorEntity.number ? ` #${simulatorEntity.number}` : ''}</p></section><section className="inspector-section"><h5 className="section-title">State at cursor</h5><div className="metadata"><Meta label="Status">{humanizeSimulatorValue(simulatorEntity.status)}</Meta><Meta label="Updated">{new Date(simulatorEntity.updatedAt).toLocaleString()}</Meta><Meta label="Checks">{humanizeSimulatorValue(simulatorEntity.checkState)}</Meta><Meta label="Review">{humanizeSimulatorValue(simulatorEntity.reviewState)}</Meta><Meta label="Commits">{simulatorEntity.commitCount}</Meta><Meta label="Comments">{simulatorEntity.commentCount}</Meta><Meta label="Completeness">{simulatorEntity.sourceCompleteness ?? 'unknown'}</Meta></div></section>{simulatorCurrentEntity && <section className="inspector-section"><h5 className="section-title">Current GitHub state</h5><div className="metadata"><Meta label="Stage">{humanizeSimulatorValue(simulatorCurrentEntity.stage)}</Meta><Meta label="Status">{humanizeSimulatorValue(simulatorCurrentEntity.status)}</Meta><Meta label="Updated">{new Date(simulatorCurrentEntity.updatedAt).toLocaleString()}</Meta><Meta label="Checks">{humanizeSimulatorValue(simulatorCurrentEntity.checkState)}</Meta><Meta label="Review">{humanizeSimulatorValue(simulatorCurrentEntity.reviewState)}</Meta></div></section>}{simulatorEntity.inclusionReason && <section className="inspector-section"><h5 className="section-title">Why it appears</h5><p className="meta-val">{humanizeSimulatorValue(simulatorEntity.inclusionReason)}</p></section>}</div>;
  } else if (selectedItem && activeTab && isNativeTab(activeTab) && (activeTab.kind === 'home' || activeTab.kind === 'flow')) {
    content = <FlowDetails item={selectedItem} mode={appMode} tab={inspectorTab} />;
  } else {
    content = <p className="inspector-empty">{activeTab && isNativeTab(activeTab) ? 'Select a card, row, or event to view details' : `Inspector is inactive for ${activeTab?.title ?? 'this view'}.`}</p>;
  }

  return <div className="inspector">
    <header className="inspector-header">
      <h3 className="inspector-header-title">Inspector</h3>
      <button className="inspector-header-close" aria-label="Close Inspector" data-tooltip="Close Inspector\nHide contextual details for the current selection." onClick={() => setInspectorOpen(false)}><X size={14}/></button>
    </header>
    {(targetSource || isSimulator || hasArchitecture) && <div className="inspector-tabs" role="tablist" aria-label="Inspector sections">{(targetSource || isSimulator) && <button role="tab" data-tooltip="Details\nShow the selected item's state, evidence, and canonical identity." aria-selected={inspectorTab === 'details'} className={inspectorTab === 'details' ? 'is-active' : ''} onClick={() => setInspectorTabState({entityKey,tab:'details'})}>Details</button>}{hasArchitecture && <button role="tab" data-tooltip="Architecture\nShow component identity, impact, confidence, and mapping evidence." aria-selected={inspectorTab === 'architecture'} className={inspectorTab === 'architecture' ? 'is-active' : ''} onClick={() => setInspectorTabState({entityKey,tab:'architecture'})}><Workflow size={11}/>Architecture</button>}{hasTimeline && <button role="tab" data-tooltip="Timeline\nShow the selected item's evidence-backed stage history." aria-selected={inspectorTab === 'timeline'} className={inspectorTab === 'timeline' ? 'is-active' : ''} onClick={() => setInspectorTabState({entityKey,tab:'timeline'})}>Timeline</button>}</div>}
    <div className="inspector-content">{content}</div>
    {(target || workItemTarget || demoUnavailableTarget || isAnalytics && flowState.selectedAnalyticsEntity?.repositoryId) && <footer className="inspector-footer">
      {isAnalytics && flowState.selectedAnalyticsEntity?.repositoryId && <div className="inspector-actions inspector-actions--context">
        {flowState.selectedAnalyticsEntity.kind === 'inventory' ? <>
          {flowState.selectedAnalyticsEntity.suggestedAction === 'Open CI' && <button className="inspector-open-flow" type="button" onClick={() => { const selected = flowState.selectedAnalyticsEntity!; if (selected.runId) openNativeTab(`ciRun:${selected.repositoryId}:${selected.runId}`, 'ciRun', 'CI Run', false, true, { type: 'ciRun', repository: selected.repositoryId!, runId: selected.runId }); else openNativeTab('native:ci-health', 'ciHealth', 'CI Activity', false, true); }}><ArrowRightCircle size={12} /> {flowState.selectedAnalyticsEntity.runId ? 'Open CI Run' : 'Open CI Activity'}</button>}
          {flowState.selectedAnalyticsEntity.entityType === 'pull_request' && flowState.selectedAnalyticsEntity.number && <button className="inspector-open-flow" type="button" onClick={() => { const selected = flowState.selectedAnalyticsEntity!; openNativeTab(`native:pr:${selected.repositoryId}:${selected.number}`, 'pullRequestDiff', `PR #${selected.number}`, false, true, { type: 'pullRequest', repository: selected.repositoryId!, number: selected.number! }); }}><ArrowRightCircle size={12} /> Open Pull Request</button>}
          <button className="inspector-open-flow" type="button" onClick={() => { const repository = flowState.selectedAnalyticsEntity!.repositoryId!; openNativeTab(`native:repo:${repository}`, 'repositoryExplorer', repository.split('/').pop() ?? repository, false, true, { type: 'repository', repository }); }}><History size={12} /> Open Repository</button>
          <button className="inspector-open-flow" type="button" onClick={() => { const selected = flowState.selectedAnalyticsEntity!; const muted = analyticsSettings.mutedDeliveryRiskItems.some(id => id.toLowerCase() === selected.id.toLowerCase()); const deliveryRiskMuteMetadata = { ...analyticsSettings.deliveryRiskMuteMetadata }; if (muted) delete deliveryRiskMuteMetadata[selected.id]; else deliveryRiskMuteMetadata[selected.id] = { mutedAt: new Date().toISOString() }; updateAnalyticsSettings({ mutedDeliveryRiskItems: muted ? analyticsSettings.mutedDeliveryRiskItems.filter(id => id.toLowerCase() !== selected.id.toLowerCase()) : [...analyticsSettings.mutedDeliveryRiskItems, selected.id], deliveryRiskMuteMetadata }); }}><ArrowRightCircle size={12} /> {analyticsSettings.mutedDeliveryRiskItems.some(id => id.toLowerCase() === flowState.selectedAnalyticsEntity!.id.toLowerCase()) ? 'Restore Item' : 'Mute Item'}</button>
          <button className="inspector-open-flow" type="button" onClick={() => { const repository = flowState.selectedAnalyticsEntity!.repositoryId!; const repositoryKey = repository.toLowerCase(); const muted = analyticsSettings.mutedDeliveryRiskRepositories.some(id => id.toLowerCase() === repositoryKey); const metadataKey = `repository:${repositoryKey}`; const deliveryRiskMuteMetadata = { ...analyticsSettings.deliveryRiskMuteMetadata }; if (muted) delete deliveryRiskMuteMetadata[metadataKey]; else deliveryRiskMuteMetadata[metadataKey] = { mutedAt: new Date().toISOString() }; updateAnalyticsSettings({ mutedDeliveryRiskRepositories: muted ? analyticsSettings.mutedDeliveryRiskRepositories.filter(id => id.toLowerCase() !== repositoryKey) : [...analyticsSettings.mutedDeliveryRiskRepositories, repositoryKey], deliveryRiskMuteMetadata }); }}><ArrowRightCircle size={12} /> {analyticsSettings.mutedDeliveryRiskRepositories.some(id => id.toLowerCase() === flowState.selectedAnalyticsEntity!.repositoryId!.toLowerCase()) ? 'Restore Repository' : 'Mute Repository'}</button>
        </> : !workItemTarget ? <button className="inspector-open-flow" type="button" onClick={() => { const repository = flowState.selectedAnalyticsEntity!.repositoryId!; useFlowStore.getState().setTabState('native:flow', { scope: 'repository', selectedRepository: { id: repository, nameWithOwner: repository } }); openNativeTab('native:flow', 'flow', 'Flow', false, true); }}><ArrowRightCircle size={12} /> Open in Flow</button> : null}
        {flowState.selectedAnalyticsEntity?.repositoryId && (
          <button className="inspector-open-flow" type="button" onClick={() => { const repository = flowState.selectedAnalyticsEntity!.repositoryId!; useFlowStore.getState().setTabState('native:repository-simulator', { selectedRepository: { id: repository, nameWithOwner: repository }, selectedItemId: simulatorEntity?.id, selectedSimulatorEntity: simulatorEntity }); openNativeTab('native:repository-simulator', 'repositorySimulator', 'Repository History', false, true); }}><History size={12} /> Open Repository</button>
        )}
      </div>}
      {workItemTarget && <WorkItemOpenActions item={workItemTarget} surface={workSurface} flowItem={selectedItem ?? mockFlowItemFromSimulator} onStatus={setCopyStatus} compact />}
      {demoUnavailableTarget && <button className="open-link inspector-open-tab" type="button" disabled>Open action unavailable in Demo Mode</button>}<span className="inspector-copy-status" aria-live="polite">{copyStatus}</span>
    </footer>}
  </div>;
}
