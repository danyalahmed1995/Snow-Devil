import type { ReactNode } from 'react';

export interface WorkspaceLoadingStateProps {
  title: string;
  detail?: string;
  progress?: { value: number; max: number };
  action?: ReactNode;
}

/** Lightweight loading surface shared by lazily activated workspace views. */
export function WorkspaceLoadingState({ title, detail, progress, action }: WorkspaceLoadingStateProps) {
  const bounded = progress
    ? { value: Math.max(0, Math.min(progress.value, progress.max)), max: Math.max(1, progress.max) }
    : undefined;

  return <div className="workspace-loading-state home-loading-state" role="status" aria-live="polite" aria-busy="true">
    <div className="global-spinner" aria-hidden="true" />
    <div className="workspace-loading-state__copy">
      <h1>{title}</h1>
      {detail && <p>{detail}</p>}
      {bounded && <progress value={bounded.value} max={bounded.max} aria-label={`${title} progress`} />}
      {action}
    </div>
  </div>;
}
