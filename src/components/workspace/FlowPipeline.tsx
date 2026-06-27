import React, { useEffect, useRef } from 'react';
import type { FlowItem, FlowStage } from '../../types/flow';
import { FlowCard } from './FlowCard';
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
}

const STAGES: { id: FlowStage; label: string }[] = [
  { id: 'issues', label: 'Issues' },
  { id: 'coding', label: 'Coding' },
  { id: 'pull_requests', label: 'Pull Requests' },
  { id: 'review', label: 'Review' },
  { id: 'checks', label: 'Checks' },
  { id: 'ready', label: 'Ready' },
  { id: 'merged', label: 'Merged' },
  { id: 'released', label: 'Released' },
];

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

export function FlowPipeline({ items, selectedItemId, onSelectItem, sourceControls, resetKey }: FlowPipelineProps) {
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
          {STAGES.map((stage) => {
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
                source={source}
                countDisplay={countDisplay}
                resetKey={resetKey}
                onScroll={handleLaneScroll}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FlowColumn({ stage, items, selectedItemId, onSelectItem, source, countDisplay, onScroll }: any) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { hasNextPage, isFetching, fetchNextPage } = source;
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage || isFetching) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetching) {
        fetchNextPage();
      }
    }, { rootMargin: '200px' }); // Load ahead by 200px

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, fetchNextPage]);

  return (
    <div className="flow-workbench-lane">
      <div className="flow-stage-header">
        <h4>{stage.label}</h4>
        <span className="flow-stage-count" title={typeof countDisplay === 'number' ? 'Exact total' : 'Loaded / Partial count'}>
          {countDisplay}
        </span>
      </div>
      <div className="flow-stage-content" ref={scrollRef} data-stage-id={stage.id} onScroll={onScroll}>
        {items.map((item: FlowItem) => (
          <FlowCard
            key={item.id}
            item={item}
            isSelected={item.id === selectedItemId}
            onClick={() => onSelectItem?.(item)}
            variant="workbench"
          />
        ))}
        {source.isFetching && <div className="flow-lane-loading">Loading...</div>}
        {source.hasNextPage && <div ref={sentinelRef} style={{ height: '20px' }} />}
      </div>
    </div>
  );
}
