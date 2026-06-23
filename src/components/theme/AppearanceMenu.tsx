import { useEffect, useRef, useState } from 'react';
import { Check, Settings2 } from 'lucide-react';
import { THEMES } from '../../theme/theme-registry';
import { useThemeStore } from '../../stores/theme-store';
import './Theme.css';

export function AppearanceMenu() {
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const themeId=useThemeStore(state=>state.themeId);
  const setTheme=useThemeStore(state=>state.setTheme);
  useEffect(()=>{ if(!open)return; const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)}; window.addEventListener('pointerdown',close); return()=>window.removeEventListener('pointerdown',close); },[open]);
  return <div className="appearance-menu" ref={root}><button className="icon-button" aria-label="Appearance settings" title="Appearance settings" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><Settings2 size={17}/></button>{open&&<section className="appearance-popover glass-panel-strong" role="dialog" aria-label="Appearance settings"><header><div><strong>Appearance</strong><span>Theme applies everywhere</span></div></header><div role="radiogroup" aria-label="Theme">{THEMES.map(theme=><button role="radio" aria-checked={theme.id===themeId} className={theme.id===themeId?'is-selected':''} key={theme.id} onClick={()=>setTheme(theme.id)}><i style={{background:`linear-gradient(135deg,${theme.swatch[0]} 0 42%,${theme.swatch[1]} 42% 72%,${theme.swatch[2]} 72%)`}}/><span><strong>{theme.name}</strong><small>{theme.description}</small></span>{theme.id===themeId&&<Check size={14}/>}</button>)}</div></section>}</div>;
}
