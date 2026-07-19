import { describe, expect, it, vi } from 'vitest';
import { isNotificationApiPage, normalizeApiNotifications, normalizeNotificationEtag, notificationRetryDelay } from './notification-api';

describe('notification API normalization and backoff', () => {
  it('normalizes valid GitHub threads and rejects partial records', () => {
    expect(isNotificationApiPage([])).toBe(true);
    expect(isNotificationApiPage(null)).toBe(false);
    expect(normalizeApiNotifications([{ id: '1', unread: true, updated_at: '2026-01-01T00:00:00Z', subject: { title: 'Review', type: 'PullRequest' }, repository: { full_name: 'octo/app' } }, { id: 'bad' }])).toHaveLength(1);
  });
  it('clears GitHub empty ETags without changing real validators', () => {
    expect(normalizeNotificationEtag('""')).toBeNull();
    expect(normalizeNotificationEtag('  ""  ')).toBeNull();
    expect(normalizeNotificationEtag('W/"real"')).toBe('W/"real"');
    expect(normalizeNotificationEtag()).toBeUndefined();
  });
  it('uses bounded exponential and rate-limit delays', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(notificationRetryDelay(1)).toBe(60_000);
    expect(notificationRetryDelay(3)).toBe(240_000);
    expect(notificationRetryDelay(99)).toBe(900_000);
    vi.useRealTimers();
  });
});
