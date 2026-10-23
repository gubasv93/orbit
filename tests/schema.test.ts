import { expect, it } from 'vitest';
import { signupSchema, workspaceSchema, emptyWorkspace } from '../src/lib/schema';
import { fullWorkspace } from './fixtures';
it('accepts an empty private workspace and complete backups', () => { expect(workspaceSchema.parse(emptyWorkspace()).projects).toEqual([]); expect(workspaceSchema.parse(fullWorkspace())).toEqual(fullWorkspace()); });
it('validates passwords and confirmation without requiring special characters', () => {
  expect(signupSchema.safeParse({ email: ' Test@example.com ', password: 'pass1234', confirm: 'pass1234' }).success).toBe(true);
  for (const password of ['abcdefghi','123456789','a1','a1'.repeat(37)]) expect(signupSchema.safeParse({ email: 'test@example.com', password, confirm: password }).success).toBe(false);
  expect(signupSchema.safeParse({ email: 'test@example.com', password: 'pass1234', confirm: 'different' }).success).toBe(false);
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
  expect(signupSchema.safeParse({email:'test@example.com',password:valid,confirm:valid}).success).toBe(true);
  expect(signupSchema.safeParse({email:'test@example.com',password:invalid,confirm:invalid}).success).toBe(false);
});
