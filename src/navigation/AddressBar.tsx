/**
 * AddressBar – unified search / URL input in the top bar.
 *
 * Behaviour:
 * - Shows the current URL for browser tabs, placeholder for native tabs.
 * - Enter → parse and navigate (GitHub URL, owner/repo, search query).
 * - Escape → restore to current URL.
 */

import { useState, useCallback, useRef } from 'react';
import { useTabsStore } from '../stores/tabs-store';
import { isBrowserTab } from '../browser/browser-tabs';
import { parseAddressBarInput, tabIdForUrl, titleForGithubUrl, classifyGithubUrl } from '../browser/browser-url';
import { useAuthStore } from '../stores/auth-store';

export function AddressBar() {
  const activeTabId = useTabsStore(s => s.activeTabId);
  const tabs = useTabsStore(s => s.tabs);
  const openBrowserTab = useTabsStore(s => s.openBrowserTab);

  const session = useAuthStore(s => s.session);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeBrowserTab = activeTab && isBrowserTab(activeTab) ? activeTab : null;

  const currentUrl = activeBrowserTab?.currentUrl ?? '';
  const [inputValue, setInputValue] = useState(currentUrl);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input with active tab's URL when it changes externally
  const [prevCurrentUrl, setPrevCurrentUrl] = useState(currentUrl);
  if (currentUrl !== prevCurrentUrl) {
    setPrevCurrentUrl(currentUrl);
    if (!isFocused) {
      setInputValue(currentUrl);
    }
  }

  const login =
    session.status === 'connected' ? session.account.login : undefined;

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    const result = parseAddressBarInput(trimmed);
    const tabId = tabIdForUrl(result.url, login);
    const title = titleForGithubUrl(result.url);
    const kind = classifyGithubUrl(result.url);

    // If same tab, just navigate
    if (activeBrowserTab && activeBrowserTab.id === tabId) {
      useTabsStore.getState().dispatchNavigation();
      // Let the native navigation event confirm and update the store/history
      import('../browser/browser-commands').then(({ browserNavigate }) => {
        browserNavigate(tabId, result.url).catch(console.error);
      });
    } else {
      openBrowserTab(tabId, kind, title, result.url);
    }

    inputRef.current?.blur();
  }, [inputValue, login, activeBrowserTab, openBrowserTab]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInputValue(currentUrl);
        inputRef.current?.blur();
      }
    },
    [handleSubmit, currentUrl],
  );

  const openPalette = useCallback(() => {
    if (!activeBrowserTab) window.dispatchEvent(new CustomEvent('snow-devil:open-palette', { detail: 'search' }));
  }, [activeBrowserTab]);

  const placeholder = activeBrowserTab
    ? 'Enter GitHub URL or search…'
    : 'Search GitHub or enter URL…';

  return (
    <div className="topbar-search">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (!activeBrowserTab) {
            inputRef.current?.blur();
            openPalette();
            return;
          }
          setIsFocused(true);
          // Select all on focus for easy replacement
          setTimeout(() => inputRef.current?.select(), 0);
        }}
        onBlur={() => {
          setIsFocused(false);
          // Restore to current URL if user didn't submit
          setInputValue(currentUrl);
        }}
        placeholder={activeBrowserTab ? placeholder : 'Search repositories, files, issues, pull requests…'}
        aria-label="Address bar"
        readOnly={!activeBrowserTab}
      />
    </div>
  );
}
