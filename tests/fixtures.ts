import { emptyWorkspace, type Workspace, type ProjectData } from '../src/lib/schema';
export function projectData(): ProjectData {
  const capacity = { feature: 100, bugs: 0, ongoing: 0, ops: 0 };
  return { version: 4, createdAt: '2026-10-23', settings: { observeHolidays: false, workHours: 8, defaultCapacity: capacity },
    roles: [{ id: 'r1', name: 'Backend Developer', platform: 'Backend' }],
    people: [{ id: 'u1', name: 'Alex Dev', firstName: 'Alex', lastName: 'Dev', role: 'Backend Developer', roleId: 'r1', platform: 'Backend', color: '#508fd0', capacity }],
    features: [{ id: 'f1', title: 'Accounts', description: '', start: '2026-10-26', baseline: '2026-11-30', color: '#7769e6', collapsed: false }],
    tasks: [{ id: 't1', featureId: 'f1', title: 'API', platform: 'Backend', assignee: 'u1', effort: 3, start: '2026-10-26', status: 'planned', dependsOn: [] }],
    iterations: [{ id: 'i1', name: 'Iteration 1', start: '2026-10-26', end: '2026-11-08', overrides: {} }],
    meetings: [], milestones: [], leave: [], holidays: [] };
}
export function fullWorkspace(): Workspace {
  const data = projectData();
  data.meetings.push({ id: 'mt1', title: 'Team sync', recurrence: 'weekly', weekday: 1, interval: 1, nth: 1, startDate: '2026-10-26', endDate: '', startTime: '09:00', duration: 30, allTeam: false, attendees: ['u1'], enabled: true });
  data.leave.push({ id: 'l1', person: 'u1', type: 'vacation', from: '2026-11-05', to: '2026-11-06', note: 'Holiday' });
  data.iterations[0].overrides.u1 = { feature: 70, bugs: 10, ongoing: 10, ops: 10 };
  data.tasks.push({ ...data.tasks[0], id: 't2', title: 'Validation', effort: 1, dependsOn: ['t1'] });
  data.roles.push({ id: 'rfront', name: 'Frontend Developer', platform: 'Frontend' });
  data.tasks.push({ ...data.tasks[0], id: 't3', title: 'Screens', platform: 'Frontend', assignee: '', effort: 2, dependsOn: [] });
  data.milestones.push({ id: 'm1', title: 'Release', date: '2026-11-20', color: '#7769e6', featureIds: ['f1'] });
  data.holidays.push({ date: '2026-12-25', name: 'Christmas' });
  return { ...emptyWorkspace(), activeId: 'project-shared-id', preferences: { scale: 'week', sidebarHidden: true }, projects: [{ id: 'project-shared-id', name: 'My project', onboardingStep: 0, data }] };
}
