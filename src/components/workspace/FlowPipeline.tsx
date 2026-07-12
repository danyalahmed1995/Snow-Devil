import React, { useRef, useState } from 'react';
import type { FlowItem, FlowStage } from '../../types/flow';
import { FlowCard } from './FlowCard';
import { WORKFLOW_STAGES } from '../../lib/workflow-presentation';
import './FlowPipeline.css';

export interface SourceControls {
  openPrs: { fetchNextPage: () => void; hasNextPage: boolean; isFetching: boolean; exactTotal?: number };
  openIssues: { fetchNextPage: () => void; hasNextPage: boolean; isFetching: boolean; exactTotal?: number };
  mergedPrs: { fetchNextPage: () => void; hasNextPage: boolean; isFetching: boolean; exactTotal?: number };
  releases: { fetchNextPage: () => void; hasNextPage: boolean; isFetching: boolean; exactTotal?: number };
}

interface FlowPipelineProps {
  items: FlowItem[];
  selectedItemId?: string;
  onSelectItem?: (item: FlowItem) => void;
  sourceControls: SourceControls;
  resetKey?: string;
  hideEmptyStages?: boolean;
  onOpenItem?: (item: FlowItem) => void;
  focusedStage?: FlowStage;
  pendingScrollItemId?: string;
  onConsumeScroll?: () => void;
  isSurfaceActive?: boolean;
}

function getSourceKeyForStage(stage: FlowStage): keyof SourceControls {
  switch (stage) {
    case 'issues': return 'openIssues';
    case 'merged': return 'mergedPrs';
    case 'released': return 'releases';
    default: return 'openPrs';
  }
}

// Cache to preserve scroll positions across tab switches for the same context
const scrollCache = new Map<string, { left: number; top: number; ratio: number; tops: Record<string, number> }>();
const expandedStageCache = new Map<string, boolean>();

