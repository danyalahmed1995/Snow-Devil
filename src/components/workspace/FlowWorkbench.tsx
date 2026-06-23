import { useEffect, useMemo, useRef } from 'react';
import { FlowPipeline, SourceControls } from './FlowPipeline';
import { useInfiniteSource } from '../../hooks/useInfiniteSource';
import { useReplayBuffer } from '../../hooks/useReplayBuffer';
import { parseGitHubIssueOrPR, parseRelease } from '../../lib/flow-parser';
import { buildBaselineState, advanceItemState } from '../../lib/flow-replay';
import { useFlowStore } from '../../stores/flow-store';
import { useModeStore } from '../../stores/mode-store';
import { useDemoPipeline } from '../../hooks/useDemoData';
import { demoPipelineItemToFlowItem } from '../../data/demo-provider';
import { useTabsStore } from '../../stores/tabs-store';
import { RepositorySelector } from './RepositorySelector';
import type { FlowItem } from '../../types/flow';
import { filterWorkflowItems, normalizeWorkflowItem, WORKFLOW_STAGES } from '../../lib/workflow-presentation';
import { resolveEntityTabTarget } from '../../lib/entity-target';
import './FlowWorkbench.css';

function flattenSourcePages(
  data: any, 
  type: 'issue' | 'pull_request' | 'release',
  options?: {
    assertRepoId?: string;
    repoNameWithOwner?: string;
  }
): { items: FlowItem[], exactTotal?: number } {
  if (!data || !data.pages) return { items: [] };
  const itemsMap = new Map<string, FlowItem>();
  let exactTotal: number | undefined = undefined;

  const repoOwner = options?.repoNameWithOwner?.split('/')[0] || '';
  const repoId = options?.assertRepoId || '';

  for (const page of data.pages) {
    if (page?.search?.issueCount !== undefined) exactTotal = page.search.issueCount;
    if (page?.releases?.totalCount !== undefined) exactTotal = page.releases.totalCount;

    const nodes = page?.search?.nodes || 
                  page?.releases?.nodes || 
                  page?.pullRequests?.nodes || 
                  page?.issues?.nodes || 
                  [];
    for (const node of nodes) {
      if (!node || !node.id) continue;
      
      let item: FlowItem;
      if (type === 'release') {
        item = parseRelease(node, repoId, options?.repoNameWithOwner || '', repoOwner);
      } else {
        item = parseGitHubIssueOrPR(node, type);
      }

      // Runtime Assertions
      if (options?.assertRepoId) {
        if (item.repositoryId !== options.assertRepoId) {
          console.warn(`[Flow] Data leak prevented: Discarded item ${item.id} belonging to ${item.repositoryName} instead of expected ${options.repoNameWithOwner}`);
          continue;
        }
      }

      itemsMap.set(item.id, item);
    }
  }

  return { items: Array.from(itemsMap.values()), exactTotal };
}

