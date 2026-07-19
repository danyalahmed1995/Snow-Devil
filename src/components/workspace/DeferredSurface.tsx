import { useEffect, useState, type ReactNode } from 'react';
import { WorkspaceLoadingState } from './WorkspaceLoadingState';
import { acquireFrontendResource } from '../../diagnostics/leak-diagnostics';

interface DeferredSurfaceProps {
  identity: string;
  title: string;
  detail: string;
  children: ReactNode;
}

/**
 * Gives the browser a paint opportunity before a heavy React tree is mounted.
 * Inactive tabs are unmounted by WorkspaceContent, so cleanup belongs to the
 * view and query observers cannot remain alive behind this loader.
 */
export function DeferredSurface({ identity, title, detail, children }: DeferredSurfaceProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const releaseFrame = acquireFrontendResource('animationFrames');
    let releaseTimer: (() => void) | undefined;
    let timer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      releaseFrame();
      releaseTimer = acquireFrontendResource('timers');
      timer = window.setTimeout(() => { releaseTimer?.(); setReady(true); }, 0);
    });
    return () => {
      releaseFrame();
      releaseTimer?.();
      window.cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [identity]);

  return ready ? children : <WorkspaceLoadingState title={title} detail={detail} />;
}
