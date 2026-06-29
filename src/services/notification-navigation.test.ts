import { describe, expect, it } from 'vitest';
import { notificationNavigationTarget } from './notification-navigation';
import type { NativeNotification } from '../stores/notification-store';

const record: NativeNotification = { id: '42', unread: true, reason: 'review_requested', updatedAt: '2026-01-01T00:00:00Z', subject: { title: 'Review me', type: 'PullRequest', apiUrl: 'https://api.github.com/repos/Owner/Repo/pulls/42' }, repository: { fullName: 'Owner/Repo' } };

describe('notification navigation', () => {
  it('routes pull requests to one repository-qualified native diff', () => {
    expect(notificationNavigationTarget(record)).toEqual({ family: 'native-pr', id: 'native:pr:owner/repo:42', title: 'PR #42', repository: 'Owner/Repo', number: 42 });
  });

  it('keeps issues on their canonical GitHub entity tab', () => {
    expect(notificationNavigationTarget({ ...record, subject: { title: 'Issue', type: 'Issue', apiUrl: 'https://api.github.com/repos/Owner/Repo/issues/42' } })).toMatchObject({ family: 'browser', title: 'Issue #42', url: 'https://github.com/Owner/Repo/issues/42' });
  });
});
