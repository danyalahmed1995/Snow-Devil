import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { canonicalRepositoryIdentity } from '../lib/canonical-identity';
import { safeExternalUrl } from '../lib/browser-actions';

export interface NativeNotification {
  id: string;
  unread: boolean;
  reason: string;
  updatedAt: string;
  lastReadAt?: string;
  subject: { title: string; type: string; apiUrl?: string; latestCommentUrl?: string };
  repository: { fullName: string; htmlUrl?: string };
  accountLogin?: string;
  destinationUrl?: string;
  isTestNotification?: boolean;
  source?: 'github' | 'development-simulator' | 'ci-watcher';
}

export interface NotificationPreferences {
  inAppAlerts: boolean;
  sounds: boolean;
  desktopNotifications: boolean;
  notifyWhileFocused: boolean;
  reviewRequests: boolean;
  assignments: boolean;
  mentions: boolean;
  ciActivity: boolean;
  subscribedUpdates: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  inAppAlerts: true,
  sounds: true,
  desktopNotifications: false,
  notifyWhileFocused: true,
  reviewRequests: true,
  assignments: true,
  mentions: true,
  ciActivity: true,
  subscribedUpdates: true,
};

export interface NotificationSyncMetadata {
  initialized: boolean;
  seen: Record<string, string>;
  etag?: string;
  lastModified?: string;
  lastSuccessAt?: string;
  pollIntervalMs: number;
}

export type NotificationPollingStatus = 'paused' | 'checking' | 'ready' | 'offline' | 'rate_limited' | 'authentication_failed' | 'error';

export interface NotificationToast {
  id: string;
  title: string;
  body: string;
  recordIds: string[];
  reasons: string[];
}

interface SyncValidators {
  /** Null explicitly clears an unusable persisted validator. */
  etag?: string | null;
  lastModified?: string;
  pollIntervalMs?: number;
  checkedAt?: string;
}

interface NotificationStore {
  records: NativeNotification[];
  localRead: Record<string, boolean>;
  snoozedUntil: Record<string, string>;
  settings: NotificationPreferences;
  activeAccount?: string;
  syncByAccount: Record<string, NotificationSyncMetadata>;
  pollingStatus: NotificationPollingStatus;
  pollingMessage?: string;
  arrivalCount: number;
  arrivalActive: boolean;
  newlyArrivedIds: string[];
  toast?: NotificationToast;
  setActiveAccount: (login?: string) => void;
  applySync: (login: string, records: NativeNotification[], validators?: SyncValidators, allowArrival?: boolean) => NativeNotification[];
  markPollSuccess: (login: string, validators?: SyncValidators) => void;
  setPollingStatus: (status: NotificationPollingStatus, message?: string) => void;
  updateSettings: (settings: Partial<NotificationPreferences>) => void;
  setRead: (id: string, read: boolean) => void;
  snooze: (id: string, until: string) => void;
  injectTestNotification: () => NativeNotification;
  clearTestNotifications: () => void;
  settleArrival: () => void;
  dismissToast: () => void;
}

export function migrateNotificationState(persisted: unknown, version: number): unknown {
  if (version >= 6 || !persisted || typeof persisted !== 'object') return persisted;
  const saved = persisted as Partial<NotificationStore>;
  const syncByAccount = Object.fromEntries(Object.entries(saved.syncByAccount ?? {}).map(([account, metadata]) => [account, {
    ...metadata,
    // Earlier versions may have accepted a false 304 from GitHub and
    // advanced Last-Modified without receiving the corresponding records.
    etag: undefined,
    lastModified: undefined,
  }]));
  return { ...saved, syncByAccount };
}

const MAX_RECORDS = 300;
const MAX_SEEN = 500;
const MAX_NEW_IDS = 50;
const MAX_LOCAL_STATE = 500;
const MAX_ACCOUNTS = 8;

/** Newest record wins; stable GitHub thread IDs prevent duplicate counters and routes. */
export function normalizeNotifications(records: NativeNotification[]): NativeNotification[] {
  const unique = new Map<string, NativeNotification>();
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 128 || typeof record.reason !== 'string' || typeof record.updatedAt !== 'string' || typeof record.subject?.title !== 'string' || !record.subject.title.trim() || typeof record.subject.type !== 'string' || typeof record.repository?.fullName !== 'string') continue;
    if (!Number.isFinite(Date.parse(record.updatedAt))) continue;
    try { canonicalRepositoryIdentity(record.repository.fullName); } catch { continue; }
    const normalized = { ...record, unread: Boolean(record.unread), reason: record.reason.slice(0, 64), subject: { ...record.subject, title: record.subject.title.trim().slice(0, 500), type: record.subject.type.slice(0, 64) } };
    const previous = unique.get(record.id);
    if (!previous || Date.parse(record.updatedAt) >= Date.parse(previous.updatedAt)) unique.set(record.id, normalized);
  }
  return [...unique.values()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, MAX_RECORDS);
}

