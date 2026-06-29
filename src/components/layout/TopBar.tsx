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
import { activeNotifications, effectiveUnread, useNotificationStore } from '../../stores/notification-store';

export function TopBar() {
  const { toggleNavigator, toggleInspector, isInspectorOpen } = useLayoutStore();
  const { isAuthenticated, checkAuthStatus, session } = useAuthStore();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { mode, exitDemo, resetDemo } = useModeStore();
  const notificationRecords=useNotificationStore(state=>state.records);const notificationRead=useNotificationStore(state=>state.localRead);const notificationSnoozed=useNotificationStore(state=>state.snoozedUntil);const unreadNotifications=activeNotifications(notificationRecords,notificationSnoozed).filter(record=>effectiveUnread(record,notificationRead)).length;

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
          <button className="icon-button" onClick={toggleNavigator} aria-label="Toggle Navigator" title="Toggle Navigator">
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
                title="Copy URL"
              >
                <Copy size={16} />
              </button>
              <button
                className="icon-button"
                onClick={handleOpenExternal}
                title="Open in system browser"
              >
                <ExternalLink size={16} />
              </button>
              <div className="divider" />
            </>
          )}

          <div className="topbar-actions">
            {import.meta.env.DEV && <button className="icon-button" onClick={() => resetLocalAppData().catch(console.error)} title="Reset Local App Data"><RotateCcw size={16} /></button>}
            {mode === 'demo' ? (
              <>
                <span className="demo-mode-badge">Demo Mode</span>
                <button className="icon-button" aria-label="Reset demo" title="Reset demo" onClick={resetDemo}><RotateCcw size={16}/></button>
                <button className="icon-button" onClick={exitDemo} title="Exit Demo"><LogOut size={16} /></button>
              </>
            ) : isAuthenticated && session.status === 'connected' ? (
              <button className="topbar-account" onClick={() => useTabsStore.getState().openBrowserTab('github:profile','profile',session.account.login,`https://github.com/${session.account.login}`,false,true)} title="Open account" aria-label={`Open ${session.account.login} account`}>
                <img src={session.account.avatarUrl} alt="" />
              </button>
            ) : (
              <button className="auth-btn" onClick={() => setShowAuthModal(true)}>
                Connect
              </button>
            )}
          </div>
          <div className="divider" />
          <button className="icon-button topbar-notifications" aria-label={`Open notifications${unreadNotifications?` (${unreadNotifications} unread)`:''}`} title="Notifications" onClick={()=>useTabsStore.getState().openNativeTab('native:notifications','notifications','Notifications',false,true)}><Bell size={17}/>{unreadNotifications>0&&<span>{Math.min(99,unreadNotifications)}</span>}</button>
          <button className="icon-button" onClick={toggleInspector} aria-label={isInspectorOpen ? 'Close Inspector' : 'Open Inspector'} title={isInspectorOpen ? 'Close Inspector' : 'Open Inspector'}>
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
