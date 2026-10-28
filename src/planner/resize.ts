import {asDay,fromDay} from './dates.js';

type Bounds={start:number|null;end:number|null;endFraction?:number};
export type ResizeEdge='start'|'end';
// Starts remain calendar dates. End handles use half-day planning slots.
// Resizing pins a date window and preserves the item's estimate and children.
export function resizeWindow(bounds:Bounds,edge:ResizeEdge,deltaDays:number){
 if(bounds.start===null||bounds.end===null||!Number.isFinite(deltaDays))return null;
 const first=asDay('2000-01-01'),last=asDay('2200-12-31');
 let start=bounds.start,finish=bounds.end+(bounds.endFraction??1);
 if(!Number.isFinite(start)||!Number.isFinite(finish)||finish<=start)return null;
 if(edge==='start')start=Math.max(first,Math.ceil(finish-3650),Math.min(Math.floor(finish-.5),start+Math.round(deltaDays)));
 else finish=Math.max(start+.5,Math.min(last+1,start+3650,finish+Math.round(deltaDays*2)/2));
 const end=Math.ceil(finish)-1;
 return {start:fromDay(start),manualEnd:fromDay(end),manualEndFraction:finish-end as .5|1};
}