function seenMarker(record: NativeNotification): string {
  return `${record.updatedAt}|${record.unread ? 'unread' : 'read'}`;
}

function boundedSeen(previous: Record<string, string>, records: NativeNotification[]): Record<string, string> {
  const merged = new Map(Object.entries(previous));
  for (const record of records) merged.set(record.id, seenMarker(record));
  return Object.fromEntries([...merged.entries()].sort((left, right) => right[1].localeCompare(left[1])).slice(0, MAX_SEEN));
}

function boundedEntry<T>(previous: Record<string, T>, id: string, value: T, maximum = MAX_LOCAL_STATE): Record<string, T> {
  const entries = new Map(Object.entries(previous));
  entries.delete(id);
  entries.set(id, value);
  return Object.fromEntries([...entries.entries()].slice(-maximum));
}

export function notificationAllowed(record: NativeNotification, settings: NotificationPreferences): boolean {
  if (record.reason === 'review_requested') return settings.reviewRequests;
  if (record.reason === 'assign' || record.reason === 'assigned') return settings.assignments;
  if (record.reason === 'mention' || record.reason === 'team_mention') return settings.mentions;
  if (record.reason === 'ci_activity') return settings.ciActivity;
  return settings.subscribedUpdates;
}

export function notificationDestination(record: NativeNotification): string | null {
  const repository = (() => { try { return canonicalRepositoryIdentity(record.repository.fullName); } catch { return null; } })();
  if (!repository) return null;
  const explicit = safeExternalUrl(record.destinationUrl);
  if (explicit && new URL(explicit).hostname === 'github.com') {
    const parts = new URL(explicit).pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && `${parts[0]}/${parts[1]}`.toLowerCase() === repository) return explicit;
  }
  const api = record.subject.apiUrl;
  if (api) {
    const match = /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/(issues|pulls)\/(\d+)(?:\/.*)?$/.exec(api);
    if (match && `${match[1]}/${match[2]}`.toLowerCase() === repository) {
      return `https://github.com/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}/${match[3] === 'pulls' ? 'pull' : 'issues'}/${match[4]}`;
    }
  }
  const repositoryUrl = safeExternalUrl(record.repository.htmlUrl);
  if (repositoryUrl && new URL(repositoryUrl).hostname === 'github.com') {
    const parts = new URL(repositoryUrl).pathname.split('/').filter(Boolean);
    if (parts.length === 2 && `${parts[0]}/${parts[1]}`.toLowerCase() === repository) return repositoryUrl;
  }
  return `https://github.com/${repository.split('/').map(encodeURIComponent).join('/')}`;
}

export function notificationTabTitle(record: NativeNotification, destination: string): string {
  try {
    const parts = new URL(destination).pathname.split('/').filter(Boolean);
    if (parts[2] === 'pull' && /^\d+$/.test(parts[3] ?? '')) return `PR #${parts[3]}`;
    if (parts[2] === 'issues' && /^\d+$/.test(parts[3] ?? '')) return `Issue #${parts[3]}`;
  } catch { /* Destination validation owns malformed URL handling. */ }
  return record.subject.title;
}

function toastFor(arrivals: NativeNotification[]): NotificationToast | undefined {
  if (!arrivals.length) return undefined;
  if (arrivals.length === 1) return {
    id: `arrival:${arrivals[0].id}:${arrivals[0].updatedAt}`,
    title: arrivals[0].reason.replace(/_/g, ' '),
    body: `${arrivals[0].repository.fullName} · ${arrivals[0].subject.title}`,
    recordIds: [arrivals[0].id],
    reasons: [arrivals[0].reason.replace(/_/g, ' ')],
  };
  const reasons = [...new Set(arrivals.map(record => record.reason.replace(/_/g, ' ')))].slice(0, 3);
  return { id: `arrival:${Date.now()}`, title: `${arrivals.length} new GitHub notifications`, body: reasons.join(', '), recordIds: arrivals.map(record => record.id), reasons };
}

