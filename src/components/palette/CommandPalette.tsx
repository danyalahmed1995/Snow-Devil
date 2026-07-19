import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Box, Command, File, GitBranch, GitCommit, GitPullRequest, Home, Search, Tag, X, CircleDot, FolderGit2 } from 'lucide-react';
import { parsePaletteQuery, rankResults, type RankableResult } from '../../palette/palette-query';
import { useTabsStore } from '../../stores/tabs-store';
import { useModeStore } from '../../stores/mode-store';
import { useLayoutStore } from '../../stores/layout-store';
import type { NativeTabKind } from '../../browser/browser-tabs';
import { useOverlayStore } from '../../stores/overlay-store';
import './CommandPalette.css';

import { ENABLE_FLOW_ANALYTICS } from '../../config/features';

type PaletteMode = 'search' | 'files' | 'commands';
interface PaletteResult extends RankableResult { group: string; path?: string; number?: number; url?: string; command?: () => void; route?: { id: string; kind: NativeTabKind; title: string } }

const ROUTES: PaletteResult[] = [
  ['home','Home','home'],['flow','Flow','flow'],['ci-health','CI Activity','ciHealth'],['inventory','Delivery Risks','inventory'],...(ENABLE_FLOW_ANALYTICS ? [['flow-analytics','Flow Analytics','flowAnalytics']] : []),['personal-focus','Personal Focus','personalFocus'],['account-simulator','Account History','accountSimulator'],['repository-simulator','Repository History','repositorySimulator'],['commit-graph','Commit Graph','commitGraph'],['settings','Settings','settings'],
].map(([id,title,kind]) => ({ id:`command:${id}`, type:'command', group:'Commands', title:`Go to ${title}`, source:'local', route:{id:`native:${id}`,kind:kind as NativeTabKind,title} }));

const DEMO_RESULTS: PaletteResult[] = [
  { id:'repo:nova-labs/snow-devil',type:'repository',group:'Repositories',title:'nova-labs/snow-devil',subtitle:'Premium GitHub workflow browser',repository:'nova-labs/snow-devil',source:'local' },
  { id:'file:nova-labs/snow-devil:src/app/App.tsx',type:'file',group:'Files',title:'App.tsx',subtitle:'src/app/App.tsx',path:'src/app/App.tsx',repository:'nova-labs/snow-devil',source:'local' },
  { id:'file:nova-labs/snow-devil:README.md',type:'file',group:'Files',title:'README.md',subtitle:'README.md',path:'README.md',repository:'nova-labs/snow-devil',source:'local' },
  { id:'pr:nova-labs/snow-devil:184',type:'pr',group:'Pull requests',title:'Add native repository explorer and command palette',subtitle:'#184 · review required',number:184,repository:'nova-labs/snow-devil',state:'open',author:'snowdevil-demo',source:'local' },
  { id:'issue:nova-labs/snow-devil:179',type:'issue',group:'Issues',title:'Diff viewer loses context on branch change',subtitle:'#179 · open',number:179,repository:'nova-labs/snow-devil',state:'open',author:'nova-frost',url:'https://github.com/nova-labs/snow-devil/issues/179',source:'local' },
  { id:'commit:nova-labs/snow-devil:a42f91d',type:'commit',group:'Commits',title:'a42f91d Refine native tab restoration',subtitle:'Nova Frost · 2 days ago',repository:'nova-labs/snow-devil',url:'https://github.com/nova-labs/snow-devil/commit/a42f91d',source:'local' },
  { id:'branch:nova-labs/snow-devil:feat/native-browser',type:'branch',group:'Branches',title:'feat/native-browser',subtitle:'nova-labs/snow-devil',repository:'nova-labs/snow-devil',source:'local' },
  { id:'release:nova-labs/snow-devil:v2.4.0',type:'release',group:'Releases',title:'Snow Devil v2.4.0',subtitle:'v2.4.0 · released',repository:'nova-labs/snow-devil',url:'https://github.com/nova-labs/snow-devil/releases/tag/v2.4.0',source:'local' },
];

