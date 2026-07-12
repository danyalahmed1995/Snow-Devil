import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Filter, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useAccountSimulator } from '../../hooks/useAccountSimulator';
import { useRepositorySimulator } from '../../hooks/useRepositorySimulator';
import { useSimulatorPlayback } from '../../hooks/useSimulatorPlayback';
import { useAuthStore } from '../../stores/auth-store';
import { useModeStore } from '../../stores/mode-store';
import { useDemoManifest } from '../../hooks/useDemoData';
import { useFlowStore } from '../../stores/flow-store';
import { RepositorySelector } from '../workspace/RepositorySelector';
import { SimulatorTimeline } from './ui/SimulatorTimeline';
import { SimulatorEventStream } from './ui/SimulatorEventStream';
import { SimulatorEntityList } from './ui/SimulatorEntityList';
import { Select } from '../ui/Select';
import { classifyActor } from '../../lib/delivery-semantics';
import { safeSimulatorExplanation, safeSimulatorTitle } from '../../simulator/simulator-errors';
import { useTabRefresh } from '../../hooks/useTabRefresh';
import { buildHistoricalSnapshot, nextMeaningfulDate, previousMeaningfulDate } from '../../simulator/history-snapshot';
import type { SimulatorEntityState } from '../../simulator/simulator-types';
import './SimulatorWorkbench.css';
import './HistoryWorkbench.css';
import { useCurrentTabId } from '../workspace/TabInstanceContext';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { defaultHistoryView, useHistoryViewStore } from '../../stores/history-view-store';
import { addCalendarDays, calendarDateInTimeZone, cutoffForCalendarDate, endOfCalendarDate, formatHistoryCutoff, startOfCalendarDate, todayCalendarDate } from '../../lib/history-date';
import { summarizeHistoryStatus } from '../../simulator/history-status';
import { loadingMotionClass } from '../../lib/data-state';
import { entityMatchesHistorySearch, historyFilterConflicts, resolveHistoryNavigationTarget } from '../../simulator/history-navigation';
import { formatEntityTitle } from '../../simulator/simulator-presentation';
import { useCIWatcherStore } from '../../stores/ci-watcher-store';
import type { CIWorkflowRun } from '../../ci/ci-watcher';
import { useTabsStore } from '../../stores/tabs-store';
import { centeredHistoryScrollTop } from '../../simulator/history-reveal';

type HistoryMode = 'account' | 'repository';
type PendingHistoryReveal = { key: string; entity: SimulatorEntityState; generation: number; canvasScrollTop: number };

function setRange(setSince: (value: string) => void, setUntil: (value: string) => void, days: number, timeZone: string) {
  const now = new Date();
  const today = todayCalendarDate(timeZone, now);
  setSince(startOfCalendarDate(addCalendarDays(today, -days), timeZone));
  setUntil(now.toISOString());
}

function HistoryMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="history-metric" data-tooltip={`${label}\n${detail}`}><span>{label}</span><strong>{value.toLocaleString()}</strong><small>{detail}</small></div>;
}

function isCompleted(entity: SimulatorEntityState): boolean {
  return ['closed', 'merged', 'released', 'deployed'].includes(entity.stage);
}

function ciRunEntity(run: CIWorkflowRun): SimulatorEntityState {
  return { id: run.id, repositoryId: run.repositoryId, subjectType: 'workflow_run', title: `${run.workflowName} #${run.runNumber}`, number: run.runId, url: run.url,
    stage: 'checks', status: run.status === 'completed' ? run.conclusion ?? 'completed' : run.status === 'in_progress' ? 'running' : run.status,
    assignees: [], reviewers: [], labels: [], commitCount: 0, commentCount: 0, reviewCommentCount: 0, reviewState: 'none',
    checkState: run.status !== 'completed' ? run.status === 'queued' || run.status === 'pending' ? 'queued' : 'running' : run.conclusion === 'success' ? 'success' : run.conclusion === 'cancelled' ? 'cancelled' : 'failure',
    createdAt: run.createdAt, updatedAt: run.updatedAt, sourceCompleteness: 'complete' };
}

function HistoryLoadingState({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className={`simulator-loading-state ${loadingMotionClass(reducedMotion)}`} style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '24px' }} role="status" aria-live="polite">
      <div className="global-spinner" />
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: 'var(--text-primary)', animation: 'fresh-fade-in 0.5s ease-out' }}>Loading historical evidence…</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginTop: '12px', animation: 'fresh-fade-in 0.7s ease-out backwards' }}>Building a consistent selected-date snapshot.</p>
      </div>
    </div>
  );
}

