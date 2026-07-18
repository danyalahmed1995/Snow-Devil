import { AppWindow, Globe2, MoreHorizontal, Plus, RotateCcw, X, CheckCircle2, XCircle, MinusCircle, Home, Workflow, Gauge, PackageSearch, ChartNoAxesCombined, Activity, SlidersHorizontal, Boxes, Settings, NotebookPen, FolderGit2, GitPullRequest, Bell, Building2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useTabsStore, isBrowserTab } from '../../stores/tabs-store';
import type { WorkspaceTab } from '../../stores/tabs-store';
import { useOverlayStore } from '../../stores/overlay-store';
import { refreshWorkspaceTab, tabRefreshCapability } from '../../lib/tab-refresh';
import { useCIWatcherStore } from '../../stores/ci-watcher-store';

export function WorkspaceTabStrip() {
  const tabs = useTabsStore(s => s.tabs);
  const closedTabs = useTabsStore(s => s.closedTabs);
  const activeTabId = useTabsStore(s => s.activeTabId);
  const runsByRepository = useCIWatcherStore(s => s.runsByRepository);
  const setActiveTab = useTabsStore(s => s.setActiveTab);
  const closeTab = useTabsStore(s => s.closeTab);
  const closeOthers = useTabsStore(s => s.closeOthers);
  const closeTabsToRight = useTabsStore(s => s.closeTabsToRight);
  const reopenClosedTab = useTabsStore(s => s.reopenClosedTab);
  const moveTab = useTabsStore(s => s.moveTab);
  const [menu, setMenu] = useState<{ tabId?: string; x: number; y: number }>();
  const [menuMessage, setMenuMessage] = useState('');
  const [draggingTabId, setDraggingTabId] = useState<string>();
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const menuRef = useRef<HTMLDivElement>(null);
  const menuStateRef = useRef<typeof menu>(undefined);
  const previousActiveTabId = useRef(activeTabId);
  const overflowRef = useRef<HTMLButtonElement>(null);
  const tabDragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; lastX: number; didMove: boolean } | undefined>(undefined);
  const pendingLayoutAnimationRef = useRef<Map<string, DOMRect> | undefined>(undefined);
  const tabAnimationsRef = useRef(new Map<string, Animation>());
  const suppressNextClickRef = useRef(false);
  const openOverlay = useOverlayStore(state => state.openOverlay);
  const closeOverlay = useOverlayStore(state => state.closeOverlay);
  const activeOverlayId = useOverlayStore(state => state.activeOverlayId);

  useEffect(() => { menuStateRef.current = menu; }, [menu]);
  const closeMenu = useCallback((restoreFocus = false) => {
    const currentMenu = menuStateRef.current;
    const origin = currentMenu?.tabId ? tabRefs.current.get(currentMenu.tabId) : overflowRef.current;
    setMenu(undefined);
    setMenuMessage('');
    closeOverlay('tab-menu');
    if (restoreFocus) window.setTimeout(() => origin?.focus(), 0);
  }, [closeOverlay]);
  const showMenu = (next: { tabId?: string; x: number; y: number }) => { setMenu(next); setMenuMessage(''); openOverlay('tab-menu'); };
  const captureTabRects = () => {
    pendingLayoutAnimationRef.current = new Map([...tabRefs.current].map(([id, element]) => [id, element.getBoundingClientRect()]));
  };
  useLayoutEffect(() => {
    const previousRects = pendingLayoutAnimationRef.current;
    if (!previousRects) return;
    pendingLayoutAnimationRef.current = undefined;
    const reduceMotion = document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    tabRefs.current.forEach((element, id) => {
      const previous = previousRects.get(id);
      if (!previous || typeof element.animate !== 'function') return;
      const current = element.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      if (id === draggingTabId) return;
      tabAnimationsRef.current.get(id)?.cancel();
      const animation = element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: 'translate(0, 0)' },
        ],
        { duration: 150, easing: 'cubic-bezier(.2, .8, .2, 1)' },
      );
      tabAnimationsRef.current.set(id, animation);
      animation.addEventListener('finish', () => tabAnimationsRef.current.delete(id), { once: true });
      animation.addEventListener('cancel', () => tabAnimationsRef.current.delete(id), { once: true });
    });
  }, [draggingTabId, tabs]);
  useEffect(() => {
    const tab = tabRefs.current.get(activeTabId);
    if (!tab) return;
    const reduceMotion = document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [activeTabId, tabs.length]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu) { event.preventDefault(); closeMenu(true); return; }
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'Tab') return;
      event.preventDefault();
      const index = tabs.findIndex(tab => tab.id === activeTabId);
      const direction = event.shiftKey ? -1 : 1;
      setActiveTab(tabs[(index + direction + tabs.length) % tabs.length].id);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [activeTabId, menu, setActiveTab, tabs]);
  useEffect(() => {
    if (!menu) return;
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const dismiss = () => closeMenu();
    window.addEventListener('pointerdown', pointerDown, true);
    window.addEventListener('blur', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('pointerdown', pointerDown, true);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [closeMenu, menu]);
  useEffect(() => {
    if (menu && activeOverlayId && activeOverlayId !== 'tab-menu') closeMenu();
  }, [activeOverlayId, closeMenu, menu]);
  useEffect(() => {
    if (previousActiveTabId.current !== activeTabId) {
      previousActiveTabId.current = activeTabId;
      if (menuStateRef.current) closeMenu();
    }
  }, [activeTabId, closeMenu]);
  useEffect(() => {
    if (menu?.tabId && !tabs.some(tab => tab.id === menu.tabId)) closeMenu();
  }, [closeMenu, menu, tabs]);
  useEffect(() => {
    if (!menu) return;
    window.setTimeout(() => menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus(), 0);
  }, [menu]);
  useEffect(() => () => closeOverlay('tab-menu'), [closeOverlay]);
  useEffect(() => () => {
    tabAnimationsRef.current.forEach(animation => animation.cancel());
    tabAnimationsRef.current.clear();
  }, []);

  const menuTab = menu?.tabId ? tabs.find(tab => tab.id === menu.tabId) : undefined;
  const refreshCapability = tabRefreshCapability(menuTab);
  const menuLeft = menu ? Math.max(8, Math.min(menu.x, Math.max(8, window.innerWidth - 238))) : 0;
  const menuTop = menu ? Math.max(8, Math.min(menu.y, Math.max(8, window.innerHeight - 318))) : 0;
  const activateRefresh = () => {
    if (!menuTab || !refreshCapability.available) return;
    void refreshWorkspaceTab(menuTab)
      .then(() => closeMenu())
      .catch(() => setMenuMessage('Refresh failed. Try again from this tab.'));
  };
  const finishTabDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    const drag = tabDragRef.current;
    if (!drag) return;
    if (event?.currentTarget.hasPointerCapture?.(drag.pointerId)) event.currentTarget.releasePointerCapture(drag.pointerId);
    tabDragRef.current = undefined;
    setDraggingTabId(undefined);
    if (drag.didMove) {
      suppressNextClickRef.current = true;
      window.setTimeout(() => { suppressNextClickRef.current = false; }, 0);
    }
  };
  const startTabDrag = (event: ReactPointerEvent<HTMLDivElement>, tab: WorkspaceTab) => {
    if (event.button !== 0 || tab.id === 'native:home' || (event.target as Element).closest('button')) return;
    tabDragRef.current = { id: tab.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, didMove: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const updateTabDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = tabDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const direction = Math.sign(event.clientX - drag.lastX);
    drag.lastX = event.clientX;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.didMove && distance < 4) return;
    if (!drag.didMove) {
      drag.didMove = true;
      setDraggingTabId(drag.id);
      if (menuStateRef.current) closeMenu();
    }
    event.preventDefault();
    if (direction === 0) return;
    const currentIndex = tabs.findIndex(tab => tab.id === drag.id);
    if (currentIndex < 0) return;
    const neighbor = tabs[currentIndex + direction];
    if (!neighbor) return;
    if (neighbor.id === 'native:home') return;
    const neighborRect = tabRefs.current.get(neighbor.id)?.getBoundingClientRect();
    if (!neighborRect) return;
    const neighborMidpoint = neighborRect.left + neighborRect.width / 2;
    const crossedNeighbor = direction > 0 ? event.clientX > neighborMidpoint : event.clientX < neighborMidpoint;
    if (crossedNeighbor) {
      captureTabRects();
      moveTab(drag.id, neighbor.id);
    }
  };
  const menuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + direction + items.length) % items.length]?.focus();
    }
    if (event.key === 'Home') { event.preventDefault(); items[0]?.focus(); }
    if (event.key === 'End') { event.preventDefault(); items[items.length - 1]?.focus(); }
  };
  const popup = menu ? createPortal(<div ref={menuRef} className="workspace-tab-menu glass-panel-strong" style={{ left: menuLeft, top: menuTop }} role="menu" onKeyDown={menuKeyDown} onPointerDown={event => event.stopPropagation()}>
    {menuTab ? <><button role="menuitem" disabled={!refreshCapability.available} data-tooltip={refreshCapability.disabledReason} onClick={activateRefresh}><RotateCcw size={12} /> {refreshCapability.label}</button><button role="menuitem" disabled={!menuTab.closable} onClick={() => { closeTab(menuTab.id); closeMenu(); }}>Close tab</button><button role="menuitem" onClick={() => { closeOthers(menuTab.id); closeMenu(); }}>Close others</button><button role="menuitem" onClick={() => { closeTabsToRight(menuTab.id); closeMenu(); }}>Close tabs to the right</button></> : <>
      <strong>Open tabs</strong>{tabs.map(tab => <button role="menuitem" key={tab.id} onClick={() => { setActiveTab(tab.id); closeMenu(); }}>{isBrowserTab(tab) ? <Globe2 size={12} /> : <AppWindow size={12} />}{tab.title}</button>)}
    </>}
    <hr /><button role="menuitem" disabled={!closedTabs.length} onClick={() => { reopenClosedTab(); closeMenu(); }}><RotateCcw size={12} /> Reopen closed tab{closedTabs[0] ? ` · ${closedTabs[0].title}` : ''}</button>
    {menuMessage && <span className="workspace-tab-menu__message" role="status">{menuMessage}</span>}
  </div>, document.body) : null;

  return (
    <div className="workspace-tab-strip" role="tablist" onPointerDown={event => { if (menu && event.target === event.currentTarget) closeMenu(); }}>
      <div className="workspace-tab-scroll" onScroll={() => { if (menu) closeMenu(); }}>
        {tabs.map((tab: WorkspaceTab) => {
          const isActive = tab.id === activeTabId;
          const isBrowser = isBrowserTab(tab);
          const tooltip = isBrowser ? `${tab.title}\n${tab.currentUrl}` : tab.title;

          let ciStatusClass = '';
          let ciStatusIcon = null;
          if (tab.family === 'native' && tab.kind === 'ciRun' && tab.context?.type === 'ciRun') {
            const { repository, runId } = tab.context;
            const runs = runsByRepository[repository?.toLowerCase()] || [];
            const run = runs.find(r => r.runId.toString() === runId?.toString());
            if (run) {
              if (['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(run.status)) {
                ciStatusClass = 'state-running';
              } else if (run.status === 'completed') {
                if (run.conclusion === 'success') {
                  ciStatusClass = 'state-success';
                  ciStatusIcon = <CheckCircle2 className="status-icon-svg success-svg" size={14} />;
                } else if (['failure', 'timed_out', 'action_required', 'startup_failure'].includes(run.conclusion || '')) {
                  ciStatusClass = 'state-failure';
                  ciStatusIcon = <XCircle className="status-icon-svg failure-svg" size={14} />;
                } else {
                  ciStatusClass = 'state-skipped';
                  ciStatusIcon = <MinusCircle className="status-icon-svg skipped-svg" size={14} />;
                }
              }
            }
          }

          let NativeTabIcon = AppWindow;
          let nativeIconClass = '';
          if (tab.family === 'native') {
            switch (tab.kind) {
              case 'home': NativeTabIcon = Home; nativeIconClass = 'icon-home'; break;
              case 'flow': NativeTabIcon = Workflow; nativeIconClass = 'icon-flow'; break;
              case 'ciHealth': NativeTabIcon = Gauge; nativeIconClass = 'icon-gauge'; break;
              case 'inventory': NativeTabIcon = PackageSearch; nativeIconClass = 'icon-package'; break;
              case 'flowAnalytics': NativeTabIcon = ChartNoAxesCombined; nativeIconClass = 'icon-chart'; break;
              case 'personalFocus': NativeTabIcon = Activity; nativeIconClass = 'icon-activity'; break;
              case 'accountSimulator': NativeTabIcon = SlidersHorizontal; nativeIconClass = 'icon-sliders'; break;
              case 'repositorySimulator': NativeTabIcon = Boxes; nativeIconClass = 'icon-boxes'; break;
              case 'settings': NativeTabIcon = Settings; nativeIconClass = 'icon-settings'; break;
              case 'sketchBoard': NativeTabIcon = NotebookPen; nativeIconClass = 'icon-sketch'; break;
              case 'notifications': NativeTabIcon = Bell; nativeIconClass = 'icon-bell'; break;
              case 'organizations': NativeTabIcon = Building2; nativeIconClass = 'icon-building'; break;
              case 'repositoryExplorer': NativeTabIcon = FolderGit2; nativeIconClass = 'icon-folder'; break;
              case 'pullRequestDiff': NativeTabIcon = GitPullRequest; nativeIconClass = 'icon-pr'; break;
            }
          }

          return (
            <div
              key={tab.id}
              ref={element => { if (element) tabRefs.current.set(tab.id, element); else tabRefs.current.delete(tab.id); }}
              className={`workspace-tab workspace-tab--${tab.family} ${isActive ? 'workspace-tab--active' : ''} ${draggingTabId === tab.id ? 'workspace-tab--dragging' : ''} ${ciStatusClass ? `workspace-tab--${ciStatusClass}` : ''}`}
              role="tab"
              data-tab-id={tab.id}
              aria-selected={isActive}
              aria-label={`${isBrowser ? 'Browser' : 'Native'} tab: ${tab.title}`}
              data-tooltip={tooltip}
              tabIndex={isActive ? 0 : -1}
              onPointerDown={event => startTabDrag(event, tab)}
              onPointerMove={updateTabDrag}
              onPointerUp={finishTabDrag}
              onPointerCancel={finishTabDrag}
              onClick={() => {
                if (suppressNextClickRef.current) return;
                setActiveTab(tab.id);
              }}
              onContextMenu={event => { event.preventDefault(); showMenu({ tabId: tab.id, x: event.clientX, y: event.clientY }); }}
              onKeyDown={event => {
                if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  showMenu({ tabId: tab.id, x: rect.left + 12, y: rect.bottom + 4 });
                } else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActiveTab(tab.id);
                }
              }}
              onAuxClick={event => { if (event.button === 1 && tab.closable) { event.preventDefault(); closeTab(tab.id); } }}
            >
              {isBrowser ? <Globe2 className="workspace-tab__family" size={11} /> : ciStatusClass ? (
                <div className={`status-icon-wrapper ${ciStatusClass}`} style={{ width: 14, height: 14, marginRight: 6 }}>
                  <div className="spinner-ring" style={{ width: 14, height: 14 }}></div>
                  {ciStatusIcon}
                </div>
              ) : <NativeTabIcon className={`workspace-tab__family ${nativeIconClass}`} size={11} />}
              <span className="workspace-tab__title">{tab.title}</span>
              {tab.closable && <button className="workspace-tab__close" aria-label={`Close ${tab.title}`} onClick={event => { event.stopPropagation(); closeTab(tab.id); }}><X size={15} strokeWidth={2} /></button>}
            </div>
          );
        })}
      </div>
      <button className="workspace-tab-add" aria-label="Open or switch tab" data-tooltip="Open or switch tab\nOpen a fixed page or activate an existing workspace tab." onClick={event => showMenu({ x: event.currentTarget.getBoundingClientRect().right - 220, y: event.currentTarget.getBoundingClientRect().bottom + 4 })}><Plus size={15}/></button>
      <button ref={overflowRef} className="workspace-tab-overflow" aria-label="Tab overflow menu" onClick={event => showMenu({ x: event.currentTarget.getBoundingClientRect().right - 220, y: event.currentTarget.getBoundingClientRect().bottom + 4 })}><MoreHorizontal size={16} /></button>
      {popup}
    </div>
  );
}
