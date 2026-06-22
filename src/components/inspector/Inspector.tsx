import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { resolveEntityTabTarget } from '../../lib/entity-target';
import { parseGitHubIssueOrPR, parseRelease } from '../../lib/flow-parser';
import { formatEntityTitle, formatEventTitle, formatSubjectType, humanizeSimulatorValue } from '../../simulator/simulator-presentation';
import { useFlowStore } from '../../stores/flow-store';
import { useModeStore } from '../../stores/mode-store';
import { isNativeTab, useTabsStore } from '../../stores/tabs-store';
import type { FlowItem } from '../../types/flow';
import { formatTimeInStage, normalizeWorkflowItem } from '../../lib/workflow-presentation';
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
  const color = tone === 'good' ? 'var(--success-color)' : tone === 'warning' ? 'var(--warning-color)' : tone === 'danger' ? 'var(--danger-color)' : tone === 'info' ? 'var(--accent-primary)' : 'var(--bg-tertiary)';
  return <span className="inspector-entity-badge" style={{ backgroundColor: color }}>{children}</span>;
}

function Meta({ label, children }: { label: string; children: ReactNode }) { return <div className="meta-row"><span className="meta-key">{label}</span><span className="meta-val">{children}</span></div>; }

function AnalyticsDetails() {
  const activeTabId = useTabsStore(state => state.activeTabId);
  const selected = useFlowStore(state => state.getTabState(activeTabId).selectedAnalyticsEntity);
  if (!selected) return <p className="inspector-empty">Select a row or work item to view its evidence</p>;
  return <div className="inspector-details">
    <section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge tone={selected.kind === 'inventory' ? 'warning' : selected.kind === 'ci_health' ? 'info' : 'good'}>{selected.kind.replace(/_/g, ' ')}</Badge>{selected.state && <span className="inspector-stage-badge">{selected.state}</span>}</div><h4 className="inspector-title">{selected.title}</h4>{selected.repositoryId && <p className="inspector-repository">{selected.repositoryId}{selected.number ? ` #${selected.number}` : ''}</p>}</section>
    <section className="inspector-section"><h5 className="section-title">Why it appears</h5><p className="meta-val">{selected.reason ?? 'Selected from delivery analytics.'}</p><div className="metadata">{selected.confidence && <Meta label="Confidence">{selected.confidence}</Meta>}{selected.occurredAt && <Meta label="Last activity">{new Date(selected.occurredAt).toLocaleString()}</Meta>}{selected.relatedEntityIds && <Meta label="Related entities">{selected.relatedEntityIds.length}</Meta>}</div></section>
    {selected.evidence && selected.evidence.length > 0 && <section className="inspector-section"><h5 className="section-title">Evidence</h5>{selected.evidence.map(item => <p className="meta-val" key={item}>{item}</p>)}</section>}
    {selected.timeline && selected.timeline.length > 0 && <section className="inspector-section"><h5 className="section-title">Delivery timeline</h5><div className="inspector-timeline">{selected.timeline.map(item => <div key={`${item.label}-${item.occurredAt}`}><i /><span><strong>{item.label}</strong><small>{new Date(item.occurredAt).toLocaleString()} | {item.confidence}</small></span></div>)}</div></section>}
  </div>;
}

