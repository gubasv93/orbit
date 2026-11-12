import {describe,expect,it} from 'vitest';
import {legacyMonthlyCustomAnchor} from '../src/planner/meeting-recurrence-form';

describe('legacy monthly to custom recurrence anchoring',()=>{
  it('keeps the selected weekday when Active from falls on another weekday',()=>{
    expect(legacyMonthlyCustomAnchor('2026-11-02',4,2)).toBe('2026-11-12');
    expect(legacyMonthlyCustomAnchor('2026-11-12',4,2)).toBe('2026-11-12');
    expect(legacyMonthlyCustomAnchor('2026-11-13',4,2)).toBe('2026-12-10');
  });
  it('keeps Last distinct from fourth and skips months without a fifth weekday',()=>{
    expect(legacyMonthlyCustomAnchor('2026-11-01',5,4)).toBe('2026-11-27');
    expect(legacyMonthlyCustomAnchor('2026-11-01',5,-1)).toBe('2026-11-27');
    expect(legacyMonthlyCustomAnchor('2026-12-01',5,4)).toBe('2026-12-25');
    expect(legacyMonthlyCustomAnchor('2026-01-01',5,-1)).toBe('2026-01-30');
    expect(legacyMonthlyCustomAnchor('2026-11-01',4,5)).toBe('2026-12-31');
  });
  it('rejects malformed rules and remains within the supported calendar',()=>{
    expect(legacyMonthlyCustomAnchor('2026-02-30',4,1)).toBeUndefined();
    expect(legacyMonthlyCustomAnchor('2026-11-02',7,2)).toBeUndefined();
    expect(legacyMonthlyCustomAnchor('2026-11-02',4,0)).toBeUndefined();
    expect(legacyMonthlyCustomAnchor('2200-12-31',1,1)).toBeUndefined();
  });
});
