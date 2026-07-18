import { classifyGithubUrl, tabIdForUrl, type BrowserTabKind } from '../browser/browser-url';
import { notificationDestination, notificationTabTitle, type NativeNotification } from '../stores/notification-store';

export type NotificationNavigationTarget =
  | { family: 'browser'; id: string; kind: BrowserTabKind; title: string; url: string }
  | { family: 'native'; id: string; kind: 'pullRequestDiff'; title: string; context: { type: 'pullRequest'; repository: string; number: number } };

export function notificationNavigationTarget(record: NativeNotification): NotificationNavigationTarget | null {
  if (record.subject.type === 'PullRequest' && record.subject.apiUrl) {
    const match = record.subject.apiUrl.match(/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)/);
    if (match) {
      const repository = match[1];
      const number = Number(match[2]);
      return {
        family: 'native',
        id: `native:pr:${repository}:${number}`,
        kind: 'pullRequestDiff',
        title: `PR #${number}`,
        context: { type: 'pullRequest', repository, number },
      };
    }
  }
  const url = notificationDestination(record);
  if (!url) return null;
  return { family: 'browser', id: tabIdForUrl(url), kind: classifyGithubUrl(url), title: notificationTabTitle(record, url), url };
}
