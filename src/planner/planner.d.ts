import type { Workspace } from '../lib/schema';
export function mountPlanner(root: HTMLElement, workspace: Workspace, callbacks: {
  onChange(workspace: Workspace): void;
  onLogout(): void | Promise<void>;
  onExport(): void;
  onImport(): void;
  onPoker?(projectId: string): void | Promise<void>;
  focus?: { project?: string; feature?: string; task?: string; page?: string; panel?: string };
  email: string;
}): { destroy(): void };
