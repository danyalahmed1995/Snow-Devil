import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, FileSearch, Search, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { demoAllEntries } from '../../repository/demo-repository';
import { classifyRepositorySearchError, matchesRepositorySearch, toGitHubCodeQuery, type RepositorySearchResult } from '../../repository/repository-search';

interface SearchResponse { total_count?: number; incomplete_results?: boolean; items?: Array<{ name?:string;path?:string;html_url?:string;score?:number;repository?:{full_name?:string} }> }
const cache = new Map<string, { total:number; incomplete:boolean; results:RepositorySearchResult[] }>();
const RECENT_KEY = 'snow-devil-repository-searches';
function recentSearches(): string[] { try { const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 8) : []; } catch { return []; } }

export function RepositorySearchPanel({ repository, reference, demo, onClose, onSelect }: { repository:string; reference:string; demo:boolean; onClose:()=>void; onSelect:(path:string)=>Promise<void>|void }) {
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const [results,setResults]=useState<RepositorySearchResult[]>([]);
  const [total,setTotal]=useState(0);
  const [incomplete,setIncomplete]=useState(false);
  const [status,setStatus]=useState('Search every indexed file in this repository.');
  const [recent,setRecent]=useState(recentSearches);
  const generation=useRef(0);
  const githubQuery=useMemo(()=>toGitHubCodeQuery(query,repository),[query,repository]);

  useEffect(()=>{
    if(!query.trim()){setResults([]);setTotal(0);setIncomplete(false);setStatus('Search every indexed file in this repository.');return;}
    const id=++generation.current;
    const timer=window.setTimeout(async()=>{
      const key=`${repository}@${reference}:${page}:${githubQuery}`;
      setStatus('Searching entire repository…');
      try{
        let value=cache.get(key);
        if(!value){
          if(demo){const all=demoAllEntries().filter(entry=>entry.type==='blob'&&matchesRepositorySearch(entry.path,query));const start=(page-1)*30;value={total:all.length,incomplete:false,results:all.slice(start,start+30).map(entry=>({name:entry.name,path:entry.path,repository}))};}
          else {const response=await invoke<SearchResponse>('search_repository',{owner:repository.split('/')[0],name:repository.split('/')[1],query:githubQuery,page,perPage:30});value={total:response.total_count??0,incomplete:!!response.incomplete_results,results:(response.items??[]).flatMap(item=>item.path?[{path:item.path,name:item.name??item.path.split('/').pop()??item.path,htmlUrl:item.html_url,score:item.score,repository:item.repository?.full_name}]:[])}}
          cache.set(key,value);
        }
        if(id!==generation.current)return;
        setResults(value.results);setTotal(value.total);setIncomplete(value.incomplete);
        setStatus(value.total?`${value.total.toLocaleString()} result${value.total===1?'':'s'}${value.incomplete?' · GitHub reports partial indexing':''}`:'No results in the entire repository.');
        const next=[query.trim(),...recentSearches().filter(item=>item!==query.trim())].slice(0,8);localStorage.setItem(RECENT_KEY,JSON.stringify(next));setRecent(next);
      }catch(cause){
        if(id!==generation.current)return;
        const kind=classifyRepositorySearchError(cause);setResults([]);setTotal(0);
        setStatus(kind==='rate-limit'?'GitHub rate limit reached. Try again later.':kind==='authentication'?'Search permission expired. Reconnect GitHub.':kind==='not-found'?'This repository is unavailable or your account cannot access it.':kind==='network'?'Repository search is offline. Loaded-tree filtering still works.':'Repository search is unavailable. Loaded-tree filtering still works.');
      }
    },260);
    return()=>{window.clearTimeout(timer);generation.current++;};
  },[demo,githubQuery,page,query,reference,repository]);

  const pages=Math.max(1,Math.ceil(total/30));
  return <section className="repo-full-search" role="dialog" aria-modal="false" aria-label="Search entire repository"><header><div><FileSearch size={16}/><span><strong>Search entire repository</strong><small>{repository} · {reference}{demo?' · offline fixture':' · GitHub code index'}</small></span></div><button aria-label="Close repository search" onClick={onClose}><X size={16}/></button></header><div className="repo-full-search__query"><Search size={15}/><input autoFocus aria-label="Entire repository query" value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} placeholder={'path:src filename:parser.ts or ext:md "exact phrase"'}/>{query&&<button aria-label="Clear query" onClick={()=>setQuery('')}><X size={14}/></button>}</div><p className="repo-full-search__help">Supports <code>path:</code>, <code>folder:</code>, <code>filename:</code>, <code>ext:</code>, and one exact phrase. This search is separate from the loaded-tree filter.</p><div className="repo-full-search__status" aria-live="polite">{status}</div>{!query&&recent.length>0&&<div className="repo-full-search__recent"><strong><Clock3 size={12}/> Recent searches</strong>{recent.map(item=><button key={item} onClick={()=>setQuery(item)}>{item}</button>)}</div>}<div className="repo-full-search__results">{results.map(result=><button key={result.path} onClick={()=>void onSelect(result.path)}><FileSearch size={14}/><span><strong>{result.name}</strong><small>{result.path}</small></span></button>)}</div>{total>30&&<footer><button disabled={page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={14}/>Previous</button><span>Page {page} of {pages}</span><button disabled={page>=pages} onClick={()=>setPage(value=>value+1)}>Next<ChevronRight size={14}/></button></footer>}{incomplete&&<p className="repo-full-search__warning">Results may be incomplete while GitHub indexes this repository.</p>}</section>;
}
