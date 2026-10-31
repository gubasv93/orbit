import {supabase} from './supabase';
import type {Workspace} from './schema';

/** Resolve only projects belonging to the current authenticated workspace. */
export async function workspaceContext(client: Awaited<ReturnType<typeof supabase>>, requestedId?: string) {
  const {data, error} = await client.rpc('orbit_get_workspace');
  if (error || !data?.workspace) return {};
  const workspace = data.workspace as Workspace;
  const project = workspace.projects.find(item => item.id === requestedId)
    || workspace.projects.find(item => item.id === workspace.activeId)
    || workspace.projects[0];
  return project ? {projectId: project.id, projectName: project.name} : {};
}
