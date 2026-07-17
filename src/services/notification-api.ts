import type { NativeNotification } from '../stores/notification-store';

export interface ApiNotification {
  id?: string;
  unread?: boolean;
  reason?: string;
  updated_at?: string;
  last_read_at?: string;
  subject?: { title?: string; type?: string; url?: string; latest_comment_url?: string };
  repository?: { full_name?: string; html_url?: string };
}

export interface NotificationPollResponse {
  status: number;
  body: unknown;
  etag?: string;
  lastModified?: string;
  pollIntervalSeconds: number;
  rateRemaining?: number;
  rateReset?: number;
}

export function isNotificationApiPage(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** GitHub's notifications endpoint sometimes emits a constant empty ETag. */
export function normalizeNotificationEtag(value?: string): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return !trimmed || trimmed === '""' ? null : trimmed;
}

export function normalizeApiNotifications(value: unknown): NativeNotification[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).flatMap((item: ApiNotification) => item?.id && item.subject?.title && item.repository?.full_name ? [{
    id: item.id,
    unread: Boolean(item.unread),
    reason: item.reason ?? 'subscribed',
    updatedAt: item.updated_at ?? new Date(0).toISOString(),
    lastReadAt: item.last_read_at,
    subject: { title: item.subject.title, type: item.subject.type ?? 'Unknown', apiUrl: item.subject.url, latestCommentUrl: item.subject.latest_comment_url },
    repository: { fullName: item.repository.full_name, htmlUrl: item.repository.html_url },
    source: 'github' as const,
  }] : []);
}

export function notificationRetryDelay(failureCount: number, serverMinimumMs = 60_000, rateResetSeconds?: number): number {
  const resetDelay = rateResetSeconds ? Math.max(0, rateResetSeconds * 1000 - Date.now()) : 0;
  const exponential = Math.min(15 * 60_000, serverMinimumMs * 2 ** Math.min(4, Math.max(0, failureCount - 1)));
  return Math.max(serverMinimumMs, resetDelay, exponential);
}
