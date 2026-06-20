import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTabsStore } from '../../stores/tabs-store';
import { useAuthStore } from '../../stores/auth-store';

interface RepoCard {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
  url: string;
}

export function Dashboard() {
  const [repos, setRepos] = useState<RepoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const { openBrowserTab, openNativeTab } = useTabsStore();
  const session = useAuthStore(s => s.session);
  const login = session.status === 'connected' ? session.account.login : 'user';

  useEffect(() => {
    invoke<RepoCard[]>('get_recent_repositories')
      .then((data) => {
        setRepos(data);
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleOpenRepo = (repoName: string) => {
    openBrowserTab(
      `github:repo:${repoName}`,
      'repository',
      repoName.split('/').pop() || repoName,
      `https://github.com/${repoName}`,
      false,
      true,
    );
  };

  return (
    <div className="dashboard-view" style={{ padding: '32px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '24px', color: 'var(--text-primary)' }}>Home</h1>
      
      {/* Quick Actions */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          Quick Actions
        </h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <QuickActionButton
            label="Repositories"
            onClick={() =>
              openBrowserTab(
                'github:repositories',
                'repositories',
                'Repositories',
                `https://github.com/${login}?tab=repositories`,
              )
            }
          />
          <QuickActionButton
            label="Pull Requests"
            onClick={() =>
              openBrowserTab(
                'github:pull-requests',
                'pullRequests',
                'Pull Requests',
                'https://github.com/pulls',
              )
            }
          />
          <QuickActionButton
            label="Issues"
            onClick={() =>
              openBrowserTab(
                'github:issues',
                'issues',
                'Issues',
                'https://github.com/issues',
              )
            }
          />
          <QuickActionButton
            label="Notifications"
            onClick={() =>
              openBrowserTab(
                'github:notifications',
                'notifications',
                'Notifications',
                'https://github.com/notifications',
              )
            }
          />
          <QuickActionButton
            label="Graph Map"
            onClick={() =>
              openNativeTab('native:map', 'map', 'Map', false, true)
            }
          />
        </div>
      </section>

      {/* Recently Updated Repositories */}
      <section>
        <h2 style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          Recently Updated Repositories
        </h2>
        
        {loading ? (
          <p>Loading your repositories...</p>
        ) : repos.length === 0 ? (
          <p>No repositories found. Ensure you are connected and synced.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {repos.map((repo) => (
              <div 
                key={repo.id} 
                style={{ 
                  padding: '16px', 
                  border: '1px solid var(--border)', 
                  borderRadius: '6px', 
                  background: 'var(--surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
                onClick={() => handleOpenRepo(repo.name)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: '600', color: '#58a6ff' }}>{repo.name}</span>
                </div>
                {repo.description && (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {repo.description}
                  </p>
                )}
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 'auto' }}>
                  Updated {new Date(repo.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Small button for quick-action cards. */
function QuickActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 20px',
        borderRadius: '6px',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLButtonElement).style.borderColor = 'var(--accent-primary, #58a6ff)';
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLButtonElement).style.borderColor = 'var(--border)';
      }}
    >
      {label}
    </button>
  );
}
