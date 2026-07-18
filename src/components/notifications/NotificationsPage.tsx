import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bell, Clock3, Copy, ExternalLink, Filter, RefreshCw, Search } from 'lucide-react';
import { activeNotifications, effectiveUnread, notificationDestination, useNotificationStore, type NativeNotification } from '../../stores/notification-store';
import { notificationNavigationTarget } from '../../services/notification-navigation';
import { useTabsStore } from '../../stores/tabs-store';
import { Select } from '../ui/Select';
import './NotificationsPage.css';

export function NotificationsPage() {
  const records = useNotificationStore(state => state.records);
  const localRead = useNotificationStore(state => state.localRead);
  const snoozed = useNotificationStore(state => state.snoozedUntil);
  const newlyArrivedIds = useNotificationStore(state => state.newlyArrivedIds);
  const pollingStatus = useNotificationStore(state => state.pollingStatus);
  const pollingMessage = useNotificationStore(state => state.pollingMessage);
  const setRead = useNotificationStore(state => state.setRead);
  const snooze = useNotificationStore(state => state.snooze);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [writeStatus, setWriteStatus] = useState<Record<string, string>>({});
  const visible = useMemo(() => activeNotifications(records, snoozed).filter(record =>
    (filter === 'all' || filter === 'unread' && effectiveUnread(record, localRead) || record.reason === filter)
    && `${record.subject.title} ${record.repository.fullName} ${record.reason}`.toLowerCase().includes(search.toLowerCase()),
  ), [filter, localRead, records, search, snoozed]);
  const reasons = [...new Set(records.map(record => record.reason))].sort();
  const open = (record: NativeNotification) => {
    const target = notificationNavigationTarget(record);
    if (!target) return;
    useTabsStore.getState().openBrowserTab(target.id, target.kind, target.title, target.url, false, true);
  };
  const statusLabel = pollingStatus === 'checking' ? 'Checking GitHub…' : pollingStatus === 'ready' ? 'Background polling active' : pollingMessage ?? pollingStatus.replace(/_/g, ' ');
  const markRead = async (record: NativeNotification, unread: boolean) => {
    if (!unread) { setRead(record.id, false); return; }
    if (record.isTestNotification || !/^\d+$/.test(record.id)) { setRead(record.id, true); setWriteStatus(state => ({ ...state, [record.id]: 'Marked read locally.' })); return; }
    setWriteStatus(state => ({ ...state, [record.id]: 'Updating GitHub…' }));
    try {
      await invoke('mark_github_notification_read', { threadId: record.id });
      setRead(record.id, true);
      setWriteStatus(state => ({ ...state, [record.id]: 'Marked read on GitHub.' }));
    } catch {
      setWriteStatus(state => ({ ...state, [record.id]: 'GitHub rejected the update; read state was unchanged.' }));
    }
  };

  return <main className="notifications-page">
    <header><div><span>Personal inbox</span><h1><Bell size={19}/>Notifications</h1><p>GitHub activity synchronized in the background while Snow Devil is open.</p></div><div className="notifications-controls"><span className={`notification-poll-status notification-poll-status--${pollingStatus}`}>{statusLabel}</span><button aria-label="Refresh notifications" data-tooltip="Refresh notifications\nChecks GitHub now when the server-provided minimum polling interval allows." onClick={() => window.dispatchEvent(new Event('snow-devil:notification-refresh'))}><RefreshCw size={13}/></button><label><Search size={13}/><input aria-label="Search notifications" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search notifications"/></label><Filter size={13}/><Select ariaLabel="Notification filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All active' }, { value: 'unread', label: 'Unread' }, ...reasons.map(reason => ({ value: reason, label: reason.replace(/_/g, ' ') }))]}/></div></header>
    {import.meta.env.DEV && <p className="notification-dev-hint">Space: simulate notification · Shift+Space: clear test notifications</p>}
    <section className="notifications-list" aria-label={`${visible.length} notifications`}>{visible.map(record => {
      const unread = effectiveUnread(record, localRead);
      const url = notificationDestination(record);
      return <article className={`${unread ? 'is-unread ' : ''}${newlyArrivedIds.includes(record.id) ? 'is-new ' : ''}${record.isTestNotification ? 'is-test' : ''}`} key={record.id}>
        <button className="notification-main" onClick={() => open(record)} data-tooltip={`${record.subject.title}\n${record.repository.fullName} · Open the canonical ${record.subject.type.toLowerCase()} destination in Snow Devil.`}><i/><span><strong>{record.subject.title}{record.isTestNotification && <em>Development test</em>}</strong><small>{record.repository.fullName} · {record.reason.replace(/_/g, ' ')} · {new Date(record.updatedAt).toLocaleString()}</small></span></button>
        <div><button data-tooltip={unread && !record.isTestNotification && /^\d+$/.test(record.id) ? 'Mark read on GitHub\nUses the notification authorization and changes GitHub only after a successful response.' : 'Local read state\nChanges only Snow Devil.'} onClick={() => void markRead(record, unread)}>{unread && !record.isTestNotification && /^\d+$/.test(record.id) ? 'Mark read on GitHub' : unread ? 'Mark read locally' : 'Mark unread locally'}</button><button data-tooltip="Snooze locally\nHides this row in Snow Devil for four hours without changing GitHub." onClick={() => snooze(record.id, new Date(Date.now() + 4 * 3600000).toISOString())}><Clock3 size={12}/>Snooze 4h</button>{url && <><button aria-label="Copy notification link" data-tooltip="Copy canonical GitHub link" onClick={() => navigator.clipboard.writeText(url)}><Copy size={12}/></button><button aria-label="Open notification in Snow Devil" data-tooltip="Open canonical destination in a Snow Devil tab" onClick={() => open(record)}><ExternalLink size={12}/></button></>}<span className="sr-only" aria-live="polite">{writeStatus[record.id]}</span></div>
      </article>;
    })}{visible.length === 0 && <div className="notifications-state"><strong>No active notifications</strong><span>Change the filter or wait for the next background synchronization.</span></div>}</section>
  </main>;
}
