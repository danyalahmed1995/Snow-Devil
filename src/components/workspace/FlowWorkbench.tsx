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
import { canonicalAttentionItems, filterWorkflowItems, normalizeWorkflowItem, WORKFLOW_STAGES } from '../../lib/workflow-presentation';
import { resolveEntityTabTarget } from '../../lib/entity-target';
import { Select } from '../ui/Select';
import './FlowWorkbench.css';
import { useTabRefresh } from '../../hooks/useTabRefresh';
import { SavedViewsMenu } from '../saved-views/SavedViewsMenu';
import '../saved-views/SavedViewsMenu.css';
import { useAuthStore } from '../../stores/auth-store';
import { queryClient } from '../../app/providers';
import { useCurrentTabId } from './TabInstanceContext';

function flattenSourcePages(
  data: any, 
  type: 'issue' | 'pull_request' | 'release',
  options?: {
    assertRepoId?: string;
    repoNameWithOwner?: string;
    viewerLogin?: string;
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
        item = parseGitHubIssueOrPR(node, type, options?.viewerLogin);
      }

      // Runtime Assertions
      if (options?.assertRepoId) {
        if (item.repositoryId !== options.assertRepoId) {
          console.warn('[Flow] Repository scope mismatch prevented.');
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
  const session = useAuthStore(state => state.session);
  const viewerLogin = appMode === 'demo' ? 'snowdevil-demo' : session.status === 'connected' ? session.account.login : undefined;
  const { data: demoPipeline, isLoading: demoLoading, error: demoError } = useDemoPipeline();
  const activeTabId = useCurrentTabId();
  const isSurfaceActive = useTabsStore(s => s.activeTabId === activeTabId);
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
  const cursorTime = flowState.cursorTime;
  const isPlaying = flowState.isPlaying;
  const playbackSpeed = flowState.playbackSpeed;
  const search = flowState.search;
  const activeOnly = flowState.activeOnly;
  const hideEmptyStages = flowState.hideEmptyStages;
  const filterStage = flowState.filterStage;
  const statusFilter = flowState.statusFilter;
  const involvementFilter = flowState.involvementFilter;
  const actorFilter = flowState.actorFilter;
  const accountRepositoryFilter = flowState.accountRepositoryFilter;
  const sortOrder = flowState.sortOrder;

  const repoOwner = selectedRepository?.nameWithOwner.split('/')[0] || '';
  const repoName = selectedRepository?.nameWithOwner.split('/')[1] || '';
  const isRepo = scope === 'repository' && !!selectedRepository;
  const isAccount = scope === 'account';
  const liveEnabled = appMode === 'live';
  useEffect(() => {
    if (mode !== 'live') setFlowState(activeTabId, { mode: 'live', isPlaying: false });
  }, [activeTabId, mode, setFlowState]);

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
  useTabRefresh(activeTabId, useMemo(() => ({ label: 'Refresh tab', refresh: async () => {
    await Promise.all([
      repoOpenPrs.refetch(), repoOpenIssues.refetch(), repoMergedPrs.refetch(), repoReleases.refetch(),
      accAuthoredPrs.refetch(), accReviewReqPrs.refetch(), accReviewedPrs.refetch(), accAuthoredIssues.refetch(), accAssignedIssues.refetch(), accMergedPrs.refetch(),
    ]);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['flow'] }),
      queryClient.invalidateQueries({ queryKey: ['delivery-analytics'] }),
    ]);
  } }), [
    repoOpenPrs.refetch, repoOpenIssues.refetch, repoMergedPrs.refetch, repoReleases.refetch,
    accAuthoredPrs.refetch, accReviewReqPrs.refetch, accReviewedPrs.refetch, accAuthoredIssues.refetch, accAssignedIssues.refetch, accMergedPrs.refetch,
  ]));

  // Flatten and Map
  const repoOpts = useMemo(() => isRepo ? {
    assertRepoId: selectedRepository?.id,
    repoNameWithOwner: selectedRepository?.nameWithOwner,
    viewerLogin,
  } : undefined, [isRepo, selectedRepository?.id, selectedRepository?.nameWithOwner, viewerLogin]);
  
  const { items: rawRepoOpenPrs, exactTotal: repoOpenPrsTotal } = useMemo(() => flattenSourcePages(repoOpenPrs.data, 'pull_request', repoOpts), [repoOpenPrs.data, repoOpts]);
  const { items: rawRepoOpenIssues, exactTotal: repoOpenIssuesTotal } = useMemo(() => flattenSourcePages(repoOpenIssues.data, 'issue', repoOpts), [repoOpenIssues.data, repoOpts]);
  const { items: rawRepoMergedPrs, exactTotal: repoMergedPrsTotal } = useMemo(() => flattenSourcePages(repoMergedPrs.data, 'pull_request', repoOpts), [repoMergedPrs.data, repoOpts]);
  const { items: rawRepoReleases, exactTotal: repoReleasesTotal } = useMemo(() => flattenSourcePages(repoReleases.data, 'release', repoOpts), [repoReleases.data, repoOpts]);

  const accountOpts = useMemo(() => ({ viewerLogin }), [viewerLogin]);
  const { items: rawAccAuthoredPrs } = useMemo(() => flattenSourcePages(accAuthoredPrs.data, 'pull_request', accountOpts), [accAuthoredPrs.data, accountOpts]);
  const { items: rawAccReviewReqPrs } = useMemo(() => flattenSourcePages(accReviewReqPrs.data, 'pull_request', accountOpts), [accReviewReqPrs.data, accountOpts]);
  const { items: rawAccReviewedPrs } = useMemo(() => flattenSourcePages(accReviewedPrs.data, 'pull_request', accountOpts), [accReviewedPrs.data, accountOpts]);
  const { items: rawAccAuthoredIssues } = useMemo(() => flattenSourcePages(accAuthoredIssues.data, 'issue', accountOpts), [accAuthoredIssues.data, accountOpts]);
  const { items: rawAccAssignedIssues } = useMemo(() => flattenSourcePages(accAssignedIssues.data, 'issue', accountOpts), [accAssignedIssues.data, accountOpts]);
  const { items: rawAccMergedPrs, exactTotal: accMergedPrsTotal } = useMemo(() => flattenSourcePages(accMergedPrs.data, 'pull_request', accountOpts), [accMergedPrs.data, accountOpts]);

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
  const { events: replayEvents } = useReplayBuffer({
    items: baseItems,
    repositoryOwner: selectedRepository ? repoOwner : undefined,
    repositoryName: selectedRepository ? repoName : undefined,
    timeRange: timeRange === 'custom' ? '30d' : timeRange,
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
    return currentItems.map(item => normalizeWorkflowItem(item, appMode, appMode === 'demo' ? demoPipeline?.referenceDate : undefined, viewerLogin));
  }, [appMode, baselineItems, baseItems, mode, scope, replayEvents, rangeStart, cursorTime, demoPipeline?.referenceDate, viewerLogin]);

  const rangeFilteredItems = useMemo(() => {
    if (timeRange !== 'custom' || !flowState.customRangeStart || !flowState.customRangeEnd) return classifiedItems;
    const start = new Date(`${flowState.customRangeStart}T00:00:00`).getTime();
    const end = new Date(`${flowState.customRangeEnd}T23:59:59.999`).getTime();
    return classifiedItems.filter(item => { const updated = new Date(item.updatedAt).getTime(); return updated >= start && updated <= end; });
  }, [classifiedItems, flowState.customRangeEnd, flowState.customRangeStart, timeRange]);
  const repositoryOptions = useMemo(() => Array.from(new Map(classifiedItems.map(item => [item.repositoryId, item.repositoryName])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [classifiedItems]);
  const items = useMemo(() => {
    const scoped = rangeFilteredItems.filter(item => {
      if (scope === 'repository' && !selectedRepository) return false;
      if (isAccount && accountRepositoryFilter !== 'all' && item.repositoryId !== accountRepositoryFilter) return false;
      const reason = item.inclusionReason?.toLowerCase() ?? '';
      if (involvementFilter === 'authored' && !reason.includes('authored')) return false;
      if (involvementFilter === 'assigned' && !reason.includes('assigned')) return false;
      if (involvementFilter === 'review_requested' && !reason.includes('review requested')) return false;
      if (involvementFilter === 'mentioned' && !reason.includes('mention')) return false;
      if (involvementFilter === 'participating' && !reason.includes('reviewed') && !reason.includes('participat')) return false;
      if (actorFilter === 'humans' && item.actorClassification !== 'human' && item.actorClassification !== 'unknown') return false;
      if (actorFilter === 'bots' && !['dependabot', 'renovate', 'other_bot'].includes(item.actorClassification ?? 'unknown')) return false;
      if (actorFilter === 'dependabot' && item.actorClassification !== 'dependabot') return false;
      if (actorFilter === 'renovate' && item.actorClassification !== 'renovate') return false;
      return true;
    });
    const filtered = filterWorkflowItems(scoped, { search, activeOnly, stage: filterStage, statusFilter, repositoryId: isRepo ? selectedRepository?.id : undefined });
    return [...filtered].sort((a, b) => sortOrder === 'oldest' ? a.updatedAt.localeCompare(b.updatedAt)
      : sortOrder === 'repository' ? a.repositoryName.localeCompare(b.repositoryName) || b.updatedAt.localeCompare(a.updatedAt)
      : sortOrder === 'attention' ? Number(Boolean(b.attentionReasons?.length)) - Number(Boolean(a.attentionReasons?.length)) || b.updatedAt.localeCompare(a.updatedAt)
      : b.updatedAt.localeCompare(a.updatedAt));
  }, [accountRepositoryFilter, activeOnly, actorFilter, filterStage, involvementFilter, isAccount, isRepo, rangeFilteredItems, scope, search, selectedRepository, sortOrder, statusFilter]);

  // Clear selected item when scope or dataset changes — but not during a pending focus navigation
  useEffect(() => {
    const pending = useFlowStore.getState().getTabState(activeTabId).pendingScrollItemId;
    if (pending) return; // A focus-navigation request owns the selection right now
    setFlowState(activeTabId, { selectedItemId: undefined, selectedFlowItem: undefined });
  }, [scope, selectedRepository?.id, activeTabId, setFlowState]);
  useEffect(() => {
    if (selectedItemId && !items.some(item => item.id === selectedItemId)) setFlowState(activeTabId, { selectedItemId: undefined, selectedFlowItem: undefined });
  }, [activeTabId, items, selectedItemId, setFlowState]);

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

  const liveFetching = isRepo
    ? repoOpenPrs.isFetching || repoOpenIssues.isFetching || repoMergedPrs.isFetching || repoReleases.isFetching
    : accAuthoredPrs.isFetching || accReviewReqPrs.isFetching || accReviewedPrs.isFetching || accAuthoredIssues.isFetching || accAssignedIssues.isFetching || accMergedPrs.isFetching;

  const liveError = isRepo
    ? repoOpenPrs.error || repoOpenIssues.error || repoMergedPrs.error || repoReleases.error
    : accAuthoredPrs.error || accReviewReqPrs.error || accReviewedPrs.error || accAuthoredIssues.error || accAssignedIssues.error || accMergedPrs.error;

  const isLoading = appMode === 'demo' ? demoLoading : liveLoading;
  const isRefreshing = appMode === 'live' && liveFetching && !liveLoading && baseItems.length > 0;
  const error = appMode === 'demo' ? demoError : liveError;

  return (
    <div className="flow-workbench" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      <div className="flow-header" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {flowState.sourceContext && <button type="button" className="flow-context-chip" data-tooltip="Remove Home context\nClear the Home-originated filter context." onClick={() => setFlowState(activeTabId, { sourceContext: undefined })}>{flowState.sourceContext}<span aria-hidden="true">×</span></button>}
        <label className="flow-field">Scope<Select ariaLabel="Flow scope" value={scope} onChange={value => setFlowState(activeTabId, { scope: value as 'account' | 'repository', filterStage: undefined })} options={[{ value: 'account', label: 'Account Flow' }, { value: 'repository', label: 'Repository Flow' }]} /></label>

        {scope === 'repository' && (
          <RepositorySelector 
            selectedRepo={selectedRepository}
            onSelect={(repo) => setFlowState(activeTabId, { selectedRepository: repo })}
          />
        )}
        {scope === 'account' && <label className="flow-field">Repositories<Select ariaLabel="Account Flow repository" searchable value={accountRepositoryFilter} onChange={value => setFlowState(activeTabId, { accountRepositoryFilter: value })} options={[{ value: 'all', label: 'All repositories' }, ...repositoryOptions.map(([id, label]) => ({ value: id, label }))]} /></label>}
        <label className="flow-field">Range<Select ariaLabel="Flow time range" value={timeRange} onChange={value => setFlowState(activeTabId, { timeRange: value as typeof timeRange })} options={[{ value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'custom', label: 'Custom range' }]} /></label>
        {timeRange === 'custom' && <><label className="flow-field">Start<input aria-label="Flow range start" type="date" max={flowState.customRangeEnd} value={flowState.customRangeStart ?? ''} onChange={event => setFlowState(activeTabId, { customRangeStart: event.target.value })} /></label><label className="flow-field">End<input aria-label="Flow range end" type="date" min={flowState.customRangeStart} value={flowState.customRangeEnd ?? ''} onChange={event => setFlowState(activeTabId, { customRangeEnd: event.target.value })} /></label></>}
        <label className="flow-toggle"><input aria-label="Active items only" type="checkbox" checked={activeOnly} onChange={event => setFlowState(activeTabId, { activeOnly: event.target.checked })} /> Active only</label>
        <label className="flow-toggle"><input aria-label="Hide empty stages" type="checkbox" checked={hideEmptyStages} onChange={event => setFlowState(activeTabId, { hideEmptyStages: event.target.checked })} /> Hide empty</label>
        <label className="flow-field flow-search">Search<input aria-label="Search Flow" value={search} onChange={event => setFlowState(activeTabId, { search: event.target.value })} placeholder={'repo:, author:, label:, title:"…", checks:, review:, stage:, #37'} /></label>
        <label className="flow-field">Stage<Select ariaLabel="Flow stage filter" value={filterStage ?? ''} onChange={value => setFlowState(activeTabId, { filterStage: (value || undefined) as FlowItem['stage'] | undefined })} options={[{ value: '', label: 'All stages' }, ...WORKFLOW_STAGES.map(stage => ({ value: stage.id, label: stage.label }))]} /></label>
        <label className="flow-field">View<Select ariaLabel="Flow view" value={statusFilter} onChange={value => setFlowState(activeTabId, { statusFilter: value as typeof statusFilter })} options={[{ value: 'all', label: 'All work' }, { value: 'attention', label: 'Needs attention' }, { value: 'waiting_review', label: scope === 'account' ? 'Reviews requested from me' : 'Review requested' }, { value: 'failing', label: 'Failing checks' }, { value: 'merged', label: 'Recently merged' }]} /></label>
        {scope === 'account' && <label className="flow-field">Involvement<Select ariaLabel="Flow involvement" value={involvementFilter} onChange={value => setFlowState(activeTabId, { involvementFilter: value as typeof involvementFilter })} options={[{ value: 'all', label: 'All activity' }, { value: 'assigned', label: 'Assigned to me' }, { value: 'authored', label: 'Authored by me' }, { value: 'review_requested', label: 'Review requested from me' }, { value: 'mentioned', label: 'Mentioned' }, { value: 'participating', label: 'Participating' }]} /></label>}
        <label className="flow-field">Actor<Select ariaLabel="Flow actor" value={actorFilter} onChange={value => setFlowState(activeTabId, { actorFilter: value as typeof actorFilter })} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'humans', label: 'Humans only' }, { value: 'bots', label: 'Bots only' }, { value: 'dependabot', label: 'Dependabot' }, { value: 'renovate', label: 'Renovate' }]} /></label>
        {filterStage && <label className="flow-field">Sort<Select ariaLabel="Focused stage sort" value={sortOrder} onChange={value => setFlowState(activeTabId, { sortOrder: value as typeof sortOrder })} options={[{ value: 'newest', label: 'Newest activity' }, { value: 'oldest', label: 'Oldest activity' }, { value: 'repository', label: 'Repository' }, { value: 'attention', label: 'Attention first' }]} /></label>}
        <SavedViewsMenu current={flowState}/><span className="flow-freshness" data-tooltip="Synchronized snapshot\nFlow shows the latest completed cached query result.">Synced snapshot · {items.length} results</span>
      </div>
      
      <div className="flow-content" style={{ flex: 1, overflow: 'hidden', minWidth: 0, minHeight: 0, padding: '16px', display: 'flex', flexDirection: 'column' }}>
        {scope === 'repository' && !selectedRepository ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <h2>Select a Repository</h2>
            <p>Use the dropdown above to select a repository and view its flow.</p>
          </div>
        ) : isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Loading {scope} flow...
          </div>
        ) : error && items.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
            Error loading flow: {(error as Error).message}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {items.length === 0 ? <div className="flow-empty-scope"><strong>No {filterStage ? filterStage.replace(/_/g, ' ') : 'work'} items matched your current repository, range, and involvement filters.</strong><span>Current scope: {scope} · {timeRange} · {statusFilter.replace(/_/g, ' ')}</span><div><button onClick={() => setFlowState(activeTabId, { search: '', statusFilter: 'all', involvementFilter: 'all', actorFilter: 'everyone', accountRepositoryFilter: 'all' })}>Clear filters</button><button onClick={() => setFlowState(activeTabId, { filterStage: undefined, sourceContext: undefined })}>Return to all stages</button><button onClick={() => void (isRepo ? Promise.all([repoOpenPrs.refetch(), repoOpenIssues.refetch()]) : Promise.all([accAuthoredPrs.refetch(), accReviewReqPrs.refetch(), accAssignedIssues.refetch()]))}>Refresh</button></div></div> : (
              <FlowPipeline
                key={`${scope}-${selectedRepository?.id || 'none'}-${mode}`}
                resetKey={`${appMode}-${scope}-${selectedRepository?.id || 'none'}-${mode}-${timeRange}-${activeTabId}`}
                items={items}
                selectedItemId={selectedItemId}
                onSelectItem={(item) => setFlowState(activeTabId, { selectedItemId: item.id, selectedFlowItem: item })}
                onOpenItem={(item) => { const target = resolveEntityTabTarget(item, appMode); if (target) openBrowserTab(target.id, target.kind, target.title, target.url, false, true); }}
                sourceControls={sourceControls}
                hideEmptyStages={hideEmptyStages}
                focusedStage={filterStage}
                pendingScrollItemId={flowState.pendingScrollItemId}
                onConsumeScroll={() => setFlowState(activeTabId, { pendingScrollItemId: undefined })}
                isSurfaceActive={isSurfaceActive}
              />
            )}
          </div>
        )}
        {isRefreshing && <div className="flow-refreshing" role="status">Refreshing GitHub data · Displaying previous snapshot</div>}
        {!isLoading && items.length > 0 && <section className="flow-detail-panels" aria-label="Flow operational context"><div className="flow-event-preview"><header><strong>Event Stream</strong><span>Latest cached activity</span></header>{[...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3).map(item => <button key={item.id} onClick={() => setFlowState(activeTabId, { selectedItemId: item.id, selectedFlowItem: item })}><time>{new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span>{item.title}</span><small>{item.stage}</small></button>)}</div><div><div className="flow-supporting"><div><span>Visible</span><strong>{items.length}</strong></div><div><span>Attention</span><strong>{canonicalAttentionItems(items).length}</strong></div><div><span>Reviews</span><strong>{items.filter(item => item.stage === 'review').length}</strong></div><div><span>Merged</span><strong>{items.filter(item => item.stage === 'merged').length}</strong></div><div><span>Coverage</span><strong>{items.some(item => item.completeness !== 'complete') || error ? 'Partial' : 'Complete'}</strong></div></div>{isRepo && selectedRepository && <div className="flow-deep-links"><span>{selectedRepository.nameWithOwner}</span><button onClick={() => { setFlowState('native:repository-simulator', { selectedRepository }); openNativeTab('native:repository-simulator', 'repositorySimulator', 'Repository History', false, true); }}>Repository History</button><button onClick={() => openNativeTab('native:ci-health', 'ciHealth', 'CI Health', false, true)}>CI Health</button></div>}</div></section>}
      </div>
    </div>
  );
}
