import {asDay,fromDay} from './dates.js';
export const firstTimelineDay=asDay('2000-01-01'),lastTimelineDay=asDay('2200-12-31');
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
export function timelineWindow(date:string,days:number,cell:number,viewport:number){
 const count=Math.min(lastTimelineDay-firstTimelineDay+1,Math.max(days,Math.ceil(Math.max(1,viewport)/cell)*3));
 const start=clamp(asDay(date)-Math.floor(count/3),firstTimelineDay,lastTimelineDay-count+1);
 return {rangeStart:fromDay(start),days:count};
}
export function focusOffset(date:string,start:string,cell:number,width:number){return Math.max(0,(asDay(date)-asDay(start))*cell-width*.25);}
// Slide a bounded canvas when its edge is reached, retaining exactly the same
// date at the same screen position. The DOM does not grow with panning distance.
export function slideTimeline(start:string,days:number,cell:number,left:number,width:number){
 const max=Math.max(0,days*cell-width),threshold=Math.min(100,max/8);
 if(max===0||left>threshold&&left<max-threshold)return null;
 const step=Math.max(1,Math.floor((days-width/cell)/2)),day=asDay(start);
 const next=clamp(day+(left<=threshold?-step:step),firstTimelineDay,lastTimelineDay-days+1);
 if(next===day)return null;
 return {rangeStart:fromDay(next),left:left+(day-next)*cell};
}
