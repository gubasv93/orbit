import type { Workspace } from '../lib/schema';
import type { AccountProfile } from '../lib/profile';
export function mountPlanner(root: HTMLElement, workspace: Workspace, callbacks: {
  onChange(workspace: Workspace): void;
  onLogout(): void | Promise<void>;
  onExport(): void;
  onImport(): void;
  onPoker?(projectId: string): void | Promise<void>;
  onAppearance?(theme: 'light' | 'dark'): void;
  onProfile?(): void | Promise<void>;
  onHelp?(): void | Promise<void>;
  profile?: AccountProfile;
  focus?: { project?: string; feature?: string; task?: string; page?: string; panel?: string };
  email: string;
}): { destroy(): void };