function FlowDetails({ item, mode }: { item: FlowItem; mode: 'live' | 'demo' }) {
  const value = normalizeWorkflowItem(item, mode);
  const tone = value.status === 'failing' ? 'danger' : value.status === 'changes_requested' ? 'warning' : value.stage === 'ready' || value.stage === 'merged' || value.stage === 'released' || value.stage === 'deployed' ? 'good' : 'info';
  return <div className="inspector-details">
    <section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge tone={tone}>{value.type === 'pull_request' ? 'Pull Request' : value.type}</Badge><span className="inspector-stage-badge">{value.stage.replace(/_/g, ' ')}</span>{value.isDraft && <Badge>Draft</Badge>}{value.isBot && <Badge>Bot</Badge>}</div><h4 className="inspector-title">{value.title}</h4><p className="inspector-repository">{value.repositoryName}{value.number ? ` #${value.number}` : ''}</p></section>
    <section className="inspector-section inspector-why"><h5 className="section-title">Why it's here</h5><p className="meta-val">{value.stageReason}</p></section>
    <section className="inspector-section"><h5 className="section-title">Details</h5><div className="metadata"><Meta label="Author">{value.author?.login ?? 'Not reported'}</Meta><Meta label="Created">{new Date(value.createdAt).toLocaleString()}</Meta><Meta label="Updated">{new Date(value.updatedAt).toLocaleString()}</Meta><Meta label="Time in stage">{formatTimeInStage(value)}</Meta>{value.baseBranch && <Meta label="Base branch">{value.baseBranch}</Meta>}{value.headBranch && <Meta label="Head branch">{value.headBranch}</Meta>}<Meta label="Checks">{value.checksSummary?.state ?? 'Not reported'}</Meta><Meta label="Review">{value.reviewSummary?.state.replace(/_/g, ' ') ?? 'Not reported'}</Meta>{value.reviewSummary && <Meta label="Approval progress">{value.reviewSummary.reviews.filter(review => review.state === 'APPROVED').length} approvals</Meta>}{value.assignees && <Meta label="Assignees">{value.assignees.map(actor => actor.login).join(', ') || 'Unassigned'}</Meta>}{value.reviewSummary?.requestedReviewers && <Meta label="Requested reviewers">{value.reviewSummary.requestedReviewers.join(', ') || 'None'}</Meta>}{value.commentCount != null && <Meta label="Comments">{value.commentCount}</Meta>}{value.commitCount != null && <Meta label="Commits">{value.commitCount}</Meta>}{value.environment && <Meta label="Environment">{value.environment}</Meta>}<Meta label="Completeness">{value.completeness ?? 'unknown'}</Meta></div>{value.completenessReason && <p className="inspector-partial">{value.completenessReason}</p>}</section>
    {value.labels && value.labels.length > 0 && <section className="inspector-section"><h5 className="section-title">Labels</h5><div className="labels-container">{value.labels.map(label => <span key={label.name} className="label-badge" style={{ backgroundColor: `#${label.color || '555555'}`, color: '#fff' }}>{label.name}</span>)}</div></section>}
    <section className="inspector-section"><h5 className="section-title">Stage History</h5>{value.stageHistory?.length ? <div className="inspector-timeline">{value.stageHistory.map(entry => <div key={entry.id}><i /><span><strong>{entry.label}</strong><small>{new Date(entry.occurredAt).toLocaleString()}{entry.inferred ? ' · inferred' : ''}</small></span></div>)}</div> : <p className="meta-val">No synchronized stage history is available.</p>}</section>
  </div>;
}

