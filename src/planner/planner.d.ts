import type { Workspace } from '../lib/schema';
export function mountPlanner(root: HTMLElement, workspace: Workspace, callbacks: {
  onChange(workspace: Workspace): void;
  onLogout(): void | Promise<void>;
  onExport(): void;
  onImport(): void;
  email: string;
}): { destroy(): void };
