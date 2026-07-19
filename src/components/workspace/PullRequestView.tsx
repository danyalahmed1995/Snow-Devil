import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function PullRequestView({ nodeId }: { nodeId: string }) {
  const [pr, setPr] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parts = nodeId.split('/');
    if (parts.length !== 3) {
      setError("Invalid PR ID format.");
      setLoading(false);
      return;
    }
    const [owner, name, number] = parts;

    setLoading(true);
    invoke<any>('get_pr_details', { owner, name, number: parseInt(number, 10) })
      .then((data) => {
        setPr(data);
      })
      .catch((e) => {
        setError(e.toString());
      })
      .finally(() => {
        setLoading(false);
      });
  }, [nodeId]);

  if (loading) return <div style={{ padding: '32px' }}>Loading PR details...</div>;
  if (error) return <div style={{ padding: '32px', color: 'var(--error)' }}>{error}</div>;
  if (!pr) return <div style={{ padding: '32px' }}>PR not found</div>;

  return (
    <div className="pr-view" style={{ padding: '32px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: '24px', margin: '0 0 8px 0' }}>
          {pr.title} <span style={{ color: 'var(--text-secondary)' }}>#{nodeId.split('/')[2]}</span>
        </h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ 
            padding: '4px 12px', 
            borderRadius: '16px', 
            fontSize: '12px',
            fontWeight: '600',
            border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
            background: pr.state === 'OPEN' ? 'var(--status-success-bg)' : (pr.state === 'MERGED' ? 'var(--status-review-bg)' : 'var(--status-danger-bg)'),
            color: pr.state === 'OPEN' ? 'var(--status-success-fg)' : (pr.state === 'MERGED' ? 'var(--status-review-fg)' : 'var(--status-danger-fg)')
          }}>
            {pr.state}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {pr.author?.login} opened this on {new Date(pr.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1 }}>
          <div className="markdown-body" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '24px' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{pr.body || '*No description provided.*'}</ReactMarkdown>
          </div>

          <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Timeline</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            {pr.comments?.nodes?.map((comment: any, i: number) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', padding: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  <strong>{comment.author?.login}</strong> commented on {new Date(comment.createdAt).toLocaleDateString()}
                </div>
                <div className="markdown-body" style={{ fontSize: '14px' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.body}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>

          {pr.diff && (
            <div style={{ marginTop: '32px' }}>
              <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Diff</h3>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '16px' }}>
                <pre style={{ margin: 0, padding: '16px', overflowX: 'auto', fontSize: '12px', fontFamily: 'monospace' }}>
                  {pr.diff}
                </pre>
              </div>
            </div>
          )}
        </div>
        
        <div style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
           <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
             <strong>Reviewers</strong>
             <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>
               {pr.reviewDecision ? pr.reviewDecision : 'No reviews'}
             </div>
           </div>
           <div>
             <strong>Checks</strong>
             <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>
               {pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state || 'No checks'}
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