export function Inspector() {
  const [copyStatus, setCopyStatus] = useState('');
  const appMode = useModeStore(state => state.mode);
  const { tabs, activeTabId, openBrowserTab } = useTabsStore();
  const flowState = useFlowStore(state => state.getTabState(activeTabId));
  const activeTab = tabs.find(tab => tab.id === activeTabId);
  const resolvedItem = useResolvedFlowItem(flowState.selectedItemId);
  const selectedItem = flowState.selectedFlowItem ?? resolvedItem;
  const simulatorEntity = flowState.selectedSimulatorEntity;
  const simulatorEvent = flowState.selectedSimulatorEvent;
  const analyticsKinds = new Set(['ciHealth', 'inventory', 'flowAnalytics', 'personalFocus']);
  const isAnalytics = activeTab && isNativeTab(activeTab) && analyticsKinds.has(activeTab.kind);
  const isSimulator = activeTab && isNativeTab(activeTab) && (activeTab.kind === 'accountSimulator' || activeTab.kind === 'repositorySimulator');
  const homeRepositoryContext = activeTab && isNativeTab(activeTab) && activeTab.kind === 'home' && !selectedItem ? flowState.selectedAnalyticsEntity : undefined;
  const targetSource = isAnalytics ? flowState.selectedAnalyticsEntity : isSimulator ? simulatorEntity : selectedItem ?? homeRepositoryContext;
  const target = resolveEntityTabTarget(targetSource, appMode);
  const demoUnavailableTarget = appMode === 'demo' && !!resolveEntityTabTarget(targetSource, 'live');
  let content: ReactNode;

  if (isAnalytics || homeRepositoryContext) {
    content = <AnalyticsDetails />;
  } else if (simulatorEvent && isSimulator) {
    content = <div className="inspector-details"><section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge>Event</Badge></div><h4 className="inspector-title">{humanizeSimulatorValue(simulatorEvent.eventType)}</h4><p className="inspector-repository">{formatEventTitle(simulatorEvent)}</p></section><section className="inspector-section"><h5 className="section-title">Event Details</h5><div className="metadata"><Meta label="Timestamp">{new Date(simulatorEvent.occurredAt).toLocaleString()}</Meta><Meta label="Actor">{simulatorEvent.actor?.login ?? 'Unknown'}</Meta><Meta label="Provenance">{simulatorEvent.metadata.nativeOrDerived === 'derived' ? 'Derived' : 'Native'}</Meta><Meta label="Source API">{simulatorEvent.source}</Meta></div></section></div>;
  } else if (simulatorEntity && isSimulator) {
    const tone = simulatorEntity.checkState === 'failure' ? 'danger' : simulatorEntity.reviewState === 'changes_requested' ? 'warning' : 'good';
    content = <div className="inspector-details"><section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge tone={tone}>{formatSubjectType(simulatorEntity.subjectType)}</Badge><span className="inspector-stage-badge">{humanizeSimulatorValue(simulatorEntity.stage)}</span></div><h4 className="inspector-title">{formatEntityTitle(simulatorEntity)}</h4><p className="inspector-repository">{simulatorEntity.repositoryId}{simulatorEntity.number ? ` #${simulatorEntity.number}` : ''}</p></section><section className="inspector-section"><h5 className="section-title">Simulation State</h5><div className="metadata"><Meta label="Status">{humanizeSimulatorValue(simulatorEntity.status)}</Meta><Meta label="Created">{new Date(simulatorEntity.createdAt).toLocaleString()}</Meta><Meta label="Updated">{new Date(simulatorEntity.updatedAt).toLocaleString()}</Meta><Meta label="Checks">{humanizeSimulatorValue(simulatorEntity.checkState)}</Meta><Meta label="Review">{humanizeSimulatorValue(simulatorEntity.reviewState)}</Meta><Meta label="Commits">{simulatorEntity.commitCount}</Meta><Meta label="Comments">{simulatorEntity.commentCount}</Meta><Meta label="Completeness">{simulatorEntity.sourceCompleteness ?? 'unknown'}</Meta></div></section>{simulatorEntity.inclusionReason && <section className="inspector-section"><h5 className="section-title">Why it appears</h5><p className="meta-val">{humanizeSimulatorValue(simulatorEntity.inclusionReason)}</p></section>}</div>;
  } else if (selectedItem && activeTab && isNativeTab(activeTab) && (activeTab.kind === 'home' || activeTab.kind === 'flow')) {
    content = <FlowDetails item={selectedItem} mode={appMode} />;
  } else {
    content = <p className="inspector-empty">{activeTab && isNativeTab(activeTab) ? 'Select a card, row, or event to view details' : `Inspector is inactive for ${activeTab?.title ?? 'this view'}.`}</p>;
  }

  return <div className="inspector"><div className="inspector-header"><h3>Inspector</h3></div><div className="inspector-content">{content}{target && <div className="inspector-actions"><button className="open-link inspector-open-tab" type="button" onClick={() => openBrowserTab(target.id, target.kind, target.title, target.url, false, true)}>Open in Tab</button><button type="button" onClick={() => window.open(target.url, '_blank', 'noopener,noreferrer')}><ExternalLink size={12} /> Open on GitHub</button><button type="button" onClick={() => navigator.clipboard.writeText(target.url).then(() => setCopyStatus('Link copied')).catch(() => setCopyStatus('Copy unavailable'))}><Copy size={12} /> Copy link</button></div>}{demoUnavailableTarget && <button className="open-link inspector-open-tab" type="button" disabled>Open in Tab unavailable in Demo Mode</button>}<span className="inspector-copy-status" aria-live="polite">{copyStatus}</span></div></div>;
}
