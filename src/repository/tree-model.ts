import type { RepositoryEntry } from './repository-types';

export interface TreeRow extends RepositoryEntry { depth:number; matched?:boolean; forcedOpen?:boolean }

export function ancestorsOf(path:string){const parts=path.split('/');return parts.slice(0,-1).map((_,index)=>parts.slice(0,index+1).join('/'));}

export function filterTreeEntries(entries:RepositoryEntry[],query:string){
  const needle=query.trim().toLowerCase();
  if(!needle)return new Set(entries.map(entry=>entry.path));
  const visible=new Set<string>();
  for(const entry of entries)if(entry.path.toLowerCase().includes(needle)){visible.add(entry.path);for(const parent of ancestorsOf(entry.path))visible.add(parent);}
  return visible;
}

export function flatEntriesToRows(entries:RepositoryEntry[],query:string):TreeRow[]{
  const byParent=new Map<string,RepositoryEntry[]>();
  for(const entry of entries){const parent=entry.path.includes('/')?entry.path.slice(0,entry.path.lastIndexOf('/')):'';const list=byParent.get(parent)??[];list.push(entry);byParent.set(parent,list);}
  const visible=filterTreeEntries(entries,query);const needle=query.trim().toLowerCase();const rows:TreeRow[]=[];
  const walk=(parent:string,depth:number)=>{for(const entry of (byParent.get(parent)??[]).sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==='tree'?-1:1)){if(!visible.has(entry.path))continue;rows.push({...entry,depth,matched:!!needle&&entry.path.toLowerCase().includes(needle),forcedOpen:!!needle&&entry.type==='tree'});if(entry.type==='tree')walk(entry.path,depth+1);}};
  walk('',0);return rows;
}