function aggregateToast(current: NotificationToast | undefined, arrivals: NativeNotification[]): NotificationToast | undefined {
  if (!current) return toastFor(arrivals);
  const ids = [...new Set([...current.recordIds, ...arrivals.map(record => record.id)])].slice(0, MAX_NEW_IDS);
  if (ids.length === 1) return toastFor(arrivals) ?? current;
  const reasons = [...new Set([
    ...current.reasons,
    ...arrivals.map(record => record.reason.replace(/_/g, ' ')),
  ])].slice(0, 3);
  return { id: `arrival:${Date.now()}`, title: `${ids.length} new GitHub notifications`, body: reasons.join(', '), recordIds: ids, reasons };
}

function createTestNotification(): NativeNotification {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id: `dev-notification-${uuid}`,
    unread: true,
    reason: 'review_requested',
    updatedAt: new Date().toISOString(),
    subject: { title: 'Development notification arrival', type: 'PullRequest', apiUrl: 'https://api.github.com/repos/nova-labs/snow-devil/pulls/184' },
    repository: { fullName: 'nova-labs/snow-devil', htmlUrl: 'https://github.com/nova-labs/snow-devil' },
    destinationUrl: 'https://github.com/nova-labs/snow-devil/pull/184',
    isTestNotification: true,
    source: 'development-simulator',
  };
}

