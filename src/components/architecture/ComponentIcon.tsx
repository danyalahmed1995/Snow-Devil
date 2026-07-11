import { Network, Library, Beaker, Terminal, Box, FileCode, AppWindow, Database, Wrench, Bug } from 'lucide-react';
import type { ArchitectureComponent } from '../../architecture/types';

export function getComponentIcon(component: ArchitectureComponent | { kind?: string, name?: string }) {
  const name = component.name?.toLowerCase() || '';
  const kind = component.kind?.toLowerCase() || '';

  if (name.includes('test') || kind.includes('test')) return <Beaker size={13} />;
  if (name.includes('lib') || kind.includes('lib')) return <Library size={13} />;
  if (name.includes('db') || name.includes('data') || kind.includes('database')) return <Database size={13} />;
  if (name.includes('api') || name.includes('server') || kind.includes('server')) return <Network size={13} />;
  if (name.includes('app') || name.includes('ui') || kind.includes('app')) return <AppWindow size={13} />;
  if (name.includes('util') || name.includes('core')) return <Wrench size={13} />;
  if (name.includes('bug') || name.includes('fix') || name.includes('corrupt')) return <Bug size={13} />;
  if (kind === 'package' || kind === 'module') return <Box size={13} />;
  if (kind === 'file') return <FileCode size={13} />;
  if (kind === 'application') return <Terminal size={13} />;
  
  return <Network size={13} />;
}

export function ComponentIcon({ component }: { component: ArchitectureComponent | { kind?: string, name?: string } }) {
  return <span className="architecture-node__icon" aria-hidden="true">
    {getComponentIcon(component)}
  </span>;
}