export function FlowPipeline({ items, selectedItemId, onSelectItem, onOpenItem, sourceControls, resetKey, hideEmptyStages = false, focusedStage, pendingScrollItemId, onConsumeScroll, isSurfaceActive = true }: FlowPipelineProps) {
  const laneScrollerRef = useRef<HTMLDivElement>(null);
  const focusedScrollRatioRef = useRef(0);
  const focusedWidthRef = useRef(0);
  const previousScrollContextRef = useRef<string | null>(null);

  // Re-cloak the viewport when a new focus request arrives
  const [cloakedTargetId, setCloakedTargetId] = useState<string | null>(pendingScrollItemId || null);
  React.useEffect(() => {
    if (pendingScrollItemId && pendingScrollItemId !== cloakedTargetId) {
      setCloakedTargetId(pendingScrollItemId);
    }
  }, [pendingScrollItemId]); // deliberately omit cloakedTargetId

  // Uncloak when the request is fully consumed
  React.useEffect(() => {
    if (!pendingScrollItemId && cloakedTargetId) {
      setCloakedTargetId(null);
    }
  }, [pendingScrollItemId, cloakedTargetId]);

  // Restore or reset scroll on mount / context change
  React.useLayoutEffect(() => {
    const scroller = laneScrollerRef.current;
    if (!scroller) return;

    const currentKey = resetKey || 'default';

    // If we're rendering the same context as before during THIS mount's lifetime, do nothing
    if (previousScrollContextRef.current === currentKey) {
      return;
    }

    // Context changed (or first mount)
    previousScrollContextRef.current = currentKey;

    const cached = scrollCache.get(currentKey);
    const hasPendingScroll = !!pendingScrollItemId;

    if (cached && !hasPendingScroll) {
      scroller.scrollLeft = cached.left;
      focusedScrollRatioRef.current = cached.ratio;
      scroller.scrollTop = cached.top;
      if (focusedStage) requestAnimationFrame(() => {
        const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        scroller.scrollTop = cached.ratio * maximum;
      });
      const lanes = scroller.querySelectorAll('.flow-stage-content');
      lanes.forEach((lane) => {
        const stageId = lane.getAttribute('data-stage-id');
        if (stageId && cached.tops[stageId] !== undefined) {
          lane.scrollTop = cached.tops[stageId];
        }
      });
    } else if (!hasPendingScroll) {
      scroller.scrollLeft = 0;
      scroller.scrollTop = 0;
      const lanes = scroller.querySelectorAll('.flow-stage-content');
      lanes.forEach((lane) => {
        lane.scrollTop = 0;
      });
    }
  }, [focusedStage, resetKey, pendingScrollItemId]);

  React.useLayoutEffect(() => {
    const scroller = laneScrollerRef.current;
    if (!focusedStage || !scroller || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      // Do not fight positioning logic
      if (cloakedTargetId || pendingScrollItemId) return;
      const width = entries[0]?.contentRect.width ?? scroller.clientWidth;
      const previousWidth = focusedWidthRef.current;
      focusedWidthRef.current = width;
      if (!previousWidth || Math.abs(previousWidth - width) < 1) return;
      requestAnimationFrame(() => {
        if (cloakedTargetId || pendingScrollItemId) return;
        const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        scroller.scrollTop = focusedScrollRatioRef.current * maximum;
      });
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [focusedStage, pendingScrollItemId, cloakedTargetId]);

  const handleLaneScroll = () => {
    // Suppress scroll cache writes during prepositioning
    if (cloakedTargetId) return;

    const currentKey = previousScrollContextRef.current;
    if (!currentKey) return;
    
    const scroller = laneScrollerRef.current;
    if (!scroller) return;

    const tops: Record<string, number> = {};
    const lanes = scroller.querySelectorAll('.flow-stage-content');
    lanes.forEach((lane) => {
      const stageId = lane.getAttribute('data-stage-id');
      if (stageId) {
        tops[stageId] = lane.scrollTop;
      }
    });

    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const ratio = maximum > 0 ? scroller.scrollTop / maximum : 0;
    focusedScrollRatioRef.current = ratio;
    scrollCache.set(currentKey, {
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
      ratio,
      tops
    });
  };

  const groupedItems = React.useMemo(() => {
    return items.reduce((acc, item) => {
      if (acc[item.stage]) acc[item.stage].push(item);
      return acc;
    }, {
      issues: [],
      coding: [],
      pull_requests: [],
      review: [],
      checks: [],
      ready: [],
      merged: [],
    released: [],
    deployed: [],
      closed: [],
      absent: []
    } as Record<FlowStage, FlowItem[]>);
  }, [items]);

  return (
    <div className={`flow-pipeline-shell${focusedStage ? ' flow-pipeline-shell--focused' : ''}`}>
      <div
        className={`flow-lane-scroller ${focusedStage ? 'flow-lane-scroller--focused' : ''} ${cloakedTargetId ? 'flow-lane-scroller--cloaked' : ''}`}
        ref={laneScrollerRef}
        data-testid="flow-lane-scroller"
        onScroll={handleLaneScroll}
        tabIndex={focusedStage ? 0 : undefined}
        aria-label={focusedStage ? `${WORKFLOW_STAGES.find(stage => stage.id === focusedStage)?.label ?? 'Focused stage'} results` : 'Flow stages'}
      >
        <div className={`flow-workbench-pipeline ${focusedStage ? 'flow-workbench-pipeline--focused' : ''}`} data-testid="flow-pipeline">
          {WORKFLOW_STAGES.filter(stage => (!focusedStage || stage.id === focusedStage) && (!hideEmptyStages || groupedItems[stage.id].length > 0)).map((stage) => {
            const sourceKey = getSourceKeyForStage(stage.id);
            const source = sourceControls[sourceKey];
            const isCanonical = stage.id === 'issues' || stage.id === 'merged' || stage.id === 'pull_requests';
            
            let countDisplay: string | number = groupedItems[stage.id].length;
            if (isCanonical && source.exactTotal !== undefined) {
              countDisplay = source.exactTotal;
            } else if (source.hasNextPage) {
              countDisplay = `${countDisplay} loaded · more available`;
            } else if (countDisplay > 0) {
               countDisplay = `${countDisplay} loaded`;
            }

            return (
              <FlowColumn 
                key={stage.id} 
                stage={stage} 
                items={groupedItems[stage.id]} 
                selectedItemId={selectedItemId} 
                onSelectItem={onSelectItem} 
                onOpenItem={onOpenItem}
                source={source}
                countDisplay={countDisplay}
                onScroll={handleLaneScroll}
                expansionKey={`${resetKey || 'default'}:${stage.id}`}
                pendingScrollItemId={pendingScrollItemId}
                onConsumeScroll={onConsumeScroll}
                isSurfaceActive={isSurfaceActive}
                onFocusSettled={handleLaneScroll}
                usesPipelineScroller={Boolean(focusedStage)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const FLOW_STAGE_PREVIEW_LIMIT = 5;

function FlowColumn({ stage, items, selectedItemId, onSelectItem, onOpenItem, source, countDisplay, onScroll, expansionKey, pendingScrollItemId, onConsumeScroll, isSurfaceActive, onFocusSettled, usesPipelineScroller }: { stage: { id: FlowStage; label: string }; items: FlowItem[]; selectedItemId?: string; onSelectItem?: (item: FlowItem) => void; onOpenItem?: (item: FlowItem) => void; source: SourceControls[keyof SourceControls]; countDisplay: string | number; onScroll: () => void; expansionKey: string; pendingScrollItemId?: string; onConsumeScroll?: () => void; isSurfaceActive: boolean; onFocusSettled: () => void; usesPipelineScroller: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(() => expandedStageCache.get(expansionKey) ?? false);
  const shouldExpandForFocus = Boolean(pendingScrollItemId && items.slice(FLOW_STAGE_PREVIEW_LIMIT).some(item => item.id === pendingScrollItemId));
  const visibleItems = expanded || shouldExpandForFocus ? items : items.slice(0, FLOW_STAGE_PREVIEW_LIMIT);
  const hidden = Math.max(0, items.length - visibleItems.length);

  // Stable refs for things that shouldn't trigger the positioning effect
  const latestProps = useRef({ items, visibleItems, onConsumeScroll, onFocusSettled, source });
  React.useLayoutEffect(() => {
    latestProps.current = { items, visibleItems, onConsumeScroll, onFocusSettled, source };
  });

  // Synchronous pre-positioning effect
  React.useLayoutEffect(() => {
    if (!pendingScrollItemId || !isSurfaceActive) return;

    const { items: currentItems, visibleItems: currentVisible, onConsumeScroll: currentConsume, onFocusSettled: currentSettle, source: currentSource } = latestProps.current;

    const hasItem = currentItems.some(item => item.id === pendingScrollItemId);
    if (!hasItem) {
      // Safe failure path: if data is fully loaded for this page and item is not found, consume to lift cloak.
      if (!currentSource.isFetching) {
        console.warn(`[FlowFocus] Target ${pendingScrollItemId} not found in stage ${stage.id}. Consuming request to lift cloak.`);
        requestAnimationFrame(() => currentConsume?.());
      }
      return;
    }

    const isInVisibleSet = currentVisible.some(item => item.id === pendingScrollItemId);
    if (!isInVisibleSet) return; // Wait for expansion to settle

    const container = scrollRef.current;
    if (!container) return;

    const targetElement = container.querySelector<HTMLElement>(
      `[data-flow-item-id="${CSS.escape(pendingScrollItemId)}"]`
    );
    if (!targetElement) return;

    const scrollContainer = usesPipelineScroller ? targetElement.closest<HTMLElement>('.flow-lane-scroller') : container;
    if (!scrollContainer) return;

    const targetRect = targetElement.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const relativeTop = targetRect.top - containerRect.top + scrollContainer.scrollTop;
    
    // Position target near the upper third (offsetting for headers)
    const padding = 120; // leaves space for sticky headers/bars
    const desiredScrollTop = relativeTop - padding;
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    const endScrollTop = Math.max(0, Math.min(maxScrollTop, desiredScrollTop));

    // Synchronously assign the destination
    scrollContainer.scrollTop = endScrollTop;

    if (shouldExpandForFocus) {
      expandedStageCache.set(expansionKey, true);
      setExpanded(true);
    }
    
    currentSettle();

    // Consume the request to lift the cloaking on the NEXT frame,
    // ensuring the DOM has settled at the new position before becoming visible.
    requestAnimationFrame(() => {
      currentConsume?.();
      
      const card = targetElement.querySelector('.flow-card');
      if (card) {
        card.classList.add('flow-card--target-highlight');
        setTimeout(() => {
          if (card.isConnected) {
            card.classList.remove('flow-card--target-highlight');
          }
        }, 800);
      }
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScrollItemId, expanded, isSurfaceActive, stage.id]);

  const toggleExpanded = () => {
    if (expanded) {
      expandedStageCache.set(expansionKey, false);
      setExpanded(false);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      return;
    }
    expandedStageCache.set(expansionKey, true);
    setExpanded(true);
    if (source.hasNextPage && !source.isFetching) source.fetchNextPage();
  };

  return (
    <div className="flow-workbench-lane">
      <div className="flow-stage-header">
        <h4>{stage.label}</h4>
        <span className="flow-stage-count" data-tooltip={typeof countDisplay === 'number' ? 'Exact total\nAll matching items are loaded.' : 'Partial count\nShows loaded items while additional pages remain.'}>
          {countDisplay}
        </span>
      </div>
      <div className="flow-stage-content" ref={scrollRef} data-stage-id={stage.id} onScroll={onScroll}>
        {visibleItems.map((item) => (
          <div key={item.id} data-flow-item-id={item.id}><FlowCard
            item={item}
            isSelected={item.id === selectedItemId}
            onClick={() => onSelectItem?.(item)}
            onOpen={() => onOpenItem?.(item)}
            variant="workbench"
          /></div>
        ))}
        {items.length === 0 && <div className="flow-stage-empty">No items in this stage</div>}
        {source.isFetching && <div className="flow-lane-loading">Loading...</div>}
      </div>
      {(hidden > 0 || expanded || source.hasNextPage) && <button className="flow-stage-more" type="button" onClick={toggleExpanded}>{expanded ? 'Show fewer' : hidden > 0 ? `Show ${hidden} more` : 'Load more'}</button>}
    </div>
  );
}