export const useNotificationStore = create<NotificationStore>()(persist((set, get) => ({
  records: [], localRead: {}, snoozedUntil: {}, settings: DEFAULT_NOTIFICATION_PREFERENCES,
  syncByAccount: {}, pollingStatus: 'paused', arrivalCount: 0, arrivalActive: false, newlyArrivedIds: [],
  setActiveAccount: login => set(state => {
    const normalized = login?.toLowerCase();
    if (state.activeAccount === normalized) return state;
    return {
      activeAccount: normalized,
      records: normalized ? state.records.filter(record => record.accountLogin?.toLowerCase() === normalized) : [],
      localRead: {}, snoozedUntil: {}, arrivalCount: 0, arrivalActive: false, newlyArrivedIds: [], toast: undefined,
      pollingStatus: normalized ? 'checking' : 'paused', pollingMessage: undefined,
    };
  }),
  applySync: (login, incoming, validators = {}, allowArrival = true) => {
    const account = login.toLowerCase();
    const state = get();
    const previousMeta = state.syncByAccount[account] ?? { initialized: false, seen: {}, pollIntervalMs: 60_000 };
    const real = normalizeNotifications(incoming.map(record => ({ ...record, accountLogin: account, source: record.source ?? 'github' })));
    const newlyUnread = real.filter(record => {
      if (!record.unread) return false;
      const previous = previousMeta.seen[record.id];
      if (!previous) return true;
      const [previousUpdated] = previous.split('|');
      // GitHub reuses a notification thread ID for later comments and mentions.
      // An already-unread thread must still alert when its updated timestamp advances.
      return record.unread && record.updatedAt > previousUpdated;
    });
    const arrivals = previousMeta.initialized && allowArrival ? newlyUnread.filter(record => notificationAllowed(record, state.settings)) : [];
    const unreadResetIds = new Set([
      ...newlyUnread.map(record => record.id),
      ...real.filter(record => record.unread && state.localRead[record.id] === true && (!record.lastReadAt || record.updatedAt > record.lastReadAt)).map(record => record.id),
    ]);
    const tests = state.records.filter(record => record.isTestNotification);
    const sync: NotificationSyncMetadata = {
      initialized: true,
      seen: boundedSeen(previousMeta.seen, real),
      etag: validators.etag === null ? undefined : validators.etag ?? previousMeta.etag,
      lastModified: validators.lastModified ?? previousMeta.lastModified,
      lastSuccessAt: validators.checkedAt ?? new Date().toISOString(),
      pollIntervalMs: Math.max(60_000, validators.pollIntervalMs ?? previousMeta.pollIntervalMs),
    };
    set(current => ({
      records: normalizeNotifications([...tests, ...real]),
      // A local read override belongs to the previous version of a GitHub thread.
      // New unread activity on that reused thread ID must restore the unread badge.
      localRead: unreadResetIds.size ? Object.fromEntries(Object.entries(current.localRead).filter(([id]) => !unreadResetIds.has(id))) : current.localRead,
      syncByAccount: boundedEntry(current.syncByAccount, account, sync, MAX_ACCOUNTS),
      pollingStatus: 'ready', pollingMessage: undefined,
      ...(arrivals.length ? {
        arrivalCount: current.arrivalCount + arrivals.length,
        arrivalActive: true,
        newlyArrivedIds: [...new Set([...arrivals.map(record => record.id), ...current.newlyArrivedIds])].slice(0, MAX_NEW_IDS),
        toast: current.settings.inAppAlerts ? aggregateToast(current.toast, arrivals) : current.toast,
      } : {}),
    }));
    return arrivals;
  },
  markPollSuccess: (login, validators = {}) => set(state => {
    const account = login.toLowerCase();
    const previous = state.syncByAccount[account] ?? { initialized: true, seen: {}, pollIntervalMs: 60_000 };
    return { pollingStatus: 'ready', pollingMessage: undefined, syncByAccount: boundedEntry(state.syncByAccount, account, { ...previous, initialized: true, etag: validators.etag === null ? undefined : validators.etag ?? previous.etag, lastModified: validators.lastModified ?? previous.lastModified, lastSuccessAt: validators.checkedAt ?? new Date().toISOString(), pollIntervalMs: Math.max(60_000, validators.pollIntervalMs ?? previous.pollIntervalMs) }, MAX_ACCOUNTS) };
  }),
  setPollingStatus: (pollingStatus, pollingMessage) => set({ pollingStatus, pollingMessage }),
  updateSettings: settings => set(state => ({ settings: { ...state.settings, ...settings } })),
  setRead: (id, read) => set(state => ({ localRead: boundedEntry(state.localRead, id, read) })),
  snooze: (id, until) => set(state => ({ snoozedUntil: boundedEntry(state.snoozedUntil, id, until) })),
  injectTestNotification: () => {
    const record = createTestNotification();
    set(state => ({ records: normalizeNotifications([record, ...state.records]), arrivalCount: state.arrivalCount + 1, arrivalActive: true, newlyArrivedIds: [record.id, ...state.newlyArrivedIds].slice(0, MAX_NEW_IDS), toast: state.settings.inAppAlerts ? aggregateToast(state.toast, [record]) : state.toast }));
    return record;
  },
  clearTestNotifications: () => set(state => ({ records: state.records.filter(record => !record.isTestNotification), arrivalCount: 0, arrivalActive: false, newlyArrivedIds: state.newlyArrivedIds.filter(id => !id.startsWith('dev-notification-')), toast: state.toast?.recordIds.some(id => id.startsWith('dev-notification-')) ? undefined : state.toast })),
  settleArrival: () => set({ arrivalCount: 0, arrivalActive: false, newlyArrivedIds: [] }),
  dismissToast: () => set({ toast: undefined }),
}), {
  name: 'snow-devil-notifications',
  version: 6,
  migrate: migrateNotificationState,
  partialize: state => ({
    records: state.records.filter(record => !record.isTestNotification).slice(0, MAX_RECORDS),
    localRead: state.localRead,
    snoozedUntil: state.snoozedUntil,
    settings: state.settings,
    activeAccount: state.activeAccount,
    syncByAccount: state.syncByAccount,
  }),
  merge: (persisted, current) => {
    const saved = persisted as Partial<NotificationStore>;
    return { ...current, ...saved, records: normalizeNotifications((saved.records ?? []).filter(record => !record.isTestNotification)), localRead: Object.fromEntries(Object.entries(saved.localRead ?? {}).slice(-MAX_LOCAL_STATE)), snoozedUntil: Object.fromEntries(Object.entries(saved.snoozedUntil ?? {}).slice(-MAX_LOCAL_STATE)), syncByAccount: Object.fromEntries(Object.entries(saved.syncByAccount ?? {}).slice(-MAX_ACCOUNTS)), settings: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...saved.settings }, arrivalCount: 0, arrivalActive: false, newlyArrivedIds: [], toast: undefined, pollingStatus: 'paused' };
  },
}));

export const effectiveUnread = (record: NativeNotification, localRead: Record<string, boolean>) => localRead[record.id] === undefined ? record.unread : !localRead[record.id];
export const activeNotifications = (records: NativeNotification[], snoozed: Record<string, string>, now = Date.now()) => records.filter(record => !snoozed[record.id] || new Date(snoozed[record.id]).getTime() <= now);
export const formatNotificationCount = (count: number, arrival = false) => `${arrival ? '+' : ''}${count > 99 ? '99+' : Math.max(0, count)}`;
