import type { CheckTimingSample, DeliveryEvent } from './types';

export interface CheckTimingResult { samples:CheckTimingSample[]; excludedCount:number; excludedReasons:Record<string,number> }

export function pairCheckTimings(events:DeliveryEvent[]):CheckTimingResult{
  const checkEvents=events.filter(event=>event.type.startsWith('check_'));const groups=new Map<string,DeliveryEvent[]>();let missingIdentity=0;
  for(const event of checkEvents){if(!event.checkRunId){missingIdentity++;continue}const list=groups.get(event.checkRunId)??[];list.push(event);groups.set(event.checkRunId,list)}
  const samples:CheckTimingSample[]=[];const reasons:Record<string,number>={missing_identity:missingIdentity};
  const exclude=(reason:string)=>{reasons[reason]=(reasons[reason]??0)+1};
  for(const[checkRunId,group]of groups){const ordered=[...group].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));const started=ordered.find(event=>event.type==='check_started');const terminal=[...ordered].reverse().find(event=>['check_succeeded','check_failed','check_cancelled'].includes(event.type));if(!started){exclude('missing_start');continue}if(!terminal){exclude('missing_completion');continue}const start=new Date(started.occurredAt).getTime(),end=new Date(terminal.occurredAt).getTime();if(!Number.isFinite(start)||!Number.isFinite(end)||end<start){exclude('invalid_order');continue}const conclusion=terminal.type==='check_succeeded'?'success':terminal.type==='check_cancelled'?'cancelled':terminal.type==='check_failed'?'failure':'skipped';samples.push({checkRunId,entityId:terminal.entityId,repositoryId:terminal.repositoryId,name:terminal.checkName??started.checkName??'Check run',startedAt:started.occurredAt,completedAt:terminal.occurredAt,conclusion,durationHours:(end-start)/3600000,required:terminal.requiredCheck??started.requiredCheck,confidence:'exact'})}
  return{samples,excludedCount:Object.values(reasons).reduce((sum,value)=>sum+value,0),excludedReasons:reasons};
}
