import { classifyGithubUrl, tabIdForUrl, type BrowserTabKind } from '../browser/browser-url';
import { notificationDestination, notificationTabTitle, type NativeNotification } from '../stores/notification-store';

export type NotificationNavigationTarget =
  | { family: 'native-pr'; id: string; title: string; repository: string; number: number }
  | { family: 'browser'; id: string; kind: BrowserTabKind; title: string; url: string };

export function notificationNavigationTarget(record: NativeNotification): NotificationNavigationTarget | null {
  const url = notificationDestination(record);
  if (!url) return null;
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/.exec(url);
  if (match) {
    const repository = `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`;
    const number = Number(match[3]);
    return { family: 'native-pr', id: `native:pr:${repository.toLowerCase()}:${number}`, title: `PR #${number}`, repository, number };
  }
  return { family: 'browser', id: tabIdForUrl(url), kind: classifyGithubUrl(url), title: notificationTabTitle(record, url), url };
}
