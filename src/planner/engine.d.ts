import type { ProjectData } from '../lib/schema';
export interface ScheduledTask {
  start: number | null; end: number | null; blocked: boolean; reason?: string;
  hold?: boolean; done?: boolean; alloc: Record<string, number>;
  manual?: boolean; shortfall?: number; endFraction?: number;
}
export interface Schedule {
  schedule: Record<string, ScheduledTask>;
  conflicts: Record<string, string[]>;
  working: Map<string, number>;
  featureInfo: Record<string, { start: number; end: number | null; endFraction?: number; blocked: boolean; allDone: boolean; atRisk: boolean; delta: number | null; manual?: boolean; forecastStart?: number; forecastEnd?: number | null; windowConflict?: boolean }>;
  errors: string[];
  dependencyConflicts: Record<string, string[]>;
}
export function createScheduler(data: ProjectData, options?: {legacyAllocation?: boolean}): {
  calculate(): Schedule;
  isHoliday(day: number): boolean;
  nonwork(day: number, person?: string): boolean;
  nextWork(day: number, person?: string): number;
  capacityParts(person: string, date: string): ProjectData['settings']['defaultCapacity'];
  meetingOccurs(meeting: { enabled: boolean; startDate: string; endDate: string; recurrence: string; weekday: number; interval: number; nth: number }, date: string): boolean;
  meetingMinutes(person: string, date: string): number;
  meetingDays(person: string, date: string): number;
  meetingHoursInIteration(person: string, iteration: ProjectData['iterations'][number]): number;
  featureCapacity(person: string, date: string): number;
};
