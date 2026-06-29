import { useAuthStore } from '../../stores/auth-store';
import { ExternalLink, RefreshCw } from 'lucide-react';
import './Workspace.css';
import { useAccountRepositories } from '../../hooks/useAccountContext';

export function AccountView() {
  const { session, checkAuthStatus } = useAuthStore();
  const repositories = useAccountRepositories();

  if (session.status === 'checking') {
    return (
      <div style={{ padding: '32px' }}>
        <p>Loading account details...</p>
      </div>
    );
  }

  if (session.status === 'disconnected') {
    return (
      <div style={{ padding: '32px' }}>
        <h2>Not Connected</h2>
        <p>Please connect your GitHub account to view details.</p>
      </div>
    );
  }

  if (session.status === 'error') {
    return (
      <div style={{ padding: '32px', color: 'var(--error)' }}>
        <h2>Failed to load account</h2>
        <p>{session.message}</p>
        <button onClick={checkAuthStatus} style={{ marginTop: '16px', padding: '8px 16px', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  const { account } = session;
  const displayName = account.name || `@${account.login}`;

  return (
    <div className="account-view" style={{ padding: '32px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid var(--border)', paddingBottom: '32px', marginBottom: '32px' }}>
        <img 
          src={account.avatarUrl} 
          alt={`${account.login}'s avatar`} 
          style={{ width: '128px', height: '128px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} 
        />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '32px' }}>{displayName}</h1>
          <div style={{ color: 'var(--text-secondary)', fontSize: '18px', marginBottom: '16px' }}>
            @{account.login}
          </div>
          {account.bio && (
            <p style={{ margin: '0 0 16px 0', maxWidth: '600px', lineHeight: '1.5' }}>{account.bio}</p>
          )}
          <div style={{ display: 'flex', gap: '16px' }}>
            {account.url && (
              <a 
                href={account.url} 
                target="_blank" 
                rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', textDecoration: 'none', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px' }}
              >
                Open on GitHub <ExternalLink size={14} />
              </a>
            )}
            <button 
              onClick={checkAuthStatus}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', cursor: 'pointer', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px' }}
            >
              Refresh <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        <StatCard title="Accessible Repositories" count={repositories.data?.length ?? account.repositories?.totalCount ?? 0} />
        <StatCard title="Active Organizations" count={account.organizations?.status === 'unavailable' ? 'Unavailable' : account.organizations?.status === 'partial' ? `${account.organizations.totalCount}+` : account.organizations?.totalCount ?? 0} detail={account.organizations?.message} />
        <StatCard title="Open Pull Requests" count={account.pullRequests?.totalCount || 0} />
        <StatCard title="Assigned Issues" count={account.issues?.totalCount || 0} />
      </div>
    </div>
  );
}

function StatCard({ title, count, detail }: { title: string, count: number | string, detail?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px' }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{count}</div>
      {detail && <small style={{ color: 'var(--text-muted)' }}>{detail}</small>}
    </div>
  );
}
