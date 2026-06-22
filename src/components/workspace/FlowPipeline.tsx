import React, { useEffect, useRef, useState } from 'react';
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
const scrollCache = new Map<string, { left: number; tops: Record<string, number> }>();

export function FlowPipeline({ items, selectedItemId, onSelectItem, onOpenItem, sourceControls, resetKey, hideEmptyStages = false }: FlowPipelineProps) {
  const laneScrollerRef = useRef<HTMLDivElement>(null);

  const previousScrollContextRef = useRef<string | null>(null);

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
    if (cached) {
      scroller.scrollLeft = cached.left;
      const lanes = scroller.querySelectorAll('.flow-stage-content');
      lanes.forEach((lane) => {
        const stageId = lane.getAttribute('data-stage-id');
        if (stageId && cached.tops[stageId] !== undefined) {
          lane.scrollTop = cached.tops[stageId];
        }
      });
    } else {
      scroller.scrollLeft = 0;
      const lanes = scroller.querySelectorAll('.flow-stage-content');
      lanes.forEach((lane) => {
        lane.scrollTop = 0;
      });
    }
  }, [resetKey]);

  const handleLaneScroll = () => {
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

    scrollCache.set(currentKey, {
      left: scroller.scrollLeft,
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

  const hasActiveItems = items.some(i => i.type !== 'release' && i.stage !== 'merged');
  
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      {!hasActiveItems && (
        <div className="flow-empty-banner" style={{ padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px', pointerEvents: 'none' }}>
          No active issues or pull requests found.
        </div>
      )}
      <div className="flow-lane-scroller" ref={laneScrollerRef} data-testid="flow-lane-scroller" onScroll={handleLaneScroll}>
        <div className="flow-workbench-pipeline" data-testid="flow-pipeline">
          {WORKFLOW_STAGES.filter(stage => !hideEmptyStages || groupedItems[stage.id].length > 0).map((stage) => {
            const sourceKey = getSourceKeyForStage(stage.id);
            const source = sourceControls[sourceKey];
            const isCanonical = stage.id === 'issues' || stage.id === 'merged' || stage.id === 'pull_requests';
            
            let countDisplay: string | number = groupedItems[stage.id].length;
            if (isCanonical && source.exactTotal !== undefined) {
              countDisplay = source.exactTotal;
            } else if (source.hasNextPage) {
              countDisplay = `${countDisplay}+`;
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
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const FLOW_STAGE_PREVIEW_LIMIT = 5;

function FlowColumn({ stage, items, selectedItemId, onSelectItem, onOpenItem, source, countDisplay, onScroll }: { stage: { id: FlowStage; label: string }; items: FlowItem[]; selectedItemId?: string; onSelectItem?: (item: FlowItem) => void; onOpenItem?: (item: FlowItem) => void; source: SourceControls[keyof SourceControls]; countDisplay: string | number; onScroll: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, FLOW_STAGE_PREVIEW_LIMIT);
  const hidden = Math.max(0, items.length - visibleItems.length);

  useEffect(() => {
    if (!expanded || !selectedItemId || !scrollRef.current) return;
    const selected = [...scrollRef.current.querySelectorAll<HTMLElement>('[data-flow-item-id]')].find(element => element.dataset.flowItemId === selectedItemId);
    selected?.scrollIntoView?.({ block: 'nearest' });
  }, [expanded, selectedItemId]);

  const toggleExpanded = () => {
    if (expanded) {
      setExpanded(false);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      return;
    }
    setExpanded(true);
    if (source.hasNextPage && !source.isFetching) source.fetchNextPage();
  };

  return (
    <div className="flow-workbench-lane">
      <div className="flow-stage-header">
        <h4>{stage.label}</h4>
        <span className="flow-stage-count" title={typeof countDisplay === 'number' ? 'Exact total' : 'Loaded / Partial count'}>
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
