import { AppWindow, Globe2, MoreHorizontal, Plus, RotateCcw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTabsStore, isBrowserTab } from '../../stores/tabs-store';
import type { WorkspaceTab } from '../../stores/tabs-store';
import { useOverlayStore } from '../../stores/overlay-store';
import { refreshWorkspaceTab, tabRefreshCapability } from '../../lib/tab-refresh';

export function WorkspaceTabStrip() {
  const tabs = useTabsStore(s => s.tabs);
  const closedTabs = useTabsStore(s => s.closedTabs);
  const activeTabId = useTabsStore(s => s.activeTabId);
  const setActiveTab = useTabsStore(s => s.setActiveTab);
  const closeTab = useTabsStore(s => s.closeTab);
  const closeOthers = useTabsStore(s => s.closeOthers);
  const closeTabsToRight = useTabsStore(s => s.closeTabsToRight);
  const reopenClosedTab = useTabsStore(s => s.reopenClosedTab);
  const moveTab = useTabsStore(s => s.moveTab);
  const [menu, setMenu] = useState<{ tabId?: string; x: number; y: number }>();
  const [menuMessage, setMenuMessage] = useState('');
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const menuRef = useRef<HTMLDivElement>(null);
  const menuStateRef = useRef<typeof menu>(undefined);
  const previousActiveTabId = useRef(activeTabId);
  const overflowRef = useRef<HTMLButtonElement>(null);
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
    {menuTab ? <><button role="menuitem" disabled={!refreshCapability.available} title={refreshCapability.disabledReason} onClick={activateRefresh}><RotateCcw size={12} /> {refreshCapability.label}</button><button role="menuitem" disabled={!menuTab.closable} onClick={() => { closeTab(menuTab.id); closeMenu(); }}>Close tab</button><button role="menuitem" onClick={() => { closeOthers(menuTab.id); closeMenu(); }}>Close others</button><button role="menuitem" onClick={() => { closeTabsToRight(menuTab.id); closeMenu(); }}>Close tabs to the right</button></> : <>
      <strong>Open tabs</strong>{tabs.map(tab => <button role="menuitem" key={tab.id} onClick={() => { setActiveTab(tab.id); closeMenu(); }}>{isBrowserTab(tab) ? <Globe2 size={12} /> : <AppWindow size={12} />}{tab.title}</button>)}
    </>}
    <hr /><button role="menuitem" disabled={!closedTabs.length} onClick={() => { reopenClosedTab(); closeMenu(); }}><RotateCcw size={12} /> Reopen closed tab{closedTabs[0] ? ` · ${closedTabs[0].title}` : ''}</button>
    {menuMessage && <span className="workspace-tab-menu__message" role="status">{menuMessage}</span>}
  </div>, document.body) : null;

  return (
    <div className="workspace-tab-strip glass-panel" role="tablist" onPointerDown={event => { if (menu && event.target === event.currentTarget) closeMenu(); }}>
      <div className="workspace-tab-scroll" onScroll={() => { if (menu) closeMenu(); }}>
        {tabs.map((tab: WorkspaceTab) => {
          const isActive = tab.id === activeTabId;
          const isBrowser = isBrowserTab(tab);
          const tooltip = isBrowser ? `${tab.title}\n${tab.currentUrl}` : tab.title;
          return (
            <div
              key={tab.id}
              ref={element => { if (element) tabRefs.current.set(tab.id, element); else tabRefs.current.delete(tab.id); }}
              className={`workspace-tab workspace-tab--${tab.family} ${isActive ? 'workspace-tab--active' : ''}`}
              role="tab"
              draggable={tab.id !== 'native:home'}
              aria-selected={isActive}
              aria-label={`${isBrowser ? 'Browser' : 'Native'} tab: ${tab.title}`}
              title={tooltip}
              tabIndex={isActive ? 0 : -1}
              onDragStart={event => event.dataTransfer.setData('text/snow-devil-tab', tab.id)}
              onDragOver={event => event.preventDefault()}
              onDrop={event => { event.preventDefault(); const from = event.dataTransfer.getData('text/snow-devil-tab'); if (from) moveTab(from, tab.id); }}
              onClick={() => setActiveTab(tab.id)}
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
              {isBrowser ? <Globe2 className="workspace-tab__family" size={11} /> : <AppWindow className="workspace-tab__family" size={11} />}
              <span className="workspace-tab__title">{tab.title}</span>
              {tab.closable && <button className="workspace-tab__close" aria-label={`Close ${tab.title}`} onClick={event => { event.stopPropagation(); closeTab(tab.id); }}><X size={15} strokeWidth={2} /></button>}
            </div>
          );
        })}
      </div>
      <button className="workspace-tab-add" aria-label="Open or switch tab" title="Open or switch tab" onClick={event => showMenu({ x: event.currentTarget.getBoundingClientRect().right - 220, y: event.currentTarget.getBoundingClientRect().bottom + 4 })}><Plus size={15}/></button>
      <button ref={overflowRef} className="workspace-tab-overflow" aria-label="Tab overflow menu" onClick={event => showMenu({ x: event.currentTarget.getBoundingClientRect().right - 220, y: event.currentTarget.getBoundingClientRect().bottom + 4 })}><MoreHorizontal size={16} /></button>
      {popup}
    </div>
  );
}