export function CommandPalette() {
  const overlayId = 'command-palette';
  const mode = useModeStore(s => s.mode);
  const [open, setOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('search');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<PaletteResult[]>([]);
  const [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const activeOverlayId = useOverlayStore(state => state.activeOverlayId);
  const openOverlay = useOverlayStore(state => state.openOverlay);
  const closeOverlay = useOverlayStore(state => state.closeOverlay);

  const close = () => { setOpen(false); closeOverlay(overlayId); };
  const show = (nextMode: PaletteMode = 'search') => { setPaletteMode(nextMode); setQuery(''); setActive(0); setOpen(true); openOverlay(overlayId); };
  useEffect(() => {
    const onOpen = (event: Event) => show((event as CustomEvent<PaletteMode>).detail ?? 'search');
    const onKey = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || event.key.toLowerCase() !== 'k' && event.key.toLowerCase() !== 'p') return;
      event.preventDefault(); show(event.key.toLowerCase() === 'k' ? 'search' : event.shiftKey ? 'commands' : 'files');
    };
    window.addEventListener('snow-devil:open-palette', onOpen); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('snow-devil:open-palette', onOpen); window.removeEventListener('keydown', onKey); };
  }, [show]);
  useEffect(() => { if (open) requestAnimationFrame(() => input.current?.focus()); }, [open]);
  const [prevOverlayState, setPrevOverlayState] = useState({ activeOverlayId, open });
  if (activeOverlayId !== prevOverlayState.activeOverlayId || open !== prevOverlayState.open) {
    setPrevOverlayState({ activeOverlayId, open });
    if (open && activeOverlayId !== overlayId) setOpen(false);
  }
  useEffect(() => () => closeOverlay(overlayId), [closeOverlay]);

  const [prevRemoteDeps, setPrevRemoteDeps] = useState({ open, mode, paletteMode });
  if (open !== prevRemoteDeps.open || mode !== prevRemoteDeps.mode || paletteMode !== prevRemoteDeps.paletteMode) {
    setPrevRemoteDeps({ open, mode, paletteMode });
    if (!open || mode === 'demo' || paletteMode === 'commands') { setRemote([]); setStatus(''); }
  }

  useEffect(() => {
    if (!open || mode === 'demo' || paletteMode === 'commands') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setStatus('Searching cached GitHub entities…');
      try {
        const [repos, prs, issues] = await Promise.all([invoke<any[]>('get_viewer_repositories'), invoke<any[]>('get_viewer_pull_requests'), invoke<any[]>('get_viewer_issues')]);
        if (cancelled) return;
        const results: PaletteResult[] = [
          ...(repos ?? []).map(item => ({ id:`repo:${item.nameWithOwner}`,type:'repository',group:'Repositories',title:item.nameWithOwner,subtitle:item.description,repository:item.nameWithOwner,source:'remote' as const })),
          ...(prs ?? []).map(item => ({ id:`pr:${item.repository.nameWithOwner}:${item.number}`,type:'pr',group:'Pull requests',title:item.title,subtitle:`#${item.number}`,number:item.number,repository:item.repository.nameWithOwner,state:item.state?.toLowerCase(),author:item.author?.login,source:'remote' as const })),
          ...(issues ?? []).map(item => ({ id:`issue:${item.repository.nameWithOwner}:${item.number}`,type:'issue',group:'Issues',title:item.title,subtitle:`#${item.number}`,number:item.number,repository:item.repository.nameWithOwner,state:item.state?.toLowerCase(),author:item.author?.login,url:`https://github.com/${item.repository.nameWithOwner}/issues/${item.number}`,source:'remote' as const })),
        ]; setRemote(results); setStatus('');
      } catch (cause) { if (!cancelled) setStatus(`Local cache unavailable: ${String(cause)}`); }
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, open, paletteMode]);

  const extraCommands = useMemo<PaletteResult[]>(() => {
    const tabs = useTabsStore.getState();
    const modeState = useModeStore.getState();
    return [
      { id:'command:explorer',type:'command',group:'Commands',title:'Open repository explorer',source:'local',command:() => openRepository('nova-labs/snow-devil', false) },
      { id:'command:inspector',type:'command',group:'Commands',title:'Toggle Inspector',source:'local',command:() => useLayoutStore.getState().toggleInspector() },
      { id:'command:evidence-graph',type:'command',group:'Commands',title:'Open lifecycle evidence graph',subtitle:'Bounded synchronized evidence',source:'local',command:() => tabs.openNativeTab('native:evidence-graph','evidenceGraph','Evidence Graph',false,true,{type:'evidenceGraph'}) },
      { id:'command:close-tab',type:'command',group:'Commands',title:'Close current tab',source:'local',command:() => tabs.closeTab(tabs.activeTabId) },
      ...(mode === 'demo' ? [
        { id:'command:reset-demo',type:'command',group:'Commands',title:'Reset Demo',source:'local' as const,command:modeState.resetDemo },
        { id:'command:exit-demo',type:'command',group:'Commands',title:'Exit Demo',source:'local' as const,command:modeState.exitDemo },
      ] : [{ id:'command:enter-demo',type:'command',group:'Commands',title:'Enter Demo Mode',source:'local' as const,command:modeState.enterDemo }]),
    ];
  }, [mode]);

  const parsed = parsePaletteQuery(query);
  const source = paletteMode === 'commands' ? [...ROUTES, ...extraCommands] : [...(mode === 'demo' ? DEMO_RESULTS : remote), ...ROUTES, ...extraCommands];
  const constrained = paletteMode === 'files' ? source.filter(item => item.type === 'file' || item.type === 'repository') : source;
  const results = rankResults(constrained, query).slice(0, 60);

  const run = (result: PaletteResult, disposition: 'current' | 'new' | 'github') => {
    if (result.command) result.command();
    else if (result.route) useTabsStore.getState().openNativeTab(result.route.id, result.route.kind, result.route.title, result.route.kind === 'home', result.route.kind !== 'home');
    else if (disposition === 'github') openBrowser({ ...result, url: result.url ?? githubUrlFor(result) });
    else if (result.type === 'repository') openRepository(result.repository ?? result.title, disposition === 'new');
    else if (result.type === 'file' || result.type === 'branch') openRepository(result.repository!, disposition === 'new', result.type === 'branch' ? result.title : undefined, result.path);
    else if (result.type === 'pr') openPullRequest(result.repository!, result.number!, disposition === 'new');
    else if (result.url) openBrowser(result);
    close();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown' || event.key === 'j' && !query) { event.preventDefault(); setActive(value => Math.min(results.length - 1, value + 1)); }
    else if (event.key === 'ArrowUp' || event.key === 'k' && !query) { event.preventDefault(); setActive(value => Math.max(0, value - 1)); }
    else if (event.key === 'Enter' && results[active]) { event.preventDefault(); run(results[active], event.ctrlKey || event.metaKey ? 'github' : event.shiftKey ? 'new' : 'current'); }
  };

  if (!open) return null;
  return <div className="palette-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section className="command-palette glass-panel-strong" role="dialog" aria-modal="true" aria-label="Search and commands" onKeyDown={onKeyDown}>
    <header><Search size={18}/><span>{paletteMode === 'files' ? 'Files' : paletteMode === 'commands' ? 'Commands' : 'Search'}</span><input ref={input} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} placeholder={paletteMode === 'files' ? 'Find a file by name or path…' : paletteMode === 'commands' ? 'Run a Snow Devil command…' : 'Search repositories, files, issues, pull requests…'} aria-controls="palette-results"/><kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} K</kbd><button aria-label="Close palette" onClick={close}><X size={16}/></button></header>
    {Object.entries(parsed.filters).length > 0 && <div className="palette-filters">{Object.entries(parsed.filters).flatMap(([key, values]) => values!.map(value => <button key={`${key}:${value}`} onClick={() => setQuery(query.replace(`${key}:${value}`, '').trim())}>{key}:{value}<X size={11}/></button>))}</div>}
    <div id="palette-results" role="listbox" aria-label={`${results.length} results`} className="palette-results">{results.length ? results.map((result,index) => <button key={result.id} role="option" aria-selected={active === index} className={active === index ? 'is-active' : ''} onMouseEnter={() => setActive(index)} onClick={() => run(result,'current')}><span className="palette-result__icon">{iconFor(result.type)}</span><span className="palette-result__copy"><strong>{result.title}</strong><small>{result.repository && result.repository !== result.title ? `${result.repository} · ` : ''}{result.subtitle}</small></span><span className="palette-result__type">{result.type}</span>{active === index && <kbd>↵</kbd>}</button>) : <div className="palette-empty"><strong>No matching results</strong><span>Unknown filters stay in the fuzzy query. Try a broader term.</span></div>}</div>
    <footer><span aria-live="polite">{status || `${results.length} results · ${mode === 'demo' ? 'offline demo index' : 'local cache first'}`}</span><div><span>↑↓ Navigate</span><span>Enter Open</span><span>Shift Enter New tab</span><span>Ctrl Enter GitHub</span></div></footer>
  </section></div>;
}

