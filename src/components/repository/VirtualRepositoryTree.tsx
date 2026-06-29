import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { TreeRow } from '../../repository/tree-model';
import { TreeFileIcon } from './TreeFileIcon';

const ROW_HEIGHT=28;const OVERSCAN=12;const WINDOW_THRESHOLD=180;
export interface VirtualTreeHandle { reveal:(path:string)=>void; focus:(path:string)=>void }
export function repositoryTreeWindow(rowCount:number,scrollTop:number,height:number){if(rowCount<=WINDOW_THRESHOLD)return{start:0,end:rowCount,virtual:false};const start=Math.max(0,Math.floor(Math.max(0,scrollTop-39)/ROW_HEIGHT)-OVERSCAN);const end=Math.min(rowCount,Math.ceil((Math.max(0,scrollTop-39)+height)/ROW_HEIGHT)+OVERSCAN);return{start,end,virtual:true}}

export const VirtualRepositoryTree=forwardRef<VirtualTreeHandle,{
  repository:string;rows:TreeRow[];expanded:Set<string>;selectedPath:string;selectedRoot:boolean;focusedPath:string;query:string;initialScrollTop:number;
  onRoot:()=>void;onOpen:(row:TreeRow)=>void;onFocus:(path:string)=>void;onKeyDown:(event:React.KeyboardEvent)=>void;onScroll:(value:number)=>void;
}>(function VirtualRepositoryTree({repository,rows,expanded,selectedPath,selectedRoot,focusedPath,query,initialScrollTop,onRoot,onOpen,onFocus,onKeyDown,onScroll},ref){
  const container=useRef<HTMLDivElement>(null);const[scrollTop,setScrollTop]=useState(initialScrollTop);const[height,setHeight]=useState(400);
  useEffect(()=>{const element=container.current;if(!element)return;element.scrollTop=initialScrollTop;if(typeof ResizeObserver==='undefined'){setHeight(element.clientHeight||400);return}const observer=new ResizeObserver(entries=>setHeight(entries[0]?.contentRect.height??400));observer.observe(element);return()=>observer.disconnect()},[initialScrollTop]);
  const windowed=repositoryTreeWindow(rows.length,scrollTop,height);const{start,end,virtual}=windowed;const visible=rows.slice(start,end);
  const indexes=useMemo(()=>new Map(rows.map((row,index)=>[row.path,index])),[rows]);
  const reveal=(path:string)=>{const index=indexes.get(path);if(index==null||!container.current)return;const top=39+index*ROW_HEIGHT;const bottom=top+ROW_HEIGHT;if(top<container.current.scrollTop)container.current.scrollTop=top;else if(bottom>container.current.scrollTop+container.current.clientHeight)container.current.scrollTop=bottom-container.current.clientHeight;};
  useImperativeHandle(ref,()=>({reveal,focus:(path:string)=>{reveal(path);requestAnimationFrame(()=>container.current?.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(path)}"]`)?.focus())}}),[indexes]);
  return <div role="tree" aria-label={`${repository} file tree`} className="repo-tree__rows" ref={container} onKeyDown={onKeyDown} onScroll={event=>{const value=event.currentTarget.scrollTop;setScrollTop(value);onScroll(value)}}>
    <button role="treeitem" aria-expanded="true" aria-level={1} aria-selected={selectedRoot} className={`repo-tree__root ${selectedRoot?'is-selected':''}`} title={`Repository root ${repository}`} data-tree-root="true" onClick={onRoot}><ChevronDown className="tree-chevron" size={12}/><TreeFileIcon path={repository} type="tree" open/><span>{repository}</span></button>
    <div className={virtual?'repo-tree__virtual-canvas':undefined} style={virtual?{height:rows.length*ROW_HEIGHT}:undefined}>
      {visible.map((entry,offset)=>{const index=start+offset;return <button role="treeitem" aria-level={entry.depth+1} aria-expanded={entry.type==='tree'?(entry.forcedOpen||expanded.has(entry.path)):undefined} aria-selected={entry.path===selectedPath} data-tree-path={entry.path} className={`repo-tree__row ${entry.type==='tree'?'repo-tree__row--folder':'repo-tree__row--file'} ${entry.path===selectedPath?'is-selected ':''}${entry.path===focusedPath?'is-focused ':''}${entry.matched?'is-match':''}`} style={{paddingLeft:10+entry.depth*16,...(virtual?{position:'absolute',top:index*ROW_HEIGHT,left:0,right:0}:undefined)}} key={entry.path} onFocus={()=>onFocus(entry.path)} onClick={()=>onOpen(entry)} title={entry.path} aria-label={`${entry.type==='tree'?'Folder':'File'} ${entry.path}`}>{entry.depth>1&&<span className="repo-tree__connector" style={{left:4+entry.depth*16}} aria-hidden="true"/>}{entry.type==='tree'?(entry.forcedOpen||expanded.has(entry.path)?<ChevronDown className="tree-chevron" size={12}/>:<ChevronRight className="tree-chevron" size={12}/>):<span className="tree-chevron"/>}<TreeFileIcon path={entry.path} type={entry.type} open={entry.type==='tree'&&(entry.forcedOpen||expanded.has(entry.path))}/><Highlighted value={entry.name} query={query}/></button>})}
    </div>
    {virtual&&<span className="sr-only">Windowed tree: {visible.length} of {rows.length} visible rows rendered</span>}
  </div>;
});

function Highlighted({value,query}:{value:string;query:string}){const index=value.toLowerCase().indexOf(query.trim().toLowerCase());if(index<0||!query.trim())return <span>{value}</span>;return <span>{value.slice(0,index)}<mark>{value.slice(index,index+query.trim().length)}</mark>{value.slice(index+query.trim().length)}</span>}
