import { invoke } from '@tauri-apps/api/core';
import { Bell, X } from 'lucide-react';
import { useEffect } from 'react';
import { isNotificationApiPage, normalizeApiNotifications, normalizeNotificationEtag, notificationRetryDelay, type NotificationPollResponse } from '../../services/notification-api';
import { notificationNavigationTarget } from '../../services/notification-navigation';
import { playNotificationSound, releaseNotificationSound } from '../../services/notification-sound';
import { useAuthStore } from '../../stores/auth-store';
import { useModeStore } from '../../stores/mode-store';
import { useNotificationStore, type NativeNotification } from '../../stores/notification-store';
import { useTabsStore } from '../../stores/tabs-store';
import './NotificationRuntime.css';

export const DEMO_NOTIFICATIONS: NativeNotification[] = [
  { id: 'demo-review', unread: true, reason: 'review_requested', updatedAt: '2026-02-15T10:30:00Z', subject: { title: 'Improve repository explorer performance', type: 'PullRequest', apiUrl: 'https://api.github.com/repos/nova-labs/snow-devil/pulls/42' }, repository: { fullName: 'nova-labs/snow-devil', htmlUrl: 'https://github.com/nova-labs/snow-devil' } },
  { id: 'demo-ci', unread: true, reason: 'ci_activity', updatedAt: '2026-02-15T09:20:00Z', subject: { title: 'Checks failed on feature/search', type: 'CheckSuite' }, repository: { fullName: 'nova-labs/snow-devil', htmlUrl: 'https://github.com/nova-labs/snow-devil' } },
  { id: 'demo-mention', unread: false, reason: 'mention', updatedAt: '2026-02-14T18:10:00Z', subject: { title: 'Document evidence confidence', type: 'Issue', apiUrl: 'https://api.github.com/repos/nova-labs/snow-devil/issues/92' }, repository: { fullName: 'nova-labs/snow-devil', htmlUrl: 'https://github.com/nova-labs/snow-devil' } },
];

function ignoresSimulatorShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input,textarea,select,button,[contenteditable="true"],.cm-editor,[data-embedded-github],webview'));
}

export function shouldHandleNotificationShortcut(event: Pick<KeyboardEvent, 'key' | 'code' | 'repeat' | 'shiftKey' | 'target'>): boolean {
  const focused = typeof document === 'undefined' ? null : document.activeElement;
  return !event.repeat && (event.code === 'Space' || event.key === ' ') && !ignoresSimulatorShortcut(event.target) && !ignoresSimulatorShortcut(focused);
}

export function notificationSimulatorEnabled(development = import.meta.env.DEV): boolean { return development; }

