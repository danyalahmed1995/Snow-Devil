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
  // While focused the user edits `inputValue`; while not focused we always show the
  // active tab's current URL (so external navigations are reflected without an effect).
  const [inputValue, setInputValue] = useState(currentUrl);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = isFocused ? inputValue : currentUrl;

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

  const placeholder = activeBrowserTab
    ? 'Enter GitHub URL or search…'
    : 'Search GitHub or enter URL…';

  return (
    <div className="topbar-search">
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          // Seed the editable value from the current URL, then select for easy replacement.
          setInputValue(currentUrl);
          setIsFocused(true);
          setTimeout(() => inputRef.current?.select(), 0);
        }}
        onBlur={() => {
          setIsFocused(false);
        }}
        placeholder={placeholder}
        aria-label="Address bar"
      />
    </div>
  );
}