function openRepository(repository: string, newTab: boolean, ref?: string, path?: string) { const suffix = newTab ? `:${Date.now()}` : ''; useTabsStore.getState().openNativeTab(`native:repo:${repository}${suffix}`, 'repositoryExplorer', repository.split('/')[1], false, true, { type:'repository', repository, ref, path }); }
function openPullRequest(repository: string, number: number, newTab: boolean) { const suffix = newTab ? `:${Date.now()}` : ''; useTabsStore.getState().openNativeTab(`native:pr:${repository}:${number}${suffix}`, 'pullRequestDiff', `PR #${number}`, false, true, { type:'pullRequest', repository, number }); }
function openBrowser(result: PaletteResult) { if (!result.url) return; useTabsStore.getState().openBrowserTab(`github:${result.id}`, result.type === 'issue' ? 'issue' : result.type === 'pr' ? 'pullRequest' : 'repository', result.title, result.url, false, true); }
function githubUrlFor(result: PaletteResult) { if (!result.repository) return undefined; if (result.type === 'file') return `https://github.com/${result.repository}/blob/main/${result.path}`; if (result.type === 'branch') return `https://github.com/${result.repository}/tree/${result.title}`; if (result.type === 'pr') return `https://github.com/${result.repository}/pull/${result.number}`; return `https://github.com/${result.repository}`; }
function iconFor(type: string) { if(type==='command')return <Command size={16}/>;if(type==='repository')return <FolderGit2 size={16}/>;if(type==='file')return <File size={16}/>;if(type==='pr')return <GitPullRequest size={16}/>;if(type==='issue')return <CircleDot size={16}/>;if(type==='commit')return <GitCommit size={16}/>;if(type==='branch')return <GitBranch size={16}/>;if(type==='release')return <Tag size={16}/>;if(type==='home')return <Home size={16}/>;return <Box size={16}/>;}
