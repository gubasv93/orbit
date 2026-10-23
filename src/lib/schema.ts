import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const text = z.string().trim().min(1).max(200);
const date = z.iso.date().refine(value => value >= '2000-01-01' && value <= '2200-12-31', 'Date must be between 2000 and 2200');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const capacitySchema = z.object({
  feature: z.number().min(0).max(100), bugs: z.number().min(0).max(100),
  ongoing: z.number().min(0).max(100), ops: z.number().min(0).max(100),
}).refine(c => Math.abs(c.feature + c.bugs + c.ongoing + c.ops - 100) < 0.001, 'Capacity must total 100%');
const feature = z.object({ id, title: text, description: z.string().max(10000).default(''), start: date,
  baseline: date, collapsed: z.boolean().default(false), color }).refine(f => f.baseline >= f.start, 'Baseline precedes start');
const task = z.object({ id, featureId: id, title: text, platform: text, assignee: id.or(z.literal('')),
  effort: z.number().min(0.1).max(3650), remaining: z.number().min(0).max(3650).optional(), start: date,
  completedDate: date.optional(), status: z.enum(['planned', 'progress', 'hold', 'done']), dependsOn: z.array(id).max(1000) });
const role = z.object({ id, name: text, platform: text });
const person = z.object({ id, name: text, firstName: z.string().max(100), lastName: z.string().max(100),
  roleId: id, role: text, platform: text, color, capacity: capacitySchema });
const meeting = z.object({ id, title: text, recurrence: z.enum(['workdays', 'weekly', 'interval', 'monthly']),
  weekday: z.number().int().min(0).max(6), interval: z.number().int().min(1).max(12),
  nth: z.union([z.literal(-1), z.number().int().min(1).max(5)]), startDate: date,
  endDate: date.or(z.literal('')), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration: z.number().int().min(5).max(480), allTeam: z.boolean(), attendees: z.array(id).max(1000), enabled: z.boolean(),
  requiresAttendeeReview: z.boolean().optional(), copiedFromProjectId: id.optional(), copiedFromMeetingId: id.optional(),
}).refine(m => !m.endDate || m.endDate >= m.startDate, 'Meeting end precedes start');

export const projectDataSchema = z.object({
  version: z.number().int().min(3).max(4), features: z.array(feature).max(1000), tasks: z.array(task).max(3000),
  people: z.array(person).max(1000), roles: z.array(role).max(1000), meetings: z.array(meeting).max(1000),
  leave: z.array(z.object({ id, person: id, type: z.enum(['vacation', 'sick', 'dayoff']), from: date, to: date,
    note: z.string().max(2000).default('') }).refine(l => l.to >= l.from, 'Leave end precedes start')).max(3000),
  iterations: z.array(z.object({ id, name: text, start: date, end: date,
    overrides: z.record(id, capacitySchema) }).refine(i => i.end >= i.start, 'Iteration end precedes start')).min(1).max(500),
  milestones: z.array(z.object({ id, title: text, date, color, featureIds: z.array(id).max(1000) })).max(1000),
  holidays: z.array(z.object({ date, name: text })).max(1000),
  settings: z.object({ observeHolidays: z.boolean(), workHours: z.number().min(1).max(24), defaultCapacity: capacitySchema }),
  createdAt: date,
}).superRefine((data, context) => {
  const fail = (message: string) => context.addIssue({ code: 'custom', message });
  for (const key of ['features', 'tasks', 'people', 'roles', 'meetings', 'leave', 'iterations', 'milestones'] as const) {
    if (new Set(data[key].map(r => r.id)).size !== data[key].length) fail(`Duplicate ${key} identifiers`);
  }
  if (new Set(data.holidays.map(h => h.date)).size !== data.holidays.length) fail('Duplicate holiday dates');
  const features = new Set(data.features.map(f => f.id)), tasks = new Map(data.tasks.map(t => [t.id, t]));
  const people = new Map(data.people.map(p => [p.id, p])), roles = new Map(data.roles.map(r => [r.id, r]));
  for (const p of data.people) if (!roles.has(p.roleId) || roles.get(p.roleId)?.platform !== p.platform) fail('Invalid team role');
  for (const t of data.tasks) {
    if (!features.has(t.featureId)) fail('Invalid task feature');
    if (t.assignee && people.get(t.assignee)?.platform !== t.platform) fail('Invalid task assignee');
    if (new Set(t.dependsOn).size !== t.dependsOn.length || t.dependsOn.some(d => !tasks.has(d))) fail('Invalid dependency');
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    if (tasks.get(key)?.dependsOn.some(visit)) return true;
    visiting.delete(key); visited.add(key); return false;
  };
  if (data.tasks.some(t => visit(t.id))) fail('Circular dependencies are not allowed');
  if (data.leave.some(l => !people.has(l.person))) fail('Invalid time-off owner');
  if (data.meetings.some(m => m.attendees.some(p => !people.has(p)))) fail('Invalid meeting attendee');
  if (data.iterations.some(i => Object.keys(i.overrides).some(p => !people.has(p)))) fail('Invalid capacity override');
  if (data.milestones.some(m => m.featureIds.some(f => !features.has(f)))) fail('Invalid milestone feature');
});

export const workspaceSchema = z.object({
  version: z.literal(1), activeId: id.nullable(),
  preferences: z.object({ page: z.enum(['timeline','capacity','team','availability','milestones']).optional(), sidebarHidden: z.boolean().optional(), scale: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional() }).default({}),
  projects: z.array(z.object({ id, name: z.string().trim().min(1).max(100),
    onboardingStep: z.number().int().min(0).max(2).default(0), data: projectDataSchema })).max(100),
}).superRefine((w, context) => {
  if (new Set(w.projects.map(p => p.id)).size !== w.projects.length ||
      (w.projects.length ? !w.projects.some(p => p.id === w.activeId) : w.activeId !== null)) {
    context.addIssue({ code: 'custom', message: 'Invalid project selection or duplicate project identifiers' });
  }
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type ProjectData = z.infer<typeof projectDataSchema>;
export const emptyWorkspace = (): Workspace => ({ version: 1, activeId: null, projects: [], preferences: {} });

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const loginPasswordSchema = z.string().min(1).max(72, 'Password cannot exceed 72 bytes').refine(value => new TextEncoder().encode(value).length <= 72, 'Password cannot exceed 72 bytes; some characters use more than one byte');
export const passwordSchema = loginPasswordSchema.refine(value => [...value].length >= 8, 'Use at least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a number');
export const signupSchema = z.object({ email: emailSchema, password: passwordSchema, confirm: z.string() })
  .refine(v => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });
