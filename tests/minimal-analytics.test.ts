import {describe,expect,it} from 'vitest';
import {minimalAnalytics} from '../src/lib/minimal-analytics';

const pageviews={pageviews:42,days:30,startedAt:'2026-11-01T00:00:00Z'};
const snapshot={trackingStartedAt:'2026-10-31T00:00:00Z',generatedAt:'2026-11-01T12:00:00Z',periodDays:30,coverage:{history:'Inventory baseline',poker:'Operational rooms',engagement:'Retired timing'},totals:{accounts:3,deletedAccounts:1,current:{projects:4},poker:{games:2},planner:{sessions:9,activeSeconds:999}},users:[{id:'own-user',current:{projects:4},projects:[{id:'own-project'}],poker:{games:2},planner:{lastSeenAt:'2026-11-01T11:00:00Z'}}],landing:{visitors:7,activeSeconds:999},landingPageviews:{pageviews:9999}};
describe('manager minimal analytics response',()=>{
 it('keeps operational resources and deletion facts while stripping retired engagement at every level',()=>{
  const before=structuredClone(snapshot),result=minimalAnalytics(snapshot,pageviews);
  expect(result).toMatchObject({trackingStartedAt:snapshot.trackingStartedAt,totals:{accounts:3,deletedAccounts:1,current:{projects:4},poker:{games:2}},users:[{id:'own-user',projects:[{id:'own-project'}]}],landingPageviews:pageviews});
  expect(result).not.toHaveProperty('landing');expect(result.totals).not.toHaveProperty('planner');expect(result.coverage).not.toHaveProperty('engagement');expect(result.users[0]).not.toHaveProperty('planner');
  expect(snapshot).toEqual(before);
 });
 it.each([{...pageviews,pageviews:-1},{...pageviews,pageviews:0.5},{...pageviews,startedAt:'unknown'},{...pageviews,days:0},null])('rejects invalid aggregate values instead of exposing misleading counts %#',value=>{
  expect(()=>minimalAnalytics(snapshot,value)).toThrow();
 });
 it('does not accept a malformed operational response',()=>{
  for(const value of [null,[],{...snapshot,users:null},{...snapshot,totals:null},{...snapshot,coverage:null}])expect(()=>minimalAnalytics(value,pageviews)).toThrow();
 });
});
