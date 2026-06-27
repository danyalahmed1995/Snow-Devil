import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FlowEvent, FlowItem } from '../types/flow';
import { parseTimelineEvents } from '../lib/flow-replay';

interface ReplayBufferParams {
  items: FlowItem[];
  repositoryOwner?: string;
  repositoryName?: string;
  timeRange: '24h' | '7d' | '30d';
  enabled: boolean;
}

export type ReplayHistoryStatus = "idle" | "loading" | "ready" | "partial" | "error";

export interface ReplayCompleteness {
  isPartial: boolean;
  reasons: Array<
    | "timeline_page_cap"
    | "timeline_request_failed"
    | "missing_terminal_event"
    | "snapshot_mismatch"
    | "permission_limited"
    | "rate_limited"
  >;
}

interface ReplayBufferResult {
  events: FlowEvent[];
  status: ReplayHistoryStatus;
  isRefreshing: boolean;
  completeness: ReplayCompleteness;
  error: Error | null;
}

export function useReplayBuffer({ items, repositoryOwner, repositoryName, timeRange, enabled }: ReplayBufferParams): ReplayBufferResult {
  const [events, setEvents] = useState<FlowEvent[]>([]);
  const [status, setStatus] = useState<ReplayHistoryStatus>("idle");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [completeness, setCompleteness] = useState<ReplayCompleteness>({ isPartial: false, reasons: [] });
  const [error, setError] = useState<Error | null>(null);

  // Use a ref to track cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Derive stable inputs
  const stableItemIds = React.useMemo(() => [...items.map(i => i.id)].sort().join(','), [items]);
  const requestKey = `${repositoryOwner || ''}|${repositoryName || ''}|${timeRange}|${stableItemIds}`;

  // Keep a ref to the current request key to avoid race conditions
  const currentRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !repositoryOwner || !repositoryName || items.length === 0) {
      // Reset to idle. Wrapped in a synchronously-invoked async fn (no await) so the
      // updates run immediately without being a synchronous setState in the effect body.
      const resetToIdle = async () => {
        setEvents([]);
        setStatus("idle");
        setIsRefreshing(false);
        setCompleteness({ isPartial: false, reasons: [] });
        setError(null);
      };
      void resetToIdle();
      currentRequestRef.current = null;
      return;
    }

    // If the request key is exactly the same, do nothing
    if (currentRequestRef.current === requestKey) {
      return;
    }

    currentRequestRef.current = requestKey;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const fetchTimelines = async () => {
      // Determine if this is a first load or a background refresh
      const isInitialLoad = events.length === 0 || status === 'error';
      if (isInitialLoad) {
        setStatus("loading");
      } else {
        setIsRefreshing(true);
      }
      
      setError(null);

      try {
        const timeOffset = timeRange === '24h' ? 24 * 60 * 60 * 1000 : 
                           timeRange === '7d' ? 7 * 24 * 60 * 60 * 1000 : 
                           30 * 24 * 60 * 60 * 1000;
        
        const cutoffTime = Date.now() - timeOffset;

        // Filter items that might have events in range
        const relevantItems = items.filter(item => {
          if (item.type === 'release') return true; // Releases will generate pseudo-events
          if (item.status === 'active') return true;
          if (new Date(item.updatedAt).getTime() > cutoffTime) return true;
          return false;
        }).slice(0, 50); // Hard cap on items to prevent abuse

        const reasons = new Set<string>();
        if (relevantItems.length < items.filter(i => i.type !== 'release' && (i.status === 'active' || new Date(i.updatedAt).getTime() > cutoffTime)).length) {
          reasons.add('timeline_page_cap');
        }

        const allEvents: FlowEvent[] = [];

        // Add pseudo-events for releases
        for (const item of items) {
          if (item.type === 'release' && item.publishedAt) {
            allEvents.push({
              id: `release_published-${item.id}`,
              type: 'release_published' as any,
              itemId: item.id,
              repositoryId: item.repositoryId,
              occurredAt: item.publishedAt,
              actor: item.author
            });
          }
        }

        // Concurrency limit helper
        const CONCURRENCY = 4;
        const queue = relevantItems.filter(i => i.type !== 'release');
        
        const worker = async () => {
          while (queue.length > 0 && !controller.signal.aborted) {
            const item = queue.shift()!;
            try {
              const isPr = item.type === 'pull_request';
              let hasNextPage = true;
              let cursor: string | null = null;
              let pageCount = 0;
              const MAX_PAGES = 5;
              const timelineNodes: any[] = [];

              while (hasNextPage && pageCount < MAX_PAGES && !controller.signal.aborted) {
                const rawData: any = await invoke('get_item_timeline', {
                  owner: repositoryOwner,
                  name: repositoryName,
                  number: item.number,
                  isPr,
                  cursor
                });

                if (controller.signal.aborted) return;

                const nodes = rawData?.edges?.map((e: any) => e.node) || rawData?.nodes || [];
                timelineNodes.push(...nodes);

                hasNextPage = !!rawData?.pageInfo?.hasNextPage;
                cursor = rawData?.pageInfo?.endCursor || null;
                pageCount++;
              }

              if (hasNextPage) {
                reasons.add('timeline_page_cap');
              }

              const parsedEvents = parseTimelineEvents(item.id, repositoryName, timelineNodes);
              allEvents.push(...parsedEvents);
            } catch (err) {
              console.warn(`Failed to fetch timeline for ${item.number}`, err);
              reasons.add('timeline_request_failed');
            }
          }
        };

        const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }).map(worker);
        await Promise.all(workers);

        if (controller.signal.aborted) return;

        // Sort globally deterministically
        allEvents.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

        const finalReasons = Array.from(reasons) as ReplayCompleteness['reasons'];
        
        setEvents(allEvents);
        setCompleteness({ isPartial: finalReasons.length > 0, reasons: finalReasons });
        setStatus(finalReasons.length > 0 ? "partial" : "ready");
        setIsRefreshing(false);

      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
          setStatus("error");
          setIsRefreshing(false);
        }
      }
    };

    fetchTimelines();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // `requestKey` intentionally encodes repositoryOwner/Name, timeRange and the sorted
    // item ids; the effect is keyed on it to avoid redundant refetches. `events.length`
    // and `status` are read as start-of-run snapshots, so they are deliberately excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, requestKey]);

  return { events, status, isRefreshing, completeness, error };
}