export function FlowWorkbench() {
  const appMode = useModeStore(state => state.mode);
  const { data: demoPipeline, isLoading: demoLoading, error: demoError } = useDemoPipeline();
  const activeTabId = useTabsStore(s => s.activeTabId);
  const openBrowserTab = useTabsStore(s => s.openBrowserTab);
  const openNativeTab = useTabsStore(s => s.openNativeTab);
  const flowState = useFlowStore(s => s.getTabState(activeTabId));
  const setFlowState = useFlowStore(s => s.setTabState);

  const scope = flowState.scope;
  const mode = flowState.mode;
  const selectedRepository = flowState.selectedRepository;
  const selectedItemId = flowState.selectedItemId;
  
  const timeRange = flowState.timeRange;
  const rangeStart = flowState.rangeStart;
  const rangeEnd = flowState.rangeEnd;
  const cursorTime = flowState.cursorTime;
  const isPlaying = flowState.isPlaying;
  const playbackSpeed = flowState.playbackSpeed;
  const search = flowState.search;
  const activeOnly = flowState.activeOnly;
  const hideEmptyStages = flowState.hideEmptyStages;
  const filterStage = flowState.filterStage;
  const statusFilter = flowState.statusFilter;

  const repoOwner = selectedRepository?.nameWithOwner.split('/')[0] || '';
  const repoName = selectedRepository?.nameWithOwner.split('/')[1] || '';
  const isRepo = scope === 'repository' && !!selectedRepository;
  const isAccount = scope === 'account';
  const liveEnabled = appMode === 'live';

  // Repository Sources
  const repoOpenPrs = useInfiniteSource({ scope, mode, timeRange, sourceType: 'open_prs', repositoryOwner: repoOwner, repositoryName: selectedRepository?.nameWithOwner.split('/')[1] || '', pageSize: 50, enabled: liveEnabled && isRepo });
  const repoOpenIssues = useInfiniteSource({ scope, mode, timeRange, sourceType: 'open_issues', repositoryOwner: repoOwner, repositoryName: selectedRepository?.nameWithOwner.split('/')[1] || '', pageSize: 50, enabled: liveEnabled && isRepo });
  const repoMergedPrs = useInfiniteSource({ scope, mode, timeRange, sourceType: 'merged_prs', repositoryOwner: repoOwner, repositoryName: selectedRepository?.nameWithOwner.split('/')[1] || '', pageSize: 50, enabled: liveEnabled && isRepo });
  const repoReleases = useInfiniteSource({ scope, mode, timeRange, sourceType: 'releases', repositoryOwner: repoOwner, repositoryName: selectedRepository?.nameWithOwner.split('/')[1] || '', pageSize: 50, enabled: liveEnabled && isRepo });

  // Account Sources
  const accAuthoredPrs = useInfiniteSource({ scope, mode, timeRange, sourceType: 'authored_prs', pageSize: 50, enabled: liveEnabled && isAccount });
  const accReviewReqPrs = useInfiniteSource({ scope, mode, timeRange, sourceType: 'review_requested_prs', pageSize: 50, enabled: liveEnabled && isAccount });
  const accReviewedPrs = useInfiniteSource({ scope, mode, timeRange, sourceType: 'reviewed_prs', pageSize: 50, enabled: liveEnabled && isAccount });
  const accAuthoredIssues = useInfiniteSource({ scope, mode, timeRange, sourceType: 'authored_issues', pageSize: 50, enabled: liveEnabled && isAccount });
  const accAssignedIssues = useInfiniteSource({ scope, mode, timeRange, sourceType: 'assigned_issues', pageSize: 50, enabled: liveEnabled && isAccount });
  const accMergedPrs = useInfiniteSource({ scope, mode, timeRange, sourceType: 'merged_prs', pageSize: 50, enabled: liveEnabled && isAccount });

  // Flatten and Map
  const repoOpts = useMemo(() => isRepo ? {
    assertRepoId: selectedRepository?.id,
    repoNameWithOwner: selectedRepository?.nameWithOwner,
  } : undefined, [isRepo, selectedRepository?.id, selectedRepository?.nameWithOwner]);
  
  const { items: rawRepoOpenPrs, exactTotal: repoOpenPrsTotal } = useMemo(() => flattenSourcePages(repoOpenPrs.data, 'pull_request', repoOpts), [repoOpenPrs.data, repoOpts]);
  const { items: rawRepoOpenIssues, exactTotal: repoOpenIssuesTotal } = useMemo(() => flattenSourcePages(repoOpenIssues.data, 'issue', repoOpts), [repoOpenIssues.data, repoOpts]);
  const { items: rawRepoMergedPrs, exactTotal: repoMergedPrsTotal } = useMemo(() => flattenSourcePages(repoMergedPrs.data, 'pull_request', repoOpts), [repoMergedPrs.data, repoOpts]);
  const { items: rawRepoReleases, exactTotal: repoReleasesTotal } = useMemo(() => flattenSourcePages(repoReleases.data, 'release', repoOpts), [repoReleases.data, repoOpts]);

  const { items: rawAccAuthoredPrs } = useMemo(() => flattenSourcePages(accAuthoredPrs.data, 'pull_request'), [accAuthoredPrs.data]);
  const { items: rawAccReviewReqPrs } = useMemo(() => flattenSourcePages(accReviewReqPrs.data, 'pull_request'), [accReviewReqPrs.data]);
  const { items: rawAccReviewedPrs } = useMemo(() => flattenSourcePages(accReviewedPrs.data, 'pull_request'), [accReviewedPrs.data]);
  const { items: rawAccAuthoredIssues } = useMemo(() => flattenSourcePages(accAuthoredIssues.data, 'issue'), [accAuthoredIssues.data]);
  const { items: rawAccAssignedIssues } = useMemo(() => flattenSourcePages(accAssignedIssues.data, 'issue'), [accAssignedIssues.data]);
  const { items: rawAccMergedPrs, exactTotal: accMergedPrsTotal } = useMemo(() => flattenSourcePages(accMergedPrs.data, 'pull_request'), [accMergedPrs.data]);

  const baseItems = useMemo(() => {
    if (appMode === 'demo') {
      const fixtureItems = (demoPipeline?.items || []).map(demoPipelineItemToFlowItem);
      return isRepo && selectedRepository
        ? fixtureItems.filter(item => item.repositoryId === selectedRepository.id)
        : fixtureItems;
    }
    const all = isRepo 
      ? [...rawRepoOpenPrs, ...rawRepoOpenIssues, ...rawRepoMergedPrs, ...rawRepoReleases]
      : [...rawAccAuthoredPrs, ...rawAccReviewReqPrs, ...rawAccReviewedPrs, ...rawAccAuthoredIssues, ...rawAccAssignedIssues, ...rawAccMergedPrs];
    
    // In account scope, attach explicit inclusionReason
    if (isAccount) {
      const authoredSet = new Set(rawAccAuthoredPrs.map(i => i.id));
      const reviewReqSet = new Set(rawAccReviewReqPrs.map(i => i.id));
      const reviewedSet = new Set(rawAccReviewedPrs.map(i => i.id));
      const authoredIssueSet = new Set(rawAccAuthoredIssues.map(i => i.id));
      const assignedIssueSet = new Set(rawAccAssignedIssues.map(i => i.id));
      const mergedSet = new Set(rawAccMergedPrs.map(i => i.id));

      for (const item of all) {
        if (!item.inclusionReason) {
          if (mergedSet.has(item.id)) item.inclusionReason = 'Recently merged contribution';
          else if (authoredSet.has(item.id) || authoredIssueSet.has(item.id)) item.inclusionReason = 'Authored by you';
          else if (reviewReqSet.has(item.id)) item.inclusionReason = 'Review requested from you';
          else if (reviewedSet.has(item.id)) item.inclusionReason = 'Reviewed by you';
          else if (assignedIssueSet.has(item.id)) item.inclusionReason = 'Assigned to you';
        }
      }
    }

    const map = new Map<string, FlowItem>();
    for (const item of all) map.set(item.id, item);
    return Array.from(map.values());
  }, [
    appMode, demoPipeline, selectedRepository, isRepo, isAccount,
    rawRepoOpenPrs, rawRepoOpenIssues, rawRepoMergedPrs, rawRepoReleases,
    rawAccAuthoredPrs, rawAccReviewReqPrs, rawAccReviewedPrs, rawAccAuthoredIssues, rawAccAssignedIssues, rawAccMergedPrs
  ]);

  const sourceControls: SourceControls = useMemo(() => {
    if (appMode === 'demo') {
      const count = (type: FlowItem['type'], stage?: FlowItem['stage']) => baseItems.filter(item => item.type === type && (!stage || item.stage === stage)).length;
      const fixed = (exactTotal?: number) => ({ fetchNextPage: () => {}, hasNextPage: false, isFetching: false, exactTotal });
      return {
        openPrs: fixed(),
        openIssues: fixed(),
        mergedPrs: fixed(count('pull_request', 'merged')),
        releases: fixed(count('release')),
      };
    }
    if (isRepo) {
      return {
        openPrs: { fetchNextPage: () => repoOpenPrs.fetchNextPage(), hasNextPage: !!repoOpenPrs.hasNextPage, isFetching: repoOpenPrs.isFetchingNextPage, exactTotal: repoOpenPrsTotal },
        openIssues: { fetchNextPage: () => repoOpenIssues.fetchNextPage(), hasNextPage: !!repoOpenIssues.hasNextPage, isFetching: repoOpenIssues.isFetchingNextPage, exactTotal: repoOpenIssuesTotal },
        mergedPrs: { fetchNextPage: () => repoMergedPrs.fetchNextPage(), hasNextPage: !!repoMergedPrs.hasNextPage, isFetching: repoMergedPrs.isFetchingNextPage, exactTotal: repoMergedPrsTotal },
        releases: { fetchNextPage: () => repoReleases.fetchNextPage(), hasNextPage: !!repoReleases.hasNextPage, isFetching: repoReleases.isFetchingNextPage, exactTotal: repoReleasesTotal }
      };
    } else {
      return {
        openPrs: { 
          fetchNextPage: () => {
            if (accAuthoredPrs.hasNextPage && !accAuthoredPrs.isFetchingNextPage) accAuthoredPrs.fetchNextPage();
            if (accReviewReqPrs.hasNextPage && !accReviewReqPrs.isFetchingNextPage) accReviewReqPrs.fetchNextPage();
            if (accReviewedPrs.hasNextPage && !accReviewedPrs.isFetchingNextPage) accReviewedPrs.fetchNextPage();
          }, 
          hasNextPage: !!(accAuthoredPrs.hasNextPage || accReviewReqPrs.hasNextPage || accReviewedPrs.hasNextPage), 
          isFetching: accAuthoredPrs.isFetchingNextPage || accReviewReqPrs.isFetchingNextPage || accReviewedPrs.isFetchingNextPage, 
          exactTotal: undefined 
        },
        openIssues: { 
          fetchNextPage: () => {
            if (accAuthoredIssues.hasNextPage && !accAuthoredIssues.isFetchingNextPage) accAuthoredIssues.fetchNextPage();
            if (accAssignedIssues.hasNextPage && !accAssignedIssues.isFetchingNextPage) accAssignedIssues.fetchNextPage();
          }, 
          hasNextPage: !!(accAuthoredIssues.hasNextPage || accAssignedIssues.hasNextPage), 
          isFetching: accAuthoredIssues.isFetchingNextPage || accAssignedIssues.isFetchingNextPage, 
          exactTotal: undefined 
        },
        mergedPrs: { 
          fetchNextPage: () => accMergedPrs.fetchNextPage(), 
          hasNextPage: !!accMergedPrs.hasNextPage, 
          isFetching: accMergedPrs.isFetchingNextPage, 
          exactTotal: accMergedPrsTotal 
        },
        releases: { fetchNextPage: () => {}, hasNextPage: false, isFetching: false, exactTotal: 0 }
      };
    }
  }, [
    appMode, baseItems, isRepo,
    repoOpenPrs, repoOpenIssues, repoMergedPrs, repoReleases,
    repoOpenPrsTotal, repoOpenIssuesTotal, repoMergedPrsTotal, repoReleasesTotal,
    accAuthoredPrs, accReviewReqPrs, accReviewedPrs, accAuthoredIssues, accAssignedIssues, accMergedPrs,
    accMergedPrsTotal
  ]);

  // Replay Buffer Hook
  const { events: replayEvents, status: replayStatus, isRefreshing: isReplayRefreshing, completeness: replayCompleteness, error: replayError } = useReplayBuffer({
    items: baseItems,
    repositoryOwner: selectedRepository ? repoOwner : undefined,
    repositoryName: selectedRepository ? repoName : undefined,
    timeRange,
    enabled: appMode === 'live' && mode === 'replay' && scope === 'repository' && !!selectedRepository
  });

  // Pre-calculate baselines when baseItems or replayEvents change
  const baselineItems = useMemo(() => {
    if (mode === 'live' || scope !== 'repository') return [];
    return baseItems.map(item => buildBaselineState(item, replayEvents, rangeStart));
  }, [baseItems, mode, scope, replayEvents, rangeStart]);

  // Calculate items for current mode
  const classifiedItems = useMemo(() => {
    const currentItems = appMode === 'demo' || mode === 'live' || scope !== 'repository'
      ? baseItems
      : baselineItems.map(item => advanceItemState(item, replayEvents, rangeStart, cursorTime));
    return currentItems.map(item => normalizeWorkflowItem(item, appMode, appMode === 'demo' ? demoPipeline?.referenceDate : undefined));
  }, [appMode, baselineItems, baseItems, mode, scope, replayEvents, rangeStart, cursorTime, demoPipeline?.referenceDate]);

  const items = useMemo(() => scope === 'repository' && !selectedRepository ? [] : filterWorkflowItems(classifiedItems, { search, activeOnly, stage: filterStage, statusFilter, repositoryId: isRepo ? selectedRepository?.id : undefined }), [classifiedItems, search, activeOnly, filterStage, statusFilter, scope, isRepo, selectedRepository]);

  // Compare final state to detect missed events
  const isMismatchPartial = useMemo(() => {
    if (mode !== 'replay' || scope !== 'repository' || cursorTime < rangeEnd) return false;
    for (let i = 0; i < baseItems.length; i++) {
      const base = baseItems[i];
      const replayed = items[i];
      if (base && replayed && (base.stage !== replayed.stage || base.status !== replayed.status)) {
        return true;
      }
    }
    return false;
  }, [mode, scope, cursorTime, rangeEnd, baseItems, items]);

  const displayPartial = replayStatus === 'partial' || isMismatchPartial;

  // Clear selected item when scope or dataset changes
  useEffect(() => {
    setFlowState(activeTabId, { selectedItemId: undefined, selectedFlowItem: undefined });
  }, [scope, selectedRepository?.id, mode, activeTabId, setFlowState]);

  useEffect(() => {
    const clearTransientFilters = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!search && !filterStage && statusFilter === 'all') return;
      setFlowState(activeTabId, { search: '', filterStage: undefined, statusFilter: 'all' });
    };
    window.addEventListener('keydown', clearTransientFilters);
    return () => window.removeEventListener('keydown', clearTransientFilters);
  }, [activeTabId, filterStage, search, setFlowState, statusFilter]);

  // Update range bounds when timeRange changes
  useEffect(() => {
    if (mode !== 'replay') return;
    const now = appMode === 'demo' && demoPipeline?.referenceDate
      ? new Date(demoPipeline.referenceDate).getTime()
      : Date.now();
    const offset = timeRange === '24h' ? 24 * 60 * 60 * 1000 : 
                   timeRange === '7d' ? 7 * 24 * 60 * 60 * 1000 : 
                   30 * 24 * 60 * 60 * 1000;
    const newStart = now - offset;
    const currentCursor = useFlowStore.getState().getTabState(activeTabId).cursorTime;
    
    setFlowState(activeTabId, {
      rangeStart: newStart,
      rangeEnd: now,
      cursorTime: Math.max(newStart, Math.min(now, currentCursor)),
      isPlaying: false
    });
  }, [timeRange, mode, appMode, demoPipeline?.referenceDate, activeTabId, setFlowState]);

  // Playback Loop
  const requestRef = useRef<number | undefined>(undefined);
  const previousTimeRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && flowState.isPlaying) {
        setFlowState(activeTabId, { isPlaying: false });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeTabId, setFlowState, flowState.isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      previousTimeRef.current = undefined;
      return;
    }

    const animate = (time: number) => {
      if (previousTimeRef.current !== undefined) {
        const deltaTime = time - previousTimeRef.current;
        const speedMultiplier = 3600 * playbackSpeed;
        
        const currentState = useFlowStore.getState().getTabState(activeTabId);
        const newCursorTime = currentState.cursorTime + (deltaTime * speedMultiplier);
        if (newCursorTime >= currentState.rangeEnd) {
          setFlowState(activeTabId, { cursorTime: currentState.rangeEnd, isPlaying: false });
        } else {
          setFlowState(activeTabId, { cursorTime: newCursorTime });
        }
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, playbackSpeed, activeTabId, setFlowState]);

  const liveLoading = isRepo
    ? repoOpenPrs.isLoading || repoOpenIssues.isLoading || repoMergedPrs.isLoading || repoReleases.isLoading
    : accAuthoredPrs.isLoading || accReviewReqPrs.isLoading || accReviewedPrs.isLoading || accAuthoredIssues.isLoading || accAssignedIssues.isLoading || accMergedPrs.isLoading;

  const liveError = isRepo
    ? repoOpenPrs.error || repoOpenIssues.error || repoMergedPrs.error || repoReleases.error
    : accAuthoredPrs.error || accReviewReqPrs.error || accReviewedPrs.error || accAuthoredIssues.error || accAssignedIssues.error || accMergedPrs.error;

  const prsLoaded = baseItems.filter(i => i.type === 'pull_request').length;
  const issuesLoaded = baseItems.filter(i => i.type === 'issue').length;
  const releasesLoaded = baseItems.filter(i => i.type === 'release').length;

  const timelineEventsLoaded = replayEvents.filter(e => !['CheckSuiteEvent', 'release_published'].includes(e.type)).length;
  const checkEventsLoaded = replayEvents.filter(e => e.type === 'CheckSuiteEvent').length;
  const publicationEventsLoaded = replayEvents.filter(e => e.type === 'release_published').length;

  const isLoading = appMode === 'demo' ? demoLoading : liveLoading;
  const error = appMode === 'demo' ? demoError : liveError;

  return (
    <div className="flow-workbench" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      <div className="flow-header" style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <label className="flow-field">Scope<select aria-label="Flow scope" value={scope} onChange={(e) => setFlowState(activeTabId, { scope: e.target.value as 'account' | 'repository', filterStage: undefined })}>
            <option value="account">Account Flow</option>
            <option value="repository">Repository Flow</option>
          </select></label>

        {scope === 'repository' && (
          <RepositorySelector 
            selectedRepo={selectedRepository}
            onSelect={(repo) => setFlowState(activeTabId, { selectedRepository: repo })}
          />
        )}
        <label className="flow-field">Range<select aria-label="Flow time range" value={timeRange} onChange={(e) => setFlowState(activeTabId, { timeRange: e.target.value as typeof timeRange })}><option value="24h">24 hours</option><option value="7d">7 days</option><option value="30d">30 days</option></select></label>
        <label className="flow-toggle"><input aria-label="Active items only" type="checkbox" checked={activeOnly} onChange={event => setFlowState(activeTabId, { activeOnly: event.target.checked })} /> Active only</label>
        <label className="flow-toggle"><input aria-label="Hide empty stages" type="checkbox" checked={hideEmptyStages} onChange={event => setFlowState(activeTabId, { hideEmptyStages: event.target.checked })} /> Hide empty</label>
        <label className="flow-field flow-search">Search<input aria-label="Search Flow" value={search} onChange={event => setFlowState(activeTabId, { search: event.target.value })} placeholder="Title, repo, author, label..." /></label>
        <label className="flow-field">Stage<select aria-label="Flow stage filter" value={filterStage ?? ''} onChange={event => setFlowState(activeTabId, { filterStage: (event.target.value || undefined) as FlowItem['stage'] | undefined })}><option value="">All stages</option>{WORKFLOW_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
        <label className="flow-field">Filter<select aria-label="Flow status filter" value={statusFilter} onChange={event => setFlowState(activeTabId, { statusFilter: event.target.value as typeof statusFilter })}><option value="all">All states</option><option value="attention">Needs attention</option><option value="waiting_review">Waiting review</option><option value="failing">Failing checks</option><option value="merged">Recently merged</option></select></label>
        
        <div className="mode-selector" style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button 
            className={mode === 'live' ? 'active' : ''} 
            onClick={() => setFlowState(activeTabId, { mode: 'live' })}
            style={{ fontWeight: mode === 'live' ? 'bold' : 'normal' }}
          >
            Live
          </button>
          <button 
            className={mode === 'replay' ? 'active' : ''} 
            onClick={() => setFlowState(activeTabId, { mode: 'replay' })}
            style={{ fontWeight: mode === 'replay' ? 'bold' : 'normal' }}
          >
            Replay
          </button>
        </div>
      </div>
      
      <div className="flow-content" style={{ flex: 1, overflow: 'hidden', minWidth: 0, minHeight: 0, padding: '16px', display: 'flex', flexDirection: 'column' }}>
        {mode === 'replay' && scope === 'repository' && selectedRepository && (
          <div className="replay-controls-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            <div className="replay-controls" style={{ padding: '12px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', gap: '16px', alignItems: 'center' }}>
              <button onClick={() => setFlowState(activeTabId, { isPlaying: !isPlaying })} style={{ padding: '6px 12px', borderRadius: '4px', background: isPlaying ? 'var(--status-danger-bg)' : 'var(--accent)', color: isPlaying ? 'var(--status-danger-fg)' : 'var(--text-on-accent)', border: 'none', cursor: 'pointer' }}>
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <select value={playbackSpeed} onChange={(e) => setFlowState(activeTabId, { playbackSpeed: parseFloat(e.target.value) })}>
                <option value="0.5">0.5x Speed</option>
                <option value="1">1x Speed</option>
                <option value="2">2x Speed</option>
                <option value="4">4x Speed</option>
              </select>
              <select value={timeRange} onChange={(e) => setFlowState(activeTabId, { timeRange: e.target.value as any })}>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
              <input 
                type="range" 
                min={rangeStart} 
                max={rangeEnd} 
                value={cursorTime}
                onChange={(e) => setFlowState(activeTabId, { cursorTime: parseInt(e.target.value, 10) })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                {new Date(cursorTime).toLocaleString()}
              </span>
            </div>
            
            <div className="replay-summary" style={{ padding: '8px 12px', background: displayPartial ? 'var(--status-warning-bg)' : 'var(--surface)', color: displayPartial ? 'var(--status-warning-fg)' : undefined, borderRadius: '8px', border: displayPartial ? '1px solid color-mix(in srgb, currentColor 24%, transparent)' : '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span><strong>Range:</strong> {new Date(rangeStart).toLocaleString()} - {new Date(rangeEnd).toLocaleString()}</span>
                {replayStatus === 'loading' && <span style={{ color: 'var(--text-muted)' }}>Loading history...</span>}
                {isReplayRefreshing && <span style={{ color: 'var(--text-muted)' }}>Refreshing...</span>}
                {displayPartial && <span style={{ fontWeight: 'bold' }} title={replayCompleteness.reasons.join(', ')}>Partial History</span>}
                {replayError && <span style={{ color: 'var(--status-danger-fg)', background: 'var(--status-danger-bg)', borderRadius: '4px', padding: '2px 6px' }}>{replayError.message}</span>}
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', color: 'var(--text-secondary)' }}>
                <span>{issuesLoaded} issues</span>
                <span>{prsLoaded} PRs</span>
                <span>{releasesLoaded} releases</span>
                <span style={{ marginLeft: '16px' }}>{timelineEventsLoaded} events</span>
                <span>{checkEventsLoaded} checks</span>
                <span>{publicationEventsLoaded} publications</span>
              </div>
            </div>
          </div>
        )}

        {scope === 'repository' && !selectedRepository ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <h2>Select a Repository</h2>
            <p>Use the dropdown above to select a repository and view its flow.</p>
          </div>
        ) : isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Loading {scope} flow...
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
            Error loading flow: {(error as Error).message}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {isLoading ? (
              <div className="flow-loading-overlay">
                <div className="spinner"></div>
                <p>Loading flow data...</p>
              </div>
            ) : (
              <FlowPipeline
                key={`${scope}-${selectedRepository?.id || 'none'}-${mode}`}
                resetKey={`${appMode}-${scope}-${selectedRepository?.id || 'none'}-${mode}-${timeRange}-${activeTabId}`}
                items={items}
                selectedItemId={selectedItemId}
                onSelectItem={(item) => setFlowState(activeTabId, { selectedItemId: item.id, selectedFlowItem: item })}
                onOpenItem={(item) => { const target = resolveEntityTabTarget(item, appMode); if (target) openBrowserTab(target.id, target.kind, target.title, target.url, false, true); }}
                sourceControls={sourceControls}
                hideEmptyStages={hideEmptyStages}
              />
            )}
          </div>
        )}
        {!isLoading && !error && items.length > 0 && <section className="flow-detail-panels" aria-label="Flow operational context"><div className="flow-event-preview"><header><strong>Event Stream</strong><span>Latest cached activity</span></header>{[...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3).map(item => <button key={item.id} onClick={() => setFlowState(activeTabId, { selectedItemId: item.id, selectedFlowItem: item })}><time>{new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span>{item.title}</span><small>{item.stage}</small></button>)}</div><div><div className="flow-supporting"><div><span>Visible</span><strong>{items.length}</strong></div><div><span>Attention</span><strong>{items.filter(item => item.status === 'failing' || item.status === 'changes_requested').length}</strong></div><div><span>Reviews</span><strong>{items.filter(item => item.stage === 'review').length}</strong></div><div><span>Merged</span><strong>{items.filter(item => item.stage === 'merged').length}</strong></div><div><span>Coverage</span><strong>{items.some(item => item.completeness !== 'complete') ? 'Partial' : 'Complete'}</strong></div></div>{isRepo && selectedRepository && <div className="flow-deep-links"><span>{selectedRepository.nameWithOwner}</span><button onClick={() => { setFlowState('native:repository-simulator', { selectedRepository }); openNativeTab('native:repository-simulator', 'repositorySimulator', 'Repository Simulator', false, true); }}>Repository Simulator</button><button onClick={() => openNativeTab('native:ci-health', 'ciHealth', 'CI Health', false, true)}>CI Health</button></div>}</div></section>}
      </div>
    </div>
  );
}
