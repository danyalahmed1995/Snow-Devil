import { describe, expect, it } from 'vitest';
import { resolveWorkItemOpenActions, type WorkItemOpenTarget } from './work-item-open-actions';

const target = (kind: WorkItemOpenTarget['kind']): WorkItemOpenTarget => ({ id: 'item', kind, title: 'Item', repository: 'octo/repo', number: 7, runId: '99', url: 'https://github.com/octo/repo/issues/7' });

describe('resolveWorkItemOpenActions', () => {
  it.each([
    ['pull_request', 'home', 'native_pr'], ['pull_request', 'flow', 'native_pr'],
    ['ci_run', 'home', 'native_ci'], ['ci_run', 'flow', 'native_ci'],
    ['issue', 'home', 'app_browser'], ['issue', 'flow', 'app_browser'],
  ] as const)('resolves %s from %s', (kind, surface, primary) => {
    const actions = resolveWorkItemOpenActions(target(kind), surface);
    expect(actions.filter(value => value.priority === 'primary')).toHaveLength(1);
    expect(actions[0].destination).toBe(primary);
    expect(actions.some(value => value.destination === 'flow')).toBe(surface !== 'flow');
  });

  it('uses canonical labels and deterministic ordering', () => {
    const first = resolveWorkItemOpenActions(target('pull_request'), 'home');
    expect(first.map(value => value.label)).toEqual(['Open PR', 'Open in Flow', 'Open in App Browser', 'Open on GitHub', 'Copy Link']);
    expect(resolveWorkItemOpenActions(target('pull_request'), 'home')).toEqual(first);
  });

  it('disables destinations whose required identity is missing', () => {
    const pr = resolveWorkItemOpenActions({ id: 'bad', kind: 'pull_request', title: 'Bad' }, 'home');
    expect(pr[0]).toMatchObject({ destination: 'native_pr', enabled: false });
    expect(pr.find(value => value.destination === 'app_browser')?.enabled).toBe(false);
    const issue = resolveWorkItemOpenActions({ id: 'bad', kind: 'issue', title: 'Bad' }, 'flow');
    expect(issue[0]).toMatchObject({ destination: 'app_browser', enabled: false });
  });
});

