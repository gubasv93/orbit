import {describe,expect,it} from 'vitest';
import {measuredActiveMilliseconds} from '../src/components/activity-analytics';

describe('visible focused activity time',()=>{
 it('counts recent visible focused use and excludes hidden, unfocused and idle time',()=>{
  expect(measuredActiveMilliseconds(1000,true,true,10000)).toBe(1000);
  expect(measuredActiveMilliseconds(1000,false,true,10000)).toBe(0);
  expect(measuredActiveMilliseconds(1000,true,false,10000)).toBe(0);
  expect(measuredActiveMilliseconds(1000,true,true,60001)).toBe(0);
 });
 it('does not turn suspended timers or a backwards clock into engagement',()=>{
  expect(measuredActiveMilliseconds(90000,true,true,200)).toBe(1500);
  expect(measuredActiveMilliseconds(-50,true,true,200)).toBe(0);
  expect(measuredActiveMilliseconds(1000,true,true,-100)).toBe(0);
 });
});
