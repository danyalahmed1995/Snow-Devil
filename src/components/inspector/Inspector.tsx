import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { resolveEntityTabTarget } from '../../lib/entity-target';
import { parseGitHubIssueOrPR, parseRelease } from '../../lib/flow-parser';
import { formatEntityTitle, formatEventTitle, formatSubjectType, humanizeSimulatorValue } from '../../simulator/simulator-presentation';
import { useFlowStore } from '../../stores/flow-store';
import { useModeStore } from '../../stores/mode-store';
import { isNativeTab, useTabsStore } from '../../stores/tabs-store';
import type { FlowItem } from '../../types/flow';
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

export function Inspector() {
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
  const targetSource = isAnalytics ? flowState.selectedAnalyticsEntity : isSimulator ? simulatorEntity : selectedItem;
  const target = resolveEntityTabTarget(targetSource, appMode);
  const demoUnavailableTarget = appMode === 'demo' && !!resolveEntityTabTarget(targetSource, 'live');
  let content: ReactNode;

  if (isAnalytics) {
    content = <AnalyticsDetails />;
  } else if (simulatorEvent && isSimulator) {
    content = <div className="inspector-details"><section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge>Event</Badge></div><h4 className="inspector-title">{humanizeSimulatorValue(simulatorEvent.eventType)}</h4><p className="inspector-repository">{formatEventTitle(simulatorEvent)}</p></section><section className="inspector-section"><h5 className="section-title">Event Details</h5><div className="metadata"><Meta label="Timestamp">{new Date(simulatorEvent.occurredAt).toLocaleString()}</Meta><Meta label="Actor">{simulatorEvent.actor?.login ?? 'Unknown'}</Meta><Meta label="Provenance">{simulatorEvent.metadata.nativeOrDerived === 'derived' ? 'Derived' : 'Native'}</Meta><Meta label="Source API">{simulatorEvent.source}</Meta></div></section></div>;
  } else if (simulatorEntity && isSimulator) {
    const tone = simulatorEntity.checkState === 'failure' ? 'danger' : simulatorEntity.reviewState === 'changes_requested' ? 'warning' : 'good';
    content = <div className="inspector-details"><section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge tone={tone}>{formatSubjectType(simulatorEntity.subjectType)}</Badge><span className="inspector-stage-badge">{humanizeSimulatorValue(simulatorEntity.stage)}</span></div><h4 className="inspector-title">{formatEntityTitle(simulatorEntity)}</h4><p className="inspector-repository">{simulatorEntity.repositoryId}{simulatorEntity.number ? ` #${simulatorEntity.number}` : ''}</p></section><section className="inspector-section"><h5 className="section-title">Simulation State</h5><div className="metadata"><Meta label="Status">{humanizeSimulatorValue(simulatorEntity.status)}</Meta><Meta label="Created">{new Date(simulatorEntity.createdAt).toLocaleString()}</Meta><Meta label="Updated">{new Date(simulatorEntity.updatedAt).toLocaleString()}</Meta><Meta label="Checks">{humanizeSimulatorValue(simulatorEntity.checkState)}</Meta><Meta label="Review">{humanizeSimulatorValue(simulatorEntity.reviewState)}</Meta><Meta label="Commits">{simulatorEntity.commitCount}</Meta><Meta label="Comments">{simulatorEntity.commentCount}</Meta><Meta label="Completeness">{simulatorEntity.sourceCompleteness ?? 'unknown'}</Meta></div></section>{simulatorEntity.inclusionReason && <section className="inspector-section"><h5 className="section-title">Why it appears</h5><p className="meta-val">{humanizeSimulatorValue(simulatorEntity.inclusionReason)}</p></section>}</div>;
  } else if (selectedItem && activeTab && isNativeTab(activeTab) && (activeTab.kind === 'home' || activeTab.kind === 'flow')) {
    const tone = selectedItem.status === 'failing' ? 'danger' : selectedItem.status === 'changes_requested' ? 'warning' : 'good';
    content = <div className="inspector-details"><section className="inspector-section inspector-header-section"><div className="inspector-entity-row"><Badge tone={tone}>{selectedItem.type === 'pull_request' ? 'Pull Request' : selectedItem.type === 'issue' ? 'Issue' : 'Release'}</Badge><span className="inspector-stage-badge">{selectedItem.stage}</span></div><h4 className="inspector-title">{selectedItem.title}</h4><p className="inspector-repository">{selectedItem.repositoryName}{selectedItem.number ? ` #${selectedItem.number}` : ''}</p></section><section className="inspector-section"><h5 className="section-title">Activity</h5><div className="metadata"><Meta label="Status">{selectedItem.status}</Meta><Meta label="Created">{new Date(selectedItem.createdAt).toLocaleString()}</Meta><Meta label="Updated">{new Date(selectedItem.updatedAt).toLocaleString()}</Meta>{selectedItem.author && <Meta label="Author">{selectedItem.author.login}</Meta>}{selectedItem.mergedAt && <Meta label="Merged">{new Date(selectedItem.mergedAt).toLocaleString()}</Meta>}{selectedItem.reviewSummary && <Meta label="Review">{selectedItem.reviewSummary.state.replace('_', ' ')}</Meta>}{selectedItem.checksSummary && <Meta label="Checks">{selectedItem.checksSummary.state}</Meta>}</div></section>{selectedItem.inclusionReason && <section className="inspector-section"><h5 className="section-title">Why it appears</h5><p className="meta-val">{selectedItem.inclusionReason}</p></section>}{selectedItem.labels && selectedItem.labels.length > 0 && <section className="inspector-section"><h5 className="section-title">Labels</h5><div className="labels-container">{selectedItem.labels.map(label => <span key={label.name} className="label-badge" style={{ backgroundColor: `#${label.color || '555555'}`, color: '#fff' }}>{label.name}</span>)}</div></section>}</div>;
  } else {
    content = <p className="inspector-empty">{activeTab && isNativeTab(activeTab) ? 'Select a card, row, or event to view details' : `Inspector is inactive for ${activeTab?.title ?? 'this view'}.`}</p>;
  }

  return <div className="inspector"><div className="inspector-header"><h3>Inspector</h3></div><div className="inspector-content">{content}{target && <button className="open-link inspector-open-tab" type="button" onClick={() => openBrowserTab(target.id, target.kind, target.title, target.url, false, true)}>Open in Tab</button>}{demoUnavailableTarget && <button className="open-link inspector-open-tab" type="button" disabled>Open in Tab unavailable in Demo Mode</button>}</div></div>;
}
