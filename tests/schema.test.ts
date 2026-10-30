import { expect, it } from 'vitest';
import { signupSchema, workspaceSchema, emptyWorkspace } from '../src/lib/schema';
import { fullWorkspace } from './fixtures';
it('accepts an empty private workspace and complete backups', () => { expect(workspaceSchema.parse(emptyWorkspace()).projects).toEqual([]); expect(workspaceSchema.parse(fullWorkspace())).toEqual(fullWorkspace()); });
it('validates passwords and confirmation without requiring special characters', () => {
  expect(signupSchema.safeParse({ firstName:'Sam', lastName:'Reed', email: ' Test@example.com ', password: 'pass1234', confirm: 'pass1234' }).success).toBe(true);
  for (const password of ['abcdefghi','123456789','a1','a1'.repeat(37)]) expect(signupSchema.safeParse({ firstName:'Sam', lastName:'Reed', email: 'test@example.com', password, confirm: password }).success).toBe(false);
  expect(signupSchema.safeParse({ firstName:'Sam', lastName:'Reed', email: 'test@example.com', password: 'pass1234', confirm: 'different' }).success).toBe(false);
});
it('rejects broken relationships, CSS injection, cycles, and invalid dates', () => {
  for (const mutate of [
    (w: ReturnType<typeof fullWorkspace>) => { w.projects[0].data.tasks[0].dependsOn = ['t2']; },
    (w: ReturnType<typeof fullWorkspace>) => { w.projects[0].data.people[0].color = 'red; background:url(https://example.com)'; },
    (w: ReturnType<typeof fullWorkspace>) => { w.projects[0].data.leave[0].from = '2026-02-30'; },
    (w: ReturnType<typeof fullWorkspace>) => { w.projects[0].data.tasks[0].assignee = 'another-project-person'; },
  ]) { const w = fullWorkspace(); mutate(w); expect(workspaceSchema.safeParse(w).success).toBe(false); }
});

it('enforces the provider byte limit for multibyte passwords', () => {
  const valid='A1'+'é'.repeat(35), invalid='A1'+'é'.repeat(36);
  expect(signupSchema.safeParse({firstName:'Sam',lastName:'Reed',email:'test@example.com',password:valid,confirm:valid}).success).toBe(true);
  expect(signupSchema.safeParse({firstName:'Sam',lastName:'Reed',email:'test@example.com',password:invalid,confirm:invalid}).success).toBe(false);
});

it('requires trimmed first and last names while supporting international names', () => {
  const input={email:'test@example.com',password:'LocalPass9',confirm:'LocalPass9',firstName:'  Олена  ',lastName:'Д’Арк'};
  expect(signupSchema.parse(input)).toMatchObject({firstName:'Олена',lastName:'Д’Арк'});
  for(const changed of [{firstName:''},{lastName:'  '},{firstName:'A'.repeat(101)},{lastName:'Reed\nAdmin'}])expect(signupSchema.safeParse({...input,...changed}).success).toBe(false);
  const {firstName:unused,...withoutName}=input;expect(signupSchema.safeParse(withoutName).success).toBe(false);
});

it('round-trips title-only sub-items while still rejecting negative effort and unspecified assigned workstreams',()=>{
 const w=fullWorkspace(),task=w.projects[0].data.tasks[0];Object.assign(task,{effort:0,platform:'',assignee:''});delete task.roleId;
 expect(workspaceSchema.parse(JSON.parse(JSON.stringify(w))).projects[0].data.tasks[0]).toEqual(task);
 task.effort=-.5;expect(workspaceSchema.safeParse(w).success).toBe(false);task.effort=0;task.remaining=1;expect(workspaceSchema.safeParse(w).success).toBe(false);delete task.remaining;task.assignee='u1';expect(workspaceSchema.safeParse(w).success).toBe(false);
});
