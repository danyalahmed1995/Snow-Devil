import { useState, useEffect, useCallback } from 'react';
import { useLayoutStore } from '../../stores/layout-store';
import { useAuthStore } from '../../stores/auth-store';
import { useTabsStore, isBrowserTab } from '../../stores/tabs-store';
import {
  Menu,
  PanelRightClose,
  PanelRightOpen,
  LogOut,
  Copy,
  ExternalLink,
  RotateCcw,
  Snowflake,
  Bell,
} from 'lucide-react';
import { AuthModal } from '../auth/AuthModal';
import { useModeStore } from '../../stores/mode-store';
import { BrowserToolbar } from '../../browser/BrowserToolbar';
import { AddressBar } from '../../navigation/AddressBar';
import { resetLocalAppData } from '../../services/reset-local-app-data';
import './TopBar.css';
import { copyCanonicalLink, openInDefaultBrowser } from '../../lib/browser-actions';
import { activeNotifications, effectiveUnread, formatNotificationCount, useNotificationStore } from '../../stores/notification-store';

export function TopBar() {
  const { toggleNavigator, toggleInspector, isInspectorOpen } = useLayoutStore();
  const { isAuthenticated, checkAuthStatus, session } = useAuthStore();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { mode, exitDemo, resetDemo } = useModeStore();
  const notificationRecords=useNotificationStore(state=>state.records);const notificationRead=useNotificationStore(state=>state.localRead);const notificationSnoozed=useNotificationStore(state=>state.snoozedUntil);const unreadNotifications=activeNotifications(notificationRecords,notificationSnoozed).filter(record=>effectiveUnread(record,notificationRead)).length;
  const notificationArrivalCount = useNotificationStore(state => state.arrivalCount);
  const notificationArrivalActive = useNotificationStore(state => state.arrivalActive);
  const settleNotificationArrival = useNotificationStore(state => state.settleArrival);

  const activeTabId = useTabsStore(s => s.activeTabId);
  const tabs = useTabsStore(s => s.tabs);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeBrowserTab =
    activeTab && isBrowserTab(activeTab) ? activeTab : undefined;

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const handleCopyUrl = useCallback(() => {
    if (activeBrowserTab?.currentUrl) {
      void copyCanonicalLink(activeBrowserTab.currentUrl).catch(console.error);
    }
  }, [activeBrowserTab]);

  const handleOpenExternal = useCallback(() => {
    if (activeBrowserTab?.currentUrl) {
      void openInDefaultBrowser(activeBrowserTab.currentUrl).catch(console.error);
    }
  }, [activeBrowserTab]);

  return (
    <>
      <header className="top-bar glass-panel-strong">
        <div className="top-bar-left">
          <button className="icon-button" onClick={toggleNavigator} aria-label="Toggle Navigator" data-tooltip="Toggle Navigator\nShow or hide primary navigation and management links.">
            <Menu size={18} />
          </button>
          <div className="app-title">
            <span className="app-mark"><Snowflake size={17} /></span>
            <span>Snow Devil</span>
          </div>
          <BrowserToolbar activeTab={activeBrowserTab} />
        </div>
        
        <div className="top-bar-center">
          <AddressBar />
        </div>
        
        <div className="top-bar-right">
          {/* Browser-only actions */}
          {activeBrowserTab && (
            <>
              <button
                className="icon-button"
                onClick={handleCopyUrl}
                aria-label="Copy URL"
                data-tooltip="Copy URL\nCopies the active embedded GitHub page link."
              >
                <Copy size={16} />
              </button>
              <button
                className="icon-button"
                onClick={handleOpenExternal}
                aria-label="Open in system browser"
                data-tooltip="Open in system browser\nOpens the validated GitHub URL outside Snow Devil."
              >
                <ExternalLink size={16} />
              </button>
              <div className="divider" />
            </>
          )}

          <div className="topbar-actions">
            {import.meta.env.DEV && <button className="icon-button" aria-label="Reset local app data" onClick={() => resetLocalAppData().catch(console.error)} data-tooltip="Reset local app data\nDevelopment-only destructive reset of Snow Devil's local state."><RotateCcw size={16} /></button>}
            {mode === 'demo' ? (
              <>
                <span className="demo-mode-badge">Demo Mode</span>
                <button className="icon-button" aria-label="Reset demo" data-tooltip="Reset Demo\nRestores deterministic demo fixtures to their initial state." onClick={resetDemo}><RotateCcw size={16}/></button>
                <button className="icon-button" aria-label="Exit demo" onClick={exitDemo} data-tooltip="Exit Demo\nReturn to the authenticated live workspace."><LogOut size={16} /></button>
              </>
            ) : isAuthenticated && session.status === 'connected' ? (
              <button className="topbar-account" onClick={() => useTabsStore.getState().openBrowserTab('github:profile','profile',session.account.login,`https://github.com/${session.account.login}`,false,true)} data-tooltip="GitHub account\nOpen the connected account profile in Snow Devil." aria-label={`Open ${session.account.login} account`}>
                <img src={session.account.avatarUrl} alt="" />
              </button>
            ) : (
              <button className="auth-btn" onClick={() => setShowAuthModal(true)}>
                Connect
              </button>
            )}
          </div>
          <div className="divider" />
          <button className={`icon-button topbar-notifications${notificationArrivalActive ? ' is-arriving' : ''}`} aria-label={`Open notifications${unreadNotifications?` (${unreadNotifications} unread)`:''}${notificationArrivalCount ? `, ${notificationArrivalCount} newly arrived` : ''}`} data-tooltip={`Notifications\n${unreadNotifications} unread. Open or activate the Notifications tab.`} onClick={()=>{settleNotificationArrival();useTabsStore.getState().openNativeTab('native:notifications','notifications','Notifications',false,true)}}><Bell size={17}/>{notificationArrivalCount>0?<span className="arrival-count">{formatNotificationCount(notificationArrivalCount,true)}</span>:unreadNotifications>0&&<span>{formatNotificationCount(unreadNotifications)}</span>}</button>
          <button className="icon-button" onClick={toggleInspector} aria-label={isInspectorOpen ? 'Close Inspector' : 'Open Inspector'} data-tooltip={`${isInspectorOpen ? 'Close' : 'Open'} Inspector\nToggle contextual details for the selected row, card, or event.`}>
            {isInspectorOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </header>
      
      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}
    </>
  );
}
