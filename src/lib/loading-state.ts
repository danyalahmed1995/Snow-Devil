export const LOADING_INDICATOR_DELAY_MS=140;
export function scheduleDelayedStage(update:(label:string)=>void,label:string,delay=LOADING_INDICATOR_DELAY_MS){return window.setTimeout(()=>update(label),delay);}
export function measurableProgress(completed:number,total?:number){if(!total||total<=0)return null;return Math.max(0,Math.min(100,Math.round(completed/total*100)));}
