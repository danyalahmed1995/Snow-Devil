import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function IssueView({ nodeId }: { nodeId: string }) {
  const [issue, setIssue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parts = nodeId.split('/');
    if (parts.length !== 3) return; // invalid id is handled during render
    const [owner, name, number] = parts;

    const load = async () => {
      setLoading(true);
      try {
        const data = await invoke<any>('get_issue_details', { owner, name, number: parseInt(number, 10) });
        setIssue(data);
      } catch (e: any) {
        setError(e.toString());
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [nodeId]);

  if (nodeId.split('/').length !== 3) {
    return <div style={{ padding: '32px', color: 'var(--error)' }}>Invalid Issue ID format.</div>;
  }
  if (loading) return <div style={{ padding: '32px' }}>Loading Issue details...</div>;
  if (error) return <div style={{ padding: '32px', color: 'var(--error)' }}>{error}</div>;
  if (!issue) return <div style={{ padding: '32px' }}>Issue not found</div>;

  return (
    <div className="issue-view" style={{ padding: '32px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: '24px', margin: '0 0 8px 0' }}>
          {issue.title} <span style={{ color: 'var(--text-secondary)' }}>#{nodeId.split('/')[2]}</span>
        </h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ 
            padding: '4px 12px', 
            borderRadius: '16px', 
            fontSize: '12px',
            fontWeight: '600',
            background: issue.state === 'OPEN' ? '#238636' : (issue.state === 'COMPLETED' ? '#8957e5' : 'var(--text-secondary)'),
            color: '#fff'
          }}>
            {issue.state}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {issue.author?.login} opened this issue on {new Date(issue.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1 }}>
          <div className="markdown-body" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '24px' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{issue.body || '*No description provided.*'}</ReactMarkdown>
          </div>

          <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Timeline</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            {issue.comments?.nodes?.map((comment: any, i: number) => (
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
        </div>
        
        <div style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
           <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
             <strong>Assignees</strong>
             <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
               {issue.assignees?.nodes?.length > 0 
                 ? issue.assignees.nodes.map((a: any) => <span key={a.login}>{a.login}</span>)
                 : 'No one assigned'}
             </div>
           </div>
           <div>
             <strong>Labels</strong>
             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
               {issue.labels?.nodes?.length > 0
                 ? issue.labels.nodes.map((l: any) => (
                    <span key={l.name} style={{ background: `#${l.color}40`, border: `1px solid #${l.color}`, color: `var(--text-primary)`, padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                      {l.name}
                    </span>
                 ))
                 : <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>None yet</span>}
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
