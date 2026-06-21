import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTabsStore } from '../../stores/tabs-store';

export function RepositoryView({ nodeId }: { nodeId: string }) {
  const [repo, setRepo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeInnerTab, setActiveInnerTab] = useState<'overview' | 'files' | 'prs' | 'issues'>('overview');

  useEffect(() => {
    // nodeId is likely "nameWithOwner", e.g. "octocat/Hello-World"
    const [owner, name] = nodeId.split('/');
    if (!owner || !name) {
      setError("Invalid repository ID format. Expected owner/name.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    invoke<any>('get_repo_overview', { owner, name })
      .then((data) => {
        setRepo(data);
      })
      .catch((e) => {
        console.error(e);
        setError(e.toString());
      })
      .finally(() => {
        setLoading(false);
      });
  }, [nodeId]);

  if (loading) {
    return (
      <div className="repository-view" style={{ padding: '32px', height: '100%' }}>
        <p>Loading repository details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="repository-view" style={{ padding: '32px', height: '100%', color: 'var(--error)' }}>
        <h2>Error Loading Repository</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="repository-view" style={{ padding: '32px', height: '100%' }}>
        <h2>Repository Not Found</h2>
      </div>
    );
  }

  return (
    <div className="repository-view" style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ padding: '32px 32px 0 32px', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: '24px', margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
          {repo.nameWithOwner}
        </h1>
        {repo.description && (
          <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)' }}>{repo.description}</p>
        )}
        
        <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', alignItems: 'center' }}>
          {repo.primaryLanguage && <span>Language: {repo.primaryLanguage.name}</span>}
          <span>★ {repo.stargazerCount}</span>
          <span>Forks: {repo.forkCount}</span>
          <span>Updated: {new Date(repo.updatedAt).toLocaleDateString()}</span>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button 
              onClick={() => {
                const { openNativeTab } = useTabsStore.getState();
                // We need useFlowStore.getState().setTabState
                import('../../stores/flow-store').then(({ useFlowStore }) => {
                  useFlowStore.getState().setTabState('native:flow', {
                    scope: 'repository',
                    selectedRepository: { id: repo.id, nameWithOwner: repo.nameWithOwner }
                  });
                  openNativeTab('native:flow', 'flow', 'Flow', false, true);
                });
              }}
              style={{ padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px' }}
            >
              Open in Flow
            </button>
            <a href={repo.url} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', textDecoration: 'none', fontSize: '12px' }}>
              View on GitHub
            </a>
          </div>
        </div>

        {/* Inner Tabs */}
        <div style={{ display: 'flex', gap: '24px', marginTop: 'auto' }}>
          {['overview', 'files', 'prs', 'issues'].map(tab => (
            <div 
              key={tab}
              onClick={() => setActiveInnerTab(tab as any)}
              style={{
                paddingBottom: '8px',
                cursor: 'pointer',
                borderBottom: activeInnerTab === tab ? '2px solid #58a6ff' : '2px solid transparent',
                color: activeInnerTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeInnerTab === tab ? '600' : 'normal',
                textTransform: 'capitalize'
              }}
            >
              {tab === 'prs' ? 'Pull Requests' : tab}
            </div>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div style={{ padding: '32px', overflowY: 'auto', flex: 1 }}>
        {activeInnerTab === 'overview' && (
          <div>
            <h2 style={{ fontSize: '18px', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '16px' }}>README</h2>
            <div className="markdown-body" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              {repo.object && repo.object.text ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {repo.object.text}
                </ReactMarkdown>
              ) : (
                <p style={{ color: 'var(--text-secondary)' }}>No README found.</p>
              )}
            </div>
          </div>
        )}
        
        {activeInnerTab === 'files' && (
          <FileBrowser owner={repo.nameWithOwner.split('/')[0]} name={repo.nameWithOwner.split('/')[1]} defaultBranch={repo.defaultBranchRef?.name || 'HEAD'} />
        )}
        {activeInnerTab === 'prs' && (
          <RepoList type="prs" owner={repo.nameWithOwner.split('/')[0]} name={repo.nameWithOwner.split('/')[1]} />
        )}
        {activeInnerTab === 'issues' && (
          <RepoList type="issues" owner={repo.nameWithOwner.split('/')[0]} name={repo.nameWithOwner.split('/')[1]} />
        )}
      </div>
    </div>
  );
}

function RepoList({ type, owner, name }: { type: 'prs' | 'issues', owner: string, name: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { openBrowserTab } = useTabsStore();

  useEffect(() => {
    setLoading(true);
    setError(null);
    const command = type === 'prs' ? 'get_repo_prs' : 'get_repo_issues';
    
    invoke<any[]>(command, { owner, name })
      .then((data) => {
        setItems(data || []);
      })
      .catch((e) => {
        setError(e.toString());
      })
      .finally(() => {
        setLoading(false);
      });
  }, [type, owner, name]);

  const handleOpen = (item: any) => {
    openBrowserTab(
      `${type === 'prs' ? 'pr' : 'issue'}-${item.id}`,
      type === 'prs' ? 'pullRequest' : 'issue',
      `#${item.number} ${item.title}`,
      `https://github.com/${owner}/${name}/${type === 'prs' ? 'pull' : 'issues'}/${item.number}`,
      false,
      true
    );
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>;
  if (items.length === 0) return <p>No open {type === 'prs' ? 'pull requests' : 'issues'} found.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {items.map(item => (
        <div 
          key={item.id}
          style={{ padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}
          onClick={() => handleOpen(item)}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: item.state === 'OPEN' ? '#3fb950' : 'var(--text-secondary)' }}>
              {type === 'prs' ? '⇄' : '⊙'}
            </span>
            <span style={{ fontWeight: '600', fontSize: '16px' }}>{item.title}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            #{item.number} opened on {new Date(item.updatedAt).toLocaleDateString()} by {item.author?.login}
          </div>
        </div>
      ))}
    </div>
  );
}

function FileBrowser({ owner, name, defaultBranch }: { owner: string, name: string, defaultBranch: string }) {
  const [currentPath, setCurrentPath] = useState('');
    const [entries, setEntries] = useState<any[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPath = useCallback((path: string) => {
    setLoading(true);
    setError(null);
    setFileContent(null);
    
    // expression format: branch:path
    const expression = `${defaultBranch}:${path}`;
    
    invoke<any>('get_repo_tree', { owner, name, expression })
      .then((data) => {
        if (data && data.entries) {
          setEntries(data.entries.sort((a: any, b: any) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'tree' ? -1 : 1;
          }));
        } else {
          // If no entries, it might be a file (blob). Let's fetch file.
          return invoke<any>('get_repo_file', { owner, name, expression }).then((fileData) => {
            if (fileData && typeof fileData.text === 'string') {
               setFileContent(fileData.text);
            } else {
               setError("Unable to read file content. It might be binary.");
            }
          });
        }
      })
      .catch((e) => {
        setError(e.toString());
      })
      .finally(() => {
        setLoading(false);
      });
  }, [owner, name, defaultBranch]);

  useEffect(() => {
    fetchPath(currentPath);
  }, [currentPath, fetchPath]);

  const handleEntryClick = (entry: any) => {
    setCurrentPath(entry.path);
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
        <button onClick={navigateUp} disabled={!currentPath || loading} style={{ padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', cursor: currentPath ? 'pointer' : 'default' }}>
          ↑ Up
        </button>
        <div style={{ fontFamily: 'monospace', fontSize: '14px', color: 'var(--text-secondary)' }}>
          {owner}/{name} / {currentPath}
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p style={{ color: 'var(--error)' }}>{error}</p>
      ) : fileContent !== null ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
          <pre style={{ margin: 0, padding: '16px', overflowX: 'auto', fontSize: '13px', fontFamily: 'monospace' }}>
            {fileContent}
          </pre>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)' }}>
          {entries.map(entry => (
            <div 
              key={entry.name}
              onClick={() => handleEntryClick(entry)}
              style={{
                padding: '8px 16px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                display: 'flex',
                gap: '8px',
                alignItems: 'center'
              }}
            >
              <span style={{ color: entry.type === 'tree' ? '#58a6ff' : 'var(--text-secondary)' }}>
                {entry.type === 'tree' ? '📁' : '📄'}
              </span>
              <span>{entry.name}</span>
            </div>
          ))}
          {entries.length === 0 && <div style={{ padding: '16px' }}>Directory is empty.</div>}
        </div>
      )}
    </div>
  );
}
