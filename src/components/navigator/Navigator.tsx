import { useTabsStore } from '../../stores/tabs-store';
import { useAuthStore } from '../../stores/auth-store';
import { SIDEBAR_SHORTCUTS } from '../../browser/browser-shortcuts';
import './Navigator.css';

export function Navigator() {
  const { session } = useAuthStore();
  const { openNativeTab, openBrowserTab, activeTabId, tabs } = useTabsStore();

  // Build API counts from the connected session
  let counts: Record<string, number> = {};
  if (session.status === 'connected') {
    counts = {
      repositories: session.account.repositories?.totalCount || 0,
      organizations: session.account.organizations?.totalCount || 0,
      pullRequests: session.account.pullRequests?.totalCount || 0,
      issues: session.account.issues?.totalCount || 0,
    };
  }

  const login =
    session.status === 'connected' ? session.account.login : 'user';

  // Determine which sidebar item is active based on active tab ID
  const activeTab = tabs.find(t => t.id === activeTabId);

  const handleSelect = (shortcut: typeof SIDEBAR_SHORTCUTS[number]) => {
    if (shortcut.family === 'native' && shortcut.nativeKind) {
      openNativeTab(
        shortcut.tabId,
        shortcut.nativeKind,
        shortcut.label,
        shortcut.pinned,
        !shortcut.closable ? false : shortcut.closable,
      );
    } else if (shortcut.family === 'browser' && shortcut.browserKind && shortcut.urlTemplate) {
      const targetUrl = shortcut.urlTemplate(login);
      const existingTab = tabs.find(t => t.id === shortcut.tabId);

      openBrowserTab(
        shortcut.tabId,
        shortcut.browserKind,
        shortcut.label,
        targetUrl,
        shortcut.pinned,
        shortcut.closable,
      );

      if (existingTab && existingTab.family === 'browser') {
        import('../../browser/browser-commands').then(({ browserNavigate, browserGetState }) => {
          browserGetState(shortcut.tabId).then((state) => {
            if (state.url !== targetUrl && state.url !== targetUrl + '/') {
              browserNavigate(shortcut.tabId, targetUrl).catch(console.error);
            }
          }).catch(console.error);
        });
      }
    }
  };

  // Map browser kinds to count keys for the badge display
  const kindToCountKey: Record<string, string> = {
    repositories: 'repositories',
    organizations: 'organizations',
    pullRequests: 'pullRequests',
    issues: 'issues',
  };

  return (
    <div className="navigator">
      <div className="navigator-header">
        <h3>Navigator</h3>
      </div>
      <div className="navigator-content">
        <ul className="nav-list">
          {SIDEBAR_SHORTCUTS.map(shortcut => {
            const isActive = activeTab?.id === shortcut.tabId;
            const countKey = shortcut.browserKind
              ? kindToCountKey[shortcut.browserKind]
              : undefined;

            let displayCount: string | number | null = null;
            if (
              session.status === 'checking' &&
              countKey
            ) {
              displayCount = '...';
            } else if (
              session.status === 'connected' &&
              countKey &&
              counts[countKey] !== undefined
            ) {
              displayCount = counts[countKey];
            } else if (session.status === 'error' && countKey) {
              displayCount = '!';
            }

            return (
              <li
                key={shortcut.tabId}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleSelect(shortcut)}
              >
                <span>{shortcut.label}</span>
                {displayCount !== null && (
                  <span className="badge">{displayCount}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
