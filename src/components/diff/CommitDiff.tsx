import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, ExternalLink, Files, Folder, GitCommit, Rows3, Search } from 'lucide-react';
import { useModeStore } from '../../stores/mode-store';
import { useTabsStore } from '../../stores/tabs-store';
import { parseUnifiedDiff, type DiffFile } from '../../diff/diff-utils';
import { DiffFileView, readableDiffError, CHUNK, statusMark } from './DiffShared';
import './PullRequestDiff.css';

interface CommitData {
  sha: string;
  commit: { message: string; author: { name: string; date: string } };
  author: { login: string };
  stats: { additions: number; deletions: number; total: number };
  parents: Array<{ sha: string }>;
  diff?: string;
}
interface PersistedDiff { activePath:string; layout:'unified'|'split'; viewed:string[]; ignoreWhitespace:boolean }
const persistedKey=(repository:string,sha:string)=>`snow-devil-commit-diff:${repository}#${sha}`;
function readPersisted(repository:string,sha:string):PersistedDiff{try{return{activePath:'',layout:'unified',viewed:[],ignoreWhitespace:false,...JSON.parse(localStorage.getItem(persistedKey(repository,sha))??'{}')}}catch{return{activePath:'',layout:'unified',viewed:[],ignoreWhitespace:false}}}

export function CommitDiff({repository,sha}:{repository:string;sha:string}){
  const mode=useModeStore(s=>s.mode);const[owner,name]=repository.split('/');const initial=useMemo(()=>readPersisted(repository,sha),[repository,sha]);const[data,setData]=useState<CommitData>();const[error,setError]=useState<string>();const[layout,setLayout]=useState<'unified'|'split'>(initial.layout);const[activePath,setActivePath]=useState(initial.activePath);const[query,setQuery]=useState('');const[ignoreWhitespace,setIgnoreWhitespace]=useState(initial.ignoreWhitespace);const[expandedContext,setExpandedContext]=useState(false);const[renderLimit,setRenderLimit]=useState(CHUNK);const[viewed,setViewed]=useState(new Set(initial.viewed));const mainRef=useRef<HTMLElement>(null);
  const [prevSha, setPrevSha] = useState(sha);
  if (sha !== prevSha) {
    setPrevSha(sha);
    setData(undefined);
    setError(undefined);
  }
  useEffect(()=>{let current=true;(invoke<CommitData>('get_commit_details',{owner,name,sha})).then(value=>{if(current)setData(value)}).catch(cause=>{if(current)setError(String(cause))});return()=>{current=false}},[name,owner,sha]);
  useEffect(()=>{localStorage.setItem(persistedKey(repository,sha),JSON.stringify({activePath,layout,viewed:[...viewed],ignoreWhitespace}));},[activePath,ignoreWhitespace,layout,repository,sha,viewed]);
  const files=useMemo(()=>parseUnifiedDiff(data?.diff??''),[data?.diff]);
  const [prevFiles, setPrevFiles] = useState(files);
  if (files !== prevFiles) {
    setPrevFiles(files);
    if(activePath&&!files.some(file=>file.newPath===activePath))setActivePath('');
  }
  const selected=activePath?files.filter(file=>file.newPath===activePath):files;const matching=useMemo(()=>query.trim()?selected.filter(file=>file.newPath.toLowerCase().includes(query.toLowerCase())||file.lines.some(line=>line.text.toLowerCase().includes(query.toLowerCase()))):selected,[query,selected]);
  const groups=useMemo(()=>{const map=new Map<string,DiffFile[]>();for(const file of files){const folder=file.newPath.includes('/')?file.newPath.slice(0,file.newPath.lastIndexOf('/')):'Repository root';map.set(folder,[...(map.get(folder)??[]),file]);}return[...map.entries()]},[files]);
  const totals=data?.stats ?? {additions:0,deletions:0};
  const openGithub=()=>useTabsStore.getState().openBrowserTab(`github:commit:${repository}:${sha}`,'githubPage',`Commit ${sha.slice(0,7)}`,`https://github.com/${repository}/commit/${sha}`,false,true);
  const selectFile=(path:string)=>{setActivePath(path);setRenderLimit(CHUNK);setExpandedContext(false);mainRef.current?.scrollTo({top:0})};
  const toggleViewed=(path:string)=>setViewed(current=>{const next=new Set(current);if(next.has(path))next.delete(path);else next.add(path);return next});
  const openOriginal=(file:DiffFile)=>useTabsStore.getState().openNativeTab(`native:repo:${repository}`,'repositoryExplorer',name,false,true,{type:'repository',repository,ref:sha,path:file.newPath});

  const diffData = useMemo(() => ({ baseRefName: data?.parents?.[0]?.sha ?? `${sha}~1`, headRefName: sha }), [data, sha]);

  return <div className="native-diff"><header className="native-diff__header"><div><span>Native commit diff</span><h1><GitCommit size={18}/>{data?.commit?.message?.split('\n')[0]??`Commit ${sha.slice(0,7)}`}</h1><p>{repository} @ {sha.slice(0,7)}{data?` · ${data.author?.login ?? data.commit?.author?.name}`:''} · <b>+{totals.additions}</b> <i>-{totals.deletions}</i></p></div><div className="native-diff__actions"><label className="diff-search"><Search size={13}/><input aria-label="Search changed files" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search changes"/></label><button className={ignoreWhitespace?'is-active':''} aria-pressed={ignoreWhitespace} onClick={()=>setIgnoreWhitespace(value=>!value)}>Whitespace</button><div role="group" aria-label="Diff layout"><button className={layout==='unified'?'is-active':''} onClick={()=>setLayout('unified')}><Rows3 size={14}/>Unified</button><button className={layout==='split'?'is-active':''} onClick={()=>setLayout('split')}><Files size={14}/>Split</button></div><button onClick={openGithub}><ExternalLink size={14}/>Open on GitHub</button></div></header>
    {error&&<div className="diff-state"><strong>Unable to load this diff</strong><span>{readableDiffError(error)}</span></div>}{!data&&!error&&<div className="diff-state">Loading commit changes…</div>}{data&&<div className="native-diff__body"><aside aria-label="Changed files"><header><strong>{files.length} changed files</strong><button onClick={()=>setActivePath('')}>All files</button></header>{groups.map(([folder,group])=><section className="diff-file-group" key={folder}><h3><Folder size={12}/>{folder}</h3>{group.map(file=><button className={file.newPath===activePath?'is-active':''} key={file.newPath} onClick={()=>selectFile(file.newPath)} data-tooltip={`${file.newPath}\nSelect to reveal this file's commit changes.`}><span>{viewed.has(file.newPath)?<Check size={11}/>:statusMark(file)}{file.newPath.split('/').pop()}</span><small><b>+{file.additions}</b> <i>-{file.deletions}</i></small></button>)}</section>)}</aside><main ref={mainRef}>{matching.length===0?<div className="diff-state"><strong>{files.length?'No matching changes':'Empty diff'}</strong><span>{files.length?'Try a broader changed-file search.':'GitHub returned no textual or binary patch content.'}</span></div>:matching.map(file=><DiffFileView key={file.newPath} file={file} layout={layout} query={query} ignoreWhitespace={ignoreWhitespace} expandedContext={expandedContext} renderLimit={renderLimit} data={diffData} repository={repository} mode={mode} viewed={viewed.has(file.newPath)} onToggleViewed={()=>toggleViewed(file.newPath)} onExpandContext={()=>setExpandedContext(true)} onRenderMore={()=>setRenderLimit(value=>value+CHUNK)} onOpenOriginal={()=>openOriginal(file)}/>)}</main></div>}
  </div>;
}
