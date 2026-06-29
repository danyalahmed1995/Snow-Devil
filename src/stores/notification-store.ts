import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NativeNotification {
  id:string; unread:boolean; reason:string; updatedAt:string; lastReadAt?:string;
  subject:{title:string;type:string;apiUrl?:string;latestCommentUrl?:string};
  repository:{fullName:string;htmlUrl?:string};
}
interface NotificationStore { records:NativeNotification[]; localRead:Record<string,boolean>; snoozedUntil:Record<string,string>; setRecords:(records:NativeNotification[])=>void;setRead:(id:string,read:boolean)=>void;snooze:(id:string,until:string)=>void }

/** Newest record wins; stable IDs prevent duplicate counters and routes. */
export function normalizeNotifications(records: NativeNotification[]): NativeNotification[] {
  const unique = new Map<string, NativeNotification>();
  for (const record of records) {
    if (!record?.id || !record.subject?.title || !record.repository?.fullName) continue;
    const previous = unique.get(record.id);
    if (!previous || Date.parse(record.updatedAt) >= Date.parse(previous.updatedAt)) unique.set(record.id, record);
  }
  return [...unique.values()].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
}

export const useNotificationStore=create<NotificationStore>()(persist(set=>({
  records:[],localRead:{},snoozedUntil:{},
  setRecords:records=>set({records:normalizeNotifications(records)}),
  setRead:(id,read)=>set(state=>({localRead:{...state.localRead,[id]:read}})),
  snooze:(id,until)=>set(state=>({snoozedUntil:{...state.snoozedUntil,[id]:until}})),
}),{name:'snow-devil-notifications',version:2,partialize:state=>({records:state.records,localRead:state.localRead,snoozedUntil:state.snoozedUntil})}));
export const effectiveUnread=(record:NativeNotification,localRead:Record<string,boolean>)=>localRead[record.id]===undefined?record.unread:!localRead[record.id];
export const activeNotifications=(records:NativeNotification[],snoozed:Record<string,string>,now=Date.now())=>records.filter(record=>!snoozed[record.id]||new Date(snoozed[record.id]).getTime()<=now);
