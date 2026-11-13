import {describe,expect,it} from 'vitest';
import {groupMilestones} from '../src/planner/milestone-layout';

describe('same-date milestone groups',()=>{
  it('keeps each milestone reachable in one chronological group without merging neighboring dates',()=>{
    const first={id:'release',date:'2026-11-20',title:'Public launch'};
    const second={id:'security',date:'2026-11-20',title:'Security sign-off'};
    const next={id:'followup',date:'2026-11-21',title:'Launch review'};
    const earlier={id:'beta',date:'2026-11-19',title:'Beta'};
    expect(groupMilestones([first,next,second,earlier])).toEqual([
      {date:'2026-11-19',items:[earlier]},
      {date:'2026-11-20',items:[first,second]},
      {date:'2026-11-21',items:[next]},
    ]);
  });

  it('does not mutate a frozen source or lose distinct milestones with identical names',()=>{
    const first=Object.freeze({id:'first',date:'2026-11-20',title:'Release',featureIds:['f1']});
    const second=Object.freeze({id:'second',date:'2026-11-20',title:'Release',featureIds:['f2']});
    const source=Object.freeze([first,second]);
    const result=groupMilestones(source);
    expect(result).toEqual([{date:'2026-11-20',items:[first,second]}]);
    expect(result[0].items[0]).toBe(first);
    expect(result[0].items[1]).toBe(second);
    result[0].items.pop();
    expect(source).toHaveLength(2);
  });

  it('updates groups after moving or deleting an individual milestone',()=>{
    const source=[{id:'a',date:'2026-11-20'},{id:'b',date:'2026-11-20'},{id:'c',date:'2026-11-21'}];
    expect(groupMilestones(source).map(group=>group.items.length)).toEqual([2,1]);
    const moved=source.map(item=>item.id==='a'?{...item,date:'2026-11-21'}:item);
    expect(groupMilestones(moved).map(group=>({date:group.date,ids:group.items.map(item=>item.id)}))).toEqual([
      {date:'2026-11-20',ids:['b']},{date:'2026-11-21',ids:['a','c']},
    ]);
    expect(groupMilestones(moved.filter(item=>item.id!=='b'))).toEqual([{date:'2026-11-21',items:[moved[0],moved[2]]}]);
  });

  it('handles the project limit without dropping or duplicating milestones',()=>{
    const source=Array.from({length:1000},(_,index)=>({id:'m'+index,date:index%2?'2026-11-21':'2026-11-20'}));
    const grouped=groupMilestones(source);
    expect(grouped.map(group=>group.items.length)).toEqual([500,500]);
    expect(new Set(grouped.flatMap(group=>group.items.map(item=>item.id))).size).toBe(1000);
    expect(groupMilestones([])).toEqual([]);
  });
});
