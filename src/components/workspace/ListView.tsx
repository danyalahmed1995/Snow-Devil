import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTabsStore } from '../../stores/tabs-store';
import { AsyncViewState } from '../../types';
import { activeAccountOrganizations, useAccountRepositories } from '../../hooks/useAccountContext';
import { useAuthStore } from '../../stores/auth-store';

export function ListView({ type }: { type: string }) {
  const [state, setState] = useState<AsyncViewState<any[]>>({ status: 'loading' });
  const { openBrowserTab } = useTabsStore();
  const repositories = useAccountRepositories();
  const session = useAuthStore(state => state.session);

  const fetchData = () => {
    setState({ status: 'loading' });
    let command = '';
    if (type === 'repositories') {
      if (repositories.isLoading) { setState({ status: 'loading' }); return; }
      if (repositories.error) { setState({ status: 'error', message: String(repositories.error), retryable: true }); return; }
      setState(repositories.data?.length ? { status: 'success', data: repositories.data } : { status: 'empty' });
      return;
    }
    else if (type === 'pullRequests') command = 'get_viewer_pull_requests';
    else if (type === 'issues') command = 'get_viewer_issues';
    else if (type === 'organizations') {
      if (session.status !== 'connected') { setState({ status: 'empty' }); return; }
      if (session.account.organizations?.status === 'unavailable') { setState({ status: 'error', message: session.account.organizations.message ?? 'Organization memberships are unavailable.', retryable: true }); return; }
      const organizations = activeAccountOrganizations(session.account);
      setState(organizations.length ? { status: 'success', data: organizations } : { status: 'empty' });
      return;
    }

    if (command) {
      invoke<any[]>(command)
        .then(data => {
          if (!data || data.length === 0) setState({ status: 'empty' });
          else setState({ status: 'success', data });
        })
        .catch(e => setState({ status: 'error', message: e.toString(), retryable: true }));
    }
  };

  const retry = async () => {
    if (type !== 'repositories') {
      fetchData();
      return;
    }
    setState({ status: 'loading' });
    const result = await repositories.refetch();
    if (result.error) {
      setState({ status: 'error', message: String(result.error), retryable: true });
    } else {
      setState(result.data?.length ? { status: 'success', data: result.data } : { status: 'empty' });
    }
  };

  useEffect(() => {
    fetchData();
  }, [repositories.data, repositories.error, repositories.isLoading, session, type]);

  const handleOpenItem = (item: any) => {
    if (type === 'repositories') {
      openBrowserTab(
        `repo-${item.nameWithOwner.replace('/', '-')}`,
        'repository',
        item.nameWithOwner.split('/').pop() || item.nameWithOwner,
        `https://github.com/${item.nameWithOwner}`,
        false,
        true
      );
    } else if (type === 'organizations') {
      openBrowserTab(`organization-${item.login}`, 'profile', item.login, item.url ?? `https://github.com/${item.login}`, false, true);
    } else if (type === 'pullRequests') {
      openBrowserTab(
        `pr-${item.repository.nameWithOwner.replace('/', '-')}-${item.number}`,
        'pullRequest',
        `PR #${item.number}`,
        `https://github.com/${item.repository.nameWithOwner}/pull/${item.number}`,
        false,
        true
      );
    } else if (type === 'issues') {
      openBrowserTab(
        `issue-${item.repository.nameWithOwner.replace('/', '-')}-${item.number}`,
        'issue',
        `Issue #${item.number}`,
        `https://github.com/${item.repository.nameWithOwner}/issues/${item.number}`,
        false,
        true
      );
    }
  };

  return (
    <div className="list-view" style={{ padding: '32px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ textTransform: 'capitalize', marginBottom: '24px' }}>{type.replace(/([A-Z])/g, ' $1').trim()}</h1>
      
      {state.status === 'loading' && <p>Loading...</p>}
      {state.status === 'error' && (
        <div style={{ color: 'var(--error)' }}>
          <p>Error: {state.message}</p>
          {state.retryable && <button onClick={() => void retry()}>Retry</button>}
        </div>
      )}
      {state.status === 'empty' && <p>No items found.</p>}
      {type === 'organizations' && session.status === 'connected' && session.account.organizations?.status === 'partial' && <div role="status" style={{ marginBottom: '16px', color: 'var(--warning)' }}>{session.account.organizations.message}</div>}
      
      {state.status === 'success' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {state.data.map(item => (
            <div 
              key={item.id} 
              onClick={() => handleOpenItem(item)}
              style={{
                padding: '16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--info)' }}>
                {type === 'repositories' ? item.nameWithOwner : type === 'organizations' ? item.login : item.title}
              </div>
              {type !== 'repositories' && type !== 'organizations' && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {item.repository.nameWithOwner} #{item.number}
                </div>
              )}
              {type === 'repositories' && item.description && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {item.description}
                </div>
              )}
              {type === 'organizations' && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.role ?? 'member'} · {item.visibility ?? 'membership visibility unavailable'}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
