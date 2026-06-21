import { useState, useEffect, useCallback } from 'react';
import { useLayoutStore } from '../../stores/layout-store';
import { useAuthStore } from '../../stores/auth-store';
import { useTabsStore, isBrowserTab } from '../../stores/tabs-store';
import {
  Menu,
  PanelRightClose,
  PanelRightOpen,
  LogOut,
  Globe,
  Copy,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { AuthModal } from '../auth/AuthModal';
import { useModeStore } from '../../stores/mode-store';
import { BrowserToolbar } from '../../browser/BrowserToolbar';
import { AddressBar } from '../../navigation/AddressBar';
import { resetLocalAppData } from '../../services/reset-local-app-data';
import './TopBar.css';

export function TopBar() {
  const { toggleNavigator, toggleInspector, isInspectorOpen } = useLayoutStore();
  const { isAuthenticated, checkAuthStatus, disconnect } = useAuthStore();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { mode, exitDemo, resetDemo } = useModeStore();

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
      navigator.clipboard.writeText(activeBrowserTab.currentUrl).catch(console.error);
    }
  }, [activeBrowserTab]);

  const handleOpenExternal = useCallback(() => {
    if (activeBrowserTab?.currentUrl) {
      window.open(activeBrowserTab.currentUrl, '_blank');
    }
  }, [activeBrowserTab]);

  return (
    <>
      <header className="top-bar glass-panel-strong">
        <div className="top-bar-left">
          <button className="icon-button" onClick={toggleNavigator}>
            <Menu size={18} />
          </button>
          <BrowserToolbar activeTab={activeBrowserTab} />
          <div className="app-title">
            <Globe size={16} />
            <span>GitHub Graph Browser</span>
          </div>
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
                <button className="auth-btn" onClick={resetDemo}>Reset Demo</button>
                <button className="icon-button" onClick={exitDemo} title="Exit Demo"><LogOut size={16} /></button>
              </>
            ) : isAuthenticated ? (
              <button className="icon-button" onClick={disconnect} title="Disconnect">
                <LogOut size={16} />
              </button>
            ) : (
              <button className="auth-btn" onClick={() => setShowAuthModal(true)}>
                Connect
              </button>
            )}
          </div>
          <div className="divider" />
          <button className="icon-button" onClick={toggleInspector}>
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
