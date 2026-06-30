import { beforeEach, describe, expect, it } from 'vitest';
import { activeNotifications, DEFAULT_NOTIFICATION_PREFERENCES, effectiveUnread, formatNotificationCount, normalizeNotifications, notificationDestination, notificationTabTitle, useNotificationStore, type NativeNotification } from './notification-store';

const record = (overrides: Partial<NativeNotification> = {}): NativeNotification => ({ id: '1', unread: true, reason: 'mention', updatedAt: '2026-01-01T00:00:00Z', subject: { title: 'Mention', type: 'Issue', apiUrl: 'https://api.github.com/repos/owner/repo/issues/2' }, repository: { fullName: 'owner/repo' }, ...overrides });

beforeEach(() => useNotificationStore.setState({ records: [], localRead: {}, snoozedUntil: {}, settings: DEFAULT_NOTIFICATION_PREFERENCES, activeAccount: undefined, syncByAccount: {}, pollingStatus: 'paused', arrivalCount: 0, arrivalActive: false, newlyArrivedIds: [], toast: undefined }));

describe('native notification state', () => {
  it('supports local-only read overrides and deterministic snoozes', () => {
    expect(effectiveUnread(record(), {})).toBe(true);
    expect(effectiveUnread(record(), { '1': true })).toBe(false);
    expect(activeNotifications([record()], { '1': '2026-01-02T00:00:00Z' }, new Date('2026-01-01').getTime())).toEqual([]);
  });
  it('keeps the newest duplicate and rejects malformed repositories', () => {
    const newer = record({ updatedAt: '2026-01-02T00:00:00Z', subject: { title: 'Newest', type: 'Issue' } });
    expect(normalizeNotifications([record(), newer, record({ repository: { fullName: 'bad' } })])).toEqual([newer]);
  });
});

describe('notification synchronization', () => {
  it('makes baseline sync silent, then emits one arrival without replaying duplicates', () => {
    const store = useNotificationStore.getState();
    expect(store.applySync('octo', [record()])).toEqual([]);
    const next = record({ id: '2', updatedAt: '2026-01-02T00:00:00Z' });
    expect(useNotificationStore.getState().applySync('octo', [next, record()])).toEqual([expect.objectContaining({ id: next.id, updatedAt: next.updatedAt })]);
    expect(useNotificationStore.getState().arrivalCount).toBe(1);
    expect(useNotificationStore.getState().applySync('octo', [next, record()])).toEqual([]);
  });
  it('aggregates arrivals from adjacent polling batches into one toast', () => {
    useNotificationStore.getState().applySync('octo', [record()]);
    const second = record({ id: '2', reason: 'assign', updatedAt: '2026-01-02T00:00:00Z' });
    const third = record({ id: '3', reason: 'review_requested', updatedAt: '2026-01-03T00:00:00Z' });
    useNotificationStore.getState().applySync('octo', [second, record()]);
    useNotificationStore.getState().applySync('octo', [third, second, record()]);
    expect(useNotificationStore.getState().toast).toMatchObject({ title: '2 new GitHub notifications', body: 'assign, review requested', recordIds: ['2', '3'] });
  });
  it('keeps fake records outside real synchronization metadata and clears only tests', () => {
    useNotificationStore.getState().applySync('octo', [record()]);
    const fake = useNotificationStore.getState().injectTestNotification();
    expect(useNotificationStore.getState().syncByAccount.octo.seen[fake.id]).toBeUndefined();
    useNotificationStore.getState().clearTestNotifications();
    expect(useNotificationStore.getState().records).toHaveLength(1);
  });
  it('isolates account switches and formats large unread counts at the UI boundary', () => {
    useNotificationStore.getState().applySync('first', [record()]);
    useNotificationStore.getState().injectTestNotification();
    useNotificationStore.getState().setActiveAccount('second');
    expect(useNotificationStore.getState().records).toEqual([]);
    expect(formatNotificationCount(100)).toBe('99+');
    expect(formatNotificationCount(3, true)).toBe('+3');
  });
});

describe('canonical notification destinations', () => {
  it('ignores a mismatched explicit repository and uses the canonical API entity', () => {
    const destination = notificationDestination(record({ destinationUrl: 'https://github.com/other/repo/issues/2' }))!;
    expect(destination).toBe('https://github.com/owner/repo/issues/2');
    expect(notificationTabTitle(record(), destination)).toBe('Issue #2');
    expect(notificationDestination(record({ destinationUrl: 'https://api.github.com/owner/repo/issues/2' }))).toBe('https://github.com/owner/repo/issues/2');
  });
});
