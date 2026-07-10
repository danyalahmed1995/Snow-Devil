import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileCode2, Image as ImageIcon, AlertCircle } from 'lucide-react';
import type { WorktreeLocalFile } from '../../worktrees/worktree-types';
import { MissingWorktreeView } from './MissingWorktreeView';
import { useWorktreeStore } from '../../worktrees/worktree-store';

interface WorktreeLocalFilePageProps {
  worktreeId: string;
  filePath: string;
  repositoryRootPath: string;
}

export function WorktreeLocalFilePage({
  worktreeId,
  filePath,
  repositoryRootPath,
}: WorktreeLocalFilePageProps) {
  const [fileData, setFileData] = useState<WorktreeLocalFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const removeEnvironment = useWorktreeStore((s) => s.removeEnvironment);

  useEffect(() => {
    let isMounted = true;
    
    async function loadFile() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await invoke<WorktreeLocalFile>('read_local_file', {
          worktreeRoot: worktreeId,
          relativePath: filePath,
        });
        if (isMounted) {
          setFileData(result);
        }
      } catch (e) {
        if (isMounted) {
          setError(typeof e === 'string' ? e : String(e));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    
    void loadFile();
    return () => { isMounted = false; };
  }, [worktreeId, filePath]);

  if (isLoading) {
    return (
      <div className="wt-page" style={{ padding: 'var(--space-6)', display: 'flex', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)' }}>Loading file...</div>
      </div>
    );
  }

  // Handle missing worktree error specifically
  if (error && error.includes('Path not accessible')) {
    return (
      <MissingWorktreeView
        worktreeId={worktreeId}
        repositoryRootPath={repositoryRootPath}
        onRefresh={() => {
          setIsLoading(true);
          setError(null);
          void invoke<WorktreeLocalFile>('read_local_file', {
            worktreeRoot: worktreeId,
            relativePath: filePath,
          }).then(setFileData).catch(e => setError(typeof e === 'string' ? e : String(e))).finally(() => setIsLoading(false));
        }}
        onRemoveFromList={() => removeEnvironment(worktreeId)}
      />
    );
  }

  if (error) {
    return (
      <div className="wt-error-state">
        <AlertCircle size={32} />
        <h2 className="wt-page-title">Cannot Read File</h2>
        <div style={{ maxWidth: '600px', wordBreak: 'break-all' }}>{error}</div>
      </div>
    );
  }

  if (!fileData) return null;

  const isImage = fileData.mimeHint?.startsWith('image/');
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const lineCount = fileData.text ? fileData.text.split('\n').length : 0;

  return (
    <div className="wt-page">
      <div className="wt-page-header" style={{ padding: 'var(--space-3) var(--space-4)' }}>
        {isImage ? <ImageIcon size={16} /> : <FileCode2 size={16} />}
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{filePath}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-4)', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {fileData.text && <span>{lineCount} lines</span>}
          <span>{formatSize(fileData.byteSize)}</span>
        </div>
      </div>
      
      <div className="wt-page-body" style={{ background: 'var(--surface-editor, var(--surface-content))' }}>
        {isImage && fileData.contentBase64 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)', overflow: 'auto' }}>
            <img 
              src={`data:${fileData.mimeHint};base64,${fileData.contentBase64}`} 
              alt={filePath} 
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} 
            />
          </div>
        ) : fileData.isBinary ? (
          <div className="wt-empty-state">
            <AlertCircle size={48} style={{ opacity: 0.2 }} />
            <div>Binary file — cannot display text content</div>
            <div style={{ fontSize: 'var(--type-meta)' }}>{formatSize(fileData.byteSize)}</div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Simple line numbers */}
            <div style={{ width: '50px', flexShrink: 0, background: 'var(--surface-sidebar)', borderRight: '1px solid var(--border-subtle)', padding: 'var(--space-4) 0', textAlign: 'right', color: 'var(--text-disabled)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.5', userSelect: 'none', overflowY: 'hidden' }}>
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} style={{ paddingRight: '12px' }}>{i + 1}</div>
              ))}
            </div>
            {/* Text content */}
            <pre style={{ flex: 1, margin: 0, padding: 'var(--space-4)', overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
              <code>{fileData.text}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
