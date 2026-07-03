import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Copy, X, ArrowRightCircle, Globe, History } from 'lucide-react';
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
import { copyCanonicalLink, openInDefaultBrowser } from '../../lib/browser-actions';
import { StatusIcon, formatDurationCompact } from '../analytics/CIRunRow';
import { useWorkflowJobs } from '../../hooks/useWorkflowJobs';
import { Loader2 } from 'lucide-react';
import './Inspector.css';

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
type InspectorTab = 'details' | 'timeline';

function AnalyticsDetails({ tab }: { tab: InspectorTab }) {
  const activeTabId = useTabsStore(state => state.activeTabId);
  const selected = useFlowStore(state => state.getTabState(activeTabId).selectedAnalyticsEntity);
  if (!selected) return <p className="inspector-empty">Select a row or work item to view its evidence</p>;
  return <div className={`inspector-details inspector-details--${tab}`}>
    <section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge tone={selected.kind === 'inventory' ? 'warning' : selected.kind === 'ci_health' ? 'info' : 'good'}>{selected.kind.replace(/_/g, ' ')}</Badge>{selected.state && <span className="inspector-stage-badge">{selected.state}</span>}</div><h4 className="inspector-title">{selected.title}</h4>{selected.repositoryId && <p className="inspector-repository">{selected.repositoryId}{selected.number ? ` #${selected.number}` : ''}</p>}</section>
    <section className="inspector-section"><h5 className="section-title">Why it appears</h5><p className="meta-val">{selected.reason ?? 'Selected from delivery analytics.'}</p><div className="metadata">{selected.confidence && <Meta label="Confidence">{selected.confidence}</Meta>}{selected.coverage && <Meta label="Coverage">{selected.coverage}</Meta>}{selected.sampleCount != null && <Meta label="Qualifying samples">{selected.sampleCount}</Meta>}{selected.excludedCount != null && <Meta label="Excluded / incomplete">{selected.excludedCount}</Meta>}{selected.occurredAt && <Meta label="Last activity">{new Date(selected.occurredAt).toLocaleString()}</Meta>}{selected.relatedEntityIds && <Meta label="Related entities">{selected.relatedEntityIds.length}</Meta>}</div>{selected.definition && <p className="inspector-partial">{selected.definition}</p>}</section>
    {selected.lineage && <section className="inspector-section inspector-lineage"><h5 className="section-title">Metric lineage</h5><div className="metadata"><Meta label="Formula">{selected.lineage.formula}</Meta><Meta label="Numerator">{selected.lineage.numerator}</Meta><Meta label="Denominator">{selected.lineage.denominator}</Meta><Meta label="Time basis">{selected.lineage.timeBasis}</Meta><Meta label="Coverage">{selected.lineage.coverageStart ? new Date(selected.lineage.coverageStart).toLocaleDateString() : 'Unavailable'} – {selected.lineage.coverageEnd ? new Date(selected.lineage.coverageEnd).toLocaleDateString() : 'current'}</Meta><Meta label="Sample quality">{selected.lineage.sampleCount} included · {selected.lineage.excludedOrIncompleteCount} excluded/incomplete</Meta></div><div><strong className="meta-key">Included repositories</strong><p className="meta-val">{selected.lineage.repositoriesIncluded.join(', ') || 'None'}</p></div><div><strong className="meta-key">Included entity types</strong><p className="meta-val">{selected.lineage.includedEntityTypes.join(', ')}</p></div><div><strong className="meta-key">Evidence sources</strong><p className="meta-val">{selected.lineage.evidenceSources.join(' · ')}</p></div>{selected.lineage.failedOrSkipped.length>0&&<p className="inspector-partial">Failed, skipped, or partial: {selected.lineage.failedOrSkipped.join(' · ')}</p>}</section>}
    {selected.evidence && selected.evidence.length > 0 && <section className="inspector-section"><h5 className="section-title">Evidence</h5>{selected.evidence.map(item => <p className="meta-val" key={item}>{item}</p>)}</section>}
    {selected.missingEvidence && selected.missingEvidence.length > 0 && <section className="inspector-section"><h5 className="section-title">Missing evidence</h5>{selected.missingEvidence.map(item => <p className="meta-val" key={item}>{item}</p>)}</section>}
    {selected.timeline && selected.timeline.length > 0 && <section className="inspector-section inspector-timeline-section"><h5 className="section-title">Delivery timeline</h5><div className="inspector-timeline">{selected.timeline.map(item => <div key={`${item.label}-${item.occurredAt}`}><i /><span><strong>{item.label}</strong><small>{new Date(item.occurredAt).toLocaleString()} | {item.confidence}</small></span></div>)}</div></section>}
  </div>;
}

