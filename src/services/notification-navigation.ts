import { classifyGithubUrl, tabIdForUrl, type BrowserTabKind } from '../browser/browser-url';
import { notificationDestination, notificationTabTitle, type NativeNotification } from '../stores/notification-store';

export type NotificationNavigationTarget = { family: 'browser'; id: string; kind: BrowserTabKind; title: string; url: string };

export function notificationNavigationTarget(record: NativeNotification): NotificationNavigationTarget | null {
  const url = notificationDestination(record);
  if (!url) return null;
  return { family: 'browser', id: tabIdForUrl(url), kind: classifyGithubUrl(url), title: notificationTabTitle(record, url), url };
}