export function SimulatorWorkbench({ mode }: { mode: HistoryMode }) {
  const { session } = useAuthStore();
  const appMode = useModeStore(state => state.mode);
  const { data: demoManifest } = useDemoManifest();
  const activeTabId = useCurrentTabId();
  const isActiveTab = useTabsStore(state => state.activeTabId === activeTabId);
  const timeZone = useAnalyticsSettingsStore(state => state.settings.businessTimezone || 'Asia/Karachi');
  const reducedMotion = useAnalyticsSettingsStore(state => state.settings.reducedMotion);
  const savedView = useHistoryViewStore(state => state.states[activeTabId]);
  const patchView = useHistoryViewStore(state => state.patch);
  const view = savedView ?? defaultHistoryView(mode);
  const updateView = useCallback((value: Parameters<typeof patchView>[2]) => patchView(activeTabId, mode, value), [activeTabId, mode, patchView]);
  const requestedRepository = useFlowStore(state => state.getTabState(activeTabId).selectedRepository);
  const requestedEntityId = useFlowStore(state => state.getTabState(activeTabId).selectedItemId);
  const setTabState = useFlowStore(state => state.setTabState);
  const login = appMode === 'demo' ? demoManifest?.identity.login || 'snowdevil-demo' : session.status === 'connected' ? session.account.login : 'unknown';
  const defaultDemoRepo = appMode === 'demo' && mode === 'repository' && demoManifest?.repositories[0]
    ? { id: demoManifest.repositories[0].id, nameWithOwner: demoManifest.repositories[0].nameWithOwner }
    : null;
  const selectedRepoState = view.selectedRepository ?? requestedRepository ?? null;
  const setSelectedRepo = useCallback((repository: { id: string; nameWithOwner: string } | null) => updateView({ selectedRepository: repository ?? undefined, selectedEntityId: undefined, selectedEventId: undefined, selectedCalendarDate: undefined }), [updateView]);
  const selectedRepo = selectedRepoState || defaultDemoRepo;
  const selectedEntityId = view.selectedEntityId;
  const selectedEventId = view.selectedEventId;
  const showFilters = view.showFilters;
  const showCoverage = view.showSourceDetails;
  const showAnimation = view.showAnimation;
  const customRange = view.customRange;
  const filters = view.filters;
  const sourceDisclosureRef = useRef<HTMLButtonElement>(null);
  const sourcePanelRef = useRef<HTMLDivElement>(null);
  const historyCanvasRef = useRef<HTMLDivElement>(null);
  const activeListRef = useRef<HTMLDivElement>(null);
  const ciListRef = useRef<HTMLDivElement>(null);
  const completedListRef = useRef<HTMLDivElement>(null);
  const [activeSearch, setActiveSearch] = useState('');
  const [completedSearch, setCompletedSearch] = useState('');
  const [pendingReveal, setPendingReveal] = useState<PendingHistoryReveal>();
  const [flashEntityId, setFlashEntityId] = useState<string>();
  const [revealAnnouncement, setRevealAnnouncement] = useState('');
  const [revealConflict, setRevealConflict] = useState<{ entity: SimulatorEntityState; eventId: string; filterKeys: Array<keyof typeof filters>; search: boolean }>();
  const flashTimerRef = useRef<number | undefined>(undefined);
  const revealTimeoutRef = useRef<number | undefined>(undefined);
  const revealObserverRef = useRef<MutationObserver | undefined>(undefined);
  const canvasResizeObserverRef = useRef<ResizeObserver | undefined>(undefined);
  const canvasRestoreTimerRef = useRef<number | undefined>(undefined);
  const revealScrollAnimationRef = useRef<{ container: HTMLDivElement; frame: number | undefined; generation: number; stop: () => void } | undefined>(undefined);
  const revealGenerationRef = useRef(0);
  const historyRowsRef = useRef(new Map<string, HTMLButtonElement>());
  const ciRunsByRepository = useCIWatcherStore(state => state.runsByRepository);

  const [repoOwner = '', repoName = ''] = selectedRepo?.nameWithOwner.split('/') ?? [];
  const accountHistory = useAccountSimulator(login, timeZone);
  const repositoryHistory = useRepositorySimulator(repoOwner, repoName, timeZone);
  const activeHistory = mode === 'account' ? accountHistory : repositoryHistory;
  const { events, loadState, details, since, until, setSince, setUntil, refresh } = activeHistory;
  useTabRefresh(activeTabId, useMemo(() => ({ label: 'Refresh history', refresh }), [refresh]));
  const persistCursor = useCallback((cursor: string) => updateView({ selectedCalendarDate: calendarDateInTimeZone(cursor, timeZone) }), [timeZone, updateView]);
  const initialCursor = view.selectedCalendarDate ? cutoffForCalendarDate(view.selectedCalendarDate, until, timeZone) : until;
  const playback = useSimulatorPlayback(events, since, until, { timeZone, reducedMotion, initialCursor, onCursorChange: persistCursor });
  const snapshot = useMemo(() => buildHistoricalSnapshot(events, playback.cursor, until), [events, playback.cursor, until]);
  const latestSnapshot = useMemo(() => buildHistoricalSnapshot(events, until, until), [events, until]);
  const latestById = useMemo(() => new Map(latestSnapshot.entities.map(entity => [entity.id, entity])), [latestSnapshot.entities]);

  const filteredEntities = useMemo(() => snapshot.entities.filter(entity => {
    if (mode === 'account' && filters.repository !== 'all' && entity.repositoryId !== filters.repository) return false;
    if (filters.entityType !== 'all' && entity.subjectType !== filters.entityType) return false;
    if (filters.confidence !== 'all' && entity.sourceCompleteness !== filters.confidence) return false;
    const actorType = classifyActor(entity.author?.login);
    const bot = ['dependabot', 'renovate', 'other_bot'].includes(actorType);
    if (!filters.includeBots && bot || filters.actor === 'humans' && bot || filters.actor === 'bots' && !bot) return false;
    if (mode === 'account' && filters.involvement !== 'all' && !entity.inclusionReason?.includes(filters.involvement)) return false;
    return true;
  }), [filters, mode, snapshot.entities]);
  const activeEntities = filteredEntities.filter(entity => entity.subjectType !== 'workflow_run' && !isCompleted(entity));
  const completedEntities = filteredEntities.filter(entity => entity.subjectType !== 'workflow_run' && isCompleted(entity));
  const evidenceRepositories = useMemo(() => new Set(snapshot.events.map(event => event.repositoryId.toLowerCase())), [snapshot.events]);
  const ciEntities = useMemo(() => {
    const historical = filteredEntities.filter(entity => entity.subjectType === 'workflow_run');
    const live = Object.values(ciRunsByRepository).flat().filter(run => run.updatedAt <= snapshot.selectedDate
      && (mode === 'repository' ? run.repositoryId.toLowerCase() === selectedRepo?.nameWithOwner.toLowerCase() : evidenceRepositories.has(run.repositoryId.toLowerCase()))
      && (mode !== 'account' || filters.repository === 'all' || run.repositoryId.toLowerCase() === filters.repository.toLowerCase())).map(ciRunEntity);
    return [...new Map([...historical, ...live].map(entity => [entity.id, entity])).values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [ciRunsByRepository, evidenceRepositories, filteredEntities, filters.repository, mode, selectedRepo?.nameWithOwner, snapshot.selectedDate]);
  const visibleIds = useMemo(() => new Set(filteredEntities.map(entity => entity.id)), [filteredEntities]);
  const selectableEntities = useMemo(() => [...snapshot.entities, ...ciEntities], [ciEntities, snapshot.entities]);
  const selectableIds = useMemo(() => new Set([...visibleIds, ...ciEntities.map(entity => entity.id)]), [ciEntities, visibleIds]);
  const visibleEvents = snapshot.events;
  const repositoryOptions = useMemo(() => [...new Set(events.map(event => event.repositoryId))].sort(), [events]);
  const historyStatus = summarizeHistoryStatus(loadState, details);
  const incompleteSourceCount = historyStatus.partial + historyStatus.failed + historyStatus.unsupported + historyStatus.skipped;
  const partial = details.stale || loadState === 'ready_partial' || historyStatus.sourceCompleteness !== 'all_loaded' || snapshot.confidence === 'partial';
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key === 'includeBots' ? value !== (mode === 'repository') : !['all', mode === 'repository' ? 'everyone' : 'humans'].includes(String(value))).length;

  useEffect(() => {
    if (mode === 'repository' && requestedRepository && requestedRepository.id !== selectedRepoState?.id) setSelectedRepo(requestedRepository);
  }, [mode, requestedRepository, selectedRepoState?.id, setSelectedRepo]);

  useEffect(() => {
    if (requestedEntityId && requestedEntityId !== selectedEntityId) {
      updateView({ selectedEntityId: requestedEntityId });
      setTabState(activeTabId, { selectedItemId: undefined });
    }
  }, [activeTabId, requestedEntityId, selectedEntityId, setTabState, updateView]);

  useEffect(() => {
    if (!showCoverage) return;
    requestAnimationFrame(() => { if (sourcePanelRef.current) sourcePanelRef.current.scrollTop = view.sourceScrollTop; });
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !sourcePanelRef.current?.contains(document.activeElement)) return;
      updateView({ showSourceDetails: false });
      requestAnimationFrame(() => sourceDisclosureRef.current?.focus());
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [showCoverage, updateView, view.sourceScrollTop]);

  useEffect(() => {
    if (selectedEventId) {
      const selected = snapshot.events.find(event => event.id === selectedEventId);
      const entity = selected ? selectableEntities.find(value => value.id === selected.subjectId) : undefined;
      setTabState(activeTabId, selected ? { selectedSimulatorEvent: selected, selectedSimulatorEntity: entity, selectedSimulatorCurrentEntity: latestById.get(selected.subjectId) } : { selectedSimulatorEvent: undefined, selectedSimulatorEntity: undefined });
      return;
    }
    if (selectedEntityId) {
      const selected = selectableEntities.find(entity => entity.id === selectedEntityId);
      setTabState(activeTabId, selected ? { selectedSimulatorEntity: selected, selectedSimulatorCurrentEntity: latestById.get(selected.id), selectedSimulatorEvent: undefined } : { selectedSimulatorEntity: undefined, selectedSimulatorEvent: undefined });
      return;
    }
    setTabState(activeTabId, { selectedSimulatorEntity: undefined, selectedSimulatorEvent: undefined });
  }, [activeTabId, latestById, selectableEntities, selectedEntityId, selectedEventId, setTabState, snapshot.events]);

  useEffect(() => {
    if (selectedEntityId && !selectedEventId && !selectableIds.has(selectedEntityId)) {
      updateView({ selectedEntityId: undefined, selectedEventId: undefined });
    }
  }, [selectableIds, selectedEntityId, selectedEventId, updateView]);

  useEffect(() => () => {
    if (flashTimerRef.current !== undefined) window.clearTimeout(flashTimerRef.current);
    if (revealTimeoutRef.current !== undefined) window.clearTimeout(revealTimeoutRef.current);
    revealObserverRef.current?.disconnect();
    canvasResizeObserverRef.current?.disconnect();
    if (canvasRestoreTimerRef.current !== undefined) window.clearTimeout(canvasRestoreTimerRef.current);
    revealScrollAnimationRef.current?.stop();
    revealScrollAnimationRef.current = undefined;
    revealGenerationRef.current += 1;
    historyRowsRef.current.clear();
  }, []);

  const cancelRevealScrollAnimation = useCallback(() => {
    const animation = revealScrollAnimationRef.current;
    if (!animation) return;
    animation.stop();
    if (revealScrollAnimationRef.current === animation) revealScrollAnimationRef.current = undefined;
  }, []);

  const cancelPendingReveal = useCallback((clearFlash = true) => {
    revealGenerationRef.current += 1;
    cancelRevealScrollAnimation();
    revealObserverRef.current?.disconnect();
    revealObserverRef.current = undefined;
    if (revealTimeoutRef.current !== undefined) window.clearTimeout(revealTimeoutRef.current);
    revealTimeoutRef.current = undefined;
    canvasResizeObserverRef.current?.disconnect();
    canvasResizeObserverRef.current = undefined;
    if (canvasRestoreTimerRef.current !== undefined) window.clearTimeout(canvasRestoreTimerRef.current);
    canvasRestoreTimerRef.current = undefined;
    setPendingReveal(undefined);
    if (clearFlash) setFlashEntityId(undefined);
  }, [cancelRevealScrollAnimation]);

  useEffect(() => {
    cancelPendingReveal();
    setRevealConflict(undefined);
    if (flashTimerRef.current !== undefined) window.clearTimeout(flashTimerRef.current);
  }, [activeTabId, cancelPendingReveal, isActiveTab, mode, selectedRepo?.id, snapshot.selectedDate]);

  const registerHistoryRow = useCallback((key: string, node: HTMLButtonElement | null) => {
    if (node) historyRowsRef.current.set(key, node);
    else historyRowsRef.current.delete(key);
  }, []);

  const beginReveal = useCallback((entity: SimulatorEntityState) => {
    cancelPendingReveal();
    const generation = revealGenerationRef.current;
    setPendingReveal({ key: entity.id, entity, generation, canvasScrollTop: historyCanvasRef.current?.scrollTop ?? 0 });
  }, [cancelPendingReveal]);

  const revealEntity = useCallback((pending: PendingHistoryReveal): boolean => {
    if (pending.generation !== revealGenerationRef.current || !isActiveTab) return false;
    const entity = pending.entity;
    const container = entity.subjectType === 'workflow_run' ? ciListRef.current : isCompleted(entity) ? completedListRef.current : activeListRef.current;
    if (!container) return false;
    const row = historyRowsRef.current.get(pending.key);
    if (!row || !row.isConnected || !container.contains(row) || row.dataset.historyTargetKey !== pending.key) return false;
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const top = Math.round(centeredHistoryScrollTop({ scrollTop: container.scrollTop, containerTop: containerRect.top, containerHeight: container.clientHeight, rowTop: rowRect.top, rowHeight: rowRect.height }));
    cancelRevealScrollAnimation();
    if (reducedMotion || Math.abs(container.scrollTop - top) < 1) {
      container.scrollTo({ top, behavior: 'auto' });
    } else {
      const startTop = container.scrollTop;
      const distance = top - startTop;
      const startedAt = performance.now();
      const duration = Math.min(280, Math.max(140, Math.abs(distance) * 0.35));
      let stopped = false;
      const stopForUserInput = () => cancelRevealScrollAnimation();
      const stop = () => {
        if (stopped) return;
        stopped = true;
        if (animation.frame !== undefined) window.cancelAnimationFrame(animation.frame);
        container.removeEventListener('wheel', stopForUserInput);
        container.removeEventListener('pointerdown', stopForUserInput);
        container.removeEventListener('touchstart', stopForUserInput);
        container.removeEventListener('keydown', stopForUserInput);
      };
      const animation = { container, frame: undefined as number | undefined, generation: pending.generation, stop };
      const step = (now: number) => {
        if (stopped || pending.generation !== revealGenerationRef.current || revealScrollAnimationRef.current !== animation) return;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        container.scrollTop = Math.round(startTop + distance * eased);
        if (progress < 1) animation.frame = window.requestAnimationFrame(step);
        else {
          stop();
          if (revealScrollAnimationRef.current === animation) revealScrollAnimationRef.current = undefined;
        }
      };
      container.addEventListener('wheel', stopForUserInput, { passive: true });
      container.addEventListener('pointerdown', stopForUserInput);
      container.addEventListener('touchstart', stopForUserInput, { passive: true });
      container.addEventListener('keydown', stopForUserInput);
      revealScrollAnimationRef.current = animation;
      animation.frame = window.requestAnimationFrame(step);
    }
    row.focus({ preventScroll: true });
    if (historyCanvasRef.current) {
      const canvas = historyCanvasRef.current;
      const restoreCanvas = () => { canvas.scrollTop = pending.canvasScrollTop; };
      canvasResizeObserverRef.current?.disconnect();
      const resizeObserver = new ResizeObserver(restoreCanvas);
      canvasResizeObserverRef.current = resizeObserver;
      resizeObserver.observe(canvas);
      restoreCanvas();
      if (canvasRestoreTimerRef.current !== undefined) window.clearTimeout(canvasRestoreTimerRef.current);
      canvasRestoreTimerRef.current = window.setTimeout(() => {
        resizeObserver.disconnect();
        if (canvasResizeObserverRef.current === resizeObserver) canvasResizeObserverRef.current = undefined;
        canvasRestoreTimerRef.current = undefined;
      }, 500);
    }
    setFlashEntityId(entity.id);
    setRevealAnnouncement(`${formatEntityTitle(entity)} revealed in ${entity.subjectType === 'workflow_run' ? 'CI activity by selected date' : isCompleted(entity) ? 'Completed by selected date' : 'Active on selected date'}.`);
    if (flashTimerRef.current !== undefined) window.clearTimeout(flashTimerRef.current);
    const generation = pending.generation;
    flashTimerRef.current = window.setTimeout(() => {
      if (generation === revealGenerationRef.current) setFlashEntityId(current => current === entity.id ? undefined : current);
    }, reducedMotion ? 700 : 1600);
    setPendingReveal(undefined);
    return true;
  }, [cancelRevealScrollAnimation, isActiveTab, reducedMotion]);

  useEffect(() => {
    if (!pendingReveal || pendingReveal.generation !== revealGenerationRef.current || !isActiveTab) return;
    const entity = pendingReveal.entity;
    const container = entity.subjectType === 'workflow_run' ? ciListRef.current : isCompleted(entity) ? completedListRef.current : activeListRef.current;
    if (!container) return;
    const attemptReveal = () => {
      if (pendingReveal.generation !== revealGenerationRef.current) return;
      if (revealEntity(pendingReveal)) {
        revealObserverRef.current?.disconnect();
        revealObserverRef.current = undefined;
        if (revealTimeoutRef.current !== undefined) window.clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = undefined;
      }
    };
    const observer = new MutationObserver(attemptReveal);
    revealObserverRef.current = observer;
    observer.observe(container, { childList: true, subtree: true });
    revealTimeoutRef.current = window.setTimeout(() => {
      if (pendingReveal.generation !== revealGenerationRef.current) return;
      observer.disconnect();
      revealObserverRef.current = undefined;
      revealTimeoutRef.current = undefined;
      setPendingReveal(undefined);
      setRevealAnnouncement(`${formatEntityTitle(entity)} is selected, but its historical row could not be mounted in the ${entity.subjectType === 'workflow_run' ? 'CI' : isCompleted(entity) ? 'Completed' : 'Active'} list.`);
    }, 2000);
    attemptReveal();
    return () => {
      observer.disconnect();
      if (revealObserverRef.current === observer) revealObserverRef.current = undefined;
      if (revealTimeoutRef.current !== undefined) window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = undefined;
    };
  }, [activeSearch, completedSearch, isActiveTab, pendingReveal, revealEntity]);

  const selectHistoryEvent = useCallback((eventId: string) => {
    cancelPendingReveal();
    const target = resolveHistoryNavigationTarget(eventId, snapshot.events, [...snapshot.entities, ...ciEntities]);
    if (!target) return;
    updateView({ selectedEntityId: target.entity?.id, selectedEventId: eventId });
    if (!target.entity) {
      setRevealConflict(undefined);
      setRevealAnnouncement('Event selected. No canonical entity snapshot is available at this cutoff.');
      return;
    }
    const filterKeys = historyFilterConflicts(target.entity, filters, mode);
    const search = target.section === 'ci' ? false : !entityMatchesHistorySearch(target.entity, target.section === 'completed' ? completedSearch : activeSearch);
    if (filterKeys.length || search) {
      setRevealConflict({ entity: target.entity, eventId, filterKeys: filterKeys as Array<keyof typeof filters>, search });
      setRevealAnnouncement('The related item is hidden by the current filters.');
      return;
    }
    setRevealConflict(undefined);
    beginReveal(target.entity);
  }, [activeSearch, beginReveal, cancelPendingReveal, ciEntities, completedSearch, filters, mode, snapshot.entities, snapshot.events, updateView]);

  const revealHiddenEntity = useCallback(() => {
    if (!revealConflict) return;
    const defaults = defaultHistoryView(mode).filters;
    const next = { ...filters };
    for (const key of revealConflict.filterKeys) {
      if (key === 'actor') {
        next.actor = defaults.actor;
        next.includeBots = defaults.includeBots;
      } else if (key === 'includeBots') next.includeBots = defaults.includeBots;
      else next[key] = defaults[key] as never;
    }
    if (revealConflict.search) {
      if (isCompleted(revealConflict.entity)) setCompletedSearch('');
      else setActiveSearch('');
    }
    updateView({ filters: next, selectedEntityId: revealConflict.entity.id, selectedEventId: revealConflict.eventId });
    setRevealAnnouncement(`Cleared ${[...revealConflict.filterKeys.map(key => key.replace(/([A-Z])/g, ' $1').toLowerCase()), ...(revealConflict.search ? ['list search'] : [])].join(' and ')} to reveal ${formatEntityTitle(revealConflict.entity)}.`);
    beginReveal(revealConflict.entity);
    setRevealConflict(undefined);
  }, [beginReveal, filters, mode, revealConflict, updateView]);

  if (appMode !== 'demo' && session.status === 'checking') return <div className="simulator-load-state">Resolving authenticated account…</div>;
  if (appMode !== 'demo' && session.status !== 'connected') return <div className="simulator-load-state">Authentication required. Please sign in to GitHub to use history.</div>;

  const statusText = loadState === 'loading_initial' ? 'Loading history'
    : loadState === 'error' ? 'History failed'
    : loadState === 'refreshing' ? `Refreshing history · Displaying previous snapshot · ${historyStatus.sourceLabel}`
    : details.stale ? `History ready · Stale snapshot · ${historyStatus.sourceLabel} · ${historyStatus.depthLabel}`
    : historyStatus.headline;

  const renderHistory = () => {
    if (mode === 'repository' && !selectedRepo) return <div className="simulator-load-state"><div><h3>Select a repository</h3><p>Choose a repository to explore what existed, what was active, and what had completed by a date.</p></div></div>;
    if (loadState === 'error') {
      const failure = details.refreshError ?? details.sourceFailures[0];
      const category = failure?.category ?? 'unknown';
      return <div className="simulator-load-state simulator-load-state--error" role="alert"><AlertTriangle size={20}/><div><h3>{safeSimulatorTitle(category)}</h3><p>{failure?.message ?? safeSimulatorExplanation(category)}</p><button className="simulator-control simulator-control--primary" onClick={refresh}><RotateCcw size={13}/> Retry</button></div></div>;
    }
    if (loadState === 'loading_initial' || loadState === 'idle') return <HistoryLoadingState reducedMotion={reducedMotion}/>;
    if (events.length === 0) return <div className="simulator-load-state"><div><h3>No recorded history</h3><p>No qualifying GitHub evidence was found in the selected range.</p></div></div>;

    const progress = snapshot.progress;
    const selectedDate = calendarDateInTimeZone(snapshot.selectedDate, timeZone);
    const selectedRepoCount = mode === 'repository' ? 1 : progress.repositoriesContributedTo;
    return <div ref={historyCanvasRef} className="history-canvas">
      <section className="history-date-bar" aria-label="History date controls">
        <div><strong>State on this date</strong><span>Only evidence recorded on or before this cutoff is included.</span></div>
        <button type="button" className="simulator-control" aria-label="Previous meaningful date" data-tooltip="Previous meaningful date\nMove the selected cutoff to the prior date with recorded evidence." onClick={() => playback.setCursorManual(previousMeaningfulDate(events, snapshot.selectedDate, since, timeZone, until))}><ChevronLeft size={14}/></button>
        <input aria-label="Selected history date" type="date" min={calendarDateInTimeZone(since, timeZone)} max={calendarDateInTimeZone(until, timeZone)} value={selectedDate} onChange={event => playback.setCursorManual(cutoffForCalendarDate(event.target.value, until, timeZone))}/>
        <button type="button" className="simulator-control" aria-label="Next meaningful date" data-tooltip="Next meaningful date\nMove the selected cutoff to the next date with recorded evidence." onClick={() => playback.setCursorManual(nextMeaningfulDate(events, snapshot.selectedDate, until, timeZone))}><ChevronRight size={14}/></button>
        <button type="button" className="simulator-control simulator-control--primary" data-tooltip="Latest available date\nReturn the selected cutoff to the newest loaded evidence." onClick={() => playback.setCursorManual(until)}>Today</button>
        <button type="button" className="simulator-control" data-tooltip="Animate history\nShow playback controls for stepping through evidence over time without changing the loaded range." aria-expanded={showAnimation} aria-controls={`${activeTabId}-history-animation`} onClick={() => { if (showAnimation) playback.pause(); updateView({ showAnimation: !showAnimation }); }}>{showAnimation ? <><Pause size={13}/> Hide animation controls</> : <><Play size={13}/> Animate history</>}</button>
        <button type="button" className="simulator-control" data-tooltip={`History filters\n${activeFilterCount} non-default filter${activeFilterCount === 1 ? '' : 's'} active. Show or hide filters without changing the selected date.`} aria-expanded={showFilters} onClick={() => updateView({ showFilters: !showFilters })}><Filter size={13}/> Filters <span className="simulator-filter-count">{activeFilterCount}</span></button>
      </section>

      {showAnimation && <section id={`${activeTabId}-history-animation`} className="history-animation" aria-label="Animate history controls"><div className="history-playback-row"><button className="simulator-control simulator-control--primary" onClick={playback.togglePlay}>{playback.isPlaying ? <><Pause size={13}/> Pause</> : <><Play size={13}/> {reducedMotion ? 'Step forward' : 'Play'}</>}</button><div className="history-playback-speed"><Select value={String(playback.speedMultiplier)} ariaLabel="History animation speed" onChange={value => playback.setSpeedMultiplier(Number(value))} options={[.5, 1, 2, 4].map(value => ({ value: String(value), label: `${value}×` }))}/></div><div className="history-playback-timeline"><SimulatorTimeline since={since} until={until} cursor={snapshot.selectedDate} onCursorChange={playback.setCursorManual} isPlaying={playback.isPlaying} timeZone={timeZone}/></div></div></section>}

      {showFilters && <section className="simulator-filter-panel" aria-label="History filters">
        {mode === 'account' && <><label>Repository<Select searchable ariaLabel="History repository filter" value={filters.repository} onChange={value => updateView({ filters: { ...filters, repository: value } })} options={[{ value: 'all', label: 'All repositories' }, ...repositoryOptions.map(value => ({ value, label: value }))]}/></label><label>Involvement<Select ariaLabel="History involvement filter" value={filters.involvement} onChange={value => updateView({ filters: { ...filters, involvement: value } })} options={[{ value: 'all', label: 'All direct involvement' }, { value: 'authored_by_you', label: 'Authored by me' }, { value: 'assigned_to_you', label: 'Assigned to me' }, { value: 'review_requested_from_you', label: 'Review requested from me' }, { value: 'reviewed_by_you', label: 'Reviewed by me' }]}/></label></>}
        <label>Work type<Select ariaLabel="History work type" value={filters.entityType} onChange={value => updateView({ filters: { ...filters, entityType: value } })} options={[{ value: 'all', label: 'All work types' }, ...['issue', 'pull_request', 'commit', 'workflow_run', 'release', 'deployment'].map(value => ({ value, label: value.replace(/_/g, ' ') }))]}/></label>
        <label>Actors<Select ariaLabel="History actor filter" value={filters.actor} onChange={value => updateView({ filters: { ...filters, actor: value, includeBots: value !== 'humans' } })} options={[{ value: 'humans', label: 'Humans only' }, { value: 'everyone', label: 'Everyone' }, { value: 'bots', label: 'Bots only' }]}/></label>
        <label>Evidence<Select ariaLabel="History confidence filter" value={filters.confidence} onChange={value => updateView({ filters: { ...filters, confidence: value } })} options={[{ value: 'all', label: 'All confidence' }, { value: 'complete', label: 'Exact / complete' }, { value: 'partial', label: 'Partial' }, { value: 'unknown', label: 'Unknown' }]}/></label>
        <button className="analytics-button" data-tooltip="Clear history filters\nRestore this History page's default filters while preserving the selected date." onClick={() => updateView({ filters: defaultHistoryView(mode).filters })}>Clear filters</button>
      </section>}

      <section className="history-scope" aria-label="History scope explanation"><strong>{mode === 'account' ? `${selectedRepoCount} contributed repositor${selectedRepoCount === 1 ? 'y' : 'ies'}` : selectedRepo?.nameWithOwner}</strong><span>{mode === 'account' ? 'Direct account involvement and loaded account evidence.' : 'All loaded work targeting this base repository, regardless of author or fork origin.'}</span><span>{snapshot.currentAssertionsUsed ? 'Authoritative current assertions included for latest date.' : 'Historical evidence only; current assertions excluded.'}</span><span>{partial ? 'Partial coverage' : 'Complete configured coverage'} · {snapshot.duplicateEventsSuppressed} duplicate evidence record{snapshot.duplicateEventsSuppressed === 1 ? '' : 's'} suppressed.</span></section>
      <section className="history-progress" aria-label="Progress by selected date">
        <HistoryMetric label="PRs opened" value={progress.pullRequestsOpened} detail="Unique pull requests opened by this date"/>
        <HistoryMetric label="PRs merged" value={progress.pullRequestsMerged} detail="Unique merge evidence by this date"/>
        <HistoryMetric label={mode === 'account' ? 'Issues worked' : 'Issues opened'} value={mode === 'account' ? progress.issuesWorked : progress.issuesOpened} detail={mode === 'account' ? 'Unique issues with contribution evidence by this date' : 'Unique issues opened by this date'}/>
        <HistoryMetric label="Issues closed" value={progress.issuesClosed} detail="Unique issue closures by this date"/>
        {mode === 'account' ? <HistoryMetric label="Reviews submitted" value={progress.reviewsSubmitted} detail="Recorded review outcomes by this date"/> : <HistoryMetric label="Contributors" value={progress.contributors} detail="Distinct recorded actors by this date"/>}
        {mode === 'account' ? <HistoryMetric label="Repositories" value={progress.repositoriesContributedTo} detail="Repositories with contribution evidence by this date"/> : <><HistoryMetric label="Active PRs" value={activeEntities.filter(entity => entity.subjectType === 'pull_request').length} detail="Pull requests active on the selected date"/><HistoryMetric label="Active issues" value={activeEntities.filter(entity => entity.subjectType === 'issue').length} detail="Issues active on the selected date"/></>}
        <HistoryMetric label="Releases" value={progress.releases} detail="Recorded releases by this date"/>
        <HistoryMetric label="Deployments" value={progress.deployments} detail="Successful deployments by this date"/>
        <HistoryMetric label="Recorded events" value={progress.recordedEvents} detail="Deduplicated evidence records, not entity count"/>
      </section>

      {revealConflict && <div className="history-reveal-message" role="status"><span>This item is hidden by the current filters.</span><button type="button" data-tooltip="Reveal related item\nClear only the search or filters that hide this canonical entity, then reveal it in the correct list." onClick={revealHiddenEntity}>Reveal item</button></div>}
      <div className="history-entity-grid">
        <SimulatorEntityList title="Active on selected date" emptyLabel="No active work is supported on this date." entities={activeEntities} selectedId={selectedEntityId} query={activeSearch} onQueryChange={setActiveSearch} scrollRef={activeListRef} revealId={pendingReveal?.key} flashId={flashEntityId} registerRow={registerHistoryRow} onSelect={id => updateView({ selectedEntityId: id, selectedEventId: undefined })}/>
        <SimulatorEntityList title="Completed by selected date" emptyLabel="No completed work is supported by this date." entities={completedEntities} selectedId={selectedEntityId} query={completedSearch} onQueryChange={setCompletedSearch} scrollRef={completedListRef} revealId={pendingReveal?.key} flashId={flashEntityId} registerRow={registerHistoryRow} onSelect={id => updateView({ selectedEntityId: id, selectedEventId: undefined })}/>
      </div>
      <SimulatorEventStream events={visibleEvents} cursor={snapshot.selectedDate} selectedEventId={selectedEventId} timeZone={timeZone} initialScrollTop={view.activityScrollTop} onScrollTop={value => updateView({ activityScrollTop: value })} onSelectEvent={selectHistoryEvent}/>
      <span className="sr-only" aria-live="polite">{revealAnnouncement}</span>
    </div>;
  };

  return <div className="simulator-workbench history-workbench">
    <header className="simulator-header">
      <div className="simulator-heading"><h2>{mode === 'account' ? 'Account History' : 'Repository History'}{appMode === 'demo' && <span className="simulator-context">Demo Mode</span>}{mode === 'account' && <span className="simulator-context">{session.status === 'connected' && session.account.avatarUrl && <img src={session.account.avatarUrl} alt=""/>}{login}</span>}</h2>
        <div className="simulator-history"><span>Available evidence: {calendarDateInTimeZone(since, timeZone)} – {calendarDateInTimeZone(until, timeZone)} · {statusText}</span><button ref={sourceDisclosureRef} id={`${activeTabId}-source-disclosure`} className={`simulator-completeness simulator-completeness--${partial ? 'ready_partial' : loadState}`} aria-expanded={showCoverage} aria-controls={`${activeTabId}-source-details`} onClick={() => updateView({ showSourceDetails: !showCoverage })}>{showCoverage ? <>Hide source details <ChevronUp size={12}/></> : <>Source details <ChevronDown size={12}/></>}</button></div>
      </div>
      <div className="history-header-actions">{mode === 'repository' && <RepositorySelector selectedRepo={selectedRepo || undefined} compact onSelect={repository => setSelectedRepo(repository)}/>}<button className="simulator-control" onClick={refresh}><RotateCcw size={13}/> Refresh history</button><div className="simulator-range" aria-label="History load range">{[30, 90, 180].map(days => <button key={days} onClick={() => { updateView({ customRange: false, selectedCalendarDate: undefined }); setRange(setSince, setUntil, days, timeZone); }}>{days}d</button>)}<button className={customRange ? 'is-active' : ''} onClick={() => updateView({ customRange: true })}>Custom</button></div></div>
    </header>
    {showCoverage && <div ref={sourcePanelRef} id={`${activeTabId}-source-details`} className="simulator-coverage-details" role="region" aria-label="Source details" tabIndex={-1} onScroll={event => updateView({ sourceScrollTop: event.currentTarget.scrollTop })}><header><div><strong>Source details · {historyStatus.loaded} loaded · {historyStatus.partial} partial · {historyStatus.failed} failed</strong><span>{historyStatus.depthLabel}</span></div><button type="button" aria-label="Close source details" onClick={() => { updateView({ showSourceDetails: false }); requestAnimationFrame(() => sourceDisclosureRef.current?.focus()); }}><X size={14}/></button></header><p>Selected cutoff: {formatHistoryCutoff(snapshot.selectedDate, timeZone)} · {snapshot.events.length} deduplicated events · {snapshot.entities.length} canonical entities.</p>{details.sourceStatuses?.length ? <ul className="simulator-source-statuses">{details.sourceStatuses.map(source => <li key={source.sourceId} data-status={source.status}><strong>{source.label} · {source.status}</strong><span>{source.purpose}</span><small>Affects: {source.affectedData}{source.message ? ` · ${source.message}` : ''}{source.retryable ? ' · Retryable' : ' · Not retryable'}{source.lastAttemptAt ? ` · Last attempt ${formatHistoryCutoff(source.lastAttemptAt, timeZone)}` : ''}</small></li>)}</ul> : <p>{details.loadedSources} of {details.totalSources} configured sources loaded. No per-source detail was supplied by this provider.</p>}</div>}
    {customRange && <div className="simulator-custom-range"><label>History starts<input type="date" value={calendarDateInTimeZone(since, timeZone)} max={calendarDateInTimeZone(until, timeZone)} onChange={event => { updateView({ selectedCalendarDate: undefined }); setSince(startOfCalendarDate(event.target.value, timeZone)); }}/></label><label>History ends<input type="date" value={calendarDateInTimeZone(until, timeZone)} min={calendarDateInTimeZone(since, timeZone)} onChange={event => { updateView({ selectedCalendarDate: undefined }); setUntil(endOfCalendarDate(event.target.value, timeZone)); }}/></label></div>}
    {loadState === 'refreshing' && events.length > 0 && <div className="simulator-refresh-banner" role="status">Refreshing GitHub data · Displaying previous snapshot</div>}
    {(details.stale || incompleteSourceCount > 0) && <div className="simulator-partial-banner"><AlertTriangle size={14}/><span><strong>{statusText}</strong> Source completeness and historical depth are reported separately.</span><button type="button" onClick={() => updateView({ showSourceDetails: !showCoverage })}>{showCoverage ? 'Hide source details' : 'Source details'}</button></div>}
    {renderHistory()}
  </div>;
}