export function NotificationRuntime() {
  const session = useAuthStore(state => state.session);
  const mode = useModeStore(state => state.mode);
  const toast = useNotificationStore(state => state.toast);
  const dismissToast = useNotificationStore(state => state.dismissToast);
  const account = mode === 'demo' ? 'demo' : session.status === 'connected' ? session.account.login : undefined;

  useEffect(() => {
    if (!notificationSimulatorEnabled()) return;
    let settleTimer: number | undefined;
    const keyDown = (event: KeyboardEvent) => {
      if (!shouldHandleNotificationShortcut(event)) return;
      event.preventDefault();
      if (event.shiftKey) useNotificationStore.getState().clearTestNotifications();
      else {
        useNotificationStore.getState().injectTestNotification();
        if (useNotificationStore.getState().settings.sounds) playNotificationSound();
        if (settleTimer !== undefined) window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(() => useNotificationStore.getState().settleArrival(), 3800);
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => { window.removeEventListener('keydown', keyDown); if (settleTimer !== undefined) window.clearTimeout(settleTimer); };
  }, []);

  useEffect(() => {
    const generation = Date.now() + Math.random();
    let currentGeneration = generation;
    let disposed = false;
    let timer: number | undefined;
    let settleTimer: number | undefined;
    let inFlight = false;
    let failures = 0;
    const store = useNotificationStore.getState();
    if (!account) {
      if (session.status !== 'checking') store.setActiveAccount(undefined);
      store.setPollingStatus('paused');
      return () => { currentGeneration = 0; };
    }
    store.setActiveAccount(account);
    if (mode === 'demo') {
      store.applySync(account, DEMO_NOTIFICATIONS, { checkedAt: new Date().toISOString(), pollIntervalMs: 300_000 }, false);
      return () => { currentGeneration = 0; };
    }

    const schedule = (delay: number) => {
      if (disposed) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), delay);
    };
    const poll = async (requested = false) => {
      if (disposed || inFlight || currentGeneration !== generation) return;
      const state = useNotificationStore.getState();
      const metadata = state.syncByAccount[account];
      const minimum = metadata?.pollIntervalMs ?? 60_000;
      if (requested && metadata?.lastSuccessAt) {
        const remaining = minimum - (Date.now() - Date.parse(metadata.lastSuccessAt));
        if (remaining > 0) { schedule(remaining); return; }
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        state.setPollingStatus('offline', 'Waiting for connectivity');
        schedule(Math.max(120_000, minimum));
        return;
      }
      inFlight = true;
      state.setPollingStatus('checking');
      try {
        const response = await invoke<NotificationPollResponse>('poll_github_notifications', { etag: metadata?.etag ?? null, lastModified: metadata?.lastModified ?? null });
        if (disposed || currentGeneration !== generation || useNotificationStore.getState().activeAccount !== account.toLowerCase()) return;
        const validators = { etag: normalizeNotificationEtag(response.etag), lastModified: response.lastModified, pollIntervalMs: Math.max(60_000, (response.pollIntervalSeconds || 60) * 1000), checkedAt: new Date().toISOString() };
        if (response.status === 304) useNotificationStore.getState().markPollSuccess(account, validators);
        else if (response.status >= 200 && response.status < 300) {
          if (!isNotificationApiPage(response.body)) throw new Error('notification_response_invalid');
          const normalized = normalizeApiNotifications(response.body);
          if (response.body.length > 0 && normalized.length === 0) throw new Error('notification_response_invalid');
          const allowArrival = useNotificationStore.getState().settings.notifyWhileFocused || !document.hasFocus();
          const arrivals = useNotificationStore.getState().applySync(account, normalized, validators, allowArrival);
          if (arrivals.length) {
            if (useNotificationStore.getState().settings.sounds) playNotificationSound();
            if (settleTimer !== undefined) window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(() => useNotificationStore.getState().settleArrival(), 3800);
          }
        } else if (response.status === 401) useNotificationStore.getState().setPollingStatus('authentication_failed', 'Reconnect GitHub to resume notifications');
        else if (response.status === 403 || response.status === 429 || response.rateRemaining === 0) useNotificationStore.getState().setPollingStatus('rate_limited', 'GitHub notification polling is rate limited');
        else throw new Error(`notification_http_${response.status}`);
        failures = 0;
        const latest = useNotificationStore.getState().syncByAccount[account.toLowerCase()]?.pollIntervalMs ?? minimum;
        schedule(response.status === 401 ? 5 * 60_000 : response.status === 403 || response.status === 429 ? notificationRetryDelay(2, latest, response.rateReset) : latest);
      } catch (cause) {
        if (disposed) return;
        failures += 1;
        const message = String(cause);
        const offline = message.includes('network') || message.includes('offline');
        useNotificationStore.getState().setPollingStatus(offline ? 'offline' : message.includes('authentication') ? 'authentication_failed' : 'error', offline ? 'Waiting for connectivity' : 'Notification refresh failed; the previous snapshot remains visible');
        schedule(notificationRetryDelay(failures, minimum));
      } finally {
        inFlight = false;
      }
    };
    const requestPoll = () => void poll(true);
    window.addEventListener('focus', requestPoll);
    window.addEventListener('online', requestPoll);
    window.addEventListener('snow-devil:notification-refresh', requestPoll);
    schedule(0);
    return () => {
      disposed = true;
      currentGeneration = 0;
      if (timer !== undefined) window.clearTimeout(timer);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      window.removeEventListener('focus', requestPoll);
      window.removeEventListener('online', requestPoll);
      window.removeEventListener('snow-devil:notification-refresh', requestPoll);
    };
  }, [account, mode, session.status]);

  useEffect(() => () => { void releaseNotificationSound(); }, []);

  if (!toast) return null;
  const open = () => {
    const record = useNotificationStore.getState().records.find(value => value.id === toast.recordIds[0]);
    const target = record ? notificationNavigationTarget(record) : null;
    if (target?.family === 'native-pr') useTabsStore.getState().openNativeTab(target.id, 'pullRequestDiff', target.title, false, true, { type: 'pullRequest', repository: target.repository, number: target.number });
    else if (target) useTabsStore.getState().openBrowserTab(target.id, target.kind, target.title, target.url, false, true);
    dismissToast();
  };
  return <aside className="notification-arrival-toast" role="status" aria-live="polite"><button className="notification-arrival-main" onClick={open}><Bell size={15}/><span><strong>{toast.title}</strong><small>{toast.body}</small></span></button><button aria-label="Dismiss notification alert" onClick={dismissToast}><X size={13}/></button></aside>;
}
