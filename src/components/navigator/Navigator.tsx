import { useTabsStore } from '../../stores/tabs-store';
import { useAuthStore } from '../../stores/auth-store';
import { SIDEBAR_SHORTCUTS } from '../../browser/browser-shortcuts';
import { Activity, Bell, Bookmark, Boxes, Building2, ChartNoAxesCombined, CircleUserRound, FolderGit2, Gauge, GitPullRequest, Home, LogOut, PackageSearch, Settings, SlidersHorizontal, Workflow } from 'lucide-react';
import { openSavedView, useSavedViewsStore } from '../../stores/saved-views-store';
import { activeNotifications, effectiveUnread, formatNotificationCount, useNotificationStore } from '../../stores/notification-store';
import './Navigator.css';
import { useAccountRepositories } from '../../hooks/useAccountContext';

export function Navigator() {
  const { session, disconnect } = useAuthStore();
  const { openNativeTab, openBrowserTab, activeTabId, tabs } = useTabsStore();
  const savedViews = useSavedViewsStore(state => state.views);
  const pinnedViews = savedViews.filter(view => view.pinned);
  const notificationRecords = useNotificationStore(state => state.records);
  const notificationRead = useNotificationStore(state => state.localRead);
  const notificationSnoozed = useNotificationStore(state => state.snoozedUntil);
  const unreadNotifications = activeNotifications(notificationRecords,notificationSnoozed).filter(record=>effectiveUnread(record,notificationRead)).length;
  const accountRepositories = useAccountRepositories();

  // Build API counts from the connected session
  let counts: Record<string, number> = {};
  if (session.status === 'connected') {
    counts = {
      repositories: accountRepositories.data?.length ?? session.account.repositories?.totalCount ?? 0,
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
            if (state && state.currentUrl !== targetUrl && state.currentUrl !== targetUrl + '/') {
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
  const countSemantics: Record<string, string> = {
    repositories: 'Accessible repositories: personal, organization-member, and direct collaborator access.',
    organizations: 'Active authenticated organization memberships.',
    pullRequests: 'Open pull requests authored by the connected account.',
    issues: 'Open issues assigned to the connected account.',
  };

  const icons: Record<string, React.ReactNode> = {
    'native:home': <Home size={15} />, 'native:flow': <Workflow size={15} />, 'native:ci-health': <Gauge size={15} />,
    'native:inventory': <PackageSearch size={15} />, 'native:flow-analytics': <ChartNoAxesCombined size={15} />,
    'native:personal-focus': <Activity size={15} />, 'native:account-simulator': <SlidersHorizontal size={15} />,
    'native:repository-simulator': <Boxes size={15} />, 'native:settings': <Settings size={15} />,
    'native:worktree-environments': <GitPullRequest size={15} />,
    'github:profile': <CircleUserRound size={15} />, 'github:repositories': <FolderGit2 size={15} />,
    'github:pull-requests': <GitPullRequest size={15} />, 'github:issues': <PackageSearch size={15} />,
    'native:notifications': <Bell size={15} />, 'native:organizations': <Building2 size={15} />,
  };

  const navigation = SIDEBAR_SHORTCUTS.filter(shortcut => shortcut.family === 'native' && !['native:notifications', 'native:organizations'].includes(shortcut.tabId));
  const management = SIDEBAR_SHORTCUTS.filter(shortcut => ['native:notifications', 'native:organizations'].includes(shortcut.tabId) || shortcut.family === 'browser' && shortcut.tabId !== 'github:profile');

  const renderGroup = (label: string, shortcuts: typeof SIDEBAR_SHORTCUTS) => <section className="navigator-group" aria-label={label}>
    <h4>{label}</h4>
    <ul className="nav-list">{shortcuts.map(shortcut => {
      const isActive = activeTab?.id === shortcut.tabId;
      const countKey = shortcut.tabId === 'native:organizations' ? 'organizations' : shortcut.browserKind ? kindToCountKey[shortcut.browserKind] : undefined;
      let displayCount: string | number | null = null;
      if(shortcut.tabId==='native:notifications')displayCount=formatNotificationCount(unreadNotifications);
      else if (session.status === 'checking' && countKey) displayCount = '…';
      else if (session.status === 'connected' && countKey && counts[countKey] !== undefined) displayCount = counts[countKey];
      else if (session.status === 'error' && countKey) displayCount = '!';
      const unavailableOrganizations = shortcut.tabId === 'native:organizations' && session.status === 'connected' && session.account.organizations?.status === 'unavailable';
      const partialOrganizations = shortcut.tabId === 'native:organizations' && session.status === 'connected' && session.account.organizations?.status === 'partial';
      if (unavailableOrganizations) displayCount = '!';
      if (partialOrganizations) displayCount = `${counts.organizations ?? 0}+`;
      return <li key={shortcut.tabId}><button className={`nav-item ${isActive ? 'active' : ''}`} data-tooltip={unavailableOrganizations || partialOrganizations ? session.status === 'connected' ? session.account.organizations?.message : undefined : countKey ? countSemantics[countKey] : `${shortcut.label}\nOpen or activate this Snow Devil workspace.`} onClick={() => handleSelect(shortcut)} aria-current={isActive ? 'page' : undefined}><span className="nav-item__label">{icons[shortcut.tabId]}<span>{shortcut.label}</span></span>{displayCount !== null && <span className="badge">{displayCount}</span>}</button></li>;
    })}</ul>
  </section>;

  return (
    <div className="navigator">
      <div className="navigator-content">
        {renderGroup('Navigation', navigation)}
        {renderGroup('Management', management)}
        {pinnedViews.length>0&&<section className="navigator-group" aria-label="Saved views"><h4>Saved views</h4><ul className="nav-list">{pinnedViews.map(view=><li key={view.id}><button className={`nav-item ${activeTabId===`native:saved-view:${view.id}`?'active':''}`} onClick={()=>openSavedView(view)}><span className="nav-item__label"><Bookmark size={15}/><span>{view.name}</span></span></button></li>)}</ul></section>}
      </div>
      <footer className="navigator-account">
        {session.status === 'connected' ? <>
          <button className="navigator-account__identity" onClick={() => handleSelect(SIDEBAR_SHORTCUTS.find(shortcut => shortcut.tabId === 'github:profile')!)} data-tooltip="GitHub account\nOpen the connected account profile.">
            <img src={session.account.avatarUrl} alt="" /><span><strong>{session.account.name || session.account.login}</strong><small>@{session.account.login}</small></span><i aria-label="Online" />
          </button>
          <button className="navigator-account__action" aria-label="Sign out" data-tooltip="Sign out\nDisconnect GitHub and clear account-scoped runtime state." onClick={() => void disconnect()}><LogOut size={14} /></button>
        </> : <div className="navigator-account__disconnected"><CircleUserRound size={24} /><span><strong>GitHub account</strong><small>{session.status === 'checking' ? 'Checking connection…' : 'Not connected'}</small></span></div>}
      </footer>
    </div>
  );
}
