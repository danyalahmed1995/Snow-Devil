import { useEffect, useRef, useState } from 'react';
import { Bookmark, Copy, Edit3, Pin, PinOff, Plus, Trash2, X } from 'lucide-react';
import type { TabFlowState } from '../../stores/flow-store';
import { openSavedView, useSavedViewsStore } from '../../stores/saved-views-store';

export function SavedViewsMenu({ current }: { current:TabFlowState }) {
  const [open,setOpen]=useState(false);
  const [name,setName]=useState('');
  const [editing,setEditing]=useState<string>();
  const root=useRef<HTMLDivElement>(null);
  const views=useSavedViewsStore(state=>state.views);
  const save=useSavedViewsStore(state=>state.save);
  const rename=useSavedViewsStore(state=>state.rename);
  const duplicate=useSavedViewsStore(state=>state.duplicate);
  const remove=useSavedViewsStore(state=>state.remove);
  const setPinned=useSavedViewsStore(state=>state.setPinned);
  useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};window.addEventListener('pointerdown',close);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key)}},[open]);
  const add=()=>{const view=save(name,current);setName('');openSavedView(view)};
  return <div className="saved-views" ref={root}>
    <button className="saved-views__trigger" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><Bookmark size={13}/>Saved views{views.length>0&&<span>{views.length}</span>}</button>
    {open&&<section className="saved-views__menu" role="dialog" aria-label="Personal saved views">
      <header><span><strong>Saved views</strong><small>Local to this device</small></span><button aria-label="Close saved views" onClick={()=>setOpen(false)}><X size={14}/></button></header>
      <div className="saved-views__create"><input aria-label="Saved view name" value={name} onChange={event=>setName(event.target.value)} placeholder="Name this Flow view" onKeyDown={event=>{if(event.key==='Enter')add()}}/><button onClick={add}><Plus size={13}/>Save current</button></div>
      <div className="saved-views__list">{views.length===0&&<p>No saved views yet.</p>}{views.map(view=><article key={view.id} className={view.unavailableReason?'is-unavailable':undefined}>
        <button className="saved-views__open" onClick={()=>{openSavedView(view);setOpen(false)}}><strong>{view.name}</strong><small>{view.unavailableReason??`${view.state.scope==='repository'?view.state.selectedRepository?.nameWithOwner??'Repository Flow':'Account Flow'} · ${view.state.timeRange??'7d'}`}</small></button>
        <div>{editing===view.id?<input autoFocus defaultValue={view.name} aria-label={`Rename ${view.name}`} onBlur={event=>{rename(view.id,event.target.value);setEditing(undefined)}} onKeyDown={event=>{if(event.key==='Enter'){rename(view.id,event.currentTarget.value);setEditing(undefined)}}}/>:<button data-tooltip="Rename saved view" aria-label={`Rename ${view.name}`} onClick={()=>setEditing(view.id)}><Edit3 size={12}/></button>}<button data-tooltip="Duplicate saved view" aria-label={`Duplicate ${view.name}`} onClick={()=>duplicate(view.id)}><Copy size={12}/></button><button data-tooltip={view.pinned?'Unpin saved view':'Pin saved view'} aria-label={`${view.pinned?'Unpin':'Pin'} ${view.name}`} onClick={()=>setPinned(view.id,!view.pinned)}>{view.pinned?<PinOff size={12}/>:<Pin size={12}/>}</button><button data-tooltip="Delete saved view" aria-label={`Delete ${view.name}`} onClick={()=>remove(view.id)}><Trash2 size={12}/></button></div>
      </article>)}</div>
    </section>}
  </div>;
}