function WorkflowRunDetails({ selected, tab }: { selected: AnalyticsInspectable; tab: InspectorTab }) {
  const metadata = selected.evidence && selected.evidence.length > 0 ? JSON.parse(selected.evidence[0]) : null;
  const { data: jobs, isLoading, error } = useWorkflowJobs(selected.repositoryId || '', metadata?.runId as string, true);

  if (!metadata) return <p className="inspector-empty">No workflow data available.</p>;

  const durationStr = formatDurationCompact(metadata.durationMs);

  const tone = selected.state === 'success' ? 'good' : selected.state === 'failure' ? 'danger' : 'neutral';

  return <div className={`inspector-details inspector-details--${tab}`}>
    <section className="inspector-section inspector-header-section">
      <div className="inspector-entity-row">
        <Badge tone={tone}>Workflow Run</Badge>
        {selected.state && <span className="inspector-stage-badge">{selected.state.replace(/_/g, ' ')}</span>}
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
        <Meta label="Completed">{metadata.completedAt ? new Date(metadata.completedAt).toLocaleString() : 'Running...'}</Meta>
        <Meta label="Duration">{durationStr}</Meta>
        {metadata.headBranch && <Meta label="Branch">{metadata.headBranch}</Meta>}
        {metadata.pullRequestNumber && <Meta label="Pull Request"><a href={`https://github.com/${selected.repositoryId}/pull/${metadata.pullRequestNumber}`} target="_blank" rel="noreferrer" className="open-link">#{metadata.pullRequestNumber}</a></Meta>}
        {metadata.headSha && <Meta label="Commit"><a href={`https://github.com/${selected.repositoryId}/commit/${metadata.headSha}`} target="_blank" rel="noreferrer" className="open-link">{metadata.headSha.substring(0, 7)}</a></Meta>}
      </div>
      {metadata.commitMessage && <p className="inspector-partial">Message: {metadata.commitMessage}</p>}
    </section>

    <section className="inspector-section">
      <h5 className="section-title">Jobs</h5>
      {isLoading && <div className="ci-jobs-loading"><Loader2 className="is-spinning" size={14} /> Loading jobs...</div>}
      {error && <div className="ci-jobs-error">Failed to load jobs</div>}
      {jobs?.length === 0 && <div className="ci-jobs-empty">No jobs found</div>}
      {jobs && jobs.length > 0 && (
        <ul className="ci-jobs-list">
          {jobs.map(job => (
            <li key={job.id} className="ci-job-item">
              <StatusIcon status={job.status} conclusion={job.conclusion} size={14} />
              <span className="ci-job-name" title={job.name}>{job.name}</span>
              {job.status === 'in_progress' && job.steps?.length > 0 && (
                <span className="ci-job-steps">{job.steps.filter(s => s.status === 'completed').length} / {job.steps.length}</span>
              )}
              <span className="ci-job-duration">
                {job.started_at && job.completed_at ? formatDurationCompact(new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) : ''}
                {job.started_at && !job.completed_at ? 'Running...' : ''}
              </span>
              {job.conclusion === 'failure' && job.steps?.find(s => s.conclusion === 'failure') && (
                <span className="ci-job-failed-step" style={{ display: 'block', width: '100%', fontSize: '10px', color: 'var(--danger)', marginTop: '4px' }}>
                  Failed: {job.steps.find(s => s.conclusion === 'failure')?.name}
                </span>
              )}
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

export function Inspector() {
  const [copyStatus, setCopyStatus] = useState('');
  const [inspectorTabState, setInspectorTabState] = useState<{ entityKey:string; tab:InspectorTab }>({ entityKey:'', tab:'details' });
  const appMode = useModeStore(state => state.mode);
  const setInspectorOpen = useLayoutStore(state => state.setInspectorOpen);
  const { tabs, activeTabId, openBrowserTab, openNativeTab } = useTabsStore();
  const flowState = useFlowStore(state => state.getTabState(activeTabId));
  const activeTab = tabs.find(tab => tab.id === activeTabId);
  const resolvedItem = useResolvedFlowItem(flowState.selectedItemId);
  const selectedItem = flowState.selectedFlowItem ?? resolvedItem;
  const simulatorEntity = flowState.selectedSimulatorEntity;
  const simulatorCurrentEntity = flowState.selectedSimulatorCurrentEntity;
  const simulatorEvent = flowState.selectedSimulatorEvent;
  const analyticsKinds = new Set(['ciHealth', 'inventory', 'flowAnalytics', 'personalFocus']);
  const isAnalytics = activeTab && isNativeTab(activeTab) && analyticsKinds.has(activeTab.kind);
  const isSimulator = activeTab && isNativeTab(activeTab) && (activeTab.kind === 'accountSimulator' || activeTab.kind === 'repositorySimulator');
  const homeRepositoryContext = activeTab && isNativeTab(activeTab) && activeTab.kind === 'home' && !selectedItem ? flowState.selectedAnalyticsEntity : undefined;
  const targetSource = isAnalytics ? flowState.selectedAnalyticsEntity : isSimulator ? simulatorEntity : selectedItem ?? homeRepositoryContext;
  const target = resolveEntityTabTarget(targetSource, appMode);
  const demoUnavailableTarget = appMode === 'demo' && !!resolveEntityTabTarget(targetSource, 'live');
  const hasTimeline = Boolean(selectedItem?.stageHistory?.length || flowState.selectedAnalyticsEntity?.timeline?.length);
  const entityKey = flowState.selectedItemId ?? flowState.selectedAnalyticsEntity?.id ?? simulatorEntity?.id ?? simulatorEvent?.id ?? 'empty';
  const inspectorTab: InspectorTab = inspectorTabState.entityKey === entityKey && (hasTimeline || inspectorTabState.tab === 'details') ? inspectorTabState.tab : 'details';
  let content: ReactNode;

  if (isAnalytics || homeRepositoryContext) {
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
    {(targetSource || isSimulator) && <div className="inspector-tabs" role="tablist" aria-label="Inspector sections"><button role="tab" data-tooltip="Details\nShow the selected item's state, evidence, and canonical identity." aria-selected={inspectorTab === 'details'} className={inspectorTab === 'details' ? 'is-active' : ''} onClick={() => setInspectorTabState({entityKey,tab:'details'})}>Details</button>{hasTimeline && <button role="tab" data-tooltip="Timeline\nShow the selected item's evidence-backed stage history." aria-selected={inspectorTab === 'timeline'} className={inspectorTab === 'timeline' ? 'is-active' : ''} onClick={() => setInspectorTabState({entityKey,tab:'timeline'})}>Timeline</button>}</div>}
    <div className="inspector-content">{content}</div>
    {(target || demoUnavailableTarget || isAnalytics && flowState.selectedAnalyticsEntity?.repositoryId) && <footer className="inspector-footer">
      {isAnalytics && flowState.selectedAnalyticsEntity?.repositoryId && <div className="inspector-actions inspector-actions--context">
        <button className="inspector-open-flow" type="button" onClick={() => { const repository = flowState.selectedAnalyticsEntity!.repositoryId!; useFlowStore.getState().setTabState('native:flow', { scope: 'repository', selectedRepository: { id: repository, nameWithOwner: repository } }); openNativeTab('native:flow', 'flow', 'Flow', false, true); }}><ArrowRightCircle size={12} /> Open in Flow</button>
        {flowState.selectedAnalyticsEntity.kind === 'ci_health' && (
          <button className="inspector-open-flow" type="button" onClick={() => { const repository = flowState.selectedAnalyticsEntity!.repositoryId!; useFlowStore.getState().setTabState('native:repository-simulator', { selectedRepository: { id: repository, nameWithOwner: repository } }); openNativeTab('native:repository-simulator', 'repositorySimulator', 'Repository History', false, true); }}><History size={12} /> Open Repository</button>
        )}
      </div>}
      {target && <div className="inspector-actions">
        {activeTabId === 'native:home' && selectedItem && (
          <button
            className="inspector-open-flow"
            type="button"
            data-tooltip="Open in Flow\nNavigate to the Flow tab and focus this item."
            onClick={() => {
              useFlowStore.getState().setTabState('native:flow', {
                scope: 'account',
                filterStage: selectedItem.stage,
                statusFilter: selectedItem.stage === 'merged' ? 'merged' : 'all',
                search: '',
                selectedItemId: selectedItem.id,
                selectedFlowItem: selectedItem,
                pendingScrollItemId: selectedItem.id,
                sourceContext: `Opened from Inspector: ${selectedItem.title}`
              });
              openNativeTab('native:flow', 'flow', 'Flow', false, true);
            }}
          >
            <ArrowRightCircle size={12} /> Open in Flow
          </button>
        )}
        <button type="button" aria-label="Open in Default Browser" data-tooltip="Open in Default Browser\nOpen the validated canonical GitHub URL outside Snow Devil." onClick={() => void openInDefaultBrowser(target.url).then(() => setCopyStatus('Opened in default browser')).catch(error => setCopyStatus(error instanceof Error ? error.message : 'Open unavailable'))}><Globe size={12} /> Open in Browser</button><button type="button" data-tooltip="Copy Link\nCopy the validated canonical GitHub URL for this entity." onClick={() => void copyCanonicalLink(target.url).then(() => setCopyStatus('Link copied')).catch(error => setCopyStatus(error instanceof Error ? error.message : 'Copy unavailable'))}><Copy size={12} /> Copy Link</button><button className="open-link inspector-open-tab" type="button" data-tooltip="Open in Tab\nOpen or activate the canonical GitHub entity inside Snow Devil." onClick={() => openBrowserTab(target.id, target.kind, target.title, target.url, false, true)}>Open in Tab</button></div>}
      {demoUnavailableTarget && <button className="open-link inspector-open-tab" type="button" disabled>Open in Tab unavailable in Demo Mode</button>}<span className="inspector-copy-status" aria-live="polite">{copyStatus}</span>
    </footer>}
  </div>;
}
