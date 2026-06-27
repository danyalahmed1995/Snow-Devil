import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTabsStore } from '../../stores/tabs-store';
import { AsyncViewState } from '../../types';

export function ListView({ type }: { type: string }) {
  const [state, setState] = useState<AsyncViewState<any[]>>({ status: 'loading' });
  // Bumping this re-runs the fetch effect (used by the Retry button).
  const [reloadKey, setReloadKey] = useState(0);
  const { openBrowserTab } = useTabsStore();

  useEffect(() => {
    const load = async () => {
      setState({ status: 'loading' });
      let command = '';
      if (type === 'repositories') command = 'get_viewer_repositories';
      else if (type === 'pullRequests') command = 'get_viewer_pull_requests';
      else if (type === 'issues') command = 'get_viewer_issues';
      else if (type === 'organizations') {
        setState({ status: 'empty' });
        return;
      }

      if (!command) return;
      try {
        const data = await invoke<any[]>(command);
        if (!data || data.length === 0) setState({ status: 'empty' });
        else setState({ status: 'success', data });
      } catch (e: any) {
        setState({ status: 'error', message: e.toString(), retryable: true });
      }
    };
    void load();
  }, [type, reloadKey]);

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
          {state.retryable && <button onClick={() => setReloadKey(k => k + 1)}>Retry</button>}
        </div>
      )}
      {state.status === 'empty' && <p>No items found.</p>}
      
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
              <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#58a6ff' }}>
                {type === 'repositories' ? item.nameWithOwner : item.title}
              </div>
              {type !== 'repositories' && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {item.repository.nameWithOwner} #{item.number}
                </div>
              )}
              {type === 'repositories' && item.description && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {item.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
